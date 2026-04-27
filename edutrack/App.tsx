import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import Login from './components/Login';
import AllowedUsersManager from './components/AllowedUsersManager';
import LanguageElectiveRoster from './components/LanguageElectiveRoster';
import AttendanceSheetPage from './components/AttendanceSheetPage';
import LanguageElectiveDashboard from './components/LanguageElectiveDashboard';
import TodoCalendar from './components/TodoCalendar';
import CampusMap from './components/CampusMap';
import AwardGenerator from './AwardGenerator'; 
import VendorManager from './VendorManager';
import ExamPapersTab from './components/ExamPapersTab';
import ArchiveManager from './ArchiveManager';
import ExamSubmissionsTab from './components/ExamSubmissionsTab';
import BudgetPlansTab from './components/BudgetPlansTab';
import BudgetAdvancesTab from './components/BudgetAdvancesTab';
import ExamSubmitPublicPage from './components/ExamSubmitPublicPage';
import ExamSubmitPublicProgressPage from './components/ExamSubmitPublicProgressPage';
import { getPublicExamStandaloneMode } from './utils/publicExamRoutes';
import LanguageHomeroomNotice from './components/LanguageHomeroomNotice';
import NewImmigrantLanguageGroupingPage from './components/NewImmigrantLanguageGroupingPage';
import VersionUpdatesPage from './components/VersionUpdatesPage';
import { Settings, Database, CheckCircle, AlertTriangle, Loader2, Archive, Copy, ShieldCheck, KeyRound, BookOpen, Plus, Trash2, Upload, FileSpreadsheet, HelpCircle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  setupSystem,
  getArchiveTasks,
  getBudgetPlans,
  getLanguageElectiveRoster,
  getAllLanguageElectiveRosters,
  buildNameToLanguageFromRosters,
  saveLanguageElectiveRoster,
  getLanguageOptions,
  saveLanguageOptionsToFirebase,
  mergeLanguageOptionsFromRosters,
} from './services/api';
import { summarizeBudgetPlanAlerts } from './utils/budgetPlanAlerts';
import { migrateSheetToFirebase } from './services/migrateSheetToFirebase';
import { onAuthStateChanged, signOut } from './services/auth';
import { isSandbox, isPinBypassActive, isPinUiEnabled, setPinUiEnabled, setPinBypass, TEST_PIN } from './services/sandboxStore';
import type { User } from 'firebase/auth';
import type { AllowedUser } from './types';
import { getAllowedUser } from './services/allowedUsers';
import { loadLanguageOptions } from './utils/languageOptions';
import { parseRosterFromRows, rosterMapToStudents, sheetToRows } from './utils/rosterImport';

interface SettingsTabProps {
    currentUser: User | null;
    currentAccess: AllowedUser | null;
}

const SettingsTab: React.FC<SettingsTabProps> = ({ currentUser, currentAccess }) => {
    const isDev = import.meta.env.DEV;
    const [pinUiEnabled, setPinUiEnabledState] = useState(() => isPinUiEnabled());
    const [pinBypassActive, setPinBypassActiveState] = useState(() => isPinBypassActive());
    const [languageOptions, setLanguageOptions] = useState<string[]>(() => loadLanguageOptions());
    const [languageOptionsLoading, setLanguageOptionsLoading] = useState(true);
    const [newLanguageInput, setNewLanguageInput] = useState('');
    const [uploadYear, setUploadYear] = useState('114');
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
    const [uploadFileName, setUploadFileName] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [rosterFormatOpen, setRosterFormatOpen] = useState(false);
    const [rosterExampleOpen, setRosterExampleOpen] = useState(false);

    const togglePinUi = (enabled: boolean) => {
        setPinUiEnabled(enabled);
        setPinUiEnabledState(enabled);
    };

    const exitPinBypass = () => {
        setPinBypass(false);
        setPinBypassActiveState(false);
        window.location.reload();
    };

    useEffect(() => {
        getLanguageOptions()
            .then(setLanguageOptions)
            .catch(() => {})
            .finally(() => setLanguageOptionsLoading(false));
    }, []);

    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string[], raw?: string } | null>(null);
    const [migrating, setMigrating] = useState(false);
    const [migrateResult, setMigrateResult] = useState<{ success: boolean; message: string; counts: any; errors: string[] } | null>(null);

    const handleSetup = async () => {
        setIsLoading(true);
        setStatus(null);
        setMigrateResult(null);
        try {
            const res = await setupSystem();
            if (res.success && res.data?.logs) {
                setStatus({ type: 'success', msg: res.data.logs });
            } else {
                setStatus({ type: 'error', msg: ['設定失敗', res.message || ''] });
            }
        } catch (e: any) {
            setStatus({ type: 'error', msg: ['連線錯誤', e.message] });
        } finally {
            setIsLoading(false);
        }
    };

    const handleMigrate = async () => {
        if (!confirm('確定要將 Google Sheet 的資料一鍵搬運到 Firebase？此操作會寫入目前 Firebase 專案的 edutrack_* 集合，不會清除既有 Firestore 資料，但可能產生重複（可之後手動整理）。')) return;
        setMigrating(true);
        setStatus(null);
        setMigrateResult(null);
        try {
            const result = await migrateSheetToFirebase();
            setMigrateResult(result);
        } catch (e: any) {
            setMigrateResult({ success: false, message: e.message, counts: {}, errors: [e.message] });
        } finally {
            setMigrating(false);
        }
    };

    const addLanguageOption = async () => {
        const v = newLanguageInput.trim();
        if (!v || languageOptions.includes(v)) return;
        const next = [...languageOptions, v];
        setLanguageOptions(next);
        try {
            await saveLanguageOptionsToFirebase(next);
        } catch (_) {}
        setNewLanguageInput('');
    };

    const removeLanguageOption = async (opt: string) => {
        if (languageOptions.length <= 1) return;
        const next = languageOptions.filter((o) => o !== opt);
        setLanguageOptions(next);
        try {
            await saveLanguageOptionsToFirebase(next);
        } catch (_) {}
    };

    const handleRosterFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadError(null);
        setUploadSuccess(null);
        setUploadFileName(file.name);
        const isCsv = /\.csv$/i.test(file.name);
        const reader = new FileReader();
        reader.onload = async (evt) => {
            setUploading(true);
            try {
                const raw = evt.target?.result;
                let rows: string[][];
                if (isCsv && typeof raw === 'string') {
                    rows = raw.split(/\r?\n/).map((line) => line.split(',').map((c) => c.trim()));
                } else if (!isCsv && raw) {
                    const wb = XLSX.read(raw, { type: 'binary' });
                    const sheet = wb.Sheets[wb.SheetNames[0]];
                    rows = sheetToRows(sheet);
                } else {
                    setUploadError('無法讀取檔案');
                    return;
                }
                const roster = parseRosterFromRows(rows);
                const classCount = Object.keys(roster).length;
                if (classCount === 0) {
                    setUploadError('未偵測到符合格式的「班級」區塊，請確認 Excel/CSV 格式。');
                    return;
                }
                const allRosters = await getAllLanguageElectiveRosters();
                const prevYear = String(parseInt(uploadYear, 10) - 1);
                const prevRoster = allRosters.find((r) => r.academicYear === prevYear);
                const nameToLanguage = prevRoster ? buildNameToLanguageFromRosters([prevRoster]) : {};
                const defaultLang = loadLanguageOptions()[0] ?? '無／未選';
                const list = rosterMapToStudents(roster, nameToLanguage, defaultLang);
                const doc = await getLanguageElectiveRoster(uploadYear);
                const languageClassSettings = doc?.languageClassSettings ?? [];
                const rosterRowKey = (x: (typeof list)[0]) => {
                    const sid = (x.studentId ?? '').trim();
                    if (sid) return `id:${sid}`;
                    const pid = (x.profileDocId ?? '').trim();
                    if (pid) return `p:${pid}`;
                    return `${x.className}-${x.seat}`;
                };
                const currentStudents = doc?.students ?? [];
                const currentMap = new Map<string, (typeof currentStudents)[0]>();
                for (const s of currentStudents) {
                    currentMap.set(rosterRowKey(s), s);
                }
                const merged: (typeof list) = [];
                let added = 0;
                for (const s of list) {
                    const key = rosterRowKey(s);
                    const existing = currentMap.get(key);
                    if (existing) {
                        merged.push({
                            ...existing,
                            className: s.className,
                            seat: s.seat,
                            name: s.name,
                        });
                        currentMap.delete(key);
                    } else {
                        merged.push(s);
                        added++;
                    }
                }
                for (const s of currentMap.values()) merged.push(s);
                await saveLanguageElectiveRoster(uploadYear, merged, languageClassSettings);
                setUploadSuccess(
                    currentStudents.length === 0
                        ? `已匯入 ${merged.length} 人（${classCount} 班）至 ${uploadYear} 學年名單。`
                        : `已合併：保留 ${merged.length - added} 筆既有資料、新增 ${added} 人；共 ${merged.length} 人（${uploadYear} 學年）。`
                );
            } catch (err: any) {
                setUploadError(err?.message || '解析或儲存失敗');
            } finally {
                setUploading(false);
            }
        };
        if (isCsv) reader.readAsText(file, 'utf-8');
        else reader.readAsBinaryString(file);
        e.target.value = '';
    };

    return (
        <div className="max-w-5xl mx-auto py-10 space-y-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
                <Settings className="mr-2" /> 系統設定
            </h2>

            {/* 測試 PIN 開關（僅開發模式顯示） */}
            {isDev && (
                <div className="bg-white rounded-lg shadow-sm border border-amber-200 p-6">
                    <div className="flex items-start gap-4 mb-4">
                        <div className="bg-amber-100 p-3 rounded-full">
                            <KeyRound className="w-6 h-6 text-amber-700" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900">測試 PIN 快速登入</h3>
                            <p className="text-gray-500 text-sm mt-1">
                                開發模式下可用 PIN <code className="bg-gray-100 px-1 rounded">{TEST_PIN}</code> 快速進入 Sandbox 流程。在此開關登入頁是否顯示 PIN 區塊；正式 build 不會出現此功能。
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 pl-0 sm:pl-[4.5rem]">
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                            <button
                                type="button"
                                role="switch"
                                aria-checked={pinUiEnabled}
                                onClick={() => togglePinUi(!pinUiEnabled)}
                                className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${pinUiEnabled ? 'bg-amber-500' : 'bg-gray-300'}`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${pinUiEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                                />
                            </button>
                            <span className="text-sm font-medium text-gray-800">
                                登入頁顯示 PIN 快速登入
                            </span>
                        </label>
                        <span className="text-sm text-gray-500">
                            目前 PIN 測試模式：
                            <strong className={pinBypassActive ? 'text-amber-700' : 'text-gray-600'}>
                                {pinBypassActive ? '已開啟' : '未開啟'}
                            </strong>
                        </span>
                    </div>
                    {pinBypassActive && import.meta.env.VITE_SANDBOX !== 'true' && (
                        <div className="mt-4 pl-0 sm:pl-[4.5rem]">
                            <button
                                type="button"
                                onClick={exitPinBypass}
                                className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                            >
                                結束 PIN 測試並回到登入
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* 一鍵搬運：Google Sheet → Firebase */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-start gap-4 mb-6">
                    <div className="bg-amber-100 p-3 rounded-full">
                        <Archive className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">一鍵搬運：Google Sheet → Firebase</h3>
                        <p className="text-gray-500 text-sm mt-1">
                            從目前綁定 GAS 的 Google 試算表讀取課程、學生、頒獎、廠商、事項列檔、待辦，寫入 Firebase Firestore（edutrack_* 集合）。請先關閉 Sandbox、設定好 .env 的 Firebase 與 GAS 網址。
                        </p>
                    </div>
                </div>
                {migrateResult && (
                    <div className={`mb-6 p-4 rounded-md text-sm ${migrateResult.success ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>
                        <h4 className="font-bold flex items-center mb-2">
                            {migrateResult.success ? <CheckCircle size={16} className="mr-2" /> : <AlertTriangle size={16} className="mr-2" />}
                            {migrateResult.message}
                        </h4>
                        {migrateResult.counts && Object.keys(migrateResult.counts).length > 0 && (
                            <p className="mt-1">課程 {migrateResult.counts.courses}、學生 {migrateResult.counts.students}、頒獎 {migrateResult.counts.awards}、廠商 {migrateResult.counts.vendors}、事項列檔 {migrateResult.counts.archive}、待辦 {migrateResult.counts.todos}</p>
                        )}
                        {migrateResult.errors && migrateResult.errors.length > 0 && (
                            <ul className="list-disc pl-5 mt-2 space-y-1 text-amber-700">
                                {migrateResult.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                                {migrateResult.errors.length > 10 && <li>…共 {migrateResult.errors.length} 筆</li>}
                            </ul>
                        )}
                    </div>
                )}
                <button
                    onClick={handleMigrate}
                    disabled={migrating}
                    className="w-full sm:w-auto flex items-center justify-center px-6 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                    {migrating ? <Loader2 className="animate-spin mr-2" size={18} /> : <Copy size={18} className="mr-2" />}
                    {migrating ? '搬運中...' : '一鍵搬運到 Firebase'}
                </button>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-start gap-4 mb-6">
                    <div className="bg-blue-100 p-3 rounded-full">
                        <Database className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">初始化系統資料庫</h3>
                        <p className="text-gray-500 text-sm mt-1">
                            此操作將在您的 Google Drive 建立必要的資料夾結構 (EduTrack_點名單封存) 
                            以及檢查 Google Sheets 資料庫的欄位結構 (含行事曆、頒獎紀錄、廠商管理擴充功能)。
                        </p>
                    </div>
                </div>

                {status && (
                    <div className={`mb-6 p-4 rounded-md text-sm ${status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        <h4 className="font-bold flex items-center mb-2">
                            {status.type === 'success' ? <CheckCircle size={16} className="mr-2" /> : <AlertTriangle size={16} className="mr-2" />}
                            {status.type === 'success' ? '設定完成' : '發生錯誤'}
                        </h4>
                        <ul className="list-disc pl-5 space-y-1">
                            {status.msg.map((m, i) => <li key={i}>{m}</li>)}
                        </ul>
                    </div>
                )}

                <button
                    onClick={handleSetup}
                    disabled={isLoading}
                    className="w-full sm:w-auto flex items-center justify-center px-6 py-2 bg-slate-800 text-white rounded hover:bg-slate-900 disabled:opacity-50 transition-colors"
                >
                    {isLoading ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
                    {isLoading ? '系統設定中...' : '開始快速設定'}
                </button>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-start gap-4 mb-6">
                    <div className="bg-violet-100 p-3 rounded-full">
                        <ShieldCheck className="w-6 h-6 text-violet-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">Google 登入白名單</h3>
                        <p className="text-gray-500 text-sm mt-1">
                            使用 Firestore 的 <code>edutrack_allowed_users</code> 集合管理可登入帳號。第一次請先到 Firebase Console 手動建立一位管理員文件，之後即可在系統內新增、停用或移除名單。
                        </p>
                    </div>
                </div>
                <AllowedUsersManager
                    currentUserEmail={currentUser?.email}
                    canManage={currentAccess?.role === 'admin' && currentAccess.enabled}
                />
            </div>

            {/* 管理語言類別（選修語言維度） */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-start gap-4 mb-6">
                    <div className="bg-emerald-100 p-3 rounded-full">
                        <BookOpen className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">管理語言類別</h3>
                        <p className="text-gray-500 text-sm mt-1">
                            學生名單的「選修語言」下拉選單由此管理，至少保留一項；設定儲存於 Firebase，不會因換裝置而消失。若曾遺失，可按「從名單彙整」還原名單中已使用的語言類別。
                        </p>
                    </div>
                </div>
                {languageOptionsLoading && (
                    <p className="text-sm text-slate-500 mb-2 pl-0 sm:pl-[4.5rem]">載入語言類別中…</p>
                )}
                <div className="space-y-3 pl-0 sm:pl-[4.5rem]">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={async () => {
                                try {
                                    const merged = await mergeLanguageOptionsFromRosters();
                                    setLanguageOptions(merged);
                                } catch (_) {}
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm hover:bg-slate-200"
                        >
                            <RefreshCw size={14} /> 從名單彙整現有語言類別
                        </button>
                        <input
                            type="text"
                            value={newLanguageInput}
                            onChange={(e) => setNewLanguageInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLanguageOption())}
                            placeholder="輸入新類別名稱"
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                        <button
                            type="button"
                            onClick={addLanguageOption}
                            disabled={!newLanguageInput.trim() || languageOptions.includes(newLanguageInput.trim())}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Plus size={14} /> 新增
                        </button>
                    </div>
                    <ul className="flex flex-wrap gap-2">
                        {languageOptions.map((opt) => (
                            <li
                                key={opt}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-800 text-sm"
                            >
                                <span>{opt}</span>
                                <button
                                    type="button"
                                    onClick={() => removeLanguageOption(opt)}
                                    disabled={languageOptions.length <= 1}
                                    className="text-gray-400 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                    title="刪除此類別"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* 學生名單 Excel 上傳（每年約一次） */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-start gap-4 mb-6">
                    <div className="bg-sky-100 p-3 rounded-full">
                        <Upload className="w-6 h-6 text-sky-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">學生名單 Excel 上傳</h3>
                        <p className="text-gray-500 text-sm mt-1">
                            上傳 Excel 或 CSV 班級名單會與該學年現有名單<strong>合併</strong>：同班級＋同座號的學生保留既有編輯（選修語言、語言班別），僅補上 Excel 有而名單沒有的學生；名單有但 Excel 沒有的學生也會保留。新學生會依「姓名」繼承上一學年選修語言。完成後請至「學生名單」頁檢視或編輯。
                        </p>
                    </div>
                </div>
                <div className="space-y-4 pl-0 sm:pl-[4.5rem]">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-gray-700">學年度</label>
                            <input
                                type="text"
                                value={uploadYear}
                                onChange={(e) => setUploadYear(e.target.value)}
                                className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                                placeholder="114"
                            />
                        </div>
                        <label className="flex flex-col items-center justify-center w-full max-w-xs h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                            <Upload className="w-8 h-8 text-gray-400 mb-1" />
                            <span className="text-sm text-gray-600">選擇 .csv / .xlsx / .xls</span>
                            <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleRosterFile} disabled={uploading} />
                        </label>
                    </div>
                    {uploadFileName && <p className="text-sm text-gray-500 flex items-center gap-2"><FileSpreadsheet size={14} /> {uploadFileName}</p>}
                    {uploading && <p className="text-sm text-sky-600 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> 匯入中…</p>}
                    {uploadSuccess && <p className="text-sm text-green-700">{uploadSuccess}</p>}
                    {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <button type="button" onClick={() => setRosterFormatOpen(!rosterFormatOpen)} className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left text-sm font-medium text-gray-800">
                            <span className="flex items-center gap-2"><HelpCircle size={16} /> Excel / CSV 格式說明</span>
                            {rosterFormatOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                        {rosterFormatOpen && (
                            <div className="p-4 pt-0 space-y-2 text-sm text-gray-700 border-t border-gray-100">
                                <p>系統會辨識「班級」區塊並擷取座號、姓名；上傳後依姓名繼承上一學年選修語言。</p>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>表頭：某一儲存格同時包含「班」與「級」，其<strong>右側一格</strong>為班級名稱。</li>
                                    <li>座號：班級欄的<strong>左邊第 2 欄</strong>；姓名：<strong>左邊第 1 欄</strong>。</li>
                                    <li>學生列：從班級列起<strong>下一列</strong>開始（標題下一列即第一筆）；座號為數字、姓名有內容才列入。</li>
                                    <li>區塊結束：座號欄出現「合計」或「男」即結束該班。</li>
                                </ul>
                                <p className="text-gray-500">支援 .csv、.xlsx、.xls；CSV 請用 UTF-8。</p>
                                <button type="button" onClick={() => setRosterExampleOpen((v) => !v)} className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-gray-200 text-gray-700 text-sm hover:bg-gray-300">
                                    {rosterExampleOpen ? '收起範例' : '看範例表格'}
                                </button>
                                {rosterExampleOpen && (
                                    <div className="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-200 inline-block">
                                        <p className="text-xs text-gray-500 mb-2">範例（擷取後會得到：101 班 座號 1 王小明、2 李小華）</p>
                                        <table className="text-xs border-collapse border border-gray-300">
                                            <tbody>
                                                <tr>
                                                    <td className="border border-gray-300 px-2 py-1 bg-gray-100 font-medium">座號</td>
                                                    <td className="border border-gray-300 px-2 py-1 bg-gray-100 font-medium">姓名</td>
                                                    <td className="border border-gray-300 px-2 py-1 bg-amber-100 font-medium">班級</td>
                                                    <td className="border border-gray-300 px-2 py-1 bg-gray-100 font-medium">101</td>
                                                </tr>
                                                <tr>
                                                    <td className="border border-gray-300 px-2 py-1">1</td>
                                                    <td className="border border-gray-300 px-2 py-1">王小明</td>
                                                    <td className="border border-gray-300 px-2 py-1" colSpan={2} />
                                                </tr>
                                                <tr>
                                                    <td className="border border-gray-300 px-2 py-1">2</td>
                                                    <td className="border border-gray-300 px-2 py-1">李小華</td>
                                                    <td className="border border-gray-300 px-2 py-1" colSpan={2} />
                                                </tr>
                                                <tr>
                                                    <td className="border border-gray-300 px-2 py-1 text-gray-500">合計</td>
                                                    <td className="border border-gray-300 px-2 py-1" colSpan={3} />
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const App: React.FC<{ embedded?: boolean; mobileHub?: boolean }> = ({ embedded, mobileHub }) => {
  // 對外填報／提報進度頁（獨立開啟時；主站 Hash 路由由根目錄 App.tsx 處理）
  if (!embedded && typeof window !== 'undefined') {
    const mode = getPublicExamStandaloneMode();
    if (mode === 'progress') return <ExamSubmitPublicProgressPage />;
    if (mode === 'submit') return <ExamSubmitPublicPage />;
  }

  const [activeTab, setActiveTab] = useState('calendar');
  const [archiveCount, setArchiveCount] = useState(0);
  const [budgetNavAlert, setBudgetNavAlert] = useState({ count: 0, overdue: 0 });
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessUser, setAccessUser] = useState<AllowedUser | null>(null);
  const [loginError, setLoginError] = useState('');

  // 監聽登入狀態（Sandbox 模式不檢查登入）
  useEffect(() => {
    if (isSandbox()) {
      setAuthLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged((u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => { unsubscribe?.(); };
  }, []);

  useEffect(() => {
    if (isSandbox()) {
      setAccessLoading(false);
      setAccessUser(null);
      setLoginError('');
      return;
    }

    if (!user?.email) {
      setAccessLoading(false);
      setAccessUser(null);
      return;
    }

    let cancelled = false;
    const verifyAccess = async () => {
      setAccessLoading(true);
      try {
        const allowedUser = await getAllowedUser(user.email!);
        if (cancelled) return;

        if (!allowedUser || !allowedUser.enabled) {
          setAccessUser(null);
          setLoginError(
            `帳號 ${user.email} 尚未加入「教學組事務」白名單（Firestore：edutrack_allowed_users），請聯絡管理員。`,
          );
          if (!embedded) {
            await signOut();
          }
          return;
        }

        setAccessUser(allowedUser);
        setLoginError('');
      } catch (error: any) {
        if (cancelled) return;
        setAccessUser(null);
        setLoginError(error?.message || '無法驗證教學組事務白名單');
        if (!embedded) {
          await signOut();
        }
      } finally {
        if (!cancelled) setAccessLoading(false);
      }
    };

    verifyAccess();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Fetch archive count when logged in
  useEffect(() => {
    if (isSandbox() || user) {
      const fetchArchiveCount = async () => {
        try {
          const data = await getArchiveTasks();
          const pendingCount = data.filter(t => !t.isPrinted || !t.isNotified).length;
          setArchiveCount(pendingCount);
        } catch (e) {
          console.error('Failed to fetch archive count', e);
        }
      };
      fetchArchiveCount();
    }
  }, [user]);

  const refreshBudgetNavAlerts = useCallback(async () => {
    try {
      const plans = await getBudgetPlans(undefined);
      setBudgetNavAlert(summarizeBudgetPlanAlerts(plans));
    } catch {
      /* ignore */
    }
  }, []);

  // 計畫專案：導覽列警示（結案 30 天內或逾期，且狀態為進行中）
  useEffect(() => {
    if (!isSandbox() && !user) return;
    void refreshBudgetNavAlerts();
  }, [user, activeTab, refreshBudgetNavAlerts]);

  const renderContent = () => {
    switch (activeTab) {
      case 'calendar':
        return <TodoCalendar />;
      case 'student-roster':
        return <LanguageElectiveRoster />;
      case 'budget-plans':
        return <BudgetPlansTab onDataChanged={refreshBudgetNavAlerts} />;
      case 'budget-advances':
        return <BudgetAdvancesTab />;
      case 'language-elective':
        return <LanguageElectiveRoster />;
      case 'language-dashboard':
        return <LanguageElectiveDashboard />;
      case 'language-homeroom-notice':
        return <LanguageHomeroomNotice />;
      case 'new-immigrant-grouping':
        return <NewImmigrantLanguageGroupingPage />;
      case 'attendance':
        return <AttendanceSheetPage />;
      case 'campus-map':
        return <CampusMap />;
      case 'awards':
        return <AwardGenerator />;
      case 'vendors':
        return <VendorManager />;
      case 'exam-papers':
        return <ExamPapersTab user={user} />;
      case 'exam-submissions':
        return (
          <ExamSubmissionsTab
            currentAccess={accessUser}
            currentUserEmail={user?.email ?? null}
            onNavigateToTab={setActiveTab}
          />
        );
      case 'archive':
        return <ArchiveManager onTasksChange={setArchiveCount} />;
      case 'settings':
        return <SettingsTab currentUser={user} currentAccess={accessUser} />;
      case 'version-updates':
        return <VersionUpdatesPage />;
      default:
        return <TodoCalendar />;
    }
  };

  if (authLoading || (!isSandbox() && user && accessLoading)) {
    return (
      <div
        className={
          mobileHub
            ? 'min-h-[180px] py-12 bg-slate-100 flex items-center justify-center'
            : 'min-h-screen bg-slate-100 flex items-center justify-center'
        }
      >
        <Loader2 size={32} className="animate-spin text-slate-600" />
      </div>
    );
  }

  if (!isSandbox() && !user) {
    if (embedded) {
      return (
        <div className="p-8 text-center text-slate-600 text-sm">
          <p>請先登入主系統後，再使用教學組事務功能。</p>
        </div>
      );
    }
    return <Login externalError={loginError} />;
  }

  if (!isSandbox() && embedded && user && !accessUser && !accessLoading && loginError) {
    return (
      <div className="p-6 max-w-lg mx-auto m-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-950">
        <p className="font-semibold mb-2">無法使用教學組事務</p>
        <p className="text-sm text-amber-900/90">{loginError}</p>
        <a href="#/" className="inline-block mt-4 text-sm text-indigo-600 hover:underline">
          返回代課系統首頁
        </a>
      </div>
    );
  }

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      archiveCount={archiveCount}
      budgetPlansAlertCount={budgetNavAlert.count}
      budgetPlansAlertOverdue={budgetNavAlert.overdue > 0}
      user={user}
      onSignOut={() => signOut()}
      embeddedMobileHub={mobileHub}
    >
      {renderContent()}
    </Layout>
  );
};

export default App;