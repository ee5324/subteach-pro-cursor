import type { LanguageClassSetting } from '../types';

/** 週課表用星期鍵（主表僅顯示週一至週五） */
export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const WEEKDAY_DEFS: { key: WeekdayKey; label: string; regex: RegExp }[] = [
  { key: 'mon', label: '週一', regex: /週一|星期[一1]|禮拜[一1]|周1|\bW1\b/i },
  { key: 'tue', label: '週二', regex: /週二|星期[二2]|禮拜[二2]|周2|\bW2\b/i },
  { key: 'wed', label: '週三', regex: /週三|星期[三3]|禮拜[三3]|周3|\bW3\b/i },
  { key: 'thu', label: '週四', regex: /週四|星期[四4]|禮拜[四4]|周4|\bW4\b/i },
  { key: 'fri', label: '週五', regex: /週五|星期[五5]|禮拜[五5]|周5|\bW5\b/i },
  { key: 'sat', label: '週六', regex: /週六|星期[六6]|禮拜[六6]|周6|\bW6\b/i },
  { key: 'sun', label: '週日', regex: /週日|週天|星期[日天7]|禮拜[日天]|周7|\bW7\b|Sun/i },
];

const WEEKDAY_ORDER_FRI: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

/** 由上課時間字串推斷星期（取第一個符合者） */
export function weekdayFromLanguageClassTime(time: string | undefined | null): WeekdayKey | null {
  const t = (time ?? '').trim();
  if (!t) return null;
  for (const d of WEEKDAY_DEFS) {
    if (d.regex.test(t)) return d.key;
  }
  return null;
}

export function weekdayLabel(key: WeekdayKey): string {
  return WEEKDAY_DEFS.find((d) => d.key === key)?.label ?? key;
}

export function weekdayColumnsForSchedule(): { key: WeekdayKey; label: string }[] {
  return WEEKDAY_ORDER_FRI.map((key) => ({
    key,
    label: weekdayLabel(key),
  }));
}

/** 依星期分組；無法解析者列入 unmatched */
export function groupLanguageSettingsByWeekday(settings: LanguageClassSetting[]): {
  byDay: Record<WeekdayKey, LanguageClassSetting[]>;
  unmatched: LanguageClassSetting[];
} {
  const byDay: Record<WeekdayKey, LanguageClassSetting[]> = {
    mon: [],
    tue: [],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
    sun: [],
  };
  const unmatched: LanguageClassSetting[] = [];
  for (const s of settings) {
    const d = weekdayFromLanguageClassTime(s.time);
    if (d) byDay[d].push(s);
    else unmatched.push(s);
  }
  const sortFn = (a: LanguageClassSetting, b: LanguageClassSetting) =>
    (a.time ?? '').localeCompare(b.time ?? '', 'zh-Hant', { numeric: true }) ||
    (a.name ?? '').localeCompare(b.name ?? '', 'zh-Hant');
  WEEKDAY_DEFS.forEach(({ key }) => {
    byDay[key].sort(sortFn);
  });
  unmatched.sort(sortFn);
  return { byDay, unmatched };
}

/** 週六日有課的班別（主表外另區塊顯示） */
export function weekendSettings(byDay: Record<WeekdayKey, LanguageClassSetting[]>): LanguageClassSetting[] {
  return [...byDay.sat, ...byDay.sun];
}
