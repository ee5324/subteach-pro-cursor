
// pages/Settings.tsx

import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { GAS_WEB_APP_URL } from '../config';
import { getQuickLoginConfig, setQuickLoginConfig } from '../utils/quickLoginStorage';
import { Settings as SettingsIcon, Calendar, Trash2, Plus, Wifi, Save, AlertCircle, CloudUpload, Loader2, BookOpen, Database, Download, Link2, Copy, KeyRound, ShieldCheck, UserPlus, Users, FileDown, Printer } from 'lucide-react';
import Modal, { ModalType, ModalMode } from '../components/Modal';
import InstructionPanel, { CollapsibleItem } from '../components/InstructionPanel';

const Settings: React.FC = () => {
  const { holidays, addHoliday, removeHoliday, settings, updateSettings, loadFromGas, migrateToFirebase, isSubteachAdmin, subteachAllowedUsers, addSubteachAllowedUser, updateSubteachAllowedUser, removeSubteachAllowedUser, teachers } = useAppStore();
  const [newHoliday, setNewHoliday] = useState('');
  const [whitelistEmail, setWhitelistEmail] = useState('');
  const [whitelistRole, setWhitelistRole] = useState<'admin' | 'user'>('user');
  const [whitelistSaving, setWhitelistSaving] = useState(false);
  const [tempUrl, setTempUrl] = useState(settings.gasWebAppUrl);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [migrationStatus, setMigrationStatus] = useState<'idle' | 'loading' | 'migrating' | 'success' | 'error'>('idle');

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

  const sortedTeachers = useMemo(() => [...(teachers || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-TW')), [teachers]);

  const handleExportTeacherListCsv = () => {
    const headers = ['姓名', '職別', '電話', '任教科目', '任課班級', '類別'];
    const escape = (v: string | undefined) => (v == null ? '' : String(v).replace(/"/g, '""'));
    const row = (t: { name?: string; jobTitle?: string; phone?: string; subjects?: string; teachingClasses?: string; type?: string }) =>
      [escape(t.name), escape(t.jobTitle), escape(t.phone), escape(t.subjects), escape(t.teachingClasses), escape(t.type)].map(c => `"${c}"`).join(',');
    const csv = '\uFEFF' + headers.join(',') + '\n' + sortedTeachers.map(t => row(t)).join('\n');
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
    const tableRows = sortedTeachers.map(t => `
      <tr>
        <td>${escapeHtml(t.name ?? '')}</td>
        <td>${escapeHtml(t.jobTitle ?? '')}</td>
        <td>${escapeHtml(t.phone ?? '')}</td>
        <td>${escapeHtml(t.subjects ?? '')}</td>
        <td>${escapeHtml(t.teachingClasses ?? '')}</td>
        <td>${escapeHtml(t.type ?? '')}</td>
      </tr>
    `).join('');
    win.document.write(`
      <!DOCTYPE html><html><head><meta charset="UTF-8"><title>學校教師名單</title>
      <style>body{font-family:sans-serif;padding:1rem;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #333;padding:6px 10px;text-align:left;} th{background:#eee;}</style>
      </head><body>
      <h1>學校教師名單</h1>
      <p>列印時間：${new Date().toLocaleString('zh-TW')}</p>
      <table>
        <thead><tr><th>姓名</th><th>職別</th><th>電話</th><th>任教科目</th><th>任課班級</th><th>類別</th></tr></thead>
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

      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 flex items-center">
          <SettingsIcon className="mr-3 text-slate-600" />
          系統設定
        </h1>
        <p className="text-slate-500 mt-2">管理全域參數、連線設定與資料庫遷移</p>
      </header>

      <InstructionPanel title="使用說明：系統設定">
        <div className="space-y-1">
          <CollapsibleItem title="學期與畢業日期設定">
            <p>設定學期開始與結束日期，這會影響「固定兼課」與「超鐘點」的計算週數。畢業典禮日期則用於自動扣除六年級導師畢業後的超鐘點節數。</p>
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
                            <th className="px-4 py-3 font-semibold text-slate-600">姓名</th>
                            <th className="px-4 py-3 font-semibold text-slate-600">職別</th>
                            <th className="px-4 py-3 font-semibold text-slate-600">電話</th>
                            <th className="px-4 py-3 font-semibold text-slate-600">任教科目</th>
                            <th className="px-4 py-3 font-semibold text-slate-600">任課班級</th>
                            <th className="px-4 py-3 font-semibold text-slate-600">類別</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {sortedTeachers.map((t) => (
                            <tr key={t.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3 font-medium text-slate-800">{t.name ?? '—'}</td>
                                <td className="px-4 py-3 text-slate-700">{t.jobTitle?.trim() || '—'}</td>
                                <td className="px-4 py-3 text-slate-600">{t.phone?.trim() || '—'}</td>
                                <td className="px-4 py-3 text-slate-600">{t.subjects?.trim() || '—'}</td>
                                <td className="px-4 py-3 text-slate-600">{t.teachingClasses?.trim() || '—'}</td>
                                <td className="px-4 py-3 text-slate-600">{t.type ?? '—'}</td>
                            </tr>
                        ))}
                        {sortedTeachers.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">尚無教師資料（請至「教師管理」新增）</td>
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
