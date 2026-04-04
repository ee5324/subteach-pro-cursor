import React, { useMemo, useState, useEffect } from 'react';
import { addDoc, collection, getDocs, limit, query, serverTimestamp, where } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Calendar, ShieldCheck, Wallet } from 'lucide-react';
import { db } from '../src/lib/firebase';
import { maskTaiwanMobileDigits, normalizeTaiwanMobileDigits } from '../utils/taiwanPhone';

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

type PublicMonthFinanceRow = {
  date: string;
  originalTeacherName: string;
  periodText: string;
  amount: number;
  isPtaHomeroom?: boolean;
};

type PublicMonthFinance = {
  rows: PublicMonthFinanceRow[];
  substituteTotal: number;
  homeroomFeeEstimate: number;
  ptaHomeroomFeeTotal: number;
  overtimeTotal: number;
  fixedOvertimeTotal: number;
  grandTotal: number;
};

type PublicSubstituteScheduleDoc = {
  teacherId: string;
  teacherName: string;
  phoneDigits: string;
  slots: PublicSubstituteSlot[];
  monthlyFinance?: Record<string, PublicMonthFinance>;
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

function currentYearMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

/** 成功查詢後寫入瀏覽紀錄（後台統計用；失敗不影響查詢） */
function logSubstituteWeeklyLookupViews(
  dbRef: NonNullable<typeof db>,
  rows: Pick<PublicSubstituteScheduleDoc, 'teacherId' | 'teacherName'>[],
) {
  const yearMonth = currentYearMonth();
  for (const row of rows) {
    if (!row.teacherId) continue;
    void addDoc(collection(dbRef, 'substituteWeeklyLookupViews'), {
      teacherId: row.teacherId,
      teacherName: String(row.teacherName || ''),
      yearMonth,
      viewedAt: serverTimestamp(),
      source: 'sub-weekly',
    }).catch(() => {});
  }
}

function shiftYearMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatYearMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${y}年${m}月`;
}

const SubstituteWeeklyLookup: React.FC = () => {
  const [phoneInput, setPhoneInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [matchedSchedules, setMatchedSchedules] = useState<PublicSubstituteScheduleDoc[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState(new Date());
  const [financeViewMonth, setFinanceViewMonth] = useState(currentYearMonth);

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

  const monthFinanceForView = useMemo(() => {
    const mf = selectedSchedule?.monthlyFinance;
    if (!mf || typeof mf !== 'object') return null;
    return mf[financeViewMonth] ?? null;
  }, [selectedSchedule, financeViewMonth]);

  const hasMonthlyFinancePayload = useMemo(() => {
    const mf = selectedSchedule?.monthlyFinance;
    return mf != null && typeof mf === 'object' && Object.keys(mf).length > 0;
  }, [selectedSchedule]);

  useEffect(() => {
    setFinanceViewMonth(currentYearMonth());
  }, [selectedTeacherId]);

  const handleSearch = async () => {
    const normalized = normalizeTaiwanMobileDigits(phoneInput);
    if (!normalized) {
      setError('請輸入有效的台灣手機全碼（10 碼，09 開頭）');
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
        where('phoneDigits', '==', normalized),
        limit(20),
      );
      const snap = await getDocs(q);
      const rows: PublicSubstituteScheduleDoc[] = snap.docs.map((d) => {
        const data = d.data() as Partial<PublicSubstituteScheduleDoc>;
        const mf = data.monthlyFinance;
        return {
          teacherId: data.teacherId || d.id,
          teacherName: data.teacherName || '',
          phoneDigits: data.phoneDigits || normalized,
          slots: Array.isArray(data.slots) ? data.slots : [],
          monthlyFinance:
            mf != null && typeof mf === 'object' ? (mf as Record<string, PublicMonthFinance>) : undefined,
        };
      });
      if (rows.length === 0) {
        setError('查無資料，請確認手機號碼是否與教師資料一致，或請教學組確認是否已排入代課。（若剛改為全碼查詢，請待教學組登入後同步一次）');
        return;
      }
      logSubstituteWeeklyLookupViews(db, rows);
      setMatchedSchedules(rows);
      setSelectedTeacherId(rows[0].teacherId);
      setViewDate(new Date());
      setFinanceViewMonth(currentYearMonth());
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
            輸入與教師資料相同的台灣手機全碼（10 碼）即可查詢本人的代課週課表與月薪資摘要。驗證通過後僅顯示該手機對應之資料。
          </p>

          <form
            className="mt-4 flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSearch();
            }}
          >
            <input
              type="tel"
              inputMode="tel"
              maxLength={16}
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              className="w-full sm:max-w-xs px-3 py-3 text-base border border-slate-300 rounded-lg"
              placeholder="例如 0912345678"
              autoComplete="tel"
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
          <>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-800">{selectedSchedule.teacherName} 的代課週課表</div>
                  <div className="text-xs text-slate-500">手機：{maskTaiwanMobileDigits(selectedSchedule.phoneDigits)}</div>
                </div>
                <div className="flex items-center space-x-2 bg-slate-50 p-1 rounded-lg border border-slate-200 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handleWeekNav('prev')}
                    className="p-2 hover:bg-slate-100 rounded text-slate-600"
                    aria-label="上一週"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="px-3 text-sm font-semibold text-slate-700 min-w-[140px] text-center">
                    {weekDays[0].label} ~ {weekDays[4].label}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleWeekNav('next')}
                    className="p-2 hover:bg-slate-100 rounded text-slate-600"
                    aria-label="下一週"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
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

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/50">
                <div className="flex items-center gap-2 font-semibold text-slate-800">
                  <Wallet size={20} className="text-indigo-600 shrink-0" />
                  月薪資與代課明細
                </div>
                <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setFinanceViewMonth((m) => shiftYearMonth(m, -1))}
                    className="p-2 hover:bg-slate-100 rounded text-slate-600"
                    aria-label="上一個月"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="px-3 text-sm font-semibold text-slate-800 min-w-[120px] text-center tabular-nums">
                    {formatYearMonthLabel(financeViewMonth)}
                  </div>
                  <button
                    type="button"
                    onClick={() => setFinanceViewMonth((m) => shiftYearMonth(m, 1))}
                    className="p-2 hover:bg-slate-100 rounded text-slate-600"
                    aria-label="下一個月"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>

              <div className="p-4">
                {!hasMonthlyFinancePayload && (
                  <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
                    尚無月薪資資料：請教學組以<strong className="font-semibold">已授權帳號登入主系統</strong>
                    ，系統會自動同步後即可用左右箭頭檢視各月摘要。
                  </p>
                )}

                {hasMonthlyFinancePayload && !monthFinanceForView && (
                  <p className="text-sm text-slate-500 mb-4">
                    {formatYearMonthLabel(financeViewMonth)} 尚無已同步的薪資摘要（可能該月無紀錄，或尚未納入同步範圍）。請嘗試切換其他月份。
                  </p>
                )}

                {monthFinanceForView && (
                  <>
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-sm mb-4">
                      <div className="flex justify-between p-3">
                        <span>代課費（含導師費）</span>
                        <span className="font-semibold">${monthFinanceForView.substituteTotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between p-3 text-slate-500">
                        <span>導師費（估算，已含於代課費）</span>
                        <span>${monthFinanceForView.homeroomFeeEstimate.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between p-3 text-violet-700 bg-violet-50/60">
                        <span>家長會導師費（加計）</span>
                        <span className="font-semibold">${monthFinanceForView.ptaHomeroomFeeTotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between p-3">
                        <span>超鐘點</span>
                        <span className="font-semibold">${monthFinanceForView.overtimeTotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between p-3">
                        <span>固定兼課</span>
                        <span className="font-semibold">${monthFinanceForView.fixedOvertimeTotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between p-3 bg-emerald-50">
                        <span className="font-bold">合計</span>
                        <span className="font-bold text-emerald-700">${monthFinanceForView.grandTotal.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-700">
                        代課狀況明細（{financeViewMonth}）
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px] text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-slate-600 border-b border-slate-200">日期</th>
                              <th className="px-3 py-2 text-left text-slate-600 border-b border-slate-200">請假教師</th>
                              <th className="px-3 py-2 text-left text-slate-600 border-b border-slate-200">節數</th>
                              <th className="px-3 py-2 text-right text-slate-600 border-b border-slate-200">金額</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {monthFinanceForView.rows.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                                  本月無代課明細（若有超鐘點／固定兼課，請見上方合計）
                                </td>
                              </tr>
                            ) : (
                              monthFinanceForView.rows.map((row, idx) => (
                                <tr key={`${row.date}_${row.originalTeacherName}_${idx}`}>
                                  <td className="px-3 py-2 text-slate-700">{row.date}</td>
                                  <td className="px-3 py-2 text-slate-700">{row.originalTeacherName}</td>
                                  <td className="px-3 py-2 text-slate-600">
                                    {row.periodText}
                                    {row.isPtaHomeroom && (
                                      <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                                        家長會導師費
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold text-slate-700">
                                    ${row.amount.toLocaleString()}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SubstituteWeeklyLookup;
