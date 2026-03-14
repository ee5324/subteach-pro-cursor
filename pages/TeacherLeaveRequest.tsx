/**
 * 教師請假申請（Vercel 表單）— 老師自行填寫，寫入 Firestore 待審，由外部申請頁匯入系統
 * 路由：#/teacher-request（公開，不需登入）
 */
import React, { useState, useMemo, useEffect } from 'react';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { FileText, Loader2, CheckCircle, ChevronLeft, ChevronRight, HelpCircle, Info, Printer } from 'lucide-react';
import { callGasApiViaProxy } from '../utils/api';

const PERIOD_ROWS = ['早', '1', '2', '3', '4', '午', '5', '6', '7'];
const SIMPLE_LEAVE_TYPES = ['公付', '身心假', '自理'] as const;
type SimpleLeaveType = (typeof SIMPLE_LEAVE_TYPES)[number];

const LEAVE_TYPE_OPTIONS: { value: SimpleLeaveType; label: string }[] = [
  { value: '公付', label: '公付（研習、公文派代等）' },
  { value: '身心假', label: '身心假（病假、身心調適等）' },
  { value: '自理', label: '自理（事假/其他，自行負責）' },
];

/** 假別適用情況簡述（依請假規則與常見實務） */
const LEAVE_TYPE_GUIDE = [
  { type: '公付', text: '公付：有公文且註明派代、或經學校核定之公務（研習、比賽、召集等）。實際假別與是否核准，由教學組依規定判斷。' },
  { type: '身心假', text: '身心假：身心調適、就醫、懷孕安胎等情形。實際歸類為病假、身心假等，由管理員依證明文件與規定處理。' },
  { type: '自理', text: '自理：一般事假、個人安排等不屬公務之情形。若有疑慮，請先詢問教學組再選擇。' },
];

type SlotDetail = { date: string; period: string; subject: string; className: string };

export default function TeacherLeaveRequest() {
  const [teacherName, setTeacherName] = useState('');
  const [leaveType, setLeaveType] = useState<SimpleLeaveType>('公付');
  const [docId, setDocId] = useState('');
  const [reason, setReason] = useState('');
  const [substituteMode, setSubstituteMode] = useState<'need_matching' | 'self_arranged'>('need_matching');
  const [substituteTeacher, setSubstituteTeacher] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [details, setDetails] = useState<SlotDetail[]>([]);
  const [weekIndex, setWeekIndex] = useState(0);
  const [editingCell, setEditingCell] = useState<{ date: string; period: string } | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editClassName, setEditClassName] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [showLeaveGuide, setShowLeaveGuide] = useState(false);
  const [scheduleLoadStatus, setScheduleLoadStatus] = useState<'idle' | 'loading' | 'ok' | 'empty' | 'error'>('idle');
  const [generatingForm, setGeneratingForm] = useState(false);

  const datesInRange = useMemo(() => {
    if (!startDate || !endDate) return [];
    const out: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const d = new Date(start);
    while (d <= end) {
      const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
      out.push(`${y}-${m}-${day}`);
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [startDate, endDate]);

  const weekdaysInRange = useMemo(() => datesInRange.filter((d) => [1, 2, 3, 4, 5].includes(new Date(d + 'T12:00:00').getDay())), [datesInRange]);

  const weeks = useMemo(() => {
    const w: string[][] = [];
    for (let i = 0; i < weekdaysInRange.length; i += 5) w.push(weekdaysInRange.slice(i, i + 5));
    return w;
  }, [weekdaysInRange]);

  const currentWeekDays = useMemo(() => weeks[weekIndex] || [], [weeks, weekIndex]);

  useEffect(() => {
    setScheduleLoadStatus('idle');
  }, [teacherName, startDate, endDate]);

  const getSlot = (date: string, period: string) => details.find((s) => s.date === date && s.period === period);

  const setSlot = (date: string, period: string, subject: string, className: string) => {
    setDetails((prev) => {
      const rest = prev.filter((s) => !(s.date === date && s.period === period));
      if (!subject.trim() && !className.trim()) return rest;
      return [...rest, { date, period, subject: subject.trim() || '未定', className: className.trim() || '未定' }];
    });
  };

  const handleSaveCell = () => {
    if (!editingCell) return;
    setSlot(editingCell.date, editingCell.period, editSubject, editClassName);
    setEditingCell(null);
    setEditSubject('');
    setEditClassName('');
  };

  const handleRemoveSlot = (date: string, period: string) => {
    setDetails((prev) => prev.filter((s) => !(s.date === date && s.period === period)));
    setEditingCell(null);
  };

  /** 依申請人姓名從公開課表帶入請假區間內之課表（比對姓名） */
  const handleLoadScheduleByName = async () => {
    const name = teacherName.trim();
    if (!name) {
      setError('請先填寫申請人姓名');
      return;
    }
    if (!startDate || !endDate) {
      setError('請先選擇開始日期與結束日期');
      return;
    }
    if (weekdaysInRange.length === 0) {
      setError('請假區間內無上課日（週一～五）');
      return;
    }
    setScheduleLoadStatus('loading');
    setError('');
    try {
      const ref = doc(db, 'publicTeacherSchedules', name);
      const snap = await getDoc(ref);
      const data = snap.data();
      const schedule: { day: number; period: string; subject?: string; className?: string }[] = data?.schedule ?? [];
      if (!Array.isArray(schedule) || schedule.length === 0) {
        setScheduleLoadStatus('empty');
        return;
      }
      const newDetails: SlotDetail[] = [];
      for (const dateStr of weekdaysInRange) {
        const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay(); // 0=Sun, 1=Mon, ..., 5=Fri
        if (dayOfWeek < 1 || dayOfWeek > 5) continue;
        for (const slot of schedule) {
          if (slot.day === dayOfWeek) {
            newDetails.push({
              date: dateStr,
              period: slot.period || '',
              subject: slot.subject?.trim() || '未定',
              className: slot.className?.trim() || '未定',
            });
          }
        }
      }
      setDetails(newDetails);
      setScheduleLoadStatus('ok');
    } catch (e) {
      setScheduleLoadStatus('error');
      setError('無法讀取課表，請稍後再試或手動填寫。');
    }
  };

  /** 產生代課單檔案（存於 Google Drive「教師自行申請代課單」資料夾，同師同日起迄會覆蓋舊檔） */
  const handlePrintForm = async () => {
    setError('');
    if (!teacherName.trim()) {
      setError('請填寫申請人姓名');
      return;
    }
    if (!reason.trim()) {
      setError('請填寫請假事由');
      return;
    }
    if (!startDate || !endDate) {
      setError('請選擇開始與結束日期');
      return;
    }
    const subName = substituteMode === 'self_arranged' ? substituteTeacher.trim() : '教學組媒合';
    if (substituteMode === 'self_arranged' && !subName) {
      setError('請輸入代課教師姓名');
      return;
    }
    const validDetails = details.filter((d) => d.date && d.period && d.subject.trim());
    if (validDetails.length === 0) {
      setError('請在下方週課表至少點選一節請假課務，並填寫科目、班級');
      return;
    }
    setGeneratingForm(true);
    try {
      const result = await callGasApiViaProxy('GENERATE_TEACHER_REQUEST_FORM', {
        teacherName: teacherName.trim(),
        leaveType,
        reason: reason.trim(),
        docId: docId.trim() || undefined,
        startDate,
        endDate,
        details: validDetails,
        substituteTeacher: subName,
        applicationDate: new Date().toISOString().slice(0, 10),
      });
      if (result?.data?.url) {
        window.open(String(result.data.url), '_blank');
      } else {
        setError('已產生但未取得連結，請至 Google Drive「教師自行申請代課單」資料夾查看。');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '產生代課單失敗，請稍後再試。');
    } finally {
      setGeneratingForm(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!teacherName.trim()) {
      setError('請填寫申請人姓名');
      return;
    }
    if (!reason.trim()) {
      setError('請填寫請假事由');
      return;
    }
    if (!startDate || !endDate) {
      setError('請選擇開始與結束日期');
      return;
    }
    const subName = substituteMode === 'self_arranged' ? substituteTeacher.trim() : '教學組媒合';
    if (substituteMode === 'self_arranged' && !subName) {
      setError('請輸入代課教師姓名');
      return;
    }
    const validDetails = details.filter((d) => d.date && d.period && d.subject.trim());
    if (validDetails.length === 0) {
      setError('請在下方週課表至少點選一節請假課務，並填寫科目、班級');
      return;
    }
    if (!db) {
      setError('系統未初始化，請稍後再試。');
      return;
    }
    setLoading(true);
    try {
      await addDoc(collection(db, 'teacherLeaveRequests'), {
        teacherName: teacherName.trim(),
        leaveType,
        ...(docId.trim() ? { docId: docId.trim() } : {}),
        reason: reason.trim(),
        payType: '鐘點費',
        substituteTeacher: subName,
        startDate,
        endDate,
        details: validDetails,
        status: 'pending',
        createdAt: Date.now(),
      });
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '送出失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">申請已送出</h2>
          <p className="text-slate-600 text-sm mb-6">教學組將審核後匯入系統，請靜候通知。</p>
          <button
            type="button"
            onClick={() => { setSent(false); setTeacherName(''); setReason(''); setDetails([]); setStartDate(''); setEndDate(''); }}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
          >
            再填一筆
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 px-4 py-6 max-w-4xl mx-auto pb-24">
      <header className="mb-6 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center">
          <FileText className="mr-3 text-indigo-600" size={28} />
          教師請假申請
        </h1>
        <p className="text-slate-500 text-sm mt-1">填寫並送出代課需求，由教學組審核後匯入系統。</p>
      </header>

      {/* 填寫說明 */}
      <section className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h3 className="font-bold text-amber-900 flex items-center mb-2">
          <HelpCircle size={18} className="mr-2" />
          填寫說明
        </h3>
        <ol className="text-sm text-amber-900 list-decimal list-inside space-y-1">
          <li>請先填寫基本資料（申請人、假別、事由、請假區間）與代課安排。</li>
          <li>在「週課表」中點選請假當日、當節的格子，依序填寫科目與班級；可切換週次填寫多日。</li>
          <li>若學校已建置您的課表，審核時教學組可代為帶入；或請於週課表內手動點選節次並填寫。</li>
          <li>送出後請靜候教學組審核，必要時將與您聯繫確認。</li>
        </ol>
      </section>

      {/* 假別適用情況 */}
      <section className="mb-6 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowLeaveGuide(!showLeaveGuide)}
          className="w-full px-5 py-4 flex items-center justify-between text-left font-bold text-slate-800 bg-slate-50 hover:bg-slate-100"
        >
          <span className="flex items-center"><Info size={18} className="mr-2 text-indigo-600" />假別適用情況</span>
          <span className="text-slate-400 text-sm font-normal">{showLeaveGuide ? '收合' : '展開'}</span>
        </button>
        {showLeaveGuide && (
          <div className="px-5 py-4 border-t border-slate-200 text-sm text-slate-700 space-y-3">
            {LEAVE_TYPE_GUIDE.map((g) => (
              <p key={g.type}><strong className="text-slate-800">{g.type}</strong>：{g.text}</p>
            ))}
            <p className="text-slate-500 text-xs mt-2">詳細日數與條件請參照校內「請假規則」或人事相關規定。</p>
          </div>
        )}
      </section>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-4">基本資料</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">申請人姓名 *</label>
              <input type="text" value={teacherName} onChange={(e) => setTeacherName(e.target.value)} required className="w-full px-3 py-2 border border-slate-200 rounded-lg" placeholder="請輸入姓名" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">假別 *</label>
              <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg">
                {LEAVE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-600 mb-1">公文文號（選填）</label>
              <input type="text" value={docId} onChange={(e) => setDocId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg" placeholder="例：高市教小字第..." />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-600 mb-1">請假事由 *</label>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} required className="w-full px-3 py-2 border border-slate-200 rounded-lg" placeholder="例：參加語文競賽研習" />
            </div>
          </div>
        </section>

        <section className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-4">代課安排與請假區間</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">代課教師</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input type="radio" name="subMode" checked={substituteMode === 'need_matching'} onChange={() => setSubstituteMode('need_matching')} />
                  <span>請教學組協助媒合（待聘）</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="subMode" checked={substituteMode === 'self_arranged'} onChange={() => setSubstituteMode('self_arranged')} />
                  <span>已自行聯絡代課教師</span>
                </label>
                {substituteMode === 'self_arranged' && (
                  <input type="text" value={substituteTeacher} onChange={(e) => setSubstituteTeacher(e.target.value)} placeholder="代課教師姓名" className="ml-6 w-full max-w-xs px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">開始日期 *</label>
                <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setWeekIndex(0); }} required className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">結束日期 *</label>
                <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setWeekIndex(0); }} required className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
              </div>
            </div>
          </div>
        </section>

        {/* 週課表：務必顯示區塊，未選日期時顯示提示 */}
        <section className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-3">週課表（點選請假節次並填寫科目、班級）</h3>
          {!startDate || !endDate ? (
            <p className="text-amber-700 text-sm py-6 px-4 bg-amber-50 border border-amber-200 rounded-lg">
              請先在上方選擇「開始日期」與「結束日期」，週課表將顯示於此，再點選請假節次填寫科目、班級。
            </p>
          ) : weeks.length === 0 ? (
            <p className="text-slate-500 text-sm py-4">請假區間內無上課日（週一～五），請調整日期。</p>
          ) : (
              <>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <button
                    type="button"
                    onClick={handleLoadScheduleByName}
                    disabled={scheduleLoadStatus === 'loading' || !teacherName.trim()}
                    className="px-4 py-2 rounded-lg bg-indigo-100 text-indigo-800 hover:bg-indigo-200 disabled:opacity-50 text-sm font-medium flex items-center gap-2"
                  >
                    {scheduleLoadStatus === 'loading' ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : null}
                    依姓名帶入課表
                  </button>
                  {scheduleLoadStatus === 'ok' && <span className="text-sm text-green-600">已帶入課表</span>}
                  {scheduleLoadStatus === 'empty' && (
                    <span className="text-sm text-amber-600">
                      查無該姓名之課表，請手動填寫。
                      {teacherName.trim() && (
                        <span className="block mt-1 text-xs text-slate-500">
                          若已於後台「教師管理」建置課表，請由管理員在該頁點選「同步課表至公開查詢」後再試。
                        </span>
                      )}
                    </span>
                  )}
                  {scheduleLoadStatus === 'error' && <span className="text-sm text-red-600">讀取失敗</span>}
                </div>
                <div className="flex items-center justify-between mb-3 bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <button type="button" onClick={() => setWeekIndex((i) => Math.max(0, i - 1))} disabled={weekIndex <= 0} className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-40">
                    <ChevronLeft size={20} />
                  </button>
                  <span className="text-sm font-bold text-slate-700">
                    {currentWeekDays[0]} ~ {currentWeekDays[currentWeekDays.length - 1]}
                  </span>
                  <button type="button" onClick={() => setWeekIndex((i) => Math.min(weeks.length - 1, i + 1))} disabled={weekIndex >= weeks.length - 1} className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-40">
                    <ChevronRight size={20} />
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-center border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="p-2 border-b border-r border-slate-200 bg-slate-100 font-bold text-slate-600 w-12">節</th>
                        {currentWeekDays.map((d) => {
                          const day = new Date(d + 'T12:00:00');
                          const wd = ['日','一','二','三','四','五','六'][day.getDay()];
                          return (
                            <th key={d} className="p-2 border-b border-r border-slate-200 bg-slate-50 font-bold text-slate-700 min-w-[72px]">
                              {wd}<br /><span className="text-xs font-normal text-slate-500">{d.slice(5)}</span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {PERIOD_ROWS.map((period) => (
                        <tr key={period}>
                          <td className="p-1 border-b border-r border-slate-200 bg-slate-50 font-bold text-slate-600">{period}</td>
                          {currentWeekDays.map((date) => {
                            const slot = getSlot(date, period);
                            const isEditing = editingCell?.date === date && editingCell?.period === period;
                            return (
                              <td key={`${date}-${period}`} className="p-1 border-b border-r border-slate-200 align-top min-h-[52px]">
                                {isEditing ? (
                                  <div className="bg-indigo-50 rounded p-2 space-y-1">
                                    <input type="text" value={editSubject} onChange={(e) => setEditSubject(e.target.value)} placeholder="科目" className="w-full px-2 py-1 border border-slate-200 rounded text-xs" autoFocus />
                                    <input type="text" value={editClassName} onChange={(e) => setEditClassName(e.target.value)} placeholder="班級" className="w-full px-2 py-1 border border-slate-200 rounded text-xs" />
                                    <div className="flex gap-1 mt-1">
                                      <button type="button" onClick={handleSaveCell} className="flex-1 py-1 bg-indigo-600 text-white rounded text-xs">確定</button>
                                      <button type="button" onClick={() => handleRemoveSlot(date, period)} className="py-1 px-2 text-slate-500 hover:text-rose-600 text-xs">刪</button>
                                    </div>
                                  </div>
                                ) : slot ? (
                                  <button
                                    type="button"
                                    onClick={() => { setEditingCell({ date, period }); setEditSubject(slot.subject); setEditClassName(slot.className); }}
                                    className="w-full min-h-[48px] rounded bg-indigo-100 border border-indigo-200 text-indigo-800 text-xs p-1 hover:ring-2 hover:ring-indigo-300"
                                  >
                                    <div className="font-bold truncate">{slot.subject}</div>
                                    <div className="truncate opacity-80">{slot.className}</div>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => { setEditingCell({ date, period }); setEditSubject(''); setEditClassName(''); }}
                                    className="w-full min-h-[48px] rounded border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/50 text-lg"
                                  >
                                    ＋
                                  </button>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-500 mt-2">已填節數：{details.length} 節</p>
              </>
          )}
        </section>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handlePrintForm}
            disabled={generatingForm}
            className="flex-1 py-3 bg-cyan-600 text-white rounded-xl font-bold hover:bg-cyan-700 disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {generatingForm ? <Loader2 size={20} className="animate-spin" /> : <Printer size={20} />}
            {generatingForm ? '產生中...' : '列印／產生代課單'}
          </button>
          <button type="submit" disabled={loading} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-70 flex items-center justify-center gap-2">
            {loading ? <Loader2 size={20} className="animate-spin" /> : null}
            {loading ? '送出中...' : '送出申請'}
          </button>
        </div>
        <p className="text-xs text-slate-500 text-center">
          代課單會存於 Google Drive「教師自行申請代課單」資料夾；同一教師、同一請假起始日再次產生時會覆蓋舊檔。
        </p>
      </form>
    </div>
  );
}
