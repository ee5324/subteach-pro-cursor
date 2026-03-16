/**
 * 代課聯絡資訊交換
 * 僅在「添加」時列出項目，渲染為可列印的雙方通知單。
 */
import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Phone, MapPin, MessageSquare, Plus, Trash2, Printer, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { LeaveRecord, TimetableSlot } from '../types';

interface ContactRow {
  key: string;
  recordId: string;
  record: LeaveRecord;
  slot: TimetableSlot;
  originalTeacherName: string;
  originalTeacherPhone: string;
  substituteTeacherName: string;
  substituteTeacherPhone: string;
}

const getDefaultMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const addMonths = (ym: string, delta: number): string => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function SubstituteContactExchange() {
  const { records, teachers, updateRecord } = useAppStore();
  const [selectedMonth, setSelectedMonth] = useState(getDefaultMonth);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());
  const [searchKeyword, setSearchKeyword] = useState('');
  const [noticeSearchKeyword, setNoticeSearchKeyword] = useState('');
  const [editingSlot, setEditingSlot] = useState<{ recordId: string; date: string; period: string } | null>(null);
  const [editingNoteRecordId, setEditingNoteRecordId] = useState<string | null>(null);
  const [tempClassroom, setTempClassroom] = useState('');
  const [tempNote, setTempNote] = useState('');

  const allRows = useMemo((): ContactRow[] => {
    const out: ContactRow[] = [];
    records.forEach((record) => {
      if (!record.slots) return;
      const originalTeacher = teachers.find((t) => t.id === record.originalTeacherId);
      record.slots.forEach((slot) => {
        if (!slot.substituteTeacherId) return;
        const substituteTeacher = teachers.find((t) => t.id === slot.substituteTeacherId);
        out.push({
          key: `${record.id}_${slot.date}_${slot.period}`,
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

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const monthFilteredRows = useMemo(
    () => allRows.filter((r) => r.slot.date.startsWith(selectedMonth) && r.slot.date >= today),
    [allRows, selectedMonth, today]
  );

  type ContactGroup = {
    groupKey: string;
    date: string;
    record: LeaveRecord;
    originalTeacherName: string;
    originalTeacherPhone: string;
    substituteTeacherName: string;
    substituteTeacherPhone: string;
    rows: ContactRow[];
  };

  const monthFilteredGroups = useMemo((): ContactGroup[] => {
    const map = new Map<string, ContactRow[]>();
    monthFilteredRows.forEach((row) => {
      const gk = `${row.recordId}_${row.slot.substituteTeacherId}_${row.slot.date}`;
      if (!map.has(gk)) map.set(gk, []);
      map.get(gk)!.push(row);
    });
    return Array.from(map.entries()).map(([groupKey, rows]) => {
      const r = rows[0];
      return {
        groupKey,
        date: r.slot.date,
        record: r.record,
        originalTeacherName: r.originalTeacherName,
        originalTeacherPhone: r.originalTeacherPhone,
        substituteTeacherName: r.substituteTeacherName,
        substituteTeacherPhone: r.substituteTeacherPhone,
        rows: rows.sort((a, b) => String(a.slot.period).localeCompare(String(b.slot.period))),
      };
    });
  }, [monthFilteredRows]);

  const availableGroups = useMemo(
    () => monthFilteredGroups.filter((g) => g.rows.some((r) => !addedKeys.has(r.key))),
    [monthFilteredGroups, addedKeys]
  );

  const keywordLower = searchKeyword.trim().toLowerCase();
  const filteredAvailableGroups = useMemo(() => {
    if (!keywordLower) return availableGroups;
    return availableGroups.filter((g) => {
      const text = [
        g.date,
        g.rows.map((r) => r.slot.period).join(' '),
        g.originalTeacherName,
        g.substituteTeacherName,
        g.rows.map((r) => r.slot.subject).join(' '),
        g.rows.map((r) => r.slot.className).join(' '),
      ].join(' ').toLowerCase();
      return text.includes(keywordLower);
    });
  }, [availableGroups, keywordLower]);

  const addGroupToNotice = (group: ContactGroup) =>
    setAddedKeys((prev) => {
      const next = new Set(prev);
      group.rows.forEach((r) => next.add(r.key));
      return next;
    });

  const addedRows = useMemo(() => allRows.filter((r) => addedKeys.has(r.key)), [allRows, addedKeys]);

  const addedGroups = useMemo((): ContactGroup[] => {
    const map = new Map<string, ContactRow[]>();
    addedRows.forEach((row) => {
      const gk = `${row.recordId}_${row.slot.substituteTeacherId}_${row.slot.date}`;
      if (!map.has(gk)) map.set(gk, []);
      map.get(gk)!.push(row);
    });
    return Array.from(map.entries()).map(([groupKey, rows]) => {
      const r = rows[0];
      return {
        groupKey,
        date: r.slot.date,
        record: r.record,
        originalTeacherName: r.originalTeacherName,
        originalTeacherPhone: r.originalTeacherPhone,
        substituteTeacherName: r.substituteTeacherName,
        substituteTeacherPhone: r.substituteTeacherPhone,
        rows: rows.sort((a, b) => String(a.slot.period).localeCompare(String(b.slot.period))),
      };
    });
  }, [addedRows]);

  const noticeKeywordLower = noticeSearchKeyword.trim().toLowerCase();
  const filteredAddedGroups = useMemo(() => {
    if (!noticeKeywordLower) return addedGroups;
    return addedGroups.filter((g) => {
      const text = [
        g.date,
        g.rows.map((r) => r.slot.period).join(' '),
        g.originalTeacherName,
        g.substituteTeacherName,
        g.rows.map((r) => r.slot.subject).join(' '),
        g.rows.map((r) => r.slot.className).join(' '),
      ].join(' ').toLowerCase();
      return text.includes(noticeKeywordLower);
    });
  }, [addedGroups, noticeKeywordLower]);

  const removeGroupFromNotice = (group: ContactGroup) =>
    setAddedKeys((prev) => {
      const next = new Set(prev);
      group.rows.forEach((r) => next.delete(r.key));
      return next;
    });

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

  const handlePrint = () => window.print();

  return (
    <div className="p-8 pb-24">
      <header className="mb-6 print:hidden">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
          <MessageSquare className="text-indigo-600" size={28} />
          代課聯絡資訊交換
        </h1>
        <p className="text-slate-500 mt-2">
          將要列印的項目加入下方「通知單」，再列印成雙方通知單。介面僅顯示您已添加的項目，保持簡潔。
        </p>
      </header>

      {/* 可加入的項目：僅在未加入時顯示，簡潔列表 */}
      {allRows.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-12 text-center print:hidden">
          <p className="text-slate-600 font-medium">目前沒有已派代的代課節次</p>
          <p className="text-slate-500 text-sm mt-1">待派代完成後，可於此處加入並列印聯絡通知單。</p>
        </div>
      ) : (
        <>
          <section className="mb-8 print:hidden">
            <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Plus size={16} /> 加入至通知單
            </h2>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <div className="flex items-center gap-1 border border-slate-200 rounded-lg overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setSelectedMonth(addMonths(selectedMonth, -1))}
                  className="p-2 text-slate-600 hover:bg-slate-100 transition-colors"
                  title="上一個月"
                >
                  <ChevronLeft size={20} />
                </button>
                <label className="flex items-center border-x border-slate-200">
                  <span className="sr-only">篩選年月</span>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none min-w-[140px]"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
                  className="p-2 text-slate-600 hover:bg-slate-100 transition-colors"
                  title="下一個月"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
              <span className="text-slate-500 text-sm">
                {selectedMonth} 共 {monthFilteredGroups.length} 筆（同一老師同一天一筆，僅顯示今日及之後）
              </span>
            </div>
            <p className="text-slate-500 text-sm mb-3">點「加入」後，該筆會出現在下方通知單並可列印。</p>
            <div className="relative mb-3">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜尋日期、節次、請假老師、代課老師、科目、班級..."
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
              {searchKeyword.trim() && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  共 {filteredAvailableGroups.length} 筆
                </span>
              )}
            </div>
            <ul className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-xl bg-white p-3">
              {monthFilteredGroups.length === 0 ? (
                <li className="text-slate-400 text-sm py-2">此月份沒有已派代的代課節次，請切換其他年月。</li>
              ) : availableGroups.length === 0 ? (
                <li className="text-slate-400 text-sm py-2">此月份已全部加入；可從下方通知單移除後再重新加入。</li>
              ) : filteredAvailableGroups.length === 0 ? (
                <li className="text-slate-400 text-sm py-2">沒有符合「{searchKeyword.trim()}」的項目。</li>
              ) : (
                filteredAvailableGroups.map((group) => (
                  <li
                    key={group.groupKey}
                    className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg hover:bg-slate-50 text-sm"
                  >
                    <span className="text-slate-600">
                      <span className="font-medium text-slate-800">{group.date}</span>
                      <span className="text-slate-400 mx-1">·</span>
                      {group.rows.map((r) => periodLabel(r.slot.period)).join('、')}
                      <span className="text-slate-400 mx-1">·</span>
                      {group.originalTeacherName} → {group.substituteTeacherName}
                      <span className="text-slate-400 mx-1">·</span>
                      {group.rows.length} 節
                    </span>
                    <button
                      type="button"
                      onClick={() => addGroupToNotice(group)}
                      className="shrink-0 text-indigo-600 hover:text-indigo-800 font-medium text-sm flex items-center gap-1"
                    >
                      <Plus size={14} /> 加入
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>

          {/* 通知單內容（僅顯示已添加，可列印） */}
          <section className={addedRows.length === 0 ? 'print:hidden' : ''}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 print:hidden">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wide flex items-center gap-2">
                  通知單（共 {addedGroups.length} 筆）
                </h2>
                {addedGroups.length > 0 && (
                  <div className="relative flex-1 min-w-[180px] max-w-xs">
                    <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={noticeSearchKeyword}
                      onChange={(e) => setNoticeSearchKeyword(e.target.value)}
                      placeholder="搜尋通知單..."
                      className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handlePrint}
                disabled={addedGroups.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Printer size={18} /> 列印雙方通知單
              </button>
            </div>

            {addedGroups.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-sm print:hidden">
                尚未加入任何項目，請從上方「加入至通知單」加入後再列印。
              </div>
            ) : (
              <div className="print-area space-y-6">
                {(noticeKeywordLower ? filteredAddedGroups : addedGroups).map((group) => {
                  const first = group.rows[0];
                  const isEditingClassroom =
                    editingSlot?.recordId === first.recordId &&
                    editingSlot?.date === first.slot.date &&
                    editingSlot?.period === first.slot.period;
                  const isEditingNote = editingNoteRecordId === group.record.id;
                  const periodsText = group.rows.map((r) => periodLabel(r.slot.period)).join('、');
                  const subjectClassText = group.rows.length === 1
                    ? `${first.slot.subject} · ${first.slot.className}`
                    : `${first.slot.subject} · ${first.slot.className} 等${group.rows.length}節`;
                  const classroomDisplay = group.rows.length === 1
                    ? (first.slot.classroom?.trim() || '—')
                    : (first.slot.classroom?.trim() || '—');
                  return (
                    <div
                      key={group.groupKey}
                      className="a4-notice bg-white border-2 border-slate-200 rounded-2xl shadow-sm overflow-hidden print:shadow-none print:break-inside-avoid"
                    >
                      <div className="flex justify-between items-start gap-2 p-3 bg-slate-50 border-b border-slate-200 print:bg-white print:border-b print:hidden">
                        <span className="text-xs text-slate-500">
                          {group.date} {periodsText} · {group.originalTeacherName} → {group.substituteTeacherName}（{group.rows.length} 節）
                        </span>
                        <button
                          type="button"
                          onClick={() => removeGroupFromNotice(group)}
                          className="text-slate-400 hover:text-red-600 p-1"
                          title="從通知單移除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="p-5 print:p-4">
                        <h3 className="text-center font-bold text-slate-800 text-lg mb-4 print:text-base">
                          代課聯絡通知單
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2 print:gap-4">
                          <div className="border border-slate-200 rounded-xl p-4 print:rounded-lg">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">給請假老師（{group.originalTeacherName}）</div>
                            <p className="text-sm text-slate-600 mb-1">
                              <strong>代課老師：</strong>{group.substituteTeacherName}
                            </p>
                            <p className="text-sm text-slate-600 mb-1 flex items-center gap-1">
                              <Phone size={12} /> {group.substituteTeacherPhone}
                            </p>
                            <p className="text-sm text-slate-600 mt-2">
                              <strong>日期／節次：</strong>{group.date} {periodsText}
                            </p>
                            <p className="text-sm text-slate-600">
                              <strong>科目／班級：</strong>{subjectClassText}
                            </p>
                            <p className="text-sm text-slate-600 mt-1">
                              <strong>教室：</strong>
                              {isEditingClassroom ? (
                                <span className="inline-flex items-center gap-2 mt-1">
                                  <input
                                    type="text"
                                    value={tempClassroom}
                                    onChange={(e) => setTempClassroom(e.target.value)}
                                    placeholder="教室"
                                    className="w-28 px-2 py-1 border border-slate-300 rounded text-sm"
                                    autoFocus
                                  />
                                  <button type="button" onClick={() => saveClassroom(first.recordId, first.slot.date, first.slot.period)} className="text-indigo-600 text-xs">儲存</button>
                                  <button type="button" onClick={() => { setEditingSlot(null); setTempClassroom(''); }} className="text-slate-500 text-xs">取消</button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startEditClassroom(first)}
                                  className="inline-flex items-center gap-1 text-slate-600 hover:text-indigo-600 print:no-underline"
                                >
                                  <MapPin size={12} /> {first.slot.classroom?.trim() || '點擊填寫'}
                                </button>
                              )}
                            </p>
                            <p className="text-sm text-slate-600 mt-1">
                              <strong>備註：</strong>
                              {isEditingNote ? (
                                <span className="block mt-1">
                                  <textarea
                                    value={tempNote}
                                    onChange={(e) => setTempNote(e.target.value)}
                                    placeholder="教材、聯絡方式等"
                                    rows={2}
                                    className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                                    autoFocus
                                  />
                                  <span className="flex gap-2 mt-1">
                                    <button type="button" onClick={() => saveNote(group.record.id)} className="text-indigo-600 text-xs">儲存</button>
                                    <button type="button" onClick={() => { setEditingNoteRecordId(null); setTempNote(''); }} className="text-slate-500 text-xs">取消</button>
                                  </span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startEditNote(group.record)}
                                  className="inline-flex items-start gap-1 text-left text-slate-600 hover:text-indigo-600 print:no-underline"
                                >
                                  <MessageSquare size={12} className="shrink-0 mt-0.5" />
                                  <span>{group.record.contactNoteForSubstitute?.trim() || '點擊填寫'}</span>
                                </button>
                              )}
                            </p>
                          </div>
                          <div className="border border-slate-200 rounded-xl p-4 print:rounded-lg">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">給代課老師（{group.substituteTeacherName}）</div>
                            <p className="text-sm text-slate-600 mb-1">
                              <strong>請假老師：</strong>{group.originalTeacherName}
                            </p>
                            <p className="text-sm text-slate-600 mb-1 flex items-center gap-1">
                              <Phone size={12} /> {group.originalTeacherPhone}
                            </p>
                            <p className="text-sm text-slate-600 mt-2">
                              <strong>日期／節次：</strong>{group.date} {periodsText}
                            </p>
                            <p className="text-sm text-slate-600">
                              <strong>科目／班級：</strong>{subjectClassText}
                            </p>
                            <p className="text-sm text-slate-600 mt-1">
                              <strong>教室：</strong>{classroomDisplay}
                            </p>
                            <p className="text-sm text-slate-600 mt-1">
                              <strong>備註：</strong>{group.record.contactNoteForSubstitute?.trim() || '—'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-600 print:hidden">
        <p className="font-medium text-slate-700 mb-1">說明</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>僅顯示您「加入至通知單」的項目，介面簡潔。列印時僅輸出已加入的通知單。</li>
          <li>聯繫電話取自「教師管理」；教室、備註可於通知單上直接點擊填寫。</li>
        </ul>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
          .print-area .a4-notice {
            width: 100%;
            min-height: 273mm;
            box-sizing: border-box;
            break-after: page;
            page-break-after: always;
          }
          .print-area .a4-notice:last-child { break-after: auto; page-break-after: auto; }
          .print-area .print\\:break-inside-avoid { break-inside: avoid; }
          .print-area .print\\:shadow-none { box-shadow: none; }
          .print-area .print\\:bg-white { background: white; }
        }
      `}</style>
    </div>
  );
}
