import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callGasApi } from '../utils/api';
import { sortPeriods } from '../utils/calculations';
import { Loader2, FileSpreadsheet, Calendar, UserPlus, Edit, Search, Trash2, Save, CloudUpload } from 'lucide-react';
import InstructionPanel from '../components/InstructionPanel';
import Modal, { ModalType, ModalMode } from '../components/Modal';
import { TeacherType, Teacher } from '../types';
import SearchableSelect from '../components/SearchableSelect';

const LanguageSalary: React.FC = () => {
  const { settings, teachers, holidays, languagePayrolls, updateTeacher, addTeacher, loadFromGas } = useAppStore();
  const [activeTab, setActiveTab] = useState<'salary' | 'settings' | 'indigenous'>('salary');
  
  // Selection State (Salary Tab)
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [showAllTeachersInSelect, setShowAllTeachersInSelect] = useState(false); // New: Allow selecting non-Hakka teachers

  // Indigenous Full-time State
  const [indigenousMonth, setIndigenousMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [indigenousPreviewData, setIndigenousPreviewData] = useState<{
    teacherName: string;
    jobTitle: string;
    weeklySchedule: number[]; // Mon-Fri
    weeklySubtotal: number;
    monthlyRequired: number;
    adjustment: number;
    actual: number;
    hourlyRate: number;
    totalAmount: number;
    /** 當月週一至週五各出現幾次（學期內、非假日、不含週末；供清冊 C7–G7） */
    weekdayCounts: number[];
  } | null>(null);

  const [startMonth, setStartMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [endMonth, setEndMonth] = useState<string>('');
  const [hourlyRate, setHourlyRate] = useState<number>(400);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [deletePreviewSessionConfirm, setDeletePreviewSessionConfirm] = useState<{ monthIndex: number; sessionId: string } | null>(null);
  const [previewData, setPreviewData] = useState<{
      teacherName: string;
      hourlyRate: number;
      months: {
          month: string;
          sessions: { id: string; date: string; periods: string[]; count: number }[];
      }[];
  } | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Teacher Settings State
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAllTeachersInList, setShowAllTeachersInList] = useState(false);
  const [schedule, setSchedule] = useState<{dayOfWeek: number, periods: string[], isSixthGrade?: boolean}[]>([]);
  const [formLanguage, setFormLanguage] = useState('客語');
  const [formHourlyRate, setFormHourlyRate] = useState(400);
  const [formCategory, setFormCategory] = useState<'Indigenous' | 'NewImmigrant' | 'IndigenousFullTime'>('Indigenous');
  const [formJobTitle, setFormJobTitle] = useState('');
  const [formHostSchool, setFormHostSchool] = useState('');

  // Filtered Teachers
  const hakkaTeachers = useMemo(() => 
    teachers.filter(t => t.languageSpecialty?.includes('客') || t.teacherCategory === 'Indigenous'),
    [teachers]
  );

  const indigenousFullTimeTeachers = useMemo(() => 
    teachers.filter(t => t.teacherCategory === 'IndigenousFullTime'),
    [teachers]
  );

  const uniqueHostSchools = useMemo(() => Array.from(new Set(teachers.map(t => t.hostSchool).filter(Boolean) as string[])), [teachers]);
  const uniqueLanguages = useMemo(() => Array.from(new Set(teachers.map(t => t.languageSpecialty).filter(Boolean) as string[])), [teachers]);

  // All Teachers for fallback
  const availableTeachersForSelect = useMemo(() => {
      return showAllTeachersInSelect ? teachers : hakkaTeachers;
  }, [teachers, hakkaTeachers, showAllTeachersInSelect]);

  const displayedTeachersInList = useMemo(() => {
      if (activeTab === 'settings') {
        if (showAllTeachersInList) {
            return teachers.filter(t => t.type === TeacherType.LANGUAGE || t.languageSpecialty);
        }
        // Combine Hakka and Indigenous Full Time for settings list
        const combined = [...hakkaTeachers, ...indigenousFullTimeTeachers];
        // Remove duplicates based on ID
        return Array.from(new Map(combined.map(t => [t.id, t])).values());
      } else if (activeTab === 'indigenous') {
        return indigenousFullTimeTeachers;
      }
      return [];
  }, [teachers, hakkaTeachers, indigenousFullTimeTeachers, showAllTeachersInList, activeTab]);

  // Update hourly rate when teacher changes (Salary Tab)
  useEffect(() => {
    if (selectedTeacherId) {
      const teacher = teachers.find(t => t.id === selectedTeacherId);
      if (teacher?.defaultHourlyRate) {
        setHourlyRate(teacher.defaultHourlyRate);
      }
      
      // For Indigenous Full-time calculation
      if (activeTab === 'indigenous') {
         calculateIndigenousPreview(teacher);
      }
    }
  }, [selectedTeacherId, teachers, indigenousMonth, activeTab]);

  // Initialize Modal state
  useEffect(() => {
    if (editingTeacher) {
      setSchedule(editingTeacher.languageSchedule || []);
      setFormLanguage(editingTeacher.languageSpecialty || '客語');
      setFormHourlyRate(editingTeacher.defaultHourlyRate || 400);
      setFormCategory(editingTeacher.teacherCategory || 'Indigenous');
      setFormJobTitle(editingTeacher.jobTitle || '');
      setFormHostSchool(editingTeacher.hostSchool || '');
    } else {
      setSchedule([]);
      setFormLanguage('客語');
      setFormHourlyRate(400);
      setFormCategory(activeTab === 'indigenous' ? 'IndigenousFullTime' : 'Indigenous');
      setFormJobTitle('');
      setFormHostSchool('');
    }
  }, [editingTeacher, activeTab]);

  // Modal State
  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: ModalType;
    mode: ModalMode;
  }>({
    isOpen: false, title: '', message: '', type: 'info', mode: 'alert'
  });

  const closeModal = () => setModal(prev => ({ ...prev, isOpen: false }));
  const showModal = (props: Partial<typeof modal>) => {
      setModal({
          isOpen: true,
          title: props.title || '訊息',
          message: props.message || '',
          type: props.type || 'info',
          mode: props.mode || 'alert'
      });
  };

  const handleSaveTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const teacherData: Partial<Teacher> = {
      name: formData.get('name') as string,
      languageSpecialty: formLanguage,
      defaultHourlyRate: formHourlyRate,
      phone: formData.get('phone') as string,
      note: formData.get('note') as string,
      type: TeacherType.LANGUAGE,
      languageSchedule: schedule,
      teacherCategory: formCategory,
      jobTitle: formJobTitle,
      hostSchool: formHostSchool,
      // Ensure other fields are initialized for new teachers
      hasCertificate: editingTeacher?.hasCertificate || false,
      baseSalary: editingTeacher?.baseSalary || 0,
      researchFee: editingTeacher?.researchFee || 0,
      isHomeroom: editingTeacher?.isHomeroom || false,
      isRetired: editingTeacher?.isRetired || false,
      isSpecialEd: editingTeacher?.isSpecialEd || false,
      isGraduatingHomeroom: editingTeacher?.isGraduatingHomeroom || false,
    };

    if (editingTeacher) {
      updateTeacher({ ...editingTeacher, ...teacherData } as Teacher);
    } else {
      addTeacher({ ...teacherData, id: crypto.randomUUID() } as Teacher);
    }
    setIsTeacherModalOpen(false);
    setEditingTeacher(null);
  };

  // ... (toggleScheduleSlot, getDaysInMonth, calculateSessionsForMonth remain same)

  const calculateIndigenousPreview = (teacher: Teacher | undefined) => {
      if (!teacher || !teacher.languageSchedule) {
          setIndigenousPreviewData(null);
          return;
      }

      // 1. Calculate Weekly Schedule (Total periods per day)
      const weeklySchedule = [1, 2, 3, 4, 5].map(day => {
          const daySchedules = teacher.languageSchedule?.filter(s => s.dayOfWeek === day);
          if (!daySchedules) return 0;
          return daySchedules.reduce((acc, s) => acc + s.periods.length, 0);
      });
      const weeklySubtotal = weeklySchedule.reduce((a, b) => a + b, 0);

      // 2. Calculate Monthly Required
      const days = getDaysInMonth(indigenousMonth);
      const semesterStart = settings.semesterStart ? new Date(settings.semesterStart) : null;
      const semesterEnd = settings.semesterEnd ? new Date(settings.semesterEnd) : null;
      const graduationDate = settings.graduationDate ? new Date(settings.graduationDate) : null;

      let monthlyRequired = 0;
      const weekdayCounts = [0, 0, 0, 0, 0]; // Mon..Fri：當月該週幾有幾天（學期內、非假日）

      days.forEach(date => {
          const dayOfWeek = date.getDay();
          if (dayOfWeek === 0 || dayOfWeek === 6) return;

          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;
          const currentDate = new Date(dateStr);

          // Check semester range
          if (semesterStart && currentDate < semesterStart) return;
          if (semesterEnd && currentDate > semesterEnd) return;

          // Check holidays
          const isHoliday = holidays.includes(dateStr);
          if (isHoliday) return;

          // 清冊 C7–G7：本週幾在當月（符合上列條件）出現天數，與該師當日是否有課無關
          weekdayCounts[dayOfWeek - 1]++;

          const daySchedules = teacher.languageSchedule?.filter(s => s.dayOfWeek === dayOfWeek);

          if (daySchedules) {
              let dailyPeriods = 0;
              daySchedules.forEach(slot => {
                  if (slot.isSixthGrade && graduationDate && currentDate > graduationDate) {
                      return;
                  }
                  dailyPeriods += slot.periods.length;
              });

              monthlyRequired += dailyPeriods;
          }
      });

      setIndigenousPreviewData({
          teacherName: teacher.name,
          jobTitle: teacher.jobTitle || '民族語專職老師',
          weeklySchedule,
          weeklySubtotal,
          monthlyRequired,
          adjustment: 0,
          actual: monthlyRequired,
          hourlyRate: teacher.defaultHourlyRate || 400,
          totalAmount: monthlyRequired * (teacher.defaultHourlyRate || 400),
          weekdayCounts
      });
  };

  const handleIndigenousAdjustmentChange = (val: number) => {
      if (!indigenousPreviewData) return;
      const actual = indigenousPreviewData.monthlyRequired + val;
      setIndigenousPreviewData({
          ...indigenousPreviewData,
          adjustment: val,
          actual,
          totalAmount: actual * indigenousPreviewData.hourlyRate
      });
  };

  const handleIndigenousRateChange = (val: number) => {
      if (!indigenousPreviewData) return;
      setIndigenousPreviewData({
          ...indigenousPreviewData,
          hourlyRate: val,
          totalAmount: indigenousPreviewData.actual * val
      });
  };

  const handleGenerateIndigenous = async () => {
      if (!indigenousPreviewData || !selectedTeacherId) return;
      if (!settings.gasWebAppUrl) {
          showModal({ title: '請先設定 GAS', message: '產生族語專職印領清冊需使用 GAS，請至「系統設定」設定 GAS Web App URL。', type: 'warning' });
          return;
      }
      
      setIsGenerating(true);
      try {
          const result = await callGasApi(settings.gasWebAppUrl, 'GENERATE_INDIGENOUS_RECEIPT', {
              teacherId: selectedTeacherId,
              teacherName: indigenousPreviewData.teacherName,
              jobTitle: indigenousPreviewData.jobTitle,
              month: indigenousMonth,
              weeklySchedule: indigenousPreviewData.weeklySchedule,
              weeklySubtotal: indigenousPreviewData.weeklySubtotal,
              monthlyRequired: indigenousPreviewData.monthlyRequired,
              adjustment: indigenousPreviewData.adjustment,
              actual: indigenousPreviewData.actual,
              hourlyRate: indigenousPreviewData.hourlyRate,
              totalAmount: indigenousPreviewData.totalAmount,
              weekdayCounts: indigenousPreviewData.weekdayCounts,
              templateName: '族語清冊範本', // GID 不符時與 GAS CONFIG 一致
          });

          if (result.status === 'success') {
              showModal({ title: '成功', message: '族語專職教師領據已產生！', type: 'success' });
              if (result.data && result.data.url) {
                  window.open(result.data.url, '_blank');
              }
          } else {
              throw new Error(result.message || '產生失敗');
          }
      } catch (error: any) {
          showModal({ title: '失敗', message: error.message || String(error), type: 'error' });
      } finally {
          setIsGenerating(false);
      }
  };

  // ... (handleSyncToCloud, handleReloadData, handleGenerate, handlePreview, handleConfirmGenerate, updatePreviewSession, addPreviewSession, removePreviewSession remain same)


  const toggleScheduleSlot = (day: number, period: string) => {
      setSchedule(prev => {
          const existingSlotIndex = prev.findIndex(s => s.dayOfWeek === day && s.periods.includes(period));
          let newSchedule = [...prev];
          
          if (existingSlotIndex !== -1) {
              // Remove it
              const existingSlot = { ...newSchedule[existingSlotIndex] };
              existingSlot.periods = existingSlot.periods.filter(p => p !== period);
              
              if (existingSlot.periods.length === 0) {
                  newSchedule.splice(existingSlotIndex, 1);
              } else {
                  newSchedule[existingSlotIndex] = existingSlot;
              }
          } else {
              // Add it (default to normal)
              const normalSlotIndex = newSchedule.findIndex(s => s.dayOfWeek === day && !s.isSixthGrade);
              if (normalSlotIndex !== -1) {
                  const slot = { ...newSchedule[normalSlotIndex] };
                  slot.periods = [...slot.periods, period].sort();
                  newSchedule[normalSlotIndex] = slot;
              } else {
                  newSchedule.push({
                      dayOfWeek: day,
                      periods: [period],
                      isSixthGrade: false
                  });
              }
          }
          
          return newSchedule;
      });
  };

  const toggleSixthGrade = (day: number, period: string, isSixth: boolean) => {
      setSchedule(prev => {
          let newSchedule = [...prev];
          const currentIndex = newSchedule.findIndex(s => s.dayOfWeek === day && s.periods.includes(period));
          if (currentIndex === -1) return prev; // Should not happen

          const currentSlot = { ...newSchedule[currentIndex] };
          
          // Remove period from current slot
          currentSlot.periods = currentSlot.periods.filter(p => p !== period);
          if (currentSlot.periods.length === 0) {
              newSchedule.splice(currentIndex, 1);
          } else {
              newSchedule[currentIndex] = currentSlot;
          }

          // Add to the target slot
          const targetIndex = newSchedule.findIndex(s => s.dayOfWeek === day && !!s.isSixthGrade === isSixth);
          if (targetIndex !== -1) {
              const targetSlot = { ...newSchedule[targetIndex] };
              targetSlot.periods = [...targetSlot.periods, period].sort();
              newSchedule[targetIndex] = targetSlot;
          } else {
              newSchedule.push({ dayOfWeek: day, periods: [period], isSixthGrade: isSixth });
          }

          return newSchedule;
      });
  };

  const allSelectedPeriods = useMemo(() => {
      const periods: { day: number, dayName: string, period: string, isSixthGrade: boolean }[] = [];
      const dayNames = ['週一', '週二', '週三', '週四', '週五'];
      const periodOrder = ['早', '1', '2', '3', '4', '午', '5', '6', '7'];
      
      schedule.forEach(slot => {
          slot.periods.forEach(p => {
              periods.push({
                  day: slot.dayOfWeek,
                  dayName: dayNames[slot.dayOfWeek - 1],
                  period: p,
                  isSixthGrade: !!slot.isSixthGrade
              });
          });
      });
      
      // Sort by day then period
      periods.sort((a, b) => {
          if (a.day !== b.day) return a.day - b.day;
          return periodOrder.indexOf(a.period) - periodOrder.indexOf(b.period);
      });
      
      return periods;
  }, [schedule]);

  const getDaysInMonth = (monthStr: string) => {
      const [year, month] = monthStr.split('-').map(Number);
      const date = new Date(year, month - 1, 1);
      const days = [];
      while (date.getMonth() === month - 1) {
          days.push(new Date(date));
          date.setDate(date.getDate() + 1);
      }
      return days;
  };

  const calculateSessionsForMonth = (teacher: Teacher, monthStr: string) => {
      if (!teacher.languageSchedule) return [];
      
      const days = getDaysInMonth(monthStr);
      const sessions: { date: string, periods: string[], count: number }[] = [];

      // Parse semester dates
      const semesterStart = settings.semesterStart ? new Date(settings.semesterStart) : null;
      const semesterEnd = settings.semesterEnd ? new Date(settings.semesterEnd) : null;
      const graduationDate = settings.graduationDate ? new Date(settings.graduationDate) : null;

      days.forEach(date => {
          const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon...
          if (dayOfWeek === 0 || dayOfWeek === 6) return; // Skip weekends

          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;
          const currentDate = new Date(dateStr);

          // Check semester range
          if (semesterStart && currentDate < semesterStart) return;
          if (semesterEnd && currentDate > semesterEnd) return;
          
          // Check holidays
          const isHoliday = holidays.includes(dateStr);
          if (isHoliday) return;

          // Check schedule
          const daySchedules = teacher.languageSchedule?.filter(s => s.dayOfWeek === dayOfWeek);
          
          if (daySchedules && daySchedules.length > 0) {
              const periods: string[] = [];
              
              daySchedules.forEach(slot => {
                  // Check graduation date for 6th grade slots
                  if (slot.isSixthGrade && graduationDate && currentDate > graduationDate) {
                      return;
                  }
                  periods.push(...slot.periods);
              });
              
              if (periods.length > 0) {
                  sessions.push({
                      date: dateStr,
                      periods: sortPeriods(periods),
                      count: periods.length
                  });
              }
          }
      });
      return sessions;
  };

  const handleReloadData = async () => {
    setIsLoading(true);
    try {
        const result = await loadFromGas();
        if (result.success) {
            showModal({ title: '成功', message: '資料已重新載入', type: 'success' });
        } else {
            showModal({ title: '失敗', message: '載入失敗: ' + result.message, type: 'error' });
        }
    } catch (error) {
        showModal({ title: '錯誤', message: '載入發生錯誤', type: 'error' });
    } finally {
        setIsLoading(false);
    }
  };

  const handleGenerate = () => {
      // Placeholder for old generate function if needed, but we use handlePreview now
      handlePreview();
  };

  const handlePreview = () => {
      if (!selectedTeacherId) {
          showModal({ title: '錯誤', message: '請選擇教師', type: 'error' });
          return;
      }

      const teacher = teachers.find(t => t.id === selectedTeacherId);
      if (!teacher) {
          showModal({ title: '錯誤', message: '找不到教師資料', type: 'error' });
          return;
      }

      // 自動計算所選月份的授課資料
      const months = [startMonth];
      if (endMonth && endMonth !== startMonth) {
          if (endMonth < startMonth) {
              showModal({ title: '錯誤', message: '結束月份不能早於開始月份', type: 'error' });
              return;
          }
          months.push(endMonth);
      }

      const calculatedData = months.map(m => ({
          month: m,
          sessions: calculateSessionsForMonth(teacher, m).map(s => ({...s, id: crypto.randomUUID()}))
      }));

      // 檢查是否有授課紀錄
      const totalSessions = calculatedData.reduce((acc, m) => acc + m.sessions.length, 0);
      if (totalSessions === 0) {
          showModal({ title: '提示', message: '所選月份內查無授課日期，但您仍可手動新增。', type: 'info' });
      }

      setPreviewData({
          teacherName: teacher.name,
          hourlyRate: hourlyRate,
          months: calculatedData
      });
      setIsPreviewOpen(true);
  };

  const handleConfirmGenerate = async () => {
      if (!previewData) return;
      if (!settings.gasWebAppUrl) {
          showModal({ title: '請先設定 GAS', message: '產生客語領據需使用 GAS，請至「系統設定」設定 GAS Web App URL。', type: 'warning' });
          return;
      }

      setIsGenerating(true);
      try {
          // Clean up data for backend (remove IDs if necessary, though backend ignores extra fields usually)
          const payloadData = previewData.months.map(m => ({
              month: m.month,
              sessions: m.sessions.map(s => ({
                  date: s.date,
                  periods: s.periods,
                  count: s.count
              }))
          }));

          const result = await callGasApi(settings.gasWebAppUrl, 'GENERATE_HAKKA_RECEIPT', {
              teacherId: selectedTeacherId, // Still send ID for reference if needed
              teacherName: previewData.teacherName,
              calculatedData: payloadData,
              hourlyRate: previewData.hourlyRate,
              templateName: '客語領據範本'
          });

          if (result.status === 'success') {
              setIsPreviewOpen(false);
              showModal({ title: '成功', message: '客語薪資領據已產生！', type: 'success' });
              if (result.data && result.data.url) {
                  window.open(result.data.url, '_blank');
              }
          } else {
              throw new Error(result.message || '產生失敗');
          }
      } catch (error: any) {
          showModal({ title: '失敗', message: error.message || String(error), type: 'error' });
      } finally {
          setIsGenerating(false);
      }
  };

  const updatePreviewSession = (monthIndex: number, sessionId: string, field: string, value: any) => {
      if (!previewData) return;
      setPreviewData(prev => {
          if (!prev) return null;
          const newMonths = [...prev.months];
          const monthData = newMonths[monthIndex];
          const sessionIndex = monthData.sessions.findIndex(s => s.id === sessionId);
          
          if (sessionIndex > -1) {
              const newSessions = [...monthData.sessions];
              if (field === 'periods') {
                  // Value is string "1,2,3" -> ["1", "2", "3"]
                  const parts = (value as string).split(/[,，、 ]+/).filter(Boolean);
                  newSessions[sessionIndex] = { 
                      ...newSessions[sessionIndex], 
                      periods: parts,
                      count: parts.length // Auto update count based on periods
                  };
              } else {
                  newSessions[sessionIndex] = { ...newSessions[sessionIndex], [field]: value };
              }
              monthData.sessions = newSessions;
          }
          return { ...prev, months: newMonths };
      });
  };

  const addPreviewSession = (monthIndex: number) => {
      if (!previewData) return;
      setPreviewData(prev => {
          if (!prev) return null;
          const newMonths = [...prev.months];
          const monthStr = newMonths[monthIndex].month; // YYYY-MM
          // Default to first day of month or today
          const defaultDate = `${monthStr}-01`;
          
          newMonths[monthIndex].sessions.push({
              id: crypto.randomUUID(),
              date: defaultDate,
              periods: ['1'],
              count: 1
          });
          // Sort by date
          newMonths[monthIndex].sessions.sort((a, b) => a.date.localeCompare(b.date));
          return { ...prev, months: newMonths };
      });
  };

  const removePreviewSession = (monthIndex: number, sessionId: string) => {
      if (!previewData) return;
      setPreviewData(prev => {
          if (!prev) return null;
          const newMonths = [...prev.months];
          newMonths[monthIndex].sessions = newMonths[monthIndex].sessions.filter(s => s.id !== sessionId);
          return { ...prev, months: newMonths };
      });
  };

  return (
      <div className="p-8 h-full flex flex-col max-w-7xl mx-auto w-full">
          {/* ... existing Modal ... */}
          <Modal 
            isOpen={modal.isOpen} 
            onClose={closeModal} 
            title={modal.title} 
            message={modal.message} 
            type={modal.type} 
            mode={modal.mode} 
          />
          <Modal
            isOpen={!!deletePreviewSessionConfirm}
            onClose={() => setDeletePreviewSessionConfirm(null)}
            onConfirm={() => {
              if (deletePreviewSessionConfirm) {
                removePreviewSession(deletePreviewSessionConfirm.monthIndex, deletePreviewSessionConfirm.sessionId);
                setDeletePreviewSessionConfirm(null);
              }
            }}
            title="確認刪除此筆上課紀錄"
            message="確定要從預覽中移除此筆上課紀錄嗎？"
            type="warning"
            mode="confirm"
            confirmText="刪除"
            cancelText="取消"
          />

          {/* Preview Modal */}
          {isPreviewOpen && previewData && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                      <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                          <div>
                              <h2 className="text-xl font-bold text-slate-800">預覽與編輯領據資料</h2>
                              <p className="text-sm text-slate-500">教師：{previewData.teacherName}</p>
                          </div>
                          <button onClick={() => setIsPreviewOpen(false)} className="text-slate-400 hover:text-slate-600">
                              <Trash2 size={24} className="rotate-45" /> {/* Using Trash2 as Close icon substitute if X not available, or just X */}
                          </button>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto p-6 space-y-8">
                          <div className="flex items-center space-x-4 bg-slate-50 p-4 rounded-lg">
                              <label className="font-bold text-slate-700">鐘點單價：</label>
                              <input 
                                  type="number" 
                                  value={previewData.hourlyRate}
                                  onChange={(e) => setPreviewData({...previewData, hourlyRate: Number(e.target.value)})}
                                  className="px-3 py-1 border border-slate-300 rounded w-32"
                              />
                          </div>

                          {previewData.months.map((m, mIdx) => (
                              <div key={m.month} className="border border-slate-200 rounded-lg overflow-hidden">
                                  <div className="bg-slate-100 px-4 py-2 font-bold text-slate-700 flex justify-between items-center">
                                      <span>{m.month} 月份</span>
                                      <button 
                                          onClick={() => addPreviewSession(mIdx)}
                                          className="text-xs bg-white border border-slate-300 px-2 py-1 rounded hover:bg-slate-50 flex items-center"
                                      >
                                          <UserPlus size={14} className="mr-1" /> 新增授課日
                                      </button>
                                  </div>
                                  <table className="w-full text-sm text-left">
                                      <thead className="bg-slate-50 text-slate-500">
                                          <tr>
                                              <th className="px-4 py-2 w-40">日期</th>
                                              <th className="px-4 py-2">節次 (以逗號分隔)</th>
                                              <th className="px-4 py-2 w-20">節數</th>
                                              <th className="px-4 py-2 w-16">操作</th>
                                          </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-200">
                                          {m.sessions.map((s) => (
                                              <tr key={s.id} className="hover:bg-slate-50">
                                                  <td className="px-4 py-2">
                                                      <input 
                                                          type="date" 
                                                          value={s.date}
                                                          onChange={(e) => updatePreviewSession(mIdx, s.id, 'date', e.target.value)}
                                                          className="w-full border-none bg-transparent focus:ring-0"
                                                      />
                                                  </td>
                                                  <td className="px-4 py-2">
                                                      <input 
                                                          type="text" 
                                                          value={s.periods.join(',')}
                                                          onChange={(e) => updatePreviewSession(mIdx, s.id, 'periods', e.target.value)}
                                                          className="w-full border border-slate-200 rounded px-2 py-1"
                                                      />
                                                  </td>
                                                  <td className="px-4 py-2 text-center">
                                                      {s.count}
                                                  </td>
                                                  <td className="px-4 py-2 text-center">
                                                      <button 
                                                          type="button"
                                                          onClick={() => setDeletePreviewSessionConfirm({ monthIndex: mIdx, sessionId: s.id })}
                                                          className="text-red-400 hover:text-red-600"
                                                          title="刪除此筆"
                                                      >
                                                          <Trash2 size={16} />
                                                      </button>
                                                  </td>
                                              </tr>
                                          ))}
                                          {m.sessions.length === 0 && (
                                              <tr><td colSpan={4} className="text-center py-4 text-slate-400">無資料</td></tr>
                                          )}
                                      </tbody>
                                      <tfoot className="bg-slate-50 font-bold text-slate-700">
                                          <tr>
                                              <td colSpan={2} className="px-4 py-2 text-right">小計：</td>
                                              <td className="px-4 py-2 text-center">{m.sessions.reduce((acc, s) => acc + s.count, 0)} 節</td>
                                              <td></td>
                                          </tr>
                                          <tr>
                                              <td colSpan={2} className="px-4 py-2 text-right">金額：</td>
                                              <td className="px-4 py-2 text-center text-indigo-600">
                                                  ${(m.sessions.reduce((acc, s) => acc + s.count, 0) * previewData.hourlyRate).toLocaleString()}
                                              </td>
                                              <td></td>
                                          </tr>
                                      </tfoot>
                                  </table>
                              </div>
                          ))}
                      </div>

                      <div className="p-6 border-t border-slate-200 flex justify-end space-x-3 bg-slate-50 rounded-b-xl">
                          <button 
                              onClick={() => setIsPreviewOpen(false)}
                              className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg"
                          >
                              取消
                          </button>
                          <button 
                              onClick={handleConfirmGenerate}
                              disabled={isGenerating}
                              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md flex items-center"
                          >
                              {isGenerating ? <Loader2 size={18} className="animate-spin mr-2" /> : <FileSpreadsheet size={18} className="mr-2" />}
                              {isGenerating ? '產生中...' : '確認並產生領據'}
                          </button>
                      </div>
                  </div>
              </div>
          )}
          
          <header className="mb-6 flex justify-between items-center">

              <div>
                <h1 className="text-3xl font-bold text-slate-800">語言教師薪資結算</h1>
                <p className="text-slate-500 mt-2">管理客語與族語專職教師資料與產生薪資領據</p>
              </div>
              <div className="flex items-center space-x-4">
                <button 
                  onClick={handleReloadData}
                  disabled={isLoading || isSyncing}
                  className={`flex items-center px-4 py-2 rounded-lg font-medium transition-all border ${
                    isLoading 
                    ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed' 
                    : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300 shadow-sm'
                  }`}
                >
                  {isLoading ? <Loader2 size={18} className="mr-2 animate-spin" /> : <CloudUpload size={18} className="mr-2 rotate-180" />}
                  {isLoading ? '載入中...' : '重新載入'}
                </button>

                <div className="flex space-x-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                  <button 
                    onClick={() => setActiveTab('salary')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'salary' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    客語薪資
                  </button>
                  <button 
                    onClick={() => setActiveTab('indigenous')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'indigenous' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    族語專職
                  </button>
                  <button 
                    onClick={() => setActiveTab('settings')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    教師設定
                  </button>
                </div>
              </div>
          </header>

          {activeTab === 'salary' && (
            <>
              <InstructionPanel title="使用說明">
                  <ul className="list-disc pl-5 space-y-1">
                      <li>系統將依據「教師設定」中的週課表自動計算授課日期。</li>
                      <li>計算時會自動排除「設定」頁面中的國定假日與學期起訖日以外的日期。</li>
                      <li>選擇教師與要結算的月份（可一次選擇兩個月）。</li>
                      <li>系統將依據「客語領據範本」產生新的 Google Sheet。</li>
                  </ul>
              </InstructionPanel>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 mt-6 flex flex-col items-center justify-center space-y-6 max-w-2xl mx-auto w-full">
                  
                  <div className="w-full max-w-md space-y-4">
                      <div>
                          <div className="flex justify-between items-center mb-2">
                              <label className="block text-sm font-bold text-slate-700">選擇教師</label>
                              <div className="flex items-center">
                                  <input 
                                      type="checkbox" 
                                      id="showAllInSelect"
                                      checked={showAllTeachersInSelect}
                                      onChange={(e) => setShowAllTeachersInSelect(e.target.checked)}
                                      className="mr-2 rounded text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <label htmlFor="showAllInSelect" className="text-xs text-slate-500 cursor-pointer select-none">
                                      顯示所有教師 (若找不到請勾選)
                                  </label>
                              </div>
                          </div>
                          <select 
                              value={selectedTeacherId}
                              onChange={(e) => setSelectedTeacherId(e.target.value)}
                              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg"
                          >
                              <option value="">請選擇教師...</option>
                              {availableTeachersForSelect.map(t => (
                                  <option key={t.id} value={t.id}>
                                      {t.name} {t.languageSpecialty ? `(${t.languageSpecialty})` : ''} {!t.languageSpecialty?.includes('客') && t.languageSpecialty ? '[非客語]' : ''}
                                  </option>
                              ))}
                          </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-bold text-slate-700 mb-2">第一個月</label>
                              <div className="relative">
                                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                  <input 
                                      type="month" 
                                      value={startMonth}
                                      onChange={(e) => setStartMonth(e.target.value)}
                                      className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg"
                                  />
                              </div>
                          </div>
                          <div>
                              <label className="block text-sm font-bold text-slate-700 mb-2">第二個月 (選填)</label>
                              <div className="relative">
                                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                  <input 
                                      type="month" 
                                      value={endMonth}
                                      onChange={(e) => setEndMonth(e.target.value)}
                                      className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg"
                                  />
                              </div>
                          </div>
                      </div>

                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-2">鐘點單價</label>
                          <input 
                              type="number" 
                              value={hourlyRate}
                              onChange={(e) => setHourlyRate(Number(e.target.value))}
                              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg"
                          />
                      </div>
                  </div>

                  <div className="w-full max-w-md pt-4">
                      <button
                          onClick={handlePreview}
                          disabled={isGenerating}
                          className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center space-x-2 transition-all ${
                              isGenerating 
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                              : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-200 hover:-translate-y-1'
                          }`}
                      >
                          {isGenerating ? (
                              <>
                                  <Loader2 size={24} className="animate-spin" />
                                  <span>處理中...</span>
                              </>
                          ) : (
                              <>
                                  <FileSpreadsheet size={24} />
                                  <span>預覽並產生客語薪資領據</span>
                              </>
                          )}
                      </button>
                      <p className="text-center text-slate-400 text-sm mt-4">
                          * 將使用後端範本「客語領據範本」進行產生
                      </p>
                  </div>

              </div>
            </>
          )}

          {activeTab === 'indigenous' && (
            <>
              <InstructionPanel title="使用說明：族語專職教師">
                  <ul className="list-disc pl-5 space-y-1">
                      <li>此功能專為「族語專職教師」設計，用於計算超鐘點費。</li>
                      <li>請先至「教師設定」建立教師資料，並設定其每週授課節數。</li>
                      <li>選擇月份後，系統會自動計算該月應上節數 (排除假日與學期外日期)。</li>
                      <li>您可以手動輸入「增減時數」來調整實際授課時數。</li>
                  </ul>
              </InstructionPanel>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 mt-6 flex flex-col space-y-6 max-w-4xl mx-auto w-full">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-2">選擇教師</label>
                          <select 
                              value={selectedTeacherId}
                              onChange={(e) => setSelectedTeacherId(e.target.value)}
                              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg"
                          >
                              <option value="">請選擇教師...</option>
                              {indigenousFullTimeTeachers.map(t => (
                                  <option key={t.id} value={t.id}>
                                      {t.name} ({t.languageSpecialty || '族語'})
                                  </option>
                              ))}
                          </select>
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-2">結算月份</label>
                          <div className="relative">
                              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                              <input 
                                  type="month" 
                                  value={indigenousMonth}
                                  onChange={(e) => setIndigenousMonth(e.target.value)}
                                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg"
                              />
                          </div>
                      </div>
                  </div>

                  {indigenousPreviewData ? (
                      <div className="border rounded-xl overflow-hidden">
                          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                              <h3 className="font-bold text-slate-800 text-lg">
                                  {indigenousPreviewData.teacherName} - {indigenousMonth} 薪資試算
                              </h3>
                          </div>
                          <div className="p-6 space-y-6">
                              {/* Weekly Schedule Display */}
                              <div>
                                  <h4 className="text-sm font-bold text-slate-500 mb-2 uppercase tracking-wider">每週授課時數</h4>
                                  <div className="grid grid-cols-6 gap-2 text-center bg-slate-50 p-4 rounded-lg">
                                      {['一', '二', '三', '四', '五', '小計'].map((day, idx) => (
                                          <div key={day} className="flex flex-col">
                                              <span className="text-xs text-slate-400 mb-1">{day}</span>
                                              <span className="font-bold text-slate-700 text-lg">
                                                  {idx === 5 ? indigenousPreviewData.weeklySubtotal : indigenousPreviewData.weeklySchedule[idx]}
                                              </span>
                                          </div>
                                      ))}
                                  </div>
                              </div>

                              {/* Calculation Fields */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                      <label className="block text-xs font-bold text-blue-600 mb-1">本次應上節數 (自動計算)</label>
                                      <div className="text-2xl font-bold text-blue-800">{indigenousPreviewData.monthlyRequired} 節</div>
                                      <p className="text-xs text-blue-400 mt-1">已排除假日與學期外日期</p>
                                  </div>
                                  <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
                                      <label className="block text-xs font-bold text-amber-600 mb-1">本次增減時數 (手動輸入)</label>
                                      <input 
                                          type="number" 
                                          value={indigenousPreviewData.adjustment}
                                          onChange={(e) => handleIndigenousAdjustmentChange(Number(e.target.value))}
                                          className="w-full bg-white border border-amber-200 rounded px-2 py-1 text-xl font-bold text-amber-800 focus:ring-2 focus:ring-amber-500 outline-none"
                                      />
                                  </div>
                                  <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100">
                                      <label className="block text-xs font-bold text-emerald-600 mb-1">本次實際授課時數</label>
                                      <div className="text-2xl font-bold text-emerald-800">{indigenousPreviewData.actual} 節</div>
                                  </div>
                              </div>

                              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                                  <div className="flex items-center space-x-4">
                                      <label className="font-bold text-slate-700">每小時鐘點費：</label>
                                      <input 
                                          type="number" 
                                          value={indigenousPreviewData.hourlyRate}
                                          onChange={(e) => handleIndigenousRateChange(Number(e.target.value))}
                                          className="w-32 px-3 py-2 border border-slate-300 rounded-lg font-bold text-lg"
                                      />
                                  </div>
                                  <div className="text-right">
                                      <span className="block text-sm text-slate-500">本次請領超鐘點費</span>
                                      <span className="text-3xl font-bold text-indigo-600">
                                          ${indigenousPreviewData.totalAmount.toLocaleString()}
                                      </span>
                                  </div>
                              </div>

                              <button
                                  onClick={handleGenerateIndigenous}
                                  disabled={isGenerating}
                                  className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center space-x-2 transition-all ${
                                      isGenerating 
                                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                      : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-200 hover:-translate-y-1'
                                  }`}
                              >
                                  {isGenerating ? (
                                      <>
                                          <Loader2 size={24} className="animate-spin" />
                                          <span>處理中...</span>
                                      </>
                                  ) : (
                                      <>
                                          <FileSpreadsheet size={24} />
                                          <span>產生印領清冊</span>
                                      </>
                                  )}
                              </button>
                          </div>
                      </div>
                  ) : (
                      <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-slate-400">
                          {selectedTeacherId ? '該教師尚無排課資料，請至「教師設定」設定週課表。' : '請先選擇教師以進行試算'}
                      </div>
                  )}
              </div>
            </>
          )}

          {activeTab === 'settings' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex justify-between mb-6">
                 <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="搜尋教師..." 
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                 </div>
                 <div className="flex items-center space-x-4">
                    <div className="flex items-center">
                        <input 
                            type="checkbox" 
                            id="showAllInList"
                            checked={showAllTeachersInList}
                            onChange={(e) => setShowAllTeachersInList(e.target.checked)}
                            className="mr-2 rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor="showAllInList" className="text-sm text-slate-600 cursor-pointer select-none">
                            顯示所有語言教師
                        </label>
                    </div>
                    <button 
                      onClick={() => { setEditingTeacher(null); setIsTeacherModalOpen(true); }}
                      className="flex items-center bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      <UserPlus size={18} className="mr-2" /> 新增教師
                    </button>
                 </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-sm">
                      <th className="py-3 px-4">姓名</th>
                      <th className="py-3 px-4">類別</th>
                      <th className="py-3 px-4">語種</th>
                      <th className="py-3 px-4">預設鐘點費</th>
                      <th className="py-3 px-4">每週節數</th>
                      <th className="py-3 px-4 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedTeachersInList.filter(t => t.name.includes(searchTerm)).map(teacher => (
                      <tr key={teacher.id} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium text-slate-800">{teacher.name}</td>
                        <td className="py-3 px-4 text-slate-600">
                            {teacher.teacherCategory === 'IndigenousFullTime' ? (
                                <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs">族語專職</span>
                            ) : teacher.teacherCategory === 'Indigenous' ? (
                                <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">原住民族語</span>
                            ) : (
                                <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs">一般/客語</span>
                            )}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                            {teacher.languageSpecialty || '-'}
                        </td>
                        <td className="py-3 px-4 text-slate-600">${teacher.defaultHourlyRate}</td>
                        <td className="py-3 px-4 text-slate-600">
                            {teacher.languageSchedule ? teacher.languageSchedule.reduce((acc, s) => acc + s.periods.length, 0) : 0} 節
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button 
                            onClick={() => { setEditingTeacher(teacher); setIsTeacherModalOpen(true); }}
                            className="text-indigo-600 hover:text-indigo-800 mr-3"
                          >
                            <Edit size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {displayedTeachersInList.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">尚無教師資料</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Teacher Modal */}
          <Modal 
            isOpen={isTeacherModalOpen} 
            onClose={() => setIsTeacherModalOpen(false)}
            title={editingTeacher ? "編輯教師資料" : "新增教師資料"}
            maxWidth="max-w-2xl"
          >
            <form onSubmit={handleSaveTeacher} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">姓名</label>
                    <input 
                      name="name" 
                      defaultValue={editingTeacher?.name} 
                      required 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">教師類別</label>
                    <select 
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value as any)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                        <option value="Indigenous">一般/客語/原住民族語</option>
                        <option value="IndigenousFullTime">族語專職教師</option>
                    </select>
                  </div>
              </div>

              {formCategory === 'IndigenousFullTime' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">職別 (例如：民族語專職老師)</label>
                    <input 
                      value={formJobTitle}
                      onChange={(e) => setFormJobTitle(e.target.value)}
                      placeholder="民族語專職老師"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">授課語種</label>
                  <SearchableSelect
                    options={uniqueLanguages.map(l => ({ value: l, label: l }))}
                    value={formLanguage}
                    onChange={setFormLanguage}
                    allowCreate={true}
                    placeholder="選擇或輸入語種..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">預設鐘點費</label>
                  <input 
                    name="defaultHourlyRate" 
                    type="number"
                    value={formHourlyRate}
                    onChange={e => setFormHourlyRate(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                {/* Checkbox removed as per request - moved to schedule grid */}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">主聘學校</label>
                  <SearchableSelect
                    options={uniqueHostSchools.map(s => ({ value: s, label: s }))}
                    value={formHostSchool}
                    onChange={setFormHostSchool}
                    allowCreate={true}
                    placeholder="選擇或輸入學校..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">電話</label>
                  <input 
                    name="phone" 
                    defaultValue={editingTeacher?.phone} 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
              
              {/* Schedule Editor */}
              <div className="border-t border-slate-200 pt-4 mt-2">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold text-slate-600 flex items-center">
                        <Calendar size={16} className="mr-1"/> 每週上課時間設定
                    </h3>
                </div>
                
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="grid grid-cols-6 gap-2 text-xs text-center font-bold text-slate-500 mb-2">
                        <div></div>
                        <div>週一</div>
                        <div>週二</div>
                        <div>週三</div>
                        <div>週四</div>
                        <div>週五</div>
                    </div>
                    {['早', '1', '2', '3', '4', '午', '5', '6', '7'].map(period => (
                        <div key={period} className="grid grid-cols-6 gap-2 items-center mb-1">
                            <div className="text-xs font-bold text-slate-400 text-center">{period}</div>
                            {[1, 2, 3, 4, 5].map(day => {
                                const slot = schedule.find(s => s.dayOfWeek === day && s.periods.includes(period));
                                const isSelected = !!slot;
                                const isSixthGrade = slot?.isSixthGrade;
                                
                                return (
                                    <div 
                                        key={`${day}-${period}`}
                                        onClick={() => toggleScheduleSlot(day, period)}
                                        className={`
                                            h-6 rounded cursor-pointer border transition-all flex items-center justify-center text-[10px] font-bold
                                            ${isSelected 
                                                ? (isSixthGrade 
                                                    ? 'bg-orange-500 border-orange-600 text-white' 
                                                    : 'bg-indigo-500 border-indigo-600 text-white') 
                                                : 'bg-white border-slate-200 hover:border-indigo-300'}
                                        `}
                                    >
                                        {isSelected && (isSixthGrade ? '六' : '')}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
                <div className="flex items-center space-x-4 mt-2 text-xs text-slate-500">
                    <div className="flex items-center">
                        <div className="w-3 h-3 bg-indigo-500 rounded mr-1"></div>
                        <span>一般課程</span>
                    </div>
                    <div className="flex items-center">
                        <div className="w-3 h-3 bg-orange-500 rounded mr-1"></div>
                        <span>六年級課程 (畢業後中斷)</span>
                    </div>
                    <div className="flex-1 text-right text-slate-400">
                        點擊格子以選取/取消課程
                    </div>
                </div>

                {/* Sixth Grade Settings List */}
                {allSelectedPeriods.length > 0 && (
                    <div className="mt-4 border-t border-slate-200 pt-3">
                        <h4 className="text-xs font-bold text-slate-600 mb-2">設定六年級課程 (畢業後中斷)</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {allSelectedPeriods.map(p => (
                                <label key={`${p.day}-${p.period}`} className="flex items-center space-x-2 bg-white border border-slate-200 p-2 rounded cursor-pointer hover:bg-slate-50">
                                    <input 
                                        type="checkbox" 
                                        checked={p.isSixthGrade}
                                        onChange={(e) => toggleSixthGrade(p.day, p.period, e.target.checked)}
                                        className="rounded text-orange-500 focus:ring-orange-500"
                                    />
                                    <span className="text-xs text-slate-700">{p.dayName} 第 {p.period} 節</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">備註</label>
                <textarea 
                  name="note" 
                  defaultValue={editingTeacher?.note} 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  rows={2}
                />
              </div>
              <div className="flex justify-end pt-4">
                <button 
                  type="button"
                  onClick={() => setIsTeacherModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg mr-2"
                >
                  取消
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  儲存
                </button>
              </div>
            </form>
          </Modal>
      </div>
  );
};

export default LanguageSalary;
