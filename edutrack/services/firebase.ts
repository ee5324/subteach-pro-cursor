/**
 * 與主站共用同一 Firebase App（initializeApp 僅在 src/lib/firebase.ts）
 * 集合仍使用 edutrack_ 前綴，與 firestore.rules 一致
 */
import type { FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';
import { getAnalytics, type Analytics } from 'firebase/analytics';
import { firebaseApp } from '../../src/lib/firebase';

const defaultMeasurementId = 'G-R5K71QKQ5X';

const COLLECTION_PREFIX = (import.meta.env.VITE_FIREBASE_COLLECTION_PREFIX ?? 'edutrack_').replace(/\/$/, '');

let db: Firestore | null = null;
let auth: Auth | null = null;
let analytics: Analytics | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  return (firebaseApp as FirebaseApp | null) ?? null;
}

export function getAnalyticsInstance(): Analytics | null {
  const app = getFirebaseApp();
  const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || defaultMeasurementId;
  if (!app || !measurementId) return null;
  if (!analytics) {
    try {
      analytics = getAnalytics(app);
    } catch {
      return null;
    }
  }
  return analytics;
}

export function getDb(): Firestore | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!db) {
    db = getFirestore(app);
  }
  return db;
}

export function getAuthInstance(): Auth | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!auth) {
    auth = getAuth(app);
  }
  return auth;
}

export const COLLECTIONS = {
  COURSES: `${COLLECTION_PREFIX}courses`,
  STUDENTS: `${COLLECTION_PREFIX}students`,
  AWARDS: `${COLLECTION_PREFIX}awards`,
  VENDORS: `${COLLECTION_PREFIX}vendors`,
  ARCHIVE: `${COLLECTION_PREFIX}archive`,
  TODOS: `${COLLECTION_PREFIX}todos`,
  MONTHLY_RECURRING_TODOS: `${COLLECTION_PREFIX}monthly_recurring_todos`,
  ALLOWED_USERS: `${COLLECTION_PREFIX}allowed_users`,
  EXAM_PAPERS: `${COLLECTION_PREFIX}exam_papers`,
  EXAM_PAPER_FOLDERS: `${COLLECTION_PREFIX}exam_paper_folders`,
  EXAM_PAPER_CHECKS: `${COLLECTION_PREFIX}exam_paper_checks`,
  LANGUAGE_ELECTIVE: `${COLLECTION_PREFIX}language_elective`,
  LANGUAGE_ELECTIVE_STUDENTS: `${COLLECTION_PREFIX}language_elective_students`,
  SYSTEM: `${COLLECTION_PREFIX}system`,
  CALENDAR_SETTINGS: `${COLLECTION_PREFIX}calendar_settings`,
  EXAM_CAMPAIGNS: `${COLLECTION_PREFIX}exam_campaigns`,
  EXAM_SUBMISSIONS: `${COLLECTION_PREFIX}exam_submissions`,
  /** 僅班級／最後送出時間；免登入可讀（與 allowPublicSubmitNoLogin 併用），不含學生個資 */
  EXAM_SUBMIT_PROGRESS: `${COLLECTION_PREFIX}exam_submit_progress`,
  EXAM_SYSTEM: `${COLLECTION_PREFIX}exam_system`,
  BUDGET_PLANS: `${COLLECTION_PREFIX}budget_plans`,
  BUDGET_PLAN_ADVANCES: `${COLLECTION_PREFIX}budget_plan_advances`,
} as const;

export const BUDGET_PLAN_LEDGER_SUBCOLLECTION = 'ledger_entries';

export const getCollectionPrefix = () => COLLECTION_PREFIX;
