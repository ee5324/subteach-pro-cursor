import type { FixedOvertimeConfig, LeaveRecord, Teacher } from '../types';

/**
 * 代課印領清冊／GAS 排除用：固定兼課請假人 id／姓名鍵集合。
 * 與 Records 匯出、SheetManager fixedOtLeaveKeySet 辨識一致：
 * (1) 教師管理「固定兼課教師」 (2) 固定兼課設定內之 teacherId（含對應姓名，相容舊紀錄存姓名）
 */
export function getFixedOvertimeTeacherIdSet(
  teachers: Teacher[] | undefined,
  fixedOvertimeConfig: FixedOvertimeConfig[] | undefined,
): Set<string> {
  const s = new Set<string>();
  const add = (v: string | undefined | null) => {
    const x = String(v ?? '').trim();
    if (x) s.add(x);
  };
  (teachers || []).forEach((t) => {
    if (t.isFixedOvertimeTeacher) {
      add(t.id);
      add(t.name);
    }
  });
  (fixedOvertimeConfig || []).forEach((c) => {
    add(c.teacherId);
    const t = (teachers || []).find((x) => x.id === c.teacherId);
    add(t?.name);
  });
  return s;
}

/** 該筆請假是否應自「一般代課」印領清冊排除（改列固定兼課清冊） */
export function shouldExcludeLeaveRecordFromSubteachLedger(
  record: LeaveRecord,
  teachers: Teacher[] | undefined,
  fixedOvertimeConfig: FixedOvertimeConfig[] | undefined,
): boolean {
  const fixedOvertimeTeacherIdSet = getFixedOvertimeTeacherIdSet(teachers, fixedOvertimeConfig);
  const oid = String(record.originalTeacherId ?? '').trim();
  if (!oid) return false;
  if (fixedOvertimeTeacherIdSet.has(oid)) return true;
  const byId = (teachers || []).find((t) => t.id === oid);
  if (
    byId &&
    (byId.isFixedOvertimeTeacher === true ||
      (fixedOvertimeConfig || []).some((c) => c.teacherId === byId.id))
  ) {
    return true;
  }
  return false;
}
