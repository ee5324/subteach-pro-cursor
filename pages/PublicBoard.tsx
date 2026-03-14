/**
 * 代課缺額公告（對外公開）
 * 資料來源：Firebase Firestore publicBoard/vacancies（後台「發佈公開」寫入）
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../src/lib/firebase';
import { doc, getDoc, onSnapshot, collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import { RefreshCw, ChevronLeft, ChevronRight, ArrowLeft, AlertCircle } from 'lucide-react';

const PERIOD_ORDER = ['早', '1', '2', '3', '4', '午', '5', '6', '7'];

interface Vacancy {
  id: string;
  date: string;
  period: string;
  originalTeacherName: string;
  subject: string;
  className: string;
  reason?: string;
  payType?: string;
  status?: string;
  recordId?: string;
  allowPartial?: boolean;
  /** 1=僅第一層（校內/常配合）可見，2=已釋出對外可見 */
  tier?: 1 | 2;
}

function normalizeVacancies(data: unknown): Vacancy[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  const raw = d.vacancies;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is Record<string, unknown> => v != null && typeof v === 'object')
    .map((v, i) => ({
      id: String(v.id ?? `v-${i}`),
      date: String(v.date ?? ''),
      period: String(v.period ?? ''),
      originalTeacherName: String(v.originalTeacherName ?? '未知教師'),
      subject: String(v.subject ?? ''),
      className: String(v.className ?? ''),
      reason: v.reason != null ? String(v.reason) : undefined,
      payType: v.payType != null ? String(v.payType) : undefined,
      status: v.status != null ? String(v.status) : '開放報名',
      recordId: v.recordId != null ? String(v.recordId) : undefined,
      allowPartial: Boolean(v.allowPartial),
      tier: v.tier === 1 || v.tier === 2 ? v.tier : 2,
    })) as Vacancy[];
}

export default function PublicBoard() {
  const [searchParams] = useSearchParams();
  const isLayer1 = searchParams.get('layer') === '1';
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [applicationCounts, setApplicationCounts] = useState<Record<string, number>>({});
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null);
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', note: '' });

  const fetchVacancies = useCallback(async () => {
    if (!db) {
      setErrorMsg('Firebase 未初始化，無法載入資料。若為 Vercel 部署，請在專案設定中新增 VITE_FIREBASE_API_KEY 等環境變數，並在 Firebase Console 將此網域加入授權網域。');
      setVacancies([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const snap = await getDoc(doc(db, 'publicBoard', 'vacancies'));
      const data = snap.exists() ? snap.data() : null;
      setVacancies(normalizeVacancies(data));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMsg(`無法讀取缺額資料：${message}\n\n請確認 Firestore 規則已部署，且此網域已加入 Firebase 授權網域。`);
      setVacancies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVacancies();
  }, [fetchVacancies]);

  // 即時訂閱：資料更新時自動刷新（可選，避免漏接後台發佈）
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(doc(db, 'publicBoard', 'vacancies'), (snap) => {
      const data = snap.exists() ? snap.data() : null;
      setVacancies(normalizeVacancies(data));
      setErrorMsg('');
    }, (err) => {
      setErrorMsg(err?.message ?? '即時更新連線錯誤');
    });
    return () => unsub();
  }, []);

  // 報名人數：公開頁不訂閱 publicBoardApplications（規則僅允許登入者讀取，且含個資），故維持 0／僅顯示「可報名」
  // applicationCounts 保持 {}，UI 會顯示「可報名」或 0 人

  const openOnly = useMemo(() => {
    const byStatus = vacancies.filter((v) => v.status === '開放報名' || !v.status);
    if (isLayer1) return byStatus;
    return byStatus.filter((v) => (v.tier ?? 2) === 2);
  }, [vacancies, isLayer1]);

  const teacherGroups = useMemo(() => {
    const groups: Record<string, { name: string; count: number; hasDaily: boolean; dates: Date[]; subjects: Set<string>; classes: Set<string> }> = {};
    openOnly.forEach((v) => {
      const name = v.originalTeacherName || '未知教師';
      if (!groups[name]) {
        groups[name] = { name, count: 0, hasDaily: false, dates: [], subjects: new Set(), classes: new Set() };
      }
      groups[name].count++;
      if (v.payType === '日薪') groups[name].hasDaily = true;
      const d = v.date ? new Date(v.date.substring(0, 10)) : new Date();
      groups[name].dates.push(d);
      if (v.subject) groups[name].subjects.add(v.subject);
      if (v.className) groups[name].classes.add(String(v.className));
    });
    return Object.values(groups).map((g) => {
      const sorted = [...g.dates].sort((a, b) => a.getTime() - b.getTime());
      const fmt = (d: Date) => d.getMonth() + 1 + '/' + d.getDate();
      const start = sorted[0] ? fmt(sorted[0]) : '';
      const end = sorted[sorted.length - 1] ? fmt(sorted[sorted.length - 1]) : '';
      return {
        ...g,
        dateRange: start === end ? start : `${start} ~ ${end}`,
        subjects: Array.from(g.subjects).join(', '),
        classes: Array.from(g.classes).sort(),
      };
    });
  }, [openOnly]);

  const filteredVacancies = useMemo(() => {
    if (!selectedTeacher) return [];
    return openOnly.filter((v) => v.originalTeacherName === selectedTeacher);
  }, [openOnly, selectedTeacher]);

  const getMonday = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  };

  const vacanciesByWeek = useMemo(() => {
    const groups: Record<string, Vacancy[]> = {};
    filteredVacancies.forEach((v) => {
      const d = new Date((v.date || '').substring(0, 10));
      const mon = getMonday(d);
      const mStr = mon.getFullYear() + '-' + String(mon.getMonth() + 1).padStart(2, '0') + '-' + String(mon.getDate()).padStart(2, '0');
      if (!groups[mStr]) groups[mStr] = [];
      groups[mStr].push(v);
    });
    return groups;
  }, [filteredVacancies]);

  const sortedWeekKeys = Object.keys(vacanciesByWeek).sort();
  const currentWeekKey = sortedWeekKeys[currentWeekIndex] ?? sortedWeekKeys[0];
  const currentWeekVacancies = currentWeekKey ? vacanciesByWeek[currentWeekKey] || [] : [];
  const currentWeekDays = useMemo(() => {
    if (!currentWeekKey) return [];
    const monday = new Date(currentWeekKey);
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [currentWeekKey]);

  const formatDateSimple = (d: Date) => d.getMonth() + 1 + '/' + d.getDate();
  const currentWeekRange =
    currentWeekKey && currentWeekDays.length
      ? `${formatDateSimple(currentWeekDays[0])} ~ ${formatDateSimple(currentWeekDays[4])}`
      : '無資料';

  const getPeriodLabel = (p: string) => (p === '早' ? '早自習' : p === '午' ? '午休' : '第 ' + p + ' 節');

  const getSlotItems = (items: Vacancy[], dateObj: Date, period: string) =>
    items.filter((item) => {
      const itemD = new Date((item.date || '').substring(0, 10));
      return itemD.getDate() === dateObj.getDate() && itemD.getMonth() === dateObj.getMonth() && String(item.period) === String(period);
    });

  const toggleSelection = (id: string) => {
    const target = vacancies.find((v) => v.id === id);
    if (!target) return;
    let ids = [id];
    if (!target.allowPartial && target.recordId) {
      ids = openOnly.filter((v) => v.recordId === target.recordId).map((v) => v.id);
    }
    const allSelected = ids.every((i) => selectedIds.includes(i));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((s) => !ids.includes(s)));
    } else {
      setSelectedIds((prev) => [...prev, ...ids.filter((i) => !prev.includes(i))]);
    }
  };

  const getCurrentMaxQueue = () => {
    if (selectedIds.length === 0) return 0;
    return Math.max(0, ...selectedIds.map((id) => applicationCounts[id] || 0));
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim() || !db) return;
    setSubmitting(true);
    try {
      let maxOrder = 0;
      for (const vid of selectedIds) {
        await addDoc(collection(db, 'publicBoardApplications'), {
          vacancyId: vid,
          name: form.name.trim(),
          phone: String(form.phone).trim(),
          note: (form.note || '').trim(),
          createdAt: Date.now(),
        });
        const q = query(collection(db, 'publicBoardApplications'), where('vacancyId', '==', vid));
        const snap = await getDocs(q);
        if (snap.size > maxOrder) maxOrder = snap.size;
      }
      alert(`報名成功！您已排入順位，最高順位為第 ${maxOrder} 位。系統將儘快與您聯繫。`);
      setShowModal(false);
      setSelectedIds([]);
      setForm({ name: '', phone: '', note: '' });
    } catch (err: unknown) {
      alert('送出失敗: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSubmitting(false);
    }
  };

  if (!db) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-red-200 text-red-700 max-w-md">
          <p className="font-bold flex items-center gap-2">
            <AlertCircle size={20} /> 無法載入：Firebase 未初始化
          </p>
          <p className="text-sm mt-2 text-slate-600">
            請確認部署環境已設定 VITE_FIREBASE_API_KEY、VITE_FIREBASE_PROJECT_ID 等變數，並在 Firebase Console 將此網域加入授權網域。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 px-3 py-4 sm:p-4 max-w-7xl mx-auto" style={{ paddingBottom: 'max(8rem, calc(6rem + env(safe-area-inset-bottom, 0px)))' }}>
      <header className="mb-4 sm:mb-6 bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-2xl font-bold text-slate-800 flex items-center truncate">
              <span className="mr-2 text-3xl sm:text-3xl shrink-0">🏫</span>
              <span className="truncate">代課缺額公告</span>
            </h1>
            <p className="text-slate-500 text-base sm:text-sm mt-1 truncate">
              {selectedTeacher ? `${selectedTeacher} 老師` : '點選教師查看時段'}
            </p>
          </div>
          <div className="shrink-0">
            <button
              type="button"
              onClick={fetchVacancies}
              disabled={loading}
              className="touch-target-min flex items-center justify-center gap-1 min-h-[44px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-600 rounded-lg text-base sm:text-sm font-medium disabled:opacity-70 transition-colors"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">重新整理</span>
            </button>
          </div>
        </div>
        {errorMsg && (
          <div className="mt-4 p-3 bg-red-50 text-red-600 text-base sm:text-sm rounded-lg border border-red-200 whitespace-pre-line flex items-start gap-2">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
      </header>

      {/* 第一層 / 第二層說明 */}
      {isLayer1 ? (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-emerald-800 text-sm">
          <strong>校內／常配合代課老師優先填寫</strong>：此頁面可看到所有已發佈缺額（含尚未對外釋出者），請優先由此填寫。
        </div>
      ) : (
        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 text-sm">
          <strong>對外公開頁面</strong>：僅顯示已釋出之缺額。若您為校內或常配合代課老師，請改用專用連結以優先填寫 →{' '}
          <a href="#/public?layer=1" className="text-indigo-600 font-medium underline hover:no-underline">校內/常配合專用連結</a>
        </div>
      )}

      {/* 使用說明：簡單易懂 */}
      <div className="mb-4 sm:mb-6 bg-indigo-50 border border-indigo-200 rounded-xl p-4 sm:p-5 text-slate-700">
        <p className="font-bold text-indigo-900 text-base sm:text-sm mb-2">📖 如何使用</p>
        <ol className="text-sm space-y-1.5 list-decimal list-inside">
          <li><strong>選老師</strong>：點選下方某位請假老師的卡片，進入該老師的缺額課表。</li>
          <li><strong>選節次</strong>：在課表中點選您要代課的節次（可多選），該格會變成藍色。</li>
          <li><strong>填資料並送出</strong>：點「下一步」填寫姓名與聯絡電話，送出後即完成報名。</li>
        </ol>
        <p className="text-xs text-slate-500 mt-2">缺額由學校後台發佈，若列表為空表示目前無公開缺額；可稍後按「重新整理」取得最新資料。</p>
      </div>

      {loading && vacancies.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
          <p className="text-slate-400 font-medium text-base">正在載入最新缺額...</p>
        </div>
      )}

      {!loading && openOnly.length === 0 && (
        <div className="bg-white p-6 sm:p-12 rounded-2xl text-center shadow-sm border border-slate-200">
          <div className="inline-block p-4 bg-green-50 rounded-full mb-4">✓</div>
          <h3 className="text-xl sm:text-xl font-bold text-slate-800 mb-2">目前沒有代課缺額</h3>
          <p className="text-slate-500 text-base">感謝您的關注，所有課程都已安排妥當。</p>
          {!isLayer1 && (
            <p className="text-slate-500 text-sm mt-2">若您為校內或常配合代課老師，可改用<a href="#/public?layer=1" className="text-indigo-600 font-medium underline ml-1">專用連結</a>查看是否有僅對您開放的缺額。</p>
          )}
          <div className="mt-4 sm:mt-6 p-4 sm:p-5 bg-amber-50 border border-amber-200 rounded-xl text-left max-w-lg mx-auto">
            <p className="text-base font-bold text-amber-800 mb-2">📌 這裡才會看到缺額？</p>
            <p className="text-sm text-slate-700 sm:hidden">後台進入 <strong>待聘清單</strong> → 設為 <strong>公開中</strong> → 點 <strong>發佈公開</strong>。</p>
            <ol className="hidden sm:block text-sm text-slate-700 list-decimal list-inside space-y-2">
              <li>登入後從左側進入 <strong>待聘清單</strong>（#/pending）。</li>
              <li>將要顯示的課務切換為 <strong>公開中</strong>。</li>
              <li>點 <strong>發佈公開 (N)</strong>，再重新整理本頁。</li>
            </ol>
            <p className="text-xs text-slate-500 mt-2 hidden sm:block">若無待聘課程，請先在請假登錄建立請假並留未派代節次。</p>
          </div>
          <p className="text-xs text-slate-400 mt-3 max-w-md mx-auto hidden sm:block">
            發佈後仍看不到請確認 Firebase 授權網域並再按一次發佈。
          </p>
        </div>
      )}

      {!loading && openOnly.length > 0 && !selectedTeacher && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {teacherGroups.map((g) => (
            <button
              key={g.name}
              type="button"
              onClick={() => {
                setSelectedTeacher(g.name);
                setCurrentWeekIndex(0);
                setSelectedIds([]);
              }}
              className="touch-target-min bg-white rounded-xl shadow-sm border border-slate-200 p-5 sm:p-6 text-left hover:border-indigo-400 hover:shadow-md active:scale-[0.99] transition-all min-h-[120px]"
            >
              <div className="flex justify-between items-start mb-2 sm:mb-4">
                <div className="flex items-center min-w-0">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-base sm:text-lg font-bold mr-3 shrink-0">
                    {g.name.slice(-1)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-lg text-slate-800 truncate">{g.name} 老師</h3>
                    <p className="text-sm text-slate-500 mt-0.5 truncate hidden sm:block">{g.subjects}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="bg-indigo-100 text-indigo-700 text-sm font-bold px-2.5 py-1 rounded-full">{g.count} 節</span>
                  {g.hasDaily && <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full mt-0.5">代導師</span>}
                </div>
              </div>
              <div className="flex items-center bg-slate-50 p-2 rounded-lg text-slate-600 text-sm">
                <span className="truncate">📅 {g.dateRange}</span>
              </div>
              <div className="hidden sm:block space-y-2 text-sm text-slate-600">
                <div className="flex items-center bg-slate-50 p-2.5 rounded-lg">任教班級：{g.classes.join(', ')}</div>
              </div>
              <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-slate-200 flex justify-end items-center">
                <span className="text-indigo-600 font-bold text-sm">查看時段 →</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {!loading && selectedTeacher && (
        <div className="space-y-4 sm:space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedTeacher(null);
                setSelectedIds([]);
              }}
              className="touch-target-min flex items-center gap-1 min-h-[44px] text-slate-500 hover:text-indigo-600 font-bold bg-white px-4 py-2.5 rounded-lg border border-slate-200 active:bg-slate-50 text-base"
            >
              <ArrowLeft size={22} /> 返回列表
            </button>
            <span className="bg-indigo-50 px-4 py-2 rounded-lg text-indigo-800 text-base sm:text-sm font-medium border border-indigo-100 truncate max-w-[200px] sm:max-w-none">
              {selectedTeacher} 老師代課需求
            </span>
          </div>

          <div className="flex items-center justify-between bg-white p-2 sm:p-3 rounded-xl shadow-sm border border-slate-200 sticky top-0 sm:top-2 z-30">
            <button
              type="button"
              onClick={() => setCurrentWeekIndex((i) => Math.max(0, i - 1))}
              disabled={currentWeekIndex <= 0}
              className="touch-target-min min-h-[44px] min-w-[44px] p-2 rounded-lg hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <ChevronLeft size={24} className="text-slate-600" />
            </button>
            <div className="text-center flex-1 min-w-0 px-2">
              <div className="text-lg font-bold text-indigo-900 truncate">{currentWeekRange}</div>
              <div className="text-sm text-slate-500 mt-0.5 hidden sm:block">本週 {currentWeekVacancies.length} 節缺額</div>
            </div>
            <button
              type="button"
              onClick={() => setCurrentWeekIndex((i) => Math.min(sortedWeekKeys.length - 1, i + 1))}
              disabled={currentWeekIndex >= sortedWeekKeys.length - 1}
              className="touch-target-min min-h-[44px] min-w-[44px] p-2 rounded-lg hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <ChevronRight size={24} className="text-slate-600" />
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto -mx-1 px-1" style={{ WebkitOverflowScrolling: 'touch' }}>
            <p className="text-sm text-slate-400 text-center py-2 sm:hidden">← 可左右滑動查看一週課表 →</p>
            <table className="w-full text-center border-collapse min-w-[800px]">
              <thead>
                <tr>
                  <th className="w-[72px] sm:w-20 p-2.5 sm:p-3 bg-slate-50 border-b border-r border-slate-200 text-slate-500 text-base sm:text-sm font-bold sticky left-0 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">節次</th>
                  {currentWeekDays.map((date, i) => (
                    <th key={i} className="p-2.5 sm:p-3 bg-slate-50 border-b border-r border-slate-200 text-slate-700 min-w-[120px] sm:min-w-[140px]">
                      <div className="font-bold text-base sm:text-sm">{['週一', '週二', '週三', '週四', '週五'][i]}</div>
                      <div className="text-sm text-slate-500">{formatDateSimple(date)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERIOD_ORDER.map((period) => (
                  <tr key={period}>
                    <td className="p-2 sm:p-3 bg-slate-50 border-b border-r border-slate-200 text-slate-600 font-bold text-base sm:text-sm sticky left-0 z-[1] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                      {getPeriodLabel(period)}
                    </td>
                    {currentWeekDays.map((date, i) => (
                      <td key={i} className="p-1.5 sm:p-1.5 border-b border-r border-slate-200 align-top min-h-[76px] sm:h-28">
                        <div className="h-full flex flex-col gap-1 sm:gap-1.5 p-1">
                          {getSlotItems(currentWeekVacancies, date, period).map((item) => {
                            const isSel = selectedIds.includes(item.id);
                            const cnt = applicationCounts[item.id] || 0;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => toggleSelection(item.id)}
                                className={`touch-target-min relative border rounded-xl p-2.5 sm:p-2.5 text-left w-full min-h-[56px] sm:min-h-[52px] shadow-sm transition-all text-base sm:text-sm active:scale-[0.98] ${
                                  isSel ? 'bg-indigo-600 border-indigo-700 text-white' : 'bg-white border-slate-200 hover:border-indigo-400 active:border-indigo-300'
                                }`}
                              >
                                <span
                                  className={`absolute top-0 right-0 rounded-bl-lg px-1 py-0.5 text-[10px] sm:text-xs font-bold ${
                                    isSel ? 'bg-white/20 text-white' : item.payType === '日薪' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  {item.payType === '日薪' ? '代導' : '鐘點'}
                                </span>
                                <div className="font-bold truncate pr-12 text-base sm:text-sm">{item.subject}</div>
                                <div className="hidden sm:block text-xs truncate opacity-80">{item.className}</div>
                                <div className="mt-0.5 text-sm font-medium">{cnt > 0 ? `${cnt}人` : '可報名'}</div>
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div
          className="fixed left-2 right-2 sm:left-4 sm:right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-xl z-50"
          style={{ bottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
        >
          <div className="bg-slate-800/95 backdrop-blur text-white p-4 rounded-2xl shadow-2xl flex justify-between items-center gap-3 border border-slate-600">
            <div className="min-w-0">
              <div className="font-bold text-lg flex items-center">
                <span className="bg-indigo-500 w-9 h-9 rounded-full flex items-center justify-center mr-2 sm:mr-3 text-base font-bold shrink-0">{selectedIds.length}</span>
                <span>節</span>
              </div>
              <div className="text-xs text-slate-300 mt-0.5 hidden sm:block">已選時段</div>
            </div>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="touch-target-min shrink-0 min-h-[44px] bg-indigo-500 hover:bg-indigo-400 active:bg-indigo-600 text-white px-5 sm:px-6 py-3 rounded-xl font-bold shadow-lg text-base"
            >
              下一步 →
            </button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" style={{ minHeight: 'min(400px, 70vh)' }}>
            <div className="bg-slate-50 px-4 sm:px-6 py-4 border-b flex justify-between items-center shrink-0">
              <h3 className="font-bold text-slate-800 text-lg sm:text-lg">📝 填寫報名資料</h3>
              <button type="button" onClick={() => setShowModal(false)} className="touch-target-min min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 active:bg-slate-300">
                ✕
              </button>
            </div>
            <div className="bg-indigo-50 p-4 border-b text-base sm:text-sm text-indigo-800 shrink-0">
              <div className="font-bold text-indigo-900">候用狀況</div>
              <div className="mt-1">
                已有 <strong>{getCurrentMaxQueue()}</strong> 人報名，您將排第 <strong className="bg-white px-1 rounded">{getCurrentMaxQueue() + 1}</strong> 位。
              </div>
            </div>
            <form onSubmit={submitForm} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-base sm:text-sm font-bold mb-1 text-slate-700">姓名 *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-base"
                  placeholder="請輸入您的全名"
                />
              </div>
              <div>
                <label className="block text-base sm:text-sm font-bold mb-1 text-slate-700">聯絡電話 *</label>
                <input
                  required
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-base"
                  placeholder="0912345678"
                />
              </div>
              <div>
                <label className="block text-base sm:text-sm font-bold mb-1 text-slate-700">備註留言</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  rows={2}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-base"
                  placeholder="選填"
                />
              </div>
              <div className="pt-4 flex gap-3 pb-safe" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>
                <button type="button" onClick={() => setShowModal(false)} className="touch-target-min flex-1 min-h-[48px] py-3 border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-50 active:bg-slate-100">
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="touch-target-min flex-1 min-h-[48px] py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-bold shadow-md disabled:opacity-70 flex items-center justify-center"
                >
                  {submitting ? '送出中...' : '確認報名'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
