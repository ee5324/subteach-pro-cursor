/**
 * 統一 API 層
 * - 文字資料：Firebase Firestore（Sandbox 時改為記憶體模擬）
 * - 本土語名單紀錄（課程＋學生）：僅存於 Firestore，不寫入 Google 試算表；GAS 僅負責建立 Drive 點名單檔案。
 * - 附檔／點名單檔案／頒獎 Doc：GAS → Google Drive（Sandbox 時為 mock）
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { getDb, COLLECTIONS, BUDGET_PLAN_LEDGER_SUBCOLLECTION } from './firebase';
import {
  loadLanguageElectiveRosterBackend,
  loadAllLanguageElectiveRostersBackend,
  saveLanguageElectiveRosterBackend,
} from './languageElectiveStudentBackend';

import { DEFAULT_LANGUAGE_OPTIONS } from '../utils/languageOptions';
import type {
  Student,
  AwardRecord,
  Vendor,
  ArchiveTask,
  TodoItem,
  Attachment,
  ExamPaper,
  ExamPaperFolder,
  ExamPaperCheck,
  LanguageElectiveStudent,
  LanguageElectiveRosterDoc,
  LanguageClassSetting,
  CalendarSettings,
  BudgetPlan,
  BudgetPlanPeriodKind,
  BudgetPlanAdvance,
  BudgetAdvanceStatus,
  BudgetPlanLedgerEntry,
  BudgetPlanLedgerKind,
  BudgetPlanLedgerPaymentStatus,
  MonthlyRecurringTodoRule,
} from '../types';
import {
  isSandbox,
  mockGasPost,
  sandboxGetHistory,
  sandboxGetCourseStudents,
  sandboxSaveCourseConfig,
  sandboxGetSemesterData,
  sandboxGetAwardHistory,
  sandboxSaveAwardRecord,
  sandboxGetAllKnownStudents,
  sandboxGetVendors,
  sandboxSaveVendor,
  sandboxDeleteVendor,
  sandboxGetBudgetPlans,
  sandboxGetBudgetPlan,
  sandboxSaveBudgetPlan,
  sandboxDeleteBudgetPlan,
  sandboxUpdateBudgetPlanFinancialRollups,
  sandboxGetBudgetPlanLedgerEntries,
  sandboxSaveBudgetPlanLedgerEntry,
  sandboxDeleteBudgetPlanLedgerEntry,
  sandboxGetBudgetPlanAdvances,
  sandboxSaveBudgetPlanAdvance,
  sandboxDeleteBudgetPlanAdvance,
  sandboxGetArchiveTasks,
  sandboxSaveArchiveTask,
  sandboxDeleteArchiveTask,
  sandboxGetTodos,
  sandboxSaveTodo,
  sandboxSaveBatchTodos,
  sandboxDeleteTodo,
  sandboxCancelSeries,
  sandboxToggleTodoStatus,
  sandboxGetMonthlyRecurringTodoRules,
  sandboxSaveMonthlyRecurringTodoRule,
  sandboxDeleteMonthlyRecurringTodoRule,
  sandboxUpdateMonthlyRecurringMonthStatus,
  sandboxGetExamPaperFolders,
  sandboxSaveExamPaperFolder,
  sandboxDeleteExamPaperFolder,
  sandboxGetExamPapers,
  sandboxSaveExamPaper,
  sandboxDeleteExamPaper,
  sandboxGetExamPaperChecks,
  sandboxSetExamPaperCheck,
  sandboxGetLanguageElectiveRoster,
  sandboxGetAllLanguageElectiveRosters,
  sandboxSaveLanguageElectiveRoster,
  sandboxGetLanguageOptions,
  sandboxSaveLanguageOptions,
  sandboxGetCalendarSettings,
  sandboxGetExamCampaigns,
  sandboxCreateExamCampaign,
  sandboxUpdateExamCampaign,
  sandboxGetExamAwardsConfig,
  sandboxSaveExamAwardsConfig,
  sandboxGetExamSubmitAllowedUsers,
  sandboxSetExamSubmitAllowedUser,
  sandboxDeleteExamSubmitAllowedUser,
  sandboxGetExamSubmitAllowedUser,
  sandboxGetExamSubmissions,
  sandboxSaveExamSubmission,
  sandboxUnlockExamSubmission,
  sandboxGetSchoolTeacherNames,
  sandboxGetHomeroomTeachersForExamWhitelist,
} from './sandboxStore';
import type { ExamCampaign, ExamAwardsConfig, ExamSubmitAllowedUser, ExamSubmission } from '../types';
import { normalizeExamAwardsConfig } from '../utils/examAwardGrade';
import { stripUndefinedDeep } from '../utils/stripUndefinedDeep';

const GAS_API_URL = import.meta.env.VITE_GAS_API_URL || 'https://script.google.com/macros/s/AKfycbzWyYHtUbAMIFGBtMtXGvdXuAIiml1pAdf0qKykQ3vzCY5QFdAsMjCoyZ_Znam7oxRC/exec';

async function gasPost(action: string, payload: unknown = {}): Promise<{ success: boolean; data?: any; message?: string }> {
  if (isSandbox()) return mockGasPost(action, payload);
  const res = await fetch(GAS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload }),
  });
  return res.json();
}

/** 學校教師名單（供受款人輸入自動建議） */
export async function getSchoolTeacherNames(): Promise<string[]> {
  if (isSandbox()) return sandboxGetSchoolTeacherNames();
  const db = getDb();
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, 'teachers'));
    const names = new Set<string>();
    for (const d of snap.docs) {
      const data = d.data();
      const cands = [data.name, data.teacherName, data.displayName, data.fullName, data.chineseName, d.id];
      for (const c of cands) {
        const s = String(c ?? '').trim();
        if (!s) continue;
        // 避免把 email 當作姓名建議
        if (s.includes('@')) continue;
        names.add(s);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'zh-TW'));
  } catch {
    return [];
  }
}

/** 段考填報白名單：從主系統 teachers 集合匯入「導師」姓名／班級；email 有則一併帶入，無則留空由管理員手填後再寫入 */
export interface HomeroomTeacherForExamWhitelistRow {
  /** 有學校信箱時為小寫 Email；無則空字串（白名單文件 ID 仍須以 Email 為準，需手動填寫後寫入） */
  email: string;
  teacherName: string;
  className: string | null;
  teacherId: string;
}

/** 讀取教師名單結果；若有 error，rows 通常為空 */
export interface HomeroomTeachersImportResult {
  rows: HomeroomTeacherForExamWhitelistRow[];
  error?: string;
}

function isHomeroomTeacherDoc(data: Record<string, unknown>): boolean {
  if (data.isRetired === true) return false;
  if (data.isHomeroom === true) return true;
  const role = String(data.teacherRole ?? '');
  if (role.includes('導師')) return true;
  if (data.isGraduatingHomeroom === true) return true;
  return false;
}

export async function getHomeroomTeachersForExamWhitelist(): Promise<HomeroomTeachersImportResult> {
  if (isSandbox()) {
    const rows = await sandboxGetHomeroomTeachersForExamWhitelist();
    return { rows };
  }
  const db = getDb();
  if (!db) {
    return { rows: [], error: 'Firebase 未初始化，無法讀取「teachers」。請確認已登入且環境變數正確。' };
  }
  try {
    const snap = await getDocs(collection(db, 'teachers'));
    const byTeacherId = new Map<string, HomeroomTeacherForExamWhitelistRow>();
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (!isHomeroomTeacherDoc(data)) continue;
      const raw = String(data.schoolEmail ?? data.email ?? '').trim().toLowerCase();
      const email = raw.includes('@') ? raw : '';
      const teacherName = String(data.name ?? '').trim() || d.id;
      const tc = String(data.teachingClasses ?? '').trim();
      const className = tc.length > 0 ? tc : null;
      const row: HomeroomTeacherForExamWhitelistRow = {
        email,
        teacherName,
        className,
        teacherId: d.id,
      };
      byTeacherId.set(d.id, row);
    }
    return {
      rows: [...byTeacherId.values()].sort((a, b) =>
        a.teacherName.localeCompare(b.teacherName, 'zh-Hant'),
      ),
    };
  } catch (e: unknown) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code?: string }).code) : '';
    const msg = typeof e === 'object' && e !== null && 'message' in e ? String((e as { message?: string }).message) : String(e);
    if (code === 'permission-denied' || /permission|insufficient/i.test(msg)) {
      return {
        rows: [],
        error:
          '無法讀取 Firestore「teachers」（權限不足）。目前規則僅允許「代課系統白名單」帳號讀取教師主檔；若您只有教學組／EduTrack 管理員身分，請改由具代課權限者操作匯入，或請管理者調整規則（例如允許 EduTrack 管理員 read teachers）。',
      };
    }
    return { rows: [], error: `讀取教師名單失敗：${msg || code || '未知錯誤'}` };
  }
}

// --- Courses & Students (Firestore) ---

export interface CourseRecord {
  id: string;
  academicYear: string;
  semester: string;
  courseName: string;
  instructor: string;
  classTime: string;
  location: string;
  createdAt: string | unknown;
  fileUrl: string;
  startDate: string;
  endDate: string;
  selectedDays: string;
}

export async function getHistory(): Promise<CourseRecord[]> {
  if (isSandbox()) return sandboxGetHistory() as Promise<CourseRecord[]>;
  const db = getDb();
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.COURSES), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map((d) => {
    const data = d.data();
    const createdAt = data.createdAt?.toDate?.() ?? data.createdAt;
    return {
      id: d.id,
      academicYear: data.academicYear ?? '',
      semester: data.semester ?? '',
      courseName: data.courseName ?? '',
      instructor: data.instructor ?? '',
      classTime: data.classTime ?? '',
      location: data.location ?? '',
      createdAt,
      fileUrl: data.fileUrl ?? '',
      startDate: data.startDate ?? '',
      endDate: data.endDate ?? '',
      selectedDays: typeof data.selectedDays === 'string' ? data.selectedDays : JSON.stringify(data.selectedDays || []),
    };
  });
}

export async function getCourseStudents(courseId: string): Promise<Pick<Student, 'id' | 'period' | 'className' | 'name'>[]> {
  if (isSandbox()) return sandboxGetCourseStudents(courseId);
  const db = getDb();
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.STUDENTS), where('courseId', '==', courseId))
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: data.id ?? '',
      period: data.period ?? '',
      className: data.className ?? '',
      name: data.name ?? '',
    };
  });
}

/** 先呼叫 GAS 建立點名單檔案於 Drive，再將課程與學生寫入 Firestore（不寫入 GS） */
export async function saveCourseConfig(payload: {
  academicYear: string;
  semester: string;
  courseName: string;
  instructorName: string;
  classTime: string;
  location: string;
  startDate?: string;
  endDate?: string;
  selectedDays?: number[];
  students?: Student[];
}): Promise<{ courseId: string; recordCount: number; driveFile?: any; message: string }> {
  if (isSandbox()) return sandboxSaveCourseConfig(payload);
  const db = getDb();
  const courseId = crypto.randomUUID?.() ?? `c-${Date.now()}`;
  let fileUrl = '';

  const driveRes = await gasPost('CREATE_ATTENDANCE_FILE', payload);
  if (driveRes.success && driveRes.data?.url) {
    fileUrl = driveRes.data.url;
  }

  const courseData: DocumentData = {
    academicYear: payload.academicYear ?? '',
    semester: payload.semester ?? '',
    courseName: payload.courseName ?? '',
    instructor: payload.instructorName ?? '',
    classTime: payload.classTime ?? '',
    location: payload.location ?? '',
    createdAt: serverTimestamp(),
    fileUrl,
    startDate: payload.startDate ?? '',
    endDate: payload.endDate ?? '',
    selectedDays: JSON.stringify(payload.selectedDays ?? []),
  };

  if (db) {
    await setDoc(doc(db, COLLECTIONS.COURSES, courseId), courseData);
    const students = payload.students ?? [];
    const studentsRef = collection(db, COLLECTIONS.STUDENTS);
    for (const s of students) {
      await addDoc(studentsRef, {
        courseId,
        id: s.id ?? '',
        period: s.period ?? '',
        className: s.className ?? '',
        name: s.name ?? '',
      });
    }
    return { courseId, recordCount: students.length, driveFile: driveRes.data, message: 'Saved successfully' };
  }

  return { courseId, recordCount: 0, driveFile: driveRes.data, message: 'Firebase not configured' };
}

export async function getSemesterData(payload: { academicYear: string; semester: string }) {
  if (isSandbox()) return sandboxGetSemesterData(payload);
  const all = await getHistory();
  const target = all.filter(
    (c) => String(c.academicYear) === String(payload.academicYear) && String(c.semester) === String(payload.semester)
  );
  const result = await Promise.all(
    target.map(async (c) => ({
      academicYear: c.academicYear,
      semester: c.semester,
      courseName: c.courseName,
      instructor: c.instructor,
      classTime: c.classTime,
      location: c.location,
      students: await getCourseStudents(c.id),
    }))
  );
  result.sort((a, b) => a.courseName.localeCompare(b.courseName));
  return result;
}

/** 從 Spreadsheet URL 匯入（仍由 GAS 讀取；Sandbox 時回傳模擬資料） */
export async function importFromSpreadsheet(payload: { url: string }) {
  if (isSandbox()) {
    const res = await mockGasPost('IMPORT_FROM_URL', payload);
    if (!res.success) throw new Error(res.message || 'Import failed');
    return (res.data?.data ?? res.data) as { academicYear: string; semester: string; courseName: string; instructorName: string; classTime: string; location: string; students: any[] };
  }
  const res = await gasPost('IMPORT_FROM_URL', payload);
  if (!res.success) throw new Error(res.message || 'Import failed');
  return (res.data?.data ?? res.data) as { academicYear: string; semester: string; courseName: string; instructorName: string; classTime: string; location: string; students: any[] };
}

// --- Awards (Firestore) ---

export async function getAwardHistory(): Promise<AwardRecord[]> {
  if (isSandbox()) return sandboxGetAwardHistory();
  const db = getDb();
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.AWARDS), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map((d) => {
    const data = d.data();
    const createdAt = data.createdAt?.toDate?.() ?? data.createdAt;
    const dateStr = data.date?.toDate?.() ? data.date.toDate().toISOString().slice(0, 10) : (data.date ?? '');
    return {
      id: d.id,
      date: dateStr,
      title: data.title ?? '',
      students: Array.isArray(data.students) ? data.students : [],
      createdAt,
    };
  });
}

export async function saveAwardRecord(payload: { date: string; title: string; students: any[] }) {
  if (isSandbox()) return sandboxSaveAwardRecord(payload);
  const db = getDb();
  const id = crypto.randomUUID?.() ?? `a-${Date.now()}`;
  if (db) {
    await setDoc(doc(db, COLLECTIONS.AWARDS, id), {
      date: payload.date,
      title: payload.title,
      students: payload.students ?? [],
      createdAt: serverTimestamp(),
    });
  }
  return { success: true, id };
}

/** 取得已知學生名單（從 Firestore 課程學生 + 頒獎紀錄彙總） */
export async function getAllKnownStudents(): Promise<{ className: string; name: string }[]> {
  if (isSandbox()) return sandboxGetAllKnownStudents();
  const db = getDb();
  if (!db) return [];
  const map = new Map<string, { className: string; name: string }>();
  const add = (className: string, name: string) => {
    if (!className || !name) return;
    const key = `${className}_${name}`;
    if (!map.has(key)) map.set(key, { className, name });
  };

  const studentsSnap = await getDocs(collection(db, COLLECTIONS.STUDENTS));
  studentsSnap.docs.forEach((d) => {
    const data = d.data();
    add(String(data.className ?? ''), String(data.name ?? ''));
  });
  const awardsSnap = await getDocs(collection(db, COLLECTIONS.AWARDS));
  awardsSnap.docs.forEach((d) => {
    const students = d.data().students;
    if (Array.isArray(students)) students.forEach((s: any) => add(s.className, s.name));
  });

  // 語言選修「學生名單」各學年（補齊自動完成來源，避免僅課程學生／舊頒獎紀錄才有建議）
  try {
    const rosters = await getAllLanguageElectiveRosters();
    rosters.forEach((r) => {
      (r.students ?? []).forEach((s) => add(String(s.className ?? ''), String(s.name ?? '')));
    });
  } catch {
    /* ignore roster merge errors */
  }

  const result = Array.from(map.values());
  result.sort((a, b) => {
    if (a.className !== b.className) return a.className.localeCompare(b.className, undefined, { numeric: true });
    return a.name.localeCompare(b.name);
  });
  return result;
}

/** 產生頒獎通知 Doc（GAS → Google Drive） */
export async function createAwardDocs(payload: AwardRecord) {
  const res = await gasPost('CREATE_AWARD_DOCS', payload);
  if (!res.success) throw new Error(res.message);
  return res.data ?? res;
}

export async function createAwardSummaryDocs(payload: AwardRecord) {
  const res = await gasPost('CREATE_AWARD_SUMMARY_DOCS', payload);
  if (!res.success) throw new Error(res.message);
  return res.data ?? res;
}

// --- Vendors (Firestore) ---

export async function getVendors(): Promise<Vendor[]> {
  if (isSandbox()) return sandboxGetVendors();
  const db = getDb();
  if (!db) return [];
  const snap = await getDocs(collection(db, COLLECTIONS.VENDORS));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name ?? '',
      category: data.category ?? '',
      contactPerson: data.contactPerson ?? '',
      phone: data.phone ?? '',
      email: data.email ?? '',
      lineId: data.lineId ?? '',
      address: data.address ?? '',
      note: data.note ?? '',
      relatedTasks: Array.isArray(data.relatedTasks) ? data.relatedTasks : [],
      qrcodeUrl: data.qrcodeUrl ?? '',
    };
  });
}

export async function saveVendor(payload: Partial<Vendor> & { name: string }) {
  if (isSandbox()) return sandboxSaveVendor(payload);
  const db = getDb();
  const id = payload.id ?? (crypto.randomUUID?.() ?? `v-${Date.now()}`);
  const data: DocumentData = {
    name: payload.name ?? '',
    category: payload.category ?? '',
    contactPerson: payload.contactPerson ?? '',
    phone: payload.phone ?? '',
    email: payload.email ?? '',
    lineId: payload.lineId ?? '',
    address: payload.address ?? '',
    note: payload.note ?? '',
    relatedTasks: payload.relatedTasks ?? [],
    qrcodeUrl: payload.qrcodeUrl ?? '',
  };
  if (db) {
    await setDoc(doc(db, COLLECTIONS.VENDORS, id), data);
  }
  return { success: true, id };
}

export async function deleteVendor(payload: { id: string }) {
  if (isSandbox()) return sandboxDeleteVendor(payload);
  const db = getDb();
  if (db) await deleteDoc(doc(db, COLLECTIONS.VENDORS, payload.id));
  return { success: true };
}

// --- Budget plans (Firestore) ---

function numFromFirestore(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v);
    return Number.isNaN(n) ? fallback : n;
  }
  return fallback;
}

function parseBudgetPlanPeriodKind(v: unknown): BudgetPlanPeriodKind | undefined {
  if (v === 'calendar_year' || v === 'academic_year') return v;
  return undefined;
}

function budgetPlanFromDoc(id: string, data: DocumentData): BudgetPlan {
  const updatedAt = data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt ?? '';
  const createdAt = data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt ?? '';
  const st = data.status;
  const statusParsed = st === 'closed' || st === 'active' ? st : undefined;
  const periodKind = parseBudgetPlanPeriodKind(data.periodKind);
  return {
    id,
    academicYear: String(data.academicYear ?? '').trim(),
    periodKind,
    name: data.name ?? '',
    accountingCode: data.accountingCode != null ? String(data.accountingCode) : '',
    budgetTotal: numFromFirestore(data.budgetTotal),
    reservedTotal: numFromFirestore(data.reservedTotal),
    spentTotal: numFromFirestore(data.spentTotal),
    plannedCommitTotal: numFromFirestore(data.plannedCommitTotal),
    closeByDate: data.closeByDate != null ? String(data.closeByDate) : '',
    closureRequirements: data.closureRequirements != null ? String(data.closureRequirements) : '',
    status: statusParsed,
    note: data.note ?? '',
    createdAt,
    updatedAt,
  };
}

export async function getBudgetPlan(id: string): Promise<BudgetPlan | null> {
  if (isSandbox()) return sandboxGetBudgetPlan(id);
  const db = getDb();
  if (!db) return null;
  const snap = await getDoc(doc(db, COLLECTIONS.BUDGET_PLANS, id));
  if (!snap.exists()) return null;
  return budgetPlanFromDoc(snap.id, snap.data());
}

function filterBudgetPlansByYearAndKind(
  rows: BudgetPlan[],
  yearLabel?: string,
  periodKind: 'all' | BudgetPlanPeriodKind = 'all'
): BudgetPlan[] {
  const y = yearLabel?.trim();
  return rows.filter((p) => {
    const kind: BudgetPlanPeriodKind = p.periodKind ?? 'academic_year';
    if (periodKind !== 'all' && kind !== periodKind) return false;
    if (y != null && y !== '' && String(p.academicYear ?? '').trim() !== y) return false;
    return true;
  });
}

/**
 * @param yearLabel 民國年數字（例 114、115），空白則不按年篩選
 * @param periodKind 年度／學年度；'all' 或省略則兩種都包含
 */
export async function getBudgetPlans(
  yearLabel?: string,
  periodKind: 'all' | BudgetPlanPeriodKind = 'all'
): Promise<BudgetPlan[]> {
  if (isSandbox()) {
    const list = await sandboxGetBudgetPlans();
    return filterBudgetPlansByYearAndKind(list, yearLabel, periodKind);
  }
  const db = getDb();
  if (!db) return [];
  const snap = await getDocs(query(collection(db, COLLECTIONS.BUDGET_PLANS), orderBy('updatedAt', 'desc')));
  const rows = snap.docs.map((d) => budgetPlanFromDoc(d.id, d.data()));
  return filterBudgetPlansByYearAndKind(rows, yearLabel, periodKind);
}

export async function saveBudgetPlan(payload: Partial<BudgetPlan> & { name: string }) {
  if (isSandbox()) return sandboxSaveBudgetPlan(payload);
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  const id = payload.id ?? (crypto.randomUUID?.() ?? `bp-${Date.now()}`);
  const budgetTotal = Math.max(0, numFromFirestore(payload.budgetTotal));
  const reservedTotal = Math.max(0, numFromFirestore(payload.reservedTotal));
  const spentTotal = Math.max(0, numFromFirestore(payload.spentTotal));
  const plannedCommitTotal = Math.max(0, numFromFirestore(payload.plannedCommitTotal));
  const existingSnap = await getDoc(doc(db, COLLECTIONS.BUDGET_PLANS, id));
  const existingKind = existingSnap.exists() ? parseBudgetPlanPeriodKind(existingSnap.data().periodKind) : undefined;
  const periodKind: BudgetPlanPeriodKind =
    payload.periodKind === 'calendar_year' || payload.periodKind === 'academic_year'
      ? payload.periodKind
      : existingKind ?? 'academic_year';
  const data: DocumentData = {
    academicYear: String(payload.academicYear ?? '').trim(),
    periodKind,
    name: payload.name ?? '',
    accountingCode: String(payload.accountingCode ?? '').trim(),
    budgetTotal,
    reservedTotal,
    spentTotal,
    plannedCommitTotal,
    closeByDate: String(payload.closeByDate ?? '').trim(),
    closureRequirements: String(payload.closureRequirements ?? '').trim(),
    status: payload.status === 'closed' ? 'closed' : 'active',
    note: payload.note ?? '',
    updatedAt: serverTimestamp(),
  };
  const existing = await getDoc(doc(db, COLLECTIONS.BUDGET_PLANS, id));
  if (!existing.exists()) {
    data.createdAt = serverTimestamp();
  }
  await setDoc(doc(db, COLLECTIONS.BUDGET_PLANS, id), data, { merge: true });
  return { success: true, id };
}

export async function deleteBudgetPlan(payload: { id: string }) {
  if (isSandbox()) return sandboxDeleteBudgetPlan(payload);
  const db = getDb();
  if (db) {
    await firebaseDeleteAllLedgerEntries(payload.id);
    const advSnap = await getDocs(
      query(collection(db, COLLECTIONS.BUDGET_PLAN_ADVANCES), where('budgetPlanId', '==', payload.id))
    );
    for (const d of advSnap.docs) {
      await deleteDoc(d.ref);
    }
    await deleteDoc(doc(db, COLLECTIONS.BUDGET_PLANS, payload.id));
  }
  return { success: true };
}

async function firebaseDeleteAllLedgerEntries(planId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const colRef = collection(db, COLLECTIONS.BUDGET_PLANS, planId, BUDGET_PLAN_LEDGER_SUBCOLLECTION);
  const snap = await getDocs(colRef);
  if (snap.empty) return;
  let batch = writeBatch(db);
  let n = 0;
  for (const d of snap.docs) {
    batch.delete(d.ref);
    n++;
    if (n >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
}

function normalizeLedgerParentId(v: unknown): string | null {
  if (v == null || v === '') return null;
  return String(v);
}

function parseLedgerPaymentStatus(v: unknown): BudgetPlanLedgerPaymentStatus {
  if (v === 'planned' || v === 'executed_pending' || v === 'settled') return v;
  return 'settled';
}

function ledgerEntryFromDoc(planId: string, id: string, data: DocumentData): BudgetPlanLedgerEntry {
  const kind: BudgetPlanLedgerKind = data.kind === 'expense' ? 'expense' : 'folder';
  const hasPaymentField = data.paymentStatus != null || data.estimatedAmount != null;
  return {
    id,
    budgetPlanId: planId,
    parentId: normalizeLedgerParentId(data.parentId),
    kind,
    title: String(data.title ?? ''),
    hidden: kind === 'folder' ? data.hidden === true : undefined,
    estimatedAmount: kind === 'expense' ? Math.max(0, numFromFirestore(data.estimatedAmount)) : 0,
    amount: numFromFirestore(data.amount),
    budgetAllocated: kind === 'folder' ? Math.max(0, numFromFirestore(data.budgetAllocated)) : undefined,
    allowPooling: data.allowPooling === true,
    paymentStatus:
      kind === 'expense'
        ? hasPaymentField
          ? parseLedgerPaymentStatus(data.paymentStatus)
          : 'settled'
        : undefined,
    expenseDate: data.expenseDate != null ? String(data.expenseDate) : '',
    memo: data.memo != null ? String(data.memo) : '',
    order: Number(data.order) || 0,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? (typeof data.createdAt === 'string' ? data.createdAt : undefined),
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? (typeof data.updatedAt === 'string' ? data.updatedAt : undefined),
  };
}

function collectLedgerSubtreeIds(entries: BudgetPlanLedgerEntry[], rootId: string): string[] {
  const byParent = new Map<string | null, BudgetPlanLedgerEntry[]>();
  for (const e of entries) {
    const p = e.parentId ?? null;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(e);
  }
  const out: string[] = [];
  const walk = (id: string) => {
    out.push(id);
    for (const c of byParent.get(id) ?? []) walk(c.id);
  };
  walk(rootId);
  return out;
}

export async function getBudgetPlanLedgerEntries(planId: string): Promise<BudgetPlanLedgerEntry[]> {
  if (isSandbox()) return sandboxGetBudgetPlanLedgerEntries(planId);
  const db = getDb();
  if (!db) return [];
  const colRef = collection(db, COLLECTIONS.BUDGET_PLANS, planId, BUDGET_PLAN_LEDGER_SUBCOLLECTION);
  const snap = await getDocs(query(colRef, orderBy('order', 'asc')));
  const rows = snap.docs.map((d) => ledgerEntryFromDoc(planId, d.id, d.data()));
  return rows.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh-TW'));
}

async function nextLedgerSiblingOrder(planId: string, parentId: string | null, excludeId?: string): Promise<number> {
  const all = await getBudgetPlanLedgerEntries(planId);
  const sibs = all.filter((e) => (e.parentId ?? null) === (parentId ?? null) && e.id !== excludeId);
  if (sibs.length === 0) return 0;
  return Math.max(...sibs.map((s) => s.order), -1) + 1;
}

export async function saveBudgetPlanLedgerEntry(
  planId: string,
  payload: Partial<BudgetPlanLedgerEntry> & { title: string; kind: BudgetPlanLedgerKind }
) {
  if (isSandbox()) return sandboxSaveBudgetPlanLedgerEntry(planId, payload);
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  const id = payload.id ?? (crypto.randomUUID?.() ?? `bled-${Date.now()}`);
  const existingRef = doc(db, COLLECTIONS.BUDGET_PLANS, planId, BUDGET_PLAN_LEDGER_SUBCOLLECTION, id);
  const existingSnap = await getDoc(existingRef);
  const prev = existingSnap.exists() ? ledgerEntryFromDoc(planId, id, existingSnap.data()) : null;
  const parentId =
    payload.parentId !== undefined
      ? normalizeLedgerParentId(payload.parentId)
      : (prev?.parentId ?? null);

  let orderNum = payload.order;
  if (orderNum === undefined || orderNum === null) {
    orderNum = prev ? prev.order : await nextLedgerSiblingOrder(planId, parentId);
  }

  const kind: BudgetPlanLedgerKind = payload.kind === 'expense' ? 'expense' : 'folder';
  const title = String(payload.title ?? '').trim();
  if (!title) throw new Error('請填寫標題');
  const amount =
    kind === 'expense'
      ? Math.max(
          0,
          numFromFirestore(payload.amount !== undefined ? payload.amount : (prev?.amount ?? 0))
        )
      : 0;
  const estimatedAmount =
    kind === 'expense'
      ? Math.max(
          0,
          numFromFirestore(
            payload.estimatedAmount !== undefined ? payload.estimatedAmount : (prev?.estimatedAmount ?? 0)
          )
        )
      : 0;
  const expensePaymentStatus: BudgetPlanLedgerPaymentStatus | undefined =
    kind === 'expense'
      ? payload.paymentStatus !== undefined
        ? parseLedgerPaymentStatus(payload.paymentStatus)
        : prev?.paymentStatus != null
          ? prev.paymentStatus
          : 'planned'
      : undefined;
  const expenseDate =
    kind === 'expense' ? String(payload.expenseDate ?? prev?.expenseDate ?? '').trim() : '';
  const memo = payload.memo !== undefined ? String(payload.memo) : (prev?.memo ?? '');
  const allowPooling =
    payload.allowPooling !== undefined ? payload.allowPooling === true : (prev?.allowPooling ?? false);
  const budgetAllocated =
    kind === 'folder'
      ? Math.max(
          0,
          numFromFirestore(payload.budgetAllocated !== undefined ? payload.budgetAllocated : (prev?.budgetAllocated ?? 0))
        )
      : undefined;
  const hidden =
    kind === 'folder'
      ? (payload.hidden !== undefined ? payload.hidden === true : (prev?.hidden ?? false))
      : undefined;

  const docBody: DocumentData = {
    parentId,
    kind,
    title,
    amount,
    estimatedAmount,
    expenseDate,
    memo,
    order: Math.max(0, Number(orderNum) || 0),
    updatedAt: serverTimestamp(),
  };
  if (kind === 'expense' && expensePaymentStatus) {
    docBody.paymentStatus = expensePaymentStatus;
  }
  docBody.allowPooling = allowPooling === true;
  if (kind === 'folder') {
    docBody.budgetAllocated = budgetAllocated ?? 0;
    docBody.hidden = hidden === true;
  }
  if (!prev) docBody.createdAt = serverTimestamp();
  await setDoc(existingRef, docBody, { merge: true });
  return { success: true as const, id };
}

export async function deleteBudgetPlanLedgerEntry(planId: string, entryId: string) {
  if (isSandbox()) return sandboxDeleteBudgetPlanLedgerEntry(planId, entryId);
  const db = getDb();
  if (!db) return { success: false as const };
  const all = await getBudgetPlanLedgerEntries(planId);
  const ids = collectLedgerSubtreeIds(all, entryId);
  for (const eid of ids) {
    await deleteDoc(doc(db, COLLECTIONS.BUDGET_PLANS, planId, BUDGET_PLAN_LEDGER_SUBCOLLECTION, eid));
  }
  return { success: true as const };
}

/** 實支是否計入計畫「已支出」（預定階段不計入） */
export function ledgerActualCountsTowardSpent(e: BudgetPlanLedgerEntry): boolean {
  if (e.kind !== 'expense') return false;
  const st = e.paymentStatus ?? 'settled';
  return st === 'executed_pending' || st === 'settled';
}

/** 加總計入「已支出」的實支金額（預定不計入；舊資料無 paymentStatus 視為已核銷完畢） */
export function sumBudgetPlanLedgerExpenses(entries: BudgetPlanLedgerEntry[]): number {
  return entries
    .filter(ledgerActualCountsTowardSpent)
    .reduce((s, e) => s + (e.amount || 0), 0);
}

/** 所有支用列「預估金額」加總（供對照） */
export function sumBudgetPlanLedgerEstimated(entries: BudgetPlanLedgerEntry[]): number {
  return entries.filter((e) => e.kind === 'expense').reduce((s, e) => s + (e.estimatedAmount || 0), 0);
}

/** 「預定」狀態單筆佔用額度：取預估與實支較大者（皆為 0 則 0） */
export function ledgerPlannedCommitAmount(e: BudgetPlanLedgerEntry): number {
  if (e.kind !== 'expense') return 0;
  const st = e.paymentStatus ?? 'settled';
  if (st !== 'planned') return 0;
  return Math.max(0, Math.max(e.estimatedAmount || 0, e.amount || 0));
}

/** 所有「預定」支用列佔用加總（用於剩餘額度＝核配－已支出－預定佔用） */
export function sumBudgetPlanLedgerPlannedCommit(entries: BudgetPlanLedgerEntry[]): number {
  return entries.reduce((s, e) => s + ledgerPlannedCommitAmount(e), 0);
}

/** 同步支用明細加總：已支出（實支）＋預定佔用 */
export async function updateBudgetPlanFinancialRollups(
  planId: string,
  spentTotal: number,
  plannedCommitTotal: number,
  reservedTotal?: number
) {
  if (isSandbox()) return sandboxUpdateBudgetPlanFinancialRollups(planId, spentTotal, plannedCommitTotal, reservedTotal);
  const db = getDb();
  if (!db) return { success: false as const };
  const spent = Math.max(0, numFromFirestore(spentTotal));
  const planned = Math.max(0, numFromFirestore(plannedCommitTotal));
  const patch: DocumentData = {
    spentTotal: spent,
    plannedCommitTotal: planned,
    updatedAt: serverTimestamp(),
  };
  if (reservedTotal !== undefined) patch.reservedTotal = Math.max(0, numFromFirestore(reservedTotal));
  await updateDoc(doc(db, COLLECTIONS.BUDGET_PLANS, planId), patch);
  return { success: true as const };
}

function parseAdvanceStatus(v: unknown): BudgetAdvanceStatus {
  if (
    v === 'settled' ||
    v === 'cancelled' ||
    v === 'outstanding' ||
    v === 'purchase_not_submitted' ||
    v === 'purchase_submitted' ||
    v === 'purchase_vendor_prepaid'
  ) {
    return v;
  }
  return 'outstanding';
}

export async function getBudgetPlanAdvances(_filter?: {
  budgetPlanId?: string;
  /** active=未封存；archived=已封存；預設 all（相容舊行為） */
  scope?: 'active' | 'archived' | 'all';
}): Promise<BudgetPlanAdvance[]> {
  if (isSandbox()) {
    const list = await sandboxGetBudgetPlanAdvances(_filter?.scope);
    const pid = _filter?.budgetPlanId?.trim();
    if (!pid) return list;
    return list.filter((a) => a.budgetPlanId === pid);
  }
  const db = getDb();
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.BUDGET_PLAN_ADVANCES), orderBy('advanceDate', 'desc'))
  );
  let rows = snap.docs.map((d) => {
    const data = d.data();
    const updatedAt = data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt ?? '';
    const createdAt = data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt ?? '';
    return {
      id: d.id,
      budgetPlanId: String(data.budgetPlanId ?? '').trim(),
      ledgerEntryId: data.ledgerEntryId != null ? String(data.ledgerEntryId) : '',
      amount: numFromFirestore(data.amount),
      advanceDate: data.advanceDate != null ? String(data.advanceDate) : '',
      title: data.title != null ? String(data.title) : '',
      paidBy: data.paidBy != null ? String(data.paidBy) : '',
      status: parseAdvanceStatus(data.status),
      settledDate: data.settledDate != null ? String(data.settledDate).trim() : '',
      paidToPayeeDate: data.paidToPayeeDate != null ? String(data.paidToPayeeDate).trim() : '',
      archivedAt: data.archivedAt != null ? String(data.archivedAt).trim() : '',
      memo: data.memo != null ? String(data.memo) : '',
      createdAt,
      updatedAt,
    } as BudgetPlanAdvance;
  });
  const scope = _filter?.scope ?? 'all';
  if (scope === 'active') {
    rows = rows.filter((a) => !String(a.archivedAt ?? '').trim());
  } else if (scope === 'archived') {
    rows = rows.filter((a) => !!String(a.archivedAt ?? '').trim());
  }
  const pid = _filter?.budgetPlanId?.trim();
  if (pid) rows = rows.filter((a) => a.budgetPlanId === pid);
  return rows;
}

export async function saveBudgetPlanAdvance(
  payload: Partial<BudgetPlanAdvance> & { amount: number; advanceDate: string; title: string }
) {
  if (isSandbox()) return sandboxSaveBudgetPlanAdvance(payload);
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  const id = payload.id ?? (crypto.randomUUID?.() ?? `bpadv-${Date.now()}`);
  const amount = Math.max(0, numFromFirestore(payload.amount));
  const planId = String(payload.budgetPlanId ?? '').trim();
  const sd = String(payload.settledDate ?? '').trim();
  const pd = String(payload.paidToPayeeDate ?? '').trim();
  const st = parseAdvanceStatus(payload.status);
  const existing = await getDoc(doc(db, COLLECTIONS.BUDGET_PLAN_ADVANCES, id));
  const existingData = existing.exists() ? existing.data() : undefined;
  const existingArchived =
    existingData?.archivedAt != null ? String(existingData.archivedAt).trim() : '';
  const shouldArchive = sd.length > 0 && pd.length > 0 && st !== 'cancelled';
  const archivedAt = shouldArchive
    ? existingArchived || new Date().toISOString().slice(0, 10)
    : '';
  const data: DocumentData = {
    budgetPlanId: planId,
    ledgerEntryId: planId ? (payload.ledgerEntryId != null ? String(payload.ledgerEntryId).trim() : '') : '',
    amount,
    advanceDate: String(payload.advanceDate ?? '').trim(),
    title: String(payload.title ?? '').trim(),
    paidBy: String(payload.paidBy ?? '').trim(),
    status: st,
    settledDate: sd,
    paidToPayeeDate: pd,
    archivedAt,
    memo: payload.memo ?? '',
    updatedAt: serverTimestamp(),
  };
  if (!existing.exists()) {
    data.createdAt = serverTimestamp();
  }
  await setDoc(doc(db, COLLECTIONS.BUDGET_PLAN_ADVANCES, id), data, { merge: true });
  return { success: true as const, id };
}

export async function deleteBudgetPlanAdvance(payload: { id: string }) {
  if (isSandbox()) return sandboxDeleteBudgetPlanAdvance(payload);
  const db = getDb();
  if (db) await deleteDoc(doc(db, COLLECTIONS.BUDGET_PLAN_ADVANCES, payload.id));
  return { success: true as const };
}

// --- Archive (Firestore) ---

export async function getArchiveTasks(): Promise<ArchiveTask[]> {
  if (isSandbox()) return sandboxGetArchiveTasks();
  const db = getDb();
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.ARCHIVE), orderBy('updatedAt', 'desc'))
  );
  return snap.docs.map((d) => {
    const data = d.data();
    const updatedAt = data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt ?? '';
    return {
      id: d.id,
      title: data.title ?? '',
      month: data.month ?? '',
      isPrinted: data.isPrinted === true,
      isNotified: data.isNotified === true,
      notes: data.notes ?? '',
      updatedAt,
    };
  });
}

export async function saveArchiveTask(payload: Partial<ArchiveTask> & { title: string; month: string }) {
  if (isSandbox()) return sandboxSaveArchiveTask(payload);
  const db = getDb();
  const id = payload.id ?? (crypto.randomUUID?.() ?? `ar-${Date.now()}`);
  const now = new Date().toISOString();
  const data: DocumentData = {
    title: payload.title,
    month: payload.month,
    isPrinted: payload.isPrinted ?? false,
    isNotified: payload.isNotified ?? false,
    notes: payload.notes ?? '',
    updatedAt: now,
  };
  if (db) {
    await setDoc(doc(db, COLLECTIONS.ARCHIVE, id), data);
  }
  return { success: true, id };
}

export async function deleteArchiveTask(payload: { id: string }) {
  if (isSandbox()) return sandboxDeleteArchiveTask(payload);
  const db = getDb();
  if (db) await deleteDoc(doc(db, COLLECTIONS.ARCHIVE, payload.id));
  return { success: true };
}

// --- Todos (Firestore) ---

function todoToDoc(t: Partial<TodoItem>): DocumentData {
  return {
    date: t.date ?? '',
    title: t.title ?? '',
    type: t.type ?? 'task',
    status: t.status ?? 'pending',
    priority: t.priority ?? 'Medium',
    seriesId: t.seriesId ?? '',
    contacts: t.contacts ?? [],
    memo: t.memo ?? '',
    createdAt: t.createdAt ?? new Date().toISOString(),
    academicYear: t.academicYear ?? '114',
    attachments: (t.attachments ?? []).filter((x): x is Attachment => Boolean(x?.url)),
    commonAttachments: (t.commonAttachments ?? []).filter((x): x is Attachment => Boolean(x?.url)),
    officialDocs: t.officialDocs ?? [],
    topic: t.topic ?? '',
    commonContacts: t.commonContacts ?? [],
    period: t.period ?? 'full',
  };
}

export async function getTodos(): Promise<TodoItem[]> {
  if (isSandbox()) return sandboxGetTodos();
  const db = getDb();
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.TODOS), orderBy('date', 'asc'))
  );
  return snap.docs.map((d) => {
    const data = d.data();
    const createdAt = data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt;
    return {
      id: d.id,
      academicYear: data.academicYear ?? '114',
      date: data.date ?? '',
      title: data.title ?? '',
      type: data.type ?? 'task',
      status: data.status ?? 'pending',
      priority: data.priority ?? 'Medium',
      seriesId: data.seriesId,
      topic: data.topic ?? '',
      officialDocs: Array.isArray(data.officialDocs) ? data.officialDocs : [],
      contacts: Array.isArray(data.contacts) ? data.contacts : [],
      commonContacts: Array.isArray(data.commonContacts) ? data.commonContacts : [],
      attachments: Array.isArray(data.attachments) ? data.attachments : [],
      commonAttachments: Array.isArray(data.commonAttachments) ? data.commonAttachments : [],
      memo: data.memo ?? '',
      createdAt: createdAt,
      period: data.period ?? 'full',
    } as TodoItem;
  });
}

export async function saveTodo(payload: Partial<TodoItem> & { date: string; title: string; type: string }) {
  if (isSandbox()) return sandboxSaveTodo(payload as any);
  const db = getDb();
  const id = payload.id ?? (crypto.randomUUID?.() ?? `t-${Date.now()}`);
  const topic = (payload.topic ?? '').trim();
  const seriesId = payload.seriesId ?? (payload as any).isSeries ? id : '';

  const todoFlat = todoToDoc(payload);
  const docData = {
    ...todoFlat,
    seriesId: payload.seriesId ?? seriesId,
    topic,
    academicYear: payload.academicYear ?? '114',
    period: payload.period ?? 'full',
  };

  if (db) {
    await setDoc(doc(db, COLLECTIONS.TODOS, id), { ...docData, id });
    if (topic) {
      const all = await getDocs(
        query(
          collection(db, COLLECTIONS.TODOS),
          where('topic', '==', topic),
          where('academicYear', '==', payload.academicYear ?? '114')
        )
      );
      const batchData = {
        commonAttachments: todoFlat.commonAttachments,
        commonContacts: todoFlat.commonContacts,
      };
      for (const d of all.docs) {
        if (d.id !== id) await updateDoc(d.ref, batchData);
      }
    }
  }
  return { success: true, message: 'Saved successfully', seriesId };
}

export async function saveBatchTodos(payload: { todos: Partial<TodoItem>[] }) {
  if (isSandbox()) return sandboxSaveBatchTodos(payload);
  const db = getDb();
  const todos = payload.todos ?? [];
  if (!db || todos.length === 0) return { success: false, message: 'No data to save' };
  for (const todo of todos) {
    const id = todo.id ?? (crypto.randomUUID?.() ?? `t-${Date.now()}`);
    await setDoc(doc(db, COLLECTIONS.TODOS, id), {
      id,
      date: todo.date ?? '',
      title: todo.title ?? '',
      type: todo.type ?? 'duty',
      status: todo.status ?? 'pending',
      priority: todo.priority ?? 'Medium',
      seriesId: '',
      contacts: [],
      memo: todo.memo ?? '',
      createdAt: new Date().toISOString(),
      academicYear: todo.academicYear ?? '114',
      attachments: [],
      commonAttachments: [],
      officialDocs: [],
      topic: '',
      commonContacts: [],
      period: todo.period ?? 'full',
    });
  }
  return { success: true, message: `Batch saved ${todos.length} items` };
}

export async function deleteTodo(payload: { id: string }) {
  if (isSandbox()) return sandboxDeleteTodo(payload);
  const db = getDb();
  if (db) await deleteDoc(doc(db, COLLECTIONS.TODOS, payload.id));
  return { success: true };
}

export async function cancelSeries(payload: { seriesId?: string; topic?: string; pivotDate: string; academicYear?: string }) {
  if (isSandbox()) return sandboxCancelSeries(payload);
  const db = getDb();
  if (!db) return { success: true, message: 'Series cancelled' };
  const pivot = new Date(payload.pivotDate);
  const all = await getDocs(collection(db, COLLECTIONS.TODOS));
  const targetTopic = (payload.topic ?? '').trim();
  for (const d of all.docs) {
    const data = d.data();
    const rowTopic = (data.topic ?? '').trim();
    const rowYear = data.academicYear ?? '114';
    const match = targetTopic ? rowTopic === targetTopic : (payload.seriesId && data.seriesId === payload.seriesId);
    if (match && (!payload.academicYear || String(rowYear) === String(payload.academicYear))) {
      const rowDate = new Date(data.date);
      if (rowDate >= pivot) await updateDoc(d.ref, { status: 'cancelled' });
    }
  }
  return { success: true, message: 'Series cancelled' };
}

export async function toggleTodoStatus(payload: { id: string; newStatus: TodoItem['status'] }) {
  if (isSandbox()) return sandboxToggleTodoStatus(payload);
  const db = getDb();
  if (!db) return { success: true };
  await updateDoc(doc(db, COLLECTIONS.TODOS, payload.id), { status: payload.newStatus });
  return { success: true };
}

// --- 行政行事曆：每月固定事項規則 ---

function recurringRuleFromDoc(id: string, data: DocumentData): MonthlyRecurringTodoRule {
  const months = Array.isArray(data.months)
    ? (data.months as unknown[])
        .map((x) => Number(x))
        .filter((n) => n >= 1 && n <= 12)
    : [];
  const mc = data.monthCompletions && typeof data.monthCompletions === 'object' ? (data.monthCompletions as Record<string, string>) : {};
  const completions: Record<string, 'pending' | 'done' | 'cancelled'> = {};
  for (const [k, v] of Object.entries(mc)) {
    if (v === 'done' || v === 'cancelled' || v === 'pending') completions[k] = v;
  }
  return {
    id,
    title: String(data.title ?? ''),
    type: String(data.type ?? '行政'),
    priority: ['High', 'Medium', 'Low'].includes(data.priority as string) ? (data.priority as MonthlyRecurringTodoRule['priority']) : 'Medium',
    dayOfMonth: Math.min(31, Math.max(1, Number(data.dayOfMonth) || 1)),
    months,
    memo: data.memo != null ? String(data.memo) : '',
    monthCompletions: Object.keys(completions).length ? completions : undefined,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? (typeof data.createdAt === 'string' ? data.createdAt : undefined),
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? (typeof data.updatedAt === 'string' ? data.updatedAt : undefined),
  };
}

export async function getMonthlyRecurringTodoRules(): Promise<MonthlyRecurringTodoRule[]> {
  if (isSandbox()) return sandboxGetMonthlyRecurringTodoRules();
  const db = getDb();
  if (!db) return [];
  const snap = await getDocs(collection(db, COLLECTIONS.MONTHLY_RECURRING_TODOS));
  return snap.docs
    .map((d) => recurringRuleFromDoc(d.id, d.data()))
    .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-TW'));
}

export async function saveMonthlyRecurringTodoRule(
  payload: Partial<MonthlyRecurringTodoRule> & { title: string; dayOfMonth: number }
) {
  if (isSandbox()) return sandboxSaveMonthlyRecurringTodoRule(payload);
  const db = getDb();
  const id = payload.id ?? (crypto.randomUUID?.() ?? `mr-${Date.now()}`);
  let months = Array.isArray(payload.months)
    ? [...new Set(payload.months.filter((m) => m >= 1 && m <= 12))].sort((a, b) => a - b)
    : [];
  if (months.length === 12) months = [];
  const existingSnap = payload.id && db ? await getDoc(doc(db, COLLECTIONS.MONTHLY_RECURRING_TODOS, id)) : null;
  const prevCompletions =
    existingSnap?.exists() && existingSnap.data().monthCompletions && typeof existingSnap.data().monthCompletions === 'object'
      ? (existingSnap.data().monthCompletions as Record<string, string>)
      : {};

  const docBody: DocumentData = {
    id,
    title: payload.title.trim(),
    type: payload.type ?? '行政',
    priority: payload.priority ?? 'Medium',
    dayOfMonth: Math.min(31, Math.max(1, Math.floor(Number(payload.dayOfMonth)) || 1)),
    months,
    memo: payload.memo ?? '',
    monthCompletions: payload.monthCompletions !== undefined ? payload.monthCompletions : prevCompletions,
    updatedAt: serverTimestamp(),
  };
  if (!payload.id) docBody.createdAt = serverTimestamp();

  if (db) await setDoc(doc(db, COLLECTIONS.MONTHLY_RECURRING_TODOS, id), docBody, { merge: true });
  return { success: true as const, id };
}

export async function deleteMonthlyRecurringTodoRule(payload: { id: string }) {
  if (isSandbox()) return sandboxDeleteMonthlyRecurringTodoRule(payload);
  const db = getDb();
  if (db) await deleteDoc(doc(db, COLLECTIONS.MONTHLY_RECURRING_TODOS, payload.id));
  return { success: true as const };
}

export async function updateMonthlyRecurringMonthStatus(payload: {
  id: string;
  yearMonth: string;
  status: 'pending' | 'done' | 'cancelled';
}) {
  if (isSandbox()) return sandboxUpdateMonthlyRecurringMonthStatus(payload);
  const db = getDb();
  if (!db) return { success: false as const };
  const ref = doc(db, COLLECTIONS.MONTHLY_RECURRING_TODOS, payload.id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { success: false as const };
  const data = snap.data();
  const prev = (data.monthCompletions && typeof data.monthCompletions === 'object' ? data.monthCompletions : {}) as Record<
    string,
    string
  >;
  const next = { ...prev };
  if (payload.status === 'pending') delete next[payload.yearMonth];
  else next[payload.yearMonth] = payload.status;
  await updateDoc(ref, { monthCompletions: next, updatedAt: serverTimestamp() });
  return { success: true as const };
}

/** 附檔上傳：仍經由 GAS 寫入 Google Drive */
export async function uploadAttachment(payload: { base64Data: string; name: string; mimeType: string; prefix?: string }) {
  const res = await gasPost('UPLOAD_ATTACHMENT', payload);
  if (!res.success) throw new Error(res.message);
  return res.data ?? res;
}

// --- Exam Paper Folders（考卷資料夾）---
export async function getExamPaperFolders(): Promise<ExamPaperFolder[]> {
  if (isSandbox()) return sandboxGetExamPaperFolders();
  const db = getDb();
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.EXAM_PAPER_FOLDERS), orderBy('order', 'asc'))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExamPaperFolder));
}

export async function saveExamPaperFolder(payload: Omit<ExamPaperFolder, 'id'> & { id?: string }) {
  if (isSandbox()) return sandboxSaveExamPaperFolder(payload);
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  const id = payload.id ?? doc(collection(db, COLLECTIONS.EXAM_PAPER_FOLDERS)).id;
  const row: DocumentData = {
    name: payload.name,
    order: payload.order ?? 0,
    parentId: payload.parentId ?? null,
    driveFolderUrl: payload.driveFolderUrl ?? null,
  };
  await setDoc(doc(db, COLLECTIONS.EXAM_PAPER_FOLDERS, id), row, { merge: true });
  return { success: true, id };
}

export async function deleteExamPaperFolder(payload: { id: string }) {
  if (isSandbox()) return sandboxDeleteExamPaperFolder(payload);
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  await deleteDoc(doc(db, COLLECTIONS.EXAM_PAPER_FOLDERS, payload.id));
  return { success: true };
}

// --- Exam Papers（考卷存檔，僅白名單用戶可存取）---
export async function getExamPapers(): Promise<ExamPaper[]> {
  if (isSandbox()) return sandboxGetExamPapers();
  const db = getDb();
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.EXAM_PAPERS), orderBy('uploadedAt', 'desc'))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExamPaper));
}

export async function saveExamPaper(payload: Omit<ExamPaper, 'id'> & { id?: string }) {
  if (isSandbox()) return sandboxSaveExamPaper(payload);
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  const id = payload.id ?? doc(collection(db, COLLECTIONS.EXAM_PAPERS)).id;
  const row: DocumentData = {
    folderId: payload.folderId ?? null,
    title: payload.title ?? '',
    grade: payload.grade ?? null,
    domain: payload.domain ?? null,
    fileName: payload.fileName,
    fileUrl: payload.fileUrl,
    mimeType: payload.mimeType ?? 'application/octet-stream',
    fileId: payload.fileId ?? null,
    schoolYear: payload.schoolYear ?? null,
    semester: payload.semester ?? null,
    examType: payload.examType ?? null,
    authorTeacherName: payload.authorTeacherName ?? null,
    authorTeacherNote: payload.authorTeacherNote ?? null,
    uploadedBy: payload.uploadedBy,
    uploadedAt: payload.uploadedAt || new Date().toISOString(),
  };
  await setDoc(doc(db, COLLECTIONS.EXAM_PAPERS, id), row, { merge: true });
  return { success: true, id };
}

export async function deleteExamPaper(payload: { id: string }) {
  if (isSandbox()) return sandboxDeleteExamPaper(payload);
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  await deleteDoc(doc(db, COLLECTIONS.EXAM_PAPERS, payload.id));
  return { success: true };
}

// --- Exam Paper Checks（年級 × 領域檢核，可編輯）---
function examPaperCheckId(grade: string, domain: string) {
  return `${grade}-${domain}`;
}

export async function getExamPaperChecks(): Promise<ExamPaperCheck[]> {
  if (isSandbox()) return sandboxGetExamPaperChecks();
  const db = getDb();
  if (!db) return [];
  const snap = await getDocs(collection(db, COLLECTIONS.EXAM_PAPER_CHECKS));
  return snap.docs.map((d) => d.data() as ExamPaperCheck);
}

export async function setExamPaperCheck(payload: { grade: string; domain: string; checked: boolean }) {
  if (isSandbox()) return sandboxSetExamPaperCheck(payload);
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  const id = examPaperCheckId(payload.grade, payload.domain);
  await setDoc(
    doc(db, COLLECTIONS.EXAM_PAPER_CHECKS, id),
    { grade: payload.grade, domain: payload.domain, checked: payload.checked },
    { merge: true }
  );
  return { success: true };
}

// --- 系統設定（選修語言類別）：存於 Firestore，遺失時從名單彙整 ---
const SYSTEM_SETTINGS_DOC_ID = 'settings';

function collectLanguageOptionsFromRosters(rosters: { students?: { language?: string }[] }[]): string[] {
  const set = new Set<string>(DEFAULT_LANGUAGE_OPTIONS);
  rosters.forEach((r) => {
    (r.students ?? []).forEach((s) => {
      const v = (s.language ?? '').trim();
      if (v) set.add(v);
    });
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-TW'));
}

/** 取得選修語言類別：Firebase 有則回傳；無或空則從各學年名單彙整後寫入 Firebase 並回傳，確保不再消失 */
export async function getLanguageOptions(forceRefresh = false): Promise<string[]> {
  if (isSandbox()) return sandboxGetLanguageOptions();
  const db = getDb();
  if (!db) return [...DEFAULT_LANGUAGE_OPTIONS];
  if (!forceRefresh && languageOptionsCache.length > 0) return [...languageOptionsCache];
  const ref = doc(db, COLLECTIONS.SYSTEM, SYSTEM_SETTINGS_DOC_ID);
  const snap = await getDoc(ref);
  const data = snap.data();
  const stored = Array.isArray(data?.languageOptions) ? data.languageOptions : [];
  if (stored.length > 0) {
    languageOptionsCache = stored;
    return [...stored];
  }
  const rosters = await getAllLanguageElectiveRosters();
  const merged = collectLanguageOptionsFromRosters(rosters);
  await setDoc(ref, { languageOptions: merged, updatedAt: serverTimestamp() }, { merge: true });
  languageOptionsCache = merged;
  return [...merged];
}

let languageOptionsCache: string[] = [];

/** 儲存選修語言類別至 Firebase */
export async function saveLanguageOptionsToFirebase(options: string[]): Promise<void> {
  if (isSandbox()) return sandboxSaveLanguageOptions(options);
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  const ref = doc(db, COLLECTIONS.SYSTEM, SYSTEM_SETTINGS_DOC_ID);
  const list = options.length > 0 ? options : [...DEFAULT_LANGUAGE_OPTIONS];
  await setDoc(ref, { languageOptions: list, updatedAt: serverTimestamp() }, { merge: true });
  languageOptionsCache = list;
}

/** 從各學年名單彙整出所有出現過的語言，與目前設定做聯集後寫回 Firebase，並回傳新列表（用於「從名單恢復」） */
export async function mergeLanguageOptionsFromRosters(): Promise<string[]> {
  const rosters = await getAllLanguageElectiveRosters();
  const fromRosters = collectLanguageOptionsFromRosters(rosters);
  const current = await getLanguageOptions(true);
  const merged = Array.from(new Set([...current, ...fromRosters])).sort((a, b) => a.localeCompare(b, 'zh-TW'));
  await saveLanguageOptionsToFirebase(merged);
  return merged;
}

// --- 學生語言選修登錄 (Language Elective) ---
export async function getLanguageElectiveRoster(academicYear: string): Promise<LanguageElectiveRosterDoc | null> {
  if (isSandbox()) return sandboxGetLanguageElectiveRoster(academicYear);
  const db = getDb();
  if (!db) return null;
  return loadLanguageElectiveRosterBackend(db, academicYear);
}

export async function getAllLanguageElectiveRosters(): Promise<LanguageElectiveRosterDoc[]> {
  if (isSandbox()) return sandboxGetAllLanguageElectiveRosters();
  const db = getDb();
  if (!db) return [];
  return loadAllLanguageElectiveRostersBackend(db);
}

// --- 學期／放假日設定 (點名單用) ---
const calendarSettingsDocId = (academicYear: string, semester: string) => `${academicYear}_${semester}`;

export async function getCalendarSettings(academicYear: string, semester: string): Promise<CalendarSettings | null> {
  if (isSandbox()) return sandboxGetCalendarSettings(academicYear, semester);
  const db = getDb();
  if (!db) return null;

  // 1) 優先讀取本系統的前綴集合：edutrack_calendar_settings/{學年_學期}
  const docSnap = await getDoc(doc(db, COLLECTIONS.CALENDAR_SETTINGS, calendarSettingsDocId(academicYear, semester)));
  if (docSnap.exists()) {
    const data = docSnap.data();
    return {
      academicYear: String(data.academicYear ?? academicYear),
      semester: String(data.semester ?? semester),
      startDate: data.startDate != null ? String(data.startDate) : undefined,
      endDate: data.endDate != null ? String(data.endDate) : undefined,
      holidays: Array.isArray(data.holidays) ? data.holidays.map((h: any) => String(h)) : undefined,
    };
  }

  // 2) 相容既有主系統：system/settings（semesterStart, semesterEnd）與 system/holidays
  //    注意：此路徑不帶 edutrack_ 前綴，與本系統其他集合不同。
  const settingsSnap = await getDoc(doc(db, 'system', 'settings'));
  if (!settingsSnap.exists()) return null;
  const settings = settingsSnap.data() as any;
  const startDate = settings?.semesterStart != null ? String(settings.semesterStart) : undefined;
  const endDate = settings?.semesterEnd != null ? String(settings.semesterEnd) : undefined;

  let holidays: string[] | undefined = undefined;
  const holidaysSnap = await getDoc(doc(db, 'system', 'holidays'));
  if (holidaysSnap.exists()) {
    const h = holidaysSnap.data() as any;
    if (Array.isArray(h?.holidays)) holidays = h.holidays.map((x: any) => String(x));
    else if (Array.isArray(h?.dates)) holidays = h.dates.map((x: any) => String(x));
    else if (h && typeof h === 'object') {
      // 可能以 { "2026-02-28": true, ... } 或 { "2026-02-28": "和平紀念日", ... } 形式存放
      holidays = Object.keys(h).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
    }
  }

  return {
    academicYear: String(academicYear),
    semester: String(semester),
    startDate,
    endDate,
    holidays,
  };
}

// --- 段考提報（活動/獎項/白名單/提報）---

const EXAM_AWARDS_DOC_ID = 'exam_awards';

export async function getExamAwardsConfig(): Promise<ExamAwardsConfig> {
  if (isSandbox()) {
    const raw = await sandboxGetExamAwardsConfig();
    return normalizeExamAwardsConfig(raw);
  }
  const db = getDb();
  if (!db) return { categories: [] };
  const snap = await getDoc(doc(db, COLLECTIONS.EXAM_SYSTEM, EXAM_AWARDS_DOC_ID));
  const data = snap.exists() ? (snap.data() as any) : {};
  return normalizeExamAwardsConfig({
    categories: data?.categories,
    teacherInstructions: data?.teacherInstructions,
    allowPublicSubmitNoLogin: data?.allowPublicSubmitNoLogin === true,
    updatedAt: data?.updatedAt?.toDate?.()?.toISOString?.() ?? data?.updatedAt,
  });
}

export async function saveExamAwardsConfig(config: ExamAwardsConfig): Promise<void> {
  const cleaned = stripUndefinedDeep(config);
  if (isSandbox()) return sandboxSaveExamAwardsConfig(cleaned);
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  await setDoc(
    doc(db, COLLECTIONS.EXAM_SYSTEM, EXAM_AWARDS_DOC_ID),
    { ...cleaned, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function getExamCampaigns(): Promise<ExamCampaign[]> {
  if (isSandbox()) return sandboxGetExamCampaigns();
  const db = getDb();
  if (!db) return [];
  const snap = await getDocs(query(collection(db, COLLECTIONS.EXAM_CAMPAIGNS), orderBy('updatedAt', 'desc')));
  return snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      title: String(data.title ?? ''),
      academicYear: String(data.academicYear ?? ''),
      semester: String(data.semester ?? ''),
      examNo: String(data.examNo ?? ''),
      lockedByDefault: data.lockedByDefault === true,
      closeAt: data.closeAt ?? null,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt,
    } as ExamCampaign;
  });
}

export async function createExamCampaign(payload: Omit<ExamCampaign, 'id' | 'createdAt' | 'updatedAt'>): Promise<ExamCampaign> {
  if (isSandbox()) return sandboxCreateExamCampaign(payload as any);
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  const ref = doc(collection(db, COLLECTIONS.EXAM_CAMPAIGNS));
  const row = {
    title: payload.title ?? '',
    academicYear: payload.academicYear ?? '',
    semester: payload.semester ?? '',
    examNo: payload.examNo ?? '',
    lockedByDefault: payload.lockedByDefault === true,
    closeAt: payload.closeAt ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, row);
  return { id: ref.id, ...payload } as ExamCampaign;
}

export async function updateExamCampaign(id: string, patch: Partial<ExamCampaign>): Promise<void> {
  if (isSandbox()) return sandboxUpdateExamCampaign(id, patch);
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  const clean: any = { ...patch, updatedAt: serverTimestamp() };
  delete clean.id;
  delete clean.createdAt;
  await updateDoc(doc(db, COLLECTIONS.EXAM_CAMPAIGNS, id), clean);
}

function normalizeExamSubmitAllowedUser(doc: ExamSubmitAllowedUser | null): ExamSubmitAllowedUser | null {
  if (!doc) return null;
  const raw = doc.className;
  const className =
    raw == null || String(raw).trim() === '' ? null : String(raw).trim();
  return { ...doc, className };
}

export async function getExamSubmitAllowedUsers(): Promise<ExamSubmitAllowedUser[]> {
  if (isSandbox()) {
    const list = await sandboxGetExamSubmitAllowedUsers();
    return list.map((d) => normalizeExamSubmitAllowedUser(d)!);
  }
  const db = getDb();
  if (!db) return [];
  const snap = await getDocs(query(collection(db, 'exam_submit_allowed_users'), orderBy('updatedAt', 'desc')));
  return snap.docs.map((d) => {
    const data = d.data() as any;
    return normalizeExamSubmitAllowedUser({
      email: d.id,
      enabled: data.enabled === true,
      className: data.className ?? null,
      teacherName: data.teacherName ?? null,
      displayName: data.displayName ?? null,
      note: data.note ?? null,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt,
    } as ExamSubmitAllowedUser);
  }) as ExamSubmitAllowedUser[];
}

export async function getExamSubmitAllowedUser(email: string): Promise<ExamSubmitAllowedUser | null> {
  if (isSandbox()) return normalizeExamSubmitAllowedUser(await sandboxGetExamSubmitAllowedUser(email));
  const db = getDb();
  if (!db) return null;
  const id = (email ?? '').trim().toLowerCase();
  const snap = await getDoc(doc(db, 'exam_submit_allowed_users', id));
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  return normalizeExamSubmitAllowedUser({
    email: id,
    enabled: data.enabled === true,
    className: data.className ?? null,
    teacherName: data.teacherName ?? null,
    displayName: data.displayName ?? null,
    note: data.note ?? null,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt,
  } as ExamSubmitAllowedUser);
}

export async function setExamSubmitAllowedUser(email: string, patch: Partial<ExamSubmitAllowedUser>): Promise<void> {
  if (isSandbox()) return sandboxSetExamSubmitAllowedUser(email, patch);
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  const id = (email ?? '').trim().toLowerCase();
  const ref = doc(db, 'exam_submit_allowed_users', id);
  const cn = patch.className;
  const className =
    cn == null || String(cn).trim() === '' ? null : String(cn).trim();
  const row: any = {
    enabled: patch.enabled ?? true,
    className,
    teacherName: patch.teacherName ?? null,
    displayName: patch.displayName ?? null,
    note: patch.note ?? null,
    updatedAt: serverTimestamp(),
  };
  // createdAt 僅在首次寫入時補
  await setDoc(ref, { ...row, createdAt: serverTimestamp() }, { merge: true });
}

/** 刪除段考填報白名單中的一筆（文件 ID = email 小寫） */
export async function deleteExamSubmitAllowedUser(email: string): Promise<void> {
  if (isSandbox()) return sandboxDeleteExamSubmitAllowedUser(email);
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  const id = (email ?? '').trim().toLowerCase();
  if (!id) throw new Error('Email 不可為空');
  await deleteDoc(doc(db, 'exam_submit_allowed_users', id));
}

const examSubmissionId = (campaignId: string, className: string) => `${campaignId}_${String(className ?? '').trim()}`;

export async function getExamSubmissions(campaignId: string): Promise<ExamSubmission[]> {
  if (isSandbox()) return sandboxGetExamSubmissions(campaignId);
  const db = getDb();
  if (!db) return [];
  const snap = await getDocs(query(collection(db, COLLECTIONS.EXAM_SUBMISSIONS), where('campaignId', '==', campaignId), orderBy('submittedAt', 'desc')));
  return snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      campaignId: String(data.campaignId ?? ''),
      className: String(data.className ?? ''),
      students: Array.isArray(data.students) ? data.students : [],
      locked: data.locked === true,
      submittedByEmail: String(data.submittedByEmail ?? ''),
      submittedAt: data.submittedAt?.toDate?.()?.toISOString?.() ?? data.submittedAt ?? '',
      unlockedByEmail: data.unlockedByEmail ?? null,
      unlockedAt: data.unlockedAt?.toDate?.()?.toISOString?.() ?? data.unlockedAt ?? null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt,
    } as ExamSubmission;
  });
}

export async function saveExamSubmission(payload: Omit<ExamSubmission, 'id' | 'updatedAt'>): Promise<void> {
  if (isSandbox()) return sandboxSaveExamSubmission({ ...(payload as any), id: examSubmissionId(payload.campaignId, payload.className) });
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  const id = examSubmissionId(payload.campaignId, payload.className);
  const ref = doc(db, COLLECTIONS.EXAM_SUBMISSIONS, id);
  await setDoc(
    ref,
    {
      campaignId: payload.campaignId,
      className: payload.className,
      students: payload.students ?? [],
      locked: payload.locked === true,
      submittedByEmail: payload.submittedByEmail,
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function unlockExamSubmission(id: string, unlockedByEmail: string): Promise<void> {
  if (isSandbox()) return sandboxUnlockExamSubmission(id, unlockedByEmail);
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  await updateDoc(doc(db, COLLECTIONS.EXAM_SUBMISSIONS, id), {
    locked: false,
    unlockedByEmail,
    unlockedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** 依學號繼承：從名單取得「學號 → 選修語言」（後出現覆蓋先出現） */
export function buildStudentIdToLanguageFromRosters(rosters: LanguageElectiveRosterDoc[]): Record<string, string> {
  const idToLang: Record<string, string> = {};
  for (const r of rosters) {
    for (const s of r.students || []) {
      const id = (s.studentId && String(s.studentId).trim()) || '';
      const lang = s.language != null ? String(s.language).trim() : '';
      if (id) idToLang[id] = lang;
    }
  }
  return idToLang;
}

/** 依姓名繼承：從過往學期名單取得「姓名 → 選修語言」對照（同一姓名取最近一筆）；姓名以 trim 比對。 */
export function buildNameToLanguageFromRosters(rosters: LanguageElectiveRosterDoc[]): Record<string, string> {
  const nameToLang: Record<string, string> = {};
  for (const r of rosters) {
    for (const s of r.students || []) {
      const name = (s.name && String(s.name).trim()) || '';
      const lang = s.language != null ? String(s.language).trim() : '';
      if (name) nameToLang[name] = lang;
    }
  }
  return nameToLang;
}

export async function saveLanguageElectiveRoster(
  academicYear: string,
  students: LanguageElectiveStudent[],
  languageClassSettings?: LanguageClassSetting[]
): Promise<void> {
  if (isSandbox()) {
    await sandboxSaveLanguageElectiveRoster(academicYear, students, languageClassSettings);
    return;
  }
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  await saveLanguageElectiveRosterBackend(db, academicYear, students, languageClassSettings);
}

// --- Setup (GAS：檢查 Drive 等；Sandbox 時回傳說明) ---
export async function setupSystem() {
  const res = await gasPost('SETUP', {});
  return res;
}
