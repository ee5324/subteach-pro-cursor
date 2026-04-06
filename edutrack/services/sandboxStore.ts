/**
 * Sandbox 模式：記憶體內模擬 Firestore + GAS
 * 用於本地體驗程式流程，無需 Firebase / GAS 設定
 */
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
  LanguageElectiveRosterDoc,
  LanguageClassSetting,
  CalendarSettings,
  ExamCampaign,
  ExamAwardsConfig,
  ExamSubmitAllowedUser,
  ExamSubmission,
  BudgetPlan,
  BudgetPlanPeriodKind,
  BudgetPlanAdvance,
  BudgetPlanLedgerEntry,
  BudgetPlanLedgerKind,
  BudgetPlanLedgerPaymentStatus,
  MonthlyRecurringTodoRule,
} from '../types';
import { DEFAULT_LANGUAGE_OPTIONS } from '../utils/languageOptions';
import {
  STUDENT_ROSTER_VERSION,
  pickProfileDocId,
  projectRosterFromPlainEntries,
  applyLanguageElectiveSaveInMemory,
} from './languageElectiveStudentBackend';

export interface SandboxCourseRecord {
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

const uid = () => crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// --- In-memory store (seed 一些範例資料) ---
const store = {
  courses: [
    {
      id: 'sandbox-course-1',
      academicYear: '114',
      semester: '上學期',
      courseName: '閩南語',
      instructor: '王老師',
      classTime: '週一 08:00-08:40',
      location: '視聽教室',
      createdAt: new Date().toISOString(),
      fileUrl: 'https://docs.google.com/spreadsheets/d/sandbox-demo/edit',
      startDate: '2025-09-01',
      endDate: '2026-01-20',
      selectedDays: '[1]',
    },
  ] as SandboxCourseRecord[],
  students: [
    { courseId: 'sandbox-course-1', id: '1', period: '第一節', className: '301', name: '王小明' },
    { courseId: 'sandbox-course-1', id: '2', period: '第一節', className: '301', name: '李小華' },
    { courseId: 'sandbox-course-1', id: '3', period: '第二節', className: '302', name: '張小美' },
  ] as { courseId: string; id: string; period: string; className: string; name: string }[],
  awards: [
    {
      id: 'sandbox-award-1',
      date: '2025-10-15',
      title: '語文競賽頒獎',
      students: [{ className: '301', name: '王小明', awardName: '作文第一名' }],
      createdAt: new Date().toISOString(),
    },
  ] as (AwardRecord & { id: string })[],
  vendors: [
    {
      id: 'sandbox-v-1',
      name: '範例印刷廠',
      category: '印刷',
      contactPerson: '陳經理',
      phone: '07-1234567',
      email: 'print@example.com',
      lineId: '',
      address: '高雄市前鎮區範例路 1 號',
      note: 'Sandbox 示範',
      relatedTasks: ['運動會'],
    },
  ] as Vendor[],
  archive: [
    {
      id: 'sandbox-ar-1',
      title: '本土語補助申請',
      month: '2025-10',
      isPrinted: false,
      isNotified: false,
      notes: 'Sandbox 示範事項',
      updatedAt: new Date().toISOString(),
    },
  ] as ArchiveTask[],
  todos: [
    {
      id: 'sandbox-t-1',
      academicYear: '114',
      date: new Date().toISOString().slice(0, 10),
      title: 'Sandbox 示範待辦',
      type: 'task',
      status: 'pending',
      priority: 'Medium',
      seriesId: '',
      topic: '',
      officialDocs: [],
      contacts: [],
      commonContacts: [],
      attachments: [],
      commonAttachments: [],
      memo: '此為 Sandbox 模式，資料僅存於記憶體',
      createdAt: new Date().toISOString(),
      period: 'full',
    },
  ] as TodoItem[],
  monthlyRecurringRules: [] as MonthlyRecurringTodoRule[],
  examPapers: [] as ExamPaper[],
  examPaperFolders: [] as ExamPaperFolder[],
  examPaperChecks: [] as ExamPaperCheck[],
  languageElective: {} as Record<string, LanguageElectiveRosterDoc>,
  /** B 方案：學生主檔（記憶體） */
  languageElectiveProfiles: {} as Record<string, Record<string, unknown>>,
  systemSettings: { languageOptions: [] as string[] },
  calendarSettings: {} as Record<string, CalendarSettings>,
  examCampaigns: [] as ExamCampaign[],
  examAwardsConfig: { categories: [] } as ExamAwardsConfig,
  examSubmitAllowedUsers: {} as Record<string, ExamSubmitAllowedUser>,
  examSubmissions: {} as Record<string, ExamSubmission>,
  budgetPlans: [
    {
      id: 'sandbox-bp-1',
      academicYear: '114',
      periodKind: 'academic_year',
      name: '範例：本土語補助',
      accountingCode: '5010-01',
      budgetTotal: 50000,
      reservedTotal: 8000,
      spentTotal: 12000,
      plannedCommitTotal: 0,
      closeByDate: '2026-06-30',
      closureRequirements: '完成核銷並繳交成果報告',
      status: 'active',
      note: 'Sandbox 示範',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ] as BudgetPlan[],
  budgetPlanAdvances: [
    {
      id: 'sandbox-adv-1',
      budgetPlanId: 'sandbox-bp-1',
      ledgerEntryId: 'led-e2',
      amount: 3200,
      advanceDate: new Date().toISOString().slice(0, 10),
      title: '範例：本土語競賽報名費代墊',
      paidBy: '教學組',
      status: 'outstanding',
      memo: '待主計核銷後歸還',
      settledDate: '',
      paidToPayeeDate: '',
      archivedAt: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sandbox-adv-2',
      budgetPlanId: '',
      ledgerEntryId: '',
      amount: 800,
      advanceDate: new Date().toISOString().slice(0, 10),
      title: '範例：尚未綁計畫之代墊',
      paidBy: '李老師',
      status: 'outstanding',
      memo: '有新計畫後可改掛',
      settledDate: '',
      paidToPayeeDate: '',
      archivedAt: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sandbox-adv-archived',
      budgetPlanId: 'sandbox-bp-1',
      ledgerEntryId: '',
      amount: 500,
      advanceDate: '2025-09-01',
      title: '範例：已封存（雙日期皆填）',
      paidBy: '王老師',
      status: 'settled',
      memo: '僅在「歷史封存」可見',
      settledDate: '2025-09-15',
      paidToPayeeDate: '2025-09-20',
      archivedAt: '2025-09-20',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ] as BudgetPlanAdvance[],
  /** 計畫專案底下巢狀支用／資料夾（key = planId） */
  budgetPlanLedgerByPlanId: {
    'sandbox-bp-1': [
      {
        id: 'led-f1',
        budgetPlanId: 'sandbox-bp-1',
        parentId: null,
        kind: 'folder',
        title: '教學材料與耗材',
        hidden: false,
        estimatedAmount: 0,
        amount: 0,
        expenseDate: '',
        memo: '可依實際分類再建子資料夾',
        order: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'led-e1',
        budgetPlanId: 'sandbox-bp-1',
        parentId: 'led-f1',
        kind: 'expense',
        title: '本土語教材印製',
        estimatedAmount: 5000,
        amount: 4500,
        paymentStatus: 'settled',
        expenseDate: '2025-10-20',
        memo: '廠商：範例印刷、發票已收',
        order: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'led-e2',
        budgetPlanId: 'sandbox-bp-1',
        parentId: 'led-f1',
        kind: 'expense',
        title: '文具補充',
        estimatedAmount: 300,
        amount: 320,
        paymentStatus: 'executed_pending',
        expenseDate: '2025-11-05',
        memo: '',
        order: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  } as Record<string, BudgetPlanLedgerEntry[]>,
};

// --- Courses & Students ---
export function sandboxGetHistory(): Promise<SandboxCourseRecord[]> {
  return Promise.resolve([...store.courses].sort((a, b) => (b.createdAt as string).localeCompare((a.createdAt as string) || '')));
}

export function sandboxGetCourseStudents(courseId: string): Promise<Pick<Student, 'id' | 'period' | 'className' | 'name'>[]> {
  const list = store.students.filter((s) => s.courseId === courseId);
  return Promise.resolve(list.map((s) => ({ id: s.id, period: s.period, className: s.className, name: s.name })));
}

export function sandboxSaveCourseConfig(payload: {
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
  const courseId = uid();
  const fileUrl = 'https://docs.google.com/spreadsheets/d/sandbox-' + courseId + '/edit';
  store.courses.unshift({
    id: courseId,
    academicYear: payload.academicYear ?? '',
    semester: payload.semester ?? '',
    courseName: payload.courseName ?? '',
    instructor: payload.instructorName ?? '',
    classTime: payload.classTime ?? '',
    location: payload.location ?? '',
    createdAt: new Date().toISOString(),
    fileUrl,
    startDate: payload.startDate ?? '',
    endDate: payload.endDate ?? '',
    selectedDays: JSON.stringify(payload.selectedDays ?? []),
  });
  const students = payload.students ?? [];
  students.forEach((s) => {
    store.students.push({
      courseId,
      id: s.id ?? uid(),
      period: s.period ?? '',
      className: s.className ?? '',
      name: s.name ?? '',
    });
  });
  return Promise.resolve({
    courseId,
    recordCount: students.length,
    driveFile: { url: fileUrl, id: 'sandbox-file-' + courseId, path: 'Sandbox/點名單' },
    message: 'Saved successfully (Sandbox)',
  });
}

export function sandboxGetSemesterData(payload: { academicYear: string; semester: string }) {
  return sandboxGetHistory().then((all) => {
    const target = all.filter(
      (c) => String(c.academicYear) === String(payload.academicYear) && String(c.semester) === String(payload.semester)
    );
    return Promise.all(
      target.map(async (c) => ({
        academicYear: c.academicYear,
        semester: c.semester,
        courseName: c.courseName,
        instructor: c.instructor,
        classTime: c.classTime,
        location: c.location,
        students: await sandboxGetCourseStudents(c.id),
      }))
    ).then((result) => {
      result.sort((a, b) => a.courseName.localeCompare(b.courseName));
      return result;
    });
  });
}

// --- Awards ---
export function sandboxGetAwardHistory(): Promise<AwardRecord[]> {
  const list = [...store.awards].sort((a, b) => (b.createdAt as string).localeCompare((a.createdAt as string) || ''));
  return Promise.resolve(
    list.map((a) => ({ id: a.id, date: a.date, title: a.title, students: a.students, createdAt: a.createdAt }))
  );
}

export function sandboxSaveAwardRecord(payload: { date: string; title: string; students: any[] }) {
  const id = uid();
  store.awards.unshift({
    id,
    date: payload.date,
    title: payload.title,
    students: payload.students ?? [],
    createdAt: new Date().toISOString(),
  });
  return Promise.resolve({ success: true, id });
}

export async function sandboxGetAllKnownStudents(): Promise<{ className: string; name: string }[]> {
  const map = new Map<string, { className: string; name: string }>();
  const add = (className: string, name: string) => {
    const cn = String(className ?? '').trim();
    const nm = String(name ?? '').trim();
    if (!cn || !nm) return;
    map.set(`${cn}_${nm}`, { className: cn, name: nm });
  };
  store.students.forEach((s) => add(s.className, s.name));
  store.awards.forEach((a) => {
    (a.students || []).forEach((s: any) => add(s.className, s.name));
  });
  const rosters = await sandboxGetAllLanguageElectiveRosters();
  rosters.forEach((r) => {
    (r.students ?? []).forEach((s) => add(s.className, s.name));
  });
  const result = Array.from(map.values());
  result.sort((a, b) => {
    if (a.className !== b.className) return a.className.localeCompare(b.className, undefined, { numeric: true });
    return a.name.localeCompare(b.name);
  });
  return result;
}

// --- Vendors ---
export function sandboxGetVendors(): Promise<Vendor[]> {
  return Promise.resolve([...store.vendors]);
}

export function sandboxSaveVendor(payload: Partial<Vendor> & { name: string }) {
  const id = payload.id ?? uid();
  const idx = store.vendors.findIndex((v) => v.id === id);
  const row = {
    id,
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
  if (idx >= 0) store.vendors[idx] = row as Vendor;
  else store.vendors.push(row);
  return Promise.resolve({ success: true, id });
}

export function sandboxDeleteVendor(payload: { id: string }) {
  store.vendors = store.vendors.filter((v) => v.id !== payload.id);
  return Promise.resolve({ success: true });
}

// --- Budget plans ---
export function sandboxGetBudgetPlans(): Promise<BudgetPlan[]> {
  return Promise.resolve([...store.budgetPlans].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')));
}

export function sandboxGetBudgetPlan(id: string): Promise<BudgetPlan | null> {
  const p = store.budgetPlans.find((x) => x.id === id);
  return Promise.resolve(p ? { ...p } : null);
}

export function sandboxSaveBudgetPlan(payload: Partial<BudgetPlan> & { name: string }) {
  const id = payload.id ?? uid();
  const now = new Date().toISOString();
  const idx = store.budgetPlans.findIndex((p) => p.id === id);
  const prevKind: BudgetPlanPeriodKind | undefined =
    idx >= 0 ? store.budgetPlans[idx].periodKind : undefined;
  const periodKind: BudgetPlanPeriodKind =
    payload.periodKind === 'calendar_year' || payload.periodKind === 'academic_year'
      ? payload.periodKind
      : prevKind ?? 'academic_year';
  const row: BudgetPlan = {
    id,
    academicYear: String(payload.academicYear ?? '').trim() || (idx >= 0 ? store.budgetPlans[idx].academicYear : ''),
    periodKind,
    name: payload.name ?? '',
    accountingCode:
      String(payload.accountingCode ?? '').trim() ||
      (idx >= 0 ? store.budgetPlans[idx].accountingCode : ''),
    budgetTotal: Number(payload.budgetTotal) >= 0 ? Number(payload.budgetTotal) : 0,
    reservedTotal:
      payload.reservedTotal !== undefined
        ? Math.max(0, Number(payload.reservedTotal) || 0)
        : idx >= 0
          ? (store.budgetPlans[idx].reservedTotal ?? 0)
          : 0,
    spentTotal: Number(payload.spentTotal) >= 0 ? Number(payload.spentTotal) : 0,
    plannedCommitTotal:
      payload.plannedCommitTotal !== undefined
        ? Math.max(0, Number(payload.plannedCommitTotal) || 0)
        : idx >= 0
          ? (store.budgetPlans[idx].plannedCommitTotal ?? 0)
          : 0,
    closeByDate: String(payload.closeByDate ?? '').trim() || (idx >= 0 ? store.budgetPlans[idx].closeByDate : ''),
    closureRequirements:
      String(payload.closureRequirements ?? '').trim() || (idx >= 0 ? store.budgetPlans[idx].closureRequirements : ''),
    status: payload.status === 'closed' ? 'closed' : 'active',
    note: payload.note ?? '',
    createdAt: idx >= 0 ? store.budgetPlans[idx].createdAt ?? now : now,
    updatedAt: now,
  };
  if (idx >= 0) store.budgetPlans[idx] = row;
  else store.budgetPlans.push(row);
  return Promise.resolve({ success: true, id });
}

export function sandboxDeleteBudgetPlan(payload: { id: string }) {
  store.budgetPlans = store.budgetPlans.filter((p) => p.id !== payload.id);
  store.budgetPlanAdvances = store.budgetPlanAdvances.filter((a) => a.budgetPlanId !== payload.id);
  delete store.budgetPlanLedgerByPlanId[payload.id];
  return Promise.resolve({ success: true });
}

export function sandboxUpdateBudgetPlanFinancialRollups(
  planId: string,
  spentTotal: number,
  plannedCommitTotal: number,
  reservedTotal?: number
) {
  const p = store.budgetPlans.find((x) => x.id === planId);
  if (!p) return Promise.resolve({ success: false as const });
  const s = Number(spentTotal);
  const pl = Number(plannedCommitTotal);
  p.spentTotal = Number.isFinite(s) && s >= 0 ? s : 0;
  p.plannedCommitTotal = Number.isFinite(pl) && pl >= 0 ? pl : 0;
  if (reservedTotal !== undefined) {
    const r = Number(reservedTotal);
    p.reservedTotal = Number.isFinite(r) && r >= 0 ? r : 0;
  }
  p.updatedAt = new Date().toISOString();
  return Promise.resolve({ success: true as const });
}

function sandboxLedgerList(planId: string): BudgetPlanLedgerEntry[] {
  return store.budgetPlanLedgerByPlanId[planId] ?? [];
}

function sandboxCollectLedgerSubtreeIds(entries: BudgetPlanLedgerEntry[], rootId: string): string[] {
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

function sandboxParseLedgerPaymentStatus(v: unknown): BudgetPlanLedgerPaymentStatus {
  if (v === 'planned' || v === 'executed_pending' || v === 'settled') return v;
  return 'settled';
}

export function sandboxGetBudgetPlanLedgerEntries(planId: string): Promise<BudgetPlanLedgerEntry[]> {
  const list = sandboxLedgerList(planId);
  return Promise.resolve([...list].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh-TW')));
}

export function sandboxSaveBudgetPlanLedgerEntry(
  planId: string,
  payload: Partial<BudgetPlanLedgerEntry> & { title: string; kind: BudgetPlanLedgerKind }
) {
  const id = payload.id ?? uid();
  const now = new Date().toISOString();
  let list = sandboxLedgerList(planId);
  const idx = list.findIndex((e) => e.id === id);
  const prev = idx >= 0 ? list[idx] : undefined;
  const parentId = payload.parentId === undefined ? (idx >= 0 ? list[idx].parentId : null) : payload.parentId;
  const normalizedParent = parentId === '' || parentId === undefined ? null : parentId;
  const siblings = list.filter((e) => (e.parentId ?? null) === normalizedParent && e.id !== id);
  let order = payload.order;
  if (order === undefined || order === null) {
    order = siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => s.order), -1) + 1;
  }
  const kind = payload.kind === 'expense' ? 'expense' : 'folder';
  const amount =
    kind === 'expense'
      ? Math.max(
          0,
          Number(payload.amount !== undefined ? payload.amount : (prev?.amount ?? 0)) || 0
        )
      : 0;
  const estimatedAmount =
    kind === 'expense'
      ? Math.max(
          0,
          Number(
            payload.estimatedAmount !== undefined ? payload.estimatedAmount : (prev?.estimatedAmount ?? 0)
          ) || 0
        )
      : 0;
  const paymentStatus: BudgetPlanLedgerPaymentStatus | undefined =
    kind === 'expense'
      ? payload.paymentStatus !== undefined
        ? sandboxParseLedgerPaymentStatus(payload.paymentStatus)
        : prev?.paymentStatus != null
          ? prev.paymentStatus
          : 'planned'
      : undefined;
  const allowPooling = payload.allowPooling !== undefined ? payload.allowPooling === true : (prev?.allowPooling ?? false);
  const budgetAllocated =
    kind === 'folder'
      ? Math.max(
          0,
          Number(payload.budgetAllocated !== undefined ? payload.budgetAllocated : (prev?.budgetAllocated ?? 0)) || 0
        )
      : undefined;
  const hidden = kind === 'folder' ? (payload.hidden !== undefined ? payload.hidden === true : (prev?.hidden ?? false)) : undefined;
  const row: BudgetPlanLedgerEntry = {
    id,
    budgetPlanId: planId,
    parentId: normalizedParent,
    kind,
    title: String(payload.title).trim(),
    hidden,
    estimatedAmount,
    amount,
    budgetAllocated,
    allowPooling,
    paymentStatus,
    expenseDate: kind === 'expense' ? String(payload.expenseDate ?? prev?.expenseDate ?? '').trim() : '',
    memo: payload.memo !== undefined ? String(payload.memo) : (prev?.memo ?? ''),
    order: Math.max(0, Number(order) || 0),
    createdAt: idx >= 0 ? list[idx].createdAt ?? now : now,
    updatedAt: now,
  };
  if (idx >= 0) list = list.map((e) => (e.id === id ? row : e));
  else list = [...list, row];
  store.budgetPlanLedgerByPlanId[planId] = list;
  return Promise.resolve({ success: true as const, id });
}

export function sandboxDeleteBudgetPlanLedgerEntry(planId: string, entryId: string) {
  const list = sandboxLedgerList(planId);
  const ids = new Set(sandboxCollectLedgerSubtreeIds(list, entryId));
  store.budgetPlanLedgerByPlanId[planId] = list.filter((e) => !ids.has(e.id));
  return Promise.resolve({ success: true as const });
}

// --- Budget plan advances (代墊紀錄) ---
export function sandboxGetBudgetPlanAdvances(
  scope?: 'active' | 'archived' | 'all',
): Promise<BudgetPlanAdvance[]> {
  let list = [...store.budgetPlanAdvances];
  const s = scope ?? 'all';
  if (s === 'active') list = list.filter((a) => !String(a.archivedAt ?? '').trim());
  else if (s === 'archived') list = list.filter((a) => !!String(a.archivedAt ?? '').trim());
  list.sort((a, b) => (b.advanceDate || '').localeCompare(a.advanceDate || ''));
  return Promise.resolve(list);
}

export function sandboxSaveBudgetPlanAdvance(
  payload: Partial<BudgetPlanAdvance> & { amount: number; advanceDate: string; title: string }
) {
  const id = payload.id ?? uid();
  const now = new Date().toISOString();
  const idx = store.budgetPlanAdvances.findIndex((a) => a.id === id);
  const sd = String(payload.settledDate ?? '').trim();
  const pd = String(payload.paidToPayeeDate ?? '').trim();
  let st: BudgetPlanAdvance['status'];
  if (payload.status === 'cancelled') st = 'cancelled';
  else if (sd && pd) st = 'settled';
  else if (payload.status === 'settled') st = 'settled';
  else st = 'outstanding';
  const shouldArchive = sd && pd && st !== 'cancelled';
  const prevArchived =
    idx >= 0 ? String(store.budgetPlanAdvances[idx].archivedAt ?? '').trim() : '';
  const archivedAt = shouldArchive ? prevArchived || new Date().toISOString().slice(0, 10) : '';
  const planId = String(payload.budgetPlanId ?? '').trim();
  const row: BudgetPlanAdvance = {
    id,
    budgetPlanId: planId,
    ledgerEntryId: planId ? (payload.ledgerEntryId != null ? String(payload.ledgerEntryId).trim() : '') : '',
    amount: Math.max(0, Number(payload.amount) || 0),
    advanceDate: String(payload.advanceDate).trim(),
    title: String(payload.title).trim(),
    paidBy: payload.paidBy != null ? String(payload.paidBy).trim() : '',
    status: st,
    settledDate: String(payload.settledDate ?? '').trim(),
    paidToPayeeDate: String(payload.paidToPayeeDate ?? '').trim(),
    archivedAt,
    memo: payload.memo ?? '',
    createdAt: idx >= 0 ? store.budgetPlanAdvances[idx].createdAt ?? now : now,
    updatedAt: now,
  };
  if (idx >= 0) store.budgetPlanAdvances[idx] = row;
  else store.budgetPlanAdvances.unshift(row);
  return Promise.resolve({ success: true, id });
}

export function sandboxDeleteBudgetPlanAdvance(payload: { id: string }) {
  store.budgetPlanAdvances = store.budgetPlanAdvances.filter((a) => a.id !== payload.id);
  return Promise.resolve({ success: true });
}

// --- Exam Paper Folders ---
export function sandboxGetExamPaperFolders(): Promise<ExamPaperFolder[]> {
  return Promise.resolve([...store.examPaperFolders].sort((a, b) => a.order - b.order));
}

export function sandboxSaveExamPaperFolder(payload: Omit<ExamPaperFolder, 'id'> & { id?: string }) {
  const id = payload.id ?? uid();
  const row: ExamPaperFolder = {
    id,
    name: payload.name,
    order: payload.order ?? 0,
    parentId: payload.parentId ?? undefined,
    driveFolderUrl: payload.driveFolderUrl ?? undefined,
  };
  const idx = store.examPaperFolders.findIndex((f) => f.id === id);
  if (idx >= 0) store.examPaperFolders[idx] = row;
  else store.examPaperFolders.push(row);
  return Promise.resolve({ success: true, id });
}

export function sandboxDeleteExamPaperFolder(payload: { id: string }) {
  store.examPaperFolders = store.examPaperFolders.filter((f) => f.id !== payload.id);
  return Promise.resolve({ success: true });
}

// --- Exam Papers ---
export function sandboxGetExamPapers(): Promise<ExamPaper[]> {
  return Promise.resolve([...store.examPapers].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)));
}

export function sandboxSaveExamPaper(payload: Omit<ExamPaper, 'id'> & { id?: string }) {
  const id = payload.id ?? uid();
  const row: ExamPaper = {
    id,
    folderId: payload.folderId ?? undefined,
    title: payload.title ?? '',
    grade: payload.grade,
    domain: payload.domain,
    fileName: payload.fileName,
    fileUrl: payload.fileUrl,
    mimeType: payload.mimeType ?? 'application/octet-stream',
    fileId: payload.fileId,
    schoolYear: payload.schoolYear,
    semester: payload.semester,
    examType: payload.examType,
    authorTeacherName: payload.authorTeacherName,
    authorTeacherNote: payload.authorTeacherNote,
    uploadedBy: payload.uploadedBy,
    uploadedAt: payload.uploadedAt ?? new Date().toISOString(),
  };
  const idx = store.examPapers.findIndex((e) => e.id === id);
  if (idx >= 0) store.examPapers[idx] = row;
  else store.examPapers.push(row);
  return Promise.resolve({ success: true, id });
}

export function sandboxDeleteExamPaper(payload: { id: string }) {
  store.examPapers = store.examPapers.filter((e) => e.id !== payload.id);
  return Promise.resolve({ success: true });
}

// --- Exam Paper Checks ---
export function sandboxGetExamPaperChecks(): Promise<ExamPaperCheck[]> {
  return Promise.resolve([...store.examPaperChecks]);
}

export function sandboxSetExamPaperCheck(payload: { grade: string; domain: string; checked: boolean }) {
  const idx = store.examPaperChecks.findIndex(
    (c) => c.grade === payload.grade && c.domain === payload.domain
  );
  const row: ExamPaperCheck = {
    grade: payload.grade,
    domain: payload.domain,
    checked: payload.checked,
  };
  if (idx >= 0) store.examPaperChecks[idx] = row;
  else store.examPaperChecks.push(row);
  return Promise.resolve({ success: true });
}

// --- 學生語言選修登錄 ---
export function sandboxGetLanguageElectiveRoster(academicYear: string): Promise<LanguageElectiveRosterDoc | null> {
  const entries = Object.entries(store.languageElectiveProfiles).map(([id, data]) => ({
    id,
    data: data as Record<string, unknown>,
  }));
  const fromProfiles = projectRosterFromPlainEntries(entries, academicYear);
  const legacy = store.languageElective[academicYear];
  const v2 = legacy?.studentRosterVersion === STUDENT_ROSTER_VERSION;
  let students = fromProfiles;
  if (students.length === 0 && !v2 && legacy?.students?.length) {
    students = legacy.students.map((st) => ({
      ...st,
      profileDocId: pickProfileDocId(st, academicYear),
    }));
  }
  const doc: LanguageElectiveRosterDoc = {
    academicYear,
    semester: legacy?.semester,
    students,
    languageClassSettings: legacy?.languageClassSettings,
    updatedAt: legacy?.updatedAt,
    studentRosterVersion: legacy?.studentRosterVersion,
  };
  return Promise.resolve(doc);
}

export function sandboxGetAllLanguageElectiveRosters(): Promise<LanguageElectiveRosterDoc[]> {
  const yearSet = new Set<string>(Object.keys(store.languageElective));
  for (const data of Object.values(store.languageElectiveProfiles)) {
    const d = data as Record<string, unknown>;
    const ys = d.years as Record<string, unknown> | undefined;
    if (ys) Object.keys(ys).forEach((k) => yearSet.add(k));
    const ay = String(d.academicYear ?? '').trim();
    if (ay) yearSet.add(ay);
  }
  const years = Array.from(yearSet).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
  return Promise.all(years.map((y) => sandboxGetLanguageElectiveRoster(y))).then((docs) =>
    docs.filter((d): d is LanguageElectiveRosterDoc => d != null)
  );
}

export function sandboxSaveLanguageElectiveRoster(
  academicYear: string,
  students: { className: string; seat: string; name: string; language: string; languageClass?: string; studentId?: string; profileDocId?: string }[],
  languageClassSettings?: LanguageClassSetting[]
): Promise<void> {
  applyLanguageElectiveSaveInMemory(store.languageElectiveProfiles, academicYear, students);
  const prev = store.languageElective[academicYear];
  store.languageElective[academicYear] = {
    academicYear,
    languageClassSettings: languageClassSettings ?? prev?.languageClassSettings,
    studentRosterVersion: STUDENT_ROSTER_VERSION,
    students: [],
    updatedAt: new Date().toISOString(),
    semester: prev?.semester,
  };
  return Promise.resolve();
}

// --- 學期／放假日設定 (點名單用) ---
export function sandboxGetCalendarSettings(academicYear: string, semester: string): Promise<CalendarSettings | null> {
  const key = `${academicYear}_${semester}`;
  const doc = store.calendarSettings[key];
  return Promise.resolve(doc ?? null);
}

// --- 段考提報（Sandbox stubs）---
export function sandboxGetExamCampaigns(): Promise<ExamCampaign[]> {
  return Promise.resolve([...store.examCampaigns]);
}

export function sandboxCreateExamCampaign(payload: Omit<ExamCampaign, 'id'>): Promise<ExamCampaign> {
  const row: ExamCampaign = { id: uid(), ...payload, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
  store.examCampaigns.unshift(row);
  return Promise.resolve(row);
}

export function sandboxUpdateExamCampaign(id: string, patch: Partial<ExamCampaign>): Promise<void> {
  store.examCampaigns = store.examCampaigns.map((c) => (c.id === id ? ({ ...c, ...patch, id, updatedAt: new Date().toISOString() } as ExamCampaign) : c));
  return Promise.resolve();
}

export function sandboxGetExamAwardsConfig(): Promise<ExamAwardsConfig> {
  return Promise.resolve(store.examAwardsConfig);
}

export function sandboxSaveExamAwardsConfig(config: ExamAwardsConfig): Promise<void> {
  store.examAwardsConfig = { ...config, updatedAt: new Date().toISOString() };
  return Promise.resolve();
}

export function sandboxGetExamSubmitAllowedUsers(): Promise<ExamSubmitAllowedUser[]> {
  return Promise.resolve(Object.values(store.examSubmitAllowedUsers));
}

export function sandboxSetExamSubmitAllowedUser(email: string, patch: Partial<ExamSubmitAllowedUser>): Promise<void> {
  const key = (email ?? '').trim().toLowerCase();
  const prev = store.examSubmitAllowedUsers[key] ?? { email: key, enabled: true };
  store.examSubmitAllowedUsers[key] = { ...prev, ...patch, email: key, updatedAt: new Date().toISOString() };
  return Promise.resolve();
}

export function sandboxGetExamSubmitAllowedUser(email: string): Promise<ExamSubmitAllowedUser | null> {
  const key = (email ?? '').trim().toLowerCase();
  return Promise.resolve(store.examSubmitAllowedUsers[key] ?? null);
}

export function sandboxGetExamSubmissions(campaignId: string): Promise<ExamSubmission[]> {
  const list = Object.values(store.examSubmissions).filter((s) => s.campaignId === campaignId);
  return Promise.resolve(list.sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '')));
}

export function sandboxSaveExamSubmission(submission: ExamSubmission): Promise<void> {
  store.examSubmissions[submission.id] = { ...submission, updatedAt: new Date().toISOString() };
  return Promise.resolve();
}

export function sandboxUnlockExamSubmission(id: string, unlockedByEmail: string): Promise<void> {
  const prev = store.examSubmissions[id];
  if (!prev) return Promise.resolve();
  store.examSubmissions[id] = { ...prev, locked: false, unlockedByEmail, unlockedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  return Promise.resolve();
}

// --- 系統設定（選修語言類別）---
function collectLanguageOptionsFromRosters(): string[] {
  const set = new Set<string>(DEFAULT_LANGUAGE_OPTIONS);
  Object.values(store.languageElective).forEach((doc) => {
    (doc.students ?? []).forEach((s) => {
      const v = (s.language ?? '').trim();
      if (v) set.add(v);
    });
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-TW'));
}

export function sandboxGetLanguageOptions(): Promise<string[]> {
  const existing = store.systemSettings.languageOptions;
  if (Array.isArray(existing) && existing.length > 0) return Promise.resolve([...existing]);
  const merged = collectLanguageOptionsFromRosters();
  store.systemSettings.languageOptions = merged;
  return Promise.resolve(merged);
}

export function sandboxSaveLanguageOptions(options: string[]): Promise<void> {
  store.systemSettings.languageOptions = options.length ? [...options] : [...DEFAULT_LANGUAGE_OPTIONS];
  return Promise.resolve();
}

// --- Archive ---
export function sandboxGetArchiveTasks(): Promise<ArchiveTask[]> {
  return Promise.resolve([...store.archive].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
}

export function sandboxSaveArchiveTask(payload: Partial<ArchiveTask> & { title: string; month: string }) {
  const id = payload.id ?? uid();
  const idx = store.archive.findIndex((a) => a.id === id);
  const row: ArchiveTask = {
    id,
    title: payload.title,
    month: payload.month,
    isPrinted: payload.isPrinted ?? false,
    isNotified: payload.isNotified ?? false,
    notes: payload.notes ?? '',
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) store.archive[idx] = row;
  else store.archive.unshift(row);
  return Promise.resolve({ success: true, id });
}

export function sandboxDeleteArchiveTask(payload: { id: string }) {
  store.archive = store.archive.filter((a) => a.id !== payload.id);
  return Promise.resolve({ success: true });
}

// --- Todos ---
export function sandboxGetTodos(): Promise<TodoItem[]> {
  return Promise.resolve([...store.todos].sort((a, b) => a.date.localeCompare(b.date)));
}

export function sandboxSaveTodo(payload: Partial<TodoItem> & { date: string; title: string; type: string }) {
  const id = payload.id ?? uid();
  const topic = (payload.topic ?? '').trim();
  const doc = {
    id,
    academicYear: payload.academicYear ?? '114',
    date: payload.date,
    title: payload.title ?? '',
    type: payload.type ?? 'task',
    status: payload.status ?? 'pending',
    priority: payload.priority ?? 'Medium',
    seriesId: payload.seriesId ?? '',
    topic,
    officialDocs: payload.officialDocs ?? [],
    contacts: payload.contacts ?? [],
    commonContacts: payload.commonContacts ?? [],
    attachments: (payload.attachments ?? []).filter((x): x is Attachment => Boolean(x?.url)),
    commonAttachments: (payload.commonAttachments ?? []).filter((x): x is Attachment => Boolean(x?.url)),
    memo: payload.memo ?? '',
    createdAt: (payload.createdAt as string) ?? new Date().toISOString(),
    period: payload.period ?? 'full',
  };
  const idx = store.todos.findIndex((t) => t.id === id);
  if (idx >= 0) store.todos[idx] = doc as TodoItem;
  else store.todos.push(doc as TodoItem);
  if (topic) {
    store.todos.forEach((t) => {
      if (t.topic === topic && t.academicYear === (payload.academicYear ?? '114') && t.id !== id) {
        t.commonAttachments = doc.commonAttachments;
        t.commonContacts = doc.commonContacts;
      }
    });
  }
  return Promise.resolve({ success: true, message: 'Saved successfully', seriesId: doc.seriesId });
}

export function sandboxSaveBatchTodos(payload: { todos: Partial<TodoItem>[] }) {
  const todos = payload.todos ?? [];
  todos.forEach((todo) => {
    const id = todo.id ?? uid();
    store.todos.push({
      id,
      academicYear: todo.academicYear ?? '114',
      date: todo.date ?? '',
      title: todo.title ?? '',
      type: (todo.type as any) ?? 'duty',
      status: (todo.status as any) ?? 'pending',
      priority: (todo.priority as any) ?? 'Medium',
      seriesId: '',
      topic: '',
      officialDocs: [],
      contacts: [],
      commonContacts: [],
      attachments: [],
      commonAttachments: [],
      memo: todo.memo ?? '',
      createdAt: new Date().toISOString(),
      period: (todo.period as any) ?? 'full',
    } as TodoItem);
  });
  return Promise.resolve({ success: true, message: `Batch saved ${todos.length} items` });
}

export function sandboxDeleteTodo(payload: { id: string }) {
  store.todos = store.todos.filter((t) => t.id !== payload.id);
  return Promise.resolve({ success: true });
}

// --- Monthly recurring calendar rules ---
export function sandboxGetMonthlyRecurringTodoRules(): Promise<MonthlyRecurringTodoRule[]> {
  return Promise.resolve(
    [...store.monthlyRecurringRules].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-TW'))
  );
}

export function sandboxSaveMonthlyRecurringTodoRule(
  payload: Partial<MonthlyRecurringTodoRule> & { title: string; dayOfMonth: number }
) {
  const id = payload.id ?? uid();
  const idx = store.monthlyRecurringRules.findIndex((r) => r.id === id);
  let months = Array.isArray(payload.months) ? [...new Set(payload.months.filter((m) => m >= 1 && m <= 12))].sort((a, b) => a - b) : [];
  if (months.length === 12) months = [];
  const row: MonthlyRecurringTodoRule = {
    id,
    title: payload.title.trim(),
    type: (payload.type as string) || '行政',
    priority: payload.priority ?? 'Medium',
    dayOfMonth: Math.min(31, Math.max(1, Math.floor(payload.dayOfMonth))),
    months,
    memo: payload.memo ?? '',
    monthCompletions: payload.monthCompletions ?? (idx >= 0 ? store.monthlyRecurringRules[idx].monthCompletions ?? {} : {}),
    createdAt: idx >= 0 ? store.monthlyRecurringRules[idx].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) store.monthlyRecurringRules[idx] = row;
  else store.monthlyRecurringRules.push(row);
  return Promise.resolve({ success: true, id });
}

export function sandboxDeleteMonthlyRecurringTodoRule(payload: { id: string }) {
  store.monthlyRecurringRules = store.monthlyRecurringRules.filter((r) => r.id !== payload.id);
  return Promise.resolve({ success: true });
}

/** Sandbox: 學校教師名單（供受款人自動建議） */
export function sandboxGetSchoolTeacherNames(): Promise<string[]> {
  return Promise.resolve(['王小明', '林雅婷', '陳美玲', '張志豪', '李佩珊']);
}

export function sandboxUpdateMonthlyRecurringMonthStatus(payload: {
  id: string;
  yearMonth: string;
  status: 'pending' | 'done' | 'cancelled';
}) {
  const r = store.monthlyRecurringRules.find((x) => x.id === payload.id);
  if (!r) return Promise.resolve({ success: false });
  const next = { ...(r.monthCompletions ?? {}) };
  if (payload.status === 'pending') delete next[payload.yearMonth];
  else next[payload.yearMonth] = payload.status;
  r.monthCompletions = next;
  r.updatedAt = new Date().toISOString();
  return Promise.resolve({ success: true });
}

export function sandboxCancelSeries(payload: {
  seriesId?: string;
  topic?: string;
  pivotDate: string;
  academicYear?: string;
}) {
  const pivot = new Date(payload.pivotDate);
  const targetTopic = (payload.topic ?? '').trim();
  store.todos.forEach((t) => {
    const match = targetTopic
      ? t.topic === targetTopic
      : !!(payload.seriesId && t.seriesId === payload.seriesId);
    if (match && (!payload.academicYear || String(t.academicYear) === String(payload.academicYear))) {
      if (new Date(t.date) >= pivot) t.status = 'cancelled';
    }
  });
  return Promise.resolve({ success: true, message: 'Series cancelled' });
}

export function sandboxToggleTodoStatus(payload: { id: string; newStatus: TodoItem['status'] }) {
  const t = store.todos.find((x) => x.id === payload.id);
  if (t) t.status = payload.newStatus;
  return Promise.resolve({ success: true });
}

// --- Mock GAS (附檔 / 點名單 / 頒獎 Doc / 匯入 / Setup) ---
export function mockGasPost(
  action: string,
  payload: unknown
): Promise<{ success: boolean; data?: any; message?: string }> {
  const base = 'https://drive.google.com/sandbox-mock/';
  switch (action) {
    case 'CREATE_ATTENDANCE_FILE':
      return Promise.resolve({
        success: true,
        data: { url: base + 'attendance-' + uid(), id: 'mock-file-' + uid(), path: 'Sandbox/點名單' },
      });
    case 'UPLOAD_ATTACHMENT': {
      const p = payload as { name?: string; prefix?: string };
      const name = p.prefix ? `【${p.prefix}】${p.name}` : p.name;
      return Promise.resolve({
        success: true,
        data: {
          success: true,
          file: { id: 'mock-att-' + uid(), name: name || 'file', url: base + 'file/' + uid(), mimeType: 'application/octet-stream' },
        },
      });
    }
    case 'CREATE_AWARD_DOCS':
    case 'CREATE_AWARD_SUMMARY_DOCS':
      return Promise.resolve({
        success: true,
        data: {
          success: true,
          docs: [
            { category: '低年級', url: base + 'award-doc-1', name: '[頒獎] Sandbox 示範 - 低年級' },
            { category: '中年級', url: base + 'award-doc-2', name: '[頒獎] Sandbox 示範 - 中年級' },
          ],
        },
      });
    case 'IMPORT_FROM_URL':
      return Promise.resolve({
        success: true,
        data: {
          data: {
            academicYear: '114',
            semester: '上學期',
            courseName: '匯入示範課程',
            instructorName: '匯入教師',
            classTime: '週二 09:00',
            location: '教室A',
            students: [
              { id: '1', period: '第一節', className: '401', name: '匯入學生一' },
              { id: '2', period: '第一節', className: '401', name: '匯入學生二' },
            ],
          },
        },
      });
    case 'SETUP':
      return Promise.resolve({
        success: true,
        data: {
          logs: [
            '✅ Sandbox 模式：資料庫為記憶體模擬。',
            '✅ 附檔／點名單／頒獎 Doc 為模擬連結，未實際寫入 Google Drive。',
            '✅ 可正常操作以了解程式流程，切換正式環境請關閉 VITE_SANDBOX。',
          ],
        },
      });
    default:
      return Promise.resolve({ success: true, data: null });
  }
}

/** 測試階段 PIN：輸入後與 Sandbox 相同快速進入（僅 DEV 有效，勿用於正式站） */
export const TEST_PIN = '5012';
const PIN_BYPASS_STORAGE_KEY = 'edutrack_pin_bypass_ok';
/** 登入頁是否顯示 PIN 區塊（存在 localStorage，系統設定可切換） */
const PIN_UI_ENABLED_KEY = 'edutrack_pin_ui_enabled';

/** 是否於登入頁顯示 PIN 快速登入（僅 DEV；預設 true，關閉後寫入 '0'） */
export function isPinUiEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    const v = localStorage.getItem(PIN_UI_ENABLED_KEY);
    if (v === '0') return false;
    return true;
  } catch {
    return true;
  }
}

export function setPinUiEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(PIN_UI_ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function isPinBypassActive(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return sessionStorage.getItem(PIN_BYPASS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** 設定／清除 PIN 測試登入（僅 DEV） */
export function setPinBypass(active: boolean): void {
  if (!import.meta.env.DEV) return;
  try {
    if (active) sessionStorage.setItem(PIN_BYPASS_STORAGE_KEY, '1');
    else sessionStorage.removeItem(PIN_BYPASS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function isSandbox(): boolean {
  if (import.meta.env.VITE_SANDBOX === 'true') return true;
  return isPinBypassActive();
}
