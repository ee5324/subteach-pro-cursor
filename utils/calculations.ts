
import { Teacher, PayType, HOURLY_RATE, HOMEROOM_FEE_MONTHLY, TimetableSlot, SubstituteDetail, SalaryGrade, FixedOvertimeConfig } from '../types';

/**
 * 安全解析日期字串 YYYY-MM-DD 為本地 Date 物件
 * 設定時間為 12:00:00，避免時區偏移導致日期回推一天
 */
export const parseLocalDate = (dateInput: any): Date => {
  if (!dateInput) return new Date();
  
  // If already a Date object
  if (Object.prototype.toString.call(dateInput) === "[object Date]") {
      const d = new Date(dateInput);
      d.setHours(12, 0, 0, 0);
      return d;
  }

  const dateStr = String(dateInput);
  const parts = dateStr.split(/[-/]/);
  if (parts.length === 3) {
      // Month is 0-indexed
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
  }
  const d = new Date(dateStr);
  d.setHours(12, 0, 0, 0);
  return d;
};

/**
 * 將各種日期格式 (YYYY/M/D, YYYY-M-D) 統一轉換為 YYYY-MM-DD
 */
export const normalizeDateString = (dateInput: any): string => {
    if (!dateInput) return '';
    const d = parseLocalDate(dateInput);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Calculates the number of days in a specific month
 */
export const getDaysInMonth = (dateString: string): number => {
  const date = parseLocalDate(dateString);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
};

/**
 * Determine standard legal base period based on role (Statutory)
 * 判斷法定基本授課節數
 */
export const getStandardBase = (teacher: Teacher): number => {
    const roleString = (String(teacher.jobTitle ?? '') + String(teacher.teacherRole ?? '')).trim();
    if (roleString.includes('主任')) return 1; // 主任通常極少或 0-2
    if (roleString.includes('組長')) return 9; // 組長通常 8-12
    if (roleString.includes('導師')) return 16; // 導師通常 16
    if (roleString.includes('專任') || roleString.includes('科任')) return 20; // 專任通常 20
    return 20; // Default fallback
};

/**
 * 計算教師的本俸與學術研究費
 * 依據：薪級表、俸點、學歷、有無教證
 */
export const calculateTeacherFinancials = (
  salaryGrades: SalaryGrade[],
  points: number,
  education: string = '',
  hasCertificate: boolean
): { baseSalary: number, researchFee: number } => {
   let newBaseSalary = 0;
   let newResearchFee = 0;
   
   if (salaryGrades && salaryGrades.length > 0 && points > 0) {
      const grade = salaryGrades.find(g => g.points === points);
      if (grade) {
          newBaseSalary = grade.salary;

          // 判斷是否為碩士以上 (簡單關鍵字判斷)
          const isMaster = education.includes('碩') || education.includes('博') || education.includes('Master') || education.includes('Doctor');
          
          if (hasCertificate) {
              newResearchFee = isMaster ? (grade.researchFeeCertMaster || 0) : (grade.researchFeeCertBachelor || 0);
          } else {
              newResearchFee = isMaster ? (grade.researchFeeNoCertMaster || 0) : (grade.researchFeeNoCertBachelor || 0);
          }
      }
   }
   return { baseSalary: newBaseSalary, researchFee: newResearchFee };
};

export const DAILY_RATE_TABLE: Record<string, Record<number, number>> = {
  "170": { 31: 1354, 30: 1399, 29: 1448, 28: 1499 },
  "180無教證": { 31: 1379, 30: 1425, 29: 1474, 28: 1527 },
  "190": { 31: 1553, 30: 1604, 29: 1660, 28: 1719 },
  "245無教證": { 31: 1630, 30: 1684, 29: 1742, 28: 1804 },
  "245有教證": { 31: 1801, 30: 1861, 29: 1925, 28: 1994 },
  "625有教證": { 31: 2901, 30: 2998, 29: 3101, 28: 3212 },
  "650有教證": { 31: 2951, 30: 3049, 29: 3154, 28: 3267 },
  "編制內教師": { 31: 405, 30: 405, 29: 405, 28: 405 },
  "退休教師": { 31: 405, 30: 405, 29: 405, 28: 405 },
  "180有教證": { 31: 1528, 30: 1579, 29: 1633, 28: 1692 },
};

export const HOMEROOM_DAILY_RATE: Record<number, number> = {
  31: 129, 30: 133, 29: 138, 28: 143
};

export const getExpectedDailyRate = (teacher: Teacher, daysInMonth: number, isHomeroom: boolean): number | null => {
  if (!teacher.salaryPoints) return null;
  
  let key = `${teacher.salaryPoints}`;
  if (teacher.salaryPoints === 180 || teacher.salaryPoints === 245 || teacher.salaryPoints === 625 || teacher.salaryPoints === 650) {
    key += teacher.hasCertificate ? '有教證' : '無教證';
  }
  
  const rates = DAILY_RATE_TABLE[key];
  if (!rates) return null;
  
  let expectedRate = rates[daysInMonth];
  if (!expectedRate) return null;
  
  if (isHomeroom) {
    expectedRate += HOMEROOM_DAILY_RATE[daysInMonth] || 0;
  }
  
  return expectedRate;
};

/**
 * Calculates the pay for a single substitution entry
 * Updated: Supports Salary Grade Table lookup
 */
export const calculatePay = (
  payType: PayType,
  subTeacher: Teacher | undefined,
  date: string,
  periods: number,
  salaryGrades: SalaryGrade[] = [],
  isHomeroomSubstitute: boolean = false
): number => {
  if (!subTeacher) return 0;

  if (payType === PayType.HOURLY) {
    return periods * HOURLY_RATE;
  }

  const daysInMonth = getDaysInMonth(date) || 30;
  let baseSalary = Number(subTeacher.baseSalary) || 0;
  if (subTeacher.salaryPoints && salaryGrades.length > 0) {
    const grade = salaryGrades.find(g => g.points === subTeacher.salaryPoints);
    if (grade) baseSalary = Number(grade.salary) || 0;
  }
  const researchFee = Number(subTeacher.researchFee) || 0;
  let dailyRate = (baseSalary + researchFee) / daysInMonth;
  if (isHomeroomSubstitute) {
    dailyRate += HOMEROOM_FEE_MONTHLY / daysInMonth;
  }

  if (payType === PayType.DAILY) {
    return Math.round(dailyRate * periods);
  }

  // 半日薪：代課支出為一半的日薪（每「單位」為 0.5 日）
  if (payType === PayType.HALF_DAY) {
    return Math.round(dailyRate * 0.5 * periods);
  }

  return 0;
};

/**
 * Sorts periods based on the standard school day order
 */
export const sortPeriods = (periods: string[]): string[] => {
    const sortOrder = ['早', '1', '2', '3', '4', '午', '5', '6', '7'];
    return [...periods].sort((a, b) => sortOrder.indexOf(a) - sortOrder.indexOf(b));
};

/**
 * 將課表格子 (Slots) 轉換為 薪資明細 (Details)
 * Updated: Pass salaryGrades to calculatePay
 * Updated: Force isHomeroomSubstitute = true if PayType is DAILY per user request
 */
export const convertSlotsToDetails = (
  slots: TimetableSlot[], 
  teachers: Teacher[],
  salaryGrades: SalaryGrade[] = []
): SubstituteDetail[] => {
  const groups: Record<string, {
    date: string;
    teacherId: string;
    payType: PayType;
    periods: string[];
    subjects: string[];
    classNames: string[];
    isOvertime: boolean;
  }> = {};

  // 去重：同一 (日期, 代課教師, 節次) 只保留一筆，優先保留 isOvertime=true，避免同一節被算進「一般」與「超鐘點」兩邊導致重複計算
  const slotKey = (s: TimetableSlot) => `${s.date}_${s.substituteTeacherId}_${s.period}`;
  const seen = new Map<string, TimetableSlot>();
  slots.forEach(slot => {
    if (!slot.substituteTeacherId) return;
    const key = slotKey(slot);
    const existing = seen.get(key);
    if (existing) {
      if (slot.isOvertime && !existing.isOvertime) seen.set(key, slot);
      return;
    }
    seen.set(key, slot);
  });
  const dedupedSlots = Array.from(seen.values());

  // Helper to add to groups
  const addToGroup = (date: string, teacherId: string, payType: PayType, isOvertime: boolean, period: string, subject?: string, className?: string) => {
    const key = `${date}_${teacherId}_${payType}_${isOvertime}`;
    if (!groups[key]) {
      groups[key] = {
        date,
        teacherId,
        payType,
        periods: [],
        subjects: [],
        classNames: [],
        isOvertime
      };
    }
    groups[key].periods.push(period);
    if (subject) groups[key].subjects.push(subject);
    if (className) groups[key].classNames.push(className);
  };

  // Grouping：每節只歸入一筆明細，避免超課同時算日薪+鐘點造成重複計算
  dedupedSlots.forEach(slot => {
    if (!slot.substituteTeacherId) return; // Skip pending slots

    const isOvertime = slot.isOvertime || false;
    
    if (isOvertime) {
      // 超課僅以鐘點費計價，不重複列入日薪
      addToGroup(slot.date, slot.substituteTeacherId, PayType.HOURLY, true, slot.period, slot.subject, slot.className);
    } else {
      // 一般節次依 payType 歸類
      addToGroup(slot.date, slot.substituteTeacherId, slot.payType, false, slot.period, slot.subject, slot.className);
    }
  });

  // Convert groups to array
  const details: SubstituteDetail[] = Object.values(groups).map(g => {
    // Sort periods
    g.periods = sortPeriods(g.periods);

    // Calculate Pay
    const teacher = teachers.find(t => t.id === g.teacherId);
    
    const count = g.payType === PayType.HOURLY ? g.periods.length : 1;

    // DAILY / HALF_DAY: assume homeroom duties (and fee). HALF_DAY = 半日薪，導師費可由家長會清冊另列。
    const isHomeroomSub = (g.payType === PayType.DAILY || g.payType === PayType.HALF_DAY) ? true : (teacher?.isHomeroom || false);

    return {
      id: crypto.randomUUID(),
      date: g.date,
      substituteTeacherId: g.teacherId,
      payType: g.payType,
      periodCount: count,
      selectedPeriods: g.periods,
      calculatedAmount: calculatePay(g.payType, teacher, g.date, count, salaryGrades, isHomeroomSub),
      subject: [...new Set(g.subjects)].join(','),
      className: [...new Set(g.classNames)].join(','),
      isOvertime: g.isOvertime
    };
  });

  return details;
};

/**
 * 固定兼課時段：優先使用教師設定的課表（教師管理之預設課表），無則使用固定兼課設定的 scheduleSlots
 */
export function getEffectiveFixedOvertimeSlots(teacher: Teacher | undefined, config: FixedOvertimeConfig): { day: number; period: string }[] {
  if (teacher?.defaultSchedule && teacher.defaultSchedule.length > 0) {
    return teacher.defaultSchedule.map(s => ({ day: s.day, period: s.period }));
  }
  return config.scheduleSlots || [];
}

/** 由有效時段計算週一～週五每日節數 */
export function getEffectiveFixedOvertimePeriods(teacher: Teacher | undefined, config: FixedOvertimeConfig): number[] {
  const slots = getEffectiveFixedOvertimeSlots(teacher, config);
  const periods = [0, 0, 0, 0, 0];
  slots.forEach(s => { if (s.day >= 1 && s.day <= 5) periods[s.day - 1]++; });
  return periods;
}
