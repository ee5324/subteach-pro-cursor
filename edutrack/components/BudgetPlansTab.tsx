import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  Plus,
  Trash2,
  Save,
  Loader2,
  RefreshCw,
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { BudgetPlan, BudgetPlanPeriodKind, BudgetPlanStatus } from '../types';
import {
  getBudgetPlans,
  getBudgetPlan,
  saveBudgetPlan,
  deleteBudgetPlan,
  saveBudgetPlanLedgerEntry,
} from '../services/api';
import BudgetPlanLedgerPanel from './BudgetPlanLedgerPanel';
import { closeDateAlertLabel } from '../utils/budgetPlanAlerts';
import {
  defaultRocYearStringForPeriodKind,
  periodKindLabel,
  periodRangeDescription,
} from '../utils/budgetPlanPeriod';

const fmtMoney = (n: number) =>
  n.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function usableBudgetTotal(plan: Pick<BudgetPlan, 'budgetTotal' | 'reservedTotal'>): number {
  const total = Number(plan.budgetTotal) || 0;
  const reserved = Number(plan.reservedTotal) || 0;
  return Math.max(0, total - Math.max(0, reserved));
}

function defaultRocYear(): string {
  return String(new Date().getFullYear() - 1911);
}

function yearOptions(): string[] {
  const end = parseInt(defaultRocYear(), 10) + 2;
  const start = Math.min(end - 12, 108);
  return Array.from({ length: end - start + 1 }, (_, i) => String(start + i));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validateBudgetRequired(p: {
  academicYear: string;
  closeByDate: string;
  closureRequirements: string;
  accountingCode: string;
}): string | null {
  if (!p.academicYear.trim()) return '請選擇所屬民國年（年度或學年度）';
  if (!p.accountingCode.trim()) return '請填寫會計代碼';
  if (!p.closeByDate.trim() || !ISO_DATE.test(p.closeByDate.trim())) return '請填寫有效的計畫結案日期（YYYY-MM-DD）';
  if (!p.closureRequirements.trim()) return '請填寫結案要求';
  return null;
}

interface BudgetPlansTabProps {
  onDataChanged?: () => void;
}

const BudgetPlansTab: React.FC<BudgetPlansTabProps> = ({ onDataChanged }) => {
  const [detailPlanId, setDetailPlanId] = useState<string | null>(null);
  const [plans, setPlans] = useState<BudgetPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  /** 篩選：預設「全部類型」；管理者主動選取後才過濾 */
  const [periodKindFilter, setPeriodKindFilter] = useState<'all' | BudgetPlanPeriodKind>('all');
  /** 篩選：預設空白＝不按年過濾（顯示全部計畫） */
  const [academicYear, setAcademicYear] = useState('');
  /** 新增計畫用民國年（篩選未指定年份時以此為預設） */
  const [newPlanPeriodKind, setNewPlanPeriodKind] = useState<BudgetPlanPeriodKind>('academic_year');
  const [newPlanYear, setNewPlanYear] = useState(() => defaultRocYearStringForPeriodKind('academic_year'));
  const [newRow, setNewRow] = useState({
    name: '',
    accountingCode: '',
    closeByDate: '',
    closureRequirements: '',
    note: '',
  });
  const [newPlanSubItems, setNewPlanSubItems] = useState<
    { id: string; title: string; budgetAllocated: string; allowPooling: boolean }[]
  >(() => [
    { id: crypto.randomUUID?.() ?? `si-${Date.now()}-1`, title: '鐘點費', budgetAllocated: '', allowPooling: true },
    { id: crypto.randomUUID?.() ?? `si-${Date.now()}-2`, title: '材料費', budgetAllocated: '', allowPooling: true },
  ]);
  /** 「建立新計畫」表單區塊是否展開（預設收合，有需要再點開） */
  const [createPlanOpen, setCreatePlanOpen] = useState(false);

  const yearList = useMemo(() => yearOptions(), []);

  /** 建立計畫時：核配額度＝已填名稱之子項目的分配額度合計（自動計算） */
  const newPlanBudgetTotalFromSubItems = useMemo(
    () =>
      newPlanSubItems
        .filter((x) => x.title.trim())
        .reduce((s, x) => s + Math.max(0, Number(x.budgetAllocated) || 0), 0),
    [newPlanSubItems]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pk = periodKindFilter === 'all' ? 'all' : periodKindFilter;
      const list = await getBudgetPlans(academicYear.trim() === '' ? undefined : academicYear, pk);
      setPlans(list);
    } catch (e: any) {
      setError(e?.message || '載入失敗');
    } finally {
      setLoading(false);
    }
  }, [academicYear, periodKindFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 切換「學年度／年度」時，民國年預設改為「現在的學年度」或「現在的曆年」（例：115 年 1 月 → 114 學年度、115 年度） */
  useEffect(() => {
    setNewPlanYear(defaultRocYearStringForPeriodKind(newPlanPeriodKind));
  }, [newPlanPeriodKind]);

  const handleSaveNew = async () => {
    const effectiveNewYear = academicYear.trim() === '' ? newPlanYear : academicYear;
    const effectivePeriodKind: BudgetPlanPeriodKind =
      periodKindFilter === 'all' ? newPlanPeriodKind : periodKindFilter;
    const ve = validateBudgetRequired({
      academicYear: effectiveNewYear,
      closeByDate: newRow.closeByDate,
      closureRequirements: newRow.closureRequirements,
      accountingCode: newRow.accountingCode,
    });
    if (ve) {
      setError(ve);
      return;
    }
    if (!newRow.name.trim()) {
      setError('請填寫計畫名稱');
      return;
    }

    setSavingId('new');
    setError(null);
    try {
      const res = await saveBudgetPlan({
        academicYear: String(effectiveNewYear).trim(),
        periodKind: effectivePeriodKind,
        name: newRow.name.trim(),
        accountingCode: newRow.accountingCode.trim(),
        budgetTotal: newPlanBudgetTotalFromSubItems,
        reservedTotal: 0,
        spentTotal: 0,
        plannedCommitTotal: 0,
        closeByDate: newRow.closeByDate.trim(),
        closureRequirements: newRow.closureRequirements.trim(),
        status: 'active',
        note: newRow.note,
      });
      const newId = (res as { id?: string })?.id;
      if (newId) {
        const items = newPlanSubItems
          .map((x) => ({
            ...x,
            title: x.title.trim(),
            budgetAllocatedNum: Math.max(0, Number(x.budgetAllocated) || 0),
          }))
          .filter((x) => x.title);
        for (const it of items) {
          await saveBudgetPlanLedgerEntry(newId, {
            kind: 'folder',
            title: it.title,
            parentId: null,
            budgetAllocated: it.budgetAllocatedNum,
            allowPooling: it.allowPooling,
          });
        }
      }
      await load();
      onDataChanged?.();
      setNewRow({
        name: '',
        accountingCode: '',
        closeByDate: '',
        closureRequirements: '',
        note: '',
      });
      if (newId) setDetailPlanId(newId);
    } catch (e: any) {
      setError(e?.message || '儲存失敗');
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteFromList = async (id: string, name: string) => {
    if (!confirm(`確定刪除計畫「${name}」？（巢狀支用明細、代墊紀錄也會一併刪除）`)) return;
    setSavingId(id);
    setError(null);
    try {
      await deleteBudgetPlan({ id });
      await load();
      onDataChanged?.();
    } catch (e: any) {
      setError(e?.message || '刪除失敗');
    } finally {
      setSavingId(null);
    }
  };

  const effectiveNewYear = academicYear.trim() === '' ? newPlanYear : academicYear;
  const effectivePeriodKindForCreate: BudgetPlanPeriodKind =
    periodKindFilter === 'all' ? newPlanPeriodKind : periodKindFilter;
  const canCreate =
    effectiveNewYear.trim() &&
    newRow.accountingCode.trim() &&
    newRow.name.trim() &&
    newRow.closeByDate.trim() &&
    ISO_DATE.test(newRow.closeByDate.trim()) &&
    newRow.closureRequirements.trim();

  if (detailPlanId) {
    return (
      <BudgetPlanDetailView
        planId={detailPlanId}
        onBack={() => setDetailPlanId(null)}
        onDataChanged={() => {
          void load();
          onDataChanged?.();
        }}
        onDeleted={() => {
          setDetailPlanId(null);
          void load();
          onDataChanged?.();
        }}
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Wallet className="text-emerald-600" />
          計畫專案
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          先<strong>建立計畫</strong>後，從下方列表<strong>進入各計畫專屬頁面</strong>填寫核配等資料；<strong>已支出</strong>請在該頁「支用明細」逐筆登錄後自動加總。資料存於{' '}
          <code className="text-xs bg-slate-100 px-1 rounded">edutrack_budget_plans</code>。
        </p>
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <strong>使用方式：</strong>
        列表僅顯示摘要；點「進入計畫」開啟該筆的獨立編輯頁。建立成功後會自動進入該計畫頁面，方便接續補齊內容。
      </div>

      <div className="flex flex-wrap items-end gap-4 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">期間類型</label>
          <select
            value={periodKindFilter}
            onChange={(e) => setPeriodKindFilter(e.target.value as 'all' | BudgetPlanPeriodKind)}
            className="border rounded-lg px-3 py-2 text-sm min-w-[12rem] bg-white"
          >
            <option value="all">全部類型</option>
            <option value="academic_year">學年度（民國 n 年 2/1～隔年 1/31）</option>
            <option value="calendar_year">年度（民國 n 年曆年 1/1～12/31）</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">民國年</label>
          <select
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm min-w-[10rem] bg-white"
          >
            <option value="">全部（不按年篩選）</option>
            {yearList.map((y) => (
              <option key={y} value={y}>
                {periodKindFilter === 'calendar_year'
                  ? `${y} 年度`
                  : periodKindFilter === 'academic_year'
                    ? `${y} 學年度`
                    : `${y}（可比對年度或學年度）`}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm hover:bg-slate-200 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          重新載入
        </button>
        <p className="w-full basis-full text-xs text-slate-500 pt-2 border-t border-slate-100">
          預設顯示<strong>全部計畫</strong>；請自行選擇「期間類型」或「民國年」後再篩選列表。
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setCreatePlanOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50/90 transition-colors"
          aria-expanded={createPlanOpen}
        >
          <span className="text-sm font-semibold text-slate-800 flex items-center gap-2 min-w-0">
            <Plus size={16} className="shrink-0 text-emerald-600" />
            <span className="truncate">
              建立新計畫
              {academicYear.trim() !== ''
                ? `（${periodKindLabel(periodKindFilter === 'all' ? newPlanPeriodKind : periodKindFilter)} ${academicYear}）`
                : ''}
            </span>
          </span>
          <ChevronDown
            size={20}
            className={`shrink-0 text-slate-500 transition-transform ${createPlanOpen ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
        {createPlanOpen && (
          <div className="px-4 pb-4 pt-4 space-y-4 border-t border-slate-100">
            {periodKindFilter === 'all' && (
              <div className="max-w-xs">
                <label className="block text-xs text-slate-500 mb-1">此計畫屬於</label>
                <select
                  value={newPlanPeriodKind}
                  onChange={(e) => setNewPlanPeriodKind(e.target.value as BudgetPlanPeriodKind)}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white"
                >
                  <option value="academic_year">學年度（2/1～隔年1/31）</option>
                  <option value="calendar_year">年度（曆年）</option>
                </select>
              </div>
            )}
            {academicYear.trim() === '' && (
              <div className="max-w-xs">
                <label className="block text-xs text-slate-500 mb-1">新增計畫所屬民國年</label>
                <select
                  value={newPlanYear}
                  onChange={(e) => setNewPlanYear(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white"
                >
                  {yearList.map((y) => (
                    <option key={y} value={y}>
                      {newPlanPeriodKind === 'calendar_year' ? `${y} 年度` : `${y} 學年度`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {periodKindFilter !== 'all' && (
              <p className="text-xs text-slate-500">
                篩選為「{periodKindLabel(periodKindFilter)}」時，新計畫會自動帶入相同類型。
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">計畫名稱</label>
                <input
                  value={newRow.name}
                  onChange={(e) => setNewRow((r) => ({ ...r, name: e.target.value }))}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                  placeholder="例：本土語補助"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  會計代碼 <span className="text-red-500">*</span>
                </label>
                <input
                  value={newRow.accountingCode}
                  onChange={(e) => setNewRow((r) => ({ ...r, accountingCode: e.target.value }))}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm font-mono"
                  placeholder="例：5010-01"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  計畫結案時間 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={newRow.closeByDate}
                  onChange={(e) => setNewRow((r) => ({ ...r, closeByDate: e.target.value }))}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">
                  結案要求 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={newRow.closureRequirements}
                  onChange={(e) => setNewRow((r) => ({ ...r, closureRequirements: e.target.value }))}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm min-h-[72px]"
                  placeholder="例：完成經費核銷、繳交成果報告…"
                />
              </div>
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs text-slate-500 mb-1">子項目分配（建立時先確定科目與可勻支）</label>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
                    onClick={() =>
                      setNewPlanSubItems((prev) => [
                        ...prev,
                        {
                          id: crypto.randomUUID?.() ?? `si-${Date.now()}`,
                          title: '',
                          budgetAllocated: '',
                          allowPooling: true,
                        },
                      ])
                    }
                  >
                    + 新增子項目
                  </button>
                </div>
                <div className="space-y-2">
                  {newPlanSubItems.map((it) => (
                    <div key={it.id} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        className="col-span-5 border rounded-lg px-2 py-1.5 text-sm"
                        placeholder="例：鐘點費"
                        value={it.title}
                        onChange={(e) =>
                          setNewPlanSubItems((prev) =>
                            prev.map((x) => (x.id === it.id ? { ...x, title: e.target.value } : x))
                          )
                        }
                      />
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="col-span-4 border rounded-lg px-2 py-1.5 text-sm text-right tabular-nums"
                        placeholder="分配額度"
                        value={it.budgetAllocated}
                        onChange={(e) =>
                          setNewPlanSubItems((prev) =>
                            prev.map((x) => (x.id === it.id ? { ...x, budgetAllocated: e.target.value } : x))
                          )
                        }
                      />
                      <label className="col-span-2 flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={it.allowPooling}
                          onChange={(e) =>
                            setNewPlanSubItems((prev) =>
                              prev.map((x) => (x.id === it.id ? { ...x, allowPooling: e.target.checked } : x))
                            )
                          }
                        />
                        可勻支
                      </label>
                      <button
                        type="button"
                        className="col-span-1 text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
                        onClick={() => setNewPlanSubItems((prev) => prev.filter((x) => x.id !== it.id))}
                        title="刪除"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <p className="text-[11px] text-slate-500">
                    子項目會建立為計畫內的科目（技術上為資料夾）。之後請用「新增支用」並選擇從哪一筆子項目支出，備註可填補充說明；系統依子項目額度＋可勻支池控管超支。
                  </p>
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-sm">
                    <span className="text-xs text-slate-600">核配額度（元）</span>
                    <div className="text-lg font-semibold tabular-nums text-emerald-900">
                      ${fmtMoney(newPlanBudgetTotalFromSubItems)}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      由上方<strong>已填名稱</strong>之子項目的「分配額度」加總，無需手動輸入。
                    </p>
                  </div>
                </div>
              </div>
              <div className="sm:col-span-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-600">
                <strong>已支出</strong>請於建立計畫後，在計畫頁的「支用明細」逐筆新增支用紀錄；系統會自動加總並寫入「已支出」（建立時為 0）。
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">備註（選填）</label>
                <input
                  value={newRow.note}
                  onChange={(e) => setNewRow((r) => ({ ...r, note: e.target.value }))}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  disabled={!canCreate || savingId === 'new'}
                  onClick={() => void handleSaveNew()}
                  className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {savingId === 'new' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  建立並進入計畫頁
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-800 px-1">
          計畫列表
          {periodKindFilter === 'all'
            ? academicYear.trim() !== ''
              ? `（民國 ${academicYear}，含年度／學年度）`
              : '（全部）'
            : academicYear.trim() !== ''
              ? `（${periodKindLabel(periodKindFilter)} ${academicYear}）`
              : `（全部 ${periodKindLabel(periodKindFilter)}）`}
        </h2>
        {loading && plans.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white">
            <Loader2 size={18} className="animate-spin" /> 載入中…
          </div>
        ) : plans.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm rounded-xl border border-slate-200 bg-white">
            此篩選下尚無計畫，請先建立一筆。
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
            {plans.map((p) => {
              const planned = p.plannedCommitTotal ?? 0;
              const usable = usableBudgetTotal(p);
              const remaining = usable - (p.spentTotal ?? 0) - planned;
              const alertText = closeDateAlertLabel(p);
              const closed = p.status === 'closed';
              return (
                <li
                  key={p.id}
                  className={`rounded-xl border shadow-sm p-4 flex flex-col gap-3 ${
                    closed
                      ? 'border-slate-200 bg-slate-50/80 opacity-90'
                      : alertText?.includes('逾期')
                        ? 'border-red-200 bg-red-50/30'
                        : alertText
                          ? 'border-amber-200 bg-amber-50/20'
                          : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate text-base">{p.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5 space-y-0.5">
                        <div>
                          {periodKindLabel(p.periodKind)} {p.academicYear} ·{' '}
                          <span className="font-mono">{p.accountingCode || '—'}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 leading-snug">
                          {periodRangeDescription(p.periodKind ?? 'academic_year', p.academicYear)}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                        closed ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {closed ? '已結案' : '進行中'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 space-y-1">
                    <div>
                      結案日：<span className="font-medium">{p.closeByDate || '—'}</span>
                    </div>
                    {!closed && alertText && (
                      <div
                        className={`flex items-center gap-1 font-medium ${
                          alertText.includes('逾期') ? 'text-red-700' : 'text-amber-800'
                        }`}
                      >
                        <AlertTriangle size={14} className="shrink-0" />
                        {alertText}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 pt-1 tabular-nums">
                      <span>可運用 ${fmtMoney(usable)}</span>
                      <span>已支出 ${fmtMoney(p.spentTotal ?? 0)}</span>
                      {planned > 0 ? <span className="text-sky-800">預定佔用 ${fmtMoney(planned)}</span> : null}
                      <span className={remaining < 0 ? 'text-red-600 font-semibold' : 'font-semibold text-slate-800'}>
                        剩餘 ${fmtMoney(remaining)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setDetailPlanId(p.id)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                    >
                      進入計畫
                      <ChevronRight size={16} />
                    </button>
                    <button
                      type="button"
                      disabled={savingId === p.id}
                      onClick={() => void handleDeleteFromList(p.id, p.name)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-red-200 text-red-700 text-sm hover:bg-red-50 disabled:opacity-50"
                    >
                      {savingId === p.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      刪除
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

/** 單一計畫專屬編輯頁 */
const BudgetPlanDetailView: React.FC<{
  planId: string;
  onBack: () => void;
  onDataChanged: () => void;
  onDeleted: () => void;
}> = ({ planId, onBack, onDataChanged, onDeleted }) => {
  const [plan, setPlan] = useState<BudgetPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [status, setStatus] = useState<BudgetPlanStatus>('active');
  const [periodKind, setPeriodKind] = useState<BudgetPlanPeriodKind>('academic_year');
  const [academicYear, setAcademicYear] = useState('');
  const [name, setName] = useState('');
  const [accountingCode, setAccountingCode] = useState('');
  const [budgetTotal, setBudgetTotal] = useState('0');
  const [reservedTotal, setReservedTotal] = useState('0');
  const [spentTotal, setSpentTotal] = useState('0');
  const [plannedCommitTotal, setPlannedCommitTotal] = useState('0');
  const [closeByDate, setCloseByDate] = useState('');
  const [closureRequirements, setClosureRequirements] = useState('');
  const [note, setNote] = useState('');

  const yearList = useMemo(() => yearOptions(), []);

  const loadOne = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const p = await getBudgetPlan(planId);
        if (!p) {
          setPlan(null);
          if (!opts?.silent) setError('找不到此計畫，可能已被刪除。');
          return;
        }
        setPlan(p);
        setStatus(p.status === 'closed' ? 'closed' : 'active');
        setPeriodKind(p.periodKind ?? 'academic_year');
        setAcademicYear(p.academicYear || '');
        setName(p.name);
        setAccountingCode(p.accountingCode || '');
        setBudgetTotal(String(p.budgetTotal));
        setReservedTotal(String(p.reservedTotal ?? 0));
        setSpentTotal(String(p.spentTotal));
        setPlannedCommitTotal(String(p.plannedCommitTotal ?? 0));
        setCloseByDate(p.closeByDate || '');
        setClosureRequirements(p.closureRequirements || '');
        setNote(p.note ?? '');
        setError(null);
      } catch (e: any) {
        setError(e?.message || '載入失敗');
        if (!opts?.silent) setPlan(null);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [planId]
  );

  useEffect(() => {
    void loadOne();
  }, [loadOne]);

  /** 須穩定參考，否則 BudgetPlanLedgerPanel 的 pullLedger 會隨父層重 render 而變動，觸發無限載入迴圈 */
  const handleLedgerSpentSynced = useCallback(() => {
    void loadOne({ silent: true });
  }, [loadOne]);

  const alertText = useMemo(() => {
    if (!plan) return null;
    return closeDateAlertLabel({ ...plan, status, closeByDate } as BudgetPlan);
  }, [plan, status, closeByDate]);

  const usableTotal = Math.max(0, (Number(budgetTotal) || 0) - Math.max(0, Number(reservedTotal) || 0));
  const remaining = usableTotal - (Number(spentTotal) || 0) - (Number(plannedCommitTotal) || 0);

  const rowValid =
    name.trim() &&
    academicYear.trim() &&
    accountingCode.trim() &&
    closeByDate.trim() &&
    ISO_DATE.test(closeByDate.trim()) &&
    closureRequirements.trim();

  const handleSave = async () => {
    const ve = validateBudgetRequired({
      academicYear,
      closeByDate,
      closureRequirements,
      accountingCode,
    });
    if (ve) {
      setError(ve);
      return;
    }
    if (!plan) return;
    setSaving(true);
    setError(null);
    try {
      await saveBudgetPlan({
        id: plan.id,
        status,
        periodKind,
        academicYear,
        name: name.trim(),
        accountingCode,
        budgetTotal: Number(budgetTotal) || 0,
        reservedTotal: Number(reservedTotal) || 0,
        spentTotal: Number(spentTotal) || 0,
        plannedCommitTotal: Number(plannedCommitTotal) || 0,
        closeByDate,
        closureRequirements,
        note,
      });
      await loadOne({ silent: true });
      onDataChanged();
    } catch (e: any) {
      setError(e?.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!plan) return;
    if (!confirm(`確定刪除計畫「${plan.name}」？（支用明細、代墊紀錄也會刪除）`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteBudgetPlan({ id: plan.id });
      onDeleted();
    } catch (e: any) {
      setError(e?.message || '刪除失敗');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !plan) {
    return (
      <div className="max-w-3xl mx-auto py-20 flex justify-center">
        <Loader2 className="animate-spin text-emerald-600" size={36} />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 p-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} /> 返回計畫列表
        </button>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 text-sm">
          {error || '找不到計畫'}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4 pb-12">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50"
        >
          <ArrowLeft size={16} /> 返回列表
        </button>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2 min-w-0 flex-1">
          <Wallet className="text-emerald-600 shrink-0" size={24} />
          <span className="truncate">{name || '計畫'}</span>
        </h1>
      </div>

      <p className="text-sm text-slate-500">
        此為計畫專屬頁面，儲存後會更新 Firestore。「已支出」由下方<strong>支用明細</strong>自動加總，請逐筆登錄每次花費（日期、金額、備註）；資料夾僅供分類，可巢狀多層。
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      <div
        className={`rounded-xl border shadow-sm p-5 space-y-4 ${
          status === 'closed'
            ? 'border-slate-200 bg-slate-50/50'
            : alertText?.includes('逾期')
              ? 'border-red-200 bg-red-50/20'
              : alertText
                ? 'border-amber-200 bg-amber-50/15'
                : 'border-slate-200 bg-white'
        }`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as BudgetPlanStatus)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="active">進行中</option>
              <option value="closed">已結案</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">期間類型</label>
            <select
              value={periodKind}
              onChange={(e) => setPeriodKind(e.target.value as BudgetPlanPeriodKind)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="academic_year">學年度（2/1～隔年1/31）</option>
              <option value="calendar_year">年度（曆年1/1～12/31）</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">民國年</label>
            <select
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              {yearList.map((y) => (
                <option key={y} value={y}>
                  {periodKind === 'calendar_year' ? `${y} 年度` : `${y} 學年度`}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-500 mt-1 leading-snug">
              {periodRangeDescription(periodKind, academicYear)}
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">計畫名稱</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">會計代碼</label>
            <input
              value={accountingCode}
              onChange={(e) => setAccountingCode(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">計畫結案日</label>
            <input
              type="date"
              value={closeByDate}
              onChange={(e) => setCloseByDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          {status === 'active' && alertText && (
            <div className="sm:col-span-2 flex items-start gap-2 text-sm">
              <AlertTriangle
                size={18}
                className={`shrink-0 mt-0.5 ${alertText.includes('逾期') ? 'text-red-600' : 'text-amber-600'}`}
              />
              <span className={alertText.includes('逾期') ? 'text-red-800 font-medium' : 'text-amber-900'}>
                {alertText}
              </span>
            </div>
          )}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">結案要求</label>
            <textarea
              value={closureRequirements}
              onChange={(e) => setClosureRequirements(e.target.value)}
              rows={4}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">可運用額度（元）</label>
            <div className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right tabular-nums bg-emerald-50/60 text-emerald-950 font-semibold">
              ${fmtMoney(usableTotal)}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">可運用 = 總核配 − 保留金額（保留金額不在清單顯示）</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">保留金額（不顯示，元）</label>
            <input
              type="number"
              min={0}
              step={1}
              value={reservedTotal}
              onChange={(e) => setReservedTotal(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-right tabular-nums"
            />
            <details className="mt-1">
              <summary className="text-[10px] text-slate-500 cursor-pointer select-none">調整總核配（進階）</summary>
              <div className="mt-2">
                <label className="block text-[10px] text-slate-500 mb-1">總核配（內部，元）</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={budgetTotal}
                  onChange={(e) => setBudgetTotal(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-right tabular-nums bg-white"
                />
              </div>
            </details>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">已支出（元）</label>
            <div className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right tabular-nums bg-slate-50 text-slate-800 font-medium">
              ${fmtMoney(Number(spentTotal) || 0)}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              由支用明細<strong>實支</strong>加總（僅「已執行待核銷」「核銷完畢」）；「預定」不計入本欄，但會列入下方「預定佔用」。
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">預定佔用（元）</label>
            <div className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-right tabular-nums bg-sky-50/80 text-sky-950 font-medium">
              ${fmtMoney(Number(plannedCommitTotal) || 0)}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              「預定」支用列以 max(預估, 實支) 加總，與已支出一併從核配扣減剩餘。
            </p>
          </div>
          <div className="sm:col-span-2 rounded-lg bg-slate-50 border border-slate-100 px-4 py-3">
            <span className="text-xs text-slate-500">剩餘額度（可運用 − 已支出 − 預定佔用）</span>
            <div
              className={`text-xl font-bold tabular-nums ${remaining < 0 ? 'text-red-600' : 'text-slate-900'}`}
            >
              ${fmtMoney(remaining)}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">備註</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={saving || !rowValid}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            儲存變更
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleDelete()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 text-red-700 text-sm hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 size={18} />
            刪除此計畫
          </button>
        </div>
      </div>

      {plan && <BudgetPlanLedgerPanel planId={plan.id} onSpentSynced={handleLedgerSpentSynced} />}
    </div>
  );
};

export default BudgetPlansTab;
