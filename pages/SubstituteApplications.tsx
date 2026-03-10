/**
 * 代課教師報名審核 — 主系統內管理對外表單送來的報名：檢視、刪除、審核通過並建立教師／加入人力庫
 */
import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { SubstituteApplication as AppType } from '../types';
import {
  UserPlus, Trash2, CheckCircle, XCircle, Phone, BookOpen, Award, MessageCircle,
  Search, Loader2, ExternalLink, UserCheck, AlertCircle,
} from 'lucide-react';
import Modal, { ModalType } from '../components/Modal';
import InstructionPanel from '../components/InstructionPanel';

const statusMap: Record<string, { label: string; className: string }> = {
  pending: { label: '待審核', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  approved: { label: '已通過', className: 'bg-green-100 text-green-700 border-green-200' },
  rejected: { label: '已拒絕', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const SubstituteApplications: React.FC = () => {
  const {
    substituteApplications,
    deleteSubstituteApplication,
    approveSubstituteApplication,
    teachers,
    subPool,
  } = useAppStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'pending' | 'approved' | 'rejected'>('pending');
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: ModalType }>({
    isOpen: false, title: '', message: '', type: 'info',
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = substituteApplications;
    if (statusFilter !== 'ALL') list = list.filter(a => a.status === statusFilter);
    const term = searchTerm.toLowerCase().trim();
    if (term) {
      list = list.filter(a =>
        a.name.toLowerCase().includes(term) ||
        (a.phone && a.phone.includes(term)) ||
        (a.lineAccount && a.lineAccount.toLowerCase().includes(term)) ||
        (a.graduationMajor && a.graduationMajor.toLowerCase().includes(term)) ||
        (a.teachingItems && a.teachingItems.some(t => t.toLowerCase().includes(term))),
      );
    }
    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [substituteApplications, statusFilter, searchTerm]);

  const handleDelete = async (app: AppType) => {
    if (!confirm(`確定要刪除「${app.name}」的報名資料？此操作無法復原。`)) return;
    setActionLoading(app.id);
    try {
      await deleteSubstituteApplication(app.id);
      setModal({ isOpen: true, title: '已刪除', message: '該筆報名已刪除。', type: 'success' });
    } catch (e: any) {
      setModal({ isOpen: true, title: '刪除失敗', message: e?.message || '請稍後再試。', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async (app: AppType, addToSubPool: boolean) => {
    setActionLoading(app.id);
    try {
      const { teacherId } = await approveSubstituteApplication(app.id, { addToSubPool });
      const inPool = subPool.some(s => s.teacherId === teacherId);
      setModal({
        isOpen: true,
        title: '審核通過',
        message: `已建立教師「${app.name}」並${addToSubPool && inPool ? '已加入代課人力庫。' : '未加入人力庫。'}`,
        type: 'success',
      });
    } catch (e: any) {
      setModal({ isOpen: true, title: '審核失敗', message: e?.message || '請稍後再試。', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const pendingCount = substituteApplications.filter(a => a.status === 'pending').length;

  return (
    <div className="p-8 pb-32">
      <Modal isOpen={modal.isOpen} onClose={() => setModal({ ...modal, isOpen: false })} title={modal.title} message={modal.message} type={modal.type} />

      <header className="mb-6">
        <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
          <UserPlus className="text-indigo-600" size={28} />
          代課教師報名審核
        </h1>
        <p className="text-slate-500 mt-2">
          管理對外報名表單送來的代課教師資料：審核通過可建立教師並加入代課人力庫，或刪除不需保留的報名。
        </p>
      </header>

      <InstructionPanel title="使用說明">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li><strong>對外報名頁：</strong>可將報名表單網址（/apply）提供給代課教師填寫，該頁面不連回主系統。</li>
          <li><strong>審核通過：</strong>會自動建立一筆「校外教師」並可選擇是否加入代課人力庫；姓名、電話、畢業科系、有無教師證、LINE 會帶入教師與備註。</li>
          <li><strong>刪除：</strong>僅刪除報名紀錄，不影響已建立的教師或人力庫。</li>
        </ul>
      </InstructionPanel>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="搜尋姓名、電話、LINE、科系..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['pending', 'approved', 'rejected', 'ALL'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                statusFilter === s
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {s === 'ALL' ? '全部' : statusMap[s]?.label || s}
              {s === 'pending' && pendingCount > 0 && (
                <span className="ml-1 bg-amber-400 text-white text-xs px-1.5 rounded-full">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-700">姓名</th>
                <th className="px-4 py-3 font-semibold text-slate-700">電話</th>
                <th className="px-4 py-3 font-semibold text-slate-700">學歷／系所</th>
                <th className="px-4 py-3 font-semibold text-slate-700 text-center w-16">教師證</th>
                <th className="px-4 py-3 font-semibold text-slate-700 text-center w-16">學程</th>
                <th className="px-4 py-3 font-semibold text-slate-700 max-w-[140px]">可／不可代課時段</th>
                <th className="px-4 py-3 font-semibold text-slate-700 max-w-[180px]">任教項目</th>
                <th className="px-4 py-3 font-semibold text-slate-700">LINE</th>
                <th className="px-4 py-3 font-semibold text-slate-700">狀態</th>
                <th className="px-4 py-3 font-semibold text-slate-700">送件時間</th>
                <th className="px-4 py-3 font-semibold text-slate-700 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((app) => {
                const statusInfo = statusMap[app.status] || statusMap.pending;
                const isBusy = actionLoading === app.id;
                const teacher = app.teacherId ? teachers.find(t => t.id === app.teacherId) : null;
                const inPool = app.teacherId && subPool.some(s => s.teacherId === app.teacherId);
                return (
                  <tr key={app.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{app.name}</td>
                    <td className="px-4 py-3 text-slate-600">{app.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {[app.educationLevel, app.graduationMajor].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {app.hasCertificate === true ? (
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-700" title="有教師證"><Award size={16} /></span>
                      ) : app.hasCertificate === false ? (
                        <span className="text-slate-400 text-xs">無</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600 text-xs">
                      {app.hasEducationCredential === true ? '有' : app.hasEducationCredential === false ? '無' : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs max-w-[140px]">
                      <div className="space-y-0.5">
                        {app.unavailableTime ? <div title="無法代課">不可：{app.unavailableTime}</div> : null}
                        {app.availableTime ? <div title="可代課">可：{app.availableTime}</div> : null}
                        {!app.unavailableTime && !app.availableTime && '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[180px]">
                      {app.teachingItems && app.teachingItems.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {app.teachingItems.slice(0, 5).map(t => (
                            <span key={t} className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px]">{t}</span>
                          ))}
                          {app.teachingItems.length > 5 && <span className="text-[10px] text-slate-400">+{app.teachingItems.length - 5}</span>}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{app.lineAccount || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                      {app.teacherId && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          {teacher ? '已建教師' : ''}
                          {inPool && ' · 人力庫'}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-sm">
                      {app.createdAt
                        ? new Date(app.createdAt).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {app.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleApprove(app, true)}
                            disabled={isBusy}
                            className="text-green-600 hover:text-green-800 p-1.5 mr-1 rounded hover:bg-green-50 disabled:opacity-50"
                            title="審核通過並加入代課人力庫"
                          >
                            {isBusy ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApprove(app, false)}
                            disabled={isBusy}
                            className="text-indigo-600 hover:text-indigo-800 p-1.5 mr-1 rounded hover:bg-indigo-50 disabled:opacity-50"
                            title="審核通過（僅建立教師，不加入人力庫）"
                          >
                            {isBusy ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(app)}
                        disabled={isBusy}
                        className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 disabled:opacity-50"
                        title="刪除報名"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="px-6 py-12 text-center text-slate-400">
            <AlertCircle size={32} className="mx-auto mb-2 opacity-50" />
            <p>{statusFilter === 'ALL' ? '尚無任何報名資料' : `沒有${statusMap[statusFilter]?.label || statusFilter}的報名`}</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
        <ExternalLink size={16} />
        <span>對外報名表單網址：</span>
        <code className="bg-slate-100 px-2 py-1 rounded text-xs break-all">
          {typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}#/apply` : '#/apply'}
        </code>
        <button
          type="button"
          onClick={() => {
            const url = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}#/apply` : '#/apply';
            navigator.clipboard?.writeText(url).then(() => setModal({ isOpen: true, title: '已複製', message: '報名網址已複製到剪貼簿。', type: 'success' }));
          }}
          className="text-indigo-600 hover:underline text-xs"
        >
          複製
        </button>
      </div>
    </div>
  );
};

export default SubstituteApplications;
