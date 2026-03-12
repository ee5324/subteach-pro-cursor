
import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Calendar, AlertCircle, ArrowRight, User, Clock, BookOpen, Printer, CheckSquare, Square, Users, X, Save, CheckCircle, Share2, Loader2, ExternalLink, ToggleLeft, ToggleRight, Globe, Lock, ListFilter } from 'lucide-react';
import { Link } from 'react-router-dom';
import WeeklyScheduleModal, { ScheduleGroup } from '../components/WeeklyScheduleModal';
import { PayType, LeaveType, TeacherType, Teacher } from '../types';
import SearchableSelect, { SelectOption } from '../components/SearchableSelect';
import { convertSlotsToDetails } from '../utils/calculations';
import Modal, { ModalMode, ModalType } from '../components/Modal';
import InstructionPanel from '../components/InstructionPanel';
import { callGasApi } from '../utils/api';

// 定義顏色主題循環，讓不同老師有不同顏色區塊
const COLOR_THEMES = [
  { bg: 'bg-blue-50', border: 'border-blue-200', title: 'text-blue-800', badge: 'bg-blue-100 text-blue-700', hover: 'hover:bg-blue-100/50' },
  { bg: 'bg-orange-50', border: 'border-orange-200', title: 'text-orange-800', badge: 'bg-orange-100 text-orange-700', hover: 'hover:bg-orange-100/50' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', title: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700', hover: 'hover:bg-emerald-100/50' },
  { bg: 'bg-purple-50', border: 'border-purple-200', title: 'text-purple-800', badge: 'bg-purple-100 text-purple-700', hover: 'hover:bg-purple-100/50' },
  { bg: 'bg-rose-50', border: 'border-rose-200', title: 'text-rose-800', badge: 'bg-rose-100 text-rose-700', hover: 'hover:bg-rose-100/50' },
  { bg: 'bg-cyan-50', border: 'border-cyan-200', title: 'text-cyan-800', badge: 'bg-cyan-100 text-cyan-700', hover: 'hover:bg-cyan-100/50' },
  { bg: 'bg-amber-50', border: 'border-amber-200', title: 'text-amber-800', badge: 'bg-amber-100 text-amber-700', hover: 'hover:bg-amber-100/50' },
  { bg: 'bg-indigo-50', border: 'border-indigo-200', title: 'text-indigo-800', badge: 'bg-indigo-100 text-indigo-700', hover: 'hover:bg-indigo-100/50' },
];

interface PendingItem {
  id: string; // Unique Key: recordId_date_period
  recordId: string;
  date: string;
  period: string;
  subject: string;
  className: string;
  reason: string;
  payType: PayType;
  allowPartial?: boolean;
  isPublic: boolean; // 新增：公開狀態
}

interface TeacherGroup {
  originalTeacherId: string;
  originalTeacherName: string;
  items: PendingItem[];
  earliestDate: string; // 用於排序群組
}

const PendingItems: React.FC = () => {
  const { records, teachers, updateRecord, salaryGrades, addTeacher, syncToPublicBoard, settings } = useAppStore();
  
  // State for Schedule Modal
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [modalGroups, setModalGroups] = useState<ScheduleGroup[]>([]);
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined);

  // State for Bulk Selection
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkTeacherId, setBulkTeacherId] = useState<string>('');
  const [bulkPayType, setBulkPayType] = useState<PayType>(PayType.HOURLY);
  const [bulkPtaPaysHourly, setBulkPtaPaysHourly] = useState(false);
  const [bulkHomeroomFeeByPta, setBulkHomeroomFeeByPta] = useState(false);

  // Sync state
  const [isPublishing, setIsPublishing] = useState(false);

  // Feedback Modal
  const [feedbackModal, setFeedbackModal] = useState<{ 
      isOpen: boolean; 
      title: string; 
      message: string; 
      type: ModalType;
      mode?: ModalMode;
      onConfirm?: () => void;
  }>({
      isOpen: false, title: '', message: '', type: 'info', mode: 'alert'
  });

  // Update: Include Expertise in SubLabel
  const substituteTeacherOptions: SelectOption[] = useMemo(() => {
    return teachers.map(t => {
        let info: string = t.type;
        if (t.type === TeacherType.EXTERNAL && t.expertise && t.expertise.length > 0) {
            info += ` | 專長: ${t.expertise.join(',')}`;
        }
        return {
            value: t.id,
            label: t.name,
            subLabel: info
        };
    });
  }, [teachers]);

  const groupedList = useMemo(() => {
    const groups: Record<string, TeacherGroup> = {};

    records.forEach(r => {
      if (r.slots) {
        r.slots.forEach(s => {
          if (!s.substituteTeacherId) { // No teacher assigned
            const originalTeacher = teachers.find(t => t.id === r.originalTeacherId);
            const teacherId = r.originalTeacherId;
            const teacherName = originalTeacher?.name || '未知教師';
            // Create a unique key for selection
            const uniqueKey = `${r.id}_${s.date}_${s.period}`;

            if (!groups[teacherId]) {
              groups[teacherId] = {
                originalTeacherId: teacherId,
                originalTeacherName: teacherName,
                items: [],
                earliestDate: s.date
              };
            }

            // Update earliest date if this slot is earlier
            if (new Date(s.date) < new Date(groups[teacherId].earliestDate)) {
                groups[teacherId].earliestDate = s.date;
            }

            groups[teacherId].items.push({
              id: uniqueKey,
              recordId: r.id,
              date: s.date,
              period: s.period,
              subject: s.subject,
              className: s.className,
              reason: r.reason,
              payType: s.payType,
              allowPartial: r.allowPartial,
              isPublic: !!s.isPublic // Default to false if undefined
            });
          }
        });
      }
    });

    // Convert map to array and sort groups by earliest date
    const sortedGroups = Object.values(groups).sort((a, b) => 
        new Date(a.earliestDate).getTime() - new Date(b.earliestDate).getTime()
    );

    // Sort items within each group
    sortedGroups.forEach(group => {
        group.items.sort((a, b) => {
            const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
            if (dateDiff !== 0) return dateDiff;
            const periods = ['早', '1', '2', '3', '4', '午', '5', '6', '7'];
            return periods.indexOf(a.period) - periods.indexOf(b.period);
        });
    });

    return sortedGroups;

  }, [records, teachers]);

  // --- Handlers for Public Toggle (Record Level) ---

  const handleToggleRecordPublic = (recordId: string, currentPublicState: boolean) => {
      const record = records.find(r => r.id === recordId);
      if (!record || !record.slots) return;

      // Toggle Logic: 
      // If currently displayed as Public (true), turn ALL slots OFF.
      // If currently displayed as Hidden (false), turn ALL pending slots ON.
      const newStatus = !currentPublicState;

      const newSlots = record.slots.map(s => {
          // Only modify slots that are pending (no sub teacher)
          if (!s.substituteTeacherId) {
              return { ...s, isPublic: newStatus };
          }
          return s;
      });

      updateRecord({ ...record, slots: newSlots });
  };

  const handleSetAllPublic = (status: boolean) => {
      // Batch update logic
      const updatesByRecord: Record<string, any[]> = {};

      groupedList.forEach(group => {
          group.items.forEach(item => {
              if (item.isPublic !== status) {
                  if (!updatesByRecord[item.recordId]) {
                      const record = records.find(r => r.id === item.recordId);
                      if (record && record.slots) {
                          updatesByRecord[item.recordId] = [...record.slots];
                      }
                  }
                  
                  const slots = updatesByRecord[item.recordId];
                  if (slots) {
                      const slotIndex = slots.findIndex(s => s.date === item.date && s.period === item.period);
                      if (slotIndex !== -1) {
                          slots[slotIndex] = { ...slots[slotIndex], isPublic: status };
                      }
                  }
              }
          });
      });

      Object.keys(updatesByRecord).forEach(recordId => {
          const record = records.find(r => r.id === recordId);
          if (record) {
              updateRecord({ ...record, slots: updatesByRecord[recordId] });
          }
      });
  };

  // --- Selection Handlers ---

  const toggleItem = (id: string) => {
      const newSet = new Set(selectedItems);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedItems(newSet);
  };

  const toggleGroup = (groupItems: PendingItem[]) => {
      const newSet = new Set(selectedItems);
      const allSelected = groupItems.every(item => newSet.has(item.id));

      if (allSelected) {
          // Deselect all in group
          groupItems.forEach(item => newSet.delete(item.id));
      } else {
          // Select all in group
          groupItems.forEach(item => newSet.add(item.id));
      }
      setSelectedItems(newSet);
  };

  const clearSelection = () => {
      setSelectedItems(new Set());
      setBulkTeacherId('');
      setBulkPtaPaysHourly(false);
      setBulkHomeroomFeeByPta(false);
  };

  const handleBulkTeacherSelection = (val: string) => {
      if (!val) {
          setBulkTeacherId('');
          return;
      }
      if (!teachers.find(t => t.id === val)) {
          const newTeacher: Teacher = {
            id: val, name: val, type: TeacherType.EXTERNAL,
            hasCertificate: false, isRetired: false, isSpecialEd: false, isGraduatingHomeroom: false,
            baseSalary: 0, researchFee: 0, isHomeroom: false, note: '批量派代自動建立'
          };
          addTeacher(newTeacher);
      }
      setBulkTeacherId(val);
  };

  const applyBulkAssignment = () => {
      if (selectedItems.size === 0) return;
      if (!bulkTeacherId) {
          setFeedbackModal({ isOpen: true, title: '錯誤', message: '請選擇要指定的代課教師', type: 'error' });
          return;
      }

      const updatesByRecord: Record<string, { date: string, period: string }[]> = {};
      
      selectedItems.forEach(key => {
          let foundItem: PendingItem | undefined;
          for (const g of groupedList) {
              const item = g.items.find(i => i.id === key);
              if (item) {
                  foundItem = item;
                  break;
              }
          }

          if (foundItem) {
              if (!updatesByRecord[foundItem.recordId]) {
                  updatesByRecord[foundItem.recordId] = [];
              }
              updatesByRecord[foundItem.recordId].push({
                  date: foundItem.date,
                  period: foundItem.period
              });
          }
      });

      let processedCount = 0;

      Object.entries(updatesByRecord).forEach(([recordId, targets]) => {
          const record = records.find(r => r.id === recordId);
          if (!record || !record.slots) return;

          const updatedSlots = record.slots.map(slot => {
              const isTarget = targets.some(t => t.date === slot.date && t.period === slot.period);
              if (isTarget) {
                  processedCount++;
                  return {
                      ...slot,
                      substituteTeacherId: bulkTeacherId,
                      payType: bulkPayType
                  };
              }
              return slot;
          });

          const newDetails = convertSlotsToDetails(updatedSlots, teachers, salaryGrades);

          updateRecord({
              ...record,
              slots: updatedSlots,
              details: newDetails,
              ptaPaysHourly: bulkPtaPaysHourly,
              homeroomFeeByPta: bulkHomeroomFeeByPta
          });
      });

      setFeedbackModal({ 
          isOpen: true, 
          title: '派代成功', 
          message: `已成功將 ${processedCount} 節課指派給「${teachers.find(t=>t.id===bulkTeacherId)?.name || bulkTeacherId}」。`, 
          type: 'success' 
      });
      clearSelection();
  };

  // --- Printing Handlers ---

  const handleOpenIndividualSchedule = (group: TeacherGroup) => {
    setModalGroups([{
        title: `${group.originalTeacherName}老師請假，待聘課表`,
        items: group.items
    }]);
    setDefaultDate(group.earliestDate);
    setScheduleModalOpen(true);
  };

  const handlePrintAll = () => {
    const allGroups: ScheduleGroup[] = groupedList.map(g => ({
        title: `${g.originalTeacherName}老師請假，待聘課表`,
        items: g.items
    }));

    let earliest = groupedList.length > 0 ? groupedList[0].earliestDate : undefined;
    
    setModalGroups(allGroups);
    setDefaultDate(earliest);
    setScheduleModalOpen(true);
  };

  const handlePublish = async () => {
      if (!settings.gasWebAppUrl) {
          setFeedbackModal({ isOpen: true, title: '錯誤', message: '請先設定 GAS URL', type: 'error' });
          return;
      }
      
      setIsPublishing(true);
      try {
          const payload = [];
          for(const g of groupedList) {
              for(const item of g.items) {
                  if (item.isPublic) {
                      payload.push({
                          id: item.id,
                          date: item.date,
                          period: item.period,
                          originalTeacherName: g.originalTeacherName,
                          subject: item.subject,
                          className: item.className,
                          reason: item.reason,
                          payType: item.payType,
                          recordId: item.recordId,
                          allowPartial: item.allowPartial
                      });
                  }
              }
          }
          
          if (payload.length === 0) {
              setFeedbackModal({ isOpen: true, title: '無公開項目', message: '目前沒有設定為「公開」的待聘課務，因此未發佈任何內容。請先將課務切換為公開狀態。', type: 'warning' });
              setIsPublishing(false);
              return;
          }

          await syncToPublicBoard(payload);
          setFeedbackModal({ isOpen: true, title: '發佈成功', message: `已成功將 ${payload.length} 筆「公開」缺額更新至公開看板。`, type: 'success' });
      } catch (e: any) {
          setFeedbackModal({ isOpen: true, title: '發佈失敗', message: e.message, type: 'error' });
      } finally {
          setIsPublishing(false);
      }
  };

  const totalPendingCount = groupedList.reduce((acc, group) => acc + group.items.length, 0);
  const totalPublicCount = groupedList.reduce((acc, group) => acc + group.items.filter(i => i.isPublic).length, 0);

  return (
    <div className="p-8 pb-32">
      <Modal
        isOpen={feedbackModal.isOpen}
        onClose={() => setFeedbackModal({ ...feedbackModal, isOpen: false })}
        onConfirm={feedbackModal.onConfirm}
        title={feedbackModal.title}
        message={feedbackModal.message}
        type={feedbackModal.type}
        mode={feedbackModal.mode}
      />

      <WeeklyScheduleModal
        isOpen={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        groups={modalGroups}
        defaultDate={defaultDate}
      />

      <header className="mb-6 flex items-end justify-between">
        <div>
            <h1 className="text-3xl font-bold text-slate-800 flex items-center">
                <AlertCircle className="mr-3 text-red-500" />
                待聘課務清單
            </h1>
            <p className="text-slate-500 mt-2">
                管理未派代課程，設定是否發佈至公開看板。
            </p>
        </div>
        
        <div className="flex items-center space-x-3">
             <button
                onClick={handlePublish}
                disabled={isPublishing}
                className={`bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-5 py-2.5 rounded-lg font-bold shadow-sm flex items-center space-x-2 transition-colors ${isPublishing ? 'opacity-70 cursor-not-allowed' : ''}`}
                title="將標記為「公開」的項目更新至網站"
             >
                {isPublishing ? <Loader2 size={18} className="animate-spin" /> : <Share2 size={18} />}
                <span>發佈公開 ({totalPublicCount})</span>
             </button>

             {totalPendingCount > 0 && (
                 <>
                    <button
                        onClick={handlePrintAll}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-md flex items-center space-x-2 transition-colors"
                    >
                        <Printer size={18} />
                        <span>列印所有待聘課表</span>
                    </button>
                    <div className="bg-red-100 text-red-700 px-4 py-2.5 rounded-lg font-bold shadow-sm">
                        總計 {totalPendingCount} 節待聘
                    </div>
                 </>
             )}
        </div>
      </header>

      <InstructionPanel title="使用說明：待聘課務清單">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>待聘列表：</strong>顯示所有尚未安排代課教師的課程，依請假教師分組。</li>
          <li><strong>公開/隱藏：</strong>
             <ul className="list-circle pl-5 mt-1 text-slate-500">
               <li>點擊「公開中/已隱藏」切換按鈕，可設定該筆紀錄是否顯示於外部公開看板。</li>
               <li>使用右上方的「全部設為公開/隱藏」可快速批次設定。</li>
               <li>設定完成後，請點擊「發佈公開」將狀態同步至網站。</li>
             </ul>
          </li>
          <li><strong>批次派代：</strong>
             <ul className="list-circle pl-5 mt-1 text-slate-500">
               <li>勾選多筆課程後，下方會出現操作列。</li>
               <li>選擇代課教師並點擊「確認套用」，即可一次指派多節課程。</li>
             </ul>
          </li>
          <li><strong>列印：</strong>可列印特定教師或所有待聘課表，方便張貼公告。</li>
        </ul>
      </InstructionPanel>

      {settings.gasWebAppUrl && (
          <div className="mb-4 text-right">
              <a href={settings.gasWebAppUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500 hover:underline flex items-center justify-end">
                  <ExternalLink size={12} className="mr-1"/> 前往公開報名頁面 (測試用)
              </a>
          </div>
      )}

      {/* Global Public Toggle */}
      {groupedList.length > 0 && (
          <div className="flex justify-end space-x-2 mb-4">
              <button onClick={() => handleSetAllPublic(true)} className="text-xs flex items-center bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 border border-green-200 font-bold transition-colors">
                  <Globe size={14} className="mr-1"/> 全部設為公開
              </button>
              <button onClick={() => handleSetAllPublic(false)} className="text-xs flex items-center bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-100 border border-slate-200 font-bold transition-colors">
                  <Lock size={14} className="mr-1"/> 全部隱藏
              </button>
          </div>
      )}

      {groupedList.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-12 text-center">
           <div className="inline-block p-4 bg-green-100 rounded-full mb-4">
              <Calendar size={32} className="text-green-600"/>
           </div>
           <h3 className="text-xl font-bold text-green-800">目前沒有待聘課務！</h3>
           <p className="text-green-600 mt-2">所有請假紀錄都已安排好代課教師。</p>
        </div>
      ) : (
        <div className="space-y-8">
            {groupedList.map((group, index) => {
                const theme = COLOR_THEMES[index % COLOR_THEMES.length];
                const isGroupFullySelected = group.items.length > 0 && group.items.every(i => selectedItems.has(i.id));
                const isGroupPartiallySelected = group.items.some(i => selectedItems.has(i.id)) && !isGroupFullySelected;

                // Group items within this teacher by Record ID (Reason)
                const itemsByRecord: Record<string, PendingItem[]> = {};
                group.items.forEach(item => {
                    if (!itemsByRecord[item.recordId]) itemsByRecord[item.recordId] = [];
                    itemsByRecord[item.recordId].push(item);
                });

                return (
                    <div key={group.originalTeacherId} className={`rounded-xl shadow-sm border overflow-hidden ${theme.bg} ${theme.border}`}>
                        {/* Group Header */}
                        <div className="px-6 py-4 flex items-center justify-between border-b border-white/50 bg-white/30 backdrop-blur-sm">
                            <div className="flex items-center cursor-pointer" onClick={() => toggleGroup(group.items)}>
                                <div className={`mr-4 transition-colors ${isGroupFullySelected ? 'text-indigo-600' : 'text-slate-400'}`}>
                                    {isGroupFullySelected ? (
                                        <CheckSquare size={24} />
                                    ) : isGroupPartiallySelected ? (
                                        <div className="relative">
                                            <Square size={24} />
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="w-3 h-3 bg-indigo-400 rounded-sm"></div>
                                            </div>
                                        </div>
                                    ) : (
                                        <Square size={24} />
                                    )}
                                </div>

                                <div className={`p-2 rounded-full mr-3 bg-white shadow-sm ${theme.title}`}>
                                    <User size={20} />
                                </div>
                                <div>
                                    <h2 className={`text-lg font-bold ${theme.title}`}>{group.originalTeacherName}</h2>
                                    <p className="text-slate-500 text-xs flex items-center mt-0.5">
                                        待聘節數：{group.items.length} 節
                                    </p>
                                </div>
                            </div>
                            
                            <div className="flex items-center space-x-3">
                                <button
                                    onClick={() => handleOpenIndividualSchedule(group)}
                                    className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-sm font-bold bg-white border border-transparent shadow-sm hover:border-slate-300 transition-all ${theme.title}`}
                                >
                                    <Printer size={16} />
                                    <span>列印</span>
                                </button>
                            </div>
                        </div>

                        {/* Iterate over Record Groups within Teacher */}
                        <div className="bg-white/60 p-4 space-y-4">
                            {Object.entries(itemsByRecord).map(([recordId, recordItems]) => {
                                // Determine if this record group is currently Public
                                // Logic: If ALL are public -> ON. If ANY are hidden -> OFF (so toggle turns all ON)
                                const isRecordPublic = recordItems.every(i => i.isPublic);
                                const firstItem = recordItems[0];
                                const record = records.find(r => r.id === recordId);
                                const showPtaCheckbox = record && record.leaveType !== LeaveType.PUBLIC_PTA;

                                return (
                                    <div key={recordId} className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                                        
                                        {/* Record Header with Toggle */}
                                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex flex-wrap justify-between items-center gap-2">
                                            <div className="flex items-center flex-wrap gap-3">
                                                <ListFilter size={16} className="text-slate-400 mr-2"/>
                                                <span className="font-bold text-slate-700 text-sm mr-3">{firstItem.reason}</span>
                                                <span className="text-xs text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                                                    {recordItems.length} 節
                                                </span>
                                                {showPtaCheckbox && record && (
                                                    <div className="flex items-center gap-3 flex-wrap">
                                                        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                                                            <input type="checkbox" checked={!!record.ptaPaysHourly} onChange={() => updateRecord({ ...record, ptaPaysHourly: !record.ptaPaysHourly })} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"/>
                                                            <span>家長會支出鐘點</span>
                                                        </label>
                                                        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                                                            <input type="checkbox" checked={!!record.homeroomFeeByPta} onChange={() => updateRecord({ ...record, homeroomFeeByPta: !record.homeroomFeeByPta })} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"/>
                                                            <span>家長會支出導師費(半天)</span>
                                                        </label>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="flex items-center">
                                                <span className={`text-xs font-bold mr-2 ${isRecordPublic ? 'text-green-600' : 'text-slate-400'}`}>
                                                    {isRecordPublic ? '公開中' : '已隱藏'}
                                                </span>
                                                <button 
                                                    onClick={() => handleToggleRecordPublic(recordId, isRecordPublic)}
                                                    className="focus:outline-none transition-transform active:scale-95"
                                                    title={isRecordPublic ? "點擊隱藏此紀錄所有課程" : "點擊公開此紀錄所有課程"}
                                                >
                                                    {isRecordPublic ? (
                                                        <ToggleRight className="text-green-500 w-9 h-9" />
                                                    ) : (
                                                        <ToggleLeft className="text-slate-300 w-9 h-9" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Items Table for this Record */}
                                        <table className="w-full text-left">
                                            <thead className="text-[10px] uppercase text-slate-400 bg-slate-50/50 border-b border-slate-100">
                                                <tr>
                                                    <th className="px-4 py-2 w-10 text-center">選取</th>
                                                    <th className="px-4 py-2">日期</th>
                                                    <th className="px-4 py-2">節次</th>
                                                    <th className="px-4 py-2">科目/班級</th>
                                                    <th className="px-4 py-2 text-right">操作</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {recordItems.map((item, idx) => {
                                                    const isSelected = selectedItems.has(item.id);
                                                    return (
                                                        <tr 
                                                            key={item.id} 
                                                            className={`transition-colors cursor-pointer text-sm ${isSelected ? 'bg-indigo-50/80' : 'hover:bg-slate-50'}`}
                                                            onClick={() => toggleItem(item.id)}
                                                        >
                                                            <td className="px-4 py-2 text-center">
                                                                <div className={`${isSelected ? 'text-indigo-600' : 'text-slate-300'}`}>
                                                                    {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-2 font-mono text-slate-600">
                                                                {item.date}
                                                            </td>
                                                            <td className="px-4 py-2 text-slate-600">
                                                                {item.period === '早' ? '早自習' : item.period === '午' ? '午休' : `第 ${item.period} 節`}
                                                                {item.payType === PayType.DAILY && (
                                                                    <span className="ml-1 text-[9px] bg-amber-100 text-amber-700 px-1 rounded">日薪</span>
                                                                )}
                                                                {item.payType === PayType.HALF_DAY && (
                                                                    <span className="ml-1 text-[9px] bg-amber-50 text-amber-600 px-1 rounded">半日薪</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-2 text-slate-600">
                                                                <span className="font-medium text-slate-800">{item.subject}</span>
                                                                <span className="text-slate-300 mx-1">|</span>
                                                                <span>{item.className}</span>
                                                            </td>
                                                            <td className="px-4 py-2 text-right">
                                                                <Link 
                                                                    to={`/entry/${item.recordId}`}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="text-indigo-600 hover:text-indigo-800 text-xs font-bold hover:underline"
                                                                >
                                                                    排課 &rarr;
                                                                </Link>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      <div className={`fixed bottom-6 left-0 right-0 px-3 transform transition-transform duration-300 z-50 ${selectedItems.size > 0 ? 'translate-y-0' : 'translate-y-full'}`}>
           <div className="max-w-2xl mx-auto bg-slate-800 text-white rounded-xl shadow-xl py-2.5 px-3 flex flex-col sm:flex-row items-center justify-between gap-2 border border-slate-700">
               <div className="flex items-center gap-2 shrink-0">
                   <div className="bg-indigo-500 rounded-md px-2 py-1 font-bold text-white text-sm min-w-[2rem] text-center">
                       {selectedItems.size}
                   </div>
                   <div>
                       <div className="font-semibold text-sm">已選 {selectedItems.size} 節</div>
                       <div className="text-slate-400 text-[10px]">選擇代課教師後套用</div>
                   </div>
               </div>
               <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                   <div className="min-w-[140px] max-w-[180px] text-slate-800">
                       <SearchableSelect
                           options={substituteTeacherOptions}
                           value={bulkTeacherId}
                           onChange={handleBulkTeacherSelection}
                           placeholder="選擇代課教師..."
                           allowCreate={true}
                       />
                   </div>

                   <select
                        className="px-2 py-1.5 rounded-md bg-slate-700 border border-slate-600 text-white text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                        value={bulkPayType}
                        onChange={(e) => setBulkPayType(e.target.value as PayType)}
                   >
                       <option value={PayType.HOURLY}>鐘點費</option>
                       <option value={PayType.DAILY}>日薪</option>
                       <option value={PayType.HALF_DAY}>半日薪</option>
                   </select>
                   <label className="flex items-center gap-1.5 text-xs text-slate-200 cursor-pointer whitespace-nowrap" title="鐘點費由家長會，入家長會清冊">
                       <input type="checkbox" checked={bulkPtaPaysHourly} onChange={e => setBulkPtaPaysHourly(e.target.checked)} className="rounded border-slate-500 bg-slate-700 text-indigo-500 focus:ring-indigo-500"/>
                       <span>家長會支出鐘點</span>
                   </label>
                   <label className="flex items-center gap-1.5 text-xs text-slate-200 cursor-pointer whitespace-nowrap" title="僅半日導師費入家長會清冊">
                       <input type="checkbox" checked={bulkHomeroomFeeByPta} onChange={e => setBulkHomeroomFeeByPta(e.target.checked)} className="rounded border-slate-500 bg-slate-700 text-indigo-500 focus:ring-indigo-500"/>
                       <span>家長會支出導師費(半天)</span>
                   </label>
                   <div className="flex space-x-1.5">
                       <button onClick={clearSelection} className="px-3 py-1.5 rounded-md border border-slate-600 hover:bg-slate-700 text-slate-300 text-sm transition-colors">
                           取消
                       </button>
                       <button onClick={applyBulkAssignment} className="px-4 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold flex items-center justify-center whitespace-nowrap">
                           <CheckCircle size={14} className="mr-1"/>套用
                       </button>
                   </div>
               </div>
           </div>
      </div>

    </div>
  );
};

export default PendingItems;
