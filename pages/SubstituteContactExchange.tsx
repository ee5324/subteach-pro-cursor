/**
 * 代課聯絡資訊交換
 * 供代課老師與請假老師查看／填寫：上課班級、教室、聯繫電話、備註
 */
import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Phone, MapPin, BookOpen, MessageSquare, User, UserCheck } from 'lucide-react';
import { LeaveRecord, TimetableSlot } from '../types';

interface ContactRow {
  recordId: string;
  record: LeaveRecord;
  slot: TimetableSlot;
  originalTeacherName: string;
  originalTeacherPhone: string;
  substituteTeacherName: string;
  substituteTeacherPhone: string;
}

export default function SubstituteContactExchange() {
  const { records, teachers, updateRecord } = useAppStore();
  const [editingSlot, setEditingSlot] = useState<{ recordId: string; date: string; period: string } | null>(null);
  const [editingNoteRecordId, setEditingNoteRecordId] = useState<string | null>(null);
  const [tempClassroom, setTempClassroom] = useState('');
  const [tempNote, setTempNote] = useState('');

  const rows = useMemo((): ContactRow[] => {
    const out: ContactRow[] = [];
    records.forEach((record) => {
      if (!record.slots) return;
      const originalTeacher = teachers.find((t) => t.id === record.originalTeacherId);
      record.slots.forEach((slot) => {
        if (!slot.substituteTeacherId) return;
        const substituteTeacher = teachers.find((t) => t.id === slot.substituteTeacherId);
        out.push({
          recordId: record.id,
          record,
          slot,
          originalTeacherName: originalTeacher?.name ?? '—',
          originalTeacherPhone: originalTeacher?.phone?.trim() ?? '—',
          substituteTeacherName: substituteTeacher?.name ?? '—',
          substituteTeacherPhone: substituteTeacher?.phone?.trim() ?? '—',
        });
      });
    });
    return out.sort((a, b) => a.slot.date.localeCompare(b.slot.date) || String(a.slot.period).localeCompare(String(b.slot.period)));
  }, [records, teachers]);

  const saveClassroom = (recordId: string, date: string, period: string) => {
    const record = records.find((r) => r.id === recordId);
    if (!record?.slots) return;
    const newSlots = record.slots.map((s) =>
      s.date === date && String(s.period) === String(period) ? { ...s, classroom: tempClassroom.trim() || undefined } : s
    );
    updateRecord({ ...record, slots: newSlots });
    setEditingSlot(null);
    setTempClassroom('');
  };

  const saveNote = (recordId: string) => {
    const record = records.find((r) => r.id === recordId);
    if (!record) return;
    updateRecord({ ...record, contactNoteForSubstitute: tempNote.trim() || undefined });
    setEditingNoteRecordId(null);
    setTempNote('');
  };

  const startEditClassroom = (row: ContactRow) => {
    setEditingSlot({ recordId: row.recordId, date: row.slot.date, period: row.slot.period });
    setTempClassroom(row.slot.classroom ?? '');
  };

  const startEditNote = (record: LeaveRecord) => {
    setEditingNoteRecordId(record.id);
    setTempNote(record.contactNoteForSubstitute ?? '');
  };

  const periodLabel = (p: string) => (p === '早' ? '早自習' : p === '午' ? '午休' : `第 ${p} 節`);

  return (
    <div className="p-8 pb-24">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
          <MessageSquare className="text-indigo-600" size={28} />
          代課聯絡資訊交換
        </h1>
        <p className="text-slate-500 mt-2">
          供代課老師與請假老師對照：上課班級、教室、聯繫電話及備註。可於表格內直接編輯教室與備註。
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-12 text-center">
          <p className="text-slate-600 font-medium">目前沒有已派代的代課節次</p>
          <p className="text-slate-500 text-sm mt-1">待派代完成後，已派代的課程會顯示於此供填寫聯絡資訊。</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">請假老師</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">聯繫電話</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">代課老師</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">聯繫電話</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">日期</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">節次</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">科目／班級</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">教室</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">備註</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, idx) => {
                  const isEditingClassroom =
                    editingSlot?.recordId === row.recordId &&
                    editingSlot?.date === row.slot.date &&
                    editingSlot?.period === row.slot.period;
                  const isEditingNote = editingNoteRecordId === row.recordId;
                  const isFirstSlotOfRecord =
                    rows.findIndex((r) => r.recordId === row.recordId) === idx;

                  return (
                    <tr key={`${row.recordId}_${row.slot.date}_${row.slot.period}`} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-800 flex items-center gap-1.5">
                          <User size={14} className="text-slate-400" />
                          {row.originalTeacherName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-sm">
                        <span className="flex items-center gap-1.5">
                          <Phone size={12} className="text-slate-400" />
                          {row.originalTeacherPhone}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-800 flex items-center gap-1.5">
                          <UserCheck size={14} className="text-indigo-500" />
                          {row.substituteTeacherName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-sm">
                        <span className="flex items-center gap-1.5">
                          <Phone size={12} className="text-slate-400" />
                          {row.substituteTeacherPhone}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-slate-600">{row.slot.date}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{periodLabel(row.slot.period)}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-800">{row.slot.subject}</span>
                        <span className="text-slate-400 mx-1">/</span>
                        <span className="text-slate-600">{row.slot.className}</span>
                      </td>
                      <td className="px-4 py-3">
                        {isEditingClassroom ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={tempClassroom}
                              onChange={(e) => setTempClassroom(e.target.value)}
                              placeholder="教室"
                              className="w-28 px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => saveClassroom(row.recordId, row.slot.date, row.slot.period)}
                              className="text-indigo-600 text-sm font-medium hover:underline"
                            >
                              儲存
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingSlot(null); setTempClassroom(''); }}
                              className="text-slate-500 text-sm hover:underline"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEditClassroom(row)}
                            className="flex items-center gap-1.5 text-left text-sm text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg px-2 py-1 -mx-2"
                          >
                            <MapPin size={14} className="text-slate-400 shrink-0" />
                            {row.slot.classroom?.trim() || '點擊填寫'}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        {isFirstSlotOfRecord ? (
                          isEditingNote ? (
                            <div className="flex flex-col gap-2">
                              <textarea
                                value={tempNote}
                                onChange={(e) => setTempNote(e.target.value)}
                                placeholder="教材位置、聯絡方式等備註"
                                rows={2}
                                className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => saveNote(row.recordId)}
                                  className="text-indigo-600 text-sm font-medium hover:underline"
                                >
                                  儲存
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setEditingNoteRecordId(null); setTempNote(''); }}
                                  className="text-slate-500 text-sm hover:underline"
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditNote(row.record)}
                              className="flex items-start gap-1.5 text-left text-sm text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg px-2 py-1 -mx-2 w-full"
                            >
                              <MessageSquare size={14} className="text-slate-400 shrink-0 mt-0.5" />
                              <span className="line-clamp-2">{row.record.contactNoteForSubstitute?.trim() || '點擊填寫備註'}</span>
                            </button>
                          )
                        ) : (
                          <span className="text-slate-400 text-sm">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-600">
        <p className="font-medium text-slate-700 mb-1">說明</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>聯繫電話取自「教師管理」中該教師的電話欄位，請於教師管理維護。</li>
          <li>教室、備註可直接在表格中點擊填寫，供代課老師與請假老師對照使用。</li>
        </ul>
      </div>
    </div>
  );
}
