import React, { useMemo, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Calendar, ShieldCheck } from 'lucide-react';
import { db } from '../src/lib/firebase';

const PERIOD_ROWS = [
  { id: '早', label: '早自習' },
  { id: '1', label: '第一節' },
  { id: '2', label: '第二節' },
  { id: '3', label: '第三節' },
  { id: '4', label: '第四節' },
  { id: '午', label: '午休' },
  { id: '5', label: '第五節' },
  { id: '6', label: '第六節' },
  { id: '7', label: '第七節' },
];

type PublicSubstituteSlot = {
  date: string;
  period: string;
  subject?: string;
  className?: string;
  originalTeacherName?: string;
};

type PublicSubstituteScheduleDoc = {
  teacherId: string;
  teacherName: string;
  phoneLast4: string;
  slots: PublicSubstituteSlot[];
};

const getWeekDays = (baseDate: Date) => {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const days = [];
  for (let i = 0; i < 5; i++) {
    const temp = new Date(monday);
    temp.setDate(monday.getDate() + i);
    const y = temp.getFullYear();
    const m = String(temp.getMonth() + 1).padStart(2, '0');
    const dayStr = String(temp.getDate()).padStart(2, '0');
    days.push({
      dateStr: `${y}-${m}-${dayStr}`,
      label: `${Number(m)}/${Number(dayStr)}`,
      dayName: ['週一', '週二', '週三', '週四', '週五'][i],
    });
  }
  return days;
};

const SubstituteWeeklyLookup: React.FC = () => {
  const [phoneLast4, setPhoneLast4] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [matchedSchedules, setMatchedSchedules] = useState<PublicSubstituteScheduleDoc[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  const selectedSchedule = useMemo(
    () => matchedSchedules.find((s) => s.teacherId === selectedTeacherId) || null,
    [matchedSchedules, selectedTeacherId],
  );

  const weekDays = useMemo(() => getWeekDays(viewDate), [viewDate]);

  const slotsByCell = useMemo(() => {
    const map = new Map<string, PublicSubstituteSlot[]>();
    const slots = selectedSchedule?.slots || [];
    slots.forEach((slot) => {
      const key = `${slot.date}_${String(slot.period ?? '')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(slot);
    });
    return map;
  }, [selectedSchedule]);

  const handleSearch = async () => {
    const normalized = phoneLast4.replace(/\D/g, '').slice(-4);
    if (normalized.length !== 4) {
      setError('請輸入手機末四碼');
      return;
    }
    if (!db) {
      setError('系統尚未初始化，請稍後再試');
      return;
    }
    setLoading(true);
    setError('');
    setMatchedSchedules([]);
    setSelectedTeacherId(null);
    try {
      const q = query(
        collection(db, 'publicSubstituteSchedules'),
        where('phoneLast4', '==', normalized),
        limit(20),
      );
      const snap = await getDocs(q);
      const rows = snap.docs.map((d) => {
        const data = d.data() as PublicSubstituteScheduleDoc;
        return {
          teacherId: data.teacherId || d.id,
          teacherName: data.teacherName || '',
          phoneLast4: data.phoneLast4 || normalized,
          slots: Array.isArray(data.slots) ? data.slots : [],
        };
      });
      if (rows.length === 0) {
        setError('查無資料，請確認手機末四碼是否正確，或請教學組確認是否已排入代課。');
        return;
      }
      setMatchedSchedules(rows);
      setSelectedTeacherId(rows[0].teacherId);
      setViewDate(new Date());
      setSelectedDayIndex(0);
    } catch (e) {
      console.error(e);
      setError('查詢失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const handleWeekNav = (direction: 'prev' | 'next') => {
    const next = new Date(viewDate);
    next.setDate(next.getDate() + (direction === 'next' ? 7 : -7));
    setViewDate(next);
    setSelectedDayIndex(0);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Calendar className="text-indigo-600" size={24} />
            代課老師週課表查詢
          </h1>
          <p className="text-slate-500 text-sm mt-2">
            輸入手機末四碼即可查詢本人的代課週課表。驗證通過後僅顯示符合該末四碼的代課資料。
          </p>

          <form
            className="mt-4 flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSearch();
            }}
          >
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={phoneLast4}
              onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full sm:w-56 px-3 py-3 text-base border border-slate-300 rounded-lg"
              placeholder="手機末四碼"
              autoComplete="one-time-code"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 font-semibold"
            >
              {loading ? '查詢中...' : '查詢週課表'}
            </button>
          </form>

          {error && <div className="mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

          {matchedSchedules.length > 0 && (
            <div className="mt-4">
              <div className="text-sm text-slate-600 mb-2 flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-600" />
                驗證成功，請選擇教師
              </div>
              <div className="flex flex-wrap gap-2">
                {matchedSchedules.map((m) => (
                  <button
                    key={m.teacherId}
                    type="button"
                    onClick={() => setSelectedTeacherId(m.teacherId)}
                    className={`px-3 py-1.5 rounded-lg border text-sm ${
                      selectedTeacherId === m.teacherId
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    {m.teacherName || m.teacherId}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {selectedSchedule && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
              <div>
                <div className="font-bold text-slate-800">{selectedSchedule.teacherName} 的代課週課表</div>
                <div className="text-xs text-slate-500">手機末四碼：{selectedSchedule.phoneLast4}</div>
              </div>
              <div className="flex items-center space-x-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
                <button onClick={() => handleWeekNav('prev')} className="p-2 hover:bg-slate-100 rounded text-slate-600">
                  <ChevronLeft size={18} />
                </button>
                <div className="px-3 text-sm font-semibold text-slate-700 min-w-[140px] text-center">
                  {weekDays[0].label} ~ {weekDays[4].label}
                </div>
                <button onClick={() => handleWeekNav('next')} className="p-2 hover:bg-slate-100 rounded text-slate-600">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* 手機版：單日分頁顯示，避免整張大表橫向捲動 */}
            <div className="md:hidden p-3 border-b border-slate-200 bg-slate-50">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {weekDays.map((day, idx) => (
                  <button
                    key={day.dateStr}
                    type="button"
                    onClick={() => setSelectedDayIndex(idx)}
                    className={`shrink-0 px-3 py-2 rounded-lg text-sm border ${
                      idx === selectedDayIndex
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    {day.dayName} {day.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:hidden p-3 space-y-2">
              {PERIOD_ROWS.map((period) => {
                const day = weekDays[selectedDayIndex];
                const key = `${day.dateStr}_${period.id}`;
                const items = slotsByCell.get(key) || [];
                return (
                  <div key={period.id} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 text-sm font-semibold text-slate-700">{period.label}</div>
                    <div className="p-2">
                      {items.length === 0 ? (
                        <div className="text-xs text-slate-400 px-1 py-2">本節無代課安排</div>
                      ) : (
                        <div className="space-y-2">
                          {items.map((slot, idx) => (
                            <div key={idx} className="rounded-md border border-indigo-100 bg-indigo-50/40 p-2 text-xs">
                              <div className="font-semibold text-slate-700">
                                {slot.subject || '未填科目'} | {slot.className || '未填班級'}
                              </div>
                              <div className="text-slate-500 mt-0.5">請假教師：{slot.originalTeacherName || '未填'}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block overflow-auto">
              <table className="w-full border-collapse text-left min-w-[860px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-3 border-b border-r border-slate-200 w-24 text-center text-slate-500 font-bold">節次</th>
                    {weekDays.map((day) => (
                      <th key={day.dateStr} className="p-3 border-b border-r border-slate-200 text-center min-w-[150px]">
                        <div className="font-bold text-slate-700">{day.dayName}</div>
                        <div className="text-xs text-slate-400">{day.label}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERIOD_ROWS.map((period) => (
                    <tr key={period.id}>
                      <td className="p-3 border-b border-r border-slate-200 text-center font-bold text-slate-600 text-sm bg-slate-50/50">
                        {period.label}
                      </td>
                      {weekDays.map((day) => {
                        const key = `${day.dateStr}_${period.id}`;
                        const items = slotsByCell.get(key) || [];
                        return (
                          <td key={key} className="p-2 border-b border-r border-slate-200 align-top h-20">
                            <div className="flex flex-col gap-1.5">
                              {items.map((slot, idx) => (
                                <div key={idx} className="rounded-md border border-indigo-100 bg-indigo-50/40 p-2 text-xs">
                                  <div className="font-semibold text-slate-700">
                                    {slot.subject || '未填科目'} | {slot.className || '未填班級'}
                                  </div>
                                  <div className="text-slate-500 mt-0.5">請假教師：{slot.originalTeacherName || '未填'}</div>
                                </div>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubstituteWeeklyLookup;
