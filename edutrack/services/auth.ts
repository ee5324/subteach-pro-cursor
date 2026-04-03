/**
 * Firebase Authentication：登入 / 登出 / 監聽登入狀態
 */
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  type User,
} from 'firebase/auth';
import { getAuthInstance } from './firebase';
import { isSandbox } from './sandboxStore';

export function getCurrentUser(): User | null {
  if (isSandbox()) return null;
  const auth = getAuthInstance();
  return auth?.currentUser ?? null;
}

export function signIn(email: string, password: string) {
  const auth = getAuthInstance();
  if (!auth) throw new Error('Firebase Auth 未初始化');
  return signInWithEmailAndPassword(auth, email, password);
}

export function signInWithGoogle() {
  const auth = getAuthInstance();
  if (!auth) throw new Error('Firebase Auth 未初始化');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}

export function signOut() {
  const auth = getAuthInstance();
  if (!auth) return Promise.resolve();
  return firebaseSignOut(auth);
}

export function onAuthStateChanged(callback: (user: User | null) => void): (() => void) | undefined {
  if (isSandbox()) {
    callback(null);
    return undefined;
  }
  const auth = getAuthInstance();
  if (!auth) {
    callback(null);
    return undefined;
  }
  return firebaseOnAuthStateChanged(auth, callback);
}
