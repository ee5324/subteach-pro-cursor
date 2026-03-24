import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Teacher, TeacherType, LeaveRecord, SalaryGrade, OvertimeRecord, SpecialActivity, FixedOvertimeConfig, GradeEvent, SemesterDefinition, SubPoolItem, LanguagePayroll, SubstituteApplication, PublicBoardApplication, TeacherLeaveRequestDoc, SubteachAllowedUser, SubstituteBusyBlock } from '../types';
import { GAS_WEB_APP_URL } from '../config';
import { callGasApi } from '../utils/api';
import { convertSlotsToDetails } from '../utils/calculations';
import { isSubstituteBusyBlockExpiredForAutoCleanup } from '../utils/substituteBusyBlocks';
import { db, auth } from '../src/lib/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch, updateDoc, getDoc, getDocs } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';

/** Firestore 不支援 undefined、NaN、Infinity，寫入前清理 */
function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'number') {
    if (obj !== obj || !Number.isFinite(obj)) return 0 as T; // NaN or Infinity -> 0
    return obj;
  }
  if (Array.isArray(obj)) return obj.map((item) => sanitizeForFirestore(item)) as T;
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) out[k] = sanitizeForFirestore(v);
    }
    return out as T;
  }
  return obj;
}

export interface AppSettings {
  gasWebAppUrl: string;
  semesterStart?: string; // YYYY-MM-DD
  semesterEnd?: string;   // YYYY-MM-DD
  graduationDate?: string; // YYYY-MM-DD
}

const INITIAL_SETTINGS: AppSettings = {
  gasWebAppUrl: GAS_WEB_APP_URL || '',
  semesterStart: '',
  semesterEnd: '',
  graduationDate: ''
};

const BUILT_IN_SALARY_GRADES: SalaryGrade[] = [
  { id: '150', points: 150, salary: 21990, researchFeeCertBachelor: 0, researchFeeCertMaster: 0, researchFeeNoCertBachelor: 18464, researchFeeNoCertMaster: 18464 },
  { id: '190', points: 190, salary: 25050, researchFeeCertBachelor: 23080, researchFeeCertMaster: 23080, researchFeeNoCertBachelor: 18464, researchFeeNoCertMaster: 18464 },
  { id: '200', points: 200, salary: 25820, researchFeeCertBachelor: 23080, researchFeeCertMaster: 23080, researchFeeNoCertBachelor: 18464, researchFeeNoCertMaster: 18464 },
];

interface AppContextType {
  currentUser: User | null;
  teachers: Teacher[];
  records: LeaveRecord[];
  overtimeRecords: OvertimeRecord[];
  specialActivities: SpecialActivity[];
  salaryGrades: SalaryGrade[];
  settings: AppSettings;
  holidays: string[];
  fixedOvertimeConfig: FixedOvertimeConfig[];
  gradeEvents: GradeEvent[];
  semesters: SemesterDefinition[];
  activeSemesterId: string | null;
  subPool: SubPoolItem[];
  /** 代課老師忙碌／不接時段（代課資料總表對照） */
  substituteBusyBlocks: SubstituteBusyBlock[];
  languagePayrolls: LanguagePayroll[];
  substituteApplications: SubstituteApplication[];
  publicBoardApplications: PublicBoardApplication[];
  teacherLeaveRequests: TeacherLeaveRequestDoc[];
  loading: boolean;
  /** 已登入但不在白名單內，無法存取主系統 */
  notAllowed: boolean;
  /** 白名單清單（admin 可見全部，一般使用者僅自己的 doc） */
  subteachAllowedUsers: SubteachAllowedUser[];
  /** 是否為代課系統管理員（可管理白名單） */
  isSubteachAdmin: boolean;
  addSubteachAllowedUser: (email: string, role: 'admin' | 'user', displayName?: string) => Promise<void>;
  updateSubteachAllowedUser: (email: string, data: Partial<Pick<SubteachAllowedUser, 'enabled' | 'role' | 'displayName'>>) => Promise<void>;
  removeSubteachAllowedUser: (email: string) => Promise<void>;

  updateTeacherLeaveRequestStatus: (id: string, status: 'pending' | 'imported' | 'archived') => Promise<void>;
  deleteTeacherLeaveRequest: (id: string) => Promise<void>;
  deleteSubstituteApplication: (id: string) => Promise<void>;
  deletePublicBoardApplication: (id: string) => Promise<void>;
  approveSubstituteApplication: (id: string, options?: { addToSubPool: boolean }) => Promise<{ teacherId: string }>;

  addTeacher: (teacher: Teacher) => Promise<void>;
  updateTeacher: (updatedTeacher: Teacher) => Promise<void>;
  setAllTeachers: (newTeachers: Teacher[]) => Promise<void>;
  deleteTeacher: (id: string) => Promise<void>;
  renameTeacher: (oldId: string, newTeacher: Teacher) => Promise<void>;
  /** 將所有教師的預設課表同步至公開查詢（供請假表單「依姓名帶入課表」使用） */
  syncAllPublicTeacherSchedules: () => Promise<void>;

  addRecord: (record: LeaveRecord) => Promise<void>;
  updateRecord: (updatedRecord: LeaveRecord) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;

  updateOvertimeRecord: (record: OvertimeRecord) => Promise<void>;
  addActivity: (activity: SpecialActivity) => Promise<void>;
  updateActivity: (updatedActivity: SpecialActivity) => Promise<void>;
  deleteActivity: (id: string) => Promise<void>;

  updateFixedOvertimeConfig: (config: FixedOvertimeConfig) => Promise<void>;
  removeFixedOvertimeConfig: (teacherId: string) => Promise<void>;

  addGradeEvent: (event: GradeEvent) => Promise<void>;
  removeGradeEvent: (id: string) => Promise<void>;

  addSemester: (sem: SemesterDefinition) => Promise<void>;
  updateSemester: (sem: SemesterDefinition) => Promise<void>;
  removeSemester: (id: string) => Promise<void>;
  setSemesterActive: (id: string) => Promise<void>;

  updateSettings: (newSettings: AppSettings) => Promise<void>;
  upsertSalaryGrades: (grades: SalaryGrade[]) => Promise<void>;
  seedSalaryGradesFromBuiltIn: () => Promise<{ inserted: number; skipped: number }>;
  addHoliday: (date: string) => Promise<void>;
  removeHoliday: (date: string) => Promise<void>;

  addToSubPool: (teacherId: string) => Promise<void>;
  removeFromSubPool: (teacherId: string) => Promise<void>;
  updateSubPoolItem: (item: SubPoolItem) => Promise<void>;

  addSubstituteBusyBlock: (block: Omit<SubstituteBusyBlock, 'id' | 'createdAt'>) => Promise<void>;
  deleteSubstituteBusyBlock: (id: string) => Promise<void>;

  addLanguagePayroll: (payroll: LanguagePayroll) => Promise<void>;
  updateLanguagePayroll: (updatedPayroll: LanguagePayroll) => Promise<void>;
  deleteLanguagePayroll: (id: string) => Promise<void>;

  loadFromGas: () => Promise<{ teacherCount: number; recordCount: number }>;
  migrateToFirebase: () => Promise<void>;
  syncToPublicBoard: (vacancies: any[]) => Promise<any>;
  releaseVacanciesToTier2: (vacancyIds: string[]) => Promise<void>;
  checkGasConnection: () => Promise<boolean>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [overtimeRecords, setOvertimeRecords] = useState<OvertimeRecord[]>([]); 
  const [specialActivities, setSpecialActivities] = useState<SpecialActivity[]>([]); 
  const [salaryGrades, setSalaryGrades] = useState<SalaryGrade[]>([]);
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);
  const [holidays, setHolidays] = useState<string[]>([]); 
  const [fixedOvertimeConfig, setFixedOvertimeConfig] = useState<FixedOvertimeConfig[]>([]); 
  const [gradeEvents, setGradeEvents] = useState<GradeEvent[]>([]); 
  
  const [semesters, setSemesters] = useState<SemesterDefinition[]>([]);
  const [activeSemesterId, setActiveSemesterId] = useState<string | null>(null);
  
  const [subPool, setSubPool] = useState<SubPoolItem[]>([]);
  const [substituteBusyBlocks, setSubstituteBusyBlocks] = useState<SubstituteBusyBlock[]>([]);
  const [languagePayrolls, setLanguagePayrolls] = useState<LanguagePayroll[]>([]);
  const [substituteApplications, setSubstituteApplications] = useState<SubstituteApplication[]>([]);
  const [publicBoardApplications, setPublicBoardApplications] = useState<PublicBoardApplication[]>([]);
  const [teacherLeaveRequests, setTeacherLeaveRequests] = useState<TeacherLeaveRequestDoc[]>([]);
  const [notAllowed, setNotAllowed] = useState(false);
  const [subteachAllowedUsers, setSubteachAllowedUsers] = useState<SubteachAllowedUser[]>([]);

  const [loading, setLoading] = useState(true);

  const isSubteachAdmin = Boolean(
    currentUser?.email && (
      subteachAllowedUsers.find(u => u.email === currentUser?.email)?.role === 'admin' ||
      currentUser.email === 'y.chengju@gmail.com' // 指定管理員，規則與 firestore.rules 一致
    )
  );

  // --- Auth Listener ---
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      if (import.meta.env.DEV) {
        setCurrentUser({ uid: 'dev-mock', email: 'dev@test', emailVerified: true } as User);
      }
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setNotAllowed(false);
      } else {
        setLoading(false);
        setNotAllowed(false);
        // 開發模式：免輸入密碼，用模擬使用者進入系統測功能（資料為空）
        setCurrentUser(import.meta.env.DEV ? ({ uid: 'dev-mock', email: 'dev@test', emailVerified: true } as User) : null);
      }
    });
    return () => unsubscribe();
  }, []);

  // --- Firebase Subscriptions ---
  useEffect(() => {
    if (!db) {
      console.warn("Firebase not initialized. Real-time sync disabled.");
      setLoading(false);
      return;
    }

    if (!currentUser) return;
    // 開發模式模擬使用者不訂閱 Firestore，避免權限錯誤，資料保持空
    if (currentUser.uid === 'dev-mock') {
      setLoading(false);
      return;
    }

    setNotAllowed(false);
    const unsubs: (() => void)[] = [];

    // 首次登入：先執行 bootstrap 再訂閱，避免競態。有 Email 就嘗試寫入（規則已不要求 email_verified）
    const runBootstrapThenSubscriptions = async () => {
      if (currentUser?.email) {
        const initRef = doc(db, 'system', 'subteach_whitelist_init');
        try {
          const initSnap = await getDoc(initRef);
          if (!initSnap.exists()) {
            const normalizedEmail = currentUser.email.trim().toLowerCase();
            // IMPORTANT: 必須在同一個 batch 內寫入 init 與白名單。
            // Firestore rules 的 isFirstLoginBootstrap() 依賴 init 不存在；
            // 若先寫 init 再寫白名單，第二筆會被拒絕。
            const batch = writeBatch(db);
            batch.set(initRef, sanitizeForFirestore({ initialized: true, createdAt: Date.now() }));
            batch.set(doc(db, 'subteach_allowed_users', normalizedEmail), sanitizeForFirestore({
              email: normalizedEmail,
              enabled: true,
              role: 'admin',
              updatedAt: Date.now()
            }));
            await batch.commit();
          }
        } catch (e) {
          console.warn('First-login bootstrap failed', e);
        }
      }

      // Teachers（若權限不足會觸發 error，表示未在白名單內）
    unsubs.push(onSnapshot(
      collection(db, 'teachers'),
      (snap) => {
        setTeachers(snap.docs.map(d => d.data() as Teacher));
      },
      (err: any) => {
        if (err?.code === 'permission-denied') {
          setNotAllowed(true);
          setLoading(false);
        }
      }
    ));

    // 白名單（僅白名單內使用者可讀；admin 可讀全部）
    unsubs.push(onSnapshot(collection(db, 'subteach_allowed_users'), (snap) => {
      setSubteachAllowedUsers(snap.docs.map(d => ({ email: d.id, ...d.data() } as SubteachAllowedUser)));
    }, () => {}));

    // Records
    unsubs.push(onSnapshot(collection(db, 'records'), (snap) => {
      const fetchedRecords = snap.docs.map(d => d.data() as LeaveRecord);
      fetchedRecords.sort((a, b) => b.createdAt - a.createdAt);
      setRecords(fetchedRecords);
    }));

    // Overtime Records
    unsubs.push(onSnapshot(collection(db, 'overtimeRecords'), (snap) => {
      setOvertimeRecords(snap.docs.map(d => d.data() as OvertimeRecord));
    }));

    // Special Activities
    unsubs.push(onSnapshot(collection(db, 'specialActivities'), (snap) => {
      setSpecialActivities(snap.docs.map(d => d.data() as SpecialActivity));
    }));

    // Salary Grades
    unsubs.push(onSnapshot(collection(db, 'salaryGrades'), (snap) => {
      setSalaryGrades(snap.docs.map(d => d.data() as SalaryGrade));
    }));

    // Fixed Overtime Config
    unsubs.push(onSnapshot(collection(db, 'fixedOvertimeConfig'), (snap) => {
      setFixedOvertimeConfig(snap.docs.map(d => d.data() as FixedOvertimeConfig));
    }));

    // Grade Events
    unsubs.push(onSnapshot(collection(db, 'gradeEvents'), (snap) => {
      setGradeEvents(snap.docs.map(d => d.data() as GradeEvent));
    }));

    // Semesters
    unsubs.push(onSnapshot(collection(db, 'semesters'), (snap) => {
      setSemesters(snap.docs.map(d => d.data() as SemesterDefinition));
    }));

    // Sub Pool
    unsubs.push(onSnapshot(collection(db, 'subPool'), (snap) => {
      setSubPool(snap.docs.map(d => d.data() as SubPoolItem));
    }));

    unsubs.push(onSnapshot(collection(db, 'substituteBusyBlocks'), (snap) => {
      setSubstituteBusyBlocks(
        snap.docs.map(d => {
          const data = d.data() as Omit<SubstituteBusyBlock, 'id'>;
          return { ...data, id: d.id } as SubstituteBusyBlock;
        })
      );
    }));

    // Language Payrolls
    unsubs.push(onSnapshot(collection(db, 'languagePayrolls'), (snap) => {
      setLanguagePayrolls(snap.docs.map(d => d.data() as LanguagePayroll));
    }));

    // System Settings & Holidays (Stored in 'system' collection)
    unsubs.push(onSnapshot(doc(db, 'system', 'settings'), (snap) => {
      if (snap.exists()) {
        setSettings(snap.data() as AppSettings);
      }
    }));

    unsubs.push(onSnapshot(doc(db, 'system', 'holidays'), (snap) => {
      if (snap.exists()) {
        setHolidays(snap.data().dates || []);
      }
    }));

    unsubs.push(onSnapshot(doc(db, 'system', 'metadata'), (snap) => {
      if (snap.exists()) {
        setActiveSemesterId(snap.data().activeSemesterId || null);
      }
    }));

    unsubs.push(onSnapshot(collection(db, 'substituteApplications'), (snap) => {
      setSubstituteApplications(snap.docs.map(d => ({ ...d.data(), id: d.id } as SubstituteApplication)));
    }));

    unsubs.push(onSnapshot(collection(db, 'publicBoardApplications'), (snap) => {
      setPublicBoardApplications(snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, vacancyId: data.vacancyId || '', name: data.name || '', phone: String(data.phone ?? ''), note: data.note, createdAt: data.createdAt || 0 } as PublicBoardApplication;
      }));
    }));

    unsubs.push(onSnapshot(collection(db, 'teacherLeaveRequests'), (snap) => {
      setTeacherLeaveRequests(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          teacherName: data.teacherName || '',
          leaveType: data.leaveType || '',
          docId: data.docId,
          reason: data.reason || '',
          payType: data.payType || '鐘點費',
          substituteTeacher: data.substituteTeacher || '教學組媒合',
          startDate: data.startDate || '',
          endDate: data.endDate || '',
          details: Array.isArray(data.details) ? data.details : [],
          status: data.status || 'pending',
          duplicateWarningIgnored: data.duplicateWarningIgnored === true,
          createdAt: data.createdAt || 0,
          updatedAt: data.updatedAt,
        } as TeacherLeaveRequestDoc;
      }));
    }));

      setLoading(false);
    };
    runBootstrapThenSubscriptions();

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [currentUser]);

  // 單日紀錄若日期已過、每週紀錄若 validTo 已過，登入後自動自 Firestore 刪除（不影響未填 validTo 之長期每週規則）
  useEffect(() => {
    if (!db || !currentUser || currentUser.uid === 'dev-mock' || notAllowed) return;
    const expired = substituteBusyBlocks.filter(isSubstituteBusyBlockExpiredForAutoCleanup);
    if (expired.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const b of expired) {
        if (cancelled) return;
        try {
          await deleteDoc(doc(db, 'substituteBusyBlocks', b.id));
        } catch (e) {
          console.warn('substituteBusyBlocks auto-cleanup failed', b.id, e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, currentUser, notAllowed, substituteBusyBlocks]);

  // --- Actions (Write to Firebase) ---

  const addLanguagePayroll = async (payroll: LanguagePayroll) => { 
    if (!db) throw new Error("Firebase not initialized");
    await setDoc(doc(db, 'languagePayrolls', payroll.id), sanitizeForFirestore(payroll));
  };
  const updateLanguagePayroll = async (updatedPayroll: LanguagePayroll) => { 
    if (!db) throw new Error("Firebase not initialized");
    await updateDoc(doc(db, 'languagePayrolls', updatedPayroll.id), sanitizeForFirestore(updatedPayroll as Record<string, unknown>) as any);
  };
  const deleteLanguagePayroll = async (id: string) => { 
    if (!db) throw new Error("Firebase not initialized");
    await deleteDoc(doc(db, 'languagePayrolls', id));
  };

  /**
   * 同步教師預設課表至公開 collection，供請假表單依姓名帶入課表。
   * 一併寫入 teacherType、isFixedOvertimeTeacher，供公開表單篩選姓名（校外/語言僅固定兼課者顯示）。
   * fixedOvertimeConfigForCheck：更新 fixedOvertimeConfig 當下 state 可能尚未更新，可傳入合併後列表。
   */
  const syncPublicTeacherSchedule = async (
    teacher: Teacher,
    options?: { fixedOvertimeConfigForCheck?: FixedOvertimeConfig[] },
  ) => {
    if (!db || !teacher.name?.trim()) return;
    const schedule = teacher.defaultSchedule && teacher.defaultSchedule.length > 0
      ? teacher.defaultSchedule.map(s => ({ day: s.day, period: s.period, subject: s.subject || '', className: s.className || '' }))
      : [];
    const fo = options?.fixedOvertimeConfigForCheck ?? fixedOvertimeConfig;
    const inFixedConfig = fo.some((c) => c.teacherId === teacher.id);
    const isFixedOvertime = Boolean(teacher.isFixedOvertimeTeacher) || inFixedConfig;
    await setDoc(
      doc(db, 'publicTeacherSchedules', teacher.name.trim()),
      sanitizeForFirestore({
        schedule,
        teacherType: teacher.type,
        isFixedOvertimeTeacher: isFixedOvertime,
        updatedAt: Date.now(),
      }),
    );
  };

  /**
   * 將「代課老師個人週課表」同步到公開集合（publicSubstituteSchedules）。
   * 僅輸出代課老師自己的代課節次與手機末四碼，避免公開 teachers/records 全量資料。
   */
  const syncPublicSubstituteSchedules = async (
    teachersForBuild: Teacher[] = teachers,
    recordsForBuild: LeaveRecord[] = records,
  ) => {
    if (!db) return;

    const teacherById = new Map(teachersForBuild.map((t) => [t.id, t]));
    const scheduleBySubId = new Map<
      string,
      {
        teacherId: string;
        teacherName: string;
        phoneLast4: string;
        slots: Array<{
          date: string;
          period: string;
          subject: string;
          className: string;
          originalTeacherName: string;
          payType: string;
          recordId: string;
        }>;
      }
    >();

    const normalizePhoneLast4 = (raw: string | undefined): string => {
      const digits = String(raw || '').replace(/\D/g, '');
      return digits.length >= 4 ? digits.slice(-4) : '';
    };

    recordsForBuild.forEach((record) => {
      if (!record.slots || record.slots.length === 0) return;
      const originalTeacherName = teacherById.get(record.originalTeacherId)?.name || '';
      record.slots.forEach((slot) => {
        if (!slot.substituteTeacherId) return;
        const subId = slot.substituteTeacherId;
        const subTeacher = teacherById.get(subId);
        if (!subTeacher) return;
        const phoneLast4 = normalizePhoneLast4(subTeacher.phone);
        if (!phoneLast4) return;
        if (!scheduleBySubId.has(subId)) {
          scheduleBySubId.set(subId, {
            teacherId: subId,
            teacherName: subTeacher.name || '',
            phoneLast4,
            slots: [],
          });
        }
        scheduleBySubId.get(subId)?.slots.push({
          date: slot.date,
          period: String(slot.period ?? ''),
          subject: String(slot.subject ?? ''),
          className: String(slot.className ?? ''),
          originalTeacherName,
          payType: String(slot.payType ?? ''),
          recordId: record.id,
        });
      });
    });

    for (const item of scheduleBySubId.values()) {
      item.slots.sort((a, b) => a.date.localeCompare(b.date) || a.period.localeCompare(b.period));
    }

    const publicCollectionRef = collection(db, 'publicSubstituteSchedules');
    const existingSnap = await getDocs(publicCollectionRef);
    const existingIds = new Set(existingSnap.docs.map((d) => d.id));
    const nextIds = new Set<string>(scheduleBySubId.keys());

    const batch = writeBatch(db);
    scheduleBySubId.forEach((item, teacherId) => {
      batch.set(
        doc(db, 'publicSubstituteSchedules', teacherId),
        sanitizeForFirestore({
          teacherId: item.teacherId,
          teacherName: item.teacherName,
          phoneLast4: item.phoneLast4,
          slots: item.slots,
          updatedAt: Date.now(),
        }),
      );
    });
    existingIds.forEach((id) => {
      if (!nextIds.has(id)) {
        batch.delete(doc(db, 'publicSubstituteSchedules', id));
      }
    });
    await batch.commit();
  };

  /**
   * 自動維護公開代課週課表（供代課老師自行查詢）。
   * 只在已登入且主資料載入完成後執行，並做簡單 debounce 降低頻繁寫入。
   */
  useEffect(() => {
    if (!currentUser || loading) return;
    if (currentUser.uid === 'dev-mock') return;
    const timer = setTimeout(() => {
      void syncPublicSubstituteSchedules();
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- teachers/records 變動時重建公開查詢資料，避免依賴函式參考造成無限重綁
  }, [currentUser, loading, teachers, records]);

  const addTeacher = async (teacher: Teacher) => {
    if (!db) throw new Error("Firebase not initialized");
    await setDoc(doc(db, 'teachers', teacher.id), sanitizeForFirestore(teacher));
    await syncPublicTeacherSchedule(teacher);
    await syncPublicSubstituteSchedules([...teachers.filter((t) => t.id !== teacher.id), teacher], records);
  };
  const updateTeacher = async (updatedTeacher: Teacher) => {
    if (!db) throw new Error("Firebase not initialized");
    await updateDoc(doc(db, 'teachers', updatedTeacher.id), sanitizeForFirestore(updatedTeacher as Record<string, unknown>) as any);
    await syncPublicTeacherSchedule(updatedTeacher);
    await syncPublicSubstituteSchedules([...teachers.filter((t) => t.id !== updatedTeacher.id), updatedTeacher], records);
  };
  const setAllTeachers = async (newTeachers: Teacher[]) => {
    if (!db) throw new Error("Firebase not initialized");
    const batch = writeBatch(db);
    newTeachers.forEach(t => {
      batch.set(doc(db, 'teachers', t.id), sanitizeForFirestore(t));
    });
    await batch.commit();
    for (const t of newTeachers) {
      await syncPublicTeacherSchedule(t);
    }
    await syncPublicSubstituteSchedules(newTeachers, records);
  };
  const deleteTeacher = async (id: string) => { 
    if (!db) throw new Error("Firebase not initialized");
    await deleteDoc(doc(db, 'teachers', id));
    await syncPublicSubstituteSchedules(teachers.filter((t) => t.id !== id), records);
  };
  
  const renameTeacher = async (oldId: string, newTeacher: Teacher) => {
      if (!db) throw new Error("Firebase not initialized");
      const batch = writeBatch(db);
      // 1. Add new teacher
      batch.set(doc(db, 'teachers', newTeacher.id), newTeacher);
      // 2. Delete old teacher
      batch.delete(doc(db, 'teachers', oldId));
      
      // 3. Update related records (This is heavy in Firestore, ideally done via Cloud Function, but client-side for now)
      // We need to query all records where this teacher is involved. 
      // For simplicity in this migration phase, we might skip deep updates or do them iteratively.
      // Given the complexity, let's just update the teacher doc for now and warn user.
      // Or, since we have the `records` in state, we can iterate and update.
      records.forEach(record => {
          let isModified = false; 
          let newRecord = { ...record };
          if (newRecord.originalTeacherId === oldId) { newRecord.originalTeacherId = newTeacher.id; isModified = true; }
          if (newRecord.slots) {
              const newSlots = newRecord.slots.map(s => {
                  if (s.substituteTeacherId === oldId) { isModified = true; return { ...s, substituteTeacherId: newTeacher.id }; }
                  return s;
              });
              if (isModified) newRecord.slots = newSlots;
          }
          if (newRecord.details) {
              const newDetails = newRecord.details.map(d => {
                  if (d.substituteTeacherId === oldId) { isModified = true; return { ...d, substituteTeacherId: newTeacher.id }; }
                  return d;
              });
              if (isModified) newRecord.details = newDetails;
          }
          if (isModified) {
             batch.set(doc(db, 'records', record.id), newRecord);
          }
      });

      await batch.commit();
      await syncPublicTeacherSchedule(newTeacher);
      await syncPublicSubstituteSchedules(
        [...teachers.filter((t) => t.id !== oldId), newTeacher],
        records.map((r) => {
          let changed = false;
          const next = { ...r };
          if (next.originalTeacherId === oldId) {
            next.originalTeacherId = newTeacher.id;
            changed = true;
          }
          if (next.slots) {
            const slots = next.slots.map((s) => {
              if (s.substituteTeacherId === oldId) {
                changed = true;
                return { ...s, substituteTeacherId: newTeacher.id };
              }
              return s;
            });
            if (changed) next.slots = slots;
          }
          if (next.details) {
            const details = next.details.map((d) => {
              if (d.substituteTeacherId === oldId) {
                changed = true;
                return { ...d, substituteTeacherId: newTeacher.id };
              }
              return d;
            });
            if (changed) next.details = details;
          }
          return next;
        }),
      );
  };

  /** 將目前所有教師的預設課表寫入 publicTeacherSchedules，供請假表單依姓名帶入 */
  const syncAllPublicTeacherSchedules = async () => {
    if (!db) throw new Error("Firebase not initialized");
    for (const t of teachers) {
      await syncPublicTeacherSchedule(t);
    }
  };

  const addRecord = async (record: LeaveRecord) => { 
    if (!db) throw new Error("Firebase not initialized");
    await setDoc(doc(db, 'records', record.id), sanitizeForFirestore(record));
    await syncPublicSubstituteSchedules(teachers, [record, ...records.filter((r) => r.id !== record.id)]);
  };
  
  const updateRecord = async (updatedRecord: LeaveRecord) => { 
    if (!db) throw new Error("Firebase not initialized");
    const docRef = doc(db, 'records', updatedRecord.id);
    await setDoc(docRef, sanitizeForFirestore({ ...updatedRecord }), { merge: true });
    await syncPublicSubstituteSchedules(teachers, [updatedRecord, ...records.filter((r) => r.id !== updatedRecord.id)]);
  };
  
  const deleteRecord = async (id: string) => { 
    if (!db) throw new Error("Firebase not initialized");
    await deleteDoc(doc(db, 'records', id));
    await syncPublicSubstituteSchedules(teachers, records.filter((r) => r.id !== id));
  };

  const updateOvertimeRecord = async (record: OvertimeRecord) => { 
    if (!db) throw new Error("Firebase not initialized");
    await setDoc(doc(db, 'overtimeRecords', record.id), sanitizeForFirestore(record));
  };
  const addActivity = async (activity: SpecialActivity) => { 
    if (!db) throw new Error("Firebase not initialized");
    await setDoc(doc(db, 'specialActivities', activity.id), sanitizeForFirestore(activity));
  };
  const updateActivity = async (updatedActivity: SpecialActivity) => { 
    if (!db) throw new Error("Firebase not initialized");
    await updateDoc(doc(db, 'specialActivities', updatedActivity.id), sanitizeForFirestore(updatedActivity as Record<string, unknown>) as any);
  };
  const deleteActivity = async (id: string) => { 
    if (!db) throw new Error("Firebase not initialized");
    await deleteDoc(doc(db, 'specialActivities', id));
  };
  const updateFixedOvertimeConfig = async (config: FixedOvertimeConfig) => { 
    if (!db) throw new Error("Firebase not initialized");
    await setDoc(doc(db, 'fixedOvertimeConfig', config.teacherId), sanitizeForFirestore(config));
    const t = teachers.find((x) => x.id === config.teacherId);
    if (t) {
      const merged = [...fixedOvertimeConfig.filter((c) => c.teacherId !== config.teacherId), config];
      await syncPublicTeacherSchedule(t, { fixedOvertimeConfigForCheck: merged });
    }
  };
  const removeFixedOvertimeConfig = async (teacherId: string) => { 
    if (!db) throw new Error("Firebase not initialized");
    await deleteDoc(doc(db, 'fixedOvertimeConfig', teacherId));
    const t = teachers.find((x) => x.id === teacherId);
    if (t) {
      const merged = fixedOvertimeConfig.filter((c) => c.teacherId !== teacherId);
      await syncPublicTeacherSchedule(t, { fixedOvertimeConfigForCheck: merged });
    }
  };
  const addGradeEvent = async (event: GradeEvent) => { 
    if (!db) throw new Error("Firebase not initialized");
    await setDoc(doc(db, 'gradeEvents', event.id), sanitizeForFirestore(event));
  };
  const removeGradeEvent = async (id: string) => { 
    if (!db) throw new Error("Firebase not initialized");
    await deleteDoc(doc(db, 'gradeEvents', id));
  };
  
  const addSemester = async (sem: SemesterDefinition) => { 
    if (!db) throw new Error("Firebase not initialized");
    await setDoc(doc(db, 'semesters', sem.id), sanitizeForFirestore(sem));
    await setSemesterActive(sem.id);
  };
  const updateSemester = async (sem: SemesterDefinition) => { 
    if (!db) throw new Error("Firebase not initialized");
    await updateDoc(doc(db, 'semesters', sem.id), sanitizeForFirestore(sem as Record<string, unknown>) as any);
  };
  const removeSemester = async (id: string) => { 
    if (!db) throw new Error("Firebase not initialized");
    await deleteDoc(doc(db, 'semesters', id));
    if (activeSemesterId === id) await setSemesterActive('');
  };
  const setSemesterActive = async (id: string) => { 
    if (!db) throw new Error("Firebase not initialized");
    await setDoc(doc(db, 'system', 'metadata'), { activeSemesterId: id }, { merge: true });
  };
  
  const updateSettings = async (newSettings: AppSettings) => { 
    if (!db) throw new Error("Firebase not initialized");
    await setDoc(doc(db, 'system', 'settings'), sanitizeForFirestore(newSettings));
  };

  const upsertSalaryGrades = async (grades: SalaryGrade[]) => {
    if (!db) throw new Error("Firebase not initialized");
    const normalized = (grades || [])
      .map((g) => ({
        ...g,
        id: String(g.points),
        points: Number(g.points) || 0,
        salary: Number(g.salary) || 0,
        researchFeeCertBachelor: Number(g.researchFeeCertBachelor || 0),
        researchFeeCertMaster: Number(g.researchFeeCertMaster || 0),
        researchFeeNoCertBachelor: Number(g.researchFeeNoCertBachelor || 0),
        researchFeeNoCertMaster: Number(g.researchFeeNoCertMaster || 0),
      }))
      .filter((g) => g.points > 0)
      .sort((a, b) => a.points - b.points);

    const existingIds = new Set((salaryGrades || []).map((g) => String(g.id || g.points)));
    const nextIds = new Set(normalized.map((g) => String(g.id)));
    const batch = writeBatch(db);
    normalized.forEach((g) => {
      batch.set(doc(db, 'salaryGrades', String(g.id)), sanitizeForFirestore(g));
    });
    existingIds.forEach((id) => {
      if (!nextIds.has(id)) batch.delete(doc(db, 'salaryGrades', id));
    });
    await batch.commit();
  };

  const seedSalaryGradesFromBuiltIn = async () => {
    if (!db) throw new Error("Firebase not initialized");
    const existingPoints = new Set((salaryGrades || []).map((g) => Number(g.points)));
    const batch = writeBatch(db);
    let inserted = 0;
    let skipped = 0;
    BUILT_IN_SALARY_GRADES.forEach((g) => {
      if (existingPoints.has(g.points)) {
        skipped++;
        return;
      }
      inserted++;
      batch.set(doc(db, 'salaryGrades', String(g.points)), sanitizeForFirestore(g));
    });
    if (inserted > 0) await batch.commit();
    return { inserted, skipped };
  };
  const addHoliday = async (date: string) => { 
    if (!db) throw new Error("Firebase not initialized");
    const newHolidays = [...holidays, date].sort();
    await setDoc(doc(db, 'system', 'holidays'), { dates: newHolidays });
  };
  const removeHoliday = async (date: string) => { 
    if (!db) throw new Error("Firebase not initialized");
    const newHolidays = holidays.filter(d => d !== date);
    await setDoc(doc(db, 'system', 'holidays'), { dates: newHolidays });
  };

  const addToSubPool = async (teacherId: string) => {
      if (!db) throw new Error("Firebase not initialized");
      if (!subPool.some(i => i.teacherId === teacherId)) {
          const newItem: SubPoolItem = { teacherId, status: 'available', note: '', updatedAt: Date.now() };
          await setDoc(doc(db, 'subPool', teacherId), sanitizeForFirestore(newItem));
      }
  };
  const removeFromSubPool = async (teacherId: string) => {
      if (!db) throw new Error("Firebase not initialized");
      await deleteDoc(doc(db, 'subPool', teacherId));
  };
  const updateSubPoolItem = async (item: SubPoolItem) => {
      if (!db) throw new Error("Firebase not initialized");
      await setDoc(doc(db, 'subPool', item.teacherId), sanitizeForFirestore({ ...item, updatedAt: Date.now() }));
  };

  const addSubstituteBusyBlock = async (input: Omit<SubstituteBusyBlock, 'id' | 'createdAt'>) => {
    if (!db) throw new Error("Firebase not initialized");
    const id = crypto.randomUUID();
    const block: SubstituteBusyBlock = { ...input, id, createdAt: Date.now() };
    await setDoc(doc(db, 'substituteBusyBlocks', id), sanitizeForFirestore(block));
  };

  const deleteSubstituteBusyBlock = async (blockId: string) => {
    if (!db) throw new Error("Firebase not initialized");
    await deleteDoc(doc(db, 'substituteBusyBlocks', blockId));
  };

  const deleteSubstituteApplication = async (id: string) => {
    if (!db) throw new Error("Firebase not initialized");
    await deleteDoc(doc(db, 'substituteApplications', id));
  };

  const deletePublicBoardApplication = async (id: string) => {
    if (!db) throw new Error("Firebase not initialized");
    await deleteDoc(doc(db, 'publicBoardApplications', id));
  };

  const updateTeacherLeaveRequestStatus = async (id: string, status: 'pending' | 'imported' | 'archived') => {
    if (!db) throw new Error("Firebase not initialized");
    await updateDoc(doc(db, 'teacherLeaveRequests', id), { status, updatedAt: Date.now() });
  };

  const deleteTeacherLeaveRequest = async (id: string) => {
    if (!db) throw new Error("Firebase not initialized");
    await deleteDoc(doc(db, 'teacherLeaveRequests', id));
  };

  const approveSubstituteApplication = async (id: string, options?: { addToSubPool: boolean }) => {
    if (!db) throw new Error("Firebase not initialized");
    const app = substituteApplications.find(a => a.id === id);
    if (!app) throw new Error("找不到該筆報名資料");
    if (app.status === 'approved') throw new Error("此筆已審核通過");
    const addToSubPoolFlag = options?.addToSubPool !== false;
    const teacherId = `app_${id}`;
    const educationStr = [app.educationLevel, app.graduationMajor != null ? String(app.graduationMajor).trim() : ''].filter(Boolean).join(' ');
    const noteParts = [
      app.lineAccount ? `LINE: ${app.lineAccount}` : '',
      app.unavailableTime ? `無法代課時段: ${app.unavailableTime}` : '',
      app.availableTime ? `可代課時段: ${app.availableTime}` : '',
      app.hasEducationCredential === true ? '學程修畢' : app.hasEducationCredential === false ? '未學程修畢' : '',
      app.note || '',
    ].filter(Boolean);
    const newTeacher: Teacher = {
      id: teacherId,
      name: app.name != null ? String(app.name).trim() : '',
      phone: app.phone != null ? String(app.phone).trim() : '',
      education: educationStr || (app.graduationMajor != null ? String(app.graduationMajor).trim() : '') || undefined,
      hasCertificate: app.hasCertificate,
      type: TeacherType.EXTERNAL,
      expertise: (app.teachingItems && app.teachingItems.length > 0) ? app.teachingItems : undefined,
      note: noteParts.length > 0 ? noteParts.join('；') : undefined,
      isRetired: false,
      isSpecialEd: false,
      isGraduatingHomeroom: false,
      baseSalary: 0,
      researchFee: 0,
      isHomeroom: false,
    };
    await setDoc(doc(db, 'teachers', teacherId), sanitizeForFirestore(newTeacher));
    if (addToSubPoolFlag) {
      if (!subPool.some(i => i.teacherId === teacherId)) {
        const poolNote = [app.unavailableTime ? `無法：${app.unavailableTime}` : '', app.availableTime ? `可代課：${app.availableTime}` : ''].filter(Boolean).join('；');
        const teachingSubjectStr = (app.teachingItems && app.teachingItems.length > 0) ? app.teachingItems.join(',') : '';
        await setDoc(doc(db, 'subPool', teacherId), sanitizeForFirestore({
          teacherId,
          status: 'available',
          note: poolNote,
          updatedAt: Date.now(),
          teachingSubject: teachingSubjectStr,
        }));
      }
    }
    await updateDoc(doc(db, 'substituteApplications', id), {
      status: 'approved',
      teacherId,
      updatedAt: Date.now(),
    });
    return { teacherId };
  };

  const checkGasConnection = async (): Promise<boolean> => {
    const targetUrl = settings.gasWebAppUrl || GAS_WEB_APP_URL;
    if (!targetUrl) return false;
    try { await callGasApi(targetUrl, 'TEST_CONNECTION', {}); return true; } catch (e) { return false; }
  };

  // --- Migration & Load Logic ---

  const loadFromGas = async () => {
    const targetUrl = settings.gasWebAppUrl || GAS_WEB_APP_URL;
    if (!targetUrl) { throw new Error("請先在「代課清冊」頁面設定 Web App URL。"); }
    try {
        const result = await callGasApi(targetUrl, 'LOAD_DATA', {});
        const remoteTeachers = result.data.teachers || [];
        const rawRecords = result.data.records || [];
        const systemSettings = result.data.systemSettings || {};
        
        const rehydratedRecords = rawRecords.map((record: any) => {
            if (record.slots && record.slots.length > 0) {
                return { ...record, details: convertSlotsToDetails(record.slots, remoteTeachers, result.data.salaryGrades || []) };
            }
            return record;
        });
        
        const uniqueRemoteTeachers = Array.from(new Map(remoteTeachers.map((t: Teacher) => [t.id, t])).values()) as Teacher[];

        // Update Local State (Visual only, until Migrate is clicked)
        setTeachers(uniqueRemoteTeachers);
        setRecords(rehydratedRecords);
        setSalaryGrades((result.data.salaryGrades || []).map((g: any) => ({ ...g, id: String(g.points) })));
        setSpecialActivities(result.data.specialActivities || []);
        setFixedOvertimeConfig(result.data.fixedOvertimeConfig || []);
        setGradeEvents(result.data.gradeEvents || []);
        setHolidays(result.data.holidays || []);
        setSubPool(result.data.subPool || []);
        setOvertimeRecords(result.data.overtimeRecords || []); 
        setLanguagePayrolls(result.data.languagePayrolls || []); 
        
        setSettings(prev => ({
            ...prev,
            semesterStart: systemSettings.semesterStart || prev.semesterStart,
            semesterEnd: systemSettings.semesterEnd || prev.semesterEnd,
            graduationDate: systemSettings.graduationDate || prev.graduationDate 
        }));
        
        return { teacherCount: uniqueRemoteTeachers.length, recordCount: rehydratedRecords.length };
    } catch (e: any) { console.error("Load Data Error", e); throw e; }
  };

  const migrateToFirebase = async () => {
      if (!db) throw new Error("Firebase not initialized");
      const batchLimit = 500;
      let batch = writeBatch(db);
      let count = 0;

      const commitBatch = async () => {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
      };

      const addToBatch = async (ref: any, data: any) => {
          batch.set(ref, data);
          count++;
          if (count >= batchLimit) await commitBatch();
      };

      // Teachers
      for (const t of teachers) await addToBatch(doc(db, 'teachers', t.id), t);
      // Records
      for (const r of records) await addToBatch(doc(db, 'records', r.id), r);
      // Overtime
      for (const o of overtimeRecords) await addToBatch(doc(db, 'overtimeRecords', o.id), o);
      // Activities
      for (const a of specialActivities) await addToBatch(doc(db, 'specialActivities', a.id), a);
      // Salary Grades
      for (const s of salaryGrades) await addToBatch(doc(db, 'salaryGrades', s.id), s);
      // Fixed Overtime
      for (const f of fixedOvertimeConfig) await addToBatch(doc(db, 'fixedOvertimeConfig', f.teacherId), f);
      // Grade Events
      for (const g of gradeEvents) await addToBatch(doc(db, 'gradeEvents', g.id), g);
      // Semesters
      for (const s of semesters) await addToBatch(doc(db, 'semesters', s.id), s);
      // Sub Pool
      for (const s of subPool) await addToBatch(doc(db, 'subPool', s.teacherId), s);
      // Language Payrolls
      for (const l of languagePayrolls) await addToBatch(doc(db, 'languagePayrolls', l.id), l);

      // System
      await addToBatch(doc(db, 'system', 'settings'), settings);
      await addToBatch(doc(db, 'system', 'holidays'), { dates: holidays });
      if (activeSemesterId) await addToBatch(doc(db, 'system', 'metadata'), { activeSemesterId });

      await commitBatch();
      alert("資料已成功遷移至 Firebase！");
  };

  const syncToPublicBoard = async (vacancies: any[]) => {
      if (db) {
          const snap = await getDoc(doc(db, 'publicBoard', 'vacancies'));
          const existing = snap.exists() ? snap.data() : null;
          const existingList = Array.isArray(existing?.vacancies) ? existing.vacancies : [];
          const tierById: Record<string, number> = {};
          existingList.forEach((v: any) => {
              const id = v?.id != null ? String(v.id) : '';
              if (id && (v.tier === 1 || v.tier === 2)) tierById[id] = v.tier;
          });
          const withStatus = (vacancies || []).map((v: any) => ({
              ...v,
              status: '開放報名',
              tier: tierById[String(v?.id)] ?? 1
          }));
          await setDoc(doc(db, 'publicBoard', 'vacancies'), {
              vacancies: sanitizeForFirestore(withStatus),
              updatedAt: Date.now()
          });
          return;
      }
      const targetUrl = settings.gasWebAppUrl || GAS_WEB_APP_URL;
      if (!targetUrl) throw new Error("未設定 Google Apps Script URL，且 Firebase 未啟用。");
      return await callGasApi(targetUrl, 'SYNC_PUBLIC_VACANCIES', { vacancies });
  };

  const releaseVacanciesToTier2 = async (vacancyIds: string[]) => {
      if (!db || vacancyIds.length === 0) return;
      const snap = await getDoc(doc(db, 'publicBoard', 'vacancies'));
      const data = snap.exists() ? snap.data() : null;
      const raw = data?.vacancies;
      if (!Array.isArray(raw)) return;
      const idSet = new Set(vacancyIds);
      const updated = raw.map((v: any) => {
          const id = v?.id != null ? String(v.id) : '';
          return idSet.has(id) ? { ...v, tier: 2 } : v;
      });
      await setDoc(doc(db, 'publicBoard', 'vacancies'), {
          vacancies: sanitizeForFirestore(updated),
          updatedAt: Date.now()
      });
  };

  const addSubteachAllowedUser = async (email: string, role: 'admin' | 'user', displayName?: string) => {
    if (!db) throw new Error('Firebase 未初始化');
    const normalizedEmail = email.trim().toLowerCase();
    const ref = doc(db, 'subteach_allowed_users', normalizedEmail);
    await setDoc(ref, sanitizeForFirestore({
      email: normalizedEmail,
      enabled: true,
      role,
      displayName: displayName || null,
      updatedAt: Date.now()
    }));
  };

  const updateSubteachAllowedUser = async (email: string, data: Partial<Pick<SubteachAllowedUser, 'enabled' | 'role' | 'displayName'>>) => {
    if (!db) throw new Error('Firebase 未初始化');
    const normalizedEmail = email.trim().toLowerCase();
    const ref = doc(db, 'subteach_allowed_users', normalizedEmail);
    await updateDoc(ref, sanitizeForFirestore({ ...data, updatedAt: Date.now() }) as any);
  };

  const removeSubteachAllowedUser = async (email: string) => {
    if (!db) throw new Error('Firebase 未初始化');
    const normalizedEmail = email.trim().toLowerCase();
    await deleteDoc(doc(db, 'subteach_allowed_users', normalizedEmail));
  };

  const value = {
    currentUser,
    teachers, records, overtimeRecords, specialActivities, salaryGrades, settings, holidays, fixedOvertimeConfig, gradeEvents, 
    semesters, activeSemesterId, subPool, substituteBusyBlocks, languagePayrolls, substituteApplications, publicBoardApplications, teacherLeaveRequests,
    loading,
    notAllowed, subteachAllowedUsers, isSubteachAdmin, addSubteachAllowedUser, updateSubteachAllowedUser, removeSubteachAllowedUser,
    updateTeacherLeaveRequestStatus, deleteTeacherLeaveRequest,
    addTeacher, updateTeacher, setAllTeachers, deleteTeacher, renameTeacher, syncAllPublicTeacherSchedules, 
    addRecord, updateRecord, deleteRecord, updateOvertimeRecord, addActivity, updateActivity, deleteActivity, 
    updateFixedOvertimeConfig, removeFixedOvertimeConfig, 
    addGradeEvent, removeGradeEvent,
    addSemester, updateSemester, removeSemester, setSemesterActive,
    updateSettings, upsertSalaryGrades, seedSalaryGradesFromBuiltIn, addHoliday, removeHoliday, 
    addToSubPool, removeFromSubPool, updateSubPoolItem, addSubstituteBusyBlock, deleteSubstituteBusyBlock,
    deleteSubstituteApplication, deletePublicBoardApplication, approveSubstituteApplication,
    addLanguagePayroll, updateLanguagePayroll, deleteLanguagePayroll,
    loadFromGas, migrateToFirebase, syncToPublicBoard, releaseVacanciesToTier2, checkGasConnection,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppStore = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppStore must be used within an AppProvider');
  }
  return context;
};
