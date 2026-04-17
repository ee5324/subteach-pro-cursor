import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Printer, Save, History, RotateCcw, X, Loader2, Clipboard, Search, UserPlus, FileText, ChevronDown, Lock, Unlock, Users, ListFilter, Upload, LayoutList } from 'lucide-react';
import { AwardRecord, AwardStudent, AwardExportOptions } from './types';
import AwardNotification from './components/AwardNotification';
import Modal from './components/Modal';
import * as XLSX from 'xlsx';
import { getAllKnownStudents, getAwardHistory, saveAwardRecord, createAwardDocs, createAwardSummaryDocs } from './services/api';
import RosterStudentSource, { ROSTER_DRAG_TYPE } from './components/RosterStudentSource';

const AWARD_SUGGESTION_LIMIT = 25;
const EXAM_TO_AWARDS_DRAFT_KEY = 'edutrack.examSubmissions.awardsDraft';

type AwardKnownStudent = { className: string; name: string };

function scoreAwardStudentMatch(qRaw: string, s: AwardKnownStudent): number {
    const q = qRaw.trim();
    if (!q) return 999;
    const name = (s.name ?? '').trim();
    const cn = (s.className ?? '').trim();
    if (!name && !cn) return 999;
    if (name === q || cn === q) return 0;
    if (name.startsWith(q) || cn.startsWith(q)) return 1;
    if (name.includes(q)) return 2;
    if (cn.includes(q)) return 3;
    const compact = `${cn}${name}`.replace(/\s+/g, '');
    const qc = q.replace(/\s+/g, '');
    if (qc && compact.includes(qc)) return 4;
    return 999;
}

function filterAwardStudentSuggestions(known: AwardKnownStudent[], query: string): AwardKnownStudent[] {
    const q = query.trim();
    if (!q) return [];
    return known
        .map((s) => ({ s, score: scoreAwardStudentMatch(q, s) }))
        .filter((x) => x.score < 900)
        .sort((a, b) => {
            if (a.score !== b.score) return a.score - b.score;
            const c = a.s.className.localeCompare(b.s.className, undefined, { numeric: true });
            if (c !== 0) return c;
            return a.s.name.localeCompare(b.s.name, 'zh-TW');
        })
        .slice(0, AWARD_SUGGESTION_LIMIT)
        .map((x) => x.s);
}

const AwardGenerator: React.FC = () => {
    // Input States
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [time, setTime] = useState('08:00');
    const [title, setTitle] = useState('朝會頒獎');
    const [parsedStudents, setParsedStudents] = useState<AwardStudent[]>([]);
    
    // UI States
    const [activeTab, setActiveTab] = useState<'manual' | 'batch_list'>('manual');
    const [manualMode, setManualMode] = useState<'single' | 'group'>('single'); // single=逐筆, group=多人同獎項
    const [gradeFilter, setGradeFilter] = useState<'all' | 'low' | 'mid' | 'high'>('all');

    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [historyRecords, setHistoryRecords] = useState<AwardRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [modalState, setModalState] = useState<{
        isOpen: boolean;
        title: string;
        content: React.ReactNode;
        type?: 'info' | 'danger' | 'warning' | 'success';
    }>({ isOpen: false, title: '', content: null });

    // Autocomplete State
    const [knownStudents, setKnownStudents] = useState<{className: string, name: string}[]>([]);
    const [filteredSuggestions, setFilteredSuggestions] = useState<{className: string, name: string}[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionRef = useRef<HTMLDivElement>(null);
    const groupSuggestionRef = useRef<HTMLDivElement>(null);
    const [groupSearchName, setGroupSearchName] = useState('');

    // Manual Input Fields
    const [manualInput, setManualInput] = useState({ className: '', name: '', awardName: '' });
    const [isAwardLocked, setIsAwardLocked] = useState(false); // 鎖定獎項名稱

    // Group Input Fields
    const [groupInput, setGroupInput] = useState({ awardName: '', studentListText: '' });
    
    // Batch List Input
    const [inputText, setInputText] = useState('');
    // 語言選修名單學年（用於從名單拖曳加入）
    const [rosterYear, setRosterYear] = useState('114');

    // --- Effects ---

    useEffect(() => {
        fetchKnownStudents();
        // Click outside to close suggestions (single + group mode)
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            const outsideSingle = !suggestionRef.current || !suggestionRef.current.contains(target);
            const outsideGroup = !groupSuggestionRef.current || !groupSuggestionRef.current.contains(target);
            if (outsideSingle && outsideGroup) setShowSuggestions(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(EXAM_TO_AWARDS_DRAFT_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as { title?: string; students?: AwardStudent[] };
            const incoming = Array.isArray(parsed.students) ? parsed.students : [];
            if (incoming.length === 0) {
                localStorage.removeItem(EXAM_TO_AWARDS_DRAFT_KEY);
                return;
            }
            if (parsed.title && parsed.title.trim()) setTitle(parsed.title.trim());
            setParsedStudents(incoming);
            showModal('已載入段考提報彙整', `已帶入 ${incoming.length} 筆獲獎資料，請確認後再儲存或輸出。`, 'success');
            localStorage.removeItem(EXAM_TO_AWARDS_DRAFT_KEY);
        } catch {
            localStorage.removeItem(EXAM_TO_AWARDS_DRAFT_KEY);
        }
    }, []);

    // --- Logic ---

    const fetchKnownStudents = async () => {
        try {
            const data = await getAllKnownStudents();
            setKnownStudents(data);
        } catch (e) {
            console.error("Failed to fetch students for autocomplete", e);
        }
    };

    // Tab 1: Manual Single Add
    const handleManualAdd = () => {
        if (!manualInput.className || !manualInput.name || !manualInput.awardName) {
            showModal('欄位不完整', '請輸入班級、姓名與獎項', 'warning');
            return;
        }
        setParsedStudents(prev => [...prev, { ...manualInput }]);
        
        // Reset fields based on lock state
        setManualInput(prev => ({ 
            ...prev, 
            className: '', 
            name: '', 
            // Keep awardName if locked
            awardName: isAwardLocked ? prev.awardName : '' 
        }));
    };

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setManualInput(prev => ({ ...prev, name: val }));

        if (val.trim()) {
            const matches = filterAwardStudentSuggestions(knownStudents, val);
            setFilteredSuggestions(matches);
            setShowSuggestions(matches.length > 0);
        } else {
            setShowSuggestions(false);
        }
    };

    const selectSuggestion = (student: {className: string, name: string}) => {
        setManualInput(prev => ({ ...prev, className: student.className, name: student.name }));
        setShowSuggestions(false);
    };

    const handleGroupNameSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setGroupSearchName(val);
        if (val.trim()) {
            const matches = filterAwardStudentSuggestions(knownStudents, val);
            setFilteredSuggestions(matches);
            setShowSuggestions(matches.length > 0);
        } else {
            setShowSuggestions(false);
        }
    };

    const selectGroupSuggestion = (student: {className: string, name: string}) => {
        const awardName = groupInput.awardName.trim() || '獲獎';
        setParsedStudents((prev) => [...prev, { className: student.className, name: student.name, awardName }]);
        setGroupSearchName('');
        setShowSuggestions(false);
    };

    // Tab 1: Group Add (Same Award, Multiple Students)
    const handleGroupAdd = () => {
        if (!groupInput.awardName.trim()) {
            showModal('欄位缺漏', '請輸入獎項名稱', 'warning');
            return;
        }
        if (!groupInput.studentListText.trim()) {
            showModal('欄位缺漏', '請輸入學生名單', 'warning');
            return;
        }

        const lines = groupInput.studentListText.split(/\r?\n/).filter(line => line.trim() !== '');
        const newStudents: AwardStudent[] = [];

        lines.forEach(line => {
            // Try to split by space, tab, or common separators
            // Expecting: "101 Name" or "101,Name"
            const parts = line.split(/[\t\s,]+/).filter(p => p.trim());
            if (parts.length >= 2) {
                newStudents.push({
                    className: parts[0],
                    name: parts[1],
                    awardName: groupInput.awardName
                });
            } else {
                // Skip invalid lines silently or maybe handle error
            }
        });

        if (newStudents.length > 0) {
            setParsedStudents(prev => [...prev, ...newStudents]);
            setGroupInput(prev => ({ ...prev, studentListText: '' })); // Clear names, keep award title
            showModal('加入成功', `已將「${groupInput.awardName}」加入給 ${newStudents.length} 位學生。`, 'success');
        } else {
            showModal('格式錯誤', '無法辨識學生名單，請使用「班級 姓名」格式，一行一位。', 'warning');
        }
    };

    // Tab 2: Batch List Parse
    const parseText = () => {
        if (!inputText.trim()) return;

        const lines = inputText.split(/\r?\n/).filter(line => line.trim() !== '');
        const newStudents: AwardStudent[] = [];

        lines.forEach(line => {
            const parts = line.split(/[\t,]+/).map(p => p.trim());
            if (parts.length >= 3) {
                newStudents.push({
                    className: parts[0],
                    name: parts[1],
                    awardName: parts.slice(2).join(' ')
                });
            } else if (parts.length === 2) {
                 newStudents.push({
                    className: parts[0],
                    name: parts[1],
                    awardName: '榮譽狀'
                });
            }
        });

        if (newStudents.length > 0) {
            setParsedStudents(prev => [...prev, ...newStudents]);
            setInputText('');
            showModal('匯入成功', `已新增 ${newStudents.length} 筆獲獎資料。`, 'success');
        } else {
            showModal('匯入失敗', '無法辨識資料格式，請確認為「班級 姓名 獎項」。', 'warning');
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
                
                let text = '';
                data.forEach(row => {
                    // Filter out empty cells and join with tab
                    const validCols = row.filter(cell => cell !== undefined && cell !== null && String(cell).trim() !== '');
                    if (validCols.length >= 2) {
                        text += validCols.join('\t') + '\n';
                    }
                });
                setInputText(text);
                showModal('解析成功', `已將 Excel 內容載入文字框，請確認格式後點擊「解析匯入」。`, 'success');
            } catch (error) {
                showModal('解析失敗', '無法解析 Excel 檔案，請確認檔案格式。', 'danger');
            }
        };
        reader.readAsBinaryString(file);
        // Reset input
        e.target.value = '';
    };

    // Common Actions
    const handleClear = () => {
        setParsedStudents([]);
        setInputText('');
    };

    const handleDeleteStudent = (index: number) => {
        setParsedStudents(prev => prev.filter((_, i) => i !== index));
    };

    const [isExporting, setIsExporting] = useState(false);
    const [isExportingSummary, setIsExportingSummary] = useState(false);
    /** 輸出整併設定：總通知單／總表是否整併為單一 Doc */
    const [mergeNotificationSingleDoc, setMergeNotificationSingleDoc] = useState(false);
    const [mergeSummarySingleDoc, setMergeSummarySingleDoc] = useState(false);
    const [mergedDocTitleSuffix, setMergedDocTitleSuffix] = useState('');

    const buildExportOptions = (): AwardExportOptions => ({
        mergeNotificationSingleDoc,
        mergeSummarySingleDoc,
        mergedDocTitleSuffix: mergedDocTitleSuffix.trim() || undefined,
    });

    const handleExportDoc = async () => {
        if (parsedStudents.length === 0) return;
        setIsExporting(true);
        try {
            const payload: AwardRecord = {
                date,
                time,
                title,
                students: parsedStudents,
                exportOptions: buildExportOptions(),
            };
            
            const result = await createAwardDocs(payload);
            const docs = (result?.docs ?? result?.data?.docs) ?? [];
            if (docs.length) {
                const links = docs.map((d: any) => (
                    <div key={d.url} className="mb-2">
                        <a href={d.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center">
                            <FileText size={16} className="mr-2"/> {d.name}
                        </a>
                    </div>
                ));
                showModal('輸出成功', (
                    <div>
                        <p className="mb-4">
                            {mergeNotificationSingleDoc
                                ? '已產生「總通知單」整併 Doc（低中高分年級合併，年級段間分頁），請點擊連結查看：'
                                : '已依照高中低年級產生 Google Doc 通知單，請點擊連結查看：'}
                        </p>
                        {links}
                    </div>
                ), 'success');
            } else {
                throw new Error('未產生文件');
            }
        } catch (e: any) {
            showModal('輸出失敗', e.message, 'danger');
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportSummaryDoc = async () => {
        if (parsedStudents.length === 0) return;
        setIsExportingSummary(true);
        try {
            const payload: AwardRecord = {
                date,
                time,
                title,
                students: parsedStudents,
                exportOptions: buildExportOptions(),
            };
            
            const result = await createAwardSummaryDocs(payload);
            if (result && (result as any).success === false) {
                throw new Error((result as any).message || "Unknown backend error");
            }
            const docs = (result?.docs ?? (result as any)?.data?.docs) ?? [];
            if (docs.length) {
                const links = docs.map((d: any) => (
                    <div key={d.url} className="mb-2">
                        <a href={d.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center">
                            <FileText size={16} className="mr-2"/> {d.name}
                        </a>
                    </div>
                ));
                showModal('輸出成功', (
                    <div>
                        <p className="mb-4">
                            {mergeSummarySingleDoc
                                ? '已產生「總表」整併 Doc（全年級段合併，獎項仍分區；年級段間分頁），請點擊連結查看：'
                                : '已依照高中低年級產生 Google Doc 獲獎總表，請點擊連結查看：'}
                        </p>
                        {links}
                    </div>
                ), 'success');
            } else {
                throw new Error('未產生文件');
            }
        } catch (e: any) {
            showModal('輸出失敗', e.message, 'danger');
        } finally {
            setIsExportingSummary(false);
        }
    };

    const handleSave = async () => {
        if (parsedStudents.length === 0) return;
        setIsSaving(true);
        try {
            const payload: AwardRecord = {
                date,
                time,
                title,
                students: parsedStudents
            };
            
            await saveAwardRecord(payload);
            showModal('儲存成功', '頒獎紀錄已儲存至雲端，且新名單將納入自動完成資料庫。', 'success');
            fetchKnownStudents();
        } catch (e: any) {
            showModal('儲存失敗', e.message, 'danger');
        } finally {
            setIsSaving(false);
        }
    };

    const fetchHistory = async () => {
        setIsLoading(true);
        try {
            const data = await getAwardHistory();
            setHistoryRecords(data);
            setIsHistoryOpen(true);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const loadHistoryRecord = (record: AwardRecord) => {
        setDate(record.date);
        setTime(record.time || '08:00');
        setTitle(record.title);
        setParsedStudents(record.students);
        setIsHistoryOpen(false);
    };

    const showModal = (title: string, content: React.ReactNode, type: any) => {
        setModalState({ isOpen: true, title, content, type });
    };

    // --- Render ---

    const previewData: AwardRecord = {
        date,
        time,
        title,
        students: parsedStudents
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-20">
            <Modal 
                isOpen={modalState.isOpen} 
                title={modalState.title} 
                content={modalState.content} 
                onCancel={() => setModalState(prev => ({ ...prev, isOpen: false }))} 
                type={modalState.type}
            />

            {/* Notification Preview Overlay */}
            {isNotificationOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-100 overflow-auto">
                    {/* Top Bar with Filter Controls */}
                    <div className="fixed top-0 left-0 right-0 bg-white shadow-md p-4 flex justify-between items-center z-50 no-print h-16">
                         <div className="flex items-center gap-4">
                             <h2 className="font-bold text-lg text-gray-800 flex items-center">
                                 <Printer className="mr-2" size={20}/> 預覽與列印
                             </h2>
                             
                             {/* Grade Filter Tabs in Modal Header */}
                             <div className="flex bg-gray-100 p-1 rounded-lg">
                                 {[
                                     { id: 'all', label: '全校' },
                                     { id: 'low', label: '低年級 (1-2)' },
                                     { id: 'mid', label: '中年級 (3-4)' },
                                     { id: 'high', label: '高年級 (5-6)' }
                                 ].map(opt => (
                                     <button
                                        key={opt.id}
                                        onClick={() => setGradeFilter(opt.id as any)}
                                        className={`px-3 py-1.5 text-sm rounded-md transition-all font-medium ${
                                            gradeFilter === opt.id 
                                            ? 'bg-white text-blue-600 shadow-sm' 
                                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                                        }`}
                                     >
                                         {opt.label}
                                     </button>
                                 ))}
                             </div>
                         </div>

                         <div className="flex gap-3">
                             <button 
                                onClick={() => window.print()}
                                className="flex items-center px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-900 shadow transition-transform active:scale-95"
                             >
                                 <Printer size={18} className="mr-2" /> 列印
                             </button>
                             <button 
                                onClick={() => setIsNotificationOpen(false)}
                                className="flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 shadow transition-transform active:scale-95"
                             >
                                 <X size={18} className="mr-2" /> 關閉
                             </button>
                         </div>
                    </div>

                    <div className="w-full min-h-full pt-20 p-8 overflow-auto print:p-0 print:pt-0 print:overflow-visible">
                        {/* Grade Filter Prop passed here */}
                        <AwardNotification data={previewData} gradeFilter={gradeFilter} />
                    </div>
                </div>
            )}

            {/* History Modal */}
            {isHistoryOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 no-print">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
                        <div className="p-4 border-b flex justify-between items-center">
                            <h3 className="font-bold text-lg flex items-center"><History className="mr-2"/> 歷史紀錄</h3>
                            <button onClick={() => setIsHistoryOpen(false)}><X size={24}/></button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1 space-y-3">
                            {historyRecords.length === 0 ? <p className="text-center text-gray-400 py-4">無歷史紀錄</p> :
                                historyRecords.map(rec => (
                                    <div key={rec.id} className="border rounded p-3 flex justify-between items-center hover:bg-gray-50">
                                        <div>
                                            <div className="font-bold text-gray-800">{rec.date} {rec.title}</div>
                                            <div className="text-xs text-gray-500">獲獎人數: {rec.students.length} 人</div>
                                        </div>
                                        <button 
                                            onClick={() => loadHistoryRecord(rec)}
                                            className="px-3 py-1 bg-blue-50 text-blue-600 rounded border border-blue-200 hover:bg-blue-100 text-sm"
                                        >
                                            載入
                                        </button>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                        <Trophy className="mr-2 text-yellow-500" /> 頒獎通知單製作
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">建立獲獎名單，並依年級區段自動分流產生通知單。</p>
                </div>
                <div className="flex gap-2">
                     <button
                        onClick={fetchHistory}
                        className="flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 shadow-sm"
                    >
                        {isLoading ? <Loader2 className="animate-spin mr-2"/> : <History size={18} className="mr-2" />}
                        讀取歷史
                    </button>
                    {parsedStudents.length > 0 && (
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="flex items-center px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 shadow disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 className="animate-spin mr-2"/> : <Save size={18} className="mr-2" />}
                            儲存紀錄
                        </button>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 no-print">
                
                {/* Left: Input */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <h3 className="font-bold text-lg mb-4 text-gray-700 border-b pb-2">1. 設定頒獎資訊</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-1">頒獎日期</label>
                                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border rounded p-2"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-1">頒獎時間</label>
                                <input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full border rounded p-2"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-1">標題 / 場合</label>
                                <input 
                                    type="text" 
                                    value={title} 
                                    onChange={e => setTitle(e.target.value)} 
                                    className="w-full border rounded p-2"
                                    placeholder="例如：第10週朝會頒獎"
                                    list="ceremony-titles"
                                />
                                <datalist id="ceremony-titles">
                                    <option value="朝會頒獎"/>
                                    <option value="結業式頒獎"/>
                                    <option value="校慶頒獎"/>
                                </datalist>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 flex flex-col overflow-hidden">
                        {/* Input Tabs */}
                        <div className="flex border-b border-gray-200 bg-gray-50">
                             <button 
                                onClick={() => setActiveTab('manual')}
                                className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'manual' ? 'bg-white text-blue-600 border-t-2 border-t-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                             >
                                 <UserPlus size={16}/> 建置名單 (手動)
                             </button>
                             <button 
                                onClick={() => setActiveTab('batch_list')}
                                className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'batch_list' ? 'bg-white text-blue-600 border-t-2 border-t-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                             >
                                 <Clipboard size={16}/> 批次貼上 (Excel)
                             </button>
                        </div>
                        
                        <div className="p-6">
                             {activeTab === 'manual' ? (
                                <div className="space-y-4">
                                    {/* Sub-tabs for Manual Mode */}
                                    <div className="flex space-x-2 mb-4">
                                        <button 
                                            onClick={() => setManualMode('single')}
                                            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${manualMode === 'single' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
                                        >
                                            逐筆輸入
                                        </button>
                                        <button 
                                            onClick={() => setManualMode('group')}
                                            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${manualMode === 'group' ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100'}`}
                                        >
                                            多人同獎項 (批次)
                                        </button>
                                    </div>

                                    {manualMode === 'single' ? (
                                        <>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <div className="relative" ref={suggestionRef}>
                                                    <label className="block text-xs font-medium text-gray-500 mb-1">姓名 (自動搜尋)</label>
                                                    <input 
                                                        type="text" 
                                                        value={manualInput.name} 
                                                        onChange={handleNameChange}
                                                        className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-300" 
                                                        placeholder="輸入姓名"
                                                    />
                                                    {showSuggestions && (
                                                        <ul className="absolute z-10 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto mt-1">
                                                            {filteredSuggestions.map((s, idx) => (
                                                                <li 
                                                                    key={idx} 
                                                                    onClick={() => selectSuggestion(s)}
                                                                    className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm flex justify-between"
                                                                >
                                                                    <span>{s.name}</span>
                                                                    <span className="text-gray-400 text-xs bg-gray-100 px-1 rounded">{s.className}班</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-500 mb-1">班級</label>
                                                    <input 
                                                        type="text" 
                                                        value={manualInput.className} 
                                                        onChange={e => setManualInput({...manualInput, className: e.target.value})}
                                                        className="w-full border rounded p-2" 
                                                        placeholder="例: 101"
                                                    />
                                                </div>
                                                <div className="relative">
                                                    <label className="block text-xs font-medium text-gray-500 mb-1 flex justify-between">
                                                        獎項名稱 / 名次
                                                        <button 
                                                            onClick={() => setIsAwardLocked(!isAwardLocked)}
                                                            className={`text-xs flex items-center gap-1 ${isAwardLocked ? 'text-orange-600 font-bold' : 'text-gray-400'}`}
                                                            title={isAwardLocked ? "已鎖定 (輸入後不清除)" : "點擊鎖定"}
                                                        >
                                                            {isAwardLocked ? <Lock size={10}/> : <Unlock size={10}/>}
                                                            {isAwardLocked ? '鎖定' : '未鎖'}
                                                        </button>
                                                    </label>
                                                    <input 
                                                        type="text" 
                                                        value={manualInput.awardName} 
                                                        onChange={e => setManualInput({...manualInput, awardName: e.target.value})}
                                                        onKeyDown={e => e.key === 'Enter' && handleManualAdd()}
                                                        className={`w-full border rounded p-2 transition-colors ${isAwardLocked ? 'bg-orange-50 border-orange-200' : ''}`}
                                                        placeholder="例: 第一名"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex justify-end pt-2">
                                                <button 
                                                    onClick={handleManualAdd}
                                                    className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 flex items-center"
                                                >
                                                    <UserPlus size={16} className="mr-2"/> 加入清單
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        // Group Mode
                                        <div className="space-y-3 bg-purple-50 p-4 rounded-lg border border-purple-100">
                                            <div>
                                                <label className="block text-xs font-bold text-purple-700 mb-1">獎項名稱 (共用)</label>
                                                <input 
                                                    type="text" 
                                                    value={groupInput.awardName} 
                                                    onChange={e => setGroupInput({...groupInput, awardName: e.target.value})}
                                                    className="w-full border rounded p-2" 
                                                    placeholder="例如: 繪畫比賽 優選"
                                                />
                                            </div>
                                            <div className="relative" ref={groupSuggestionRef}>
                                                <label className="block text-xs font-bold text-purple-700 mb-1">姓名 (自動搜尋帶入)</label>
                                                <input 
                                                    type="text" 
                                                    value={groupSearchName} 
                                                    onChange={handleGroupNameSearch}
                                                    className="w-full border rounded p-2" 
                                                    placeholder="輸入姓名，選取後以目前獎項加入名單"
                                                />
                                                {showSuggestions && (
                                                    <ul className="absolute z-10 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto mt-1">
                                                        {filteredSuggestions.map((s, idx) => (
                                                            <li 
                                                                key={idx} 
                                                                onClick={() => selectGroupSuggestion(s)}
                                                                className="px-3 py-2 hover:bg-purple-50 cursor-pointer text-sm flex justify-between"
                                                            >
                                                                <span>{s.name}</span>
                                                                <span className="text-gray-400 text-xs bg-gray-100 px-1 rounded">{s.className}班</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-purple-700 mb-1">學生名單 (一行一位)</label>
                                                <textarea 
                                                    value={groupInput.studentListText}
                                                    onChange={e => setGroupInput({...groupInput, studentListText: e.target.value})}
                                                    className="w-full h-32 border rounded p-2 text-sm"
                                                    placeholder={`101 王小明\n102 李小華`}
                                                />
                                            </div>
                                            <div className="flex justify-end">
                                                <button 
                                                    onClick={handleGroupAdd}
                                                    className="bg-purple-600 text-white px-4 py-2 rounded text-sm hover:bg-purple-700 flex items-center"
                                                >
                                                    <Users size={16} className="mr-2"/> 批次加入
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                             ) : (
                                // Batch Excel Mode
                                <>
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="font-bold text-sm text-gray-700">Excel 格式貼上或上傳</h3>
                                        <div className="flex items-center gap-2">
                                            <label className="cursor-pointer bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded text-xs font-bold hover:bg-green-100 transition-colors flex items-center">
                                                <Upload size={14} className="mr-1" />
                                                上傳 Excel
                                                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
                                            </label>
                                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">格式：班級 姓名 獎項</span>
                                        </div>
                                    </div>
                                    <textarea 
                                        value={inputText}
                                        onChange={e => setInputText(e.target.value)}
                                        placeholder={`請直接從 Excel 複製貼上，或手動輸入。\n\n範例：\n101 王小明 閱讀小博士\n102 李小華 潔牙比賽第一名\n201 張三   模範生`}
                                        className="w-full h-40 border rounded p-3 text-sm font-mono focus:ring-2 focus:ring-yellow-400 border-gray-300"
                                    />
                                    <div className="mt-3 flex justify-end">
                                        <button 
                                            onClick={parseText}
                                            disabled={!inputText.trim()}
                                            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            <Clipboard size={16} className="mr-2"/> 解析匯入
                                        </button>
                                    </div>
                                </>
                             )}
                             <div className="mt-4">
                                 <div className="flex items-center gap-2 mb-2">
                                     <label className="text-xs font-medium text-gray-500">名單學年</label>
                                     <input type="text" value={rosterYear} onChange={(e) => setRosterYear(e.target.value)} className="w-14 border rounded px-2 py-1 text-sm" placeholder="114" />
                                 </div>
                                 <RosterStudentSource academicYear={rosterYear} defaultCollapsed hint="拖曳至右側名單" />
                             </div>
                        </div>
                    </div>
                </div>

                {/* Right: Preview List */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-[600px]">
                    <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                             <h3 className="font-bold text-lg text-gray-700">3. 確認名單</h3>
                             <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">{parsedStudents.length} 人</span>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleClear} className="text-gray-400 hover:text-red-500 p-1" title="清空"><RotateCcw size={18}/></button>
                        </div>
                    </div>
                    
                    <div
                        className="flex-1 overflow-auto p-0"
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                        onDrop={(e) => {
                            e.preventDefault();
                            const raw = e.dataTransfer.getData(ROSTER_DRAG_TYPE);
                            if (!raw) return;
                            try {
                                const { className, name, seat } = JSON.parse(raw);
                                if (className && name) {
                                    const awardName = groupInput.awardName || manualInput.awardName || '獲獎';
                                    setParsedStudents((prev) => [...prev, { className, name, awardName, ...(seat != null && seat !== '' && { seat: String(seat) }) }]);
                                }
                            } catch (_) {}
                        }}
                    >
                        {parsedStudents.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                <Search size={48} className="mb-2 opacity-20"/>
                                <p>尚未輸入資料</p>
                            </div>
                        ) : (
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2 w-20">班級</th>
                                        <th className="px-4 py-2 w-12">座號</th>
                                        <th className="px-4 py-2 w-24">姓名</th>
                                        <th className="px-4 py-2">獎項</th>
                                        <th className="px-4 py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {parsedStudents.map((s, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="px-4 py-2 font-medium">{s.className}</td>
                                            <td className="px-4 py-2 text-gray-600">{s.seat ?? '-'}</td>
                                            <td className="px-4 py-2">{s.name}</td>
                                            <td className="px-4 py-2 text-gray-600">{s.awardName}</td>
                                            <td className="px-4 py-2 text-center">
                                                <button onClick={() => handleDeleteStudent(i)} className="text-gray-300 hover:text-red-500"><X size={14}/></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    <div className="p-4 border-t bg-gray-50 flex flex-col gap-3">
                         <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
                             <div className="text-xs font-bold text-gray-600 flex items-center gap-1">
                                 <LayoutList size={14}/> 輸出設定（整併）
                             </div>
                             <label className="flex items-start gap-2 cursor-pointer text-sm">
                                 <input
                                     type="checkbox"
                                     checked={mergeNotificationSingleDoc}
                                     onChange={(e) => setMergeNotificationSingleDoc(e.target.checked)}
                                     className="mt-0.5"
                                 />
                                 <span>
                                     <span className="font-medium text-gray-800">總通知單整併</span>
                                     <span className="block text-gray-500 text-xs mt-0.5">不同年級段不成多份 Doc，改為一份「總通知單」，年級段之間自動分頁。</span>
                                 </span>
                             </label>
                             <label className="flex items-start gap-2 cursor-pointer text-sm">
                                 <input
                                     type="checkbox"
                                     checked={mergeSummarySingleDoc}
                                     onChange={(e) => setMergeSummarySingleDoc(e.target.checked)}
                                     className="mt-0.5"
                                 />
                                 <span>
                                     <span className="font-medium text-gray-800">總表整併</span>
                                     <span className="block text-gray-500 text-xs mt-0.5">不同獎項仍分區塊顯示，但全年級做進同一份總表 Doc，方便存檔與列印。</span>
                                 </span>
                             </label>
                             <div>
                                 <label className="block text-xs text-gray-500 mb-1">整併檔名後綴（選填）</label>
                                 <input
                                     type="text"
                                     value={mergedDocTitleSuffix}
                                     onChange={(e) => setMergedDocTitleSuffix(e.target.value)}
                                     placeholder="例如：語文競賽合併"
                                     className="w-full border rounded px-2 py-1 text-sm"
                                 />
                             </div>
                         </div>
                         <div className="flex items-center gap-2 text-gray-500 text-xs">
                             <ListFilter size={14}/>
                             <span>產生後可在預覽畫面切換年級篩選</span>
                         </div>
                         <div className="grid grid-cols-3 gap-2">
                             <button 
                                onClick={() => setIsNotificationOpen(true)}
                                disabled={parsedStudents.length === 0}
                                className="flex flex-col items-center justify-center p-2 bg-slate-800 text-white rounded hover:bg-slate-900 shadow-md disabled:opacity-50 transition-transform active:scale-95 text-xs"
                             >
                                 <Printer size={16} className="mb-1"/> 預覽列印
                             </button>
                             <button 
                                onClick={handleExportDoc}
                                disabled={parsedStudents.length === 0 || isExporting}
                                className="flex flex-col items-center justify-center p-2 bg-blue-500 text-white rounded hover:bg-blue-600 shadow-md disabled:opacity-50 transition-transform active:scale-95 text-xs"
                             >
                                 {isExporting ? <Loader2 size={16} className="mb-1 animate-spin"/> : <FileText size={16} className="mb-1"/>}
                                 通知單 (Doc)
                             </button>
                             <button 
                                onClick={handleExportSummaryDoc}
                                disabled={parsedStudents.length === 0 || isExportingSummary}
                                className="flex flex-col items-center justify-center p-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 shadow-md disabled:opacity-50 transition-transform active:scale-95 text-xs"
                             >
                                 {isExportingSummary ? <Loader2 size={16} className="mb-1 animate-spin"/> : <LayoutList size={16} className="mb-1"/>}
                                 總表 (Doc)
                             </button>
                         </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AwardGenerator;