
export enum TeacherType {
  INTERNAL = '校內教師',
  EXTERNAL = '校外教師',
  LANGUAGE = '語言教師',
}

export enum PayType {
  HOURLY = '鐘點費',
  DAILY = '日薪',
  HALF_DAY = '半日薪',
}

export enum LeaveType {
  PUBLIC_OFFICIAL = '公付 (公假)',
  PUBLIC_GENERAL = '公付 (喪病產等)',
  PUBLIC_MENTAL = '公付 (身心)',
  PUBLIC_AFFAIRS = '公付 (其他事務費)',
  PUBLIC_COUNSELING = '公付 (學輔事務費)',
  PUBLIC_PTA = '公派(家長會)',
  PERSONAL = '自理 (事假/病假)',
}

/**
 * 教師請假公開表單 #/teacher-request 專用之假別（寫入 teacherLeaveRequests.leaveType）。
 * 匯入主系統時請用 mapTeacherRequestLeaveTypeToSystemLeaveType 對應至 LeaveType；管理員可在代課單編輯頁再調整。
 */
export const TEACHER_REQUEST_LEAVE_TYPES = [
  '公假派代(研習、帶隊參賽等，需檢附公文)',
  '身心調適假派代(無需公文，每年三天)',
  '自理(事病假等)',
  '公假派代(喪產等)',
  '其他假別',
] as const;

export type TeacherRequestLeaveType = (typeof TEACHER_REQUEST_LEAVE_TYPES)[number];

/**
 * 將公開請假表單之假別對應到主系統 LeaveType（清冊／GAS 分類與 EntryForm 一致）。
 * 含舊版表單選項（公付、身心假、自理）相容。
 */
export function mapTeacherRequestLeaveTypeToSystemLeaveType(requestLeaveType: string | undefined): LeaveType {
  const raw = (requestLeaveType || '').trim();
  if (!raw) return LeaveType.PERSONAL;

  // 新版公開表單（順序：先比對較具體字串；「公假派代」含研習與喪產兩種，須先判喪產）
  if (raw.includes('公假派帶')) return LeaveType.PUBLIC_OFFICIAL; // 舊版錯字，仍相容
  if (
    (raw.includes('公假派代') && (raw.includes('喪產') || raw.includes('產假'))) ||
    raw.includes('公假(喪產') ||
    raw.includes('公假（喪產')
  ) {
    return LeaveType.PUBLIC_GENERAL;
  }
  if (raw.includes('公假派代')) return LeaveType.PUBLIC_OFFICIAL;
  if (raw.includes('身心調適假')) return LeaveType.PUBLIC_MENTAL;
  if (raw.includes('自理(事病假') || raw.includes('自理（事病假') || raw === '自理') return LeaveType.PERSONAL;
  if (raw.includes('其他假別')) return LeaveType.PUBLIC_AFFAIRS;

  // 舊版公開表單
  if (raw === '公付' || raw.startsWith('公付')) return LeaveType.PUBLIC_OFFICIAL;
  if (raw.includes('身心假')) return LeaveType.PUBLIC_MENTAL;
  if (raw.includes('自理')) return LeaveType.PERSONAL;

  return LeaveType.PUBLIC_AFFAIRS;
}

// 新增：處理狀態
export type ProcessingStatus = '待處理' | '已印代課單' | '跑章中' | '結案待算';

/** 代課清冊「憑證狀態」（與 LeaveRecord.processingStatus 一致） */
export const PROCESSING_STATUS_OPTIONS: readonly ProcessingStatus[] = ['待處理', '已印代課單', '跑章中', '結案待算'] as const;

/** 代課系統白名單：文件 ID = email，僅 admin 可寫入；白名單內可讀自己 */
export interface SubteachAllowedUser {
  email: string;   // 與文件 ID 一致
  enabled: boolean;
  role?: 'admin' | 'user';
  displayName?: string;
  updatedAt?: number;
}

export interface SalaryGrade {
  id: string; // Added ID field
  points: number; // 俸點 (例如 190)
  salary: number; // 本俸金額 (例如 24000)
  // 新增：學術研究費欄位 (依照截圖需求)
  researchFeeCertBachelor?: number;   // 有教證 + 學士
  researchFeeCertMaster?: number;     // 有教證 + 碩士以上
  researchFeeNoCertBachelor?: number; // 無教證 + 學士
  researchFeeNoCertMaster?: number;   // 無教證 + 碩士以上
}

// 新增：教師預設課表單節結構
export interface TeacherScheduleSlot {
  day: number; // 1 (Mon) - 5 (Fri)
  period: string; // '1', '2', '早'...
  subject: string;
  className: string;
}

// 新增：減授項目結構
export interface ReductionItem {
  title: string;   // 減授事由 (如：資訊組長、協行)
  periods: number; // 減授節數
}

// 新增：教師文件結構
export interface TeacherDocument {
  id: string;
  name: string;
  url: string;
  uploadDate: string;
}

export interface Teacher {
  id: string;
  name: string; // 教師姓名
  salaryPoints?: number; // 目前薪級 (俸點)
  hasCertificate: boolean; // 有無教證
  education?: string; // 最高學歷
  type: TeacherType; // 類別
  note?: string; // 備註
  
  // New Fields based on request
  isRetired: boolean; // 是否退休
  teachingClasses?: string; // 任課班級
  subjects?: string; // 任教科目
  phone?: string; // 電話
  jobTitle?: string; // 職別
  isSpecialEd: boolean; // 特教教師
  isGraduatingHomeroom: boolean; // 畢業班導師
  
  // Revised: Admin Reduction
  adminReduction?: number; // 舊欄位 (保留用於快速存取總數)
  reductions?: ReductionItem[]; // 新增：詳細減授清單
  
  teacherRole?: string; // 教師角色
  
  // New: External Teacher Expertise
  expertise?: string[]; // 專長科目 (例如: ['國語', '數學'])
  
  // New: Language Teacher Specifics
  hostSchool?: string; // 主聘學校
  languageSpecialty?: string; // 授課語種 (例如: 排灣族語)
  teacherCategory?: 'Indigenous' | 'NewImmigrant' | 'IndigenousFullTime'; // 新增：教師類別 (原住民族語/新住民語/族語專職)
  defaultHourlyRate?: number; // 預設鐘點費 (例如: 360, 400)
  languageSchedule?: {
    dayOfWeek: number; // 1-5 (Mon-Fri)
    periods: string[]; // e.g. ['1', '2']
    isSixthGrade?: boolean; // 新增：該時段是否為六年級課程
  }[];

  // System Fields for Calculation (Hidden in main view but essential)
  baseSalary: number; // 本俸
  researchFee: number; // 學術研究費
  isHomeroom: boolean; // 是否為導師 (可由教師角色推斷，但保留此布林值方便計算)
  
  // New for Overtime
  basicPeriodQuota?: number; // 基本授課節數 (預設)
  
  /** 是否為固定兼課教師（用於固定兼課清冊辨識） */
  isFixedOvertimeTeacher?: boolean;
  
  // New: Default Schedule (Imported)
  defaultSchedule?: TeacherScheduleSlot[];
  /** 依學期分開存的預設週課表（key = `semesters` 文件 id，與 `system/metadata.activeSemesterId` 綁定者）；該 key 存在時（含空陣列）優先於 defaultSchedule */
  defaultSchedulesBySemesterId?: Record<string, TeacherScheduleSlot[]>;

  // New: Default Overtime Slots (Base configuration for monthly overtime)
  defaultOvertimeSlots?: { day: number; period: string }[];

  // New: Entry Documents
  entryDocuments?: TeacherDocument[];
}

// 新增：人力庫項目 (擴充欄位)
export interface SubPoolItem {
  teacherId: string;
  status: 'available' | 'busy' | 'observation'; // 可排課 | 忙碌/暫停 | 觀察中
  note: string;
  updatedAt: number;
  
  // New detailed fields
  availableTime?: string; // 代課時間 (例如: 週一上午, 全天)
  unavailableTime?: string; // 不接課時段 (例如: 週五, 週三下午)
  preferredGrades?: string; // 願意代課學年 (例如：低年級, 1-6)
  teachingSubject?: string; // 專長領域 (Pool 專屬的備註，預設帶入教師專長)
}

/**
 * 代課老師「忙碌／已接其他工作／固定不接」紀錄（Firestore: substituteBusyBlocks）
 * — 供代課資料總表對照，不影響薪資計算。
 */
export type SubstituteBusyBlockKind = 'date' | 'weekly';

/**
 * 節次涵蓋方式（與代課總表列順序一致）
 * - single：單一節
 * - range：起迄節（含兩端，順序可與總表欄位順序對齊）
 * - morning：早自習～第 4 節
 * - afternoon：午休～第 7 節
 * - fullday：早～第 7 節（含午休）
 */
export type SubstituteBusyPeriodMode = 'single' | 'range' | 'morning' | 'afternoon' | 'fullday';

export interface SubstituteBusyBlock {
  id: string;
  teacherId: string;
  kind: SubstituteBusyBlockKind;
  /** 未填視為 single（相容舊資料僅有 period） */
  periodMode?: SubstituteBusyPeriodMode;
  /** periodMode === 'single' 或舊資料：單一節次 id */
  period?: string;
  /** periodMode === 'range'：起、迄節次 id（含兩端） */
  periodFrom?: string;
  periodTo?: string;
  /** kind === 'date'：YYYY-MM-DD */
  date?: string;
  /**
   * kind === 'weekly'：1=週一 … 5=週五（與 TeacherScheduleSlot.day、JS getDay 一致）
   */
  weekday?: number;
  note?: string;
  /** 每週規則選填：僅套用 validFrom～validTo（含）內之日期 */
  validFrom?: string;
  validTo?: string;
  createdAt: number;
}

/** 對外代課教師報名表單（未登入可送出；主系統審核） */
export interface SubstituteApplication {
  id: string;
  name: string;
  phone: string;
  /** 一定沒辦法代的時間；沒有寫「無」 */
  unavailableTime?: string;
  /** 方便代課的時間 */
  availableTime?: string;
  /** 國小教師證：有 / 沒有 */
  hasCertificate: boolean;
  /** 有無國小教育學程修畢證書 */
  hasEducationCredential?: boolean;
  /** 最高學歷：大學(含同等)、研究所、博士 */
  educationLevel?: '大學' | '研究所' | '博士';
  graduationMajor: string;   // 系所
  /** 可以任教的項目（可複選） */
  teachingItems?: string[];
  lineAccount: string;       // LINE 帳號/ID（留 LINE 也請留電話）
  note?: string;             // 其他備註
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  updatedAt?: number;
  /** 審核通過後建立的教師 ID（若已加入教師名單） */
  teacherId?: string;
}

/** 公開缺額頁（#/public）的報名紀錄：老師點選缺額後填姓名、電話送出 */
export interface PublicBoardApplication {
  id: string;
  vacancyId: string;
  name: string;
  phone: string;
  note?: string;
  createdAt: number;
}

/** 教師請假申請（Vercel 表單 #/teacher-request 送出，待審後匯入系統） */
export interface TeacherLeaveRequestDoc {
  id: string;
  teacherName: string;
  leaveType: string;
  docId?: string;
  reason: string;
  payType: string; // '鐘點費' | '日薪' | '半日薪'
  substituteTeacher: string; // '教學組媒合' 或 代課教師姓名
  startDate: string;
  endDate: string;
  details: { date: string; period: string; subject: string; className: string }[];
  status: 'pending' | 'imported' | 'archived';
  /** 管理端可將重複申請警示設為忽略（不再跳提醒） */
  duplicateWarningIgnored?: boolean;
  createdAt: number;
  updatedAt?: number;
}

/** 報名表「可以任教的項目」選項 */
export const APPLY_TEACHING_ITEMS = [
  '低年級導師', '中年級導師', '高年級導師',
  '本土語文', '英語', '資訊', '自然', '社會', '音樂', '視覺藝術', '體育',
] as const;

// 新增：非常態活動紀錄
export interface SpecialActivity {
  id: string;
  title: string; // 活動名稱 (例如: 補救教學、社團)
  date: string; // YYYY-MM-DD
  teacherId: string; // 領款教師
  payType: PayType; // 鐘點費 or 日薪
  units: number; // 時數 or 天數
  amount: number; // 計算後金額
  note?: string; // 備註
}

// 新增：固定兼課設定
export interface FixedOvertimeConfig {
  /** 與 `semesters`／綁定學期對齊；未填視為舊資料（單一 teacherId 文件） */
  semesterId?: string;
  teacherId: string;
  periods: number[]; // [Mon, Tue, Wed, Thu, Fri] (0-4) - 自動由 scheduleSlots 計算
  sortOrder?: number; // 手動排序用
  adjustment?: number; // 增減節數 (手動調整)
  adjustmentReason?: string; // 調整原因
  ignoredEventIds?: string[]; // 新增：被標記為「已調課/忽略」的活動 ID 列表
  // New: 儲存詳細的固定排課時段
  scheduleSlots?: { day: number; period: string }[];
}

// 新增：學期定義 (支援多學期切換)
export interface SemesterDefinition {
  id: string;       // UUID
  name: string;     // e.g., "114學年度第2學期"
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

// 新增：年級活動 (校外教學/畢旅)
export interface GradeEvent {
  id: string;
  title: string; // 活動名稱 (例: 六年級畢旅)
  date: string; // YYYY-MM-DD
  targetGrades: number[]; // [1, 2, 3, 4, 5, 6] (受影響年級)
}

// 新增：儲存每一個格子的詳細資訊
export interface TimetableSlot {
  date: string;
  period: string; // '早', '1', '2'...
  subject: string; // 科目
  className: string; // 班級
  substituteTeacherId: string | null; // null 表示待聘
  payType: PayType;
  isPublic?: boolean; // 新增：是否發佈至公開看板 (預設 false)
  isOvertime?: boolean; // 新增：是否為超鐘點時段
  /** 教室（代課聯絡資訊交換用） */
  classroom?: string;
}

export interface SubstituteDetail {
  id: string;
  date: string; // YYYY-MM-DD
  periodCount: number; // Number of periods (if hourly) or 1 day (if daily)
  substituteTeacherId: string;
  payType: PayType;
  calculatedAmount: number;
  selectedPeriods?: string[]; // 儲存具體節數，例如 ['早', '1', '2']
  subject?: string; // 新增：科目
  className?: string; // 新增：班級
  isOvertime?: boolean; // 新增：是否為超鐘點
}

export interface LeaveRecord {
  id: string;
  originalTeacherId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  docId?: string; // 新增：公文字號
  applicationDate?: string; // 新增：申請日期 (YYYY-MM-DD)
  details: SubstituteDetail[]; // 用於薪資計算 (只含已確認教師)
  slots?: TimetableSlot[];     // 用於課表還原 (含待聘與科目班級)
  createdAt: number;
  allowPartial?: boolean; // 是否允許分段代課 (預設 false: 全代)
  processingStatus?: ProcessingStatus; // 行政處理狀態
  /** 管理備註（例：已列印 3/8、未印、跑章中等，方便辨識該筆是否已列印紙本） */
  adminNote?: string;
  /** 家長會支出鐘點：鐘點費由家長會支出，入家長會清冊 */
  ptaPaysHourly?: boolean;
  /** 家長會支出導師費(半天)：僅半日導師費入家長會清冊 */
  homeroomFeeByPta?: boolean;
  /** 給代課老師與請假老師的聯絡備註（教室、教材位置、聯繫方式等） */
  contactNoteForSubstitute?: string;
}

// 新增：超鐘點紀錄
export interface OvertimeRecord {
  /** 與綁定學期對齊；未填視為舊資料（id 為 `YYYY-MM_teacherId`） */
  semesterId?: string;
  id: string; // 有綁定學期：`${semesterId}__${YYYY-MM}__${teacherId}`；舊：`YYYY-MM_TeacherID`
  teacherId: string;
  yearMonth: string; // YYYY-MM
  sortOrder?: number; // 手動排序用
  
  weeklyBasic: number; // 基本授課節數 (扣除減授後)
  weeklyActual: number; // 實際排課節數
  weeksCount: number; // 本月週數 (通常 4 或 5)
  
  adjustment: number; // 調整節數 (+/-)
  adjustmentReason: string; // 調整原因 (例如: 畢業班扣除, 請假扣除)
  
  note: string; // 備註
  updatedAt: number;

  // New: 儲存詳細的超鐘點時段設定
  // 結構: [{ day: 1, period: '8' }, { day: 5, period: '4' }]
  // day: 1(Mon) - 5(Fri)
  overtimeSlots?: { day: number; period: string }[];
}

// 新增：語言教師薪資清冊
export interface LanguagePayrollEntry {
  id: string;
  date: string; // YYYY-MM-DD
  periodLabels: string; // e.g. "早自修、第1節、第2節"
  periodCount: number;
  hourlyRate: number;
  totalAmount: number;
}

export interface LanguagePayroll {
  id: string; // UUID
  teacherId: string;
  yearMonth: string; // YYYY-MM
  hostSchool: string; // 所屬主聘學校
  teachingSchool: string; // 上課學校名稱 (Default to system setting or allow edit)
  language: string; // 族語方言別
  entries: LanguagePayrollEntry[];
  updatedAt: number;
}

// Configuration Constants
export const HOURLY_RATE = 405;
export const HOMEROOM_FEE_MONTHLY = 4000;

// 常見科目清單 (用於校外教師專長勾選)
export const COMMON_SUBJECTS = [
  '國語', '數學', '英語', '社會', '自然', 
  '音樂', '美勞', '體育', '資訊', '綜合', 
  '生活', '本土語', '健康', '雙語', '特教'
];

// 常見年級清單
export const COMMON_GRADES = [
  '低年級', '中年級', '高年級', 
  '1年級', '2年級', '3年級', 
  '4年級', '5年級', '6年級', 
  '科任', '導師'
];
