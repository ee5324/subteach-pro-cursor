/**
 * 教師請假申請（Vercel 表單）— 老師自行填寫，寫入 Firestore 待審，由「教師自行申請假單」頁匯入系統
 * 路由：#/teacher-request（公開，不需登入）
 */
import React, { useState, useMemo, useEffect } from 'react';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { FileText, Loader2, CheckCircle, ChevronLeft, ChevronRight, HelpCircle, Info } from 'lucide-react';
import { TEACHER_REQUEST_LEAVE_TYPES, type TeacherRequestLeaveType } from '../types';

const PERIOD_ROWS = ['早', '1', '2', '3', '4', '午', '5', '6', '7'];

/** 公開表單假別說明（與 TEACHER_REQUEST_LEAVE_TYPES 順序一致） */
const LEAVE_TYPE_GUIDE: { type: TeacherRequestLeaveType; text: string }[] = [
  { type: '公假派帶(研習、帶隊參賽等，需檢附公文)', text: '研習、帶隊參賽、公務派代等，請檢附公文；匯入系統後對應「公付 (公假)」，教學組可再調整。' },
  { type: '身心調適假(無需公文，每年三天)', text: '依校內規定之身心調適假（每年三天等）；無需公文。匯入後對應「公付 (身心)」，教學組可再調整。' },
  { type: '自理(事病假等)', text: '事假、病假等由個人負擔或依校規辦理者。匯入後對應「自理 (事假/病假)」。' },
  { type: '公假(喪產等)', text: '喪假、產假等法定或校定公假。匯入後對應「公付 (喪病產等)」。' },
  { type: '其他假別', text: '未列於上列者請選此並於事由說明；匯入後暫對應「公付 (其他事務費)」，請教學組於主系統代課單改為正確假別。' },
];

const REQUIRES_DOC_LEAVE: TeacherRequestLeaveType = '公假派帶(研習、帶隊參賽等，需檢附公文)';

type SlotDetail = { date: string; period: string; subject: string; className: string };

export default function TeacherLeaveRequest() {
  const [teacherName, setTeacherName] = useState('');
  const [leaveType, setLeaveType] = useState<TeacherRequestLeaveType>(TEACHER_REQUEST_LEAVE_TYPES[0]);
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

  /** 自動載入課表 effect 用（避免陣列參考變動造成重複請求） */
  const weekdaysKey = useMemo(() => weekdaysInRange.join(','), [weekdaysInRange]);

  const weeks = useMemo(() => {
    const w: string[][] = [];
    for (let i = 0; i < weekdaysInRange.length; i += 5) w.push(weekdaysInRange.slice(i, i + 5));
    return w;
  }, [weekdaysInRange]);

  const currentWeekDays = useMemo(() => weeks[weekIndex] || [], [weeks, weekIndex]);

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

  /**
   * 依申請人姓名從公開課表帶入請假區間內之課表（比對姓名）
   * @param showErrors 手動按鈕時顯示欄位提示；自動載入時為 false
   * @param isStale 回傳 true 時略過寫入 state（避免快速改日期造成舊請求覆蓋）
   */
  const performScheduleLoad = async (showErrors: boolean, isStale?: () => boolean) => {
    const name = teacherName.trim();
    if (!name) {
      if (showErrors) setError('請先填寫申請人姓名');
      return;
    }
    if (!startDate || !endDate) {
      if (showErrors) setError('請先選擇開始日期與結束日期');
      return;
    }
    if (weekdaysInRange.length === 0) {
      if (showErrors) setError('請假區間內無上課日（週一～五）');
      return;
    }
    if (!db) {
      if (showErrors) setError('系統未初始化，請稍後再試。');
      return;
    }
    setScheduleLoadStatus('loading');
    if (showErrors) setError('');
    try {
      const ref = doc(db, 'publicTeacherSchedules', name);
      const snap = await getDoc(ref);
      if (isStale?.()) return;
      const data = snap.data();
      const schedule: { day: number; period: string; subject?: string; className?: string }[] = data?.schedule ?? [];
      if (!Array.isArray(schedule) || schedule.length === 0) {
        setScheduleLoadStatus('empty');
        return;
      }
      const newDetails: SlotDetail[] = [];
      for (const dateStr of weekdaysInRange) {
        const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay();
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
      if (isStale?.()) return;
      setDetails(newDetails);
      setScheduleLoadStatus('ok');
    } catch {
      if (!isStale?.()) {
        setScheduleLoadStatus('error');
        if (showErrors) setError('無法讀取課表，請稍後再試或手動填寫。');
      }
    }
  };

  /** 填妥姓名與請假日期後自動帶入課表（debounce，無需再按按鈕） */
  useEffect(() => {
    const name = teacherName.trim();
    if (!name || !startDate || !endDate || weekdaysInRange.length === 0) {
      setScheduleLoadStatus('idle');
      return;
    }
    if (!db) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void performScheduleLoad(false, () => cancelled);
    }, 480);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- weekdaysKey 與 weekdaysInRange 內容同步；納入 performScheduleLoad 會造成不必要重綁
  }, [teacherName, startDate, endDate, weekdaysKey]);

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
    if (leaveType === REQUIRES_DOC_LEAVE && !docId.trim()) {
      setError('此假別須檢附公文，請填寫「公文文號」');
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
            onClick={() => {
              setSent(false);
              setTeacherName('');
              setLeaveType(TEACHER_REQUEST_LEAVE_TYPES[0]);
              setDocId('');
              setReason('');
              setDetails([]);
              setStartDate('');
              setEndDate('');
            }}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
          >
            再填一筆
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 px-3 sm:px-4 py-4 sm:py-6 max-w-4xl mx-auto pb-28 sm:pb-24 [padding-bottom:max(7rem,env(safe-area-inset-bottom,0px))]">
      <header className="mb-4 sm:mb-6 bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-slate-200">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center">
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
          <li>請先填寫基本資料（申請人、假別、事由、請假區間）與代課安排。選「公假派帶…」時須填寫公文文號。</li>
          <li>填妥<strong>申請人姓名</strong>與<strong>請假起訖日</strong>後，系統會自動從公開課表帶入週課表（無須再按按鈕）；若查無課表請手動點選節次填寫。</li>
          <li>在「週課表」中可點選格子修改科目、班級；可切換週次填寫多日。</li>
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
              <p key={g.type} className="break-words"><strong className="text-slate-800">{g.type}</strong>：{g.text}</p>
            ))}
            <p className="text-slate-500 text-xs mt-2">詳細日數與條件請參照校內「請假規則」或人事相關規定。</p>
          </div>
        )}
      </section>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-3 sm:mb-4 text-base sm:text-lg">基本資料</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">申請人姓名 *</label>
              <input type="text" value={teacherName} onChange={(e) => setTeacherName(e.target.value)} required className="w-full min-h-[44px] px-3 py-2.5 text-base border border-slate-200 rounded-lg touch-manipulation" placeholder="請輸入姓名" autoComplete="name" enterKeyHint="next" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">假別 *</label>
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value as TeacherRequestLeaveType)}
                className="w-full min-h-[44px] px-3 py-2.5 text-base border border-slate-200 rounded-lg touch-manipulation bg-white"
              >
                {TEACHER_REQUEST_LEAVE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                公文文號{leaveType === REQUIRES_DOC_LEAVE ? <span className="text-rose-600"> *</span> : '（選填）'}
              </label>
              <input
                type="text"
                value={docId}
                onChange={(e) => setDocId(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2.5 text-base border border-slate-200 rounded-lg touch-manipulation"
                placeholder={leaveType === REQUIRES_DOC_LEAVE ? '此假別必填公文文號' : '例：高市教小字第...'}
                required={leaveType === REQUIRES_DOC_LEAVE}
                enterKeyHint="next"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-600 mb-1.5">請假事由 *</label>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} required className="w-full min-h-[44px] px-3 py-2.5 text-base border border-slate-200 rounded-lg touch-manipulation" placeholder="例：參加語文競賽研習" enterKeyHint="next" />
            </div>
          </div>
        </section>

        <section className="bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-3 sm:mb-4 text-base sm:text-lg">代課安排與請假區間</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">代課教師</label>
              <div className="space-y-3">
                <label className="flex items-start gap-3 min-h-[44px] py-1 touch-manipulation cursor-pointer">
                  <input type="radio" name="subMode" checked={substituteMode === 'need_matching'} onChange={() => setSubstituteMode('need_matching')} className="mt-1 w-[18px] h-[18px] shrink-0" />
                  <span className="text-base text-slate-800 leading-snug">請教學組協助媒合（待聘）</span>
                </label>
                <label className="flex items-start gap-3 min-h-[44px] py-1 touch-manipulation cursor-pointer">
                  <input type="radio" name="subMode" checked={substituteMode === 'self_arranged'} onChange={() => setSubstituteMode('self_arranged')} className="mt-1 w-[18px] h-[18px] shrink-0" />
                  <span className="text-base text-slate-800 leading-snug">已自行聯絡代課教師</span>
                </label>
                {substituteMode === 'self_arranged' && (
                  <input type="text" value={substituteTeacher} onChange={(e) => setSubstituteTeacher(e.target.value)} placeholder="代課教師姓名" className="w-full sm:ml-8 min-h-[44px] px-3 py-2.5 text-base border border-slate-200 rounded-lg touch-manipulation max-w-full sm:max-w-md" enterKeyHint="next" />
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">開始日期 *</label>
                <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setWeekIndex(0); }} required className="w-full min-h-[44px] px-3 py-2 text-base border border-slate-200 rounded-lg touch-manipulation" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">結束日期 *</label>
                <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setWeekIndex(0); }} required className="w-full min-h-[44px] px-3 py-2 text-base border border-slate-200 rounded-lg touch-manipulation" />
              </div>
            </div>
          </div>
        </section>

        {/* 週課表：務必顯示區塊，未選日期時顯示提示 */}
        <section className="bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-2 text-base sm:text-lg leading-snug">週課表（點選節次可修改科目、班級）</h3>
          <p className="text-xs sm:text-sm text-slate-500 mb-3">姓名與請假日期填妥後會自動載入課表；若無資料請手動點「＋」新增。</p>
          {!startDate || !endDate ? (
            <p className="text-amber-700 text-sm py-6 px-4 bg-amber-50 border border-amber-200 rounded-lg">
              請先在上方選擇「開始日期」與「結束日期」，週課表將顯示於此，再點選請假節次填寫科目、班級。
            </p>
          ) : weeks.length === 0 ? (
            <p className="text-slate-500 text-sm py-4">請假區間內無上課日（週一～五），請調整日期。</p>
          ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3 min-h-[40px]">
                  {scheduleLoadStatus === 'loading' && (
                    <span className="text-sm text-indigo-600 flex items-center gap-2">
                      <Loader2 className="animate-spin shrink-0" size={18} />
                      載入課表中…
                    </span>
                  )}
                  {scheduleLoadStatus === 'ok' && <span className="text-sm text-green-600">已自動帶入課表</span>}
                  {scheduleLoadStatus === 'empty' && (
                    <span className="text-sm text-amber-700">
                      查無該姓名之公開課表，請手動點格子填寫。
                      {teacherName.trim() && (
                        <span className="block mt-1 text-xs text-slate-500">
                          若學校已建置課表，請管理員於「教師管理」執行「同步課表至公開查詢」後再試。
                        </span>
                      )}
                    </span>
                  )}
                  {scheduleLoadStatus === 'error' && <span className="text-sm text-red-600">讀取課表失敗，請改用手動填寫或稍後再試</span>}
                  <button
                    type="button"
                    onClick={() => void performScheduleLoad(true)}
                    disabled={scheduleLoadStatus === 'loading' || !teacherName.trim()}
                    className="ml-auto min-h-[40px] px-3 py-2 rounded-lg border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 text-sm font-medium touch-manipulation"
                  >
                    重新載入課表
                  </button>
                </div>
                <div className="flex items-center justify-between mb-3 bg-slate-50 p-2 sm:p-2.5 rounded-lg border border-slate-200 gap-2">
                  <button type="button" onClick={() => setWeekIndex((i) => Math.max(0, i - 1))} disabled={weekIndex <= 0} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-200 disabled:opacity-40 touch-manipulation" aria-label="上一週">
                    <ChevronLeft size={22} />
                  </button>
                  <span className="text-xs sm:text-sm font-bold text-slate-700 text-center px-1 break-all">
                    {currentWeekDays[0]} ~ {currentWeekDays[currentWeekDays.length - 1]}
                  </span>
                  <button type="button" onClick={() => setWeekIndex((i) => Math.min(weeks.length - 1, i + 1))} disabled={weekIndex >= weeks.length - 1} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-200 disabled:opacity-40 touch-manipulation" aria-label="下一週">
                    <ChevronRight size={22} />
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200 -mx-1 px-1 sm:mx-0 sm:px-0 overscroll-x-contain touch-pan-x" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <table className="w-full min-w-[320px] text-center border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr>
                        <th className="p-2 border-b border-r border-slate-200 bg-slate-100 font-bold text-slate-600 w-12">節</th>
                        {currentWeekDays.map((d) => {
                          const day = new Date(d + 'T12:00:00');
                          const wd = ['日','一','二','三','四','五','六'][day.getDay()];
                          return (
                            <th key={d} className="p-1.5 sm:p-2 border-b border-r border-slate-200 bg-slate-50 font-bold text-slate-700 min-w-[64px] sm:min-w-[72px]">
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
                              <td key={`${date}-${period}`} className="p-0.5 sm:p-1 border-b border-r border-slate-200 align-top">
                                {isEditing ? (
                                  <div className="bg-indigo-50 rounded p-2 space-y-2">
                                    <input type="text" value={editSubject} onChange={(e) => setEditSubject(e.target.value)} placeholder="科目" className="w-full min-h-[40px] px-2 py-2 text-base border border-slate-200 rounded touch-manipulation" autoFocus />
                                    <input type="text" value={editClassName} onChange={(e) => setEditClassName(e.target.value)} placeholder="班級" className="w-full min-h-[40px] px-2 py-2 text-base border border-slate-200 rounded touch-manipulation" enterKeyHint="done" />
                                    <div className="flex gap-2 mt-1">
                                      <button type="button" onClick={handleSaveCell} className="flex-1 min-h-[44px] py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold touch-manipulation">確定</button>
                                      <button type="button" onClick={() => handleRemoveSlot(date, period)} className="min-h-[44px] px-3 text-slate-600 hover:text-rose-600 text-sm touch-manipulation">刪除</button>
                                    </div>
                                  </div>
                                ) : slot ? (
                                  <button
                                    type="button"
                                    onClick={() => { setEditingCell({ date, period }); setEditSubject(slot.subject); setEditClassName(slot.className); }}
                                    className="w-full min-h-[52px] sm:min-h-[56px] rounded-lg bg-indigo-100 border border-indigo-200 text-indigo-900 text-[11px] sm:text-xs p-1.5 hover:ring-2 hover:ring-indigo-300 touch-manipulation active:scale-[0.98]"
                                  >
                                    <div className="font-bold line-clamp-2 leading-tight">{slot.subject}</div>
                                    <div className="line-clamp-2 opacity-85 leading-tight mt-0.5">{slot.className}</div>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => { setEditingCell({ date, period }); setEditSubject(''); setEditClassName(''); }}
                                    className="w-full min-h-[52px] sm:min-h-[56px] rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 text-xl font-light touch-manipulation active:bg-indigo-50"
                                    aria-label="新增節次"
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

        {/* 手機：底部固定送出列，避免要滑到最底才按得到 */}
        <div className="fixed bottom-0 left-0 right-0 p-3 sm:p-4 bg-slate-50/95 backdrop-blur-sm border-t border-slate-200 sm:static sm:bg-transparent sm:border-0 sm:backdrop-blur-none z-30 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom,0px))] sm:[padding-bottom:0]">
          <div className="max-w-4xl mx-auto flex justify-center">
            <button type="submit" disabled={loading} className="w-full sm:w-auto sm:min-w-[220px] min-h-[48px] py-3.5 sm:py-3 text-base bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-70 flex items-center justify-center gap-2 shadow-lg sm:shadow-md touch-manipulation">
              {loading ? <Loader2 size={22} className="animate-spin" /> : null}
              {loading ? '送出中...' : '送出申請'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
