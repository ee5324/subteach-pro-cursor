import type { MonthlyRecurringTodoRule } from '../types';

/** 該月最後一日與 dayOfMonth 取較小（合法日期） */
export function clampDayOfMonth(year: number, monthIndex0: number, dayOfMonth: number): number {
  const last = new Date(year, monthIndex0 + 1, 0).getDate();
  return Math.min(Math.max(1, Math.floor(dayOfMonth) || 1), last);
}

export function yearMonthKeyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** 某日期是否為此規則在當月應出現的那一天 */
export function ruleMatchesCalendarDate(rule: MonthlyRecurringTodoRule, date: Date): boolean {
  const y = date.getFullYear();
  const monthIndex = date.getMonth();
  const calMonth = monthIndex + 1;
  const months =
    rule.months && rule.months.length > 0
      ? rule.months
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (!months.includes(calMonth)) return false;
  const dom = clampDayOfMonth(y, monthIndex, rule.dayOfMonth);
  return date.getDate() === dom;
}

export function statusForRuleOnDate(rule: MonthlyRecurringTodoRule, date: Date): 'pending' | 'done' | 'cancelled' {
  const key = yearMonthKeyFromDate(date);
  return rule.monthCompletions?.[key] ?? 'pending';
}
