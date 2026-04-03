import React, { useState } from 'react';
import { LogIn, Loader2, Mail, Lock, AlertCircle, KeyRound } from 'lucide-react';
import { signIn, signInWithGoogle } from '../services/auth';
import { TEST_PIN, setPinBypass, isPinUiEnabled } from '../services/sandboxStore';

interface LoginProps {
  onSuccess?: () => void;
  externalError?: string;
}

const Login: React.FC<LoginProps> = ({ onSuccess, externalError }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loadingMethod, setLoadingMethod] = useState<'password' | 'google' | null>(null);
  const [error, setError] = useState('');
  const [pinInput, setPinInput] = useState('');
  const isDev = import.meta.env.DEV;
  const showPinBlock = isDev && isPinUiEnabled();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('請輸入 Email 與密碼');
      return;
    }
    setLoadingMethod('password');
    try {
      await signIn(email.trim(), password);
      onSuccess?.();
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setError('Email 或密碼錯誤');
      } else if (code === 'auth/invalid-email') {
        setError('Email 格式不正確');
      } else {
        setError(err?.message || '登入失敗');
      }
    } finally {
      setLoadingMethod(null);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoadingMethod('google');
    try {
      await signInWithGoogle();
      onSuccess?.();
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setError('已取消 Google 登入');
      } else if (code === 'auth/operation-not-allowed') {
        setError('Firebase 尚未啟用 Google 登入，請到 Authentication > Sign-in method 開啟 Google');
      } else if (code === 'auth/unauthorized-domain') {
        setError('目前網域尚未加入 Firebase 授權網域，請到 Authentication > Settings > Authorized domains 加入');
      } else {
        setError(err?.message || 'Google 登入失敗');
      }
    } finally {
      setLoadingMethod(null);
    }
  };

  /** 測試階段：PIN 正確則以 Sandbox 同源流程快速進入（僅 DEV） */
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!showPinBlock) return;
    if (pinInput.trim() !== TEST_PIN) {
      setError('PIN 錯誤');
      return;
    }
    setPinBypass(true);
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-lg border border-slate-200 p-8">
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center">
            <LogIn className="w-7 h-7 text-white" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-center text-slate-800 mb-1">教學組事務管理系統</h1>
        <p className="text-sm text-slate-500 text-center mb-6">請登入以繼續</p>

        {/* 測試階段：PIN 由系統設定開關控制，僅開發模式 */}
        {showPinBlock && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
            <p className="font-medium flex items-center gap-2">
              <KeyRound size={16} />
              測試階段快速登入
            </p>
            <p className="mt-1 text-amber-800">
              PIN 測試碼：<span className="font-mono font-bold tracking-widest select-all">{TEST_PIN}</span>
            </p>
            <form onSubmit={handlePinSubmit} className="mt-2 flex gap-2">
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="輸入 PIN"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 border border-amber-300 rounded-lg text-slate-800 placeholder:text-amber-600/50"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium whitespace-nowrap"
              >
                進入
              </button>
            </form>
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loadingMethod !== null}
          className="w-full mb-4 py-2.5 bg-white text-slate-700 font-medium rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-3"
        >
          {loadingMethod === 'google' ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <span className="w-5 h-5 rounded-full bg-white border border-slate-300 text-[11px] font-bold flex items-center justify-center">
              G
            </span>
          )}
          {loadingMethod === 'google' ? 'Google 登入中...' : '使用 Google 登入'}
        </button>

        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-slate-400">或使用 Email 登入</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none"
                autoComplete="email"
                disabled={loadingMethod !== null}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">密碼</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none"
                autoComplete="current-password"
                disabled={loadingMethod !== null}
              />
            </div>
          </div>
          {(externalError || error) && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">
              <AlertCircle size={18} className="flex-shrink-0" />
              <span>{externalError || error}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={loadingMethod !== null}
            className="w-full py-2.5 bg-slate-800 text-white font-medium rounded-lg hover:bg-slate-900 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loadingMethod === 'password' ? <Loader2 size={20} className="animate-spin" /> : <LogIn size={20} />}
            {loadingMethod === 'password' ? '登入中...' : '登入'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
