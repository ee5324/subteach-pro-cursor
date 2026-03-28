import type { Teacher, TeacherScheduleSlot } from '../types';

/**
 * 取得「全站綁定學期」（activeSemesterId）應使用的預設課表。
 * - 若該學期在 `defaultSchedulesBySemesterId` 已有鍵（含空陣列），優先使用。
 * - 否則退回 `defaultSchedule`（舊資料相容）。
 */
export function resolveTeacherDefaultSchedule(
  teacher: Teacher | undefined,
  activeSemesterId: string | null | undefined,
): TeacherScheduleSlot[] | undefined {
  if (!teacher) return undefined;
  const sid = activeSemesterId;
  const map = teacher.defaultSchedulesBySemesterId;
  if (sid && map && Object.prototype.hasOwnProperty.call(map, sid)) {
    const v = map[sid];
    return Array.isArray(v) ? v : undefined;
  }
  if (teacher.defaultSchedule && teacher.defaultSchedule.length > 0) {
    return teacher.defaultSchedule;
  }
  return undefined;
}

/**
 * 儲存教師時：若有綁定學期，將表單課表寫入該學期鍵並同步 `defaultSchedule`（供舊路徑相容）。
 */
export function mergeTeacherScheduleForSave(
  teacher: Teacher,
  newSchedule: TeacherScheduleSlot[],
  activeSemesterId: string | null | undefined,
): Teacher {
  if (!activeSemesterId) {
    return { ...teacher, defaultSchedule: newSchedule };
  }
  const map: Record<string, TeacherScheduleSlot[]> = {
    ...(teacher.defaultSchedulesBySemesterId || {}),
  };
  map[activeSemesterId] = newSchedule;
  return {
    ...teacher,
    defaultSchedulesBySemesterId: map,
    defaultSchedule: newSchedule,
  };
}
