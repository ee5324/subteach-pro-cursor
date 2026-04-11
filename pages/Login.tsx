import React, { useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInAnonymously,
} from 'firebase/auth';
import { auth, googleProvider } from '../src/lib/firebase';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { LogIn, UserPlus, Mail, Lock, Loader2, KeyRound } from 'lucide-react';
import { isQuickLoginActive, verifyQuickLoginPin, setQuickLoginConfig } from '../utils/quickLoginStorage';
import { safePathAfterLogin } from '../utils/postLoginRedirect';

const Login: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [quickPin, setQuickPin] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const afterLoginPath = safePathAfterLogin(location.state);

  // 測試模式：網址帶 ?testPin=5012 時啟用 PIN、預填，並自動以該 PIN 匿名登入
  useEffect(() => {
    const testPin = searchParams.get('testPin');
    if (!testPin?.trim() || loading) return;
    setQuickLoginConfig({ enabled: true, pin: testPin.trim() });
    setQuickPin(testPin.trim());
    setError('');
    if (!verifyQuickLoginPin(testPin.trim())) return;
    if (!auth) {
      setError('Firebase 未初始化，無法登入。');
      return;
    }
    setLoading(true);
    signInAnonymously(auth)
      .then(() => navigate(afterLoginPath, { replace: true }))
      .catch((err: any) => {
        console.error('Anonymous auth failed', err);
        let msg = err?.message || '匿名登入失敗';
        if (err?.code === 'auth/operation-not-allowed') {
          msg = 'Firebase 尚未啟用匿名登入，請到 Firebase Console → Authentication → Sign-in method 開啟「匿名」。';
        }
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [searchParams, afterLoginPath, navigate]);

  const handleQuickAnonymousLogin = async (pinOverride?: string) => {
    const pinToUse = pinOverride ?? quickPin;
    if (!pinToUse.trim()) return;
    setQuickLoginConfig({ enabled: true, pin: pinToUse.trim() });
    if (!verifyQuickLoginPin(pinToUse)) {
      setError('PIN 錯誤');
      return;
    }
    setError('');
    if (!auth) {
      setError('Firebase 未初始化，無法登入。');
      return;
    }
    setLoading(true);
    try {
      await signInAnonymously(auth);
      navigate(afterLoginPath, { replace: true });
    } catch (err: any) {
      console.error('Anonymous auth failed', err);
      let msg = err.message || '匿名登入失敗';
      if (err.code === 'auth/operation-not-allowed') {
        msg = 'Firebase 尚未啟用匿名登入，請到 Firebase Console → Authentication → Sign-in method 開啟「匿名」。';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!auth) {
      setError("Firebase 未初始化，無法登入。");
      setLoading(false);
      return;
    }

    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate(afterLoginPath, { replace: true });
    } catch (err: any) {
      console.error("Auth failed", err);
      let msg = err.message;
      if (err.code === 'auth/invalid-email') msg = "Email 格式不正確";
      if (err.code === 'auth/user-not-found') msg = "找不到此使用者，請先註冊";
      if (err.code === 'auth/wrong-password') msg = "密碼錯誤";
      if (err.code === 'auth/email-already-in-use') msg = "此 Email 已被註冊";
      if (err.code === 'auth/weak-password') msg = "密碼強度不足 (至少 6 字元)";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);

    if (!auth) {
      setError("Firebase 未初始化，無法登入。");
      setLoading(false);
      return;
    }

    try {
      await signInWithPopup(auth, googleProvider);
      navigate(afterLoginPath, { replace: true });
    } catch (err: any) {
      console.error("Google auth failed", err);
      let msg = err.message;
      if (err.code === 'auth/popup-closed-by-user') msg = "Google 登入視窗已關閉。";
      if (err.code === 'auth/popup-blocked') msg = "瀏覽器阻擋了登入視窗，請允許彈出視窗後重試。";
      if (err.code === 'auth/cancelled-popup-request') msg = "登入流程已取消，請再試一次。";
      if (err.code === 'auth/operation-not-allowed') msg = "Firebase 尚未啟用 Google 登入，請先到 Firebase Console 開啟。";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">代課管理系統</h1>
          <p className="text-slate-500 mt-2">
            {isRegistering ? '註冊新帳號' : '登入系統以繼續'}
          </p>
        </div>
        
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-6 text-sm flex items-start">
            <span className="mr-2">⚠️</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                placeholder="name@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">密碼</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                placeholder="••••••••"
                minLength={6}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-2.5 px-4 rounded-lg font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed mt-6"
          >
            {loading ? (
              <Loader2 className="animate-spin mr-2" size={20} />
            ) : isRegistering ? (
              <UserPlus className="mr-2" size={20} />
            ) : (
              <LogIn className="mr-2" size={20} />
            )}
            {loading ? '處理中...' : isRegistering ? '註冊帳號' : '登入'}
          </button>
        </form>

        {!isRegistering && isQuickLoginActive() && (
          <div className="mb-6 p-4 rounded-lg border border-amber-200 bg-amber-50">
            <p className="text-xs font-medium text-amber-800 mb-2 flex items-center gap-1">
              <KeyRound size={14} />
              測試用快速進入（PIN 正確後以匿名身分登入）
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={quickPin}
                onChange={(e) => setQuickPin(e.target.value.replace(/\D/g, ''))}
                placeholder="輸入 PIN"
                className="flex-1 px-3 py-2 border border-amber-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
              />
              <button
                type="button"
                disabled={loading || !quickPin}
                onClick={handleQuickAnonymousLogin}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                快速進入
              </button>
            </div>
          </div>
        )}

        {!isRegistering && (
          <>
            <div className="my-6 flex items-center">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="px-3 text-xs text-slate-400">或</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full border border-slate-300 bg-white text-slate-700 py-2.5 px-4 rounded-lg font-semibold hover:bg-slate-50 transition-colors flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="animate-spin mr-2" size={20} />
              ) : (
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M21.6 12.23c0-.68-.06-1.34-.17-1.97H12v3.73h5.39a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.98-4.33 2.98-7.28z"/>
                  <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.44l-3.23-2.5c-.9.6-2.05.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22z"/>
                  <path fill="#FBBC05" d="M6.41 13.9A6 6 0 0 1 6.1 12c0-.66.11-1.3.31-1.9V7.5H3.07A10 10 0 0 0 2 12c0 1.61.39 3.14 1.07 4.5l3.34-2.6z"/>
                  <path fill="#EA4335" d="M12 5.98c1.47 0 2.8.5 3.84 1.5l2.88-2.88C16.95 2.98 14.7 2 12 2A10 10 0 0 0 3.07 7.5l3.34 2.6C7.2 7.74 9.4 5.98 12 5.98z"/>
                </svg>
              )}
              使用 Google 登入
            </button>
          </>
        )}

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
            }}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium hover:underline"
          >
            {isRegistering ? '已有帳號？點此登入' : '沒有帳號？點此註冊'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
