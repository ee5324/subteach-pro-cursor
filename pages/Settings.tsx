
// pages/Settings.tsx

import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { GAS_WEB_APP_URL } from '../config';
import { getQuickLoginConfig, setQuickLoginConfig } from '../utils/quickLoginStorage';
import { Settings as SettingsIcon, Calendar, Trash2, Plus, Wifi, Save, AlertCircle, CloudUpload, Loader2, BookOpen, Database, Download, Link2, Copy, KeyRound, ShieldCheck, UserPlus, Users, FileDown, Printer, ChevronDown, ChevronUp, Layers, Edit2, CheckCircle, CloudDownload, Calculator } from 'lucide-react';
import Modal, { ModalType, ModalMode } from '../components/Modal';
import InstructionPanel, { CollapsibleItem } from '../components/InstructionPanel';
import { TeacherType, SalaryGrade, SemesterDefinition } from '../types';

/** 匯出／列印教師名單：類別排序（校內 → 校外 → 語言），同類別內依姓名 */
const TEACHER_TYPE_SORT_ORDER: Record<string, number> = {
  [TeacherType.INTERNAL]: 0,
  [TeacherType.EXTERNAL]: 1,
  [TeacherType.LANGUAGE]: 2,
};

const Settings: React.FC = () => {
  const {
    holidays,
    addHoliday,
    removeHoliday,
    settings,
    updateSettings,
    loadFromGas,
    migrateToFirebase,
    isSubteachAdmin,
    subteachAllowedUsers,
    addSubteachAllowedUser,
    updateSubteachAllowedUser,
    removeSubteachAllowedUser,
    teachers,
    salaryGrades,
    upsertSalaryGrades,
    seedSalaryGradesFromBuiltIn,
    semesters,
    activeSemesterId,
    addSemester,
    updateSemester,
    removeSemester,
    setSemesterActive,
  } = useAppStore();
  const [newHoliday, setNewHoliday] = useState('');
  const [whitelistEmail, setWhitelistEmail] = useState('');
  const [whitelistRole, setWhitelistRole] = useState<'admin' | 'user'>('user');
  const [whitelistSaving, setWhitelistSaving] = useState(false);
  const [tempUrl, setTempUrl] = useState(settings.gasWebAppUrl);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [migrationStatus, setMigrationStatus] = useState<'idle' | 'loading' | 'migrating' | 'success' | 'error'>('idle');
  const [salaryPanelOpen, setSalaryPanelOpen] = useState(false);
  const [salarySaving, setSalarySaving] = useState(false);
  const [salaryRows, setSalaryRows] = useState<SalaryGrade[]>([]);

  // PIN 測試登入（本機 localStorage，登入頁讀取）
  const [quickLoginEnabled, setQuickLoginEnabled] = useState(() => getQuickLoginConfig().enabled);
  const [quickLoginPin, setQuickLoginPin] = useState(() => getQuickLoginConfig().pin);
  const [quickLoginSaved, setQuickLoginSaved] = useState(false);

  // Modal State
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: ModalType }>({
      isOpen: false, title: '', message: '', type: 'info'
  });
  const [deleteHolidayDate, setDeleteHolidayDate] = useState<string | null>(null);
  const [removeWhitelistEmail, setRemoveWhitelistEmail] = useState<string | null>(null);

  const [semesterBusy, setSemesterBusy] = useState(false);
  const [deleteSemesterId, setDeleteSemesterId] = useState<string | null>(null);
  const [newSemName, setNewSemName] = useState('');
  const [newSemStart, setNewSemStart] = useState('');
  const [newSemEnd, setNewSemEnd] = useState('');
  const [editingSemester, setEditingSemester] = useState<SemesterDefinition | null>(null);

  const sortedSemesters = useMemo(
    () => [...(semesters || [])].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '')),
    [semesters],
  );

  const activeSemesterLabel = useMemo(() => {
    if (!activeSemesterId) return null;
    const s = (semesters || []).find((x) => x.id === activeSemesterId);
    return s?.name || activeSemesterId;
  }, [activeSemesterId, semesters]);

  useEffect(() => {
    setSalaryRows(
      [...(salaryGrades || [])]
        .sort((a, b) => (a.points || 0) - (b.points || 0))
        .map((g) => ({
          id: String(g.id || g.points),
          points: Number(g.points) || 0,
          salary: Number(g.salary) || 0,
          researchFeeCertBachelor: Number(g.researchFeeCertBachelor || 0),
          researchFeeCertMaster: Number(g.researchFeeCertMaster || 0),
          researchFeeNoCertBachelor: Number(g.researchFeeNoCertBachelor || 0),
          researchFeeNoCertMaster: Number(g.researchFeeNoCertMaster || 0),
        })),
    );
  }, [salaryGrades]);

  const handleAddWhitelist = async () => {
    const email = whitelistEmail.trim().toLowerCase();
    if (!email) return;
    setWhitelistSaving(true);
    try {
      await addSubteachAllowedUser(email, whitelistRole);
      setWhitelistEmail('');
      setModal({ isOpen: true, title: '已加入白名單', message: `已將 ${email} 加入白名單。`, type: 'success' });
    } catch (e: any) {
      setModal({ isOpen: true, title: '加入失敗', message: e?.message || '請稍後再試', type: 'error' });
    } finally {
      setWhitelistSaving(false);
    }
  };

  const handleAddHoliday = () => {
    if (!newHoliday) return;
    addHoliday(newHoliday);
    setNewHoliday('');
  };

  const handleSaveSettings = () => {
      updateSettings({ ...settings, gasWebAppUrl: tempUrl });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleSaveDateSettings = (field: 'semesterStart' | 'semesterEnd' | 'graduationDate', value: string) => {
      updateSettings({ ...settings, [field]: value });
  };

  const handleAddSemester = async () => {
    const name = newSemName.trim();
    if (!name || !newSemStart || !newSemEnd) {
      setModal({ isOpen: true, title: '欄位不完整', message: '請填寫學期名稱、開始與結束日期。', type: 'warning' });
      return;
    }
    if (newSemEnd < newSemStart) {
      setModal({ isOpen: true, title: '日期有誤', message: '結束日期不可早於開始日期。', type: 'warning' });
      return;
    }
    setSemesterBusy(true);
    try {
      const sem: SemesterDefinition = {
        id: crypto.randomUUID(),
        name,
        startDate: newSemStart,
        endDate: newSemEnd,
      };
      await addSemester(sem);
      setNewSemName('');
      setNewSemStart('');
      setNewSemEnd('');
      setModal({
        isOpen: true,
        title: '已新增學期',
        message: `已新增「${name}」，並設為「全站預設課表綁定學期」。之後在教師管理編輯的預設週課表會存成這一學期的版本。`,
        type: 'success',
      });
    } catch (e: any) {
      setModal({ isOpen: true, title: '新增失敗', message: e?.message || '請稍後再試', type: 'error' });
    } finally {
      setSemesterBusy(false);
    }
  };

  const handleSaveEditedSemester = async () => {
    if (!editingSemester) return;
    const { name, startDate, endDate } = editingSemester;
    if (!name?.trim() || !startDate || !endDate) {
      setModal({ isOpen: true, title: '欄位不完整', message: '請填寫學期名稱與起迄日期。', type: 'warning' });
      return;
    }
    if (endDate < startDate) {
      setModal({ isOpen: true, title: '日期有誤', message: '結束日期不可早於開始日期。', type: 'warning' });
      return;
    }
    setSemesterBusy(true);
    try {
      await updateSemester({
        ...editingSemester,
        name: name.trim(),
        startDate,
        endDate,
      });
      setEditingSemester(null);
      setModal({ isOpen: true, title: '已儲存', message: '學期資料已更新。', type: 'success' });
    } catch (e: any) {
      setModal({ isOpen: true, title: '儲存失敗', message: e?.message || '請稍後再試', type: 'error' });
    } finally {
      setSemesterBusy(false);
    }
  };

  const handleSetActiveSemester = async (id: string) => {
    setSemesterBusy(true);
    try {
      await setSemesterActive(id);
      setModal({
        isOpen: true,
        title: '已切換綁定學期',
        message:
          '「全站預設課表綁定學期」已更新。接下來教師管理、代課帶入課表、超鐘點清冊、固定兼課與相關計算，都會改用新學期底下已儲存的版本（與該學期預設課表一致）。',
        type: 'success',
      });
    } catch (e: any) {
      setModal({ isOpen: true, title: '切換失敗', message: e?.message || '請稍後再試', type: 'error' });
    } finally {
      setSemesterBusy(false);
    }
  };

  const handleClearActiveSemester = async () => {
    setSemesterBusy(true);
    try {
      await setSemesterActive('');
      setModal({
        isOpen: true,
        title: '已取消綁定',
        message:
          '已取消「依學期分版」。教師預設課表只會存在單一欄位，全學年／全學期共用同一版（舊資料相容模式）。',
        type: 'success',
      });
    } catch (e: any) {
      setModal({ isOpen: true, title: '操作失敗', message: e?.message || '請稍後再試', type: 'error' });
    } finally {
      setSemesterBusy(false);
    }
  };

  const handleSalaryCellChange = (idx: number, field: keyof SalaryGrade, value: number) => {
    setSalaryRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: Number(value) || 0 } : r)));
  };

  const handleAddSalaryRow = () => {
    setSalaryRows((prev) => [
      ...prev,
      {
        id: `tmp_${Date.now()}`,
        points: 0,
        salary: 0,
        researchFeeCertBachelor: 0,
        researchFeeCertMaster: 0,
        researchFeeNoCertBachelor: 0,
        researchFeeNoCertMaster: 0,
      },
    ]);
  };

  const handleRemoveSalaryRow = (idx: number) => {
    setSalaryRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveSalaryGrades = async () => {
    const normalized = salaryRows
      .map((r) => ({ ...r, id: String(r.points), points: Number(r.points) || 0 }))
      .filter((r) => r.points > 0)
      .sort((a, b) => a.points - b.points);
    const duplicateCheck = new Set<number>();
    for (const row of normalized) {
      if (duplicateCheck.has(row.points)) {
        setModal({ isOpen: true, title: '儲存失敗', message: `俸點 ${row.points} 重複，請先修正。`, type: 'error' });
        return;
      }
      duplicateCheck.add(row.points);
    }
    setSalarySaving(true);
    try {
      await upsertSalaryGrades(normalized);
      setModal({ isOpen: true, title: '儲存成功', message: '薪級級距表已更新。', type: 'success' });
    } catch (e: any) {
      setModal({ isOpen: true, title: '儲存失敗', message: e?.message || '請稍後再試', type: 'error' });
    } finally {
      setSalarySaving(false);
    }
  };

  const handleSeedSalaryGrades = async () => {
    setSalarySaving(true);
    try {
      const result = await seedSalaryGradesFromBuiltIn();
      setModal({
        isOpen: true,
        title: '匯入完成',
        message: `已新增 ${result.inserted} 筆俸點；略過既有 ${result.skipped} 筆。`,
        type: 'success',
      });
    } catch (e: any) {
      setModal({ isOpen: true, title: '匯入失敗', message: e?.message || '請稍後再試', type: 'error' });
    } finally {
      setSalarySaving(false);
    }
  };

  const handleLoadFromGas = async () => {
      if (!settings.gasWebAppUrl) {
          setModal({ isOpen: true, title: '錯誤', message: '請先設定 GAS Web App URL', type: 'error' });
          return;
      }
      setMigrationStatus('loading');
      try {
          const result = await loadFromGas();
          setModal({ isOpen: true, title: '載入成功', message: `成功載入 ${result.teacherCount} 位教師與 ${result.recordCount} 筆紀錄。請點擊「遷移至 Firebase」以儲存至雲端資料庫。`, type: 'success' });
          setMigrationStatus('idle');
      } catch (e: any) {
          setModal({ isOpen: true, title: '載入失敗', message: e.message, type: 'error' });
          setMigrationStatus('error');
      }
  };

  const handleMigrateToFirebase = async () => {
      setMigrationStatus('migrating');
      try {
          await migrateToFirebase();
          setModal({ isOpen: true, title: '遷移成功', message: '所有資料已成功寫入 Firebase 資料庫。', type: 'success' });
          setMigrationStatus('success');
      } catch (e: any) {
          setModal({ isOpen: true, title: '遷移失敗', message: e.message, type: 'error' });
          setMigrationStatus('error');
      }
  };

  const sortedHolidays = [...holidays].sort((a, b) => b.localeCompare(a));

  /** 與 store 內 loadFromGas 一致：設定有值用設定，否則用 config 預設 */
  const effectiveGasUrl = useMemo(
    () => (settings.gasWebAppUrl != null && String(settings.gasWebAppUrl).trim()) ? String(settings.gasWebAppUrl).trim() : (GAS_WEB_APP_URL || ''),
    [settings.gasWebAppUrl]
  );

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => setModal({ isOpen: true, title: '已複製', message: '網址已複製到剪貼簿。', type: 'success' }),
      () => setModal({ isOpen: true, title: '複製失敗', message: '無法寫入剪貼簿，請手動選取複製。', type: 'error' })
    );
  };

  const sortedTeachers = useMemo(() => {
    return [...(teachers || [])].sort((a, b) => {
      const typeA = String(a.type ?? '');
      const typeB = String(b.type ?? '');
      const orderA = TEACHER_TYPE_SORT_ORDER[typeA] ?? 99;
      const orderB = TEACHER_TYPE_SORT_ORDER[typeB] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      if (typeA !== typeB) return typeA.localeCompare(typeB, 'zh-TW');
      return (a.name || '').localeCompare(b.name || '', 'zh-TW');
    });
  }, [teachers]);

  const safeStr = (v: unknown) => (v == null ? '' : String(v).trim());

  const handleExportTeacherListCsv = () => {
    const headers = ['編號', '姓名', '職別', '電話', '任教科目', '任課班級', '類別'];
    const escape = (v: string | undefined) => (v == null ? '' : String(v).replace(/"/g, '""'));
    const row = (t: { name?: string; jobTitle?: string; phone?: string; subjects?: string; teachingClasses?: string; type?: string }, idx: number) =>
      [String(idx + 1), escape(t.name), escape(t.jobTitle), escape(t.phone), escape(t.subjects), escape(t.teachingClasses), escape(t.type)].map(c => `"${c}"`).join(',');
    const csv = '\uFEFF' + headers.join(',') + '\n' + sortedTeachers.map((t, i) => row(t, i)).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `學校教師名單_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintTeacherList = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const tableRows = sortedTeachers.map((t, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(safeStr(t.name))}</td>
        <td>${escapeHtml(safeStr(t.jobTitle))}</td>
        <td>${escapeHtml(safeStr(t.phone))}</td>
        <td>${escapeHtml(safeStr(t.subjects))}</td>
        <td>${escapeHtml(safeStr(t.teachingClasses))}</td>
        <td>${escapeHtml(safeStr(t.type))}</td>
      </tr>
    `).join('');
    win.document.write(`
      <!DOCTYPE html><html><head><meta charset="UTF-8"><title>學校教師名單</title>
      <style>body{font-family:sans-serif;padding:1rem;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #333;padding:6px 10px;text-align:left;} th{background:#eee;}</style>
      </head><body>
      <h1>學校教師名單</h1>
      <p>列印時間：${new Date().toLocaleString('zh-TW')}</p>
      <table>
        <thead><tr><th>編號</th><th>姓名</th><th>職別</th><th>電話</th><th>任教科目</th><th>任課班級</th><th>類別</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 250);
  };

  const escapeHtml = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  return (
    <div className="p-8 pb-32 max-w-4xl mx-auto">
      <Modal 
        isOpen={modal.isOpen} 
        onClose={() => setModal({ ...modal, isOpen: false })} 
        title={modal.title} 
        message={modal.message} 
        type={modal.type} 
      />
      <Modal
        isOpen={!!deleteHolidayDate}
        onClose={() => setDeleteHolidayDate(null)}
        onConfirm={() => { if (deleteHolidayDate) { removeHoliday(deleteHolidayDate); setDeleteHolidayDate(null); } }}
        title="確認移除假日"
        message={deleteHolidayDate ? `確定要將「${deleteHolidayDate}」從假日清單中移除嗎？` : ''}
        type="warning"
        mode="confirm"
        confirmText="移除"
        cancelText="取消"
      />
      <Modal
        isOpen={!!removeWhitelistEmail}
        onClose={() => setRemoveWhitelistEmail(null)}
        onConfirm={async () => {
          if (removeWhitelistEmail) {
            try {
              await removeSubteachAllowedUser(removeWhitelistEmail);
              setModal({ isOpen: true, title: '已移除', message: `已從白名單移除 ${removeWhitelistEmail}。`, type: 'success' });
            } catch (e: any) {
              setModal({ isOpen: true, title: '移除失敗', message: e?.message || '請稍後再試', type: 'error' });
            }
            setRemoveWhitelistEmail(null);
          }
        }}
        title="確認移除白名單"
        message={removeWhitelistEmail ? `確定要將「${removeWhitelistEmail}」從白名單移除？對方將無法再登入使用本系統。` : ''}
        type="warning"
        mode="confirm"
        confirmText="移除"
        cancelText="取消"
      />
      <Modal
        isOpen={!!deleteSemesterId}
        onClose={() => setDeleteSemesterId(null)}
        onConfirm={async () => {
          if (!deleteSemesterId) return;
          setSemesterBusy(true);
          try {
            await removeSemester(deleteSemesterId);
            setModal({ isOpen: true, title: '已刪除', message: '該學期已從清冊移除。', type: 'success' });
          } catch (e: any) {
            setModal({ isOpen: true, title: '刪除失敗', message: e?.message || '請稍後再試', type: 'error' });
          } finally {
            setSemesterBusy(false);
            setDeleteSemesterId(null);
          }
        }}
        title="確認刪除學期"
        message={
          deleteSemesterId
            ? `確定要刪除此學期？若教師曾在「這一學期」底下存過預設課表，那些資料仍會留在教師文件中，只是本清冊不再顯示這筆學期。`
            : ''
        }
        type="warning"
        mode="confirm"
        confirmText="刪除"
        cancelText="取消"
      />
      {editingSemester && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Edit2 size={20} className="text-indigo-600" />
              編輯學期
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">學期名稱</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={editingSemester.name}
                  onChange={(e) => setEditingSemester({ ...editingSemester, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">開始日期</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={editingSemester.startDate || ''}
                  onChange={(e) => setEditingSemester({ ...editingSemester, startDate: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">結束日期</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={editingSemester.endDate || ''}
                  onChange={(e) => setEditingSemester({ ...editingSemester, endDate: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6 justify-end">
              <button
                type="button"
                onClick={() => setEditingSemester(null)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={semesterBusy}
                onClick={() => void handleSaveEditedSemester()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {semesterBusy ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 flex items-center">
          <SettingsIcon className="mr-3 text-slate-600" />
          系統設定
        </h1>
        <p className="text-slate-500 mt-2">管理全域參數、連線設定與資料庫遷移</p>
      </header>

      <InstructionPanel title="使用說明：系統設定">
        <div className="space-y-1">
          <CollapsibleItem title="本頁各區塊與按鈕（圖示總覽）">
            <ul className="text-sm text-slate-700 space-y-3 list-none">
              <li>
                <span className="font-semibold text-slate-800 inline-flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-600 shrink-0" aria-hidden />
                  白名單管理
                </span>
                <ul className="mt-1.5 ml-1 space-y-1 text-slate-600 border-l-2 border-emerald-100 pl-3">
                  <li className="flex items-start gap-2">
                    <UserPlus size={15} className="text-emerald-600 shrink-0 mt-0.5" aria-hidden />
                    <span>加入白名單：輸入 Email、選擇角色（一般／管理員）後送出。</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Trash2 size={15} className="text-slate-400 shrink-0 mt-0.5" aria-hidden />
                    <span>列表「操作」欄：垃圾桶為從白名單移除；列上可切換啟用與編輯角色。</span>
                  </li>
                </ul>
              </li>
              <li>
                <span className="font-semibold text-slate-800 inline-flex items-center gap-2">
                  <BookOpen size={16} className="text-indigo-500 shrink-0" aria-hidden />
                  學期與重要日期設定
                </span>
                <p className="mt-1.5 ml-1 border-l-2 border-indigo-100 pl-3 text-slate-600">僅日期欄位，變更即寫入設定；影響固定兼課週數與畢業班超鐘點扣除等邏輯。</p>
              </li>
              <li>
                <span className="font-semibold text-slate-800 inline-flex items-center gap-2">
                  <Layers size={16} className="text-violet-600 shrink-0" aria-hidden />
                  學期清冊（預設課表綁定哪一學期）
                </span>
                <ul className="mt-1.5 ml-1 space-y-1 text-slate-600 border-l-2 border-violet-100 pl-3">
                  <li><strong>改為綁定此學期</strong>：全站預設週課表改讀寫該學期版本。</li>
                  <li className="inline-flex items-center gap-2"><Edit2 size={14} className="text-slate-500" aria-hidden /> <strong>編輯</strong>：修改學期名稱與起迄日。</li>
                  <li className="inline-flex items-center gap-2"><Trash2 size={14} className="text-red-500" aria-hidden /> <strong>刪除</strong>：自清冊移除該學期（教師曾存過的課表資料仍可能在文件中）。</li>
                  <li className="inline-flex items-center gap-2"><Plus size={14} className="text-violet-600" aria-hidden /> <strong>新增並設為綁定學期</strong>：建立新學期並設為目前綁定。</li>
                </ul>
              </li>
              <li>
                <span className="font-semibold text-slate-800 inline-flex items-center gap-2">
                  <Database size={16} className="text-cyan-600 shrink-0" aria-hidden />
                  俸點級距表（可編輯）
                </span>
                <ul className="mt-1.5 ml-1 space-y-1.5 text-slate-600 border-l-2 border-cyan-100 pl-3">
                  <li className="flex items-start gap-2">
                    <CloudDownload size={15} className="text-cyan-600 shrink-0 mt-0.5" aria-hidden />
                    <span>
                      <strong>第一次匯入既有俸點資料</strong>：將系統內建的預設俸點（目前為 150、190、200 三筆，含本俸與各類學術研究費欄位）<strong>只補上尚未存在</strong>的俸點列至 Firebase；已存在的俸點<strong>不會被覆寫</strong>。適用新站或表格空白時快速建立底稿，之後仍請以「儲存俸點表」維護完整級距。
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Plus size={15} className="text-slate-600 shrink-0 mt-0.5" aria-hidden />
                    <span>
                      <strong>新增俸點</strong>：在表末新增一列空白，可手動輸入俸點與金額。
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Save size={15} className="text-indigo-600 shrink-0 mt-0.5" aria-hidden />
                    <span>
                      <strong>儲存俸點表</strong>：將目前畫面上的級距寫入雲端；教師編輯頁、代課金額試算與「重算」功能皆依此表對照。
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Trash2 size={15} className="text-slate-400 shrink-0 mt-0.5" aria-hidden />
                    <span>每列右側垃圾桶：刪除該俸點列（儲存後才生效於資料庫）。</span>
                  </li>
                </ul>
              </li>
              <li>
                <span className="font-semibold text-slate-800 inline-flex items-center gap-2">
                  <Calendar size={16} className="text-rose-500 shrink-0" aria-hidden />
                  國定假日與補假設定
                </span>
                <ul className="mt-1.5 ml-1 space-y-1 text-slate-600 border-l-2 border-rose-100 pl-3">
                  <li className="flex items-start gap-2">
                    <Plus size={15} className="text-rose-500 shrink-0 mt-0.5" aria-hidden />
                    <span>選日期後按「加入清單」。</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Trash2 size={15} className="text-slate-400 shrink-0 mt-0.5" aria-hidden />
                    <span>列表中垃圾桶：移除該假日。</span>
                  </li>
                </ul>
              </li>
              <li>
                <span className="font-semibold text-slate-800 inline-flex items-center gap-2">
                  <Users size={16} className="text-slate-600 shrink-0" aria-hidden />
                  匯出學校教師名單
                </span>
                <ul className="mt-1.5 ml-1 space-y-1 text-slate-600 border-l-2 border-slate-200 pl-3">
                  <li className="flex items-start gap-2">
                    <FileDown size={15} className="text-slate-700 shrink-0 mt-0.5" aria-hidden />
                    <span><strong>下載 CSV</strong>：匯出目前教師管理名單。</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Printer size={15} className="text-slate-600 shrink-0 mt-0.5" aria-hidden />
                    <span><strong>列印此表</strong>：開新視窗供列印。</span>
                  </li>
                </ul>
              </li>
              <li>
                <span className="font-semibold text-slate-800 inline-flex items-center gap-2">
                  <KeyRound size={16} className="text-amber-600 shrink-0" aria-hidden />
                  PIN 測試登入
                </span>
                <p className="mt-1.5 ml-1 border-l-2 border-amber-100 pl-3 text-slate-600">勾選啟用、設定 PIN 後按「儲存 PIN」；設定僅存本機瀏覽器。</p>
              </li>
              <li>
                <span className="font-semibold text-slate-800 inline-flex items-center gap-2">
                  <Wifi size={16} className="text-slate-500 shrink-0" aria-hidden />
                  連線設定（GAS）
                </span>
                <ul className="mt-1.5 ml-1 space-y-1 text-slate-600 border-l-2 border-slate-200 pl-3">
                  <li className="flex items-start gap-2">
                    <Save size={15} className="text-slate-700 shrink-0 mt-0.5" aria-hidden />
                    <span>儲存 Web App URL。</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Copy size={15} className="text-indigo-600 shrink-0 mt-0.5" aria-hidden />
                    <span>複製目前使用的 GAS 網址或本頁網址。</span>
                  </li>
                </ul>
              </li>
              <li>
                <span className="font-semibold text-slate-800 inline-flex items-center gap-2">
                  <Database size={16} className="text-emerald-600 shrink-0" aria-hidden />
                  資料庫遷移（Firebase）
                </span>
                <ul className="mt-1.5 ml-1 space-y-1 text-slate-600 border-l-2 border-emerald-100 pl-3">
                  <li className="flex items-start gap-2">
                    <Download size={15} className="text-slate-600 shrink-0 mt-0.5" aria-hidden />
                    <span><strong>從 GAS 載入舊資料</strong>：自試算表預覽載入。</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CloudUpload size={15} className="text-emerald-600 shrink-0 mt-0.5" aria-hidden />
                    <span><strong>遷移至 Firebase</strong>：寫入雲端。</span>
                  </li>
                </ul>
              </li>
              <li>
                <span className="font-semibold text-slate-800 inline-flex items-center gap-2">
                  <Calculator size={16} className="text-indigo-600 shrink-0" aria-hidden />
                  懸浮計算機
                </span>
                <p className="mt-1.5 ml-1 border-l-2 border-indigo-100 pl-3 text-slate-600">
                  <strong>全站已登入頁面</strong>（含代課各頁與「教學組事務」內計畫專案／計畫代墊等）皆會顯示。預設以<strong>視窗右下角為錨點</strong>（展開、收合時角點不漂移）；左側直條或標題列可<strong>拖曳</strong>暫時改位置，<strong>重新整理頁面後會回到預設角點</strong>。點圓形圖示<strong>展開／收合</strong>。展開後算式欄可<strong>鍵盤輸入</strong>數字與 + − * / . ，Enter 計算、Esc
                  收合；焦點在算式欄或面板內按鈕時亦可用鍵盤。是否展開僅存於本機（鍵名 <code className="bg-slate-100 px-1 rounded text-xs">floatingCalculatorOpen</code>）。
                </p>
              </li>
            </ul>
          </CollapsibleItem>
          <CollapsibleItem title="學期與畢業日期設定">
            <p>設定學期開始與結束日期，這會影響「固定兼課」與「超鐘點」的計算週數。畢業典禮日期則用於自動扣除六年級導師畢業後的超鐘點節數。</p>
          </CollapsibleItem>
          <CollapsibleItem title="學期清冊：預設課表要依哪一學期分開存？">
            <p>
              這裡的<strong>「綁定學期」</strong>意思是：全站現在要以<strong>哪一個學期名義</strong>來讀寫每位教師的<strong>預設週課表</strong>（存在 Firestore{' '}
              <code className="bg-slate-100 px-1 rounded">system/metadata.activeSemesterId</code>
              ，對應 <code className="bg-slate-100 px-1 rounded">semesters</code> 裡的某一筆）。
            </p>
            <p className="mt-2">
              有綁定時：教師管理存檔會寫入該學期專用版本，代課登錄帶入課表、超鐘點實授節數、固定兼課與課表重疊判斷等也會跟著用<strong>同一學期</strong>底下的課表。
              未綁定時：全系統只認一份預設課表（傳統單一欄位），不區分學期。
            </p>
          </CollapsibleItem>
          <CollapsibleItem title="國定假日管理">
            <p>新增或移除國定假日與補假。系統在「精確模式計算」或「自動產生代課單」時會自動跳過這些日期，避免誤算代課費。</p>
          </CollapsibleItem>
          <CollapsibleItem title="PIN 測試登入">
            <p>在設定頁可開啟「PIN 測試登入」並設定 PIN；登入頁會顯示快速進入（匿名）。不需要時取消勾選即可關閉。設定存在本機瀏覽器，不會同步到其他電腦。</p>
          </CollapsibleItem>
          <CollapsibleItem title="Google Apps Script (GAS) 連線">
            <p><strong>日常資料</strong>（代課紀錄、教師、請假申請等）皆存於 <strong>Firebase</strong>，不需 GAS 即可正常使用。</p>
            <p><strong>需 GAS 的功能</strong>（請先設定 Web App URL 且連線成功）：代課清冊「產生報表／代課單／批次匯出」、超鐘點／固定超鐘點報表、客語／族語印領清冊、語言教師匯出、額外憑證、教師檔案上傳、從舊版試算表載入資料。詳見 <code>docs/資料存放與GAS功能說明.md</code>。</p>
          </CollapsibleItem>
          <CollapsibleItem title="資料遷移與備份">
            <p>若您有舊版試算表資料，請先設定 GAS URL，點擊「從 GAS 載入舊資料」進行預覽，確認無誤後再點擊「遷移至 Firebase」完成雲端化。</p>
          </CollapsibleItem>
          <CollapsibleItem title="Firebase 雲端儲存">
            <p>本系統使用 Firebase 雲端資料庫，所有變更都會即時同步至雲端。即使更換電腦，只要登入相同帳號即可存取最新資料。</p>
          </CollapsibleItem>
          <CollapsibleItem title="白名單（僅允許名單內帳號使用）">
            <p>僅加入白名單且已驗證 Email 的帳號可登入使用主系統。第一位管理員需在 Firebase Console 手動建立 <code>subteach_allowed_users/您的Email</code> 文件，欄位 <code>enabled: true</code>、<code>role: &quot;admin&quot;</code>；之後管理員可在「系統設定」的「白名單管理」區塊新增／編輯／移除其他帳號。</p>
          </CollapsibleItem>
        </div>
      </InstructionPanel>

      <div className="space-y-8">

        {/* 白名單管理：僅管理員可見 */}
        {isSubteachAdmin && (
          <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
              <ShieldCheck size={20} className="mr-2 text-emerald-600"/>
              白名單管理
            </h2>
            <p className="text-sm text-slate-600 mb-4">僅白名單內的帳號可登入使用本系統。第一位管理員請在 Firebase Console 手動建立 <code className="bg-slate-100 px-1 rounded">subteach_allowed_users/您的Email</code>，欄位 <code className="bg-slate-100 px-1 rounded">enabled: true</code>、<code className="bg-slate-100 px-1 rounded">role: &quot;admin&quot;</code>。</p>
            <div className="flex flex-wrap items-end gap-3 mb-6">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-bold text-slate-700 mb-1">Email（加入白名單）</label>
                <input
                  type="email"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="user@example.com"
                  value={whitelistEmail}
                  onChange={(e) => setWhitelistEmail(e.target.value)}
                />
              </div>
              <div className="w-32">
                <label className="block text-xs font-bold text-slate-700 mb-1">角色</label>
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={whitelistRole}
                  onChange={(e) => setWhitelistRole(e.target.value as 'admin' | 'user')}
                >
                  <option value="user">一般使用者</option>
                  <option value="admin">管理員</option>
                </select>
              </div>
              <button
                type="button"
                onClick={handleAddWhitelist}
                disabled={!whitelistEmail.trim() || whitelistSaving}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UserPlus size={18}/> {whitelistSaving ? '處理中…' : '加入白名單'}
              </button>
            </div>
            <div className="border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-600">Email</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">角色</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">啟用</th>
                    <th className="px-4 py-3 font-semibold text-slate-600 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {subteachAllowedUsers.map((u) => (
                    <tr key={u.email} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-slate-700">{u.email}</td>
                      <td className="px-4 py-3">
                        <select
                          className="px-2 py-1 border border-slate-200 rounded text-slate-700 bg-white"
                          value={u.role || 'user'}
                          onChange={(e) => updateSubteachAllowedUser(u.email, { role: e.target.value as 'admin' | 'user' })}
                        >
                          <option value="user">一般使用者</option>
                          <option value="admin">管理員</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={u.enabled}
                            onChange={(e) => updateSubteachAllowedUser(u.email, { enabled: e.target.checked })}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-slate-600">{u.enabled ? '啟用' : '停用'}</span>
                        </label>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setRemoveWhitelistEmail(u.email)}
                          className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors"
                          title="從白名單移除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {subteachAllowedUsers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-400">尚無白名單成員（請於 Firebase 手動建立第一位 admin）</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Semester & Graduation Settings Section */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                <BookOpen size={20} className="mr-2 text-indigo-500"/>
                學期與重要日期設定
            </h2>
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
                <p className="text-sm text-indigo-800 mb-3">此設定將影響「固定兼課」的學期週數計算及畢業班超鐘點扣除。</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-indigo-700 mb-1">學期開始日期</label>
                        <input 
                            type="date" 
                            className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={settings.semesterStart || ''}
                            onChange={(e) => handleSaveDateSettings('semesterStart', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-indigo-700 mb-1">學期結束日期</label>
                        <input 
                            type="date" 
                            className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={settings.semesterEnd || ''}
                            onChange={(e) => handleSaveDateSettings('semesterEnd', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-indigo-700 mb-1">畢業典禮日期 (影響六年級)</label>
                        <input 
                            type="date" 
                            className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={settings.graduationDate || ''}
                            onChange={(e) => handleSaveDateSettings('graduationDate', e.target.value)}
                        />
                    </div>
                </div>
            </div>
        </section>

        {/* 學期清冊：全站預設課表綁定哪一學期 */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center">
            <Layers size={20} className="mr-2 text-violet-600" />
            學期清冊（預設課表綁定哪一學期）
          </h2>
          <p className="text-sm text-slate-600 mb-3">
            <strong>白話說</strong>：現在全系統要以哪一個學期的「名分」，來編輯與使用每位老師的<strong>預設週課表</strong>，以及<strong>同一學期內</strong>的超鐘點與固定兼課設定。換學年／上下學期時，先<strong>改綁定學期</strong>，再在教師管理與超鐘點／固定兼課頁維護新學期版本，就不會蓋掉上一學期的資料。
          </p>
          <p className="text-xs text-slate-500 mb-4 border-l-2 border-violet-200 pl-3">
            會跟著綁定學期走的包含：教師管理預設課表、代課登錄帶入課表、超鐘點清冊（每月紀錄）、固定兼課名單與時段、超鐘點實授節數與重設、固定兼課與課表重疊判斷、公開課表同步等。
          </p>
          <div className="rounded-lg border border-violet-100 bg-violet-50/80 p-4 mb-4 text-sm text-violet-900 space-y-2">
            <div className="flex flex-wrap items-start gap-2">
              <CheckCircle size={18} className="text-violet-600 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-violet-950">目前全站預設課表綁定學期</div>
                <div className="text-base font-medium mt-1">{activeSemesterLabel || '（未指定 — 全系統共用單一版預設課表）'}</div>
              </div>
            </div>
            {!activeSemesterId && (
              <p className="text-xs text-violet-800/90 pl-7 border-t border-violet-100/80 pt-2">
                未指定時，沒有「依學期分開存」：所有人的預設課表只存在同一組欄位，適合尚未啟用多學期分版時使用。
              </p>
            )}
          </div>

          {isSubteachAdmin ? (
            <>
              <div className="border border-slate-200 rounded-lg overflow-hidden mb-6">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-600">學期名稱</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">起迄</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">預設課表</th>
                      <th className="px-4 py-3 font-semibold text-slate-600 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedSemesters.map((sem) => (
                      <tr key={sem.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-medium text-slate-800">{sem.name}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {sem.startDate} ~ {sem.endDate}
                        </td>
                        <td className="px-4 py-3">
                          {activeSemesterId === sem.id ? (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-800"
                              title="全系統讀寫預設週課表時，使用這一學期底下存的版本"
                            >
                              全站採用
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">其他學期</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                          {activeSemesterId !== sem.id && (
                            <button
                              type="button"
                              disabled={semesterBusy}
                              onClick={() => void handleSetActiveSemester(sem.id)}
                              className="text-xs px-2 py-1 rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                              title="之後編輯預設課表、代課帶課表等，都改讀寫這一學期的版本"
                            >
                              改為綁定此學期
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={semesterBusy}
                            onClick={() => setEditingSemester({ ...sem })}
                            className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            編輯
                          </button>
                          <button
                            type="button"
                            disabled={semesterBusy}
                            onClick={() => setDeleteSemesterId(sem.id)}
                            className="text-xs px-2 py-1 rounded-md text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            刪除
                          </button>
                        </td>
                      </tr>
                    ))}
                    {sortedSemesters.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                          尚無學期資料，請於下方新增。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-2 mb-6">
                <button
                  type="button"
                  disabled={semesterBusy || !activeSemesterId}
                  onClick={() => void handleClearActiveSemester()}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="取消依學期分版，改回全站只維護一份預設課表"
                >
                  取消學期綁定（共用單一課表）
                </button>
              </div>

              <div className="border border-dashed border-violet-200 rounded-lg p-4 bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <Plus size={16} className="text-violet-600" />
                  新增學期
                </h3>
                <p className="text-xs text-slate-500 mb-3">
                  新增後會自動成為<strong>全站預設課表綁定學期</strong>（與按下「改為綁定此學期」效果相同）。
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <div className="md:col-span-3">
                    <label className="block text-xs font-bold text-slate-700 mb-1">學期名稱</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none"
                      placeholder="例：114學年度第1學期"
                      value={newSemName}
                      onChange={(e) => setNewSemName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">開始日期</label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none"
                      value={newSemStart}
                      onChange={(e) => setNewSemStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">結束日期</label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none"
                      value={newSemEnd}
                      onChange={(e) => setNewSemEnd(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={semesterBusy}
                  onClick={() => void handleAddSemester()}
                  className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-medium disabled:opacity-50"
                >
                  {semesterBusy ? '處理中…' : '新增並設為綁定學期'}
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              僅管理員可維護學期清冊，或切換「預設課表綁定哪一學期」。若需調整，請聯絡管理員。
            </p>
          )}
        </section>

        {/* Salary Grades: 可收放編輯容器 */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <button
              type="button"
              onClick={() => setSalaryPanelOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 text-left"
            >
              <h2 className="text-lg font-bold text-slate-800 flex items-center">
                <Database size={20} className="mr-2 text-cyan-600" />
                俸點級距表（可編輯）
              </h2>
              <span className="text-slate-500">{salaryPanelOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</span>
            </button>
            <p className="text-sm text-slate-500 mt-2">
              在這裡維護薪級、本俸與學術研究費。更新後，教師編輯頁與重算功能會用此表對應。
            </p>
            {salaryPanelOpen && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSeedSalaryGrades}
                    disabled={salarySaving}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-cyan-300 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 text-sm font-bold disabled:opacity-60"
                  >
                    <CloudDownload size={16} className="shrink-0" aria-hidden />
                    第一次匯入既有俸點資料
                  </button>
                  <button
                    type="button"
                    onClick={handleAddSalaryRow}
                    disabled={salarySaving}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-sm font-bold disabled:opacity-60"
                  >
                    <Plus size={16} className="shrink-0 text-slate-600" aria-hidden />
                    新增俸點
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSalaryGrades}
                    disabled={salarySaving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-bold disabled:opacity-60"
                  >
                    {salarySaving ? <Loader2 size={16} className="animate-spin shrink-0" aria-hidden /> : <Save size={16} className="shrink-0" aria-hidden />}
                    儲存俸點表
                  </button>
                </div>

                <div className="border rounded-lg overflow-auto">
                  <table className="w-full min-w-[920px] text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left">俸點</th>
                        <th className="px-3 py-2 text-left">本俸</th>
                        <th className="px-3 py-2 text-left">有教證(學士)</th>
                        <th className="px-3 py-2 text-left">有教證(碩士+)</th>
                        <th className="px-3 py-2 text-left">無教證(學士)</th>
                        <th className="px-3 py-2 text-left">無教證(碩士+)</th>
                        <th className="px-3 py-2 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {salaryRows.map((row, idx) => (
                        <tr key={`${row.id}_${idx}`}>
                          <td className="px-3 py-2"><input type="number" className="w-24 px-2 py-1 border rounded" value={row.points || ''} onChange={(e) => handleSalaryCellChange(idx, 'points', Number(e.target.value))} /></td>
                          <td className="px-3 py-2"><input type="number" className="w-28 px-2 py-1 border rounded" value={row.salary || ''} onChange={(e) => handleSalaryCellChange(idx, 'salary', Number(e.target.value))} /></td>
                          <td className="px-3 py-2"><input type="number" className="w-28 px-2 py-1 border rounded" value={row.researchFeeCertBachelor || ''} onChange={(e) => handleSalaryCellChange(idx, 'researchFeeCertBachelor', Number(e.target.value))} /></td>
                          <td className="px-3 py-2"><input type="number" className="w-28 px-2 py-1 border rounded" value={row.researchFeeCertMaster || ''} onChange={(e) => handleSalaryCellChange(idx, 'researchFeeCertMaster', Number(e.target.value))} /></td>
                          <td className="px-3 py-2"><input type="number" className="w-28 px-2 py-1 border rounded" value={row.researchFeeNoCertBachelor || ''} onChange={(e) => handleSalaryCellChange(idx, 'researchFeeNoCertBachelor', Number(e.target.value))} /></td>
                          <td className="px-3 py-2"><input type="number" className="w-28 px-2 py-1 border rounded" value={row.researchFeeNoCertMaster || ''} onChange={(e) => handleSalaryCellChange(idx, 'researchFeeNoCertMaster', Number(e.target.value))} /></td>
                          <td className="px-3 py-2 text-right">
                            <button type="button" onClick={() => handleRemoveSalaryRow(idx)} className="text-slate-400 hover:text-red-600 p-1" title="刪除此俸點">
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {salaryRows.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                            尚無俸點資料，請先點上方「
                            <span className="inline-flex items-center gap-0.5 align-middle text-cyan-700 font-medium">
                              <CloudDownload size={14} className="inline shrink-0" aria-hidden />
                              第一次匯入既有俸點資料
                            </span>
                            」。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
        </section>

        {/* Holidays Management Section */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h2 className="text-lg font-bold text-slate-800 flex items-center">
                        <Calendar size={20} className="mr-2 text-rose-500"/>
                        國定假日與補假設定
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                        在此加入的日期，系統會在「複製課表」時自動跳過，並在新增代課單時以灰色標示。
                    </p>
                </div>
            </div>

            <div className="bg-rose-50 p-4 rounded-lg border border-rose-100 mb-6 flex items-end gap-3">
                <div className="flex-1">
                    <label className="block text-xs font-bold text-rose-800 mb-1">新增假日 / 補假日期</label>
                    <input 
                        type="date" 
                        className="w-full px-3 py-2 border border-rose-200 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
                        value={newHoliday}
                        onChange={(e) => setNewHoliday(e.target.value)}
                    />
                </div>
                <button 
                    onClick={handleAddHoliday}
                    disabled={!newHoliday}
                    className="px-4 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 font-bold flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Plus size={18} className="mr-1"/> 加入清單
                </button>
            </div>

            <div className="border rounded-lg overflow-hidden mb-4 max-h-60 overflow-y-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                        <tr>
                            <th className="px-4 py-3 font-semibold text-slate-600">日期</th>
                            <th className="px-4 py-3 font-semibold text-slate-600 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {sortedHolidays.map(date => (
                            <tr key={date} className="hover:bg-slate-50 group">
                                <td className="px-4 py-3 font-mono text-slate-700 flex items-center">
                                    <span className="w-2 h-2 rounded-full bg-rose-400 mr-3"></span>
                                    {date}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <button 
                                        type="button"
                                        onClick={() => setDeleteHolidayDate(date)}
                                        className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors"
                                        title="移除"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {sortedHolidays.length === 0 && (
                            <tr>
                                <td colSpan={2} className="px-4 py-8 text-center text-slate-400 flex flex-col items-center">
                                    <AlertCircle size={24} className="mb-2 opacity-50"/>
                                    尚未設定任何假日
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>

        {/* 匯出學校教師名單：以渲染表格呈現，含職別，可下載 CSV / 列印 */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6" id="teacher-list-print-area">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                <Users size={20} className="mr-2 text-slate-600"/>
                匯出學校教師名單
            </h2>
            <p className="text-sm text-slate-600 mb-4">
                以下為教師管理中的名單（含職別），可下載 CSV 或列印此表。
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
                <button
                    type="button"
                    onClick={handleExportTeacherListCsv}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 font-medium text-sm"
                >
                    <FileDown size={18} />
                    下載 CSV
                </button>
                <button
                    type="button"
                    onClick={handlePrintTeacherList}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium text-sm"
                >
                    <Printer size={18} />
                    列印此表
                </button>
            </div>
            <div className="border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                        <tr>
                            <th className="px-4 py-3 font-semibold text-slate-600">編號</th>
                            <th className="px-4 py-3 font-semibold text-slate-600">姓名</th>
                            <th className="px-4 py-3 font-semibold text-slate-600">職別</th>
                            <th className="px-4 py-3 font-semibold text-slate-600">電話</th>
                            <th className="px-4 py-3 font-semibold text-slate-600">任教科目</th>
                            <th className="px-4 py-3 font-semibold text-slate-600">任課班級</th>
                            <th className="px-4 py-3 font-semibold text-slate-600">類別</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {sortedTeachers.map((t, idx) => (
                            <tr key={t.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3 text-slate-600 font-mono">{idx + 1}</td>
                                <td className="px-4 py-3 font-medium text-slate-800">{safeStr(t.name) || '—'}</td>
                                <td className="px-4 py-3 text-slate-700">{safeStr(t.jobTitle) || '—'}</td>
                                <td className="px-4 py-3 text-slate-600">{safeStr(t.phone) || '—'}</td>
                                <td className="px-4 py-3 text-slate-600">{safeStr(t.subjects) || '—'}</td>
                                <td className="px-4 py-3 text-slate-600">{safeStr(t.teachingClasses) || '—'}</td>
                                <td className="px-4 py-3 text-slate-600">{safeStr(t.type) || '—'}</td>
                            </tr>
                        ))}
                        {sortedTeachers.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">尚無教師資料（請至「教師管理」新增）</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>

        {/* PIN 測試登入：僅本機；關閉後登入頁不再顯示 */}
        <section className="bg-white rounded-xl shadow-sm border border-amber-200 p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                <KeyRound size={20} className="mr-2 text-amber-600"/>
                PIN 測試登入（匿名快速進入）
            </h2>
            <p className="text-sm text-slate-600 mb-4">
                測試時可開啟：登入頁會出現 PIN 輸入，正確後以<strong>匿名</strong>身分進入（需 Firebase 已啟用匿名登入）。
                不需要時請關閉，登入頁將不再顯示此區塊。設定僅存在<strong>本瀏覽器</strong>（localStorage），不寫入雲端。
            </p>
            <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer w-fit">
                    <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                        checked={quickLoginEnabled}
                        onChange={(e) => {
                            const on = e.target.checked;
                            setQuickLoginEnabled(on);
                            if (!on) {
                                setQuickLoginConfig({ enabled: false, pin: '' });
                                setQuickLoginSaved(true);
                                setTimeout(() => setQuickLoginSaved(false), 2000);
                            }
                        }}
                    />
                    <span className="text-sm font-medium text-slate-700">啟用 PIN 測試登入</span>
                </label>
                {quickLoginEnabled && (
                    <div className="pl-7 space-y-2">
                        <label className="block text-sm font-medium text-slate-600">PIN（僅數字建議 4～8 碼）</label>
                        <div className="flex gap-2 flex-wrap items-center">
                            <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="off"
                                maxLength={12}
                                value={quickLoginPin}
                                onChange={(e) => setQuickLoginPin(e.target.value.replace(/\s/g, ''))}
                                placeholder="例如 5012"
                                className="w-40 px-3 py-2 border border-amber-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none font-mono"
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    setQuickLoginConfig({ enabled: true, pin: quickLoginPin });
                                    setQuickLoginSaved(true);
                                    setTimeout(() => setQuickLoginSaved(false), 2000);
                                }}
                                disabled={!quickLoginPin.trim()}
                                className="px-4 py-2 rounded-lg text-sm font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                儲存 PIN
                            </button>
                            {quickLoginSaved && (
                                <span className="text-sm font-medium text-green-600">已儲存 — 請重新開啟登入頁或重整以套用</span>
                            )}
                        </div>
                        <p className="text-xs text-slate-500">
                            關閉上方勾選即立即停用，無需按儲存。若已啟用但未儲存 PIN，登入頁也不會顯示區塊。
                        </p>
                    </div>
                )}
            </div>
        </section>

        {/* GAS Connection Section */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                <Wifi size={20} className="mr-2 text-slate-500"/>
                連線設定 (Google Apps Script)
            </h2>
            <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-600">Web App URL</label>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={tempUrl}
                        onChange={(e) => setTempUrl(e.target.value)}
                        placeholder="https://script.google.com/macros/s/.../exec"
                    />
                    <button 
                        onClick={handleSaveSettings}
                        className={`px-4 py-2 rounded-lg font-bold transition-colors flex items-center ${saveStatus === 'saved' ? 'bg-green-500 text-white' : 'bg-slate-700 text-white hover:bg-slate-800'}`}
                    >
                        <Save size={18} className="mr-2" />
                        {saveStatus === 'saved' ? '已儲存' : '儲存'}
                    </button>
                </div>
                <p className="text-xs text-slate-400">
                    日常資料存於 Firebase；此網址用於匯出報表、代課單、各類清冊／憑證產生及舊資料匯入。
                </p>
                {/* 顯示目前實際使用的網址（設定或 config fallback） */}
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-600 flex items-center">
                            <Link2 size={14} className="mr-1" /> 目前使用的 GAS 網址
                        </span>
                        {effectiveGasUrl && (
                            <button
                                type="button"
                                onClick={() => copyToClipboard(effectiveGasUrl)}
                                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center shrink-0"
                            >
                                <Copy size={14} className="mr-1" /> 複製
                            </button>
                        )}
                    </div>
                    {effectiveGasUrl ? (
                        <code className="block text-xs text-slate-700 break-all bg-white border border-slate-200 rounded px-2 py-2 select-all">
                            {effectiveGasUrl}
                        </code>
                    ) : (
                        <p className="text-xs text-amber-700">尚未設定，請貼上 Web App URL 並儲存。</p>
                    )}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
                        <span className="text-xs font-bold text-slate-600 flex items-center">
                            <Link2 size={14} className="mr-1" /> 本系統存取網址
                        </span>
                        <button
                            type="button"
                            onClick={() => copyToClipboard(typeof window !== 'undefined' ? window.location.href : '')}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center shrink-0"
                        >
                            <Copy size={14} className="mr-1" /> 複製
                        </button>
                    </div>
                    <code className="block text-xs text-slate-700 break-all bg-white border border-slate-200 rounded px-2 py-2 select-all">
                        {typeof window !== 'undefined' ? window.location.href : ''}
                    </code>
                    <p className="text-[11px] text-slate-500">給同事書籤或使用行動裝置時，可複製上方網址（同機開發時常為 http://本機IP:5173/）。</p>
                </div>
            </div>
        </section>

        {/* Data Migration Section */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                <Database size={20} className="mr-2 text-emerald-600"/>
                資料庫遷移 (Firebase)
            </h2>
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 mb-4">
                <p className="text-sm text-emerald-800">
                    此區域用於將舊有的 Google Sheets 資料遷移至新的 Firebase 資料庫。
                    <br/>
                    <strong>步驟 1：</strong>設定上方 GAS URL 並點擊「從 GAS 載入舊資料」。
                    <br/>
                    <strong>步驟 2：</strong>確認資料載入無誤後，點擊「遷移至 Firebase」。
                </p>
            </div>
            
            <div className="flex gap-4">
                <button 
                    onClick={handleLoadFromGas}
                    disabled={migrationStatus !== 'idle' && migrationStatus !== 'error' && migrationStatus !== 'success'}
                    className="flex-1 px-4 py-3 bg-white border border-slate-300 text-slate-700 rounded-lg font-bold hover:bg-slate-50 flex items-center justify-center transition-colors disabled:opacity-50"
                >
                    {migrationStatus === 'loading' ? <Loader2 className="animate-spin mr-2"/> : <Download className="mr-2"/>}
                    從 GAS 載入舊資料
                </button>
                
                <button 
                    onClick={handleMigrateToFirebase}
                    disabled={migrationStatus === 'loading' || migrationStatus === 'migrating'}
                    className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 flex items-center justify-center transition-colors disabled:opacity-50"
                >
                    {migrationStatus === 'migrating' ? <Loader2 className="animate-spin mr-2"/> : <CloudUpload className="mr-2"/>}
                    遷移至 Firebase
                </button>
            </div>
        </section>

      </div>
    </div>
  );
};

export default Settings;
