/**
 * 一鍵搬運：從 Google Sheet（經 GAS API）讀取資料，寫入 Firebase Firestore
 * 僅寫入本系統集合（edutrack_*），不影響其他系統
 */
import { collection, doc, setDoc, addDoc } from 'firebase/firestore';
import { getDb, COLLECTIONS } from './firebase';

const GAS_API_URL = import.meta.env.VITE_GAS_API_URL || 'https://script.google.com/macros/s/AKfycbzWyYHtUbAMIFGBtMtXGvdXuAIiml1pAdf0qKykQ3vzCY5QFdAsMjCoyZ_Znam7oxRC/exec';

async function gasFetch<T = any>(action: string, payload: unknown = {}): Promise<T> {
  const res = await fetch(GAS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || `GAS ${action} 失敗`);
  return json.data as T;
}

function toDateStr(v: any): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v && typeof v.toDate === 'function') return v.toDate().toISOString().slice(0, 10);
  return String(v);
}

export interface MigrationResult {
  success: boolean;
  message: string;
  counts: {
    courses: number;
    students: number;
    awards: number;
    vendors: number;
    archive: number;
    todos: number;
  };
  errors: string[];
}

export async function migrateSheetToFirebase(): Promise<MigrationResult> {
  const db = getDb();
  const errors: string[] = [];
  const counts = { courses: 0, students: 0, awards: 0, vendors: 0, archive: 0, todos: 0 };

  if (!db) {
    return { success: false, message: 'Firebase 未初始化或未設定 .env', counts, errors: ['getDb() 為 null'] };
  }

  try {
    // 1. 課程 + 學生
    const courses = await gasFetch<any[]>('GET_HISTORY');
    if (Array.isArray(courses)) {
      for (const c of courses) {
        try {
          const courseId = c.id || c.courseId;
          if (!courseId) continue;
          await setDoc(doc(db, COLLECTIONS.COURSES, courseId), {
            academicYear: c.academicYear ?? '',
            semester: c.semester ?? '',
            courseName: c.courseName ?? '',
            instructor: c.instructor ?? '',
            classTime: c.classTime ?? '',
            location: c.location ?? '',
            createdAt: c.createdAt ?? new Date().toISOString(),
            fileUrl: c.fileUrl ?? '',
            startDate: c.startDate ?? '',
            endDate: c.endDate ?? '',
            selectedDays: typeof c.selectedDays === 'string' ? c.selectedDays : JSON.stringify(c.selectedDays || []),
          });
          counts.courses++;

          const students = await gasFetch<any[]>('GET_COURSE_STUDENTS', { courseId });
          if (Array.isArray(students)) {
            const studentsRef = collection(db, COLLECTIONS.STUDENTS);
            for (const s of students) {
              await addDoc(studentsRef, {
                courseId,
                id: s.id ?? '',
                period: s.period ?? '',
                className: s.className ?? '',
                name: s.name ?? '',
              });
              counts.students++;
            }
          }
        } catch (e: any) {
          errors.push(`課程 ${c.courseName || c.id}: ${e.message}`);
        }
      }
    }

    // 2. 頒獎紀錄
    const awards = await gasFetch<any[]>('GET_AWARD_HISTORY');
    if (Array.isArray(awards)) {
      for (const a of awards) {
        try {
          const id = a.id || `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          await setDoc(doc(db, COLLECTIONS.AWARDS, id), {
            date: toDateStr(a.date),
            title: a.title ?? '',
            students: Array.isArray(a.students) ? a.students : [],
            createdAt: a.createdAt ?? new Date().toISOString(),
          });
          counts.awards++;
        } catch (e: any) {
          errors.push(`頒獎 ${a.title}: ${e.message}`);
        }
      }
    }

    // 3. 廠商
    const vendors = await gasFetch<any[]>('GET_VENDORS');
    if (Array.isArray(vendors)) {
      for (const v of vendors) {
        try {
          const id = v.id || `v-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          await setDoc(doc(db, COLLECTIONS.VENDORS, id), {
            name: v.name ?? '',
            category: v.category ?? '',
            contactPerson: v.contactPerson ?? '',
            phone: v.phone ?? '',
            email: v.email ?? '',
            lineId: v.lineId ?? '',
            address: v.address ?? '',
            note: v.note ?? '',
            relatedTasks: Array.isArray(v.relatedTasks) ? v.relatedTasks : [],
          });
          counts.vendors++;
        } catch (e: any) {
          errors.push(`廠商 ${v.name}: ${e.message}`);
        }
      }
    }

    // 4. 事項列檔
    const archive = await gasFetch<any[]>('GET_ARCHIVE');
    if (Array.isArray(archive)) {
      for (const a of archive) {
        try {
          const id = a.id || `ar-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          await setDoc(doc(db, COLLECTIONS.ARCHIVE, id), {
            title: a.title ?? '',
            month: a.month ?? '',
            isPrinted: a.isPrinted === true,
            isNotified: a.isNotified === true,
            notes: a.notes ?? '',
            updatedAt: a.updatedAt ?? new Date().toISOString(),
          });
          counts.archive++;
        } catch (e: any) {
          errors.push(`事項列檔 ${a.title}: ${e.message}`);
        }
      }
    }

    // 5. 待辦
    const todos = await gasFetch<any[]>('GET_TODOS');
    if (Array.isArray(todos)) {
      for (const t of todos) {
        try {
          const id = t.id || `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          await setDoc(doc(db, COLLECTIONS.TODOS, id), {
            id,
            date: toDateStr(t.date) || '',
            title: t.title ?? '',
            type: t.type ?? 'task',
            status: t.status ?? 'pending',
            priority: t.priority ?? 'Medium',
            seriesId: t.seriesId ?? '',
            topic: t.topic ?? '',
            officialDocs: Array.isArray(t.officialDocs) ? t.officialDocs : [],
            contacts: Array.isArray(t.contacts) ? t.contacts : [],
            commonContacts: Array.isArray(t.commonContacts) ? t.commonContacts : [],
            attachments: Array.isArray(t.attachments) ? t.attachments : [],
            commonAttachments: Array.isArray(t.commonAttachments) ? t.commonAttachments : [],
            memo: t.memo ?? '',
            createdAt: t.createdAt ?? new Date().toISOString(),
            academicYear: t.academicYear ?? '114',
            period: t.period ?? 'full',
          });
          counts.todos++;
        } catch (e: any) {
          errors.push(`待辦 ${t.title}: ${e.message}`);
        }
      }
    }

    return {
      success: errors.length === 0,
      message: errors.length === 0
        ? `搬運完成：課程 ${counts.courses}、學生 ${counts.students}、頒獎 ${counts.awards}、廠商 ${counts.vendors}、事項列檔 ${counts.archive}、待辦 ${counts.todos}`
        : `搬運完成，但有 ${errors.length} 筆錯誤`,
      counts,
      errors,
    };
  } catch (e: any) {
    return {
      success: false,
      message: e.message || '搬運失敗',
      counts,
      errors: [...errors, e.message],
    };
  }
}
