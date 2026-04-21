import React from 'react';

// 定義核心資料結構

// 學生資料 (新版，符合矩陣表格需求)
export interface Student {
  id: string; // A欄: 編號
  period: string; // B欄: 上課時間(節次)
  className: string; // C欄: 班級
  name: string; // D欄: 姓名
  /** 座號（選填，從學生名單拖曳時帶入） */
  seat?: string;
}

// 獲獎學生資料
export interface AwardStudent {
  className: string;
  name: string;
  awardName: string;
  /** 座號（選填，從學生名單拖曳時帶入） */
  seat?: string;
}

/** 學生語言選修登錄：單一學生一筆 */
export interface LanguageElectiveStudent {
  className: string;
  seat: string;
  name: string;
  language: string;
  /** 語言班別（對應語言班別設定之名稱） */
  languageClass?: string;
  /** 學號（有則作為 Firestore 學生主檔 document id） */
  studentId?: string;
  /**
   * 無學號時的穩定主檔 id（通常 PRE_ 開頭），由系統寫入後帶回前端以便 upsert。
   * 亦可由系統依 學年+班級+座號+姓名 決定性產生。
   */
  profileDocId?: string;
}

/** 語言班別設定：教室、時間、教師（每學年一組） */
export interface LanguageClassSetting {
  id: string;
  /** 班別名稱（如 閩南語A、客家語B） */
  name: string;
  classroom?: string;
  time?: string;
  teacher?: string;
}

/** 某學年語言選修名單（Firestore 一 doc 一學年，不分上下學期） */
export interface LanguageElectiveRosterDoc {
  academicYear: string;
  semester?: string; // 選填，相容舊資料；新資料以學年計可不填
  students: LanguageElectiveStudent[];
  /** 語言班別設定：教室、時間、教師 */
  languageClassSettings?: LanguageClassSetting[];
  updatedAt?: string;
  /** B 方案：學年 meta 標記，有則表示名單已改存學生主檔 */
  studentRosterVersion?: number;
}

/** 頒獎 Doc 輸出選項（給 GAS / 整併用） */
export interface AwardExportOptions {
  /** true = 低中高分年級整併為一份「總通知單」Doc；false = 維持每年級段各一份 */
  mergeNotificationSingleDoc?: boolean;
  /** true = 低中高分年級整併為一份「總表」Doc；false = 維持每年級段各一份 */
  mergeSummarySingleDoc?: boolean;
  /** 整併時自訂檔名前綴（可選） */
  mergedDocTitleSuffix?: string;
}

// 頒獎紀錄資料
export interface AwardRecord {
  id?: string;
  date: string;
  time?: string; // 新增：頒獎時間
  title: string;
  students: AwardStudent[];
  createdAt?: string;
  /** 輸出 Google Doc 時的整併等細節（選填） */
  exportOptions?: AwardExportOptions;
}

// 課程資料
export interface Course {
  id: string;
  name: string; 
  instructor: string; 
  location: string; 
  dayOfWeek: number; 
  period: number; 
  studentIds: string[]; 
}

// 新版點名單資料結構 (矩陣式)
export interface AttendanceTableData {
  academicYear: string; // 學年
  semester: string; // 學期
  courseName: string; // 課程名稱 (OO語)
  instructorName: string; // 授課教師姓名
  classTime: string; // C3: 上課時間
  location: string; // C4: 上課地點
  dates: Date[]; // E5開始的日期列
  students: Student[]; // A6開始的學生列
}

/** 學期／放假日設定（Firebase 點名單用），doc id = 學年_學期 */
export interface CalendarSettings {
  academicYear: string;
  semester: string;
  /** 學期開始日 YYYY-MM-DD */
  startDate?: string;
  /** 學期結束日 YYYY-MM-DD */
  endDate?: string;
  /** 放假日 YYYY-MM-DD 陣列 */
  holidays?: string[];
}

// --- 段考提報（導師）---

export interface ExamAwardItem {
  id: string; // 唯一 key（如 chi, math, total）
  label: string; // 顯示名稱
  /** 僅這些年級會出現此細項；未設定或空陣列＝全部年級皆需／可填 */
  gradesApplicable?: number[] | null;
}

export interface ExamAwardCategory {
  id: 'excellent' | 'improved' | string;
  label: string; // 優異 / 進步
  items: ExamAwardItem[];
}

/** 段考獎項設定（系統設定） */
export interface ExamAwardsConfig {
  categories: ExamAwardCategory[];
  /** 對外填報頁給導師看的說明（得獎標準、公告連結、注意事項等；由教學組在管理端維護） */
  teacherInstructions?: string | null;
  /** true 時允許不登入直接進入段考填報頁（不檢查白名單） */
  allowPublicSubmitNoLogin?: boolean;
  updatedAt?: string;
}

/** 一次段考活動 */
export interface ExamCampaign {
  id: string;
  title: string; // 例如：114下 第1次段考
  academicYear: string;
  semester: string; // 上學期 / 下學期
  examNo: string; // 第幾次段考（字串方便：1/2/3...）
  lockedByDefault: boolean;
  closeAt?: string | null; // ISO 或 YYYY-MM-DD，僅顯示用（鎖定仍以 locked 控制）
  createdAt?: string;
  updatedAt?: string;
}

/** 對外填報白名單（導師） */
export interface ExamSubmitAllowedUser {
  email: string;
  enabled: boolean;
  /** 導師所屬班級（管理端維護；對外頁可用於顯示/查詢） */
  className?: string | null;
  /** 導師姓名（管理端維護；對外頁可用於顯示/查詢） */
  teacherName?: string | null;
  displayName?: string | null;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExamSubmissionStudent {
  className: string;
  seat: string;
  name: string;
  /** 例如 ["excellent:chi", "improved:math"] */
  awards: string[];
}

/** 一班一筆提報（同班以最新覆蓋），可鎖定/解鎖 */
export interface ExamSubmission {
  id: string; // doc id
  campaignId: string;
  className: string;
  students: ExamSubmissionStudent[];
  locked: boolean;
  submittedByEmail: string;
  submittedAt: string;
  unlockedByEmail?: string | null;
  unlockedAt?: string | null;
  updatedAt?: string;
}

/** 對外「已提報班級」清單用（不含學生個資）；文件 id 與提報主檔相同 */
export interface ExamSubmitProgressRow {
  className: string;
  lastSubmittedAt: string;
}

// 聯絡人資訊
export interface Contact {
  name: string;
  role: string;
  phone: string;
  note?: string;
}

// 附件資訊 (新)
export interface Attachment {
  id: string;
  name: string;
  url: string;
  mimeType: string;
}

// 待辦事項資料結構
export interface TodoItem {
  id: string;
  academicYear: string; // 新增: 學年 (控制系列活動範圍)
  date: string; // YYYY-MM-DD
  title: string;
  type: string; // 行政, 教學, 會議, 輪值...
  period?: 'full' | 'am' | 'pm'; // 新增: 時段 (用於輪值: 全日, 上午, 下午)
  status: 'pending' | 'done' | 'cancelled';
  priority: 'High' | 'Medium' | 'Low';
  seriesId?: string; // 關聯ID (保留供系統內部使用，但主要邏輯轉向 topic)
  topic?: string; // 新增: 系列主題 (如: 科展, 語文競賽)
  officialDocs?: string[]; // 新增: 公文文號列表
  contacts: Contact[]; // 聯絡人列表
  commonContacts?: Contact[]; // 新增: 系列共用聯絡人列表
  attachments: Attachment[]; // 個別附件列表
  commonAttachments?: Attachment[]; // 新增: 系列共用附件列表
  memo?: string;
  /** Firestore 建立時間（ISO 字串），讀寫文件時使用 */
  createdAt?: string;
}

/**
 * 行政行事曆「每月固定事項」：設定一次後，依指定西曆月份自動出現在該月對應日期。
 * months 為空陣列表示 1–12 月皆套用；否則僅在列出的月份（1–12）出現。
 */
export interface MonthlyRecurringTodoRule {
  id: string;
  title: string;
  type: string;
  priority: 'High' | 'Medium' | 'Low';
  /** 每月第幾日（1–31）；若該月天數不足則落在該月最後一日 */
  dayOfMonth: number;
  /** 套用的西曆月份 1–12；空陣列 = 每月 */
  months: number[];
  memo?: string;
  /** 依「年-月」記錄該月是否已完成（YYYY-MM） */
  monthCompletions?: Record<string, 'pending' | 'done' | 'cancelled'>;
  createdAt?: string;
  updatedAt?: string;
}

/** 代墊紀錄狀態 */
export type BudgetAdvanceStatus =
  | 'outstanding'
  | 'purchase_not_submitted'
  | 'purchase_submitted'
  | 'purchase_vendor_prepaid'
  | 'settled'
  | 'cancelled';

/**
 * 代墊金額紀錄（可日後再綁計畫；有綁計畫時可連結支用明細）
 */
export interface BudgetPlanAdvance {
  id: string;
  /** 計畫專案 id；空字串表示尚未綁計畫（之後可從列表改掛） */
  budgetPlanId: string;
  /** 可選：連結到某一筆「支用明細」(ledger_entries) 的 expense 節點 id（僅在有綁計畫時有效） */
  ledgerEntryId?: string;
  /** 代墊金額（元，正數） */
  amount: number;
  /** 代墊日期 YYYY-MM-DD */
  advanceDate: string;
  /** 摘要說明（例：報名費、材料費） */
  title: string;
  /** 受款人（選填；資料欄位名 paidBy 為歷史命名） */
  paidBy?: string;
  status: BudgetAdvanceStatus;
  /**
   * 學校已補款／匯入您帳戶日 YYYY-MM-DD（選填）。
   * 與「已給受款人日」分開：學校補給您不代表您已把代墊款給受款人。
   */
  settledDate?: string;
  /** 您實際將代墊款給受款人（老師等）之日 YYYY-MM-DD（選填） */
  paidToPayeeDate?: string;
  /**
   * 封存日 YYYY-MM-DD（系統寫入）。學校補款日與已給受款人日皆填時自動封存並自「進行中」列表移出。
   * 清空任一日或作廢時會清除封存。
   */
  archivedAt?: string;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** 計畫底下支用明細樹狀節點：資料夾（分類）或實際支用紀錄 */
export type BudgetPlanLedgerKind = 'folder' | 'expense';

/**
 * 支用支付／核銷進度
 * - 預定：僅預估，實支不計入計畫「已支出」
 * - 已執行待核銷：實支已發生，計入已支出，尚未完成核銷
 * - 核銷完畢：已完成核銷（實支仍計入已支出）
 */
export type BudgetPlanLedgerPaymentStatus = 'planned' | 'executed_pending' | 'settled';

/** 存在 Firestore：`edutrack_budget_plans/{planId}/ledger_entries/{entryId}` */
export interface BudgetPlanLedgerEntry {
  id: string;
  budgetPlanId: string;
  /** 父節點 id；根層為 null */
  parentId: string | null;
  kind: BudgetPlanLedgerKind;
  /** 資料夾名稱或支用摘要 */
  title: string;
  /**
   * （子項目/資料夾）是否隱藏：用於把「不能動支的部分」從可運用額度中排除
   * - 僅對根層子項目(folder) 有意義
   */
  hidden?: boolean;
  /** 預估金額（元）；支用列用於規劃，資料夾為 0 */
  estimatedAmount: number;
  /** 實支金額（元）；依支付狀態決定是否計入計畫「已支出」，資料夾為 0 */
  amount: number;
  /**
   * 子項目（資料夾）分配額度（元）。用於「建立計畫時先分配子項目」：
   * - kind === 'folder'：此資料夾代表一個子項目／科目，其下支用明細會占用此額度
   * - 省略或 0：視為未設定額度（不建議；將無法控管超支）
   */
  budgetAllocated?: number;
  /**
   * 是否可勻支（納入同計畫的共用池計算）
   * - kind === 'folder'：此子項目是否允許與其他勾選者互相勻支
   * - kind === 'expense'：保留相容舊資料；新流程以「子項目(folder)」為準
   */
  allowPooling?: boolean;
  /** 支付／核銷狀態（僅支用列） */
  paymentStatus?: BudgetPlanLedgerPaymentStatus;
  /** 支用／入帳日期 YYYY-MM-DD（支用建議填寫） */
  expenseDate?: string;
  memo?: string;
  /** 同層排序（遞增） */
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

// 廠商資料結構 (新)
export interface Vendor {
  id: string;
  name: string; // 廠商名稱
  category: string; // 類別 (印刷, 遊覽車, 用品...)
  contactPerson: string; // 聯絡人
  phone: string; // 電話
  email: string; // Email
  lineId: string; // LINE ID
  address: string; // 地址
  note: string; // 備註
  relatedTasks: string[]; // 關聯業務 (例如: 運動會, 畢業典禮)
  qrcodeUrl?: string; // 聯繫方式 QR Code 圖片網址或 data URL (base64)
}

/** 專案狀態：已結案者不再列入側邊「結案將屆」警示 */
export type BudgetPlanStatus = 'active' | 'closed';

/** 計畫所屬期間類型：年度（曆年）或學年度（2/1～隔年1/31）；舊資料未填視為學年度 */
export type BudgetPlanPeriodKind = 'calendar_year' | 'academic_year';

/** 計畫專案／預算：核配、已支出、預定佔用由支用明細同步；剩餘＝核配−已支出−預定佔用 */
export interface BudgetPlan {
  id: string;
  /**
   * 期間年度之民國數字（字串），語意依 periodKind：
   * - 學年度：例 "114"＝114 學年度（114/2/1～115/1/31）
   * - 年度：例 "115"＝115 年度（115/1/1～115/12/31）
   */
  academicYear: string;
  /** 年度或學年度；未存檔之舊資料由前端視為 academic_year */
  periodKind?: BudgetPlanPeriodKind;
  /** 計畫名稱 */
  name: string;
  /** 會計代碼（請與主計／會計科目一致） */
  accountingCode: string;
  /** 核配／計畫總額（元） */
  budgetTotal: number;
  /**
   * 保留金額（元）：不想在畫面上曝光、但會占用核配總額的部分（例如特定用途專款）
   * - 可運用額度 = budgetTotal - reservedTotal
   * - 只顯示「可運用額度」給一般瀏覽；保留金額可在詳情頁調整
   */
  reservedTotal?: number;
  /**
   * 已支出（元）：支用明細中狀態為「已執行待核銷」「核銷完畢」之實支加總（由明細同步）
   */
  spentTotal: number;
  /**
   * 預定佔用（元）：狀態為「預定」之支用列，以 max(預估, 實支) 加總（由明細同步；用於剩餘額度）
   */
  plannedCommitTotal?: number;
  /** 計畫結案日期 YYYY-MM-DD */
  closeByDate: string;
  /** 結案要求（應達成項目、文件、核銷等說明） */
  closureRequirements: string;
  /** 進行中／已結案（結案後不列入導覽警示） */
  status?: BudgetPlanStatus;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

// 舊版相容 (如果還需要) - 可以考慮移除或保留作為過渡
export interface AttendanceSheetData {
  date: Date;
  course: Course;
  students: Student[];
}

// 事項列檔資料結構 (新)
export interface ArchiveTask {
  id: string;
  title: string; // 事項名稱 (如: 本土語補助申請)
  month: string; // 月份 (YYYY-MM)
  isPrinted: boolean; // 是否已列印
  isNotified: boolean; // 是否已通知
  notes: string; // 備註
  updatedAt: string; // 最後更新時間
}

/** 考卷存檔（僅白名單用戶可存取） */
/** 考卷資料夾（用於分類；可設上層彙整、直連 Google Drive） */
export interface ExamPaperFolder {
  id: string;
  name: string;
  order: number; // 顯示順序，數字越小越前面
  parentId?: string | null; // 上層資料夾 id，空為最上層（利於學期/階段彙整）
  driveFolderUrl?: string | null; // 對應之 Google Drive 資料夾連結，直連開啟
}

/** 考卷檢核項目（年級 × 領域，可手動打勾） */
export interface ExamPaperCheck {
  grade: string; // 1～6
  domain: string; // 領域，如 國語、數學
  checked: boolean;
}

export interface ExamPaper {
  id: string;
  folderId?: string | null; // 所屬資料夾 id，空為未分類
  title?: string; // 選填標題，例如「114-1 三年級國語期中考」
  grade?: string; // 年級，如 1～6（用於排序與顯示一年級～六年級）
  domain?: string; // 領域，如 國語、數學（用於檢核區塊）
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileId?: string; // Drive file id，方便日後刪除
  schoolYear?: string; // 學年，如 114
  semester?: string; // 學期，如 上學期、下學期
  examType?: string; // 期中考、期末考、平時考 等
  authorTeacherName?: string; // 出題教師姓名
  authorTeacherNote?: string; // 出題教師備註
  uploadedBy: string; // 上傳者 email
  uploadedAt: string; // ISO 字串
}

export interface AllowedUser {
  email: string;
  enabled: boolean;
  role: 'admin' | 'member';
  note?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

export type NotificationType = 'success' | 'error' | 'info';

export interface ModalProps {
  isOpen: boolean;
  title: string;
  content: React.ReactNode;
  onConfirm?: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'danger' | 'warning' | 'success';
}