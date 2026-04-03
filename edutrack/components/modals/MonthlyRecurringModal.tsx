import React, { useState, useEffect } from 'react';
import { Repeat, Plus, Pencil, Trash2, Loader2, X } from 'lucide-react';
import type { MonthlyRecurringTodoRule } from '../../types';
import {
  getMonthlyRecurringTodoRules,
  saveMonthlyRecurringTodoRule,
  deleteMonthlyRecurringTodoRule,
} from '../../services/api';

const MONTH_LABELS = [
  { v: 1, l: '1月' },
  { v: 2, l: '2月' },
  { v: 3, l: '3月' },
  { v: 4, l: '4月' },
  { v: 5, l: '5月' },
  { v: 6, l: '6月' },
  { v: 7, l: '7月' },
  { v: 8, l: '8月' },
  { v: 9, l: '9月' },
  { v: 10, l: '10月' },
  { v: 11, l: '11月' },
  { v: 12, l: '12月' },
];

const TYPE_OPTIONS = ['行政', '教學', '會議', '其他'];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const emptyForm = (): Omit<MonthlyRecurringTodoRule, 'id' | 'createdAt' | 'updatedAt'> & { id?: string } => ({
  title: '',
  type: '行政',
  priority: 'Medium',
  dayOfMonth: 1,
  months: [],
  memo: '',
});

const MonthlyRecurringModal: React.FC<Props> = ({ isOpen, onClose, onSaved }) => {
  const [rules, setRules] = useState<MonthlyRecurringTodoRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<(typeof emptyForm) | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setRules(await getMonthlyRecurringTodoRules());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleMonth = (m: number) => {
    if (!editing || editing.months.length === 0) return;
    const has = editing.months.includes(m);
    const next = has ? editing.months.filter((x) => x !== m) : [...editing.months, m].sort((a, b) => a - b);
    if (next.length === 0) return;
    setEditing({ ...editing, months: next });
  };

  const handleSave = async () => {
    if (!editing || !editing.title.trim()) return;
    setSaving(true);
    try {
      await saveMonthlyRecurringTodoRule({
        id: editing.id,
        title: editing.title.trim(),
        type: editing.type,
        priority: editing.priority,
        dayOfMonth: editing.dayOfMonth,
        months: editing.months,
        memo: editing.memo ?? '',
        monthCompletions: editing.id
          ? rules.find((r) => r.id === editing.id)?.monthCompletions
          : undefined,
      });
      setEditing(null);
      await load();
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定刪除此每月固定事項？（已標記完成紀錄一併刪除）')) return;
    setSaving(true);
    try {
      await deleteMonthlyRecurringTodoRule({ id });
      if (editing?.id === id) setEditing(null);
      await load();
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Repeat className="text-teal-600" size={22} />
            每月固定事項
          </h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4 text-sm">
          <p className="text-slate-600 text-xs leading-relaxed">
            設定後會依<strong>西曆月份</strong>自動出現在行事曆對應日期，無須每月重複新增。
            若未勾選任何月份，表示<strong>每月</strong>皆會出現。
          </p>
          <p className="text-[11px] text-teal-800/90 bg-teal-50 border border-teal-100 rounded-lg px-2 py-1.5">
            下方列表可隨時按<strong>編輯／刪除</strong>；若正填寫上方表單，點另一筆的「編輯」會改為編輯該筆（未儲存的新增內容將捨棄）。
          </p>

          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(emptyForm())}
              className="flex items-center gap-1 px-3 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700"
            >
              <Plus size={16} /> 新增固定事項
            </button>
          )}

          {editing && (
            <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-0.5">標題</label>
                <input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className="w-full border border-slate-300 rounded px-2 py-1.5"
                  placeholder="例：經費核銷截止日前提醒"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-0.5">類型</label>
                  <select
                    value={editing.type}
                    onChange={(e) => setEditing({ ...editing, type: e.target.value })}
                    className="w-full border border-slate-300 rounded px-2 py-1.5"
                  >
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-0.5">優先</label>
                  <select
                    value={editing.priority}
                    onChange={(e) =>
                      setEditing({ ...editing, priority: e.target.value as MonthlyRecurringTodoRule['priority'] })
                    }
                    className="w-full border border-slate-300 rounded px-2 py-1.5"
                  >
                    <option value="High">高</option>
                    <option value="Medium">中</option>
                    <option value="Low">低</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-0.5">每月第幾日</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={editing.dayOfMonth}
                  onChange={(e) =>
                    setEditing({ ...editing, dayOfMonth: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })
                  }
                  className="w-24 border border-slate-300 rounded px-2 py-1.5"
                />
                <span className="text-xs text-slate-500 ml-2">（2 月僅 28/29 日時會落在月底）</span>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-2">出現月份</label>
                <div className="space-y-2 mb-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="monthMode"
                      checked={editing.months.length === 0}
                      onChange={() => setEditing({ ...editing, months: [] })}
                    />
                    <span>每月皆顯示（1～12 月）</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="monthMode"
                      checked={editing.months.length > 0}
                      onChange={() =>
                        setEditing({
                          ...editing,
                          months:
                            editing.months.length > 0
                              ? editing.months
                              : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
                        })
                      }
                    />
                    <span>僅指定西曆月份</span>
                  </label>
                </div>
                {editing.months.length > 0 && (
                  <div className="grid grid-cols-4 gap-1.5 pl-1">
                    {MONTH_LABELS.map(({ v, l }) => {
                      const on = editing.months.includes(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => toggleMonth(v)}
                          className={`text-xs py-1.5 rounded border ${
                            on ? 'bg-teal-100 border-teal-400 text-teal-900' : 'bg-white border-slate-200 text-slate-400'
                          }`}
                        >
                          {l}
                        </button>
                      );
                    })}
                  </div>
                )}
                {editing.months.length > 0 && (
                  <p className="text-[10px] text-slate-500 mt-1">已選 {editing.months.length} 個月份</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-0.5">備註（選填）</label>
                <textarea
                  value={editing.memo ?? ''}
                  onChange={(e) => setEditing({ ...editing, memo: e.target.value })}
                  rows={2}
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={saving || !editing.title.trim()}
                  onClick={() => void handleSave()}
                  className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm disabled:opacity-50"
                >
                  {saving ? <Loader2 className="animate-spin inline" size={16} /> : '儲存'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          <div className="border-t border-slate-100 pt-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">已設定列表</h3>
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="animate-spin text-teal-500" />
              </div>
            ) : rules.length === 0 ? (
              <p className="text-slate-400 text-center py-4 text-xs">尚無固定事項，請按「新增」建立</p>
            ) : (
              <ul className="space-y-2">
                {rules.map((r) => {
                  const monthDesc =
                    !r.months || r.months.length === 0
                      ? '每月'
                      : r.months.map((m) => `${m}月`).join('、');
                  return (
                    <li
                      key={r.id}
                      className="flex items-start gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50/80"
                    >
                      <Repeat size={16} className="text-teal-600 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-800 truncate">{r.title}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          每月第 {r.dayOfMonth} 日 · {monthDesc} · {r.type}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            setEditing({
                              id: r.id,
                              title: r.title,
                              type: r.type,
                              priority: r.priority,
                              dayOfMonth: r.dayOfMonth,
                              months: [...(r.months ?? [])],
                              memo: r.memo ?? '',
                            })
                          }
                          className="p-1.5 rounded-md text-teal-700 hover:bg-teal-100 disabled:opacity-40 disabled:pointer-events-none"
                          title="編輯此筆"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleDelete(r.id)}
                          className="p-1.5 rounded-md text-slate-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:pointer-events-none"
                          title="刪除此筆"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonthlyRecurringModal;
