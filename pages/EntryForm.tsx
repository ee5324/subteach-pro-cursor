
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { LeaveType, PayType, TimetableSlot, LeaveRecord, TeacherType, Teacher, COMMON_SUBJECTS } from '../types';
import { convertSlotsToDetails, getDaysInMonth, parseLocalDate, normalizeDateString } from '../utils/calculations';
import { resolveTeacherDefaultSchedule } from '../utils/teacherSchedule';
import { Save, Calculator, ArrowLeft, ChevronLeft, ChevronRight, AlertCircle, UserX, BookOpen, Users, FileText, Info, Edit3, Trash2, X, Loader2, Repeat, Copy, Calendar as CalendarIcon, Ban, Download } from 'lucide-react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import Modal, { ModalMode, ModalType } from '../components/Modal';
import SearchableSelect, { SelectOption } from '../components/SearchableSelect';
import InstructionPanel, { CollapsibleItem } from '../components/InstructionPanel';

const PERIOD_ROWS = [
  { id: '早', label: '早' },
  { id: '1', label: '1' },
  { id: '2', label: '2' },
  { id: '3', label: '3' },
  { id: '4', label: '4' },
  { id: '午', label: '午' },
  { id: '5', label: '5' },
  { id: '6', label: '6' },
  { id: '7', label: '7' },
];

const ALL_PERIOD_IDS = PERIOD_ROWS.map(p => p.id);

/** 建立/編輯代課單：是否顯示「科目」快速選擇鈕（國語、數學…）；關閉時仍可手動輸入科目 */
const SHOW_SUBJECT_QUICK_PICK = false;

// Helper: Get Local Date String (YYYY-MM-DD) correctly in Taiwan Time
const getLocalTodayDate = () => {
    const d = new Date();
    // Use offset for Taiwan (UTC+8)
    const offset = 8 * 60; 
    const localDate = new Date(d.getTime() + (d.getTimezoneOffset() + offset) * 60000);
    
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Helper for display
const formatPeriod = (p: string) => {
  if (p === '早') return '早自習';
  if (p === '午') return '午休';
  return `第 ${p} 節`;
};

// Helper: Increment Class String
const incrementClassString = (str: string) => {
    return str.replace(/(\d+)$/, (match) => {
        return String(parseInt(match, 10) + 1);
    });
};

const EntryForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { teachers, records, addRecord, updateRecord, addTeacher, salaryGrades, loading, holidays, activeSemesterId } = useAppStore();
  
  const [isEditMode, setIsEditMode] = useState(false);

  // Modal State
  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: ModalType;
    mode: ModalMode;
    onConfirm?: () => void;
    confirmText?: string;
  }>({
    isOpen: false, title: '', message: '', type: 'info', mode: 'alert', confirmText: undefined
  });

  /** 避免刪除節次確認被連續觸發兩次（雙層 overlay / 重複 click） */
  const deleteSlotConfirmLockRef = useRef(false);

  const closeModal = () => {
    deleteSlotConfirmLockRef.current = false;
    setModal(prev => ({ ...prev, isOpen: false }));
  };
  const showModal = (props: Partial<typeof modal>) => {
      setModal({
          isOpen: true, title: props.title || '訊息', message: props.message || '', type: props.type || 'info',
          mode: props.mode || 'alert', onConfirm: props.onConfirm, confirmText: props.confirmText
      });
  };

  const handleLeaveTypeChange = (v: LeaveType) => {
    setLeaveType(v);
    if (v === LeaveType.PUBLIC_MENTAL) {
      setReason('身心調適');
    }
  };

  // --- Section 1: Leave Info ---
  const [originalTeacherId, setOriginalTeacherId] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveType>(LeaveType.PUBLIC_OFFICIAL);
  const [reason, setReason] = useState('');
  const [docId, setDocId] = useState('');
  const [applicationDate, setApplicationDate] = useState(getLocalTodayDate()); 
  
  // Import/Filter Range (Not necessarily the final record range)
  const [startDate, setStartDate] = useState(getLocalTodayDate()); 
  const [endDate, setEndDate] = useState(getLocalTodayDate()); 
  
  const [createdAt, setCreatedAt] = useState<number>(Date.now());
  const [allowPartial, setAllowPartial] = useState(false);
  const [ptaPaysHourly, setPtaPaysHourly] = useState(false);
  const [homeroomFeeByPta, setHomeroomFeeByPta] = useState(false);

  // --- Section 2: Timetable State ---
  const [viewDate, setViewDate] = useState(new Date()); 
  
  // Toolbar State (Quick Fill)
  const [activeSubId, setActiveSubId] = useState<string>('pending'); 
  const [activePayType, setActivePayType] = useState<PayType>(PayType.HOURLY);
  const [activeSubject, setActiveSubject] = useState('');
  const [activeClass, setActiveClass] = useState('');
  const [isAutoIncrement, setIsAutoIncrement] = useState(true);

  // Copy Modal State
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [copyRange, setCopyRange] = useState({ start: '', end: '' });

  // Core Data: Slots
  const [slots, setSlots] = useState<TimetableSlot[]>([]);

  // Slot Editor State
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);

  // Derived Data: Details
  const details = useMemo(() => convertSlotsToDetails(slots, teachers, salaryGrades), [slots, teachers, salaryGrades]);
  const totalEstimatedCost = details.reduce((sum, d) => sum + d.calculatedAmount, 0);

  // Computed Actual Range (Auto-detected from slots)
  const { calculatedStart, calculatedEnd } = useMemo(() => {
      if (slots.length === 0) return { calculatedStart: startDate, calculatedEnd: endDate };
      const sortedDates = slots.map(s => s.date).sort();
      return { calculatedStart: sortedDates[0], calculatedEnd: sortedDates[sortedDates.length - 1] };
  }, [slots, startDate, endDate]);

  // Prepare Options for SearchableSelect
  const originalTeacherOptions: SelectOption[] = useMemo(() => 
    teachers
      .filter(t => t.type === TeacherType.INTERNAL)
      .map(t => ({ value: t.id, label: t.name, subLabel: t.isHomeroom ? '導師' : '科任' })),
  [teachers]);

  const docIdOptions: SelectOption[] = useMemo(() => {
    const uniqueIds = new Set<string>();
    records.forEach(r => { const id = r.docId != null ? String(r.docId).trim() : ''; if (id !== '') uniqueIds.add(id); });
    return Array.from(uniqueIds).sort((a, b) => b.localeCompare(a)).map(id => ({ value: id, label: id }));
  }, [records]);

  const substituteTeacherOptions: SelectOption[] = useMemo(() => {
    const list: SelectOption[] = [{ value: 'pending', label: '🚫 待聘 (無人員)', className: 'text-red-600 font-bold bg-red-50' }];
    const teacherOpts = teachers.map(t => {
        let info: string = t.type;
        if (t.type === TeacherType.EXTERNAL && t.expertise && t.expertise.length > 0) {
            info += ` | 專長: ${t.expertise.join(',')}`;
        }
        return { value: t.id, label: t.name, subLabel: info };
    });
    return [...list, ...teacherOpts];
  }, [teachers]);

  // Load data
  useEffect(() => {
    if (loading) return;
    if (id) {
      const existingRecord = records.find(r => r.id === id);
      if (existingRecord) {
        setIsEditMode(true);
        setOriginalTeacherId(existingRecord.originalTeacherId);
        setLeaveType(existingRecord.leaveType);
        setReason(existingRecord.reason);
        setDocId(existingRecord.docId || '');
        setApplicationDate(normalizeDateString(existingRecord.applicationDate || getLocalTodayDate()));
        setCreatedAt(existingRecord.createdAt);
        setAllowPartial(existingRecord.allowPartial || false);
        setPtaPaysHourly(!!existingRecord.ptaPaysHourly);
        setHomeroomFeeByPta(!!existingRecord.homeroomFeeByPta);
        setStartDate(normalizeDateString(existingRecord.startDate)); // Set explicit range
        setEndDate(normalizeDateString(existingRecord.endDate));     // Set explicit range
        
        if (existingRecord.slots) {
            setSlots(existingRecord.slots);
        } else {
            // ... recovery logic ...
            const recoveredSlots: TimetableSlot[] = [];
            existingRecord.details.forEach(d => {
                d.selectedPeriods?.forEach(p => {
                    recoveredSlots.push({
                        date: d.date, period: p, subject: '(舊資料)', className: '-',
                        substituteTeacherId: d.substituteTeacherId, payType: d.payType
                    });
                });
            });
            setSlots(recoveredSlots);
        }
        setViewDate(parseLocalDate(existingRecord.startDate));
      } else {
        showModal({ title: '錯誤', message: '找不到該筆紀錄，將返回列表。', type: 'error', onConfirm: () => navigate('/entry') });
      }
    } else {
        // Init for new record
        setApplicationDate(getLocalTodayDate());
        setStartDate(getLocalTodayDate());
        setEndDate(getLocalTodayDate());
    }
  }, [id, records, navigate, loading]);



  const resetForm = () => {
    setOriginalTeacherId('');
    setLeaveType(LeaveType.PUBLIC_OFFICIAL);
    setReason('');
    setDocId('');
    setSlots([]);
    setAllowPartial(false);
    setPtaPaysHourly(false);
    setHomeroomFeeByPta(false);
    const today = getLocalTodayDate();
    setApplicationDate(today);
    setStartDate(today);
    setEndDate(today);
    setViewDate(new Date());
    setActiveSubId('pending');
    setActiveSubject('');
    setActiveClass('');
    setIsEditMode(false);
    navigate('/entry', { replace: true });
  };

  const handleTeacherSelection = (name: string, isOriginal: boolean) => {
      if (!name || name === 'pending') {
          if (isOriginal) setOriginalTeacherId(name);
          else setActiveSubId(name);
          return;
      }
      const exists = teachers.find(t => t.id === name || t.name === name);
      if (!exists) {
          const newTeacher: Teacher = {
              id: name, name: name, type: isOriginal ? TeacherType.INTERNAL : TeacherType.EXTERNAL,
              hasCertificate: false, isRetired: false, isSpecialEd: false, isGraduatingHomeroom: false,
              baseSalary: 0, researchFee: 0, isHomeroom: false, note: '由代課單自動建立'
          };
          addTeacher(newTeacher);
      }
      if (isOriginal) setOriginalTeacherId(name);
      else setActiveSubId(name);
  };

  const getMonday = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(12, 0, 0, 0);
    return date;
  };

  const getWeekDays = (baseDate: Date) => {
    const monday = getMonday(new Date(baseDate));
    const days = [];
    for (let i = 0; i < 5; i++) { 
      const temp = new Date(monday);
      temp.setDate(monday.getDate() + i);
      const y = temp.getFullYear();
      const m = String(temp.getMonth() + 1).padStart(2, '0');
      const d = String(temp.getDate()).padStart(2, '0');
      days.push(`${y}-${m}-${d}`);
    }
    return days;
  };

  const currentWeekDays = useMemo(() => getWeekDays(viewDate), [viewDate]);

  const handleWeekNav = (direction: 'prev' | 'next') => {
    const newDate = new Date(viewDate);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    setViewDate(newDate);
  };

  const handleSlotClick = (date: string, period: string) => {
    const existingSlot = slots.find(s => s.date === date && s.period === period);
    const isHoliday = holidays.includes(date);

    if (isHoliday && !existingSlot) return; 
    
    if (existingSlot) {
        setEditingSlot({ ...existingSlot });
        return;
    }
    
    // Auto-detect Overtime for manual click
    let isOvertime = false;
    if (originalTeacherId) {
        const teacher = teachers.find(t => t.id === originalTeacherId);
        const dayOfWeek = new Date(date).getDay();
        if (teacher && teacher.defaultOvertimeSlots) {
            isOvertime = teacher.defaultOvertimeSlots.some(ot => ot.day === dayOfWeek && ot.period === period);
        }
    }

    setSlots(prev => [...prev, {
        date, period, subject: activeSubject || '未定', className: activeClass || '未定',
        substituteTeacherId: activeSubId === 'pending' ? null : activeSubId, payType: activePayType,
        isOvertime: isOvertime
    }]);

    if (activeClass && isAutoIncrement && activePayType !== PayType.DAILY) {
        const incrementedClass = incrementClassString(activeClass);
        if (incrementedClass !== activeClass) setActiveClass(incrementedClass);
    }
  };

  const handleSaveEditedSlot = () => {
    if (!editingSlot) return;
    setSlots(prev => {
        const filtered = prev.filter(s => !(s.date === editingSlot.date && s.period === editingSlot.period));
        return [...filtered, editingSlot];
    });
    setEditingSlot(null);
  };

  const handleDeleteSlot = () => {
     if (!editingSlot) return;
     setSlots(prev => prev.filter(s => !(s.date === editingSlot.date && s.period === editingSlot.period)));
     setEditingSlot(null);
  };

  const handleDeleteSlotClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editingSlot || deleteSlotConfirmLockRef.current) return;
    deleteSlotConfirmLockRef.current = true;
    const slotSnapshot = editingSlot;
    showModal({
      title: '確認刪除此節課',
      message: `確定要刪除「${slotSnapshot.date} ${slotSnapshot.period}」${slotSnapshot.subject} ${slotSnapshot.className} 嗎？`,
      type: 'warning',
      mode: 'confirm',
      confirmText: '刪除',
      cancelText: '取消',
      onConfirm: () => {
        handleDeleteSlot();
        closeModal();
      }
    });
  };

  const getSlotInfo = (date: string, period: string) => slots.find(s => s.date === date && s.period === period);

  // Import Default Schedule Logic
  const handleImportSchedule = (isAuto: boolean = false) => {
      if (!originalTeacherId) { 
          if (!isAuto) showModal({ title: '錯誤', message: '請先選擇請假教師', type: 'warning' }); 
          return; 
      }
      
      const teacher = teachers.find((t) => t.id === originalTeacherId);
      const defSched = resolveTeacherDefaultSchedule(teacher, activeSemesterId);
      if (!teacher || !defSched || defSched.length === 0) {
           if (!isAuto) showModal({ title: '無資料', message: '該教師在目前「綁定學期」下尚無預設課表，或尚未設定任何預設課表。請至「教師管理」編輯預設週課表（並確認系統設定中的綁定學期是否正確）。', type: 'warning' });
           return;
      }

      const newSlots: TimetableSlot[] = [...slots];
      let loopDate = parseLocalDate(startDate);
      const finalDate = parseLocalDate(endDate);
      
      if (loopDate > finalDate) {
          if (!isAuto) showModal({ title: '日期錯誤', message: '開始日期不能晚於結束日期', type: 'error' }); 
          return; 
      }

      let addedCount = 0;

      while (loopDate <= finalDate) {
          const dateStr = `${loopDate.getFullYear()}-${String(loopDate.getMonth()+1).padStart(2,'0')}-${String(loopDate.getDate()).padStart(2,'0')}`;
          
          // Skip holidays
          if (holidays.includes(dateStr)) {
              loopDate.setDate(loopDate.getDate() + 1);
              continue;
          }

          const dayOfWeek = loopDate.getDay(); // 1=Mon, 5=Fri
          
          // Find slots in teacher's default schedule that match this day of week
          const daySchedule = defSched.filter((s) => s.day === dayOfWeek);

          daySchedule.forEach(sch => {
              // Check if slot already exists for this date/period
              const existIdx = newSlots.findIndex(s => s.date === dateStr && s.period === sch.period);
              
              // If exists, overwrite? Or skip? Let's overwrite to ensure it matches the schedule.
              if (existIdx > -1) {
                  newSlots.splice(existIdx, 1);
              }

              // Auto-detect Overtime
              // Check if this slot (day + period) is in teacher.defaultOvertimeSlots
              const isOvertime = teacher.defaultOvertimeSlots?.some(ot => ot.day === dayOfWeek && ot.period === sch.period) || false;

              newSlots.push({
                  date: dateStr,
                  period: sch.period,
                  subject: sch.subject,
                  className: sch.className,
                  substituteTeacherId: activeSubId === 'pending' ? null : activeSubId,
                  payType: activePayType, // Use current active pay type (default hourly)
                  isOvertime: isOvertime // Set detected overtime status
              });
              addedCount++;
          });

          loopDate.setDate(loopDate.getDate() + 1);
      }
      
      setSlots(newSlots);
      
      // Auto-jump to start date if manual
      if (!isAuto) {
          setViewDate(parseLocalDate(startDate));
          if (addedCount > 0) {
              showModal({ title: '匯入成功', message: `已成功從 ${teacher.name} 的預設課表匯入 ${addedCount} 節課程。\n期間：${startDate} ~ ${endDate}`, type: 'success' });
          } else {
              showModal({ title: '無資料匯入', message: '選定的日期範圍內沒有對應的課表資料 (可能遇假日或非上課日)。', type: 'info' });
          }
      } else {
          // If auto and added something, maybe jump too?
          if (addedCount > 0) setViewDate(parseLocalDate(startDate));
      }
  };

  // Copy Schedule Logic ... (Same as before)
  const handleOpenCopyModal = () => {
      setCopyRange({ start: startDate, end: endDate });
      setIsCopyModalOpen(true);
  };

  const executeCopySchedule = () => {
      // ... (Copy Logic Same as before, ensure it updates state slots)
      const sourcePattern: Record<number, TimetableSlot[]> = {};
      let hasSourceData = false;
      slots.forEach(slot => {
          const slotDate = parseLocalDate(slot.date);
          if (currentWeekDays.includes(slot.date)) {
              const day = slotDate.getDay();
              if (!sourcePattern[day]) sourcePattern[day] = [];
              sourcePattern[day].push(slot);
              hasSourceData = true;
          }
      });

      if (!hasSourceData) { showModal({ title: '無法複製', message: '目前顯示的週次沒有任何課程資料。', type: 'warning' }); return; }
      if (!copyRange.start || !copyRange.end || new Date(copyRange.start) > new Date(copyRange.end)) { showModal({ title: '日期錯誤', message: '請檢查日期區間。', type: 'error' }); return; }

      let newSlots = [...slots];
      let loopDate = parseLocalDate(copyRange.start);
      const finalDate = parseLocalDate(copyRange.end);
      let addedCount = 0;

      while (loopDate <= finalDate) {
          const targetDateStr = `${loopDate.getFullYear()}-${String(loopDate.getMonth()+1).padStart(2,'0')}-${String(loopDate.getDate()).padStart(2,'0')}`;
          if (holidays.includes(targetDateStr)) { loopDate.setDate(loopDate.getDate() + 1); continue; }
          const dayOfWeek = loopDate.getDay();
          if (sourcePattern[dayOfWeek]) {
              const dayPattern = sourcePattern[dayOfWeek];
              dayPattern.forEach(srcSlot => {
                  newSlots = newSlots.filter(s => !(s.date === targetDateStr && s.period === srcSlot.period));
                  newSlots.push({ ...srcSlot, date: targetDateStr });
                  addedCount++;
              });
          }
          loopDate.setDate(loopDate.getDate() + 1);
      }
      setSlots(newSlots);
      setIsCopyModalOpen(false);
      showModal({ title: '複製成功', message: `已新增/更新 ${addedCount} 節課程。`, type: 'success' });
  };

  const isDocRequired = [LeaveType.PUBLIC_OFFICIAL, LeaveType.PUBLIC_AFFAIRS, LeaveType.PUBLIC_COUNSELING].includes(leaveType);

  const executeSave = async () => {
    // Determine Final Date Range
    let finalStart = startDate;
    let finalEnd = endDate;
    if (slots.length > 0) {
      const sortedDates = slots.map(s => s.date).sort();
      finalStart = sortedDates[0] < finalStart ? sortedDates[0] : finalStart;
      finalEnd = sortedDates[sortedDates.length - 1] > finalEnd ? sortedDates[sortedDates.length - 1] : finalEnd;
    }

    // 編輯模式：沿用既有明細金額快照，避免教師薪級後續提敘時回編資料造成歷史金額被重算
    const existingRecord = isEditMode && id ? records.find(r => r.id === id) : undefined;
    const oldMap = new Map<string, typeof details[number]>();
    (existingRecord?.details || []).forEach((d) => {
      const periodsKey = (d.selectedPeriods || []).slice().sort().join(',');
      const key = `${d.date}_${d.substituteTeacherId}_${d.payType}_${d.isOvertime ? 1 : 0}_${periodsKey}_${d.periodCount}`;
      oldMap.set(key, d);
    });
    const stabilizedDetails = details.map((d) => {
      const periodsKey = (d.selectedPeriods || []).slice().sort().join(',');
      const key = `${d.date}_${d.substituteTeacherId}_${d.payType}_${d.isOvertime ? 1 : 0}_${periodsKey}_${d.periodCount}`;
      const old = oldMap.get(key);
      if (!old) return d;
      return {
        ...d,
        calculatedAmount: Number(old.calculatedAmount) || d.calculatedAmount,
        unitRateSnapshot: old.unitRateSnapshot != null ? Number(old.unitRateSnapshot) : d.unitRateSnapshot,
        rateSnapshotSource: old.rateSnapshotSource || d.rateSnapshotSource || 'legacy',
      };
    });

    const recordData: LeaveRecord = {
      id: isEditMode && id ? id : crypto.randomUUID(),
      originalTeacherId,
      leaveType,
      reason,
      docId: docId || undefined,
      applicationDate: applicationDate || undefined,
      startDate: finalStart,
      endDate: finalEnd,
      details: stabilizedDetails,
      slots,
      createdAt,
      allowPartial: allowPartial || undefined,
      ptaPaysHourly: ptaPaysHourly || undefined,
      homeroomFeeByPta: homeroomFeeByPta || undefined
    };

    try {
      if (isEditMode) {
        await updateRecord(recordData);
        showModal({ title: '儲存成功', message: '代課單已更新。', type: 'success', onConfirm: () => closeModal(), confirmText: '好' });
      } else {
        await addRecord(recordData);
        const saveMonth = finalStart ? finalStart.slice(0, 7) : ''; // 例 2025-04
        showModal({
          title: '建立成功',
          message: `資料已儲存！${saveMonth ? `\n請至「代課清冊」並選擇「${saveMonth}」該月份即可看到本筆。` : ''}`,
          type: 'success',
          onConfirm: () => { resetForm(); closeModal(); },
          confirmText: '新增下一筆'
        });
      }
    } catch (err: any) {
      console.error('儲存失敗', err);
      const code = err?.code || '';
      const msg = err?.message || String(err);
      showModal({
        title: '儲存失敗',
        message: `無法寫入資料${code ? ` (${code})` : ''}：${msg}`,
        type: 'error'
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!originalTeacherId) { showModal({ title: '欄位未填', message: '請選擇請假教師', type: 'warning' }); return; }
    if (slots.length === 0) { showModal({ title: '欄位未填', message: '請至少選擇一節課程', type: 'warning' }); return; }
    
    // Holiday check
    const holidayConflicts = Array.from(new Set(slots.filter(s => holidays.includes(s.date)).map(s => s.date))).sort();
    if (holidayConflicts.length > 0) {
        showModal({ title: '⚠️ 假日排課警示', message: `包含假日：${holidayConflicts.join(', ')}\n確定要儲存嗎？`, type: 'warning', mode: 'confirm', confirmText: '確認儲存', onConfirm: executeSave });
        return;
    }
    executeSave();
  };

  const pendingSlotsCount = slots.filter(s => !s.substituteTeacherId).length;

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <Modal isOpen={modal.isOpen} onClose={closeModal} onConfirm={() => { if(modal.onConfirm) modal.onConfirm(); if (modal.mode === 'alert') closeModal(); }} title={modal.title} message={modal.message} type={modal.type} mode={modal.mode} confirmText={modal.confirmText} />

      {/* Copy Modal */}
      {isCopyModalOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 border border-slate-200">
                  <h3 className="font-bold text-lg mb-4">複製本週課表</h3>
                  <div className="space-y-4">
                      <div><label className="block text-xs font-bold mb-1">開始日期</label><input type="date" className="w-full px-3 py-2 border rounded" value={copyRange.start} onChange={e => setCopyRange({...copyRange, start: e.target.value})}/></div>
                      <div><label className="block text-xs font-bold mb-1">結束日期</label><input type="date" className="w-full px-3 py-2 border rounded" value={copyRange.end} onChange={e => setCopyRange({...copyRange, end: e.target.value})}/></div>
                      <div className="flex justify-end gap-2 mt-4"><button onClick={() => setIsCopyModalOpen(false)} className="px-4 py-2 border rounded">取消</button><button onClick={executeCopySchedule} className="px-4 py-2 bg-indigo-600 text-white rounded font-bold">確認複製</button></div>
                  </div>
              </div>
          </div>
      )}

      {/* Slot Editor：全域 Modal 開啟時隱藏，避免與確認視窗兩層 z-index 疊加或重複互動 */}
      {editingSlot && !modal.isOpen && (
         <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 border border-slate-200">
                <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center"><h3 className="font-bold text-slate-800">編輯課程</h3><button onClick={() => setEditingSlot(null)}><X size={20} className="text-slate-400"/></button></div>
                <div className="p-6 space-y-4">
                    <div className="flex items-center text-sm text-slate-500 mb-2"><span className="bg-slate-100 px-2 py-1 rounded mr-2 font-mono">{editingSlot.date}</span><span>{formatPeriod(editingSlot.period)}</span></div>
                    <div><label className="block text-xs font-bold text-slate-500 mb-1">代課教師</label><SearchableSelect options={substituteTeacherOptions} value={editingSlot.substituteTeacherId || 'pending'} onChange={(val) => setEditingSlot({...editingSlot, substituteTeacherId: val === 'pending' ? null : val})} placeholder="搜尋..." allowCreate={true} /></div>
                    <div className="grid grid-cols-2 gap-3">
                         <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">科目</label>
                            <input type="text" className="w-full px-3 py-2 border rounded text-sm" value={editingSlot.subject} onChange={e => setEditingSlot({...editingSlot, subject: e.target.value})}/>
                            {SHOW_SUBJECT_QUICK_PICK && (
                            <div className="flex flex-wrap gap-1 mt-1">{COMMON_SUBJECTS.map(s => <button key={s} type="button" onClick={()=>setEditingSlot({...editingSlot, subject: s})} className="text-[10px] bg-slate-100 px-2 py-0.5 rounded hover:bg-indigo-50 hover:text-indigo-600">{s}</button>)}</div>
                            )}
                         </div>
                         <div><label className="block text-xs font-bold text-slate-500 mb-1">班級</label><input type="text" className="w-full px-3 py-2 border rounded text-sm" value={editingSlot.className} onChange={e => setEditingSlot({...editingSlot, className: e.target.value})}/></div>
                    </div>
                    <div className="flex items-center space-x-4">
                        <div className="flex-1"><label className="block text-xs font-bold text-slate-500 mb-1">支薪方式</label><select className="w-full px-3 py-2 border rounded text-sm" value={editingSlot.payType} onChange={e => setEditingSlot({...editingSlot, payType: e.target.value as PayType})}><option value={PayType.HOURLY}>鐘點費</option><option value={PayType.DAILY}>日薪</option><option value={PayType.HALF_DAY}>半日薪</option></select></div>
                        <div className="flex items-center pt-5">
                            <input type="checkbox" id="isOvertime" checked={editingSlot.isOvertime || false} onChange={e => setEditingSlot({...editingSlot, isOvertime: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"/>
                            <label htmlFor="isOvertime" className="ml-2 text-sm font-bold text-slate-700">超鐘點時段</label>
                        </div>
                    </div>
                </div>
                <div className="bg-slate-50 px-6 py-4 border-t flex justify-between"><button type="button" onClick={handleDeleteSlotClick} className="text-red-500 text-sm flex items-center"><Trash2 size={16} className="mr-1"/> 刪除</button><div className="flex gap-2"><button onClick={() => setEditingSlot(null)} className="px-4 py-2 border rounded text-sm">取消</button><button onClick={handleSaveEditedSlot} className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-bold">儲存</button></div></div>
             </div>
         </div>
      )}

      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <Link to="/records" className="text-slate-500 hover:text-indigo-600 flex items-center mb-2 text-sm"><ArrowLeft size={16} className="mr-1"/> 返回清冊</Link>
           <h1 className="text-2xl md:text-3xl font-bold text-slate-800">{isEditMode ? '編輯代課單 (課務派代)' : '建立代課單 (課務派代)'}</h1>
        </div>
        <div className="flex items-center space-x-2 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm w-full md:w-auto justify-between md:justify-start">
             <Calculator size={20} className="text-indigo-600"/><div className="text-right"><p className="text-xs text-slate-500 font-medium">總計金額 (已指定)</p><p className="text-lg font-bold text-indigo-700">${totalEstimatedCost.toLocaleString()}</p></div>
        </div>
      </header>

      <InstructionPanel title="使用說明：建立/編輯代課單">
        <div className="space-y-1">
          <CollapsibleItem title="基本資料設定">
            <p>請先選擇「請假教師」與「假別」，並設定「申請日期」與「事由」。系統會依據假別自動判斷是否為「公付」或「自付」。</p>
          </CollapsibleItem>
          <CollapsibleItem title="代課期間與課表載入">
            <p>設定代課的起訖日期範圍。若該教師在「教師管理」中有設定預設課表，可點擊「載入課表」按鈕，系統會自動在該日期範圍內填入對應的課程。</p>
          </CollapsibleItem>
          <CollapsibleItem title="排課與代課人指定">
            <p><strong>單節操作：</strong>在下方課表點擊空格可新增單節課程，或點擊已存在的課程進行編輯/刪除。</p>
            <p><strong>批次操作：</strong>使用上方工具列可快速設定「指定代課教師」、「科目」與「班級」，設定後點擊課表格子即可套用。</p>
            <p><strong>支薪方式：</strong>預設為「鐘點」，若為全日代課請切換為「日薪」；半日代課請切換為「半日薪」（代課支出為一半日薪，導師費可另列家長會清冊）。</p>
          </CollapsibleItem>
          <CollapsibleItem title="儲存與確認">
            <p>確認下方統計金額無誤後，點擊右下角「儲存代課單資料」即可建立紀錄。儲存後可至「代課清冊」頁面查看或匯出憑證。</p>
          </CollapsibleItem>
        </div>
      </InstructionPanel>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-4 relative z-20">
             <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-500 mb-1">請假教師</label>
                <SearchableSelect options={originalTeacherOptions} value={originalTeacherId} onChange={(val) => handleTeacherSelection(val, true)} placeholder="搜尋..." required allowCreate={true}/>
             </div>
             <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-500 mb-1">假別</label>
                <select className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white" value={leaveType} onChange={e => handleLeaveTypeChange(e.target.value as LeaveType)}>{Object.values(LeaveType).map(t => <option key={t} value={t}>{t}</option>)}</select>
             </div>
             <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-500 mb-1">公文字號</label>
                <SearchableSelect options={docIdOptions} value={docId} onChange={setDocId} placeholder={isDocRequired ? "輸入文號..." : "無須公文"} disabled={!isDocRequired} allowCreate={true} className={!isDocRequired ? "opacity-50 pointer-events-none bg-slate-100" : ""}/>
             </div>
             <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-500 mb-1">申請日期</label>
                <input type="date" className="w-full px-3 py-2 border border-slate-300 rounded-lg" value={applicationDate} onChange={e => setApplicationDate(e.target.value)} required />
             </div>
             <div className="md:col-span-6">
                <label className="block text-xs font-bold text-slate-500 mb-1">事由</label>
                <input type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg" value={reason} onChange={e => setReason(e.target.value)} placeholder="例：公假研習" />
             </div>
             {leaveType !== LeaveType.PUBLIC_PTA && (
               <div className="md:col-span-12 space-y-2">
                 <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                   <input type="checkbox" checked={ptaPaysHourly} onChange={e => setPtaPaysHourly(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"/>
                   <span>家長會支出鐘點（鐘點費由家長會，入家長會清冊）</span>
                 </label>
                 <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                   <input type="checkbox" checked={homeroomFeeByPta} onChange={e => setHomeroomFeeByPta(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"/>
                   <span>家長會支出導師費(半天)（僅半日導師費入家長會清冊）</span>
                 </label>
               </div>
             )}
             
             {/* Updated: Date Range with Import Button */}
             <div className="md:col-span-6">
                 <label className="block text-xs font-bold text-slate-500 mb-1">代課期間設定 (設定範圍以匯入課表)</label>
                 <div className="flex items-center space-x-2">
                     <input type="date" className="w-full px-3 py-2 border border-slate-300 rounded-lg" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                     <span className="text-slate-400">~</span>
                     <input type="date" className="w-full px-3 py-2 border border-slate-300 rounded-lg" value={endDate} onChange={e => setEndDate(e.target.value)} required />
                     <button type="button" onClick={() => handleImportSchedule(false)} className="px-4 py-2 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-lg font-bold flex items-center whitespace-nowrap transition-colors" title="從預設課表載入">
                         <Download size={18} className="mr-1"/> 載入課表
                     </button>
                 </div>
                 {/* Auto Calculated Display */}
                 <div className="mt-1 text-xs text-slate-500 flex items-center">
                     <Info size={12} className="mr-1"/> 
                     實際代課區間 (依據下方課表自動偵測): 
                     <span className="ml-1 font-bold font-mono text-indigo-600">
                         {slots.length > 0 ? `${calculatedStart} ~ ${calculatedEnd}` : '尚未排課'}
                     </span>
                 </div>
             </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-slate-200 relative z-10">
          <div className="bg-slate-50 border-b border-slate-200 p-4">
             <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
                <div className="lg:col-span-4 grid grid-cols-2 gap-2">
                   <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center"><BookOpen size={12} className="mr-1"/> 科目</label>
                      <input type="text" placeholder="例: 國語" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" value={activeSubject} onChange={e => setActiveSubject(e.target.value)}/>
                      {SHOW_SUBJECT_QUICK_PICK && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                          {COMMON_SUBJECTS.map(sub => (
                              <button key={sub} type="button" onClick={() => setActiveSubject(sub)} className="text-[10px] px-2 py-0.5 bg-white border border-slate-200 rounded-full hover:border-indigo-300 hover:text-indigo-600 transition-colors shadow-sm">
                                  {sub}
                              </button>
                          ))}
                      </div>
                      )}
                   </div>
                   <div className="relative self-start">
                      <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center justify-between"><span className="flex items-center"><Users size={12} className="mr-1"/> 班級</span></label>
                      <div className="flex">
                        <input type="text" placeholder="例: 601" className="w-full px-3 py-2 border border-slate-300 rounded-l-lg text-sm" value={activeClass} onChange={e => setActiveClass(e.target.value)}/>
                        <button type="button" onClick={() => setIsAutoIncrement(!isAutoIncrement)} className={`px-2 border-y border-r rounded-r-lg flex items-center justify-center transition-colors ${isAutoIncrement ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-slate-50 border-slate-300 text-slate-400'}`}><Repeat size={16}/></button>
                      </div>
                   </div>
                </div>

                <div className="lg:col-span-5 grid grid-cols-2 gap-2 self-start">
                   <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">指定代課教師</label>
                      <SearchableSelect options={substituteTeacherOptions} value={activeSubId} onChange={(val) => handleTeacherSelection(val, false)} placeholder="搜尋..." allowCreate={true}/>
                   </div>
                   <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">支薪方式</label>
                      <select className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white" value={activePayType} onChange={e => setActivePayType(e.target.value as PayType)}><option value={PayType.HOURLY}>鐘點費</option><option value={PayType.DAILY}>日薪 (全日)</option><option value={PayType.HALF_DAY}>半日薪</option></select>
                   </div>
                </div>

                <div className="lg:col-span-3 flex justify-end self-start pt-6">
                    <div className="flex items-center space-x-1 bg-white rounded-lg border border-slate-200 p-1">
                        <button type="button" onClick={() => handleWeekNav('prev')} className="p-1 hover:bg-slate-100 rounded text-slate-600"><ChevronLeft size={20} /></button>
                        <span className="text-xs font-medium px-2 min-w-[100px] text-center">{currentWeekDays[0].slice(5).replace('-','/')} ~ {currentWeekDays[4].slice(5).replace('-','/')}</span>
                        <button type="button" onClick={() => handleWeekNav('next')} className="p-1 hover:bg-slate-100 rounded text-slate-600"><ChevronRight size={20} /></button>
                    </div>
                    <button type="button" onClick={handleOpenCopyModal} className="ml-2 p-2 bg-white hover:bg-slate-50 text-slate-600 rounded-lg border border-slate-300 transition-colors" title="複製本週課表"><Copy size={20} /></button>
                </div>
             </div>
             
             {activePayType === PayType.DAILY && <div className="mt-2 text-[11px] text-indigo-600 bg-indigo-50 px-2 py-1 rounded inline-flex items-center"><Info size={12} className="mr-1"/>日薪模式：請點選當日有課的時段；為確保一致性，系統將不會自動遞增班級。</div>}
             {activePayType === PayType.HALF_DAY && <div className="mt-2 text-[11px] text-amber-600 bg-amber-50 px-2 py-1 rounded inline-flex items-center"><Info size={12} className="mr-1"/>半日薪：代課支出為一半的日薪；導師費(半日)可由家長會清冊另列。</div>}
             {leaveType !== LeaveType.PUBLIC_PTA && (
              <div className="mt-2 space-y-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={ptaPaysHourly} onChange={e => setPtaPaysHourly(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"/>
                  <span>家長會支出鐘點</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={homeroomFeeByPta} onChange={e => setHomeroomFeeByPta(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"/>
                  <span>家長會支出導師費(半天)</span>
                </label>
              </div>
            )}
          </div>

          <div className="p-6 overflow-x-auto">
             <div className="min-w-[700px]">
                {/* Calendar Grid */}
                <div className="grid grid-cols-11 mb-2">
                   <div className="col-span-1"></div>
                   {currentWeekDays.map((dayStr) => {
                     const date = new Date(dayStr);
                     const weekDayName = ['日','一','二','三','四','五','六'][date.getDay()];
                     const isHoliday = holidays.includes(dayStr);
                     return (
                       <div key={dayStr} className="col-span-2 text-center px-1">
                          <div className={`py-2 rounded-lg border text-sm font-bold ${isHoliday ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                             {weekDayName} <span className="text-xs font-normal ml-1">{date.getMonth()+1}/{date.getDate()}</span>
                             {isHoliday && <span className="block text-[10px] font-normal">🏖️ 放假</span>}
                          </div>
                       </div>
                     );
                   })}
                </div>

                {PERIOD_ROWS.map((period) => (
                  <div key={period.id} className="grid grid-cols-11 mb-1">
                     <div className="col-span-1 flex items-center justify-center text-sm font-bold text-slate-400">{period.label}</div>
                     {currentWeekDays.map((dayStr) => {
                        const slot = getSlotInfo(dayStr, period.id);
                        const isSelected = !!slot;
                        const isHoliday = holidays.includes(dayStr);
                        let boxClass = 'bg-white border-slate-200 text-slate-300 hover:border-indigo-300 hover:bg-indigo-50';
                        let textColor = 'text-slate-400';
                        if (isHoliday && !isSelected) { boxClass = 'bg-slate-100 border-slate-200 shadow-inner pattern-diagonal-lines-sm text-slate-300 cursor-not-allowed'; }
                        if (isSelected) {
                            if (slot.substituteTeacherId === null) { boxClass = 'bg-red-50 border-red-300 shadow-sm'; textColor = 'text-red-600'; } 
                            else { 
                                const teacher = teachers.find(t => t.id === slot.substituteTeacherId);
                                if (teacher?.type === TeacherType.INTERNAL) { boxClass = 'bg-indigo-50 border-indigo-200 shadow-sm'; textColor = 'text-indigo-700'; } 
                                else { boxClass = 'bg-green-50 border-green-200 shadow-sm'; textColor = 'text-green-700'; }
                            }
                        }
                        return (
                          <div key={`${dayStr}-${period.id}`} className="col-span-2 px-1 h-14">
                             <button type="button" onClick={() => handleSlotClick(dayStr, period.id)} disabled={isHoliday && !isSelected} className={`w-full h-full rounded-lg border text-xs transition-all flex flex-col items-center justify-center p-1 relative overflow-hidden ${boxClass}`}>
                               {isSelected ? (
                                   <>
                                     <div className={`font-bold ${textColor} w-full truncate`}>{slot.substituteTeacherId ? teachers.find(t => t.id === slot.substituteTeacherId)?.name : <span className="flex items-center justify-center"><UserX size={10} className="mr-1"/>待聘</span>}</div>
                                     <div className="text-[10px] text-slate-500 w-full truncate mt-0.5">{slot.subject} {slot.className}</div>
                                     {slot.payType === PayType.DAILY && <div className="absolute top-0 right-0 bg-amber-100 text-amber-700 text-[9px] px-1 rounded-bl leading-none py-0.5 font-bold">日薪</div>}
                                     {slot.payType === PayType.HALF_DAY && <div className="absolute top-0 right-0 bg-amber-50 text-amber-600 text-[9px] px-1 rounded-bl leading-none py-0.5 font-bold">半日</div>}
                                     {slot.isOvertime && <div className="absolute bottom-0 right-0 bg-purple-100 text-purple-700 text-[9px] px-1 rounded-tl leading-none py-0.5 font-bold">超鐘</div>}
                                   </>
                               ) : (
                                   isHoliday ? <span className="opacity-50 text-[10px] text-slate-400 flex flex-col items-center"><Ban size={14} className="text-rose-300"/><span className="text-[9px] text-rose-300 font-bold mt-0.5">禁止</span></span> : <span className="opacity-0 hover:opacity-100 text-[10px] text-indigo-300">{activePayType === PayType.DAILY ? '日薪' : activePayType === PayType.HALF_DAY ? '半日' : '新增'}</span>
                               )}
                             </button>
                          </div>
                        );
                     })}
                  </div>
                ))}
             </div>
          </div>
        </section>

        {/* Footer Actions */}
        <div className="flex flex-col md:flex-row justify-between items-center pt-4 pb-12 gap-4">
            <div className="text-sm text-slate-500 w-full md:w-auto text-center md:text-left">
                {pendingSlotsCount > 0 && <span className="text-red-500 font-bold bg-red-50 px-2 py-1 rounded inline-block">還有 {pendingSlotsCount} 節待聘</span>}
            </div>
            <button type="submit" className="w-full md:w-auto bg-indigo-600 text-white px-8 py-3 rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-200 font-bold flex items-center justify-center space-x-2"><Save size={20} /><span>{isEditMode ? '儲存變更' : '儲存代課單資料'}</span></button>
        </div>
      </form>
    </div>
  );
};

export default EntryForm;
