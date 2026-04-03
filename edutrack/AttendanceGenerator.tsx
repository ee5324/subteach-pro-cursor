import React, { useState } from 'react';
import { Printer, Save, Users, FileText, Calendar as CalendarIcon, Info, RefreshCw, X } from 'lucide-react';
import AttendanceSheet from './components/AttendanceSheet';
import CourseNotification from './components/CourseNotification';
import Modal from './components/Modal';
import { AttendanceTableData, Student } from './types';
import { getHistory, getCourseStudents, importFromSpreadsheet, saveCourseConfig } from './services/api';
import RosterStudentSource, { ROSTER_DRAG_TYPE } from './components/RosterStudentSource';

const AttendanceGenerator: React.FC = () => {
    // Basic Info
    const [academicYear, setAcademicYear] = useState('113');
    const [semester, setSemester] = useState('下學期');
    const [courseName, setCourseName] = useState('');
    const [instructorName, setInstructorName] = useState('');
    const [location, setLocation] = useState('');
    const [classTime, setClassTime] = useState(''); // e.g. 週一 08:00-08:40
    const [defaultPeriod, setDefaultPeriod] = useState('第一節'); // For student column B

    // Dates
    const [dates, setDates] = useState<Date[]>([]);
    const [dateInput, setDateInput] = useState(''); // For manual add
    const [genStartDate, setGenStartDate] = useState('');
    const [genEndDate, setGenEndDate] = useState('');
    const [genDayOfWeek, setGenDayOfWeek] = useState('1'); // 1=Mon

    // Students
    const [studentText, setStudentText] = useState('');
    const [parsedStudents, setParsedStudents] = useState<Student[]>([]);

    // View Control
    const [activeView, setActiveView] = useState<'editor' | 'sheet' | 'notification'>('editor');
    const [modalState, setModalState] = useState<{isOpen: boolean, title: string, content: React.ReactNode, type: any}>({
        isOpen: false, title: '', content: null, type: 'info'
    });
    const [isSaving, setIsSaving] = useState(false);
    const [history, setHistory] = useState<any[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    // Handlers
    const fetchHistory = async () => {
        setIsLoadingHistory(true);
        try {
            const data = await getHistory();
            setHistory(data);
        } catch (e) {
            console.error("Failed to fetch history", e);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    const handleLoadRecord = async (record: any) => {
        setAcademicYear(record.academicYear);
        setSemester(record.semester);
        setCourseName(record.courseName);
        setInstructorName(record.instructor);
        setLocation(record.location);
        
        // Remove period suffix if exists for the input field
        const baseTime = record.classTime.split(' (')[0];
        setClassTime(baseTime);

        // Fetch students for this record (Firebase)
        try {
            const data = await getCourseStudents(record.id);
            if (data.length) {
                setParsedStudents(data);
                const periods = [...new Set(data.map((s: any) => s.period))];
                let text = '';
                periods.forEach(p => {
                    text += `[${p}]\n`;
                    data.filter((s: any) => s.period === p).forEach((s: any) => {
                        text += `${s.className} ${s.name}\n`;
                    });
                    text += '\n';
                });
                setStudentText(text.trim());
            }
        } catch (e) {
            console.error("Failed to fetch students", e);
        }
        
        setModalState(prev => ({ ...prev, isOpen: false }));
        showModal('讀取成功', `已載入 ${record.courseName} 的資料。`, 'success');
    };

    const [importUrl, setImportUrl] = useState('');
    const [isImporting, setIsImporting] = useState(false);

    const handleImportFromUrl = async () => {
        if (!importUrl) return;
        setIsImporting(true);
        try {
            const record = await importFromSpreadsheet({ url: importUrl });
            if (record) {
                setAcademicYear(record.academicYear);
                setSemester(record.semester);
                setCourseName(record.courseName);
                setInstructorName(record.instructorName);
                setLocation(record.location);
                setClassTime(record.classTime);
                setParsedStudents(record.students || []);
                const periods = [...new Set((record.students || []).map((s: any) => s.period))];
                let text = '';
                periods.forEach(p => {
                    text += `[${p}]\n`;
                    (record.students || []).filter((s: any) => s.period === p).forEach((s: any) => {
                        text += `${s.className} ${s.name}\n`;
                    });
                    text += '\n';
                });
                setStudentText(text.trim());
                setModalState(prev => ({ ...prev, isOpen: false }));
                showModal('匯入成功', `已從試算表載入 ${record.courseName} 的資料。`, 'success');
                setImportUrl('');
            }
        } catch (e: any) {
            showModal('匯入失敗', e.message, 'danger');
        } finally {
            setIsImporting(false);
        }
    };

    const showHistoryModal = async () => {
        await fetchHistory();
        showModal('讀取舊雲端檔案 / 歷史紀錄', (
            <div className="space-y-6">
                {/* Import from URL Section */}
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <h4 className="font-bold text-blue-800 text-sm mb-2 flex items-center">
                        <FileText size={16} className="mr-1"/> 從 Google 試算表連結匯入
                    </h4>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={importUrl} 
                            onChange={e => setImportUrl(e.target.value)}
                            placeholder="貼上試算表網址 (需開啟共用權限)"
                            className="flex-1 text-sm border rounded px-3 py-2 focus:ring-2 focus:ring-blue-300 outline-none"
                        />
                        <button 
                            onClick={handleImportFromUrl}
                            disabled={isImporting || !importUrl}
                            className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                        >
                            {isImporting ? '匯入中...' : '匯入'}
                        </button>
                    </div>
                    <p className="text-[10px] text-blue-600 mt-1">※ 系統將嘗試解析該試算表中的點名單格式並還原至編輯器。</p>
                </div>

                <div className="border-t pt-4">
                    <h4 className="font-bold text-gray-700 text-sm mb-3">最近儲存紀錄</h4>
                    <div className="max-h-64 overflow-y-auto pr-2">
                        {isLoadingHistory ? (
                            <div className="text-center py-8">讀取中...</div>
                        ) : history.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">尚無儲存紀錄</div>
                        ) : (
                            <div className="space-y-2">
                                {history.map((h, i) => (
                                    <div key={i} className="border p-3 rounded hover:bg-gray-50 cursor-pointer flex justify-between items-center group transition-colors" onClick={() => handleLoadRecord(h)}>
                                        <div>
                                            <div className="font-bold text-gray-800 group-hover:text-blue-600 transition-colors">{h.courseName} - {h.instructor}</div>
                                            <div className="text-xs text-gray-500">{h.academicYear}學年 {h.semester} | {h.classTime}</div>
                                            <div className="text-xs text-gray-400 mt-1">儲存時間: {new Date(h.createdAt).toLocaleString()}</div>
                                        </div>
                                        <button className="text-blue-600 text-sm font-medium opacity-0 group-opacity-100 group-hover:opacity-100 transition-opacity">載入</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        ), 'info');
    };

    const handleAddDate = () => {
        if (dateInput) {
            const d = new Date(dateInput);
            if (!isNaN(d.getTime())) {
                setDates(prev => [...prev, d].sort((a,b) => a.getTime() - b.getTime()));
                setDateInput('');
            }
        }
    };

    const handleRemoveDate = (index: number) => {
        setDates(prev => prev.filter((_, i) => i !== index));
    };

    const handleGenerateDates = () => {
        if (!genStartDate || !genEndDate) return;
        const start = new Date(genStartDate);
        const end = new Date(genEndDate);
        const targetDay = parseInt(genDayOfWeek);
        const newDates: Date[] = [];
        
        let current = new Date(start);
        while (current <= end) {
            if (current.getDay() === targetDay) {
                newDates.push(new Date(current));
            }
            current.setDate(current.getDate() + 1);
        }
        setDates(prev => {
            // Merge and dedup
            const combined = [...prev, ...newDates];
            const unique = Array.from(new Set(combined.map(d => d.getTime()))).map(t => new Date(t));
            return unique.sort((a,b) => a.getTime() - b.getTime());
        });
        showModal('日期生成', `已生成 ${newDates.length} 個日期`, 'success');
    };

    const handleParseStudents = () => {
        const lines = studentText.split(/\r?\n/).filter(l => l.trim());
        const newStudents: Student[] = [];
        let currentPeriod = defaultPeriod;

        lines.forEach((line) => {
            // Check for header: [Period Name]
            const headerMatch = line.match(/^\[(.*?)\]/);
            if (headerMatch) {
                currentPeriod = headerMatch[1].trim();
                return;
            }

            const parts = line.split(/[\t\s,]+/).filter(p => p);
            
            let className = '';
            let name = '';
            
            if (parts.length >= 2) {
                if (/\d/.test(parts[0])) {
                    className = parts[0];
                    if (parts.length >= 3 && /^\d+$/.test(parts[1])) {
                         name = parts[2];
                    } else {
                         name = parts[1];
                    }
                } else {
                    name = parts[0];
                }
            }
            
            if (!className && parts.length > 0) className = '未分班';
            if (!name && parts.length > 0) name = parts[parts.length - 1];

            if (className && name) {
                newStudents.push({
                    id: (newStudents.length + 1).toString(),
                    period: currentPeriod,
                    className: className,
                    name: name
                });
            }
        });
        
        setParsedStudents(newStudents);
        if (newStudents.length > 0) {
            const periods = [...new Set(newStudents.map(s => s.period))];
            showModal('解析完成', `已解析 ${newStudents.length} 位學生，共 ${periods.length} 個節次。`, 'success');
        } else {
            showModal('解析失敗', '無法辨識學生資料', 'warning');
        }
    };

    const handleSaveToCloud = async () => {
        if (parsedStudents.length === 0) return;
        setIsSaving(true);
        
        try {
             const periods = [...new Set(parsedStudents.map(s => s.period))];
             const periodSuffix = periods.length > 1 ? ` (${periods.join(', ')})` : '';
             
             const payload = {
                 academicYear, semester, courseName, instructorName, location,
                 classTime: `${classTime}${periodSuffix}`,
                 dates: dates.map(d => d.toISOString()),
                 startDate: genStartDate || undefined,
                 endDate: genEndDate || undefined,
                 selectedDays: genDayOfWeek ? [Number(genDayOfWeek)] : undefined,
                 students: parsedStudents
             };
             await saveCourseConfig(payload);
             showModal('儲存成功', '點名單資料已儲存至雲端。', 'success');
        } catch (e: any) {
            showModal('儲存失敗', e.message, 'danger');
        } finally {
            setIsSaving(false);
        }
    };

    const showModal = (title: string, content: React.ReactNode, type: any) => {
        setModalState({ isOpen: true, title, content, type });
    };

    // Consolidated Data for Sheet View
    const periods = [...new Set(parsedStudents.map(s => s.period))];
    const periodSuffix = periods.length > 1 ? ` (${periods.join(', ')})` : '';
    
    const sheetData: AttendanceTableData = {
        academicYear,
        semester,
        courseName,
        instructorName,
        classTime: `${classTime}${periodSuffix}`,
        location,
        dates,
        students: parsedStudents
    };

    // Prepare Data for Notification
    const notificationData = {
        academicYear,
        semester,
        courseName,
        instructor: instructorName,
        classTime: `${classTime}${periodSuffix}`,
        location,
        students: parsedStudents
    };

    return (
        <div className="max-w-7xl mx-auto pb-20">
            <Modal {...modalState} onCancel={() => setModalState(prev => ({ ...prev, isOpen: false }))} />
            
            {/* Header / Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 no-print">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">本土語點名單製作 (矩陣式)</h1>
                    <p className="text-sm text-gray-500 mt-1">支援「同一老師多個時段」：在名單中使用 [第一節] 標籤區隔，系統將整併於同一張表單。</p>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                     <button onClick={showHistoryModal} className="px-4 py-2 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700 flex items-center">
                         <RefreshCw size={14} className="mr-1"/> 讀取紀錄
                     </button>
                     <div className="w-px h-4 bg-gray-300 self-center mx-1"></div>
                     <button onClick={() => setActiveView('editor')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeView === 'editor' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                         1. 編輯資料
                     </button>
                     <button onClick={() => setActiveView('sheet')} disabled={parsedStudents.length === 0} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeView === 'sheet' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                         2. 點名單預覽
                     </button>
                     <button onClick={() => setActiveView('notification')} disabled={parsedStudents.length === 0} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeView === 'notification' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                         3. 通知單預覽
                     </button>
                </div>
            </div>

            {/* View: Editor */}
            {activeView === 'editor' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: Course Settings */}
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                            <h3 className="font-bold text-lg text-gray-800 mb-4 border-b pb-2 flex items-center"><Info size={18} className="mr-2"/> 課程基本資訊</h3>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-1">學年度</label>
                                    <input type="text" value={academicYear} onChange={e => setAcademicYear(e.target.value)} className="w-full border rounded p-2"/>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-1">學期</label>
                                    <select value={semester} onChange={e => setSemester(e.target.value)} className="w-full border rounded p-2">
                                        <option value="上學期">上學期</option>
                                        <option value="下學期">下學期</option>
                                        <option value="暑期">暑期</option>
                                        <option value="寒期">寒期</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-1">課程名稱</label>
                                    <input type="text" value={courseName} onChange={e => setCourseName(e.target.value)} className="w-full border rounded p-2" placeholder="例: 閩南語"/>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-1">授課教師</label>
                                    <input type="text" value={instructorName} onChange={e => setInstructorName(e.target.value)} className="w-full border rounded p-2" placeholder="姓名"/>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-1">上課時間 (顯示用)</label>
                                    <input type="text" value={classTime} onChange={e => setClassTime(e.target.value)} className="w-full border rounded p-2" placeholder="例: 週一"/>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-1">上課地點</label>
                                    <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="w-full border rounded p-2" placeholder="教室"/>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-1">預設節次 (學生欄位用)</label>
                                <input type="text" value={defaultPeriod} onChange={e => setDefaultPeriod(e.target.value)} className="w-full border rounded p-2" placeholder="例: 第一節"/>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                             <h3 className="font-bold text-lg text-gray-800 mb-4 border-b pb-2 flex items-center"><CalendarIcon size={18} className="mr-2"/> 上課日期設定</h3>
                             
                             <div className="bg-blue-50 p-4 rounded mb-4">
                                 <h4 className="font-bold text-sm text-blue-800 mb-2">批次生成 (每週固定)</h4>
                                 <div className="grid grid-cols-3 gap-2 mb-2">
                                     <input type="date" value={genStartDate} onChange={e => setGenStartDate(e.target.value)} className="border rounded p-1 text-sm"/>
                                     <input type="date" value={genEndDate} onChange={e => setGenEndDate(e.target.value)} className="border rounded p-1 text-sm"/>
                                     <select value={genDayOfWeek} onChange={e => setGenDayOfWeek(e.target.value)} className="border rounded p-1 text-sm">
                                         <option value="1">週一</option>
                                         <option value="2">週二</option>
                                         <option value="3">週三</option>
                                         <option value="4">週四</option>
                                         <option value="5">週五</option>
                                         <option value="6">週六</option>
                                         <option value="0">週日</option>
                                     </select>
                                 </div>
                                 <button onClick={handleGenerateDates} className="w-full bg-blue-600 text-white py-1 rounded text-sm hover:bg-blue-700">生成日期</button>
                             </div>

                             <div className="mb-4">
                                 <label className="block text-sm font-medium text-gray-600 mb-1">手動加入日期</label>
                                 <div className="flex gap-2">
                                     <input type="date" value={dateInput} onChange={e => setDateInput(e.target.value)} className="flex-1 border rounded p-2"/>
                                     <button onClick={handleAddDate} className="bg-gray-800 text-white px-4 rounded hover:bg-gray-900">加入</button>
                                 </div>
                             </div>

                             <div className="mt-4">
                                 <p className="text-sm font-bold text-gray-700 mb-2">已選日期 ({dates.length})</p>
                                 <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                                     {dates.map((d, i) => (
                                         <span key={i} className="bg-gray-100 border border-gray-300 px-2 py-1 rounded text-sm flex items-center">
                                             {d.toLocaleDateString()}
                                             <button onClick={() => handleRemoveDate(i)} className="ml-2 text-gray-400 hover:text-red-500"><X size={12}/></button>
                                         </span>
                                     ))}
                                     {dates.length === 0 && <span className="text-gray-400 text-sm">尚未設定日期</span>}
                                 </div>
                             </div>
                        </div>
                    </div>

                    {/* Right: Students */}
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col h-full">
                         <h3 className="font-bold text-lg text-gray-800 mb-4 border-b pb-2 flex items-center justify-between">
                             <div className="flex items-center"><Users size={18} className="mr-2"/> 學生名單</div>
                             {parsedStudents.length > 0 && <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">{parsedStudents.length} 人</span>}
                         </h3>
                         <div className="mb-4">
                             <RosterStudentSource academicYear={academicYear} defaultCollapsed hint="拖曳至下方名單" />
                         </div>
                         <div className="flex-1 flex flex-col space-y-4">
                             <div className="flex-1">
                                 <label className="block text-sm font-medium text-gray-600 mb-1">貼上名單 (支援 [第一節] 標籤區隔)</label>
                                 <textarea 
                                    value={studentText}
                                    onChange={e => setStudentText(e.target.value)}
                                    className="w-full h-48 border rounded p-3 font-mono text-sm focus:ring-2 focus:ring-blue-300"
                                    placeholder={`[第一節]\n101 王小明\n102 李小華\n\n[第二節]\n201 張三\n202 李四`}
                                 />
                                 <div className="flex justify-between mt-2">
                                     <button onClick={() => setStudentText('')} className="text-sm text-gray-500 hover:text-red-500">清空</button>
                                     <button onClick={handleParseStudents} disabled={!studentText} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center">
                                         <RefreshCw size={14} className="mr-2"/> 解析名單
                                     </button>
                                 </div>
                             </div>

                             <div className="flex-1 border-t pt-4 flex flex-col overflow-hidden">
                                 <p className="text-sm font-bold text-gray-700 mb-2">解析結果預覽（可從上方學生名單拖曳加入）</p>
                                 <div
                                     className="flex-1 overflow-y-auto border rounded bg-gray-50 p-0"
                                     onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                                     onDrop={(e) => {
                                         e.preventDefault();
                                         const raw = e.dataTransfer.getData(ROSTER_DRAG_TYPE);
                                         if (!raw) return;
                                         try {
                                             const { className, name, seat } = JSON.parse(raw);
                                             if (className && name) {
                                                 const nextId = parsedStudents.length > 0
                                                     ? String(Math.max(...parsedStudents.map((s) => parseInt(s.id, 10) || 0)) + 1)
                                                     : '1';
                                                 setParsedStudents((prev) => [...prev, { id: nextId, period: defaultPeriod, className, name, ...(seat != null && seat !== '' && { seat: String(seat) }) }]);
                                             }
                                         } catch (_) {}
                                     }}
                                 >
                                     <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-100 sticky top-0">
                                            <tr>
                                                <th className="px-3 py-1">編號</th>
                                                <th className="px-3 py-1">班級</th>
                                                <th className="px-3 py-1 w-12">座號</th>
                                                <th className="px-3 py-1">姓名</th>
                                                <th className="px-3 py-1">節次</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {parsedStudents.map((s, i) => (
                                                <tr key={i}>
                                                    <td className="px-3 py-1">{s.id}</td>
                                                    <td className="px-3 py-1">{s.className}</td>
                                                    <td className="px-3 py-1 text-gray-600">{s.seat ?? '-'}</td>
                                                    <td className="px-3 py-1">{s.name}</td>
                                                    <td className="px-3 py-1 text-gray-500">{s.period}</td>
                                                </tr>
                                            ))}
                                         </tbody>
                                     </table>
                                     {parsedStudents.length === 0 && <div className="text-center py-8 text-gray-400">尚未解析資料</div>}
                                 </div>
                             </div>
                         </div>
                    </div>
                </div>
            )}

            {/* View: Sheet Preview */}
            {activeView === 'sheet' && (
                <div className="space-y-4">
                     <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex justify-between items-center no-print">
                         <div className="text-sm text-blue-800">
                             <strong>預覽模式</strong> - 已整併 {periods.length} 個節次於同一張表單。
                         </div>
                         <div className="flex gap-2">
                            <button onClick={() => window.print()} className="flex items-center bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-900">
                                <Printer size={18} className="mr-2"/> 列印
                            </button>
                            <button onClick={handleSaveToCloud} disabled={isSaving} className="flex items-center bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50">
                                <Save size={18} className="mr-2"/> 儲存至雲端
                            </button>
                         </div>
                     </div>
                     
                     <AttendanceSheet data={sheetData} />
                </div>
            )}

            {/* View: Notification Preview */}
            {activeView === 'notification' && (
                <div className="space-y-4">
                     <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg flex justify-between items-center no-print">
                         <div className="text-sm text-purple-800">
                             <strong>開課通知單預覽</strong> - 已整合所有節次的通知單。
                         </div>
                         <div className="flex gap-2">
                            <button onClick={() => window.print()} className="flex items-center bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-900">
                                <Printer size={18} className="mr-2"/> 列印
                            </button>
                         </div>
                     </div>
                     <CourseNotification data={notificationData} />
                </div>
            )}
        </div>
    );
};

export default AttendanceGenerator;