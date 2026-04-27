/**
 * 語言選修 B 方案：學生主檔集合 + 學年 doc 僅存設定與版本標記。
 * 不讀寫 Subteach／其他系統集合。
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  deleteField,
  serverTimestamp,
  type Firestore,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { COLLECTIONS } from "./firebase";
import type { LanguageElectiveStudent, LanguageClassSetting, LanguageElectiveRosterDoc } from "../types";

export const STUDENT_ROSTER_VERSION = 2;

type YearSnap = {
  className: string;
  seat: string;
  name: string;
  language: string;
  languageClass?: string | null;
  proficiencyGroup?: string | null;
  booklet?: string | null;
};

function trimStr(v: unknown): string {
  return v != null ? String(v).trim() : "";
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 16);
}

export function sanitizeStudentDocIdFromStudentId(studentId: string): string {
  return studentId.trim().replace(/\//g, "_").replace(/\s+/g, "");
}

export function pickProfileDocId(student: LanguageElectiveStudent, academicYear: string): string {
  const sid = trimStr(student.studentId);
  if (sid) return sanitizeStudentDocIdFromStudentId(sid);
  const existing = trimStr(student.profileDocId);
  if (existing) return existing;
  const cn = trimStr(student.className);
  const seat = trimStr(student.seat);
  const name = trimStr(student.name);
  return `PRE_${academicYear}_${simpleHash(`${cn}|${seat}|${name}`)}`;
}

function snapshotRowFromDoc(d: QueryDocumentSnapshot, year: string): LanguageElectiveStudent | null {
  return rowFromPlainProfile(d.id, d.data() as Record<string, unknown>, year);
}

export function projectRosterFromProfileDocs(
  docs: QueryDocumentSnapshot[],
  academicYear: string
): LanguageElectiveStudent[] {
  return projectRosterFromPlainEntries(
    docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> })),
    academicYear
  );
}

function yearSnapFromStudent(s: LanguageElectiveStudent): YearSnap {
  return {
    className: trimStr(s.className),
    seat: trimStr(s.seat),
    name: trimStr(s.name),
    language: trimStr(s.language),
    languageClass: trimStr(s.languageClass) || null,
    proficiencyGroup: trimStr(s.proficiencyGroup) || null,
    booklet: trimStr(s.booklet) || null,
  };
}


/** 供 Sandbox：以純物件投影某學年名單 */
export function rowFromPlainProfile(id: string, data: Record<string, unknown>, year: string): LanguageElectiveStudent | null {
  const years = data.years as Record<string, YearSnap> | undefined;
  const y = years?.[year];
  if (y && typeof y === "object") {
    return {
      className: trimStr(y.className),
      seat: trimStr(y.seat),
      name: trimStr(y.name),
      language: trimStr(y.language),
      languageClass: trimStr(y.languageClass) || undefined,
      proficiencyGroup: trimStr(y.proficiencyGroup) || undefined,
      booklet: trimStr(y.booklet) || undefined,
      studentId: trimStr(data.studentId) || undefined,
      profileDocId: id,
    };
  }
  if (trimStr(data.academicYear) === year) {
    return {
      className: trimStr(data.className),
      seat: trimStr(data.seat),
      name: trimStr(data.name),
      language: trimStr(data.language),
      languageClass: trimStr(data.languageClass) || undefined,
      proficiencyGroup: trimStr(data.proficiencyGroup) || undefined,
      booklet: trimStr(data.booklet) || undefined,
      studentId: trimStr(data.studentId) || undefined,
      profileDocId: id,
    };
  }
  return null;
}

export function projectRosterFromPlainEntries(
  entries: readonly { id: string; data: Record<string, unknown> }[],
  academicYear: string
): LanguageElectiveStudent[] {
  const out: LanguageElectiveStudent[] = [];
  for (const { id, data } of entries) {
    const row = rowFromPlainProfile(id, data, academicYear);
    if (row) out.push(row);
  }
  out.sort((a, b) => {
    const c = a.className.localeCompare(b.className, undefined, { numeric: true });
    if (c !== 0) return c;
    const sa = parseInt(a.seat, 10);
    const sb = parseInt(b.seat, 10);
    if (!Number.isNaN(sa) && !Number.isNaN(sb) && sa !== sb) return sa - sb;
    return a.seat.localeCompare(b.seat, undefined, { numeric: true });
  });
  return out;
}

/** Sandbox：與 saveLanguageElectiveRosterBackend 相同語意，寫入記憶體 profiles */
export function applyLanguageElectiveSaveInMemory(
  profiles: Record<string, Record<string, unknown>>,
  academicYear: string,
  students: LanguageElectiveStudent[]
): void {
  const existingById = new Map(Object.entries(profiles));
  const mergePairs = collectStudentIdMergePairs(students);
  const deletedPreIds = new Set<string>();
  const mergedBaseBySid = new Map<string, Record<string, unknown>>();

  for (const [preId, sidId] of mergePairs) {
    const preData = (existingById.get(preId) as Record<string, unknown> | undefined) ?? {};
    const sidData = (existingById.get(sidId) as Record<string, unknown> | undefined) ?? {};
    if (!Object.keys(preData).length && !Object.keys(sidData).length) continue;
    mergedBaseBySid.set(sidId, mergeTwoProfileRawDatas(preData, sidData, sidId));
    if (Object.keys(preData).length) deletedPreIds.add(preId);
  }

  const incomingIds = new Set(students.map((s) => pickProfileDocId(s, academicYear)));

  for (const st of students) {
    const docId = pickProfileDocId(st, academicYear);
    let data: Record<string, unknown>;
    const mergedOnce = mergedBaseBySid.get(docId);
    if (mergedOnce) {
      data = { ...mergedOnce };
      mergedBaseBySid.delete(docId);
    } else {
      data = (existingById.get(docId) as Record<string, unknown> | undefined) ?? {};
    }
    let years = cloneYears(data);
    years = promoteTopLevelToYears(data, years);
    const snap = yearSnapFromStudent(st);
    years[academicYear] = snap;
    const sid = trimStr(st.studentId) || null;
    profiles[docId] = {
      profileDocId: docId,
      studentId: sid,
      academicYear,
      className: snap.className,
      seat: snap.seat,
      name: snap.name,
      language: snap.language,
      languageClass: snap.languageClass ?? null,
      years,
      updatedAt: new Date().toISOString(),
    };
  }

  for (const [docId, dataUnknown] of existingById) {
    if (deletedPreIds.has(docId)) continue;
    if (incomingIds.has(docId)) continue;
    const data = dataUnknown as Record<string, unknown>;
    const inYear =
      trimStr(data.academicYear) === academicYear ||
      !!(data.years && (data.years as Record<string, unknown>)[academicYear]);
    if (!inYear) continue;

    let years = cloneYears(data);
    years = promoteTopLevelToYears(data, years);
    delete years[academicYear];

    let newAy = trimStr(data.academicYear);
    if (newAy === academicYear) {
      const rest = Object.keys(years).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
      newAy = rest[0] ?? "";
    }

    const y0 = newAy && years[newAy] ? years[newAy] : null;
    const top = y0
      ? {
          academicYear: newAy,
          className: y0.className,
          seat: y0.seat,
          name: y0.name,
          language: y0.language,
          languageClass: y0.languageClass ?? null,
        }
      : {
          academicYear: "",
          className: "",
          seat: "",
          name: "",
          language: "",
          languageClass: null,
        };

    profiles[docId] = {
      ...top,
      years,
      profileDocId: docId,
      studentId: data.studentId ?? null,
      updatedAt: new Date().toISOString(),
    };
  }

  for (const preId of deletedPreIds) {
    delete profiles[preId];
  }
}

function cloneYears(data: Record<string, unknown> | undefined): Record<string, YearSnap> {
  const raw = (data?.years as Record<string, YearSnap> | undefined) ?? {};
  const out: Record<string, YearSnap> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v && typeof v === "object") {
      out[k] = {
        className: trimStr((v as YearSnap).className),
        seat: trimStr((v as YearSnap).seat),
        name: trimStr((v as YearSnap).name),
        language: trimStr((v as YearSnap).language),
        languageClass: trimStr((v as YearSnap).languageClass) || null,
        proficiencyGroup: trimStr((v as YearSnap).proficiencyGroup) || null,
        booklet: trimStr((v as YearSnap).booklet) || null,
      };
    }
  }
  return out;
}

function promoteTopLevelToYears(data: Record<string, unknown>, years: Record<string, YearSnap>): Record<string, YearSnap> {
  const ay = trimStr(data.academicYear);
  if (!ay || years[ay]) return years;
  years[ay] = {
    className: trimStr(data.className),
    seat: trimStr(data.seat),
    name: trimStr(data.name),
    language: trimStr(data.language),
    languageClass: trimStr(data.languageClass) || null,
    proficiencyGroup: trimStr(data.proficiencyGroup) || null,
    booklet: trimStr(data.booklet) || null,
  };
  return years;
}

/** 同一學年快照：欄位以「學號主檔（後者）」優先，空則補 PRE 端資料 */
function mergeYearSnapPreferSid(preSnap: YearSnap, sidSnap: YearSnap): YearSnap {
  return {
    className: trimStr(sidSnap.className) || trimStr(preSnap.className),
    seat: trimStr(sidSnap.seat) || trimStr(preSnap.seat),
    name: trimStr(sidSnap.name) || trimStr(preSnap.name),
    language: trimStr(sidSnap.language) || trimStr(preSnap.language),
    languageClass: trimStr(sidSnap.languageClass) || trimStr(preSnap.languageClass) || null,
    proficiencyGroup: trimStr(sidSnap.proficiencyGroup) || trimStr(preSnap.proficiencyGroup) || null,
    booklet: trimStr(sidSnap.booklet) || trimStr(preSnap.booklet) || null,
  };
}

const emptyYearSnap = (): YearSnap => ({
  className: "",
  seat: "",
  name: "",
  language: "",
  languageClass: null,
  proficiencyGroup: null,
  booklet: null,
});

/**
 * 合併 PRE_ 暫存主檔與學號主檔的 years／頂層欄位，產出以 canonicalStudentId（學號 doc id）為準的基底物件。
 * preData：舊 PRE 文件；sidData：既有學號文件（可空）。
 */
export function mergeTwoProfileRawDatas(
  preData: Record<string, unknown>,
  sidData: Record<string, unknown>,
  canonicalStudentId: string
): Record<string, unknown> {
  let preYears = cloneYears(preData);
  preYears = promoteTopLevelToYears(preData, preYears);
  let sidYears = cloneYears(sidData);
  sidYears = promoteTopLevelToYears(sidData, sidYears);
  const allY = new Set([...Object.keys(preYears), ...Object.keys(sidYears)]);
  const mergedYears: Record<string, YearSnap> = {};
  for (const y of allY) {
    mergedYears[y] = mergeYearSnapPreferSid(preYears[y] ?? emptyYearSnap(), sidYears[y] ?? emptyYearSnap());
  }
  const ayPre = trimStr(preData.academicYear);
  const aySid = trimStr(sidData.academicYear);
  let pickAy = "";
  if (ayPre && aySid) {
    pickAy = parseInt(aySid, 10) >= parseInt(ayPre, 10) ? aySid : ayPre;
  } else {
    pickAy = aySid || ayPre;
  }
  const fallbackYear = [...allY].sort((a, b) => parseInt(b, 10) - parseInt(a, 10))[0] ?? "";
  const topFrom =
    (pickAy && mergedYears[pickAy] ? mergedYears[pickAy] : null) ??
    (fallbackYear ? mergedYears[fallbackYear] : null) ??
    emptyYearSnap();
  return {
    studentId: canonicalStudentId,
    profileDocId: canonicalStudentId,
    academicYear: pickAy || fallbackYear,
    className: topFrom.className,
    seat: topFrom.seat,
    name: topFrom.name,
    language: topFrom.language,
    languageClass: topFrom.languageClass ?? null,
    proficiencyGroup: topFrom.proficiencyGroup ?? null,
    booklet: topFrom.booklet ?? null,
    years: mergedYears,
  };
}

/**
 * 從本次儲存名單偵測「補學號合併」：列上同時有學號與 PRE_ profileDocId，且學號 doc id ≠ PRE id。
 * 回傳 Map：PRE document id → 學號 document id（後列覆蓋前列若同一 PRE 對多學號）。
 */
export function collectStudentIdMergePairs(students: LanguageElectiveStudent[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of students) {
    const sid = trimStr(s.studentId);
    const pre = trimStr(s.profileDocId);
    if (!sid || !pre.startsWith("PRE_")) continue;
    const sidDocId = sanitizeStudentDocIdFromStudentId(sid);
    if (pre === sidDocId) continue;
    map.set(pre, sidDocId);
  }
  return map;
}

export function buildRosterForYear(
  profileDocs: QueryDocumentSnapshot[],
  academicYear: string,
  yearDocSnap: DocumentSnapshot | undefined
): LanguageElectiveRosterDoc {
  const yd = yearDocSnap?.exists() ? yearDocSnap.data() : undefined;
  const fromProfiles = projectRosterFromProfileDocs(profileDocs, academicYear);
  const v2 = yd?.studentRosterVersion === STUDENT_ROSTER_VERSION;
  let students = fromProfiles;
  if (students.length === 0 && !v2 && Array.isArray(yd?.students) && yd.students.length > 0) {
    students = (yd.students as LanguageElectiveStudent[]).map((s) => ({
      ...s,
      profileDocId: pickProfileDocId(s, academicYear),
    }));
  }
  return {
    academicYear,
    semester: trimStr(yd?.semester) || undefined,
    students,
    languageClassSettings: Array.isArray(yd?.languageClassSettings) ? yd.languageClassSettings : undefined,
    updatedAt: yd?.updatedAt?.toDate?.()?.toISOString?.() ?? (typeof yd?.updatedAt === "string" ? yd.updatedAt : undefined),
  };
}

export async function loadLanguageElectiveRosterBackend(db: Firestore, academicYear: string): Promise<LanguageElectiveRosterDoc> {
  const [profSnap, yearSnap] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.LANGUAGE_ELECTIVE_STUDENTS)),
    getDoc(doc(db, COLLECTIONS.LANGUAGE_ELECTIVE, academicYear)),
  ]);
  return buildRosterForYear(profSnap.docs, academicYear, yearSnap.exists() ? yearSnap : undefined);
}

export async function loadAllLanguageElectiveRostersBackend(db: Firestore): Promise<LanguageElectiveRosterDoc[]> {
  const [profSnap, yearColSnap] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.LANGUAGE_ELECTIVE_STUDENTS)),
    getDocs(collection(db, COLLECTIONS.LANGUAGE_ELECTIVE)),
  ]);
  const profileDocs = profSnap.docs;
  const yearSet = new Set<string>();
  for (const d of yearColSnap.docs) yearSet.add(d.id);
  for (const d of profileDocs) {
    const data = d.data();
    const ys = data.years as Record<string, unknown> | undefined;
    if (ys) Object.keys(ys).forEach((k) => yearSet.add(k));
    const ay = trimStr(data.academicYear);
    if (ay) yearSet.add(ay);
  }
  const years = Array.from(yearSet).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
  const yearById = new Map(yearColSnap.docs.map((d) => [d.id, d]));
  return years.map((y) => buildRosterForYear(profileDocs, y, yearById.get(y)));
}

type BatchOp = (b: ReturnType<typeof writeBatch>) => void;

async function commitOps(db: Firestore, ops: BatchOp[]): Promise<void> {
  const CHUNK = 400;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = writeBatch(db);
    ops.slice(i, i + CHUNK).forEach((fn) => fn(batch));
    await batch.commit();
  }
}

export async function saveLanguageElectiveRosterBackend(
  db: Firestore,
  academicYear: string,
  students: LanguageElectiveStudent[],
  languageClassSettings?: LanguageClassSetting[]
): Promise<void> {
  const studentsCol = COLLECTIONS.LANGUAGE_ELECTIVE_STUDENTS;
  const yearRef = doc(db, COLLECTIONS.LANGUAGE_ELECTIVE, academicYear);

  const profileSnap = await getDocs(collection(db, studentsCol));
  const existingById = new Map(profileSnap.docs.map((d) => [d.id, d]));

  const mergePairs = collectStudentIdMergePairs(students);
  const deletedPreIds = new Set<string>();
  const mergedBaseBySid = new Map<string, Record<string, unknown>>();

  for (const [preId, sidId] of mergePairs) {
    const preEntry = existingById.get(preId);
    const sidEntry = existingById.get(sidId);
    const preData = preEntry ? (preEntry.data() as Record<string, unknown>) : {};
    const sidData = sidEntry ? (sidEntry.data() as Record<string, unknown>) : {};
    if (!Object.keys(preData).length && !Object.keys(sidData).length) continue;
    mergedBaseBySid.set(sidId, mergeTwoProfileRawDatas(preData, sidData, sidId));
    if (preEntry) deletedPreIds.add(preId);
  }

  const incomingIds = new Set(students.map((s) => pickProfileDocId(s, academicYear)));

  const ops: BatchOp[] = [];

  for (const s of students) {
    const docId = pickProfileDocId(s, academicYear);
    const ref = doc(db, studentsCol, docId);
    let data: Record<string, unknown>;
    const mergedOnce = mergedBaseBySid.get(docId);
    if (mergedOnce) {
      data = { ...mergedOnce };
      mergedBaseBySid.delete(docId);
    } else {
      const existing = existingById.get(docId);
      data = (existing?.data() as Record<string, unknown>) ?? {};
    }
    let years = cloneYears(data);
    years = promoteTopLevelToYears(data, years);
    const snap = yearSnapFromStudent(s);
    years[academicYear] = snap;
    const sid = trimStr(s.studentId) || null;
    const payload: Record<string, unknown> = {
      profileDocId: docId,
      studentId: sid,
      academicYear,
      className: snap.className,
      seat: snap.seat,
      name: snap.name,
      language: snap.language,
      languageClass: snap.languageClass ?? null,
      proficiencyGroup: snap.proficiencyGroup ?? null,
      booklet: snap.booklet ?? null,
      years,
      updatedAt: serverTimestamp(),
    };
    ops.push((b) => b.set(ref, payload, { merge: true }));
  }

  for (const [docId, d] of existingById) {
    if (deletedPreIds.has(docId)) continue;
    if (incomingIds.has(docId)) continue;
    const data = d.data() as Record<string, unknown>;
    const inYear =
      trimStr(data.academicYear) === academicYear ||
      !!(data.years && (data.years as Record<string, unknown>)[academicYear]);
    if (!inYear) continue;

    let years = cloneYears(data);
    years = promoteTopLevelToYears(data, years);
    delete years[academicYear];

    let newAy = trimStr(data.academicYear);
    if (newAy === academicYear) {
      const rest = Object.keys(years).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
      newAy = rest[0] ?? "";
    }

    const ref = doc(db, studentsCol, docId);
    const y0 = newAy && years[newAy] ? years[newAy] : null;
    const top = y0
      ? {
          academicYear: newAy,
          className: y0.className,
          seat: y0.seat,
          name: y0.name,
          language: y0.language,
          languageClass: y0.languageClass ?? null,
          proficiencyGroup: y0.proficiencyGroup ?? null,
          booklet: y0.booklet ?? null,
        }
      : {
          academicYear: "",
          className: "",
          seat: "",
          name: "",
          language: "",
          languageClass: null,
          proficiencyGroup: null,
          booklet: null,
        };

    ops.push((b) =>
      b.set(
        ref,
        {
          ...top,
          years,
          profileDocId: docId,
          studentId: data.studentId ?? null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  for (const preId of deletedPreIds) {
    ops.push((b) => b.delete(doc(db, studentsCol, preId)));
  }

  await commitOps(db, ops);

  const settingsPayload =
    languageClassSettings?.map((s) => ({
      id: s.id ?? "",
      name: s.name ?? "",
      classroom: s.classroom ?? null,
      time: s.time ?? null,
      teacher: s.teacher ?? null,
    })) ?? undefined;

  const metaPayload: Record<string, unknown> = {
    academicYear,
    studentRosterVersion: STUDENT_ROSTER_VERSION,
    students: deleteField(),
    updatedAt: serverTimestamp(),
  };
  if (settingsPayload !== undefined) metaPayload.languageClassSettings = settingsPayload;
  await setDoc(yearRef, metaPayload, { merge: true });
}
