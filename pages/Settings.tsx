
// pages/Settings.tsx

import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Settings as SettingsIcon, Calendar, Trash2, Plus, Wifi, Save, AlertCircle, CloudUpload, Loader2, BookOpen, Database, Download } from 'lucide-react';
import Modal, { ModalType } from '../components/Modal';
import InstructionPanel, { CollapsibleItem } from '../components/InstructionPanel';

const Settings: React.FC = () => {
  const { holidays, addHoliday, removeHoliday, settings, updateSettings, loadFromGas, migrateToFirebase } = useAppStore();
  const [newHoliday, setNewHoliday] = useState('');
  const [tempUrl, setTempUrl] = useState(settings.gasWebAppUrl);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [migrationStatus, setMigrationStatus] = useState<'idle' | 'loading' | 'migrating' | 'success' | 'error'>('idle');

  // Modal State
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: ModalType }>({
      isOpen: false, title: '', message: '', type: 'info'
  });

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

  return (
    <div className="p-8 pb-32 max-w-4xl mx-auto">
      <Modal 
        isOpen={modal.isOpen} 
        onClose={() => setModal({ ...modal, isOpen: false })} 
        title={modal.title} 
        message={modal.message} 
        type={modal.type} 
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
          <CollapsibleItem title="Google Apps Script (GAS) 連線">
            <p>設定 GAS 的 Web App URL。此連線用於：1. 產生 Excel/Word 報表 2. 存取 Google Drive 檔案 3. 從舊版試算表匯入資料。</p>
          </CollapsibleItem>
          <CollapsibleItem title="資料遷移與備份">
            <p>若您有舊版試算表資料，請先設定 GAS URL，點擊「從 GAS 載入舊資料」進行預覽，確認無誤後再點擊「遷移至 Firebase」完成雲端化。</p>
          </CollapsibleItem>
          <CollapsibleItem title="Firebase 雲端儲存">
            <p>本系統使用 Firebase 雲端資料庫，所有變更都會即時同步至雲端。即使更換電腦，只要登入相同帳號即可存取最新資料。</p>
          </CollapsibleItem>
        </div>
      </InstructionPanel>

      <div className="space-y-8">
        
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
                    <tbody className="divide-y divide-slate-100">
                        {sortedHolidays.map(date => (
                            <tr key={date} className="hover:bg-slate-50 group">
                                <td className="px-4 py-3 font-mono text-slate-700 flex items-center">
                                    <span className="w-2 h-2 rounded-full bg-rose-400 mr-3"></span>
                                    {date}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <button 
                                        onClick={() => removeHoliday(date)}
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
                    此網址用於檔案生成（如薪資單）及舊資料匯入。
                </p>
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
