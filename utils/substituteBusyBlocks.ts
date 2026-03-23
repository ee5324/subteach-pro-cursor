import type { SubstituteBusyBlock, SubstituteBusyPeriodMode } from '../types';
import { parseLocalDate } from './calculations';

/** 與代課資料總表（SubstituteOverview）節次欄位一致（列順序＝範圍起迄依此順序） */
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

const PERIOD_ORDER_IDS = SUBSTITUTE_BUSY_PERIOD_OPTIONS.map(p => p.id);

/** 上午：早自習～第 4 節 */
const MORNING_PERIOD_IDS = ['早', '1', '2', '3', '4'];
/** 下午：午休～第 7 節 */
const AFTERNOON_PERIOD_IDS = ['午', '5', '6', '7'];

const WEEKDAY_LABELS = ['', '週一', '週二', '週三', '週四', '週五'];

export function getNormalizedPeriodMode(b: SubstituteBusyBlock): SubstituteBusyPeriodMode {
  if (b.periodMode) return b.periodMode;
  if (b.period) return 'single';
  return 'single';
}

/**
 * 展開此筆紀錄涵蓋的節次 id；無效資料回傳空陣列。
 */
export function expandSubstituteBusyPeriods(b: SubstituteBusyBlock): string[] {
  const mode = getNormalizedPeriodMode(b);
  if (mode === 'single') {
    const p = b.period;
    return p && PERIOD_ORDER_IDS.includes(p) ? [p] : [];
  }
  if (mode === 'range') {
    const f = b.periodFrom ?? b.period;
    const t = b.periodTo ?? b.period;
    if (!f || !t) return [];
    let i = PERIOD_ORDER_IDS.indexOf(f);
    let j = PERIOD_ORDER_IDS.indexOf(t);
    if (i < 0 || j < 0) return [];
    if (i > j) [i, j] = [j, i];
    return PERIOD_ORDER_IDS.slice(i, j + 1);
  }
  if (mode === 'morning') return [...MORNING_PERIOD_IDS];
  if (mode === 'afternoon') return [...AFTERNOON_PERIOD_IDS];
  if (mode === 'fullday') return [...PERIOD_ORDER_IDS];
  return [];
}

function periodLabel(id: string): string {
  return SUBSTITUTE_BUSY_PERIOD_OPTIONS.find(p => p.id === id)?.label || id;
}

/**
 * 將 YYYY-MM-DD 轉為 JS getDay() 可比對之「週一至週五」；週末回傳 null（總表不顯示）。
 */
export function dateToWeekdayMonFri(dateStr: string): number | null {
  const d = parseLocalDate(dateStr);
  const wd = d.getDay();
  if (wd === 0 || wd === 6) return null;
  return wd;
}

function blockAppliesToDate(b: SubstituteBusyBlock, dateStr: string): boolean {
  if (b.kind === 'date') {
    return Boolean(b.date && b.date === dateStr);
  }
  if (b.kind === 'weekly' && b.weekday != null) {
    const cellWd = dateToWeekdayMonFri(dateStr);
    if (cellWd === null) return false;
    if (cellWd !== b.weekday) return false;
    if (b.validFrom && dateStr < b.validFrom) return false;
    if (b.validTo && dateStr > b.validTo) return false;
    return true;
  }
  return false;
}

/**
 * 代課老師於該日該節是否落在任一忙碌登記範圍內（單日／每週固定；單節～整天）。
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
    if (b.teacherId !== teacherId) continue;
    if (!blockAppliesToDate(b, dateStr)) continue;
    const expanded = expandSubstituteBusyPeriods(b);
    if (expanded.length === 0) continue;
    if (!expanded.includes(period)) continue;
    const mode = getNormalizedPeriodMode(b);
    const defaultMsg = b.kind === 'date' ? '此日忙碌／不接' : '每週此時段忙碌／不接';
    const scopeSuffix =
      mode === 'single'
        ? ''
        : mode === 'range' && b.periodFrom && b.periodTo
          ? ` ${periodLabel(b.periodFrom)}～${periodLabel(b.periodTo)}`
          : mode === 'morning'
            ? '（上午）'
            : mode === 'afternoon'
              ? '（下午）'
              : mode === 'fullday'
                ? '（整天）'
                : '';
    const custom = b.note?.trim();
    notes.push(custom ? `${custom}${mode === 'single' ? '' : scopeSuffix}` : `${defaultMsg}${scopeSuffix}`);
  }
  return { matched: notes.length > 0, notes };
}

export function formatSubstituteBusyBlockSummary(b: SubstituteBusyBlock): string {
  const mode = getNormalizedPeriodMode(b);
  let span = '';
  if (mode === 'single') {
    span = periodLabel(b.period || '—');
  } else if (mode === 'range') {
    const f = b.periodFrom ?? b.period;
    const t = b.periodTo ?? b.period;
    span = f && t ? `${periodLabel(f)}～${periodLabel(t)}` : '節次範圍（資料不完整）';
  } else if (mode === 'morning') {
    span = '上午（早～第4節）';
  } else if (mode === 'afternoon') {
    span = '下午（午休～第7節）';
  } else if (mode === 'fullday') {
    span = '整天（早～第7節）';
  }

  if (b.kind === 'date') {
    return `${b.date || '（未填日期）'} ${span}`;
  }
  const wd =
    b.weekday != null && b.weekday >= 1 && b.weekday <= 5 ? WEEKDAY_LABELS[b.weekday] : '週？';
  const range =
    b.validFrom || b.validTo
      ? `（${b.validFrom || '起'}～${b.validTo || '迄'}）`
      : '';
  return `每${wd} ${span}${range}`;
}
