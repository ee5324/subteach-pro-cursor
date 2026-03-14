
import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Loader2, Download, UserPlus, FileText, CheckCircle, ExternalLink, Calendar, Archive, RefreshCcw, EyeOff, LayoutList, Trash2 } from 'lucide-react';
import Modal, { ModalMode, ModalType } from '../components/Modal';
import { LeaveRecord, Teacher, TeacherType, PayType, TimetableSlot, LeaveType } from '../types';
import type { TeacherLeaveRequestDoc } from '../types';
import { convertSlotsToDetails } from '../utils/calculations';
import InstructionPanel from '../components/InstructionPanel';

/** 老師填寫請假單的網址（本系統表單，資料存 Firestore） */
const getTeacherRequestFormUrl = () => typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname || '/'}#/teacher-request` : '#/teacher-request';

type TabType = 'pending' | 'archived';

const IncomingRequests: React.FC = () => {
    const { teachers, addRecord, addTeacher, salaryGrades, teacherLeaveRequests, updateTeacherLeaveRequestStatus, deleteTeacherLeaveRequest } = useAppStore();
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
    const [currentTab, setCurrentTab] = useState<TabType>('pending');

    const [modal, setModal] = useState<{
        isOpen: boolean; title: string; message: string; type: ModalType; mode: ModalMode; onConfirm?: () => void;
    }>({ isOpen: false, title: '', message: '', type: 'info', mode: 'alert' });

    const closeModal = () => setModal(prev => ({ ...prev, isOpen: false }));
    const showModal = (props: Partial<typeof modal>) => {
        setModal({ isOpen: true, title: props.title || '訊息', message: props.message || '', type: props.type || 'info', mode: props.mode || 'alert', onConfirm: props.onConfirm });
    };

    // 外部申請僅走 Firestore（本系統表單）
    const pending = useMemo(() => teacherLeaveRequests.filter(r => r.status === 'pending'), [teacherLeaveRequests]);
    const archived = useMemo(() => teacherLeaveRequests.filter(r => r.status === 'archived'), [teacherLeaveRequests]);

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
            const categoryNote = req.leaveType ? `【教師勾選：${req.leaveType}】` : "";
            const newRecord: LeaveRecord = {
                id: crypto.randomUUID(),
                originalTeacherId: teacherId,
                leaveType: LeaveType.PERSONAL,
                reason: categoryNote + req.reason,
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
                <a
                    href={getTeacherRequestFormUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white border border-indigo-600 hover:bg-indigo-700 transition-colors text-sm font-medium"
                >
                    <ExternalLink size={18} />
                    <span>老師填寫請假單</span>
                </a>
            </header>

            <InstructionPanel title="使用說明：外部請假申請">
                <ul className="list-disc pl-5 space-y-1">
                    <li><strong>功能概述：</strong>此頁面顯示老師透過「老師填寫請假單」提交的請假申請，資料存於 Firebase，不需 GAS。請將上方連結提供給老師填寫。</li>
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
                    <li><strong>刪除：</strong>可點擊右側垃圾桶圖示刪除申請（會先顯示確認視窗）。適用於測試或誤填，刪除後無法還原。</li>
                </ul>
            </InstructionPanel>

            {/* Tabs */}
            <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl mb-6 w-fit">
                <button 
                    onClick={() => setCurrentTab('pending')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center transition-all ${currentTab === 'pending' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <LayoutList size={16} className="mr-2"/>
                    待處理 ({pending.length})
                </button>
                <button 
                    onClick={() => setCurrentTab('archived')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center transition-all ${currentTab === 'archived' ? 'bg-white text-slate-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Archive size={16} className="mr-2"/>
                    已歸檔 ({archived.length})
                </button>
            </div>

            {(currentTab === 'pending' ? pending.length === 0 : archived.length === 0) ? (
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
                    {(currentTab === 'pending' ? pending : archived).map((req) => {
                        const isNewTeacher = !teachers.some(t => t.name === req.teacherName);
                        const isImported = req.status === 'imported';
                        const isProcessing = actionLoadingId === req.id;
                        return (
                            <div key={req.id} className={`bg-white rounded-xl shadow-sm border p-6 flex flex-col relative overflow-hidden ${isImported ? 'border-green-200 ring-1 ring-green-100' : 'border-slate-200'}`}>
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
                                    <div className="flex flex-wrap items-center gap-2">
                                        {currentTab === 'pending' ? (
                                            <>
                                                <button onClick={() => handleImportFirestore(req)} className="flex-1 min-w-0 px-4 py-2 rounded-lg font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center" disabled={isImported}>{isImported ? <><CheckCircle size={18} className="mr-2"/>已匯入</> : <><Download size={18} className="mr-2"/>匯入系統</>}</button>
                                                <button onClick={() => handleArchiveFirestore(req)} disabled={isProcessing} className="px-4 py-2 bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 rounded-lg font-bold flex items-center justify-center">{isProcessing ? <Loader2 size={18} className="animate-spin"/> : <><EyeOff size={18} className="mr-2"/><span className="hidden md:inline">隱藏/歸檔</span></>}</button>
                                                <button
                                                    onClick={() => showModal({
                                                        title: '確認刪除此筆申請',
                                                        message: `確定要刪除此筆外部申請嗎？\n\n申請人：${req.teacherName}\n請假區間：${req.startDate} ~ ${req.endDate}\n\n此操作無法復原，刪除後將無法還原。`,
                                                        type: 'warning',
                                                        mode: 'confirm',
                                                        onConfirm: async () => {
                                                            try {
                                                                await deleteTeacherLeaveRequest(req.id);
                                                                closeModal();
                                                                showModal({ title: '已刪除', message: '該筆申請已刪除。', type: 'success' });
                                                            } catch (e: any) {
                                                                closeModal();
                                                                showModal({ title: '刪除失敗', message: e?.message || '請稍後再試', type: 'error' });
                                                            }
                                                        }
                                                    })}
                                                    disabled={isProcessing}
                                                    className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 border border-transparent hover:border-red-200 transition-colors"
                                                    title="刪除此筆申請"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button onClick={() => handleRestoreFirestore(req)} disabled={isProcessing} className="flex-1 min-w-0 px-4 py-2 bg-white border border-slate-300 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg font-bold flex items-center justify-center">{isProcessing ? <Loader2 size={18} className="animate-spin mr-2"/> : <><RefreshCcw size={18} className="mr-2"/>還原至待處理</>}</button>
                                                <button
                                                    onClick={() => showModal({
                                                        title: '確認刪除此筆申請',
                                                        message: `確定要刪除此筆已歸檔的申請嗎？\n\n申請人：${req.teacherName}\n請假區間：${req.startDate} ~ ${req.endDate}\n\n此操作無法復原。`,
                                                        type: 'warning',
                                                        mode: 'confirm',
                                                        onConfirm: async () => {
                                                            try {
                                                                await deleteTeacherLeaveRequest(req.id);
                                                                closeModal();
                                                                showModal({ title: '已刪除', message: '該筆申請已刪除。', type: 'success' });
                                                            } catch (e: any) {
                                                                closeModal();
                                                                showModal({ title: '刪除失敗', message: e?.message || '請稍後再試', type: 'error' });
                                                            }
                                                        }
                                                    })}
                                                    disabled={isProcessing}
                                                    className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 border border-transparent hover:border-red-200 transition-colors"
                                                    title="刪除此筆申請"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </>
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
