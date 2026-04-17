import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
} from 'lucide-react';
import type {
  BudgetPlanLedgerEntry,
  BudgetPlanLedgerKind,
  BudgetPlanLedgerPaymentStatus,
} from '../types';
import {
  getBudgetPlanLedgerEntries,
  ledgerActualCountsTowardSpent,
  ledgerPlannedCommitAmount,
  saveBudgetPlanLedgerEntry,
  deleteBudgetPlanLedgerEntry,
  updateBudgetPlanFinancialRollups,
  sumBudgetPlanLedgerExpenses,
  sumBudgetPlanLedgerEstimated,
  sumBudgetPlanLedgerPlannedCommit,
} from '../services/api';

const PAYMENT_STATUS_LABEL: Record<BudgetPlanLedgerPaymentStatus, string> = {
  planned: '預定',
  executed_pending: '已執行待核銷',
  settled: '核銷完畢',
};

function paymentStatusBadgeClass(st: BudgetPlanLedgerPaymentStatus | undefined): string {
  switch (st ?? 'settled') {
    case 'planned':
      return 'bg-sky-100 text-sky-900 border-sky-200';
    case 'executed_pending':
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 'settled':
      return 'bg-emerald-100 text-emerald-900 border-emerald-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

const fmtMoney = (n: number) =>
  n.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** 單筆支用列計入額度控管的金額（已執行／核銷用實支；預定用 max(預估,實支)） */
function expenseUsedForBudget(e: BudgetPlanLedgerEntry): number {
  if (e.kind !== 'expense') return 0;
  return ledgerActualCountsTowardSpent(e) ? (e.amount || 0) : ledgerPlannedCommitAmount(e);
}

function groupChildrenByParent(entries: BudgetPlanLedgerEntry[]): Map<string | null, BudgetPlanLedgerEntry[]> {
  const m = new Map<string | null, BudgetPlanLedgerEntry[]>();
  for (const e of entries) {
    const p = e.parentId ?? null;
    if (!m.has(p)) m.set(p, []);
    m.get(p)!.push(e);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh-TW'));
  }
  return m;
}


type TreeProps = {
  parentId: string | null;
  depth: number;
  childrenMap: Map<string | null, BudgetPlanLedgerEntry[]>;
  expanded: Set<string>;
  saving: boolean;
  onToggleFolder: (id: string) => void;
  onCreate: (parentId: string | null, kind: BudgetPlanLedgerKind) => void;
  onEdit: (e: BudgetPlanLedgerEntry) => void;
  onDelete: (e: BudgetPlanLedgerEntry) => void;
};

const LedgerTreeBranch: React.FC<TreeProps> = ({
  parentId,
  depth,
  childrenMap,
  expanded,
  saving,
  onToggleFolder,
  onCreate,
  onEdit,
  onDelete,
}) => {
  const rows = childrenMap.get(parentId) ?? [];
  if (rows.length === 0) return null;
  return (
    <ul className={depth > 0 ? 'ml-3 pl-3 border-l border-slate-200 space-y-1 mt-1' : 'space-y-1'}>
      {rows.map((e) => (
        <li key={e.id} className="text-sm">
          <div
            className={`flex flex-wrap items-start gap-1 py-1.5 px-2 rounded-lg border ${
              e.kind === 'folder'
                ? 'bg-amber-50/80 border-amber-100'
                : 'bg-white border-slate-100 hover:border-slate-200'
            }`}
          >
            <div className="flex items-start gap-1 min-w-0 flex-1">
              {e.kind === 'folder' ? (
                <button
                  type="button"
                  onClick={() => onToggleFolder(e.id)}
                  className="p-0.5 text-amber-700 hover:bg-amber-100 rounded shrink-0 mt-0.5"
                  aria-expanded={expanded.has(e.id)}
                >
                  {expanded.has(e.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
              ) : (
                <span className="w-5 shrink-0" />
              )}
              {e.kind === 'folder' ? (
                expanded.has(e.id) ? (
                  <FolderOpen size={16} className="text-amber-600 shrink-0 mt-0.5" />
                ) : (
                  <Folder size={16} className="text-amber-600 shrink-0 mt-0.5" />
                )
              ) : (
                <FileText size={16} className="text-slate-500 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-800">{e.title}</div>
                {e.kind === 'expense' && (
                  <div className="text-xs text-slate-600 mt-0.5 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-medium ${paymentStatusBadgeClass(e.paymentStatus)}`}
                      >
                        {PAYMENT_STATUS_LABEL[e.paymentStatus ?? 'settled']}
                      </span>
                      {e.expenseDate ? <span className="text-slate-500">{e.expenseDate}</span> : null}
                    </div>
                    <div className="tabular-nums">
                      <span className="text-slate-500">預估</span>{' '}
                      <span className="font-medium text-slate-800">${fmtMoney(e.estimatedAmount ?? 0)}</span>
                      <span className="text-slate-400 mx-1">·</span>
                      <span className="text-slate-500">實支</span>{' '}
                      <span className="font-semibold text-emerald-800">${fmtMoney(e.amount)}</span>
                    </div>
                  </div>
                )}
                {e.memo ? <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">{e.memo}</p> : null}
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {e.kind === 'folder' && (
                <>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => onCreate(e.id, 'folder')}
                    className="p-1 text-xs text-amber-800 hover:bg-amber-100 rounded"
                    title="子資料夾"
                  >
                    <Folder size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => onCreate(e.id, 'expense')}
                    className="p-1 text-xs text-emerald-700 hover:bg-emerald-50 rounded"
                    title="新增支用"
                  >
                    <Plus size={14} />
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => onEdit(e)}
                className="p-1 text-slate-500 hover:text-blue-600 rounded"
                title="編輯"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void onDelete(e)}
                className="p-1 text-slate-500 hover:text-red-600 rounded"
                title="刪除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          {e.kind === 'folder' && expanded.has(e.id) && (
            <LedgerTreeBranch
              parentId={e.id}
              depth={depth + 1}
              childrenMap={childrenMap}
              expanded={expanded}
              saving={saving}
              onToggleFolder={onToggleFolder}
              onCreate={onCreate}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )}
        </li>
      ))}
    </ul>
  );
};

type DialogState =
  | null
  | {
      mode: 'create' | 'edit';
      parentId: string | null;
      entry?: BudgetPlanLedgerEntry;
    };

const BudgetPlanLedgerPanel: React.FC<{
  planId: string;
  /** 已支出同步到 Firestore 後通知上層重讀計畫（更新畫面上的已支出／剩餘） */
  onSpentSynced?: () => void;
}> = ({ planId, onSpentSynced }) => {
  const [entries, setEntries] = useState<BudgetPlanLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [budgetWarning, setBudgetWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<DialogState>(null);

  const [formKind, setFormKind] = useState<BudgetPlanLedgerKind>('expense');
  const [formTitle, setFormTitle] = useState('');
  const [formEstimated, setFormEstimated] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formAllowPooling, setFormAllowPooling] = useState(false);
  const [formFolderBudgetAllocated, setFormFolderBudgetAllocated] = useState('');
  const [formFolderAllowPooling, setFormFolderAllowPooling] = useState(false);
  const [formPaymentStatus, setFormPaymentStatus] = useState<BudgetPlanLedgerPaymentStatus>('planned');
  const [formDate, setFormDate] = useState('');
  const [formMemo, setFormMemo] = useState('');
  /** 平面模式：支用所屬子項目（對應根層 folder id，寫入 parentId） */
  const [formSubItemFolderId, setFormSubItemFolderId] = useState('');

  /** 避免父層每次 render 傳新函式時，pullLedger 依賴變動 → useEffect 無限重跑、loading 閃爍 */
  const onSpentSyncedRef = useRef(onSpentSynced);
  onSpentSyncedRef.current = onSpentSynced;

  /**
   * @param alwaysSyncSpent true：一定把「已支出」寫成明細加總（新增／刪除／重整）
   * false：僅在已有任何明細節點時才同步（避免覆蓋從未使用明細的舊資料）
   */
  const pullLedger = useCallback(
    async (alwaysSyncSpent: boolean) => {
      setLoading(true);
      setError(null);
      setBudgetWarning(null);
      try {
        const list = await getBudgetPlanLedgerEntries(planId);
        setEntries(list);
        setExpanded(new Set(list.filter((e) => e.kind === 'folder').map((e) => e.id)));
        const sumSpent = sumBudgetPlanLedgerExpenses(list);
        const sumPlanned = sumBudgetPlanLedgerPlannedCommit(list);
        const reservedByHiddenSubItems = list
          .filter((e) => e.kind === 'folder' && (e.parentId ?? null) === null && e.hidden === true)
          .reduce((s, e) => s + (e.budgetAllocated ?? 0), 0);
        if (alwaysSyncSpent || list.length > 0) {
          await updateBudgetPlanFinancialRollups(planId, sumSpent, sumPlanned, reservedByHiddenSubItems);
          onSpentSyncedRef.current?.();
        }
      } catch (e: any) {
        setError(e?.message || '載入支用明細失敗');
      } finally {
        setLoading(false);
      }
    },
    [planId]
  );

  useEffect(() => {
    void pullLedger(false);
  }, [planId, pullLedger]);

  const childrenMap = useMemo(() => groupChildrenByParent(entries), [entries]);

  const rootFolders = useMemo(
    () =>
      entries
        .filter((e) => e.kind === 'folder' && (e.parentId ?? null) === null)
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh-TW')),
    [entries]
  );
  const hasStructuredSubItems = useMemo(
    () => rootFolders.some((f) => (f.budgetAllocated ?? 0) > 0),
    [rootFolders]
  );
  const rootFolderIdSet = useMemo(() => new Set(rootFolders.map((f) => f.id)), [rootFolders]);
  const subItemTitleById = useMemo(() => new Map(rootFolders.map((f) => [f.id, f.title])), [rootFolders]);
  const usedBySubItemFolder = useMemo(() => {
    const m = new Map<string, number>();
    for (const ex of entries) {
      if (ex.kind !== 'expense' || !ex.parentId || !rootFolderIdSet.has(ex.parentId)) continue;
      m.set(ex.parentId, (m.get(ex.parentId) ?? 0) + expenseUsedForBudget(ex));
    }
    return m;
  }, [entries, rootFolderIdSet]);
  const flatExpenses = useMemo(
    () =>
      entries
        .filter((e) => e.kind === 'expense' && e.parentId != null && rootFolderIdSet.has(e.parentId))
        .sort((a, b) => (b.expenseDate || '').localeCompare(a.expenseDate || '') || a.order - b.order),
    [entries, rootFolderIdSet]
  );

  const expenseTotal = useMemo(() => sumBudgetPlanLedgerExpenses(entries), [entries]);
  const estimatedTotal = useMemo(() => sumBudgetPlanLedgerEstimated(entries), [entries]);
  const plannedCommitTotal = useMemo(() => sumBudgetPlanLedgerPlannedCommit(entries), [entries]);

  const openCreate = (parentId: string | null, kind: BudgetPlanLedgerKind) => {
    setDialog({ mode: 'create', parentId });
    setBudgetWarning(null);
    setFormKind(kind);
    setFormTitle('');
    setFormEstimated('');
    setFormAmount('');
    setFormAllowPooling(false);
    setFormFolderBudgetAllocated('');
    setFormFolderAllowPooling(false);
    setFormSubItemFolderId(
      kind === 'expense' && hasStructuredSubItems ? (rootFolders[0]?.id ?? '') : parentId ?? ''
    );
    setFormPaymentStatus('planned');
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormMemo('');
  };

  const openEdit = (entry: BudgetPlanLedgerEntry) => {
    setDialog({ mode: 'edit', parentId: entry.parentId ?? null, entry });
    setBudgetWarning(null);
    setFormKind(entry.kind);
    setFormTitle(entry.title);
    setFormEstimated(String(entry.estimatedAmount ?? 0));
    setFormAmount(String(entry.amount ?? 0));
    setFormAllowPooling(entry.allowPooling === true);
    setFormFolderBudgetAllocated(String(entry.budgetAllocated ?? 0));
    setFormFolderAllowPooling(entry.allowPooling === true);
    // 若本計畫已啟用「子項目額度」結構，舊資料可能不在根層子項目之下，編輯時先自動帶入一個有效子項目
    // 讓使用者能直接儲存修改（仍可自行改選）
    setFormSubItemFolderId(
      entry.kind === 'expense'
        ? hasStructuredSubItems
          ? entry.parentId && rootFolderIdSet.has(entry.parentId)
            ? entry.parentId
            : (rootFolders[0]?.id ?? '')
          : entry.parentId ?? ''
        : ''
    );
    setFormPaymentStatus(entry.paymentStatus ?? 'settled');
    setFormDate(entry.expenseDate ?? '');
    setFormMemo(entry.memo ?? '');
  };

  const closeDialog = () => setDialog(null);

  const submitDialog = async () => {
    if (!dialog) return;
    const t = formTitle.trim();
    if (!t) {
      setError('請填寫標題／摘要');
      return;
    }
    if (formKind === 'expense') {
      const est = Number(formEstimated);
      const act = Number(formAmount);
      if (!Number.isFinite(est) || est < 0) {
        setError('預估金額請填有效數字');
        return;
      }
      if (!Number.isFinite(act) || act < 0) {
        setError('實支金額請填有效數字');
        return;
      }
    }
    if (formKind === 'folder') {
      const b = Number(formFolderBudgetAllocated);
      if (!Number.isFinite(b) || b < 0) {
        setError('子項目分配額度請填有效數字');
        return;
      }
    }
    if (formKind === 'expense' && hasStructuredSubItems) {
      if (!formSubItemFolderId.trim() || !rootFolderIdSet.has(formSubItemFolderId)) {
        setError('請選擇「從哪一筆子項目支出」');
        return;
      }
    }

    const validateFolderBudget = (
      nextEntries: BudgetPlanLedgerEntry[],
      touched: BudgetPlanLedgerEntry
    ): { hardError?: string; softWarning?: string } => {
      if (touched.kind !== 'expense') return {};

      const folders = nextEntries.filter((e) => e.kind === 'folder' && (e.parentId ?? null) === null);
      const hasBudgetSetup = folders.some((f) => (f.budgetAllocated ?? 0) > 0);
      if (!hasBudgetSetup) return {}; // 舊資料相容：未設定子項目額度就不擋

      const folderById = new Map(folders.map((f) => [f.id, f]));
      const parentFolderId = touched.parentId ?? null;
      if (!parentFolderId || !folderById.has(parentFolderId)) {
        return { hardError: '本計畫已設定子項目額度，請在支用表單選擇「從哪一筆子項目支出」。' };
      }

      const folder = folderById.get(parentFolderId)!;
      const isPooled = folder.allowPooling === true;

      const expenses = nextEntries.filter((e) => e.kind === 'expense' && e.parentId != null);
      const usedByFolder = new Map<string, number>();
      for (const ex of expenses) {
        const pid = ex.parentId!;
        usedByFolder.set(pid, (usedByFolder.get(pid) ?? 0) + expenseUsedForBudget(ex));
      }

      if (isPooled) {
        const pooledFolders = folders.filter((f) => f.allowPooling === true);
        const pooledBudget = pooledFolders.reduce((s, f) => s + (f.budgetAllocated ?? 0), 0);
        const pooledUsed = pooledFolders.reduce((s, f) => s + (usedByFolder.get(f.id) ?? 0), 0);
        const remaining = pooledBudget - pooledUsed;
        if (remaining < 0) {
          return {
            softWarning: `「可勻支池」額度不足：池額度 ${fmtMoney(pooledBudget)}，已用/佔用 ${fmtMoney(pooledUsed)}，超出 ${fmtMoney(
              Math.abs(remaining)
            )}。本筆仍可儲存，請後續調整子項目分配額度或支用金額。`,
          };
        }
        return {};
      }

      const ownBudget = folder.budgetAllocated ?? 0;
      const ownUsed = usedByFolder.get(folder.id) ?? 0;
      const remaining = ownBudget - ownUsed;
      if (remaining < 0) {
        return {
          hardError: `子項目「${folder.title}」未勾選可勻支，需各自控管額度：額度 ${fmtMoney(ownBudget)}，已用/佔用 ${fmtMoney(
            ownUsed
          )}，超出 ${fmtMoney(Math.abs(remaining))}。`,
        };
      }
      return {};
    };

    setSaving(true);
    setError(null);
    setBudgetWarning(null);
    try {
      const base: Partial<BudgetPlanLedgerEntry> & { title: string; kind: BudgetPlanLedgerKind } = {
        kind: formKind,
        title: t,
        estimatedAmount: formKind === 'expense' ? Number(formEstimated) || 0 : 0,
        amount: formKind === 'expense' ? Number(formAmount) || 0 : 0,
        allowPooling:
          formKind === 'expense'
            ? hasStructuredSubItems
              ? undefined
              : formAllowPooling
            : formKind === 'folder'
              ? formFolderAllowPooling
              : undefined,
        budgetAllocated: formKind === 'folder' ? Number(formFolderBudgetAllocated) || 0 : undefined,
        paymentStatus: formKind === 'expense' ? formPaymentStatus : undefined,
        expenseDate: formKind === 'expense' ? formDate.trim() : '',
        memo: formMemo.trim(),
      };
      const nextId = dialog.mode === 'edit' && dialog.entry ? dialog.entry.id : '__new__';
      const nextParentId =
        formKind === 'expense' && hasStructuredSubItems
          ? formSubItemFolderId
          : dialog.mode === 'edit' && dialog.entry
            ? (dialog.entry.parentId ?? null)
            : (dialog.parentId ?? null);
      const touchedEntry: BudgetPlanLedgerEntry = {
        id: nextId,
        budgetPlanId: planId,
        parentId: nextParentId,
        kind: formKind,
        title: t,
        estimatedAmount: formKind === 'expense' ? Number(formEstimated) || 0 : 0,
        amount: formKind === 'expense' ? Number(formAmount) || 0 : 0,
        budgetAllocated: formKind === 'folder' ? Number(formFolderBudgetAllocated) || 0 : undefined,
        allowPooling:
          formKind === 'expense'
            ? hasStructuredSubItems
              ? undefined
              : formAllowPooling
            : formKind === 'folder'
              ? formFolderAllowPooling
              : undefined,
        paymentStatus: formKind === 'expense' ? formPaymentStatus : undefined,
        expenseDate: formKind === 'expense' ? formDate.trim() : '',
        memo: formMemo.trim(),
        order: dialog.mode === 'edit' && dialog.entry ? dialog.entry.order : 0,
        createdAt: dialog.mode === 'edit' && dialog.entry ? dialog.entry.createdAt : undefined,
        updatedAt: dialog.mode === 'edit' && dialog.entry ? dialog.entry.updatedAt : undefined,
      };
      const nextEntries: BudgetPlanLedgerEntry[] =
        dialog.mode === 'edit' && dialog.entry
          ? entries.map((e) => (e.id === dialog.entry!.id ? { ...e, ...touchedEntry } : e))
          : [...entries, touchedEntry];
      const budgetCheck = validateFolderBudget(nextEntries, touchedEntry);
      if (budgetCheck.hardError) {
        setError(budgetCheck.hardError);
        return;
      }
      if (budgetCheck.softWarning) setBudgetWarning(budgetCheck.softWarning);

      if (dialog.mode === 'edit' && dialog.entry) {
        base.id = dialog.entry.id;
        // 允許編輯時移動到其他子項目（計畫採子項目額度結構時）
        if (formKind === 'expense' && hasStructuredSubItems) {
          base.parentId = formSubItemFolderId;
        }
      } else {
        base.parentId =
          formKind === 'expense' && hasStructuredSubItems ? formSubItemFolderId : dialog.parentId;
      }
      await saveBudgetPlanLedgerEntry(planId, base);
      closeDialog();
      await pullLedger(true);
    } catch (e: any) {
      setError(e?.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry: BudgetPlanLedgerEntry) => {
    const msg =
      entry.kind === 'folder'
        ? hasStructuredSubItems && (entry.parentId ?? null) === null
          ? `確定刪除子項目「${entry.title}」？其下所有支用紀錄也會一併刪除。`
          : `確定刪除資料夾「${entry.title}」？其下所有子項目也會一併刪除。`
        : `確定刪除此筆支用紀錄「${entry.title}」？`;
    if (!confirm(msg)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteBudgetPlanLedgerEntry(planId, entry.id);
      await pullLedger(true);
    } catch (e: any) {
      setError(e?.message || '刪除失敗');
    } finally {
      setSaving(false);
    }
  };

  const toggleFolder = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">
            {hasStructuredSubItems ? '子項目與支用明細' : '支用明細與分類（巢狀資料夾）'}
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {hasStructuredSubItems ? (
              <>
                已設定子項目額度時，請用「新增支用」並<strong>選擇從哪一筆子項目支出</strong>（備註可另填細節）；額度／可勻支依建立計畫時的子項目設定計算。
              </>
            ) : (
              <>
                「已執行待核銷／核銷完畢」的<strong>實支</strong>計入計畫<strong>已支出</strong>；「預定」以 max(預估, 實支) 計入<strong>預定佔用</strong>，兩者都會從核配扣<strong>剩餘額度</strong>。
              </>
            )}
          </p>
        </div>
        <div className="text-right text-xs text-slate-600 space-y-0.5">
          <div>
            預估合計：<span className="font-semibold text-slate-800 tabular-nums">${fmtMoney(estimatedTotal)}</span>
          </div>
          <div>
            預定佔用：<span className="font-semibold text-sky-800 tabular-nums">${fmtMoney(plannedCommitTotal)}</span>
          </div>
          <div>
            實支計入已支出：<span className="font-bold text-emerald-800 tabular-nums">${fmtMoney(expenseTotal)}</span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
        )}
        {budgetWarning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{budgetWarning}</div>
        )}

        <div className="flex flex-wrap gap-2">
          {hasStructuredSubItems ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => openCreate(null, 'folder')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-900 text-xs font-medium hover:bg-amber-200"
              >
                <Folder size={14} /> 新增子項目
              </button>
              <button
                type="button"
                disabled={saving || rootFolders.length === 0}
                onClick={() => openCreate(null, 'expense')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                <Plus size={14} /> 新增支用
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => openCreate(null, 'folder')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-900 text-xs font-medium hover:bg-amber-200"
              >
                <Folder size={14} /> 根層新增資料夾
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => openCreate(null, 'expense')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700"
              >
                <Plus size={14} /> 根層新增支用
              </button>
            </>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => void pullLedger(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            重新整理
          </button>
        </div>

        {loading && entries.length === 0 ? (
          <div className="flex justify-center py-10 text-slate-500 text-sm">
            <Loader2 className="animate-spin mr-2" size={18} /> 載入明細…
          </div>
        ) : hasStructuredSubItems ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-700 mb-2">子項目（額度／可勻支）</h3>
              {rootFolders.length === 0 ? (
                <p className="text-sm text-slate-500">尚無子項目，請按「新增子項目」。</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">子項目</th>
                        <th className="text-right px-3 py-2 font-medium">分配額度</th>
                        <th className="text-center px-3 py-2 font-medium">可勻支</th>
                        <th className="text-right px-3 py-2 font-medium">已用／佔用</th>
                        <th className="text-right px-3 py-2 font-medium">剩餘</th>
                        <th className="text-right px-3 py-2 font-medium w-24">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rootFolders.map((f) => {
                        const alloc = f.budgetAllocated ?? 0;
                        const used = usedBySubItemFolder.get(f.id) ?? 0;
                        const rem = alloc - used;
                        return (
                          <tr key={f.id} className={`border-t border-slate-100 ${f.hidden ? 'bg-slate-50/70' : ''}`}>
                            <td className="px-3 py-2 font-medium text-slate-800">
                              <span className={f.hidden ? 'line-through text-slate-500' : ''}>{f.title}</span>
                              {f.hidden ? (
                                <span className="ml-2 text-[10px] text-slate-500 font-normal">（隱藏：不列入可運用）</span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">${fmtMoney(alloc)}</td>
                            <td className="px-3 py-2 text-center">{f.allowPooling ? '是' : '否'}</td>
                            <td className="px-3 py-2 text-right tabular-nums">${fmtMoney(used)}</td>
                            <td
                              className={`px-3 py-2 text-right tabular-nums font-medium ${rem < 0 ? 'text-red-600' : 'text-slate-800'}`}
                            >
                              ${fmtMoney(rem)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                disabled={saving}
                                onClick={async () => {
                                  setSaving(true);
                                  setError(null);
                                  try {
                                    await saveBudgetPlanLedgerEntry(planId, {
                                      id: f.id,
                                      kind: 'folder',
                                      title: f.title,
                                      budgetAllocated: f.budgetAllocated ?? 0,
                                      allowPooling: f.allowPooling === true,
                                      hidden: !(f.hidden === true),
                                    });
                                    await pullLedger(true);
                                  } catch (e: any) {
                                    setError(e?.message || '更新失敗');
                                  } finally {
                                    setSaving(false);
                                  }
                                }}
                                className={`p-1 rounded ${f.hidden ? 'text-slate-600 hover:text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
                                title={f.hidden ? '顯示（列入可運用）' : '隱藏（不列入可運用）'}
                              >
                                {f.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => openEdit(f)}
                                className="p-1 text-slate-500 hover:text-blue-600 rounded"
                                title="編輯"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void handleDelete(f)}
                                className="p-1 text-slate-500 hover:text-red-600 rounded"
                                title="刪除"
                              >
                                <Trash2 size={14} />
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
            <div>
              <h3 className="text-xs font-semibold text-slate-700 mb-2">支用明細（平面列表）</h3>
              {flatExpenses.length === 0 ? (
                <p className="text-sm text-slate-500">尚無支用，請按「新增支用」並選擇子項目。</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">子項目</th>
                        <th className="text-left px-3 py-2 font-medium">摘要</th>
                        <th className="text-left px-3 py-2 font-medium">狀態</th>
                        <th className="text-right px-3 py-2 font-medium">預估</th>
                        <th className="text-right px-3 py-2 font-medium">實支</th>
                        <th className="text-left px-3 py-2 font-medium">日期</th>
                        <th className="text-left px-3 py-2 font-medium">備註</th>
                        <th className="text-right px-3 py-2 font-medium w-20">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flatExpenses.map((ex) => {
                        const subTitle =
                          ex.parentId != null ? (subItemTitleById.get(ex.parentId) ?? '—') : '—';
                        return (
                          <tr key={ex.id} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-700">{subTitle}</td>
                            <td className="px-3 py-2 font-medium text-slate-800">{ex.title}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-medium ${paymentStatusBadgeClass(ex.paymentStatus)}`}
                              >
                                {PAYMENT_STATUS_LABEL[ex.paymentStatus ?? 'settled']}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">${fmtMoney(ex.estimatedAmount ?? 0)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-800">
                              ${fmtMoney(ex.amount)}
                            </td>
                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{ex.expenseDate || '—'}</td>
                            <td className="px-3 py-2 text-slate-500 max-w-[10rem] truncate" title={ex.memo}>
                              {ex.memo || '—'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => openEdit(ex)}
                                className="p-1 text-slate-500 hover:text-blue-600 rounded"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void handleDelete(ex)}
                                className="p-1 text-slate-500 hover:text-red-600 rounded"
                              >
                                <Trash2 size={14} />
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
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">尚無資料，請新增資料夾或支用紀錄。</p>
        ) : (
          <LedgerTreeBranch
            parentId={null}
            depth={0}
            childrenMap={childrenMap}
            expanded={expanded}
            saving={saving}
            onToggleFolder={toggleFolder}
            onCreate={openCreate}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        )}
      </div>

      {dialog && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          onClick={closeDialog}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 p-4"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h3 className="font-semibold text-slate-900 mb-3">
              {hasStructuredSubItems
                ? dialog.mode === 'create'
                  ? formKind === 'folder'
                    ? '新增子項目'
                    : '新增支用'
                  : formKind === 'folder'
                    ? '編輯子項目'
                    : '編輯支用'
                : dialog.mode === 'create'
                  ? dialog.parentId
                    ? '在資料夾內新增'
                    : '在根層新增'
                  : '編輯項目'}
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs text-slate-600 mb-1">類型</label>
                <select
                  value={formKind}
                  disabled={dialog.mode === 'edit'}
                  onChange={(e) => setFormKind(e.target.value as BudgetPlanLedgerKind)}
                  className="w-full border rounded-lg px-2 py-1.5 disabled:bg-slate-100"
                >
                  <option value="folder">資料夾（分類）</option>
                  <option value="expense">支用紀錄</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">標題／摘要</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1.5"
                  placeholder={formKind === 'folder' ? '資料夾名稱' : '例：影印費'}
                />
              </div>
              {formKind === 'folder' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">子項目分配額度（元）</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={formFolderBudgetAllocated}
                        onChange={(e) => setFormFolderBudgetAllocated(e.target.value)}
                        className="w-full border rounded-lg px-2 py-1.5 text-right tabular-nums"
                      />
                    </div>
                    <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50">
                      <input
                        type="checkbox"
                        checked={formFolderAllowPooling}
                        onChange={(e) => setFormFolderAllowPooling(e.target.checked)}
                      />
                      <span className="text-xs text-slate-800">
                        <span className="font-medium">可勻支</span>
                        <span className="text-slate-500">（勾選者合併成池）</span>
                      </span>
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    此為計畫的子項目。支用請用「新增支用」並選擇本子項目；備註可另填細節。
                  </p>
                </>
              )}
              {formKind === 'expense' && (
                <>
                  {hasStructuredSubItems && (
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">從哪一筆子項目支出</label>
                      <select
                        value={formSubItemFolderId}
                        onChange={(e) => setFormSubItemFolderId(e.target.value)}
                        className="w-full border rounded-lg px-2 py-1.5"
                      >
                        <option value="">請選擇</option>
                        {rootFolders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.title}（額度 ${fmtMoney(f.budgetAllocated ?? 0)}）
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1">
                        與會計歸屬有關；下方「備註」可填發票、廠商等補充說明。
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">支付狀態</label>
                    <select
                      value={formPaymentStatus}
                      onChange={(e) => setFormPaymentStatus(e.target.value as BudgetPlanLedgerPaymentStatus)}
                      className="w-full border rounded-lg px-2 py-1.5"
                    >
                      <option value="planned">{PAYMENT_STATUS_LABEL.planned}</option>
                      <option value="executed_pending">{PAYMENT_STATUS_LABEL.executed_pending}</option>
                      <option value="settled">{PAYMENT_STATUS_LABEL.settled}</option>
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      預定：實支不計入計畫已支出；已執行待核銷／核銷完畢：實支會計入。
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">預估金額（元）</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={formEstimated}
                        onChange={(e) => setFormEstimated(e.target.value)}
                        className="w-full border rounded-lg px-2 py-1.5 text-right tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">實支金額（元）</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={formAmount}
                        onChange={(e) => setFormAmount(e.target.value)}
                        className="w-full border rounded-lg px-2 py-1.5 text-right tabular-nums"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">支用日期</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full border rounded-lg px-2 py-1.5"
                    />
                  </div>
                  {!hasStructuredSubItems && (
                    <label className="flex items-start gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50">
                      <input
                        type="checkbox"
                        checked={formAllowPooling}
                        onChange={(e) => setFormAllowPooling(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span className="text-xs text-slate-800">
                        <span className="font-medium">可勻支（合併計算）</span>
                        <span className="text-slate-500">
                          {' '}
                          勾選後會併入本計畫「可勻支池」；未勾選則此項目只能用自己的預估額度，不可由池補貼。
                        </span>
                      </span>
                    </label>
                  )}
                </>
              )}
              <div>
                <label className="block text-xs text-slate-600 mb-1">備註</label>
                <textarea
                  value={formMemo}
                  onChange={(e) => setFormMemo(e.target.value)}
                  rows={3}
                  className="w-full border rounded-lg px-2 py-1.5 text-xs"
                  placeholder={
                    hasStructuredSubItems && formKind === 'expense'
                      ? '發票號碼、簽核單號、廠商…（子項目請用上方選單）'
                      : '發票號碼、簽核單號、廠商…'
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={closeDialog} className="px-3 py-1.5 text-sm border rounded-lg">
                取消
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitDialog()}
                className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin inline" /> : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BudgetPlanLedgerPanel;
