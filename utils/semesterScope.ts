import type { FixedOvertimeConfig, OvertimeRecord, SemesterDefinition } from '../types';

const SEP = '__';

/** 固定兼課設定：有綁定學期時為 `${semesterId}__${teacherId}`，舊資料僅 `teacherId` */
export function fixedOvertimeFirestoreId(semesterId: string | null | undefined, teacherId: string): string {
  if (!semesterId) return teacherId;
  return `${semesterId}${SEP}${teacherId}`;
}

export function parseFixedOvertimeDocId(docId: string): { semesterId: string | null; teacherId: string } {
  const i = docId.indexOf(SEP);
  if (i === -1) return { semesterId: null, teacherId: docId };
  return { semesterId: docId.slice(0, i), teacherId: docId.slice(i + SEP.length) };
}

/** 超鐘點紀錄：有綁定學期時為 `${semesterId}__${yearMonth}__${teacherId}`，舊資料為 `${yearMonth}_${teacherId}` */
export function overtimeRecordFirestoreId(
  semesterId: string | null | undefined,
  yearMonth: string,
  teacherId: string,
): string {
  if (!semesterId) return `${yearMonth}_${teacherId}`;
  return `${semesterId}${SEP}${yearMonth}${SEP}${teacherId}`;
}

export function parseOvertimeRecordDocId(docId: string): {
  semesterId: string | null;
  yearMonth: string;
  teacherId: string;
} | null {
  const parts = docId.split(SEP);
  if (parts.length === 3) {
    return { semesterId: parts[0], yearMonth: parts[1], teacherId: parts[2] };
  }
  const m = docId.match(/^(\d{4}-\d{2})_(.+)$/);
  if (m) return { semesterId: null, yearMonth: m[1], teacherId: m[2] };
  return null;
}

/** 該曆月是否與學期區間有交集（用於舊超鐘點紀錄無 semesterId 時歸屬） */
export function monthOverlapsSemester(yearMonth: string, sem: SemesterDefinition): boolean {
  const [y, mo] = yearMonth.split('-').map(Number);
  if (!y || !mo) return false;
  const first = new Date(y, mo - 1, 1).getTime();
  const last = new Date(y, mo, 0).getTime();
  const start = new Date(sem.startDate + 'T00:00:00').getTime();
  const end = new Date(sem.endDate + 'T23:59:59').getTime();
  return last >= start && first <= end;
}

export function deriveOvertimeRecordsForScope(
  raw: OvertimeRecord[],
  activeSemesterId: string | null,
  semesters: SemesterDefinition[],
): OvertimeRecord[] {
  if (!activeSemesterId) return raw;
  const sem = semesters.find((s) => s.id === activeSemesterId);
  if (!sem) return raw.filter((r) => r.semesterId === activeSemesterId);
  return raw.filter((r) => {
    if (r.semesterId === activeSemesterId) return true;
    if (r.semesterId) return false;
    return monthOverlapsSemester(r.yearMonth, sem);
  });
}

/**
 * 固定兼課：同一教師若已有該學期專用文件，優先採用；否則回退僅 teacherId 的舊文件（視為本綁定學期用）。
 */
export function deriveFixedOvertimeForScope(
  raw: Array<FixedOvertimeConfig & { _firestoreId?: string }>,
  activeSemesterId: string | null,
): Array<FixedOvertimeConfig & { _firestoreId?: string }> {
  if (!activeSemesterId) return raw;
  const byTeacher = new Map<string, FixedOvertimeConfig & { _firestoreId?: string }>();
  for (const c of raw) {
    const sid = c.semesterId;
    if (sid === activeSemesterId) {
      byTeacher.set(c.teacherId, c);
    }
  }
  for (const c of raw) {
    if (c.semesterId) continue;
    if (!byTeacher.has(c.teacherId)) {
      byTeacher.set(c.teacherId, { ...c, semesterId: activeSemesterId });
    }
  }
  return Array.from(byTeacher.values());
}

export function findOvertimeRecord(
  records: OvertimeRecord[],
  yearMonth: string,
  teacherId: string,
  activeSemesterId: string | null | undefined,
): OvertimeRecord | undefined {
  const canonical = overtimeRecordFirestoreId(activeSemesterId, yearMonth, teacherId);
  const legacy = `${yearMonth}_${teacherId}`;
  return records.find((r) => r.id === canonical || r.id === legacy);
}
