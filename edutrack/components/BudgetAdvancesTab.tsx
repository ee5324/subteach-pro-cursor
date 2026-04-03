import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, Plus, Trash2, Save, Loader2, RefreshCw, Link2, Printer, ChevronDown } from 'lucide-react';
import type { BudgetPlan, BudgetPlanAdvance, BudgetAdvanceStatus, BudgetPlanLedgerEntry } from '../types';
import {
  getBudgetPlans,
  getBudgetPlanAdvances,
  getBudgetPlanLedgerEntries,
  getSchoolTeacherNames,
  saveBudgetPlanAdvance,
  deleteBudgetPlanAdvance,
} from '../services/api';
import { periodKindLabel } from '../utils/budgetPlanPeriod';

const fmtMoney = (n: number) =>
  n.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const STATUS_LABEL: Record<BudgetAdvanceStatus, string> = {
  outstanding: '待歸還／沖銷',
  settled: '已核銷或歸還',
  cancelled: '作廢',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function escHtml(s: unknown): string {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function planLabel(p: BudgetPlan): string {
  const k = periodKindLabel(p.periodKind);
  return `${p.name}（${k} ${p.academicYear} · ${p.accountingCode || '—'}）`;
}

const BudgetAdvancesTab: React.FC = () => {
  const [plans, setPlans] = useState<BudgetPlan[]>([]);
  const [advances, setAdvances] = useState<BudgetPlanAdvance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterPlanId, setFilterPlanId] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | BudgetAdvanceStatus>('');
  const [activePayee, setActivePayee] = useState<string>('');
  const [ledgerChoices, setLedgerChoices] = useState<BudgetPlanLedgerEntry[]>([]);
  const [teacherNames, setTeacherNames] = useState<string[]>([]);
  const [payeeSuggestOpen, setPayeeSuggestOpen] = useState(false);
  const [payeeSuggestActiveIdx, setPayeeSuggestActiveIdx] = useState(0);
  const payeeBlurTimerRef = useRef<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newRow, setNewRow] = useState({
    budgetPlanId: '',
    ledgerEntryId: '',
    amount: '',
    advanceDate: new Date().toISOString().slice(0, 10),
    title: '',
    paidBy: '',
    status: 'outstanding' as BudgetAdvanceStatus,
    memo: '',
  });

  const planById = useMemo(() => {
    const m = new Map<string, BudgetPlan>();
    plans.forEach((p) => m.set(p.id, p));
    return m;
  }, [plans]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pList, aList] = await Promise.all([getBudgetPlans(undefined), getBudgetPlanAdvances()]);
      setPlans(pList);
      setAdvances(aList);
    } catch (e: any) {
      setError(e?.message || '載入失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const names = await getSchoolTeacherNames();
      if (cancelled) return;
      setTeacherNames(names);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const pid = newRow.budgetPlanId.trim();
    if (!pid) {
      setLedgerChoices([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await getBudgetPlanLedgerEntries(pid);
        if (cancelled) return;
        setLedgerChoices(list.filter((e) => e.kind === 'expense'));
      } catch {
        if (cancelled) return;
        setLedgerChoices([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [newRow.budgetPlanId]);

  const filteredAdvances = useMemo(() => {
    let rows = advances;
    if (filterPlanId.trim()) rows = rows.filter((a) => a.budgetPlanId === filterPlanId.trim());
    if (filterStatus) rows = rows.filter((a) => a.status === filterStatus);
    return rows;
  }, [advances, filterPlanId, filterStatus]);

  // 若篩選變動導致目前點選的對象已無資料，則自動收合
  useEffect(() => {
    if (!activePayee) return;
    const has = filteredAdvances.some((a) => ((a.paidBy ?? '').trim() || '（未填受款人）') === activePayee);
    if (!has) setActivePayee('');
  }, [activePayee, filteredAdvances]);

  const summary = useMemo(() => {
    const outstanding = filteredAdvances.filter((a) => a.status === 'outstanding');
    const totalOut = outstanding.reduce((s, a) => s + a.amount, 0);
    const byPlan = new Map<string, number>();
    const byPayee = new Map<string, number>();
    for (const a of outstanding) {
      byPlan.set(a.budgetPlanId, (byPlan.get(a.budgetPlanId) ?? 0) + a.amount);
      const payee = (a.paidBy ?? '').trim() || '（未填受款人）';
      byPayee.set(payee, (byPayee.get(payee) ?? 0) + a.amount);
    }
    return { totalOut, byPlan, byPayee, outstandingCount: outstanding.length };
  }, [filteredAdvances]);

  const activePayeeRows = useMemo(() => {
    if (!activePayee) return [];
    return filteredAdvances
      .filter((a) => a.status === 'outstanding')
      .filter((a) => ((a.paidBy ?? '').trim() || '（未填受款人）') === activePayee)
      .sort((a, b) => (b.advanceDate || '').localeCompare(a.advanceDate || '') || b.amount - a.amount);
  }, [activePayee, filteredAdvances]);

  const activePayeeTotal = useMemo(
    () => activePayeeRows.reduce((s, a) => s + (a.amount || 0), 0),
    [activePayeeRows]
  );

  const payeeSuggestions = useMemo(() => {
    const keyword = newRow.paidBy.trim();
    const rows = keyword
      ? teacherNames.filter((n) => n.toLowerCase().includes(keyword.toLowerCase()))
      : teacherNames;
    return rows.slice(0, 20);
  }, [newRow.paidBy, teacherNames]);

  /** 新增代墊時，可帶入的支出項目：排除同計畫中已被代墊連結過的項目 */
  const availableLedgerChoices = useMemo(() => {
    const pid = newRow.budgetPlanId.trim();
    if (!pid) return [];
    const used = new Set(
      advances
        .filter((a) => a.budgetPlanId === pid)
        .map((a) => (a.ledgerEntryId ?? '').trim())
        .filter(Boolean)
    );
    return ledgerChoices.filter((e) => !used.has(e.id));
  }, [advances, ledgerChoices, newRow.budgetPlanId]);

  useEffect(() => {
    if (!payeeSuggestOpen) return;
    if (payeeSuggestions.length === 0) {
      setPayeeSuggestActiveIdx(0);
      return;
    }
    setPayeeSuggestActiveIdx((i) => Math.min(Math.max(i, 0), payeeSuggestions.length - 1));
  }, [payeeSuggestOpen, payeeSuggestions]);

  const openPrintPage = useCallback(
    (mode: 'byPayeeOutstanding' | 'filteredList') => {
      const now = new Date();
      const title =
        mode === 'byPayeeOutstanding'
          ? `代墊清單（依受款人彙整／待歸還）`
          : `代墊清單（目前篩選明細）`;
      const rows =
        mode === 'byPayeeOutstanding'
          ? filteredAdvances.filter((a) => a.status === 'outstanding')
          : filteredAdvances;

      const planNameById = new Map(plans.map((p) => [p.id, p.name]));
      const group = new Map<string, BudgetPlanAdvance[]>();
      for (const a of rows) {
        const payee = (a.paidBy ?? '').trim() || '（未填受款人）';
        if (!group.has(payee)) group.set(payee, []);
        group.get(payee)!.push(a);
      }

      const payees = [...group.entries()].sort((a, b) => {
        const sumA = a[1].reduce((s, x) => s + (x.amount || 0), 0);
        const sumB = b[1].reduce((s, x) => s + (x.amount || 0), 0);
        return sumB - sumA || a[0].localeCompare(b[0], 'zh-TW');
      });

      const htmlSections =
        payees.length === 0
          ? `<p class="muted">無資料</p>`
          : payees
              .map(([payee, list]) => {
                const total = list.reduce((s, x) => s + (x.amount || 0), 0);
                const lines = [...list].sort((a, b) => (b.advanceDate || '').localeCompare(a.advanceDate || ''));
                const trs = lines
                  .map((a) => {
                    const planName = planNameById.get(a.budgetPlanId) ?? a.budgetPlanId;
                    return `<tr>
  <td class="nowrap">${escHtml(a.advanceDate)}</td>
  <td>${escHtml(STATUS_LABEL[a.status])}</td>
  <td>${escHtml(planName)}</td>
  <td>${escHtml(a.title)}</td>
  <td class="num">${escHtml(fmtMoney(a.amount || 0))}</td>
  <td>${escHtml(a.memo ?? '')}</td>
</tr>`;
                  })
                  .join('\n');
                return `<section class="page">
  <div class="pageHeader">
    <div>
      <div class="h2">${escHtml(payee)}</div>
      <div class="muted">${escHtml(mode === 'byPayeeOutstanding' ? '待歸還／沖銷' : '明細（依目前篩選）')}</div>
    </div>
    <div class="total">總額 ${escHtml(fmtMoney(total))}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="nowrap">日期</th>
        <th>狀態</th>
        <th>計畫</th>
        <th>摘要</th>
        <th class="num">金額</th>
        <th>備註</th>
      </tr>
    </thead>
    <tbody>
      ${trs}
    </tbody>
  </table>
</section>`;
              })
              .join('\n');

      const docHtml = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escHtml(title)}</title>
  <style>
    :root { --fg:#0f172a; --muted:#475569; --line:#e2e8f0; --bg:#ffffff; }
    * { box-sizing: border-box; }
    body { margin:0; padding:24px; font-family: ui-sans-serif, system-ui, -apple-system, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif; color:var(--fg); background:var(--bg); }
    .top { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; margin-bottom:16px; }
    .h1 { font-size:18px; font-weight:800; }
    .meta { font-size:12px; color:var(--muted); }
    .page { padding:16px 0; }
    .pageHeader { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:10px; }
    .h2 { font-size:16px; font-weight:800; }
    .muted { font-size:12px; color:var(--muted); }
    .total { font-size:14px; font-weight:800; }
    table { width:100%; border-collapse: collapse; font-size:12px; }
    th, td { border:1px solid var(--line); padding:6px 8px; vertical-align: top; }
    thead th { background:#f8fafc; text-align:left; }
    .num { text-align:right; white-space:nowrap; font-variant-numeric: tabular-nums; }
    .nowrap { white-space:nowrap; }
    @media print {
      body { padding: 10mm; }
      .page { page-break-after: always; }
      .page:last-child { page-break-after: auto; }
    }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <div class="h1">${escHtml(title)}</div>
      <div class="meta">產生時間：${escHtml(now.toLocaleString('zh-TW'))}</div>
    </div>
    <div class="meta">提示：此分頁可直接列印或存成 PDF</div>
  </div>
  ${htmlSections}
  <script>setTimeout(() => { try { window.focus(); } catch(e) {} }, 50);</script>
</body>
</html>`;

      const w = window.open('', '_blank', 'noopener,noreferrer');
      if (!w) return;
      w.document.open();
      w.document.write(docHtml);
      w.document.close();
    },
    [filteredAdvances, plans]
  );

  const handleAdd = async () => {
    if (!newRow.budgetPlanId.trim()) {
      setError('請選擇計畫專案（標明代墊來自哪一筆計畫）');
      return;
    }
    if (!newRow.title.trim()) {
      setError('請填寫摘要說明');
      return;
    }
    if (!newRow.advanceDate.trim() || !ISO_DATE.test(newRow.advanceDate.trim())) {
      setError('請填寫有效代墊日期（YYYY-MM-DD）');
      return;
    }
    const amt = Number(newRow.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('請填寫大於 0 的代墊金額');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveBudgetPlanAdvance({
        budgetPlanId: newRow.budgetPlanId.trim(),
        ledgerEntryId: newRow.ledgerEntryId.trim(),
        amount: amt,
        advanceDate: newRow.advanceDate.trim(),
        title: newRow.title.trim(),
        paidBy: newRow.paidBy.trim(),
        status: newRow.status,
        memo: newRow.memo.trim(),
      });
      setNewRow({
        budgetPlanId: newRow.budgetPlanId,
        ledgerEntryId: '',
        amount: '',
        advanceDate: new Date().toISOString().slice(0, 10),
        title: '',
        paidBy: '',
        status: 'outstanding',
        memo: '',
      });
      await load();
    } catch (e: any) {
      setError(e?.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRow = async (row: BudgetPlanAdvance, patch: Partial<BudgetPlanAdvance>) => {
    setSaving(true);
    setError(null);
    try {
      await saveBudgetPlanAdvance({
        id: row.id,
        budgetPlanId: row.budgetPlanId,
        ledgerEntryId: patch.ledgerEntryId !== undefined ? patch.ledgerEntryId : row.ledgerEntryId,
        amount: patch.amount !== undefined ? patch.amount : row.amount,
        advanceDate: patch.advanceDate !== undefined ? patch.advanceDate : row.advanceDate,
        title: patch.title !== undefined ? patch.title : row.title,
        paidBy: patch.paidBy !== undefined ? patch.paidBy : row.paidBy,
        status: patch.status !== undefined ? patch.status : row.status,
        memo: patch.memo !== undefined ? patch.memo : row.memo,
      });
      await load();
    } catch (e: any) {
      setError(e?.message || '更新失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定刪除此筆代墊紀錄？')) return;
    setSaving(true);
    setError(null);
    try {
      await deleteBudgetPlanAdvance({ id });
      await load();
    } catch (e: any) {
      setError(e?.message || '刪除失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/70 shadow-sm p-4 md:p-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-amber-100 border border-amber-200">
              <Banknote className="text-amber-700" size={22} />
            </span>
            計畫代墊紀錄
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-xl">
            記錄暫時代墊金額並<strong>連結計畫專案</strong>，方便追蹤該筆代墊是從哪一個計畫預算脈絡支出、是否已核銷歸還。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          重新載入
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-2">{error}</div>
      )}

      {/* 摘要 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-amber-100/60 p-4 shadow-sm">
          <div className="text-xs font-medium text-amber-900/80 uppercase tracking-wide">待歸還／沖銷（篩選後）</div>
          <div className="text-2xl font-bold text-amber-900 mt-1">${fmtMoney(summary.totalOut)}</div>
          <div className="text-xs text-amber-800 mt-1">{summary.outstandingCount} 筆</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2 shadow-sm">
          <div className="text-xs font-medium text-slate-500 mb-2">依計畫彙總（待歸還，篩選後）</div>
          {summary.byPlan.size === 0 ? (
            <p className="text-sm text-slate-400">無待歸還項目</p>
          ) : (
            <ul className="text-sm space-y-1 max-h-24 overflow-y-auto">
              {[...summary.byPlan.entries()].map(([pid, amt]) => {
                const p = planById.get(pid);
                return (
                  <li key={pid} className="flex justify-between gap-2">
                    <span className="text-slate-700 truncate">{p ? p.name : pid}</span>
                    <span className="font-medium text-slate-900 shrink-0">${fmtMoney(amt)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2 lg:col-span-3 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="text-xs font-medium text-slate-500">依受款人彙總（待歸還，篩選後）</div>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs bg-white hover:bg-slate-50 shadow-sm"
              onClick={() => {
                openPrintPage('byPayeeOutstanding');
              }}
              disabled={summary.byPayee.size === 0}
              title="開新分頁列印（依受款人彙整／待歸還）"
            >
              <Printer size={14} /> 列印清單
            </button>
          </div>
          {summary.byPayee.size === 0 ? (
            <p className="text-sm text-slate-400">無待歸還項目</p>
          ) : (
            <ul className="text-sm space-y-1 max-h-28 overflow-y-auto">
              {[...summary.byPayee.entries()]
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-TW'))
                .map(([payee, amt]) => {
                  const active = payee === activePayee;
                  return (
                    <li key={payee}>
                      <button
                        type="button"
                        onClick={() => setActivePayee((prev) => (prev === payee ? '' : payee))}
                        className={`w-full flex justify-between gap-2 px-2.5 py-1.5 rounded-xl border text-left transition-all ${
                          active
                            ? 'border-emerald-200 bg-emerald-50/70 shadow-sm'
                            : 'border-slate-100 bg-white hover:bg-slate-50'
                        }`}
                        title="點擊查看細項"
                      >
                        <span className={`truncate ${active ? 'text-emerald-900 font-medium' : 'text-slate-700'}`}>
                          {payee}
                        </span>
                        <span className={`shrink-0 tabular-nums ${active ? 'text-emerald-900 font-semibold' : 'text-slate-900 font-medium'}`}>
                          ${fmtMoney(amt)}
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
          <p className="text-[11px] text-slate-500 mt-2">
            建議在每筆代墊填「我要給誰（受款人）」；就能直接看到各受款人應付總額。
          </p>

          {activePayee ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/40 overflow-hidden">
              <div className="px-3 py-2 border-b border-emerald-200/70 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-emerald-950 truncate">{activePayee} · 待歸還細項</div>
                <div className="text-sm font-bold tabular-nums text-emerald-950">總額 ${fmtMoney(activePayeeTotal)}</div>
              </div>
              {activePayeeRows.length === 0 ? (
                <div className="px-3 py-4 text-sm text-slate-500">無符合的待歸還項目</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white/60 text-slate-600 text-left">
                      <tr>
                        <th className="px-3 py-2 font-semibold whitespace-nowrap">日期</th>
                        <th className="px-3 py-2 font-semibold">計畫</th>
                        <th className="px-3 py-2 font-semibold">摘要</th>
                        <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">金額</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-100/80">
                      {activePayeeRows.map((a) => {
                        const p = planById.get(a.budgetPlanId);
                        return (
                          <tr key={a.id} className="bg-white/40">
                            <td className="px-3 py-2 whitespace-nowrap align-top">{a.advanceDate}</td>
                            <td className="px-3 py-2 align-top min-w-[10rem]">
                              <div className="text-slate-800">{p ? p.name : a.budgetPlanId}</div>
                              {p ? (
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                  {periodKindLabel(p.periodKind)} {p.academicYear} · {p.accountingCode || '—'}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 align-top min-w-[10rem]">
                              <div className="text-slate-800">{a.title}</div>
                              {a.memo ? <div className="text-[10px] text-slate-500 mt-0.5">{a.memo}</div> : null}
                              {a.ledgerEntryId ? (
                                <div className="text-[10px] text-slate-400 mt-0.5">連結支用：{a.ledgerEntryId}</div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right align-top whitespace-nowrap tabular-nums font-semibold text-slate-900">
                              ${fmtMoney(a.amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* 新增 */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setCreateOpen((v) => !v)}
          className="w-full px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-100/60 flex items-center justify-between gap-2 hover:from-slate-100 hover:to-slate-100"
          aria-expanded={createOpen}
        >
          <span className="flex items-center gap-2">
            <Plus size={18} className="text-slate-600" />
            <span className="font-semibold text-slate-800">新增代墊</span>
          </span>
          <ChevronDown size={18} className={`text-slate-500 transition-transform ${createOpen ? 'rotate-180' : ''}`} />
        </button>
        {createOpen ? (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm bg-white">
          <div className="md:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              <Link2 size={12} className="inline mr-1" />
              計畫專案（代墊所屬預算來源）<span className="text-red-500">*</span>
            </label>
            <select
              value={newRow.budgetPlanId}
              onChange={(e) => setNewRow((r) => ({ ...r, budgetPlanId: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
            >
              <option value="">— 請選擇 —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {planLabel(p)}
                  {p.status === 'closed' ? '（已結案）' : ''}
                </option>
              ))}
            </select>
            {plans.length === 0 && !loading && (
              <p className="text-xs text-amber-700 mt-1">請先到「計畫專案」建立計畫後再新增代墊。</p>
            )}
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">帶入支出項目（選填）</label>
            <select
              value={newRow.ledgerEntryId}
              onChange={(e) => {
                const id = e.target.value;
                const ex = availableLedgerChoices.find((x) => x.id === id);
                setNewRow((r) => ({
                  ...r,
                  ledgerEntryId: id,
                  title: ex ? ex.title : r.title,
                  amount: ex ? String(ex.amount ?? '') : r.amount,
                }));
              }}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
              disabled={!newRow.budgetPlanId.trim() || availableLedgerChoices.length === 0}
            >
              <option value="">— 不帶入 —</option>
              {availableLedgerChoices.map((e) => (
                <option key={e.id} value={e.id}>
                  {(e.expenseDate ? `${e.expenseDate} · ` : '') + e.title}（實支 ${fmtMoney(e.amount)}）
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              先選計畫後可挑選支用明細，系統會自動帶入摘要與金額；已被代墊使用過的項目不會重複出現。
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">代墊金額（元）*</label>
            <input
              type="number"
              min={1}
              step={1}
              value={newRow.amount}
              onChange={(e) => setNewRow((r) => ({ ...r, amount: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
              placeholder="例如 1500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">代墊日期 *</label>
            <input
              type="date"
              value={newRow.advanceDate}
              onChange={(e) => setNewRow((r) => ({ ...r, advanceDate: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">狀態</label>
            <select
              value={newRow.status}
              onChange={(e) => setNewRow((r) => ({ ...r, status: e.target.value as BudgetAdvanceStatus }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
            >
              {(Object.keys(STATUS_LABEL) as BudgetAdvanceStatus[]).map((k) => (
                <option key={k} value={k}>
                  {STATUS_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">摘要說明 *</label>
            <input
              value={newRow.title}
              onChange={(e) => setNewRow((r) => ({ ...r, title: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
              placeholder="例：競賽報名費、材料代買"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">我要給誰（受款人，選填）</label>
            <div className="relative">
              <input
                value={newRow.paidBy}
                onChange={(e) => {
                  setNewRow((r) => ({ ...r, paidBy: e.target.value }));
                  setPayeeSuggestOpen(true);
                }}
                onFocus={() => {
                  if (payeeBlurTimerRef.current) window.clearTimeout(payeeBlurTimerRef.current);
                  setPayeeSuggestOpen(true);
                }}
                onBlur={() => {
                  // 延遲關閉，讓使用者可點擊建議項
                  payeeBlurTimerRef.current = window.setTimeout(() => setPayeeSuggestOpen(false), 120);
                }}
                onKeyDown={(e) => {
                  if (!payeeSuggestOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                    setPayeeSuggestOpen(true);
                    return;
                  }
                  if (!payeeSuggestOpen || payeeSuggestions.length === 0) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setPayeeSuggestActiveIdx((i) => Math.min(i + 1, payeeSuggestions.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setPayeeSuggestActiveIdx((i) => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const picked = payeeSuggestions[payeeSuggestActiveIdx];
                    if (picked) setNewRow((r) => ({ ...r, paidBy: picked }));
                    setPayeeSuggestOpen(false);
                  } else if (e.key === 'Escape') {
                    setPayeeSuggestOpen(false);
                  }
                }}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
                placeholder="輸入姓名會自動建議教師名單"
              />
              {payeeSuggestOpen ? (
                <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                  {payeeSuggestions.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-400">查無相符教師姓名，可直接輸入。</div>
                  ) : (
                    <ul className="max-h-56 overflow-y-auto py-1">
                      {payeeSuggestions.map((name, idx) => (
                        <li key={name}>
                          <button
                            type="button"
                            onMouseDown={(ev) => ev.preventDefault()}
                            onClick={() => {
                              setNewRow((r) => ({ ...r, paidBy: name }));
                              setPayeeSuggestOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                              idx === payeeSuggestActiveIdx
                                ? 'bg-amber-50 text-amber-900'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">備註（選填）</label>
            <input
              value={newRow.memo}
              onChange={(e) => setNewRow((r) => ({ ...r, memo: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3 flex justify-end">
            <button
              type="button"
              disabled={saving || plans.length === 0}
              onClick={() => void handleAdd()}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              儲存代墊紀錄
            </button>
          </div>
          </div>
        ) : (
          <div className="px-4 py-3 text-xs text-slate-500">
            點擊上方「新增代墊」展開表單。
          </div>
        )}
      </div>

      {/* 篩選與列表 */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex flex-wrap gap-3 items-center justify-between">
          <h2 className="font-semibold text-slate-800">紀錄列表</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <select
              value={filterPlanId}
              onChange={(e) => setFilterPlanId(e.target.value)}
              className="border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white"
            >
              <option value="">全部計畫</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {periodKindLabel(p.periodKind)} {p.academicYear} · {p.name}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus((e.target.value || '') as '' | BudgetAdvanceStatus)}
              className="border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white"
            >
              <option value="">全部狀態</option>
              {(Object.keys(STATUS_LABEL) as BudgetAdvanceStatus[]).map((k) => (
                <option key={k} value={k}>
                  {STATUS_LABEL[k]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs bg-white hover:bg-slate-50 shadow-sm"
              onClick={() => {
                openPrintPage('filteredList');
              }}
              disabled={filteredAdvances.length === 0}
              title="開新分頁列印（目前篩選明細）"
            >
              <Printer size={14} /> 列印清單
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-amber-500" size={32} />
          </div>
        ) : filteredAdvances.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">尚無代墊紀錄或無符合篩選的項目</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-left">
                <tr>
                  <th className="px-3 py-2 font-semibold">日期</th>
                  <th className="px-3 py-2 font-semibold">計畫專案</th>
                  <th className="px-3 py-2 font-semibold">摘要</th>
                  <th className="px-3 py-2 font-semibold text-right">金額</th>
                  <th className="px-3 py-2 font-semibold">狀態</th>
                  <th className="px-3 py-2 font-semibold w-28">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAdvances.map((row) => {
                  const p = planById.get(row.budgetPlanId);
                  const missingPlan = !p;
                  return (
                    <tr key={row.id} className={`${missingPlan ? 'bg-amber-50/50' : ''} hover:bg-slate-50/60 transition-colors`}>
                      <td className="px-3 py-2 whitespace-nowrap align-top">
                        <input
                          type="date"
                          defaultValue={row.advanceDate}
                          key={`d-${row.id}-${row.updatedAt}`}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== row.advanceDate && ISO_DATE.test(v)) void handleUpdateRow(row, { advanceDate: v });
                          }}
                          disabled={saving}
                          className="border border-slate-200 rounded px-1 py-0.5 text-xs max-w-[9.5rem]"
                        />
                      </td>
                      <td className="px-3 py-2 align-top min-w-[10rem]">
                        <select
                          defaultValue={row.budgetPlanId}
                          key={`p-${row.id}-${row.updatedAt}`}
                          onChange={(e) => void handleUpdateRow(row, { budgetPlanId: e.target.value })}
                          disabled={saving}
                          className="w-full border border-slate-200 rounded px-1 py-1 text-xs"
                        >
                          {missingPlan && (
                            <option value={row.budgetPlanId}>（原計畫已不存在）</option>
                          )}
                          {plans.map((pl) => (
                            <option key={pl.id} value={pl.id}>
                              {pl.name}
                            </option>
                          ))}
                        </select>
                        {p && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {periodKindLabel(p.periodKind)} {p.academicYear} · {p.accountingCode || '—'}
                          </div>
                        )}
                        {missingPlan && <div className="text-[10px] text-amber-700">原計畫已刪除，請改掛其他計畫</div>}
                      </td>
                      <td className="px-3 py-2 align-top min-w-[8rem]">
                        <input
                          defaultValue={row.title}
                          key={`t-${row.id}-${row.updatedAt}`}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== row.title) void handleUpdateRow(row, { title: v });
                          }}
                          disabled={saving}
                          className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
                        />
                        {row.paidBy ? (
                          <div className="text-[10px] text-slate-500 mt-0.5">受款人：{row.paidBy}</div>
                        ) : null}
                        {row.ledgerEntryId ? (
                          <div className="text-[10px] text-slate-400 mt-0.5">連結支用：{row.ledgerEntryId}</div>
                        ) : null}
                        {row.memo ? <div className="text-[10px] text-slate-400 mt-0.5">{row.memo}</div> : null}
                      </td>
                      <td className="px-3 py-2 text-right align-top whitespace-nowrap">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          defaultValue={row.amount}
                          key={`a-${row.id}-${row.updatedAt}`}
                          onBlur={(e) => {
                            const n = Math.max(0, Number(e.target.value) || 0);
                            if (n > 0 && n !== row.amount) void handleUpdateRow(row, { amount: n });
                          }}
                          disabled={saving}
                          className="w-24 border border-slate-200 rounded px-2 py-1 text-xs text-right"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <select
                          value={row.status}
                          onChange={(e) =>
                            void handleUpdateRow(row, { status: e.target.value as BudgetAdvanceStatus })
                          }
                          disabled={saving}
                          className="w-full min-w-[7rem] border border-slate-200 rounded px-1 py-1 text-xs"
                        >
                          {(Object.keys(STATUS_LABEL) as BudgetAdvanceStatus[]).map((k) => (
                            <option key={k} value={k}>
                              {STATUS_LABEL[k]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleDelete(row.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          title="刪除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default BudgetAdvancesTab;
