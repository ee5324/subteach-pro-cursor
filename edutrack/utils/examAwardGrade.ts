import type { ExamAwardItem, ExamAwardsConfig, ExamSubmissionStudent } from '../types';

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

/** 單一學生 awards 去重（保留順序） */
export function dedupeAwardKeys(keys: string[]): string[] {
  return [...new Set(keys)];
}

/** `categoryId:itemId` → 顯示用「分類 · 細項」 */
export function awardKeyToDisplayLabel(key: string, config: ExamAwardsConfig): string {
  const idx = key.indexOf(':');
  if (idx <= 0) return key;
  const catId = key.slice(0, idx);
  const itemId = key.slice(idx + 1);
  const cat = config.categories.find((c) => c.id === catId);
  const item = cat?.items?.find((i) => i.id === itemId);
  const catL = cat?.label ?? catId;
  const itemL = item?.label ?? itemId;
  return `${catL} · ${itemL}`;
}

/**
 * 偵測：同一獎項細項（key）是否被多位學生勾選。
 * 每位學生內部先 dedupe awards 再統計。
 */
export function findAwardKeysWithMultipleStudents(
  students: Pick<ExamSubmissionStudent, 'awards' | 'seat' | 'name'>[]
): { key: string; labels: string[] }[] {
  const map = new Map<string, string[]>();
  for (const stu of students) {
    const uniq = dedupeAwardKeys(stu.awards);
    const label = `${String(stu.seat)}號 ${stu.name}`;
    for (const k of uniq) {
      const arr = map.get(k) ?? [];
      arr.push(label);
      map.set(k, arr);
    }
  }
  const out: { key: string; labels: string[] }[] = [];
  for (const [k, labels] of map) {
    if (labels.length > 1) out.push({ key: k, labels });
  }
  return out;
}

/** 偵測：同一學生在同一分類是否勾選超過一個細項。 */
export function findStudentCategoryMultiSelectConflicts(
  students: Pick<ExamSubmissionStudent, 'awards' | 'seat' | 'name'>[]
): { categoryId: string; studentLabel: string; awardKeys: string[] }[] {
  const out: { categoryId: string; studentLabel: string; awardKeys: string[] }[] = [];
  for (const stu of students) {
    const uniq = dedupeAwardKeys(stu.awards);
    const byCategory = new Map<string, string[]>();
    for (const key of uniq) {
      const idx = key.indexOf(':');
      if (idx <= 0) continue;
      const categoryId = key.slice(0, idx);
      const arr = byCategory.get(categoryId) ?? [];
      arr.push(key);
      byCategory.set(categoryId, arr);
    }
    const studentLabel = `${String(stu.seat)}號 ${stu.name}`;
    for (const [categoryId, awardKeys] of byCategory) {
      if (awardKeys.length > 1) out.push({ categoryId, studentLabel, awardKeys });
    }
  }
  return out;
}
