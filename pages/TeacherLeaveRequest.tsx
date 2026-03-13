/**
 * 教師請假申請（Vercel 表單）— 老師自行填寫，寫入 Firestore 待審，由外部申請頁匯入系統
 * 路由：#/teacher-request（公開，不需登入）
 */
import React, { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { LeaveType, PayType } from '../types';
import { FileText, Loader2, CheckCircle, Plus, Trash2 } from 'lucide-react';

const PERIOD_OPTIONS = ['早', '1', '2', '3', '4', '午', '5', '6', '7'];
const LEAVE_TYPE_OPTIONS = Object.entries(LeaveType).map(([k, v]) => ({ value: v, label: v }));

export default function TeacherLeaveRequest() {
  const [teacherName, setTeacherName] = useState('');
  const [leaveType, setLeaveType] = useState<string>(LeaveType.PUBLIC_OFFICIAL);
  const [docId, setDocId] = useState('');
  const [reason, setReason] = useState('');
  const [payType, setPayType] = useState<string>(PayType.HOURLY);
  const [substituteMode, setSubstituteMode] = useState<'need_matching' | 'self_arranged'>('need_matching');
  const [substituteTeacher, setSubstituteTeacher] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [details, setDetails] = useState<{ date: string; period: string; subject: string; className: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const addSlot = () => {
    setDetails((prev) => [...prev, { date: startDate || '', period: '1', subject: '', className: '' }]);
  };
  const removeSlot = (i: number) => {
    setDetails((prev) => prev.filter((_, idx) => idx !== i));
  };
  const updateSlot = (i: number, field: keyof (typeof details)[0], value: string) => {
    setDetails((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
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
      setError('請至少新增一節課務（日期、節次、科目、班級）');
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
        docId: docId.trim() || undefined,
        reason: reason.trim(),
        payType,
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
            onClick={() => { setSent(false); setTeacherName(''); setReason(''); setDetails([]); }}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
          >
            再填一筆
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 px-4 py-6 max-w-3xl mx-auto pb-24">
      <header className="mb-6 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center">
          <FileText className="mr-3 text-indigo-600" size={28} />
          教師請假申請
        </h1>
        <p className="text-slate-500 text-sm mt-1">填寫並送出代課需求，由教學組審核後匯入系統。</p>
      </header>

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
          <h3 className="font-bold text-slate-800 mb-4">代課與課務</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">支薪方式</label>
              <div className="flex flex-wrap gap-2">
                {[PayType.HOURLY, PayType.DAILY, PayType.HALF_DAY].map((p) => (
                  <button key={p} type="button" onClick={() => setPayType(p)} className={`px-4 py-2 rounded-lg text-sm font-medium border ${payType === p ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}>{p}</button>
                ))}
              </div>
            </div>
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
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">結束日期 *</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800">課務節次</h3>
            <button type="button" onClick={addSlot} className="flex items-center gap-1 text-indigo-600 text-sm font-medium">
              <Plus size={18} /> 新增一節
            </button>
          </div>
          {details.length === 0 ? (
            <p className="text-slate-500 text-sm py-4">請點「新增一節」加入代課節次（日期、節次、科目、班級）。</p>
          ) : (
            <div className="space-y-2">
              {details.map((slot, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center text-sm">
                  <input type="date" value={slot.date} onChange={(e) => updateSlot(i, 'date', e.target.value)} className="col-span-3 px-2 py-1.5 border border-slate-200 rounded" />
                  <select value={slot.period} onChange={(e) => updateSlot(i, 'period', e.target.value)} className="col-span-2 px-2 py-1.5 border border-slate-200 rounded">
                    {PERIOD_OPTIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <input type="text" value={slot.subject} onChange={(e) => updateSlot(i, 'subject', e.target.value)} placeholder="科目" className="col-span-2 px-2 py-1.5 border border-slate-200 rounded" />
                  <input type="text" value={slot.className} onChange={(e) => updateSlot(i, 'className', e.target.value)} placeholder="班級" className="col-span-2 px-2 py-1.5 border border-slate-200 rounded" />
                  <button type="button" onClick={() => removeSlot(i)} className="col-span-1 p-1.5 text-slate-400 hover:text-rose-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        <button type="submit" disabled={loading} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-70 flex items-center justify-center gap-2">
          {loading ? <Loader2 size={20} className="animate-spin" /> : null}
          {loading ? '送出中...' : '送出申請'}
        </button>
      </form>
    </div>
  );
}
