import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Link } from 'react-router-dom';
import { ArrowLeft, Ban, Calendar, Plus, Trash2, Loader2 } from 'lucide-react';
import SearchableSelect, { SelectOption } from '../components/SearchableSelect';
import Modal, { ModalMode, ModalType } from '../components/Modal';
import InstructionPanel from '../components/InstructionPanel';
import type { SubstituteBusyBlockKind } from '../types';
import {
  SUBSTITUTE_BUSY_PERIOD_OPTIONS,
  formatSubstituteBusyBlockSummary,
} from '../utils/substituteBusyBlocks';
import { normalizeDateString } from '../utils/calculations';

const WEEKDAY_OPTIONS: { value: string; label: string }[] = [
  { value: '1', label: '週一' },
  { value: '2', label: '週二' },
  { value: '3', label: '週三' },
  { value: '4', label: '週四' },
  { value: '5', label: '週五' },
];

const SubstituteBusyBlocksPage: React.FC = () => {
  const { teachers, substituteBusyBlocks, addSubstituteBusyBlock, deleteSubstituteBusyBlock } = useAppStore();

  const [teacherId, setTeacherId] = useState('');
  const [kind, setKind] = useState<SubstituteBusyBlockKind>('date');
  const [dateStr, setDateStr] = useState('');
  const [weekday, setWeekday] = useState('3');
  const [period, setPeriod] = useState('3');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: ModalType;
    mode?: ModalMode;
  }>({ isOpen: false, title: '', message: '', type: 'info' });

  const teacherOptions: SelectOption[] = useMemo(
    () =>
      teachers
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'))
        .map(t => ({ value: t.id, label: t.name, subLabel: t.type })),
    [teachers]
  );

  const sortedBlocks = useMemo(() => {
    const nameOf = (id: string) => teachers.find(t => t.id === id)?.name || id;
    return [...substituteBusyBlocks].sort((a, b) => {
      const na = nameOf(a.teacherId).localeCompare(nameOf(b.teacherId), 'zh-TW');
      if (na !== 0) return na;
      if (a.kind !== b.kind) return a.kind === 'date' ? -1 : 1;
      if (a.kind === 'date' && b.kind === 'date') return (a.date || '').localeCompare(b.date || '');
      return (a.weekday || 0) - (b.weekday || 0);
    });
  }, [substituteBusyBlocks, teachers]);

  const showAlert = (title: string, message: string, type: ModalType = 'warning') => {
    setModal({ isOpen: true, title, message, type, mode: 'alert' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId) {
      showAlert('欄位未填', '請選擇教師。');
      return;
    }
    if (!period) {
      showAlert('欄位未填', '請選擇節次。');
      return;
    }
    if (kind === 'date') {
      const d = normalizeDateString(dateStr);
      if (!d) {
        showAlert('日期錯誤', '請選擇或輸入正確日期。');
        return;
      }
      setSaving(true);
      try {
        await addSubstituteBusyBlock({
          teacherId,
          kind: 'date',
          period,
          date: d,
          note: note.trim() || undefined,
        });
        setNote('');
        setDateStr('');
      } catch (err: any) {
        showAlert('儲存失敗', String(err?.message || err), 'error');
      } finally {
        setSaving(false);
      }
      return;
    }

    const wd = parseInt(weekday, 10);
    if (wd < 1 || wd > 5) {
      showAlert('欄位錯誤', '請選擇週一至週五。');
      return;
    }
    const vf = validFrom.trim() ? normalizeDateString(validFrom) : undefined;
    const vt = validTo.trim() ? normalizeDateString(validTo) : undefined;
    if (validFrom.trim() && !vf) {
      showAlert('日期錯誤', '有效起日格式不正確。');
      return;
    }
    if (validTo.trim() && !vt) {
      showAlert('日期錯誤', '有效迄日格式不正確。');
      return;
    }
    if (vf && vt && vf > vt) {
      showAlert('日期錯誤', '有效起日不能晚於迄日。');
      return;
    }

    setSaving(true);
    try {
      await addSubstituteBusyBlock({
        teacherId,
        kind: 'weekly',
        period,
        weekday: wd,
        validFrom: vf,
        validTo: vt,
        note: note.trim() || undefined,
      });
      setNote('');
    } catch (err: any) {
      showAlert('儲存失敗', String(err?.message || err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <Modal
        isOpen={modal.isOpen}
        onClose={() => setModal(m => ({ ...m, isOpen: false }))}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        mode={modal.mode}
      />
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          if (!deleteId) return;
          try {
            await deleteSubstituteBusyBlock(deleteId);
          } catch (err: any) {
            showAlert('刪除失敗', String(err?.message || err), 'error');
          }
          setDeleteId(null);
        }}
        title="確認刪除"
        message="確定要刪除此筆忙碌／不接紀錄嗎？"
        type="warning"
        mode="confirm"
        confirmText="刪除"
        cancelText="取消"
      />

      <div className="mb-6">
        <Link
          to="/"
          className="text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1 mb-3"
        >
          <ArrowLeft size={16} /> 返回代課資料總表
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-2">
          <Ban className="text-amber-600" size={28} />
          代課忙碌／不接時段
        </h1>
        <p className="text-slate-500 mt-2 text-sm md:text-base">
          登記代課老師「單日某節已接其他工作」或「每週固定某節不接」。資料會顯示在
          <strong className="text-slate-700">代課資料總表</strong>
          對照，不影響薪資計算。
        </p>
      </div>

      <InstructionPanel title="使用說明" isOpenDefault>
        <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
          <li>
            <strong>單日</strong>：指定某一天＋節次（例如監考、外校活動）。
          </li>
          <li>
            <strong>每週固定</strong>：週一至週五中固定某節（配合老師常態）。可選填「有效起迄日」限制在某一學期內。
          </li>
          <li>與人力庫文字欄「不接課時段」可並存；本頁與總表格線一致，較利於核對。</li>
        </ul>
      </InstructionPanel>

      <form
        onSubmit={handleSubmit}
        className="mt-6 bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4"
      >
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Plus size={20} className="text-indigo-600" />
          新增紀錄
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-500 mb-1">教師</label>
            <SearchableSelect
              options={teacherOptions}
              value={teacherId}
              onChange={setTeacherId}
              placeholder="搜尋姓名…"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">類型</label>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setKind('date')}
                className={`flex-1 py-2 text-sm font-bold ${
                  kind === 'date' ? 'bg-indigo-50 text-indigo-700' : 'bg-white text-slate-600'
                }`}
              >
                單日
              </button>
              <button
                type="button"
                onClick={() => setKind('weekly')}
                className={`flex-1 py-2 text-sm font-bold border-l border-slate-200 ${
                  kind === 'weekly' ? 'bg-indigo-50 text-indigo-700' : 'bg-white text-slate-600'
                }`}
              >
                每週固定
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">節次</label>
            <select
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              value={period}
              onChange={e => setPeriod(e.target.value)}
            >
              {SUBSTITUTE_BUSY_PERIOD_OPTIONS.map(p => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {kind === 'date' ? (
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">日期</label>
              <input
                type="date"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                value={dateStr}
                onChange={e => setDateStr(e.target.value)}
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">週幾</label>
              <select
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                value={weekday}
                onChange={e => setWeekday(e.target.value)}
              >
                {WEEKDAY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {kind === 'weekly' && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">有效起日（選填）</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  value={validFrom}
                  onChange={e => setValidFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">有效迄日（選填）</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  value={validTo}
                  onChange={e => setValidTo(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-500 mb-1">備註（選填）</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="例：外校監考、科務會議"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Calendar size={18} />}
          儲存
        </button>
      </form>

      <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">已登記列表</h2>
          <p className="text-sm text-slate-500 mt-1">共 {sortedBlocks.length} 筆</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3">教師</th>
                <th className="px-4 py-3">類型</th>
                <th className="px-4 py-3">時段</th>
                <th className="px-4 py-3">備註</th>
                <th className="px-4 py-3 w-24">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedBlocks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    尚無紀錄。請於上方新增。
                  </td>
                </tr>
              ) : (
                sortedBlocks.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {teachers.find(t => t.id === b.teacherId)?.name || b.teacherId}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {b.kind === 'date' ? '單日' : '每週固定'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatSubstituteBusyBlockSummary(b)}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate" title={b.note}>
                      {b.note || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setDeleteId(b.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                        title="刪除"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SubstituteBusyBlocksPage;
