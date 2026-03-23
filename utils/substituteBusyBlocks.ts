import type { SubstituteBusyBlock } from '../types';
import { parseLocalDate } from './calculations';

/** 與代課資料總表（SubstituteOverview）節次欄位一致 */
export const SUBSTITUTE_BUSY_PERIOD_OPTIONS: { id: string; label: string }[] = [
  { id: '早', label: '早自習' },
  { id: '1', label: '第 1 節' },
  { id: '2', label: '第 2 節' },
  { id: '3', label: '第 3 節' },
  { id: '4', label: '第 4 節' },
  { id: '午', label: '午休' },
  { id: '5', label: '第 5 節' },
  { id: '6', label: '第 6 節' },
  { id: '7', label: '第 7 節' },
];

const WEEKDAY_LABELS = ['', '週一', '週二', '週三', '週四', '週五'];

/**
 * 將 YYYY-MM-DD 轉為 JS getDay() 可比對之「週一至週五」；週末回傳 null（總表不顯示）。
 */
export function dateToWeekdayMonFri(dateStr: string): number | null {
  const d = parseLocalDate(dateStr);
  const wd = d.getDay();
  if (wd === 0 || wd === 6) return null;
  return wd;
}

/**
 * 代課老師於該日該節是否有登記「忙碌／不接」（單日或每週固定 + 選填有效區間）。
 */
export function getSubstituteBusyMatch(
  teacherId: string | null | undefined,
  dateStr: string,
  period: string,
  blocks: SubstituteBusyBlock[]
): { matched: boolean; notes: string[] } {
  if (!teacherId) return { matched: false, notes: [] };
  const notes: string[] = [];
  for (const b of blocks) {
    if (b.teacherId !== teacherId || b.period !== period) continue;
    if (b.kind === 'date') {
      if (b.date && b.date === dateStr) {
        notes.push((b.note && b.note.trim()) || '已登記此日此節忙碌／不接');
      }
      continue;
    }
    if (b.kind === 'weekly' && b.weekday != null) {
      const cellWd = dateToWeekdayMonFri(dateStr);
      if (cellWd === null) continue;
      if (cellWd !== b.weekday) continue;
      if (b.validFrom && dateStr < b.validFrom) continue;
      if (b.validTo && dateStr > b.validTo) continue;
      notes.push((b.note && b.note.trim()) || '固定此週幾此節不接');
    }
  }
  return { matched: notes.length > 0, notes };
}

export function formatSubstituteBusyBlockSummary(b: SubstituteBusyBlock): string {
  const periodLabel = SUBSTITUTE_BUSY_PERIOD_OPTIONS.find(p => p.id === b.period)?.label || b.period;
  if (b.kind === 'date') {
    return `${b.date || '（未填日期）'} ${periodLabel}`;
  }
  const wd =
    b.weekday != null && b.weekday >= 1 && b.weekday <= 5 ? WEEKDAY_LABELS[b.weekday] : '週？';
  const range =
    b.validFrom || b.validTo
      ? `（${b.validFrom || '起'}～${b.validTo || '迄'}）`
      : '';
  return `每${wd} ${periodLabel}${range}`;
}
