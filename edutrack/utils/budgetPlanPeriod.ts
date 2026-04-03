/**
 * 計畫預算「年度」與「學年度」之民國年期間說明
 * - 年度：民國 n 年 1/1～12/31（曆年）
 * - 學年度：民國 n 年 2/1～民國 (n+1) 年 1/31
 */
import type { BudgetPlanPeriodKind } from '../types';

export function periodKindLabel(kind: BudgetPlanPeriodKind | undefined): string {
  return kind === 'calendar_year' ? '年度' : '學年度';
}

/** 民國年 → 西元年份起算用（民國 1 = 1912） */
export function rocToGregorianYear(roc: number): number {
  return 1911 + roc;
}

/** 今日之民國曆年（數字） */
export function currentRocCalendarYear(d = new Date()): number {
  return d.getFullYear() - 1911;
}

/**
 * 今日所屬「學年度」之民國年數字（2/1 起算；1 月仍屬上一學年度）
 * 例：民國 115 年 1 月 → 114 學年度；115 年 2 月 → 115 學年度
 */
export function currentRocAcademicYear(d = new Date()): number {
  const roc = currentRocCalendarYear(d);
  const month = d.getMonth(); // 0=一月
  if (month === 0) return roc - 1;
  return roc;
}

/** 列表／篩選預設：學年度 + 目前學年度 */
export function defaultFilterAcademicYearString(): string {
  return String(currentRocAcademicYear());
}

/**
 * 新增計畫時依期間類型帶入「現在」的民國年：
 * - 學年度：2/1 起算；1 月仍屬上一學年度（例：民國 115 年 1 月 → 114 學年度）
 * - 年度：曆年民國年（例：民國 115 年 → 115 年度）
 */
export function defaultRocYearStringForPeriodKind(kind: BudgetPlanPeriodKind, d = new Date()): string {
  if (kind === 'calendar_year') return String(currentRocCalendarYear(d));
  return String(currentRocAcademicYear(d));
}

/** 人類可讀期間（民國月日） */
export function periodRangeDescription(kind: BudgetPlanPeriodKind | undefined, rocYearStr: string): string {
  const n = parseInt(rocYearStr, 10);
  if (Number.isNaN(n)) return '';
  if (kind === 'calendar_year') {
    return `民國${n}年 1/1～12/31（${n} 年度）`;
  }
  return `民國${n}年 2/1～民國${n + 1}年 1/31（${n} 學年度）`;
}
