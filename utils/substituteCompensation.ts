import {
  FixedOvertimeConfig,
  HOMEROOM_FEE_MONTHLY,
  HOURLY_RATE,
  LeaveRecord,
  OvertimeRecord,
  PayType,
  Teacher,
} from '../types';
import { deduplicateDetails, getDaysInMonth, getEffectiveFixedOvertimePeriods, parseLocalDate } from './calculations';

type SettingsLite = {
  semesterStart?: string;
  semesterEnd?: string;
};

export interface SubstituteMonthlyBreakdown {
  substituteTotal: number;
  homeroomFeeEstimate: number;
  ptaHomeroomFeeTotal: number;
  overtimeTotal: number;
  fixedOvertimeTotal: number;
  grandTotal: number;
}

const toYmd = (input?: string) => {
  if (!input) return '';
  const d = parseLocalDate(input);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const isWorkingDate = (dateStr: string, holidays: string[], settings?: SettingsLite) => {
  if (!dateStr) return false;
  if (holidays.includes(dateStr)) return false;
  const d = parseLocalDate(dateStr);
  const day = d.getDay();
  if (day < 1 || day > 5) return false;
  if (settings?.semesterStart && dateStr < settings.semesterStart) return false;
  if (settings?.semesterEnd && dateStr > settings.semesterEnd) return false;
  return true;
};

const getMonthWeekdayCounts = (yearMonth: string, holidays: string[], settings?: SettingsLite) => {
  const [year, month] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const counts = [0, 0, 0, 0, 0];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${yearMonth}-${String(d).padStart(2, '0')}`;
    if (!isWorkingDate(dateStr, holidays, settings)) continue;
    const dow = parseLocalDate(dateStr).getDay();
    counts[dow - 1] += 1;
  }
  return counts;
};

const estimateHomeroomFeeFromDetail = (date: string, payType: PayType, periodCount?: number) => {
  if (payType !== PayType.DAILY && payType !== PayType.HALF_DAY) return 0;
  const daysInMonth = getDaysInMonth(date);
  const dailyHomeroom = HOMEROOM_FEE_MONTHLY / daysInMonth;
  if (payType === PayType.HALF_DAY) return Math.round(dailyHomeroom * 0.5 * (periodCount || 1));
  return Math.round(dailyHomeroom * (periodCount || 1));
};

const estimateHalfDayHomeroomFee = (date: string) => {
  const daysInMonth = getDaysInMonth(date);
  const dailyHomeroom = HOMEROOM_FEE_MONTHLY / daysInMonth;
  return Math.round(dailyHomeroom * 0.5);
};

export function calculateSubstituteMonthlyBreakdown(args: {
  teacherId: string;
  yearMonth: string;
  records: LeaveRecord[];
  teachers: Teacher[];
  overtimeRecords: OvertimeRecord[];
  fixedOvertimeConfig: FixedOvertimeConfig[];
  holidays: string[];
  settings?: SettingsLite;
  activeSemesterId?: string | null;
}): SubstituteMonthlyBreakdown {
  const {
    teacherId,
    yearMonth,
    records,
    teachers,
    overtimeRecords,
    fixedOvertimeConfig,
    holidays,
    settings,
    activeSemesterId,
  } = args;

  let substituteTotal = 0;
  let homeroomFeeEstimate = 0;
  let ptaHomeroomFeeTotal = 0;
  records.forEach((record) => {
    const details = deduplicateDetails(record.details || []);
    // 家長會支出導師費（半天）：依「代課老師 + 日期」計一次，避免同日多筆明細重複加總
    const ptaDateSeen = new Set<string>();
    details.forEach((d) => {
      if (d.substituteTeacherId !== teacherId) return;
      if (toYmd(d.date).startsWith(yearMonth) !== true) return;
      if (d.isOvertime === true) return;
      substituteTotal += Number(d.calculatedAmount) || 0;
      const hm = estimateHomeroomFeeFromDetail(d.date, d.payType, d.periodCount);
      homeroomFeeEstimate += hm;
      // 家長會導師費（半天）：只要勾選且非「自理」，就按「半天導師費」列入（不綁 payType）
      if (record.homeroomFeeByPta === true && record.leaveType !== '自理 (事假/病假)') {
        const configuredDateKeys = (record.homeroomFeeByPtaDateKeys || []).filter(Boolean);
        const dateKey = toYmd(d.date);
        if (configuredDateKeys.length > 0 && configuredDateKeys.includes(dateKey) !== true) return;
        // 無設定新欄位時，fallback：僅鐘點費可觸發半日導師費（避免同張單混合日薪時誤計）
        if (configuredDateKeys.length === 0 && d.payType !== PayType.HOURLY) return;
        if (!ptaDateSeen.has(dateKey)) {
          ptaDateSeen.add(dateKey);
          ptaHomeroomFeeTotal += estimateHalfDayHomeroomFee(d.date);
        }
      }
    });
  });

  const overtimeRecord = overtimeRecords.find((x) => x.teacherId === teacherId && x.yearMonth === yearMonth);
  let overtimePeriods = 0;
  if (overtimeRecord) {
    const slots = overtimeRecord.overtimeSlots || [];
    if (slots.length > 0) {
      const [year, month] = yearMonth.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${yearMonth}-${String(d).padStart(2, '0')}`;
        if (!isWorkingDate(dateStr, holidays, settings)) continue;
        const dow = parseLocalDate(dateStr).getDay();
        overtimePeriods += slots.filter((s) => s.day === dow).length;
      }
      overtimePeriods += Number(overtimeRecord.adjustment || 0);
    } else {
      const base = Math.max(0, Number(overtimeRecord.weeklyActual || 0) - Number(overtimeRecord.weeklyBasic || 0));
      overtimePeriods = Math.ceil(base * Number(overtimeRecord.weeksCount || 0)) + Number(overtimeRecord.adjustment || 0);
    }
  }
  overtimePeriods = Math.max(0, overtimePeriods);
  const overtimeFromRecord = overtimePeriods * HOURLY_RATE;

  // 超鐘點清冊（OvertimeRecord）為主；若該月清冊核算為 0，但請假紀錄已有標示超鐘點之代課明細，則以明細金額加總作為超鐘點（避免另冊未登錄時總額漏計）
  let overtimeFromLeaveDetails = 0;
  records.forEach((record) => {
    const details = deduplicateDetails(record.details || []);
    details.forEach((d) => {
      if (d.substituteTeacherId !== teacherId) return;
      if (toYmd(d.date).startsWith(yearMonth) !== true) return;
      if (d.isOvertime !== true) return;
      overtimeFromLeaveDetails += Number(d.calculatedAmount) || 0;
    });
  });

  const overtimeTotal =
    overtimeFromRecord > 0 ? overtimeFromRecord : overtimeFromLeaveDetails;

  const teacher = teachers.find((t) => t.id === teacherId);
  const fixedConfig = fixedOvertimeConfig.find((c) => c.teacherId === teacherId);
  let fixedOvertimeTotal = 0;
  if (fixedConfig) {
    const weekdayCounts = getMonthWeekdayCounts(yearMonth, holidays, settings);
    const periods = getEffectiveFixedOvertimePeriods(teacher, fixedConfig, activeSemesterId);
    const expectedPeriods = periods.reduce((sum, p, idx) => sum + Number(p || 0) * (weekdayCounts[idx] || 0), 0);
    const adjustedPeriods = Math.max(0, expectedPeriods + Number(fixedConfig.adjustment || 0));
    fixedOvertimeTotal = Math.round(adjustedPeriods * HOURLY_RATE);
  }

  const grandTotal = substituteTotal + ptaHomeroomFeeTotal + overtimeTotal + fixedOvertimeTotal;
  return {
    substituteTotal,
    homeroomFeeEstimate,
    ptaHomeroomFeeTotal,
    overtimeTotal,
    fixedOvertimeTotal,
    grandTotal,
  };
}
