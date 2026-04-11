import React, { useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { HOMEROOM_FEE_MONTHLY, LeaveRecord, LeaveType, PayType, SubstituteDetail, Teacher } from '../types';
import { deduplicateDetails, getDaysInMonth, getExpectedDailyRateNoHomeroom } from '../utils/calculations';

const toYMD = (d: string | number | undefined | null): string => {
  if (d == null) return '';
  const s = String(d).trim();
  if (!s) return '';
  const normalized = s.replace(/\//g, '-');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  return normalized;
};

function recordTouchesMonth(r: LeaveRecord, monthStartStr: string, monthEndStr: string): boolean {
  const details = r.details || [];
  const slots = r.slots || [];
  let start = toYMD(r.startDate || '');
  let end = toYMD(r.endDate || '');
  if (!start || !end) {
    const dates = (slots.length > 0 ? slots.map((s) => s.date) : details.map((d) => d.date))
      .map(toYMD)
      .filter(Boolean)
      .sort();
    if (dates.length > 0) {
      start = start || dates[0];
      end = end || dates[dates.length - 1];
    } else {
      start = start || monthStartStr;
      end = end || monthEndStr;
    }
  }
  const inMonthByRange = start <= monthEndStr && end >= monthStartStr;
  const hasAnyDateInMonth = [...details.map((d) => toYMD(d.date)), ...slots.map((s) => toYMD(s.date))].some(
    (date) => date >= monthStartStr && date <= monthEndStr,
  );
  return inMonthByRange || hasAnyDateInMonth;
}

/** 與印領清冊 GAS 邏輯一致：固定兼課身分之請假人不入一般清冊列 */
function isFixedOvertimeLeaveTeacher(leaveTeacherId: string, teachers: Teacher[]): boolean {
  const key = String(leaveTeacherId || '').trim();
  if (!key) return false;
  const t = teachers.find((x) => x.id === key || x.name === key);
  return t?.isFixedOvertimeTeacher === true;
}

function formatDateReceipt(ymd: string): string {
  const y = toYMD(ymd);
  const m = y.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${m[2]}/${m[3]}`;
}

function resolveSubstituteTeacher(
  substituteTeacherId: string,
  teachers: Teacher[],
): Teacher | undefined {
  if (!substituteTeacherId || substituteTeacherId === 'pending') return undefined;
  return teachers.find((t) => t.id === substituteTeacherId || t.name === substituteTeacherId);
}

function substituteDisplayName(substituteTeacherId: string, teachers: Teacher[]): string {
  if (!substituteTeacherId || substituteTeacherId === 'pending') return '待聘';
  return resolveSubstituteTeacher(substituteTeacherId, teachers)?.name ?? substituteTeacherId;
}

function leaveTeacherDisplayName(record: LeaveRecord, teachers: Teacher[]): string {
  const t = teachers.find((x) => x.id === record.originalTeacherId || x.name === record.originalTeacherId);
  return t?.name ?? record.originalTeacherId ?? '—';
}

type LedgerLine = {
  key: string;
  dateYmd: string;
  dateDisplay: string;
  substituteName: string;
  salaryPointsText: string;
  dailyRateText: string;
  subDays: number;
  subPeriods: number;
  substitutePayExclHomeroom: number;
  leaveTeacherName: string;
  leaveTypeLabel: string;
  reason: string;
  note: string;
  homeroomDays: number;
  homeroomFee: number;
  payableAmount: number;
};

function buildLedgerLine(record: LeaveRecord, detail: SubstituteDetail, teachers: Teacher[]): LedgerLine {
  const ymd = toYMD(detail.date);
  const daysInMonth = getDaysInMonth(detail.date) || 30;
  const subTeacher = resolveSubstituteTeacher(detail.substituteTeacherId, teachers);
  const dailyRateNoHm = getExpectedDailyRateNoHomeroom(subTeacher, daysInMonth);

  let lineDays = 0;
  let linePeriods = 0;
  let lineHomeroomDays = 0;
  let lineHomeroomFee = 0;
  let substitutePayExclHm = Number(detail.calculatedAmount) || 0;

  if (detail.payType === PayType.HOURLY) {
    lineDays = 0;
    linePeriods = Number(detail.periodCount) || 0;
    lineHomeroomDays = 0;
    lineHomeroomFee = 0;
  } else if (detail.payType === PayType.HALF_DAY) {
    lineDays = 0.5;
    linePeriods = 0;
    lineHomeroomDays = 0.5;
    lineHomeroomFee = Math.round((HOMEROOM_FEE_MONTHLY / daysInMonth) * 0.5);
    substitutePayExclHm = (Number(detail.calculatedAmount) || 0) - lineHomeroomFee;
  } else {
    lineDays = Number(detail.periodCount) || 0;
    linePeriods = 0;
    lineHomeroomDays = Number(detail.periodCount) || 0;
    lineHomeroomFee = Math.round((HOMEROOM_FEE_MONTHLY / daysInMonth) * lineHomeroomDays);
    substitutePayExclHm = (Number(detail.calculatedAmount) || 0) - lineHomeroomFee;
  }

  let note = '';
  if (detail.payType === PayType.HOURLY) {
    const n = Number(detail.periodCount) || 0;
    note = `0日${n}節`;
    if (detail.selectedPeriods && detail.selectedPeriods.length > 0) {
      note += `(${detail.selectedPeriods.join(',')})`;
    }
  } else if (detail.payType === PayType.HALF_DAY) {
    note = '半日0節';
  } else {
    note = `${lineDays}日0節`;
  }
  if (record.adminNote?.trim()) {
    note = note ? `${note}；${record.adminNote.trim()}` : record.adminNote.trim();
  }

  const salaryPts = subTeacher?.salaryPoints;
  const salaryPointsText = salaryPts != null && salaryPts > 0 ? String(salaryPts) : '—';
  const dailyRateText =
    detail.payType === PayType.HOURLY
      ? '—'
      : dailyRateNoHm != null
        ? String(dailyRateNoHm)
        : '—';

  return {
    key: `${record.id}_${detail.id}`,
    dateYmd: ymd,
    dateDisplay: formatDateReceipt(detail.date),
    substituteName: substituteDisplayName(detail.substituteTeacherId, teachers),
    salaryPointsText,
    dailyRateText,
    subDays: lineDays,
    subPeriods: linePeriods,
    substitutePayExclHomeroom: substitutePayExclHm,
    leaveTeacherName: leaveTeacherDisplayName(record, teachers),
    leaveTypeLabel: record.leaveType,
    reason: record.reason?.trim() ? record.reason.trim() : '—',
    note,
    homeroomDays: lineHomeroomDays,
    homeroomFee: lineHomeroomFee,
    payableAmount: Number(detail.calculatedAmount) || 0,
  };
}

type LeaveTypeGroup = { leaveType: LeaveType; lines: LedgerLine[] };

const TeacherLeavePortal: React.FC = () => {
  const { records, teachers, loading } = useAppStore();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const { monthStartStr, monthEndStr, rocYear, monthNumPadded } = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return {
      monthStartStr: `${selectedMonth}-01`,
      monthEndStr: `${selectedMonth}-${String(lastDay).padStart(2, '0')}`,
      rocYear: year - 1911,
      monthNumPadded: String(month).padStart(2, '0'),
    };
  }, [selectedMonth]);

  const recordsInMonth = useMemo(
    () => records.filter((r) => recordTouchesMonth(r, monthStartStr, monthEndStr)),
    [records, monthStartStr, monthEndStr],
  );

  const groupedByLeaveType = useMemo((): LeaveTypeGroup[] => {
    const map = new Map<LeaveType, LedgerLine[]>();
    for (const r of recordsInMonth) {
      if (isFixedOvertimeLeaveTeacher(r.originalTeacherId, teachers)) continue;
      const lt = r.leaveType;
      if (!map.has(lt)) map.set(lt, []);
      const deduped = deduplicateDetails(r.details || []);
      for (const d of deduped) {
        if (!d.date || !toYMD(d.date).startsWith(selectedMonth)) continue;
        map.get(lt)!.push(buildLedgerLine(r, d, teachers));
      }
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.dateYmd !== b.dateYmd) return a.dateYmd.localeCompare(b.dateYmd);
        if (a.substituteName !== b.substituteName) return a.substituteName.localeCompare(b.substituteName, 'zh-Hant');
        return a.leaveTeacherName.localeCompare(b.leaveTeacherName, 'zh-Hant');
      });
    }
    return (Object.values(LeaveType) as LeaveType[])
      .map((leaveType) => ({ leaveType, lines: map.get(leaveType) || [] }))
      .filter((g) => g.lines.length > 0);
  }, [recordsInMonth, teachers, selectedMonth]);

  const handleMonthChange = (dir: 'prev' | 'next') => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() + (dir === 'next' ? 1 : -1));
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-slate-500 text-base">載入中…</div>
    );
  }

  const tableCell = 'border border-slate-800 px-2 py-2 align-middle text-slate-900';
  const tableHead = `${tableCell} bg-slate-200 font-bold text-center whitespace-nowrap text-base`;

  return (
    <div className="min-h-full bg-slate-100 text-slate-900 print:bg-white">
      <div className="max-w-[min(100%,120rem)] mx-auto px-3 sm:px-4 py-5 md:py-6">
        <div className="mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="text-indigo-600 shrink-0" size={28} />
              教師請假／代課查詢
            </h1>
            <p className="text-sm md:text-base text-slate-600 mt-1.5">
              當月依假別分區，以<strong>代課教師印領清冊</strong>格式呈現（每筆代課明細一列，欄位與產報表清冊一致；不含憑證狀態、公文字號）。
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg shadow-sm shrink-0">
            <button
              type="button"
              onClick={() => handleMonthChange('prev')}
              className="p-2.5 text-slate-600 hover:bg-slate-50 rounded-l-lg border-r border-slate-300"
              aria-label="上個月"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="px-4 py-2.5 flex items-center gap-2 font-semibold text-slate-800 tabular-nums text-base">
              <Calendar size={18} className="text-slate-500" />
              {selectedMonth}
            </div>
            <button
              type="button"
              onClick={() => handleMonthChange('next')}
              className="p-2.5 text-slate-600 hover:bg-slate-50 rounded-r-lg border-l border-slate-300"
              aria-label="下個月"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {groupedByLeaveType.length === 0 ? (
          <div className="rounded-lg border border-slate-300 bg-white p-12 text-center text-slate-600 text-base shadow-sm">
            {selectedMonth} 月份沒有可列入印領清冊格式之代課明細（已排除固定兼課請假人之紀錄；與產報表相同）
          </div>
        ) : (
          <div className="space-y-10 print:space-y-6">
            {groupedByLeaveType.map(({ leaveType, lines }) => {
              const sumDays = lines.reduce((s, x) => s + x.subDays, 0);
              const sumPeriods = lines.reduce((s, x) => s + x.subPeriods, 0);
              const sumSubstitutePay = lines.reduce((s, x) => s + x.substitutePayExclHomeroom, 0);
              const sumHmDays = lines.reduce((s, x) => s + x.homeroomDays, 0);
              const sumHmFee = lines.reduce((s, x) => s + x.homeroomFee, 0);
              const sumPayable = lines.reduce((s, x) => s + x.payableAmount, 0);

              return (
                <section
                  key={leaveType}
                  className="bg-white border border-slate-400 shadow-sm print:shadow-none print:border-black overflow-hidden"
                >
                  <div className="px-3 py-3 border-b border-slate-400 print:border-black">
                    <h2 className="text-lg md:text-xl font-bold text-center leading-snug">
                      代課教師印領清冊　{rocYear}年{monthNumPadded}月　【{leaveType}】
                    </h2>
                    <p className="text-center text-sm text-slate-600 mt-1 print:text-slate-800">
                      共 {lines.length} 筆明細（唯讀）
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-base md:text-lg font-serif">
                      <thead>
                        <tr>
                          <th className={tableHead}>代課日期</th>
                          <th className={tableHead}>代課教師</th>
                          <th className={tableHead}>薪級</th>
                          <th className={tableHead}>日薪</th>
                          <th className={tableHead}>代課天數</th>
                          <th className={tableHead}>代課節數</th>
                          <th className={tableHead}>代課鐘點費</th>
                          <th className={`${tableHead} whitespace-nowrap min-w-[7rem]`}>請假人</th>
                          <th className={tableHead}>假別</th>
                          <th className={`${tableHead} min-w-[6rem]`}>請假事由</th>
                          <th className={`${tableHead} min-w-[7rem]`}>備註</th>
                          <th className={tableHead}>代導師日數</th>
                          <th className={tableHead}>導師費</th>
                          <th className={tableHead}>應發金額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((row) => (
                          <tr key={row.key}>
                            <td className={`${tableCell} text-center font-mono tabular-nums whitespace-nowrap`}>
                              {row.dateDisplay}
                            </td>
                            <td className={`${tableCell} text-center`}>{row.substituteName}</td>
                            <td className={`${tableCell} text-center tabular-nums`}>{row.salaryPointsText}</td>
                            <td className={`${tableCell} text-center tabular-nums`}>{row.dailyRateText}</td>
                            <td className={`${tableCell} text-center tabular-nums`}>
                              {row.subDays === 0 ? '0' : row.subDays % 1 === 0 ? String(row.subDays) : String(row.subDays)}
                            </td>
                            <td className={`${tableCell} text-center tabular-nums`}>{row.subPeriods}</td>
                            <td className={`${tableCell} text-right tabular-nums`}>
                              {row.substitutePayExclHomeroom.toLocaleString()}
                            </td>
                            <td
                              className={`${tableCell} text-center whitespace-nowrap min-w-[7rem]`}
                            >
                              {row.leaveTeacherName}
                            </td>
                            <td className={`${tableCell} text-center text-sm md:text-base leading-snug`}>
                              {row.leaveTypeLabel}
                            </td>
                            <td className={`${tableCell} text-sm md:text-base leading-snug`}>{row.reason}</td>
                            <td className={`${tableCell} text-sm md:text-base`}>{row.note}</td>
                            <td className={`${tableCell} text-center tabular-nums`}>
                              {row.homeroomDays === 0 ? '0' : row.homeroomDays % 1 === 0 ? String(row.homeroomDays) : String(row.homeroomDays)}
                            </td>
                            <td className={`${tableCell} text-right tabular-nums`}>{row.homeroomFee.toLocaleString()}</td>
                            <td className={`${tableCell} text-right font-semibold tabular-nums`}>
                              {row.payableAmount.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-slate-100 font-bold">
                          <td className={tableCell} colSpan={4}>
                            合計
                          </td>
                          <td className={`${tableCell} text-center tabular-nums`}>{String(sumDays)}</td>
                          <td className={`${tableCell} text-center tabular-nums`}>{sumPeriods}</td>
                          <td className={`${tableCell} text-right tabular-nums`}>{sumSubstitutePay.toLocaleString()}</td>
                          <td className={tableCell} colSpan={4} />
                          <td className={`${tableCell} text-center tabular-nums`}>{String(sumHmDays)}</td>
                          <td className={`${tableCell} text-right tabular-nums`}>{sumHmFee.toLocaleString()}</td>
                          <td className={`${tableCell} text-right tabular-nums`}>{sumPayable.toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherLeavePortal;
