/**
 * 超鐘點清冊匯出：月週次結構與「逐日淨超鐘點→週欄」加總（與 gas/OvertimeManager._getMonthlyWeeksStructure 對齊）
 */
import type { LeaveRecord, Teacher } from '../types';
import { normalizeDateString, parseLocalDate } from './calculations';

export type OvertimeExportMonthWeek = {
  label: string;
  startDay: number;
  endDay: number;
  /** 該週區間內，週一～五是否為有效工作日（與 GAS 相同語意） */
  days: number[];
  hasDays: boolean;
};

function isExportWorkingDay(
  dateStr: string,
  semesterStartStr?: string,
  semesterEndStr?: string,
  holidays: string[] = [],
): boolean {
  const dateObj = parseLocalDate(dateStr);
  if (semesterStartStr && dateStr < normalizeDateString(semesterStartStr)) return false;
  if (semesterEndStr && dateStr > normalizeDateString(semesterEndStr)) return false;
  const h = new Set(holidays.map((x) => normalizeDateString(x)));
  if (h.has(dateStr)) return false;
  return true;
}

/** 與 GAS OvertimeManager._getMonthlyWeeksStructure 相同邏輯 */
export function getMonthlyWeeksStructureForOvertimeExport(
  year: number,
  month: number,
  semesterStartStr?: string,
  semesterEndStr?: string,
  holidays: string[] = [],
): OvertimeExportMonthWeek[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const weeks: OvertimeExportMonthWeek[] = [];
  let currentWeekDays = [0, 0, 0, 0, 0];
  let hasDaysInWeek = false;
  let rangeStart = -1;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dateObj = parseLocalDate(dateStr);
    const dayOfWeek = dateObj.getDay();

    const isWorking = isExportWorkingDay(dateStr, semesterStartStr, semesterEndStr, holidays);

    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      if (rangeStart === -1) rangeStart = d;
      if (isWorking) {
        currentWeekDays[dayOfWeek - 1] = 1;
        hasDaysInWeek = true;
      }
    }

    if (dayOfWeek === 6 || d === daysInMonth) {
      if (rangeStart !== -1) {
        let rangeEnd = d;
        if (dayOfWeek === 6) rangeEnd = d - 1;
        if (dayOfWeek === 0) rangeEnd = d - 2;
        if (rangeEnd > daysInMonth) rangeEnd = daysInMonth;

        const label = `${month}/${rangeStart}-${month}/${rangeEnd}`;
        weeks.push({
          label,
          startDay: rangeStart,
          endDay: rangeEnd,
          days: [...currentWeekDays],
          hasDays: hasDaysInWeek,
        });
      }
      currentWeekDays = [0, 0, 0, 0, 0];
      hasDaysInWeek = false;
      rangeStart = -1;
    }
  }

  return weeks;
}

function isSlotOnLeave(
  teacherId: string,
  dateStr: string,
  slotPeriod: string,
  leaveRecords: LeaveRecord[],
): boolean {
  return leaveRecords.some((r) => {
    if (r.originalTeacherId !== teacherId) return false;
    const normStart = normalizeDateString(r.startDate);
    const normEnd = normalizeDateString(r.endDate);
    if (dateStr < normStart || dateStr > normEnd) return false;

    if (r.slots && r.slots.length > 0) {
      const slotsForThisDay = r.slots.filter((s) => normalizeDateString(s.date) === dateStr);
      if (slotsForThisDay.length > 0) {
        return slotsForThisDay.some((s) => String(s.period) === String(slotPeriod));
      }
      return false;
    }
    if (r.details && r.details.length > 0) {
      const detailsForThisDay = r.details.filter((det) => normalizeDateString(det.date) === dateStr);
      if (detailsForThisDay.length > 0) {
        return detailsForThisDay.some((det) => {
          if (!det.selectedPeriods || det.selectedPeriods.length === 0) return true;
          return det.selectedPeriods.map((p) => String(p).trim()).includes(String(slotPeriod));
        });
      }
      return false;
    }
    return true;
  });
}

/**
 * 精確模式：依「日曆日」計入超鐘點節次，若該節請假則不計；再依月週次加總到 H～L 對應週。
 * 避免 GAS 以「每週重複週一～五模板」導致請假週仍顯示節數。
 */
export function computeWeeklyExportCountsForPreciseOvertime(
  teacherId: string,
  overtimeSlots: { day: number; period: string }[],
  weeks: OvertimeExportMonthWeek[],
  year: number,
  month: number,
  leaveRecords: LeaveRecord[],
  teacher: Teacher | undefined,
  graduationDate: string | undefined,
  semesterStartStr?: string,
  semesterEndStr?: string,
  holidays: string[] = [],
): number[] {
  const counts: number[] = [];
  const normGrad = graduationDate ? normalizeDateString(graduationDate) : '';

  for (let wi = 0; wi < 5; wi++) {
    const w = weeks[wi];
    if (!w) {
      counts.push(0);
      continue;
    }
    let weekTotal = 0;
    for (let d = w.startDay; d <= w.endDay; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dateObj = parseLocalDate(dateStr);
      const jsDow = dateObj.getDay();
      if (jsDow < 1 || jsDow > 5) continue;
      if (!isExportWorkingDay(dateStr, semesterStartStr, semesterEndStr, holidays)) continue;

      let dayOfWeek = jsDow;
      if (dayOfWeek === 0) dayOfWeek = 7;

      const dailySlots = overtimeSlots.filter((s) => s.day === dayOfWeek);
      for (const slot of dailySlots) {
        if (teacher?.isGraduatingHomeroom && normGrad && dateStr > normGrad) continue;
        if (isSlotOnLeave(teacherId, dateStr, slot.period, leaveRecords)) continue;
        weekTotal++;
      }
    }
    counts.push(weekTotal);
  }

  return counts;
}
