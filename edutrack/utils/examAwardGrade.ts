import type { ExamAwardItem, ExamAwardsConfig } from '../types';

function normalizeExamAwardItem(it: Record<string, unknown> | null | undefined): ExamAwardItem {
  const row = it ?? {};
  const gradesRaw = row.gradesApplicable;
  let gradesApplicable: number[] | undefined;
  if (Array.isArray(gradesRaw)) {
    const nums = gradesRaw
      .map((x) => parseInt(String(x), 10))
      .filter((n) => !Number.isNaN(n) && n >= 1 && n <= 12);
    gradesApplicable = [...new Set(nums)].sort((a, b) => a - b);
    if (gradesApplicable.length === 0) gradesApplicable = undefined;
  }
  const id = String(row.id ?? row.label ?? '').trim() || `item-${Date.now()}`;
  return {
    id,
    label: String(row.label ?? ''),
    gradesApplicable,
  };
}

/** 讀取 Firestore／Sandbox 後正規化獎項結構 */
export function normalizeExamAwardsConfig(raw: Partial<ExamAwardsConfig> | Record<string, unknown> | null | undefined): ExamAwardsConfig {
  const r = raw as Record<string, unknown> | undefined;
  const cats = Array.isArray(r?.categories) ? (r.categories as Record<string, unknown>[]) : [];
  const rawTi = r?.teacherInstructions;
  const teacherInstructions =
    typeof rawTi === 'string' && rawTi.trim() !== '' ? rawTi.trim() : null;
  return {
    categories: cats.map((c, idx) => ({
      id: String(c?.id ?? '').trim() || `cat-${idx}`,
      label: String(c?.label ?? ''),
      items: Array.isArray(c?.items) ? (c.items as Record<string, unknown>[]).map((it) => normalizeExamAwardItem(it)) : [],
    })),
    teacherInstructions,
    updatedAt:
      typeof r?.updatedAt === 'string'
        ? r.updatedAt
        : (r?.updatedAt as { toDate?: () => Date } | undefined)?.toDate?.()?.toISOString?.(),
  };
}

/** 班級代碼如 701、1001 → 年級數字（百位或前 1～2 碼） */
export function parseGradeFromClassName(className: string | null | undefined): number | null {
  const s = (className ?? '').trim();
  const m = s.match(/^(\d{1,2})(\d{2})$/);
  if (m) return parseInt(m[1], 10);
  const d = s.replace(/\D/g, '');
  if (d.length >= 3) return parseInt(d.slice(0, 1), 10) || null;
  if (d.length > 0) return parseInt(d[0], 10) || null;
  return null;
}

/** 未設定或空陣列＝適用所有年級 */
export function isExamAwardItemApplicableForGrade(item: ExamAwardItem, grade: number | null): boolean {
  if (grade == null) return true;
  const g = item.gradesApplicable;
  if (g == null || g.length === 0) return true;
  return g.includes(grade);
}

export function filterExamAwardsConfigForGrade(config: ExamAwardsConfig, grade: number | null): ExamAwardsConfig {
  if (grade == null) return config;
  return {
    ...config,
    categories: config.categories.map((cat) => ({
      ...cat,
      items: (cat.items ?? []).filter((it) => isExamAwardItemApplicableForGrade(it, grade)),
    })),
  };
}

export function buildVisibleAwardKeySet(config: ExamAwardsConfig, grade: number | null): Set<string> {
  const set = new Set<string>();
  for (const cat of config.categories) {
    for (const it of cat.items ?? []) {
      if (isExamAwardItemApplicableForGrade(it, grade)) {
        set.add(`${cat.id}:${it.id}`);
      }
    }
  }
  return set;
}

export const EXAM_AWARD_GRADE_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export function formatGradesApplicableShort(grades?: number[] | null): string {
  if (grades == null || grades.length === 0) return '全部年級';
  return [...grades]
    .sort((a, b) => a - b)
    .map((g) => `${g}年級`)
    .join('、');
}
