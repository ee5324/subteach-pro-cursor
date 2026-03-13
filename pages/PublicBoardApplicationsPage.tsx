/**
 * 公開缺額報名清單 — 後台檢視從 #/public 送出的應徵資料
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { PublicBoardApplication } from '../types';
import { Teacher, TeacherType } from '../types';
import { db } from '../src/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Globe, Phone, User, Trash2, Loader2, Calendar, CheckCircle } from 'lucide-react';
import Modal from '../components/Modal';

export default function PublicBoardApplicationsPage() {
  const { publicBoardApplications, deletePublicBoardApplication, teachers, addTeacher } = useAppStore();
  const [vacancyLabels, setVacancyLabels] = useState<Record<string, string>>({});
  const [loadingLabels, setLoadingLabels] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<PublicBoardApplication | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  /** 確定按鈕：對應結果或新增名單提示 */
  const [confirmModal, setConfirmModal] = useState<{
    app: PublicBoardApplication;
    matchedTeacher?: Teacher;
    adding?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!db) {
      setLoadingLabels(false);
      return;
    }
    let mounted = true;
    getDoc(doc(db, 'publicBoard', 'vacancies'))
      .then((snap) => {
        if (!mounted) return;
        const data = snap.exists() ? snap.data() : null;
        const raw = data?.vacancies;
        const map: Record<string, string> = {};
        if (Array.isArray(raw)) {
          raw.forEach((v: Record<string, unknown>, i: number) => {
            const id = String(v.id ?? `v-${i}`);
            const teacher = String(v.originalTeacherName ?? '');
            const date = String(v.date ?? '');
            const period = String(v.period ?? '');
            const subject = String(v.subject ?? '');
            const cls = String(v.className ?? '');
            map[id] = `${teacher} ${date} 第${period}節 ${subject} ${cls}`.trim() || id;
          });
        }
        setVacancyLabels(map);
      })
      .catch(() => setVacancyLabels({}))
      .finally(() => { if (mounted) setLoadingLabels(false); });
    return () => { mounted = false; };
  }, []);

  const sorted = useMemo(() => {
    const list = [...publicBoardApplications].sort((a, b) => b.createdAt - a.createdAt);
    const term = searchTerm.toLowerCase().trim();
    if (!term) return list;
    return list.filter(
      (a) =>
        a.name.toLowerCase().includes(term) ||
        (a.phone && a.phone.includes(term)) ||
        (a.note && a.note.toLowerCase().includes(term)) ||
        (vacancyLabels[a.vacancyId] || a.vacancyId).toLowerCase().includes(term)
    );
  }, [publicBoardApplications, searchTerm, vacancyLabels]);

  const handleDelete = async (app: PublicBoardApplication) => {
    setActionLoading(app.id);
    try {
      await deletePublicBoardApplication(app.id);
      setDeleteConfirm(null);
    } finally {
      setActionLoading(null);
    }
  };

  /** 確定：對照教師名單，相符則顯示已對應，不符則提示可新增至名單 */
  const handleConfirm = (app: PublicBoardApplication) => {
    const nameTrim = app.name.trim();
    const matched = teachers.find((t) => t.name.trim() === nameTrim);
    if (matched) {
      setConfirmModal({ app, matchedTeacher: matched });
    } else {
      setConfirmModal({ app });
    }
  };

  const handleAddToTeachers = async () => {
    if (!confirmModal?.app) return;
    setActionLoading(confirmModal.app.id);
    try {
      const name = confirmModal.app.name.trim();
      const id = name || `pb-${confirmModal.app.id}`;
      const newTeacher: Teacher = {
        id,
        name,
        type: TeacherType.INTERNAL,
        hasCertificate: false,
        isRetired: false,
        isSpecialEd: false,
        isGraduatingHomeroom: false,
        baseSalary: 0,
        researchFee: 0,
        isHomeroom: false,
        phone: confirmModal.app.phone || undefined,
        note: '由公開缺額報名新增',
      };
      await addTeacher(newTeacher);
      setConfirmModal(null);
    } finally {
      setActionLoading(null);
    }
  };

  const formatTime = (ts: number) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' });
  };

  return (
    <div className="p-6 md:p-8">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center">
            <Globe size={26} className="mr-2 text-indigo-600" />
            公開缺額報名
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            老師從「代課缺額公告」頁面送出的應徵資料，依報名時間由新到舊排列
          </p>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="搜尋姓名、電話、備註、缺額..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loadingLabels && publicBoardApplications.length > 0 ? (
          <div className="p-8 flex items-center justify-center text-slate-400">
            <Loader2 size={24} className="animate-spin mr-2" /> 載入缺額對照中...
          </div>
        ) : publicBoardApplications.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Calendar size={48} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium">尚無公開缺額報名紀錄</p>
            <p className="text-sm mt-1">老師在「代課缺額公告」頁選缺額並填寫姓名、電話送出後，會顯示於此。</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-8 text-center text-slate-500">搜尋無符合結果</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">報名時間</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">缺額</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">姓名</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">電話</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">備註</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 text-right w-36">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sorted.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatTime(app.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate" title={vacancyLabels[app.vacancyId] || app.vacancyId}>
                      {vacancyLabels[app.vacancyId] || app.vacancyId || '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{app.name}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {app.phone ? <a href={`tel:${app.phone}`} className="text-indigo-600 hover:underline flex items-center gap-1"><Phone size={14} /> {app.phone}</a> : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate" title={app.note || ''}>{app.note || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleConfirm(app)}
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="對照教師名單／確定"
                        >
                          <CheckCircle size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(app)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="刪除此筆報名"
                        >
                          <Trash2 size={18} />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={deleteConfirm ? () => handleDelete(deleteConfirm) : undefined}
        title="刪除報名紀錄"
        message={deleteConfirm ? `確定要刪除「${deleteConfirm.name}」的這筆報名嗎？` : ''}
        type="warning"
        mode="confirm"
        confirmText="刪除"
        cancelText="取消"
      />

      {/* 確定：已對應教師 或 提示新增名單 */}
      <Modal
        isOpen={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        onConfirm={confirmModal && !confirmModal.matchedTeacher ? handleAddToTeachers : undefined}
        title={confirmModal?.matchedTeacher ? '已對應教師' : '未在教師名單中'}
        message={
          confirmModal
            ? confirmModal.matchedTeacher
              ? `「${confirmModal.app.name}」已對應至教師名單：${confirmModal.matchedTeacher.name}。`
              : `「${confirmModal.app.name}」目前不在教師名單中。若要將此人加入教師管理，請點「新增至教師名單」。`
            : ''
        }
        type={confirmModal?.matchedTeacher ? 'success' : 'info'}
        mode={confirmModal && !confirmModal.matchedTeacher ? 'confirm' : 'alert'}
        confirmText={confirmModal && !confirmModal.matchedTeacher ? '新增至教師名單' : undefined}
        cancelText={confirmModal?.matchedTeacher ? undefined : '關閉'}
      />

      {actionLoading && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <Loader2 size={32} className="animate-spin text-white" />
        </div>
      )}
    </div>
  );
}
