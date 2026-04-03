import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldCheck, UserPlus, UserX, KeyRound } from 'lucide-react';
import type { AllowedUser } from '../types';
import { deleteAllowedUser, listAllowedUsers, saveAllowedUser } from '../services/allowedUsers';

interface AllowedUsersManagerProps {
  currentUserEmail?: string | null;
  canManage: boolean;
}

const AllowedUsersManager: React.FC<AllowedUsersManagerProps> = ({ currentUserEmail, canManage }) => {
  const [items, setItems] = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [note, setNote] = useState('');

  const normalizedCurrentUserEmail = useMemo(
    () => currentUserEmail?.trim().toLowerCase() ?? '',
    [currentUserEmail],
  );

  const loadUsers = async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const data = await listAllowedUsers();
      setItems(data);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || '無法讀取白名單' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [canManage]);

  const handleAdd = async () => {
    if (!email.trim()) {
      setMessage({ type: 'error', text: '請輸入要加入白名單的 Google 帳號' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await saveAllowedUser(
        {
          email,
          role,
          enabled: true,
          note,
        },
        normalizedCurrentUserEmail,
      );
      setEmail('');
      setRole('member');
      setNote('');
      setMessage({ type: 'success', text: '白名單已更新' });
      await loadUsers();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || '新增白名單失敗' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (item: AllowedUser) => {
    setSaving(true);
    setMessage(null);
    try {
      await saveAllowedUser(
        {
          ...item,
          enabled: !item.enabled,
        },
        normalizedCurrentUserEmail,
      );
      setMessage({ type: 'success', text: '權限狀態已更新' });
      await loadUsers();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || '更新失敗' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRole = async (item: AllowedUser) => {
    if (item.email === normalizedCurrentUserEmail && item.role === 'admin') {
      setMessage({ type: 'error', text: '目前登入的管理員不可直接降為一般成員，避免把自己鎖在外面。' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await saveAllowedUser(
        {
          ...item,
          role: item.role === 'admin' ? 'member' : 'admin',
        },
        normalizedCurrentUserEmail,
      );
      setMessage({ type: 'success', text: '角色已更新' });
      await loadUsers();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || '更新角色失敗' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: AllowedUser) => {
    if (item.email === normalizedCurrentUserEmail) {
      setMessage({ type: 'error', text: '不可刪除目前登入的管理員帳號。' });
      return;
    }
    if (!confirm(`確定要移除 ${item.email} 的白名單權限？`)) return;

    setSaving(true);
    setMessage(null);
    try {
      await deleteAllowedUser(item.email);
      setMessage({ type: 'success', text: '白名單已移除' });
      await loadUsers();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || '刪除白名單失敗' });
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-600">
        只有白名單中的管理員可管理登入名單。若你需要權限，請請現有管理員協助加入。
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <h4 className="font-semibold text-slate-900 flex items-center gap-2">
          <UserPlus size={16} />
          新增白名單帳號
        </h4>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="md:col-span-2 border border-slate-300 rounded-lg px-3 py-2"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
            className="border border-slate-300 rounded-lg px-3 py-2 bg-white"
          >
            <option value="member">一般成員</option>
            <option value="admin">管理員</option>
          </select>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="備註（選填）"
            className="md:col-span-2 border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
          加入白名單
        </button>
      </div>

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h4 className="font-semibold text-slate-900 flex items-center gap-2">
            <ShieldCheck size={16} />
            目前白名單
          </h4>
          {loading && <Loader2 size={16} className="animate-spin text-slate-500" />}
        </div>
        <div className="divide-y divide-slate-200">
          {items.length === 0 && !loading && (
            <div className="px-4 py-6 text-sm text-slate-500">
              尚未建立任何白名單帳號。請先在 Firebase Console 手動建立第一位管理員後，再回來系統內管理。
            </div>
          )}
          {items.map((item) => (
            <div key={item.email} className="px-4 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{item.email}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      item.role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {item.role === 'admin' ? '管理員' : '一般成員'}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      item.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {item.enabled ? '啟用中' : '已停用'}
                  </span>
                </div>
                {item.note && <p className="mt-1 text-sm text-slate-500">{item.note}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleEnabled(item)}
                  disabled={saving}
                  className="px-3 py-1.5 text-sm rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                >
                  {item.enabled ? '停用' : '啟用'}
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleRole(item)}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50"
                >
                  <KeyRound size={14} />
                  改成{item.role === 'admin' ? '一般成員' : '管理員'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                >
                  <UserX size={14} />
                  移除
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AllowedUsersManager;
