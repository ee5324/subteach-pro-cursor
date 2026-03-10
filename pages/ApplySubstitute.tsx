/**
 * 對外代課教師報名頁 — 不連回主系統，僅表單蒐集資料並寫入 Firestore。
 * 路由：/apply（獨立於主系統 Layout，未登入可存取）
 */
import React, { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { APPLY_TEACHING_ITEMS } from '../types';
import { UserPlus, Phone, BookOpen, Award, MessageCircle, Loader2, CheckCircle, Clock, Calendar } from 'lucide-react';

const EDUCATION_LEVELS = ['大學', '研究所', '博士'] as const;
type EducationLevel = typeof EDUCATION_LEVELS[number];

const ApplySubstitute: React.FC = () => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [unavailableTime, setUnavailableTime] = useState('');
  const [availableTime, setAvailableTime] = useState('');
  const [hasCertificate, setHasCertificate] = useState<boolean | null>(null); // 國小教師證 * 有/沒有
  const [hasEducationCredential, setHasEducationCredential] = useState<boolean | null>(null); // 學程修畢 有/沒有
  const [educationLevel, setEducationLevel] = useState<EducationLevel | ''>(''); // 最高學歷 *
  const [graduationMajor, setGraduationMajor] = useState(''); // 系所 *
  const [teachingItems, setTeachingItems] = useState<string[]>([]); // 可任教項目 * 可複選
  const [lineAccount, setLineAccount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const toggleTeachingItem = (item: string) => {
    setTeachingItems(prev =>
      prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('請填寫姓名');
      return;
    }
    if (!phone.trim()) {
      setError('請填寫電話／聯絡方式（留 LINE 也請留電話唷，因為有時候收不到訊息）');
      return;
    }
    if (hasCertificate === null) {
      setError('請選擇是否有國小教師證');
      return;
    }
    if (!educationLevel || !graduationMajor.trim()) {
      setError('請填寫最高學歷與系所');
      return;
    }
    if (teachingItems.length === 0) {
      setError('請至少勾選一項「可以任教的項目」');
      return;
    }
    if (!db) {
      setError('系統未初始化，請稍後再試。');
      return;
    }
    setLoading(true);
    try {
      await addDoc(collection(db, 'substituteApplications'), {
        name: name.trim(),
        phone: phone.trim(),
        unavailableTime: unavailableTime.trim() || undefined,
        availableTime: availableTime.trim() || undefined,
        hasCertificate,
        hasEducationCredential: hasEducationCredential ?? undefined,
        educationLevel: educationLevel || undefined,
        graduationMajor: graduationMajor.trim(),
        teachingItems: teachingItems.length ? teachingItems : undefined,
        lineAccount: lineAccount.trim() || undefined,
        note: note.trim() || undefined,
        status: 'pending',
        createdAt: Date.now(),
      });
      setSent(true);
      setName('');
      setPhone('');
      setUnavailableTime('');
      setAvailableTime('');
      setHasCertificate(null);
      setHasEducationCredential(null);
      setEducationLevel('');
      setGraduationMajor('');
      setTeachingItems([]);
      setLineAccount('');
      setNote('');
    } catch (err: any) {
      console.error('Apply submit error', err);
      setError(err?.message || '送出失敗，請稍後再試。');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
        <div className="bg-white rounded-xl shadow-md p-8 max-w-md w-full text-center">
          <CheckCircle className="mx-auto text-green-500 mb-4" size={48} />
          <h2 className="text-xl font-bold text-slate-800 mb-2">報名已送出</h2>
          <p className="text-slate-600 text-sm mb-6">
            感謝您的填寫，我們會盡快與您聯繫。
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="text-indigo-600 font-medium text-sm hover:underline"
          >
            再填寫一筆
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4 py-8">
      <div className="bg-white rounded-xl shadow-md p-6 sm:p-8 w-full max-w-lg">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center justify-center gap-2">
            <UserPlus size={28} className="text-indigo-600" />
            代課教師報名
          </h1>
          <p className="text-slate-500 text-sm mt-2">
            填寫基本資料，審核通過後將由校方聯繫並納入代課人力。
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">姓名 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="請填寫真實姓名"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">電話／聯絡方式 <span className="text-red-500">*</span></label>
            <p className="text-xs text-slate-500 mb-1">留下 LINE ID 也請留電話唷，因為有時候收不到訊息。</p>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="例：0912345678"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">一定沒辦法代的時間</label>
            <p className="text-xs text-slate-500 mb-1">例如：週二早上要進修….沒有寫「無」</p>
            <div className="relative">
              <Clock className="absolute left-3 top-3 text-slate-400" size={18} />
              <input
                type="text"
                value={unavailableTime}
                onChange={(e) => setUnavailableTime(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="沒有請填「無」"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">方便代課的時間</label>
            <p className="text-xs text-slate-500 mb-1">例如：週二早上可以、週四全天…..</p>
            <div className="relative">
              <Calendar className="absolute left-3 top-3 text-slate-400" size={18} />
              <input
                type="text"
                value={availableTime}
                onChange={(e) => setAvailableTime(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="例：週二早上、週四全天"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">國小教師證 <span className="text-red-500">*</span></label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="cert"
                  checked={hasCertificate === true}
                  onChange={() => setHasCertificate(true)}
                  className="w-4 h-4 text-indigo-600"
                />
                <span>有</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="cert"
                  checked={hasCertificate === false}
                  onChange={() => setHasCertificate(false)}
                  className="w-4 h-4 text-indigo-600"
                />
                <span>沒有</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">有無國小教育學程修畢證書</label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="cred"
                  checked={hasEducationCredential === true}
                  onChange={() => setHasEducationCredential(true)}
                  className="w-4 h-4 text-indigo-600"
                />
                <span>有</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="cred"
                  checked={hasEducationCredential === false}
                  onChange={() => setHasEducationCredential(false)}
                  className="w-4 h-4 text-indigo-600"
                />
                <span>沒有</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">最高學歷與系所 <span className="text-red-500">*</span></label>
            <div className="flex flex-wrap gap-4 mb-2">
              {EDUCATION_LEVELS.map((level) => (
                <label key={level} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="eduLevel"
                    checked={educationLevel === level}
                    onChange={() => setEducationLevel(level)}
                    className="w-4 h-4 text-indigo-600"
                  />
                  <span>{level === '大學' ? '大學（包含同等學歷）' : level}</span>
                </label>
              ))}
            </div>
            <div className="relative">
              <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                value={graduationMajor}
                onChange={(e) => setGraduationMajor(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="系所，例：教育系、幼教系"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">可以任教的項目，可複選 <span className="text-red-500">*</span></label>
            <div className="flex flex-wrap gap-x-4 gap-y-2 border border-slate-200 rounded-lg p-3 bg-slate-50">
              {APPLY_TEACHING_ITEMS.map((item) => (
                <label key={item} className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={teachingItems.includes(item)}
                    onChange={() => toggleTeachingItem(item)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm">{item}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">LINE 帳號／ID</label>
            <div className="relative">
              <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                value={lineAccount}
                onChange={(e) => setLineAccount(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="若留 LINE 也請填上方電話"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">其他備註</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              placeholder="選填"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <UserPlus size={20} />}
            {loading ? '送出中...' : '送出報名'}
          </button>
        </form>

        <p className="mt-4 text-xs text-slate-400 text-center">
          本表單僅供代課教師資料蒐集，審核結果將由校方另行通知。
        </p>
      </div>
    </div>
  );
};

export default ApplySubstitute;
