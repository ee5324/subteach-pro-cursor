import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import type { AllowedUser } from '../types';
import { getDb, COLLECTIONS } from './firebase';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function getAllowedUser(email: string): Promise<AllowedUser | null> {
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  const normalizedEmail = normalizeEmail(email);
  const snapshot = await getDoc(doc(db, COLLECTIONS.ALLOWED_USERS, normalizedEmail));
  if (!snapshot.exists()) return null;
  return snapshot.data() as AllowedUser;
}

export async function listAllowedUsers(): Promise<AllowedUser[]> {
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  const snapshot = await getDocs(collection(db, COLLECTIONS.ALLOWED_USERS));
  return snapshot.docs
    .map((item) => item.data() as AllowedUser)
    .sort((a, b) => a.email.localeCompare(b.email, 'zh-Hant'));
}

export async function saveAllowedUser(
  payload: Pick<AllowedUser, 'email' | 'role' | 'enabled'> & Partial<AllowedUser>,
  operatorEmail?: string,
) {
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');

  const normalizedEmail = normalizeEmail(payload.email);
  const now = new Date().toISOString();
  const ref = doc(db, COLLECTIONS.ALLOWED_USERS, normalizedEmail);
  const existing = await getDoc(ref);

  const data: AllowedUser = {
    email: normalizedEmail,
    enabled: payload.enabled ?? true,
    role: payload.role ?? 'member',
    note: payload.note?.trim() || '',
    createdAt: existing.exists() ? (existing.data() as AllowedUser).createdAt : now,
    updatedAt: now,
    createdBy: existing.exists() ? (existing.data() as AllowedUser).createdBy : normalizeEmail(operatorEmail ?? normalizedEmail),
    updatedBy: normalizeEmail(operatorEmail ?? normalizedEmail),
  };

  await setDoc(ref, data, { merge: true });
  return data;
}

export async function deleteAllowedUser(email: string) {
  const db = getDb();
  if (!db) throw new Error('Firebase 未初始化');
  await deleteDoc(doc(db, COLLECTIONS.ALLOWED_USERS, normalizeEmail(email)));
}
