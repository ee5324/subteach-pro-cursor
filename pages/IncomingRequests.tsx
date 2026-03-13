
import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callGasApi } from '../utils/api';
import { Loader2, Download, UserPlus, FileText, CheckCircle, ExternalLink, Calendar, Info, Archive, RefreshCcw, EyeOff, LayoutList } from 'lucide-react';
import Modal, { ModalMode, ModalType } from '../components/Modal';
import { LeaveRecord, Teacher, TeacherType, PayType, TimetableSlot } from '../types';
import type { TeacherLeaveRequestDoc } from '../types';
import { convertSlotsToDetails } from '../utils/calculations';
import InstructionPanel from '../components/InstructionPanel';

/** 老師填寫請假單的 Vercel 表單網址（以本機顯示為主） */
const getTeacherRequestFormUrl = () => typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname || '/'}#/teacher-request` : '#/teacher-request';

// Interface for raw request from GAS
interface IncomingRequest {
    uuid: string;
    timestamp: string;
    teacherName: string;
    leaveType: string;
    reason: string;
    docId: string;
    startDate: string;
    endDate: string;
    payType: string;
    substituteTeacher: string;
    detailsJson: string; // JSON string of details
    fileUrl: string;
    status: string;
}

type TabType = 'pending' | 'archived';

const IncomingRequests: React.FC = () => {
    const { settings, teachers, addRecord, addTeacher, salaryGrades, teacherLeaveRequests, updateTeacherLeaveRequestStatus } = useAppStore();
    const [requests, setRequests] = useState<IncomingRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
    const [currentTab, setCurrentTab] = useState<TabType>('pending');

    // Track which items have been imported locally in this session (visual cue)
    const [importedIds, setImportedIds] = useState<Set<string>>(new Set());

    // Modal State
    const [modal, setModal] = useState<{
        isOpen: boolean; title: string; message: string; type: ModalType; mode: ModalMode; onConfirm?: () => void;
    }>({ isOpen: false, title: '', message: '', type: 'info', mode: 'alert' });

    const closeModal = () => setModal(prev => ({ ...prev, isOpen: false }));
    const showModal = (props: Partial<typeof modal>) => {
        setModal({ isOpen: true, title: props.title || '訊息', message: props.message || '', type: props.type || 'info', mode: props.mode || 'alert', onConfirm: props.onConfirm });
    };

    const fetchRequests = async () => {
        if (!settings.gasWebAppUrl) return;
        setLoading(true);
        try {
            const res = await callGasApi(settings.gasWebAppUrl, 'GET_TEACHER_REQUESTS', {});
            setRequests(res.data || []);
        } catch (e: any) {
            console.error(e);
            showModal({ title: '讀取失敗', message: e.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, [settings.gasWebAppUrl]);

    // 待處理：Firestore (本系統) + GAS
    const pendingFirestore = useMemo(() => teacherLeaveRequests.filter(r => r.status === 'pending'), [teacherLeaveRequests]);
    const pendingGas = useMemo(() => requests.filter(r => r.status !== 'Processed'), [requests]);
    const archivedFirestore = useMemo(() => teacherLeaveRequests.filter(r => r.status === 'archived'), [teacherLeaveRequests]);
    const archivedGas = useMemo(() => requests.filter(r => r.status === 'Processed'), [requests]);

    const pendingCount = pendingFirestore.length + pendingGas.length;

    const handleImport = async (req: IncomingRequest) => {
        // Import Logic ONLY (No archiving)
        try {
            // 1. Check Teacher Exists
            let teacherId = teachers.find(t => t.name === req.teacherName)?.id;
            let isNewTeacher = false;

            if (!teacherId) {
                // Auto create teacher
                isNewTeacher = true;
                teacherId = req.teacherName; // Use name as ID
                const newTeacher: Teacher = {
                    id: teacherId,
                    name: req.teacherName,
                    type: TeacherType.INTERNAL, // Assume internal for leave requests
                    hasCertificate: false,
                    isRetired: false,
                    isSpecialEd: false,
                    isGraduatingHomeroom: false,
                    baseSalary: 0,
                    researchFee: 0,
                    isHomeroom: false,
                    note: '由外部申請自動建立'
                };
                addTeacher(newTeacher);
            }

            // 2. Parse Slots/Details
            let slots: TimetableSlot[] = [];
            try {
                const rawDetails = JSON.parse(req.detailsJson);
                if (Array.isArray(rawDetails)) {
                    slots = rawDetails.map((d: any) => ({
                        date: d.date,
                        period: d.period,
                        subject: d.subject || '未定',
                        className: d.className || '未定',
                        substituteTeacherId: null, // Default to pending
                        payType: req.payType === '日薪' ? PayType.DAILY : req.payType === '半日薪' ? PayType.HALF_DAY : PayType.HOURLY
                    }));
                }
            } catch (e) {
                console.error("Failed to parse details JSON", e);
            }

            // 3. Create Leave Record
            if (req.substituteTeacher && req.substituteTeacher !== '教學組媒合') {
                let subId = teachers.find(t => t.name === req.substituteTeacher)?.id;
                if (!subId) {
                    subId = req.substituteTeacher;
                    addTeacher({
                        id: subId, name: subId, type: TeacherType.EXTERNAL,
                        hasCertificate: false, isRetired: false, isSpecialEd: false, isGraduatingHomeroom: false,
                        baseSalary: 0, researchFee: 0, isHomeroom: false, note: '由外部申請自動建立 (代課)'
                    });
                }
                slots = slots.map(s => ({ ...s, substituteTeacherId: subId }));
            }

            const details = convertSlotsToDetails(slots, teachers, salaryGrades);

            const newRecord: LeaveRecord = {
                id: crypto.randomUUID(),
                originalTeacherId: teacherId,
                leaveType: req.leaveType as any,
                reason: req.reason,
                docId: req.docId,
                applicationDate: new Date(req.timestamp).toISOString().split('T')[0],
                startDate: req.startDate,
                endDate: req.endDate,
                slots: slots,
                details: details,
                createdAt: Date.now(),
                allowPartial: false 
            };

            addRecord(newRecord);
            
            // Mark as imported visually
            setImportedIds(prev => new Set(prev).add(req.uuid));

            let msg = `已成功匯入「${req.teacherName}」的請假單。\n資料已進入系統，您可以點擊「隱藏/歸檔」將此申請單移出待處理區。`;
            if (isNewTeacher) msg += `\n(系統已自動建立新教師資料)`;
            
            showModal({ title: '匯入成功', message: msg, type: 'success' });

        } catch (e: any) {
            showModal({ title: '匯入失敗', message: e.message, type: 'error' });
        }
    };

    const handleImportFirestore = async (req: TeacherLeaveRequestDoc) => {
        try {
            let teacherId = teachers.find(t => t.name === req.teacherName)?.id;
            let isNewTeacher = false;
            if (!teacherId) {
                isNewTeacher = true;
                teacherId = req.teacherName;
                const newTeacher: Teacher = {
                    id: teacherId, name: req.teacherName, type: TeacherType.INTERNAL,
                    hasCertificate: false, isRetired: false, isSpecialEd: false, isGraduatingHomeroom: false,
                    baseSalary: 0, researchFee: 0, isHomeroom: false, note: '由本系統教師請假表單新增',
                };
                addTeacher(newTeacher);
            }
            const payTypeEnum = req.payType === '日薪' ? PayType.DAILY : req.payType === '半日薪' ? PayType.HALF_DAY : PayType.HOURLY;
            const slots: TimetableSlot[] = (req.details || []).map(d => ({
                date: d.date, period: d.period, subject: d.subject || '未定', className: d.className || '未定',
                substituteTeacherId: null, payType: payTypeEnum,
            }));
            if (req.substituteTeacher && req.substituteTeacher !== '教學組媒合') {
                let subId = teachers.find(t => t.name === req.substituteTeacher)?.id;
                if (!subId) {
                    subId = req.substituteTeacher;
                    addTeacher({ id: subId, name: subId, type: TeacherType.EXTERNAL, hasCertificate: false, isRetired: false, isSpecialEd: false, isGraduatingHomeroom: false, baseSalary: 0, researchFee: 0, isHomeroom: false, note: '由本系統教師請假表單新增 (代課)' });
                }
                slots.forEach(s => { s.substituteTeacherId = subId; });
            }
            const details = convertSlotsToDetails(slots, teachers, salaryGrades);
            const newRecord: LeaveRecord = {
                id: crypto.randomUUID(),
                originalTeacherId: teacherId,
                leaveType: req.leaveType as LeaveRecord['leaveType'],
                reason: req.reason,
                docId: req.docId,
                applicationDate: new Date(req.createdAt).toISOString().split('T')[0],
                startDate: req.startDate,
                endDate: req.endDate,
                slots,
                details,
                createdAt: Date.now(),
                allowPartial: false,
            };
            addRecord(newRecord);
            await updateTeacherLeaveRequestStatus(req.id, 'imported');
            let msg = `已成功匯入「${req.teacherName}」的請假單。`;
            if (isNewTeacher) msg += ' (系統已自動建立新教師資料)';
            showModal({ title: '匯入成功', message: msg, type: 'success' });
        } catch (e: any) {
            showModal({ title: '匯入失敗', message: e?.message || '請稍後再試', type: 'error' });
        }
    };

    const handleArchive = async (req: IncomingRequest) => {
        setActionLoadingId(req.uuid);
        try {
            await callGasApi(settings.gasWebAppUrl, 'ARCHIVE_REQUEST', { uuid: req.uuid });
            // Update Local State
            setRequests(prev => prev.map(r => r.uuid === req.uuid ? { ...r, status: 'Processed' } : r));
        } catch (e: any) {
            showModal({ title: '歸檔失敗', message: e.message, type: 'error' });
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleRestore = async (req: IncomingRequest) => {
        setActionLoadingId(req.uuid);
        try {
            await callGasApi(settings.gasWebAppUrl, 'RESTORE_REQUEST', { uuid: req.uuid });
            setRequests(prev => prev.map(r => r.uuid === req.uuid ? { ...r, status: 'Pending' } : r));
            showModal({ title: '還原成功', message: '該申請單已移回「待處理」列表。', type: 'success' });
        } catch (e: any) {
            showModal({ title: '還原失敗', message: e.message, type: 'error' });
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleArchiveFirestore = async (req: TeacherLeaveRequestDoc) => {
        setActionLoadingId(req.id);
        try {
            await updateTeacherLeaveRequestStatus(req.id, 'archived');
            showModal({ title: '已歸檔', message: '該申請已移至已歸檔。', type: 'success' });
        } catch (e: any) {
            showModal({ title: '歸檔失敗', message: e?.message, type: 'error' });
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleRestoreFirestore = async (req: TeacherLeaveRequestDoc) => {
        setActionLoadingId(req.id);
        try {
            await updateTeacherLeaveRequestStatus(req.id, 'pending');
            showModal({ title: '還原成功', message: '該申請已移回待處理列表。', type: 'success' });
        } catch (e: any) {
            showModal({ title: '還原失敗', message: e?.message, type: 'error' });
        } finally {
            setActionLoadingId(null);
        }
    };

    return (
        <div className="p-8 pb-32">
            <Modal isOpen={modal.isOpen} onClose={closeModal} onConfirm={modal.onConfirm} title={modal.title} message={modal.message} type={modal.type} mode={modal.mode} />

            <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 flex items-center">
                        <FileText className="mr-3 text-indigo-600" />
                        外部請假申請
                    </h1>
                    <p className="text-slate-500 mt-2">
                        審核並匯入老師透過公開網頁提交的請假單。
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <a
                        href={getTeacherRequestFormUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white border border-indigo-600 hover:bg-indigo-700 transition-colors text-sm font-medium"
                    >
                        <ExternalLink size={18} />
                        <span>老師填寫請假單（本系統表單）</span>
                    </a>
                    {settings.gasWebAppUrl && (
                        <a
                            href={`${settings.gasWebAppUrl}${settings.gasWebAppUrl.includes('?') ? '&' : '?'}page=request`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-colors text-sm font-medium"
                        >
                            <ExternalLink size={18} />
                            <span>GAS 表單（選用）</span>
                        </a>
                    )}
                    <button onClick={fetchRequests} disabled={loading} className="bg-white border border-slate-300 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 flex items-center space-x-2 transition-colors">
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                        <span>重新讀取 GAS</span>
                    </button>
                </div>
            </header>

            <InstructionPanel title="使用說明：外部請假申請">
                <ul className="list-disc pl-5 space-y-1">
                    <li><strong>功能概述：</strong>此頁面顯示老師透過「本系統表單」或 GAS 表單提交的請假申請。請以「老師填寫請假單（本系統表單）」連結提供給老師，表單由 Vercel 提供，無需 GAS。</li>
                    <li><strong>匯入操作：</strong>
                        <ul className="list-circle pl-5 mt-1 text-slate-500">
                            <li>點擊「匯入系統」按鈕，系統將自動建立對應的代課單與教師資料。</li>
                            <li>若為新教師，系統會自動建立教師檔案並標記為「新教師」。</li>
                        </ul>
                    </li>
                    <li><strong>歸檔管理：</strong>
                        <ul className="list-circle pl-5 mt-1 text-slate-500">
                            <li>處理完畢後，可點擊「隱藏/歸檔」將申請單移至歷史紀錄。</li>
                            <li>切換至「已歸檔」分頁可查看歷史紀錄，並可隨時還原至待處理列表。</li>
                        </ul>
                    </li>
                </ul>
            </InstructionPanel>

            {/* Tabs */}
            <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl mb-6 w-fit">
                <button 
                    onClick={() => setCurrentTab('pending')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center transition-all ${currentTab === 'pending' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <LayoutList size={16} className="mr-2"/>
                    待處理 ({pendingCount})
                </button>
                <button 
                    onClick={() => setCurrentTab('archived')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center transition-all ${currentTab === 'archived' ? 'bg-white text-slate-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Archive size={16} className="mr-2"/>
                    已歸檔 ({archivedFirestore.length + archivedGas.length})
                </button>
            </div>

            {(currentTab === 'pending' ? pendingCount === 0 : archivedFirestore.length + archivedGas.length === 0) ? (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
                    <div className="inline-block p-4 bg-white rounded-full mb-4 shadow-sm">
                        <CheckCircle size={32} className="text-slate-300" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">
                        {currentTab === 'pending' ? '目前沒有待處理的申請' : '沒有已歸檔的紀錄'}
                    </h3>
                    <p className="text-slate-500">
                        {currentTab === 'pending' ? '所有申請都已處理完畢或歸檔。' : '歷史紀錄是空的。'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* 本系統 (Vercel) 待審 / 已歸檔 */}
                    {(currentTab === 'pending' ? pendingFirestore : archivedFirestore).map((req) => {
                        const isNewTeacher = !teachers.some(t => t.name === req.teacherName);
                        const isImported = req.status === 'imported';
                        const isProcessing = actionLoadingId === req.id;
                        return (
                            <div key={req.id} className={`bg-white rounded-xl shadow-sm border p-6 flex flex-col relative overflow-hidden ${isImported ? 'border-green-200 ring-1 ring-green-100' : 'border-slate-200'}`}>
                                <div className="absolute top-0 right-0 bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1 rounded-bl-xl border-l border-b border-indigo-200">本系統</div>
                                {isNewTeacher && currentTab === 'pending' && !isImported && (
                                    <div className="absolute top-0 right-0 mt-7 bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1 rounded-bl-xl border-l border-b border-amber-200 flex items-center"><UserPlus size={12} className="mr-1"/> 新教師</div>
                                )}
                                {isImported && currentTab === 'pending' && (
                                    <div className="absolute top-0 left-0 bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-br-xl border-r border-b border-green-200 flex items-center"><CheckCircle size={12} className="mr-1"/> 已匯入</div>
                                )}
                                <div className="flex justify-between items-start mb-4 mt-2">
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-800 flex items-center">
                                            {req.teacherName}
                                            <span className="ml-2 text-sm font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{req.leaveType}</span>
                                        </h3>
                                        <div className="text-sm text-slate-500 mt-1 flex items-center"><Calendar size={14} className="mr-1"/>{req.startDate} ~ {req.endDate}</div>
                                    </div>
                                </div>
                                <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 mb-4 space-y-2 border border-slate-200">
                                    <p><span className="font-bold text-slate-500">事由：</span>{req.reason}</p>
                                    <p><span className="font-bold text-slate-500">文號：</span>{req.docId || '無'}</p>
                                    <p><span className="font-bold text-slate-500">代課：</span>{req.substituteTeacher}</p>
                                    <p><span className="font-bold text-slate-500">薪資：</span>{req.payType}</p>
                                    <p className="text-xs text-slate-400 text-right mt-1 pt-1 border-t border-slate-200">申請時間: {new Date(req.createdAt).toLocaleString()}</p>
                                </div>
                                <div className="mt-auto pt-4 border-t border-slate-200">
                                    <div className="flex space-x-3">
                                        {currentTab === 'pending' ? (
                                            <>
                                                <button onClick={() => handleImportFirestore(req)} className="flex-1 px-4 py-2 rounded-lg font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center" disabled={isImported}>{isImported ? <><CheckCircle size={18} className="mr-2"/>已匯入</> : <><Download size={18} className="mr-2"/>匯入系統</>}</button>
                                                <button onClick={() => handleArchiveFirestore(req)} disabled={isProcessing} className="px-4 py-2 bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 rounded-lg font-bold flex items-center justify-center">{isProcessing ? <Loader2 size={18} className="animate-spin"/> : <><EyeOff size={18} className="mr-2"/><span className="hidden md:inline">隱藏/歸檔</span></>}</button>
                                            </>
                                        ) : (
                                            <button onClick={() => handleRestoreFirestore(req)} disabled={isProcessing} className="w-full px-4 py-2 bg-white border border-slate-300 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg font-bold flex items-center justify-center">{isProcessing ? <Loader2 size={18} className="animate-spin mr-2"/> : <><RefreshCcw size={18} className="mr-2"/>還原至待處理</>}</button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {/* GAS 待審 / 已歸檔 */}
                    {(currentTab === 'pending' ? pendingGas : archivedGas).map(req => {
                        const isNewTeacher = !teachers.some(t => t.name === req.teacherName);
                        const isImportedSession = importedIds.has(req.uuid);
                        const isProcessing = actionLoadingId === req.uuid;
                        return (
                            <div key={req.uuid} className={`bg-white rounded-xl shadow-sm border p-6 flex flex-col relative overflow-hidden group transition-all ${isImportedSession ? 'border-green-200 ring-1 ring-green-100' : 'border-slate-200'}`}>
                                <div className="absolute top-0 right-0 bg-slate-200 text-slate-600 text-xs font-bold px-3 py-1 rounded-bl-xl border-l border-b border-slate-300">GAS</div>
                                {isNewTeacher && currentTab === 'pending' && (
                                    <div className="absolute top-0 right-0 mt-7 bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1 rounded-bl-xl border-l border-b border-amber-200 flex items-center"><UserPlus size={12} className="mr-1"/> 新教師</div>
                                )}
                                {isImportedSession && currentTab === 'pending' && (
                                    <div className="absolute top-0 left-0 bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-br-xl border-r border-b border-green-200 flex items-center"><CheckCircle size={12} className="mr-1"/> 已匯入</div>
                                )}
                                <div className="flex justify-between items-start mb-4 mt-2">
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-800 flex items-center">
                                            {req.teacherName}
                                            <span className="ml-2 text-sm font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{req.leaveType}</span>
                                        </h3>
                                        <div className="text-sm text-slate-500 mt-1 flex items-center"><Calendar size={14} className="mr-1"/>{req.startDate} ~ {req.endDate}</div>
                                    </div>
                                </div>
                                <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 mb-4 space-y-2 border border-slate-200">
                                    <p><span className="font-bold text-slate-500">事由：</span>{req.reason}</p>
                                    <p><span className="font-bold text-slate-500">文號：</span>{req.docId || '無'}</p>
                                    <p><span className="font-bold text-slate-500">代課：</span>{req.substituteTeacher}</p>
                                    <p><span className="font-bold text-slate-500">薪資：</span>{req.payType}</p>
                                    <p className="text-xs text-slate-400 text-right mt-1 pt-1 border-t border-slate-200">申請時間: {new Date(req.timestamp).toLocaleString()}</p>
                                </div>
                                <div className="mt-auto pt-4 border-t border-slate-200">
                                    <div className="flex items-center justify-between mb-4">
                                        {req.fileUrl ? (
                                            <a href={req.fileUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 text-sm flex items-center font-medium bg-indigo-50 px-3 py-1.5 rounded-lg"><ExternalLink size={14} className="mr-1"/> 查看證明附件</a>
                                        ) : (
                                            <span className="text-slate-400 text-sm flex items-center"><Info size={14} className="mr-1"/> 無附件</span>
                                        )}
                                    </div>
                                    <div className="flex space-x-3">
                                        {currentTab === 'pending' ? (
                                            <>
                                                <button onClick={() => handleImport(req)} className={`flex-1 px-4 py-2 rounded-lg font-bold shadow-sm flex items-center justify-center ${isImportedSession ? 'bg-green-100 text-green-700 cursor-default' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`} disabled={isImportedSession}>
                                                    {isImportedSession ? <CheckCircle size={18} className="mr-2"/> : <Download size={18} className="mr-2"/>}{isImportedSession ? '已匯入' : '匯入系統'}
                                                </button>
                                                <button onClick={() => handleArchive(req)} disabled={isProcessing} className="px-4 py-2 bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 rounded-lg font-bold flex items-center justify-center">
                                                    {isProcessing ? <Loader2 size={18} className="animate-spin"/> : <><EyeOff size={18} className="mr-2"/><span className="hidden md:inline">隱藏/歸檔</span></>}
                                                </button>
                                            </>
                                        ) : (
                                            <button onClick={() => handleRestore(req)} disabled={isProcessing} className="w-full px-4 py-2 bg-white border border-slate-300 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg font-bold flex items-center justify-center">
                                                {isProcessing ? <Loader2 size={18} className="animate-spin mr-2"/> : <><RefreshCcw size={18} className="mr-2"/>還原至待處理列表</>}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default IncomingRequests;
