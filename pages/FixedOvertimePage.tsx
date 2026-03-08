
// pages/FixedOvertimePage.tsx

import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { FixedOvertimeConfig, Teacher, HOURLY_RATE, GradeEvent, PayType } from '../types';
import { callGasApi } from '../utils/api';
import SearchableSelect from '../components/SearchableSelect';
import { Plus, Trash2, Calendar, FileText, Loader2, Calculator, AlertCircle, X, CloudUpload, Flag, Clock, FileOutput, Settings, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import Modal, { ModalType } from '../components/Modal';
import { Link } from 'react-router-dom';
import { getStandardBase, parseLocalDate, getEffectiveFixedOvertimeSlots, getEffectiveFixedOvertimePeriods } from '../utils/calculations';
import InstructionPanel from '../components/InstructionPanel';

const ScheduleSlot: React.FC<{ 
    label: string; 
    isSelected: boolean; 
    onClick: () => void;
}> = ({ label, isSelected, onClick }) => (
    <div 
        onClick={onClick}
        className={`
            border rounded p-2 text-center cursor-pointer transition-all text-xs h-12 flex items-center justify-center
            ${isSelected
                ? 'bg-blue-100 border-blue-300 text-blue-700 font-bold shadow-sm ring-1 ring-blue-200' 
                : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
            }
        `}
    >
        {isSelected ? '固定課' : label}
    </div>
);

const FixedScheduleModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    teacher: Teacher;
    config: FixedOvertimeConfig;
    onSave: (slots: { day: number; period: string }[]) => void;
    effectiveSlots: { day: number; period: string }[];
    usesTeacherSchedule: boolean;
}> = ({ isOpen, onClose, teacher, config, onSave, effectiveSlots, usesTeacherSchedule }) => {
    const [slots, setSlots] = useState<{ day: number; period: string }[]>(config.scheduleSlots || []);
    
    useEffect(() => {
        setSlots(config.scheduleSlots || []);
    }, [config]);

    if (!isOpen) return null;

    const periods = ['早', '1', '2', '3', '4', '午', '5', '6', '7'];
    const days = ['一', '二', '三', '四', '五'];
    const displaySlots = usesTeacherSchedule ? effectiveSlots : slots;
    const totalCount = displaySlots.length;

    const toggleSlot = (dayIdx: number, period: string) => {
        if (usesTeacherSchedule) return;
        const day = dayIdx + 1;
        const exists = slots.some(s => s.day === day && s.period === period);
        if (exists) {
            setSlots(slots.filter(s => !(s.day === day && s.period === period)));
        } else {
            setSlots([...slots, { day, period }]);
        }
    };

    const handleSave = () => {
        if (!usesTeacherSchedule) onSave(slots);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-indigo-600 p-4 flex justify-between items-center text-white">
                    <div>
                        <h3 className="font-bold text-lg flex items-center">
                            <Clock className="mr-2" size={20}/>
                            {teacher.name} - 固定兼課時段
                        </h3>
                        <p className="text-indigo-200 text-xs mt-1">
                            {usesTeacherSchedule ? '已套用教師管理之預設課表，請至「教師管理」編輯。' : '點擊格子設定該師每週固定的兼課時段。'}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-indigo-200 hover:text-white"><X size={24}/></button>
                </div>
                
                <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
                    {usesTeacherSchedule && (
                        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-center justify-between">
                            <span>固定兼課時段已套用教師課表，修改請至教師管理。</span>
                            <Link to="/teachers" className="text-amber-700 font-bold underline hover:no-underline" onClick={onClose}>前往教師管理</Link>
                        </div>
                    )}
                    <div className="grid grid-cols-6 gap-2">
                        <div className="col-span-1"></div>
                        {days.map(d => (
                            <div key={d} className="text-center font-bold text-slate-600 pb-2">週{d}</div>
                        ))}

                        {periods.map(p => (
                            <React.Fragment key={p}>
                                <div className="flex items-center justify-center font-bold text-slate-500 text-sm">
                                    {p === '早' ? '早自習' : p === '午' ? '午休' : `第 ${p} 節`}
                                </div>
                                {days.map((_, idx) => {
                                    const dayNum = idx + 1;
                                    const isSelected = displaySlots.some(s => s.day === dayNum && String(s.period) === String(p));
                                    return (
                                        <ScheduleSlot 
                                            key={`${dayNum}-${p}`}
                                            label="-"
                                            isSelected={isSelected}
                                            onClick={() => toggleSlot(idx, p)}
                                        />
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t border-slate-200 bg-white flex justify-between items-center">
                    <div className="text-xs text-slate-500">
                        每週合計：<span className="font-bold text-indigo-600 text-lg mx-1">{totalCount}</span> 節
                    </div>
                    <div className="flex space-x-2">
                        <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">關閉</button>
                        {!usesTeacherSchedule && (
                            <button onClick={handleSave} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md">儲存設定</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const FixedOvertimePage: React.FC = () => {
  const { teachers, records, fixedOvertimeConfig, updateFixedOvertimeConfig, removeFixedOvertimeConfig, holidays, settings, gradeEvents, addGradeEvent, removeGradeEvent } = useAppStore();
  
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [addTeacherId, setAddTeacherId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [docNumber, setDocNumber] = useState('');

  const [showEventModal, setShowEventModal] = useState(false);
  const [newEvent, setNewEvent] = useState<Omit<GradeEvent, 'id'>>({
      title: '',
      date: '',
      targetGrades: []
  });

  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: React.ReactNode; type: ModalType }>({
      isOpen: false, title: '', message: '', type: 'info'
  });

  const [scheduleModal, setScheduleModal] = useState<{
      isOpen: boolean;
      teacherId: string | null;
  }>({ isOpen: false, teacherId: null });

  // Use global settings for semester dates
  const semesterStart = settings.semesterStart;
  const semesterEnd = settings.semesterEnd;

  const eventDateStr = (e: { date?: string | object }): string => {
      const d = e.date;
      if (!d) return '';
      if (typeof d === 'string') return d;
      const anyD = d as { toDate?: () => Date; toISOString?: () => string; seconds?: number };
      const dateObj = typeof anyD.toDate === 'function' ? anyD.toDate() : (d as Date);
      const iso = dateObj?.toISOString?.();
      if (iso) return iso.slice(0, 10);
      if (typeof anyD.seconds === 'number') return new Date(anyD.seconds * 1000).toISOString().slice(0, 10);
      return '';
  };

  const getTeacherGrades = (teacher: Teacher): number[] => {
      const grades: Set<number> = new Set();
      const addFromStr = (str: string) => {
          if (!str || !str.trim()) return;
          let s = str.trim().replace(/[０-９]/g, (c: string) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
          s = s.replace(/[，、;；\s]+/g, ' ');
          const threeDigit = s.match(/([1-6])\d{2}/g);
          if (threeDigit) threeDigit.forEach((m: string) => grades.add(parseInt(m.charAt(0))));
          const yearLevel = s.match(/([1-6])年級/g);
          if (yearLevel) yearLevel.forEach((m: string) => grades.add(parseInt(m.charAt(0))));
          const yearOnly = s.match(/([1-6])年/g);
          if (yearOnly) yearOnly.forEach((m: string) => grades.add(parseInt(m.charAt(0))));
      };
      addFromStr(teacher.teachingClasses || '');
      // 若任課班級未填，改從預設課表之班級名稱解析（如 203、201 → 2年級）
      if (grades.size === 0 && teacher.defaultSchedule && teacher.defaultSchedule.length > 0) {
          teacher.defaultSchedule.forEach(slot => addFromStr(slot.className || ''));
      }
      return Array.from(grades).sort((a, b) => a - b);
  };

  const weekdayDates = useMemo(() => {
      const [year, month] = selectedMonth.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const datesByDay: Record<number, string[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] }; 

      const semStart = semesterStart ? new Date(semesterStart) : null;
      const semEnd = semesterEnd ? new Date(semesterEnd) : null;

      for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const currentDate = parseLocalDate(dateStr);

          if (semStart && currentDate < semStart) continue;
          if (semEnd && currentDate > semEnd) continue;
          if (holidays.includes(dateStr)) continue;

          const dayOfWeek = currentDate.getDay(); 
          if (dayOfWeek >= 1 && dayOfWeek <= 5) {
              datesByDay[dayOfWeek - 1].push(dateStr);
          }
      }
      return datesByDay;
  }, [selectedMonth, holidays, semesterStart, semesterEnd]);

  const weekdayCounts = useMemo(() => {
      return [
          weekdayDates[0].length,
          weekdayDates[1].length,
          weekdayDates[2].length,
          weekdayDates[3].length,
          weekdayDates[4].length
      ];
  }, [weekdayDates]);

  const getEventDeductionDetails = (teacher: Teacher, periodsOverride: number[]) => {
      const teacherGrades = getTeacherGrades(teacher);
      if (teacherGrades.length === 0) return [];

      const affectedEvents: { id: string, title: string, date: string, deduction: number }[] = [];
      const monthPrefix = selectedMonth;
      const activeEvents = gradeEvents.filter(e => eventDateStr(e).startsWith(monthPrefix));

      activeEvents.forEach(event => {
          const dateStr = eventDateStr(event);
          if (!dateStr) return;
          const eventDate = parseLocalDate(dateStr);
          const isRelevant = (event.targetGrades || []).some((g: number | string) => teacherGrades.includes(Number(g)));
          if (!isRelevant) return;

          const dayOfWeek = eventDate.getDay();
          if (dayOfWeek >= 1 && dayOfWeek <= 5) {
              if (holidays.includes(dateStr)) return;
              const dailyPeriods = periodsOverride[dayOfWeek - 1] || 0;
              if (dailyPeriods > 0) {
                  affectedEvents.push({
                      id: event.id,
                      title: event.title,
                      date: dateStr,
                      deduction: dailyPeriods
                  });
              }
          }
      });
      return affectedEvents;
  };

  const reportData = useMemo(() => {
      return fixedOvertimeConfig.map(config => {
          const teacher = teachers.find(t => t.id === config.teacherId);
          if (!teacher) return null;

          const effectiveSlots = getEffectiveFixedOvertimeSlots(teacher, config);
          const effectivePeriods = getEffectiveFixedOvertimePeriods(teacher, config);
          const usesTeacherSchedule = !!(teacher.defaultSchedule && teacher.defaultSchedule.length > 0);

          let expected = 0;
          effectivePeriods.forEach((p, idx) => {
              expected += p * weekdayCounts[idx];
          });

          // 1. Grade Event Deductions
          const affectedEvents = getEventDeductionDetails(teacher, effectivePeriods);
          const ignoredEventIds = config.ignoredEventIds || [];
          
          let eventDeductionTotal = 0;
          const activeEventReasons: string[] = [];

          affectedEvents.forEach(evt => {
              if (!ignoredEventIds.includes(evt.id)) {
                  eventDeductionTotal += evt.deduction;
                  activeEventReasons.push(`${evt.date.slice(5)} ${evt.title}`);
              }
          });

          // 2. Leave Deductions (請假扣除)：同日、同代課教師合併為一行顯示
          let leaveDeductionTotal = 0;
          const leaveReasons: string[] = [];
          const periodOrder = ['早', '1', '2', '3', '4', '午', '5', '6', '7'];
          const groupByDateSub = new Map<string, { date: string; substituteName: string | null; periods: Set<string> }>();

          if (effectiveSlots.length > 0) {
              const teacherLeaves = records.filter(r => 
                  r.originalTeacherId === teacher.id &&
                  r.startDate <= `${selectedMonth}-31` && 
                  r.endDate >= `${selectedMonth}-01`
              );
              
              teacherLeaves.forEach(record => {
                  if (!record.slots) return;
                  record.slots.forEach(slot => {
                      if (!slot.date.startsWith(selectedMonth)) return;
                      const slotDate = parseLocalDate(slot.date);
                      const dayOfWeek = slotDate.getDay();
                      const isOvertimeSlot = effectiveSlots.some(
                          s => s.day === dayOfWeek && String(s.period) === String(slot.period)
                      );
                      if (isOvertimeSlot) {
                          leaveDeductionTotal += 1;
                          const dateKey = slot.date.slice(5);
                          const substituteName = slot.substituteTeacherId ? teachers.find(t => t.id === slot.substituteTeacherId)?.name : null;
                          const groupKey = `${dateKey}|${substituteName ?? ''}`;
                          if (!groupByDateSub.has(groupKey)) {
                              groupByDateSub.set(groupKey, { date: dateKey, substituteName, periods: new Set() });
                          }
                          groupByDateSub.get(groupKey)!.periods.add(String(slot.period));
                      }
                  });
              });
              groupByDateSub.forEach(({ date, substituteName, periods }) => {
                  const sorted = Array.from(periods).sort((a, b) => periodOrder.indexOf(a) - periodOrder.indexOf(b));
                  const periodStr = sorted.join('、');
                  leaveReasons.push(
                      substituteName
                          ? `${date} 第${periodStr}節請假 (代課: ${substituteName})`
                          : `${date} 第${periodStr}節請假`
                  );
              });
          }

          const manualAdj = config.adjustment || 0;
          const manualReason = config.adjustmentReason || '';

          const totalAdjustment = manualAdj - eventDeductionTotal - leaveDeductionTotal;
          const actual = Math.max(0, expected + totalAdjustment);
          const pay = Math.round(actual * HOURLY_RATE);
          
          const combinedReasons = [
              manualReason, 
              activeEventReasons.length > 0 ? `活動扣除: ${activeEventReasons.join(', ')}` : '',
              leaveReasons.length > 0 ? `請假扣除: ${leaveReasons.join(', ')}` : ''
          ].filter(Boolean).join('; ');

          return {
              teacherId: teacher.id,
              teacherName: teacher.name,
              jobTitle: teacher.jobTitle || teacher.teacherRole || '',
              periods: effectivePeriods,
              expected: expected,
              manualAdjustment: manualAdj,
              eventDeductionTotal: eventDeductionTotal,
              leaveDeductionTotal: leaveDeductionTotal,
              leaveReasons: leaveReasons,
              affectedEvents: affectedEvents, 
              ignoredEventIds: ignoredEventIds,
              adjustment: totalAdjustment, 
              adjustmentReason: combinedReasons, 
              actual: actual,
              pay: pay,
              hasSchedule: effectiveSlots.length > 0,
              scheduleSlots: effectiveSlots,
              usesTeacherSchedule: usesTeacherSchedule
          };
      }).filter(item => item !== null) as any[]; 
  }, [fixedOvertimeConfig, teachers, records, weekdayCounts, gradeEvents, selectedMonth, semesterStart, semesterEnd]);

  // 當月協助代固定兼課教師代課者：加入清冊並顯示應領金額（僅鐘點費代課，日薪不計）；同日、同被代課者合併為一行
  const periodOrderSub = ['早', '1', '2', '3', '4', '午', '5', '6', '7'];
  const substituteTeachersList = useMemo(() => {
    const fixedIds = new Set((fixedOvertimeConfig || []).map(c => c.teacherId));
    const monthPrefix = selectedMonth;
    const list: { teacherId: string; teacherName: string; jobTitle: string; substituteSessions: number; substituteDetails: string[]; pay: number }[] = [];
    (teachers || []).forEach(teacher => {
      if (fixedIds.has(teacher.id)) return;
      const seen = new Set<string>();
      const groupByDateOriginal = new Map<string, { date: string; originalName: string; periods: Set<string> }>();
      (records || []).forEach(record => {
        const config = (fixedOvertimeConfig || []).find(c => c.teacherId === record.originalTeacherId);
        if (!config) return;
        const originalTeacher = (teachers || []).find(t => t.id === record.originalTeacherId);
        const effectiveSlots = getEffectiveFixedOvertimeSlots(originalTeacher, config);
        if (!effectiveSlots.length) return;
        if (!record.slots) return;
        const originalName = originalTeacher?.name || '老師';
        record.slots.forEach(slot => {
          if (slot.substituteTeacherId !== teacher.id || !slot.date.startsWith(monthPrefix)) return;
          const isDailyPay = slot.payType === PayType.DAILY || (slot as any).payType === '日薪';
          if (isDailyPay) return;
          const slotDate = parseLocalDate(slot.date);
          const dayOfWeek = slotDate.getDay();
          const isFixedSlot = effectiveSlots.some(s => s.day === dayOfWeek && String(s.period) === String(slot.period));
          if (!isFixedSlot) return;
          const key = `${slot.date}|${String(slot.period)}`;
          if (seen.has(key)) return;
          seen.add(key);
          const dateKey = slot.date.slice(5);
          const groupKey = `${dateKey}|${originalName}`;
          if (!groupByDateOriginal.has(groupKey)) {
            groupByDateOriginal.set(groupKey, { date: dateKey, originalName, periods: new Set() });
          }
          groupByDateOriginal.get(groupKey)!.periods.add(String(slot.period));
        });
      });
      const substituteSessions = seen.size;
      if (substituteSessions > 0) {
        const details: string[] = [];
        groupByDateOriginal.forEach(({ date, originalName, periods }) => {
          const sorted = Array.from(periods).sort((a, b) => periodOrderSub.indexOf(a) - periodOrderSub.indexOf(b));
          details.push(`${date} 第${sorted.join('、')}節 代${originalName}`);
        });
        list.push({
          teacherId: teacher.id,
          teacherName: teacher.name,
          jobTitle: teacher.jobTitle || teacher.teacherRole || '',
          substituteSessions,
          substituteDetails: details,
          pay: Math.round(substituteSessions * HOURLY_RATE),
        });
      }
    });
    return list;
  }, [fixedOvertimeConfig, teachers, records, selectedMonth]);

  const totalPay = reportData.reduce((sum, item) => sum + item.pay, 0) + substituteTeachersList.reduce((sum, item) => sum + item.pay, 0);

  const handleMonthChange = (direction: 'prev' | 'next') => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() + (direction === 'next' ? 1 : -1));
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const handlePeriodChange = (teacherId: string, dayIndex: number, val: string) => {
      const config = fixedOvertimeConfig.find(c => c.teacherId === teacherId);
      if (!config) return;
      const newPeriods = [...config.periods];
      newPeriods[dayIndex] = Number(val);
      updateFixedOvertimeConfig({ ...config, periods: newPeriods });
  };

  const handleManualAdjustmentChange = (teacherId: string, val: string) => {
      const config = fixedOvertimeConfig.find(c => c.teacherId === teacherId); if (!config) return;
      updateFixedOvertimeConfig({ ...config, adjustment: Number(val) });
  };

  const handleReasonChange = (teacherId: string, val: string) => {
      const config = fixedOvertimeConfig.find(c => c.teacherId === teacherId); if (!config) return;
      updateFixedOvertimeConfig({ ...config, adjustmentReason: val });
  };

  const toggleIgnoreEvent = (teacherId: string, eventId: string) => {
      const config = fixedOvertimeConfig.find(c => c.teacherId === teacherId); 
      if (!config) return;
      const currentIgnored = config.ignoredEventIds || [];
      let newIgnored;
      if (currentIgnored.includes(eventId)) {
          newIgnored = currentIgnored.filter(id => id !== eventId);
      } else {
          newIgnored = [...currentIgnored, eventId];
      }
      updateFixedOvertimeConfig({ ...config, ignoredEventIds: newIgnored });
  };

  const handleSaveSchedule = (slots: { day: number; period: string }[]) => {
      if (!scheduleModal.teacherId) return;
      const config = fixedOvertimeConfig.find(c => c.teacherId === scheduleModal.teacherId);
      if (!config) return;

      const newPeriods = [0, 0, 0, 0, 0];
      slots.forEach(s => {
          if (s.day >= 1 && s.day <= 5) {
              newPeriods[s.day - 1]++;
          }
      });

      updateFixedOvertimeConfig({ 
          ...config, 
          scheduleSlots: slots,
          periods: newPeriods
      });
  };

  const handleAddTeacher = () => {
      if (!addTeacherId) return;
      if (fixedOvertimeConfig.some(c => c.teacherId === addTeacherId)) {
          setModal({ isOpen: true, title: '重複', message: '該教師已在清單中', type: 'warning' }); return;
      }
      const teacher = teachers.find(t => t.id === addTeacherId);
      const emptyConfig = { teacherId: addTeacherId, periods: [0, 0, 0, 0, 0], adjustment: 0, adjustmentReason: '', ignoredEventIds: [], scheduleSlots: [] };
      const initialPeriods = getEffectiveFixedOvertimePeriods(teacher, emptyConfig);
      updateFixedOvertimeConfig({ ...emptyConfig, periods: initialPeriods });
      setAddTeacherId('');
  };
  const handleAddEvent = () => {
      if (!newEvent.title || !newEvent.date || newEvent.targetGrades.length === 0) { alert('請完整填寫活動資訊'); return; }
      addGradeEvent({ id: crypto.randomUUID(), ...newEvent });
      setNewEvent({ title: '', date: '', targetGrades: [] }); setShowEventModal(false);
  };
  const toggleGrade = (grade: number) => {
      setNewEvent(prev => {
          const grades = new Set(prev.targetGrades);
          if (grades.has(grade)) grades.delete(grade); else grades.add(grade);
          return { ...prev, targetGrades: Array.from(grades).sort() };
      });
  };
  
  const [selectedTeachers, setSelectedTeachers] = useState<Set<string>>(new Set());

  // ... (existing code)

  const handleSelectAll = () => {
      if (selectedTeachers.size === reportData.length) {
          setSelectedTeachers(new Set());
      } else {
          setSelectedTeachers(new Set(reportData.map(r => r.teacherId)));
      }
  };

  const toggleTeacherSelection = (teacherId: string) => {
      const newSet = new Set(selectedTeachers);
      if (newSet.has(teacherId)) {
          newSet.delete(teacherId);
      } else {
          newSet.add(teacherId);
      }
      setSelectedTeachers(newSet);
  };

  const handleGenerate = async () => {
      if (!settings.gasWebAppUrl) { 
          setModal({ isOpen: true, title: '錯誤', message: '請先設定 GAS URL', type: 'error' }); 
          return; 
      }
      
      if (selectedTeachers.size === 0) {
          setModal({ isOpen: true, title: '提示', message: '請至少勾選一位教師進行匯出', type: 'warning' });
          return;
      }
      
      setIsGenerating(true);
      try {
          const [year, month] = selectedMonth.split('-').map(Number);
          
          // Filter reportData based on selection
          const selectedReportData = reportData.filter(item => selectedTeachers.has(item.teacherId));

          // Map local reportData to what GAS expects (Precise Mode Format)
          const payload = selectedReportData.map(item => {
              // ... (existing mapping logic)
              const teacher = teachers.find(t => t.id === item.teacherId);
              const standard = teacher ? getStandardBase(teacher) : 0;
              const adminReduction = (teacher?.reductions || []).reduce((s, r) => s + r.periods, 0) || (teacher?.adminReduction || 0);
              const weeklyTotal = item.periods.reduce((a: number, b: number) => a + b, 0);
              
              const slotDetail = (item.scheduleSlots && item.scheduleSlots.length > 0) ? item.scheduleSlots.map((s: any) => {
                  const dayName = ['一','二','三','四','五'][s.day-1];
                  return `週${dayName}${s.period}`;
              }).join('、') : '';

              const reductionDetail = (teacher?.reductions || []).map(r => `${r.title}(${r.periods})`).join('、');

              return {
                  ...item,
                  isSimpleMode: false, // Always precise for this view
                  overtimePattern: item.periods, // [Mon, Tue, Wed, Thu, Fri]
                  standard: standard,
                  weeklyActual: weeklyTotal,
                  adminReduction: adminReduction,
                  weeklyOvertime: weeklyTotal,
                  slotDetail: slotDetail,
                  reductionDetail: reductionDetail
              };
          });

          const result = await callGasApi(settings.gasWebAppUrl, 'GENERATE_FIXED_OVERTIME_REPORT', { 
              year, 
              month, 
              reportData: payload, // Send compatible payload
              semesterStart: semesterStart,
              semesterEnd: semesterEnd,
              docNumber: docNumber,
              holidays: holidays // New: Pass holidays from store
          });
          
          // ... (existing result handling)
          if (result.status === 'success' && result.data.url) {
              const win = window.open(result.data.url, '_blank');
              if (win) {
                  setModal({ isOpen: true, title: '成功', message: '報表已產生並於新分頁開啟。', type: 'success' });
              } else {
                  setModal({
                      isOpen: true,
                      title: '成功',
                      type: 'success',
                      message: (
                          <div>
                              <p className="mb-2">Excel 清冊已產生，但瀏覽器攔截了自動開啟視窗。</p>
                              <a href={result.data.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-bold bg-indigo-50 px-3 py-2 rounded-lg block text-center">點擊此處下載檔案</a>
                          </div>
                      )
                  });
              }
          } else { 
              throw new Error(result.message || '產生失敗，未回傳網址'); 
          }
      } catch (e: any) { 
          setModal({ isOpen: true, title: '失敗', message: e.message, type: 'error' }); 
      } finally { 
          setIsGenerating(false); 
      }
  };

  const activeTeacher = useMemo(() => teachers.find(t => t.id === scheduleModal.teacherId), [teachers, scheduleModal.teacherId]);
  const activeConfig = useMemo(() => fixedOvertimeConfig.find(c => c.teacherId === scheduleModal.teacherId), [fixedOvertimeConfig, scheduleModal.teacherId]);

  const currentMonthEvents = gradeEvents.filter(e => eventDateStr(e).startsWith(selectedMonth));
  const fmtDate = (dStr: string) => dStr.substring(5);

  return (
    <div className="p-8 pb-32">
        <Modal isOpen={modal.isOpen} onClose={() => setModal({ ...modal, isOpen: false })} title={modal.title} message={modal.message} type={modal.type} />

        {activeTeacher && activeConfig && (
            <FixedScheduleModal
                isOpen={scheduleModal.isOpen}
                onClose={() => setScheduleModal({ ...scheduleModal, isOpen: false })}
                teacher={activeTeacher}
                config={activeConfig}
                onSave={handleSaveSchedule}
                effectiveSlots={getEffectiveFixedOvertimeSlots(activeTeacher, activeConfig)}
                usesTeacherSchedule={!!(activeTeacher.defaultSchedule && activeTeacher.defaultSchedule.length > 0)}
            />
        )}

        {showEventModal && (
            <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                    <h3 className="text-xl font-bold mb-4 flex items-center text-slate-800"><Flag className="mr-2 text-rose-500" /> 新增年級活動</h3>
                    <div className="space-y-4">
                        <div><label className="block text-sm font-bold text-slate-700 mb-1">活動名稱</label><input type="text" className="w-full border rounded-lg px-3 py-2" placeholder="例：六年級畢旅" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})}/></div>
                        <div><label className="block text-sm font-bold text-slate-700 mb-1">日期</label><input type="date" className="w-full border rounded-lg px-3 py-2" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})}/></div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">受影響年級 (任教該年級老師將扣除節數)</label>
                            <div className="flex gap-2">{[1, 2, 3, 4, 5, 6].map(g => (<button key={g} type="button" onClick={() => toggleGrade(g)} className={`w-10 h-10 rounded-full font-bold flex items-center justify-center transition-colors ${newEvent.targetGrades.includes(g) ? 'bg-rose-500 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{g}</button>))}</div>
                        </div>
                        <div className="flex gap-2 pt-4"><button onClick={() => setShowEventModal(false)} className="flex-1 py-2 border rounded-lg hover:bg-slate-50">取消</button><button onClick={handleAddEvent} className="flex-1 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 font-bold">新增</button></div>
                    </div>
                </div>
            </div>
        )}
        
        {/* --- Main Content --- */}
        <header className="mb-6 flex justify-between items-end">
            <div><h1 className="text-3xl font-bold text-slate-800 flex items-center"><FileText className="mr-3 text-cyan-600" /> 固定兼課管理</h1><p className="text-slate-500 mt-2">設定每週固定兼課時數，系統自動依學期設定計算每月應領金額。</p></div>
            <div className="flex items-center gap-4">
                <div className="flex items-center bg-white border border-slate-300 rounded-lg shadow-sm">
                    <button type="button" onClick={() => handleMonthChange('prev')} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 border-r border-slate-200 rounded-l-lg" title="上個月"><ChevronLeft size={20} /></button>
                    <div className="px-4 py-2 flex items-center font-bold text-slate-700 min-w-[140px] justify-center"><Calendar size={18} className="text-slate-400 mr-2" />{selectedMonth}</div>
                    <button type="button" onClick={() => handleMonthChange('next')} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 border-l border-slate-200 rounded-r-lg" title="下個月"><ChevronRight size={20} /></button>
                </div>
                
                {/* Doc Number Input */}
                <div className="flex items-center bg-white border border-slate-300 rounded-lg p-1 shadow-sm px-2">
                    <span className="text-xs font-bold text-slate-500 mr-2">文號:</span>
                    <input type="text" className="outline-none text-sm w-24" placeholder="例:高市..." value={docNumber} onChange={e => setDocNumber(e.target.value)} />
                </div>

                <div className="bg-cyan-50 px-4 py-2 rounded-lg border border-cyan-200"><span className="text-xs text-cyan-600 font-bold uppercase block">本月總額預估</span><span className="text-xl font-bold text-cyan-700">${totalPay.toLocaleString()}</span></div>
                <button onClick={handleGenerate} disabled={isGenerating || selectedTeachers.size === 0} className="bg-cyan-600 hover:bg-cyan-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-md flex items-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed">{isGenerating ? <Loader2 size={20} className="animate-spin" /> : <FileOutput size={20} />}<span>匯出選取清冊 ({selectedTeachers.size})</span></button>
            </div>
        </header>

        <InstructionPanel title="使用說明：固定兼課管理">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>功能概述：</strong>管理每週固定時段的兼課（如固定每週三第2節），系統會依據行事曆自動計算每月應領金額。</li>
            <li><strong>設定課表：</strong>
               <ul className="list-circle pl-5 mt-1 text-slate-500">
                 <li><strong>優先套用教師課表：</strong>若該教師在「教師管理」已設定預設課表，固定兼課時段將直接套用，無須重複設定；活動扣除與請假扣除皆依該課表辨識。</li>
                 <li>若教師尚未設定預設課表，可點擊教師姓名，在彈出視窗中設定每週固定兼課時段。</li>
                 <li>設定後，系統會自動統計每週節數，並依據當月實際上班日計算總節數。</li>
               </ul>
            </li>
            <li><strong>活動扣除：</strong>
               <ul className="list-circle pl-5 mt-1 text-slate-500">
                 <li>固定兼課目前僅能設定「週幾第幾節有課」，<strong>無法在每堂課標註年級班級</strong>。活動扣除是依<strong>「教師管理」裡該教師的任課班級</strong>（如 301、3年級）與本月活動的受影響年級比對；若教師未填任課班級，就不會出現活動扣除警示。</li>
                 <li>請先在頁面上方<strong>「本月活動 (校外教學/畢旅)」</strong>區塊點擊<strong>「新增活動」</strong>，輸入活動日期、名稱與受影響年級（如 3、6）。</li>
                 <li>教師的<strong>任課班級</strong>需在「教師管理」中有填寫，活動扣除才會顯示在該教師的<strong>「增減節數」</strong>欄位中（手動輸入框下方）；若任課年級與活動相符且活動當天有排課，會列出建議扣除節數與勾選方塊。</li>
                 <li>若教師已調課（有上課），請<strong>勾選該活動旁的方塊</strong>，系統將忽略該筆扣除。</li>
               </ul>
            </li>
          </ul>
        </InstructionPanel>

        {/* Semester Display Bar */}
        <div className="bg-indigo-50 rounded-xl border border-indigo-200 mb-6 p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <h3 className="font-bold text-indigo-900 flex items-center text-sm shrink-0"><BookOpen size={18} className="mr-2 text-indigo-600" /> 目前學期區間</h3>
                    
                    {semesterStart && semesterEnd ? (
                        <div className="text-sm text-indigo-700 font-mono bg-white px-4 py-1.5 rounded-lg border border-indigo-200 font-bold shadow-sm">
                            {semesterStart} ~ {semesterEnd}
                        </div>
                    ) : (
                        <div className="text-xs text-red-500 font-bold bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 flex items-center">
                            <AlertCircle size={14} className="mr-1"/> 尚未設定學期日期，計算可能不準確
                        </div>
                    )}
                </div>
                <Link to="/settings" className="text-xs bg-white text-indigo-600 px-4 py-2 rounded-lg border border-indigo-200 hover:bg-indigo-50 font-bold flex items-center transition-colors shadow-sm">
                    <Settings size={14} className="mr-2"/> 
                    {semesterStart ? '修改日期設定' : '前往設定日期'}
                </Link>
            </div>
        </div>

        {/* Grade Events Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 p-4">
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-slate-700 flex items-center"><Flag size={18} className="mr-2 text-rose-500" /> 本月活動 (校外教學/畢旅)</h3>
                <button onClick={() => setShowEventModal(true)} className="text-sm bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg hover:bg-rose-100 font-bold flex items-center transition-colors"><Plus size={16} className="mr-1" /> 新增活動</button>
            </div>
            {currentMonthEvents.length === 0 ? (
                <div className="space-y-2">
                    <div className="text-sm text-slate-400 italic bg-slate-50 p-2 rounded text-center">本月無特殊年級活動</div>
                    <p className="text-xs text-slate-500 text-center">新增活動後，受影響教師的<strong>「增減節數」</strong>欄位會顯示活動扣除與勾選方塊（需教師有填寫任課班級）</p>
                </div>
            ) : (
                <div className="flex flex-wrap gap-2">{currentMonthEvents.map(event => (<div key={event.id} className="bg-rose-50 border border-rose-100 px-3 py-2 rounded-lg flex items-center shadow-sm"><div className="mr-3"><div className="text-xs font-bold text-rose-800">{event.date}</div><div className="text-sm font-bold text-rose-600">{event.title}</div><div className="text-[10px] text-rose-400">年級: {event.targetGrades.join(', ')}</div></div><button onClick={() => removeGradeEvent(event.id)} className="text-rose-300 hover:text-rose-500"><Trash2 size={16} /></button></div>))}</div>
            )}
        </div>

        {/* Config Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-8 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h2 className="font-bold text-slate-700 flex items-center"><Calculator size={18} className="mr-2"/> 兼課設定與計算預覽</h2>
                <div className="flex gap-2">
                    <div className="w-64"><SearchableSelect options={teachers.map(t => ({ value: t.id, label: t.name, subLabel: t.jobTitle }))} value={addTeacherId} onChange={setAddTeacherId} placeholder="新增教師..."/></div>
                    <button onClick={handleAddTeacher} disabled={!addTeacherId} className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"><Plus size={20} /></button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-bold">
                        <tr>
                            <th className="px-4 py-3 w-10 text-center">
                                <input 
                                    type="checkbox" 
                                    className="cursor-pointer"
                                    checked={reportData.length > 0 && selectedTeachers.size === reportData.length}
                                    onChange={handleSelectAll}
                                />
                            </th>
                            <th className="px-4 py-3 w-48">教師</th>
                            {['一', '二', '三', '四', '五'].map((d, i) => (<th key={i} className="px-2 py-3 text-center w-16 bg-blue-50/50">週{d} <br/><span className="text-[10px] text-blue-400 font-normal">(x{weekdayCounts[i]})</span></th>))}
                            <th className="px-4 py-3 text-right w-24 border-l">應上節數</th>
                            <th className="px-2 py-3 text-center w-48">
                                增減節數 <span className="text-[9px] block text-slate-400 font-normal">手動；活動扣除、請假扣除顯示於此</span>
                            </th>
                            <th className="px-4 py-3 w-48">調整原因</th>
                            <th className="px-4 py-3 text-right w-24 bg-green-50/50">實發金額</th>
                            <th className="px-2 py-3 w-12"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                        {reportData.map((row) => (
                            <tr key={row.teacherId} className={`hover:bg-slate-50 ${selectedTeachers.has(row.teacherId) ? 'bg-indigo-50/30' : ''}`}>
                                <td className="px-4 py-3 text-center">
                                    <input 
                                        type="checkbox" 
                                        className="cursor-pointer"
                                        checked={selectedTeachers.has(row.teacherId)}
                                        onChange={() => toggleTeacherSelection(row.teacherId)}
                                    />
                                </td>
                                <td 
                                    className="px-4 py-3 group cursor-pointer"
                                    onClick={() => setScheduleModal({ isOpen: true, teacherId: row.teacherId })}
                                >
                                    <div className="font-bold text-indigo-700 group-hover:text-indigo-900 flex items-center underline decoration-dotted decoration-indigo-300 underline-offset-4">
                                        {row.teacherName}
                                        <Clock size={14} className="ml-2 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"/>
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                                        <span>{row.jobTitle}</span>
                                        {row.usesTeacherSchedule && <span className="text-amber-600 font-medium">課表來自教師管理</span>}
                                    </div>
                                </td>
                                
                                {[0, 1, 2, 3, 4].map(dayIdx => (
                                    <td key={dayIdx} className="px-2 py-3 text-center bg-blue-50/10">
                                        {row.hasSchedule ? (
                                            <span className="text-slate-500 font-bold">{row.periods[dayIdx]}</span>
                                        ) : (
                                            <input 
                                                type="number" 
                                                min="0" 
                                                className="w-12 text-center border border-slate-200 rounded py-1 focus:ring-2 focus:ring-blue-500 outline-none" 
                                                value={row.periods[dayIdx]} 
                                                onChange={(e) => handlePeriodChange(row.teacherId, dayIdx, e.target.value)}
                                            />
                                        )}
                                    </td>
                                ))}

                                <td className="px-4 py-3 text-right font-bold text-slate-700 border-l">{row.expected}</td>

                                <td className="px-2 py-3">
                                    <div className="flex flex-col space-y-2">
                                        <div className="flex items-center space-x-2">
                                            <span className="text-xs text-slate-400">手動:</span>
                                            <input 
                                                type="number" 
                                                className="w-14 text-center border border-slate-200 rounded py-1 focus:ring-2 focus:ring-amber-500 outline-none text-amber-600 font-bold"
                                                placeholder="0"
                                                value={row.manualAdjustment || ''}
                                                onChange={(e) => handleManualAdjustmentChange(row.teacherId, e.target.value)}
                                            />
                                        </div>
                                        
                                        {row.affectedEvents && row.affectedEvents.length > 0 && (
                                            <div className="space-y-1">
                                                {row.affectedEvents.map((evt: any) => {
                                                    const isIgnored = row.ignoredEventIds.includes(evt.id);
                                                    return (
                                                        <div key={evt.id} className={`flex items-center text-[10px] p-1 rounded border ${isIgnored ? 'bg-slate-50 border-slate-200 text-slate-400' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                                                            <input 
                                                                type="checkbox" 
                                                                className="mr-1.5 cursor-pointer"
                                                                checked={isIgnored}
                                                                onChange={() => toggleIgnoreEvent(row.teacherId, evt.id)}
                                                                title="勾選代表已調課/不扣除"
                                                            />
                                                            <span className={isIgnored ? 'line-through' : 'font-bold'}>
                                                                {fmtDate(evt.date)} {evt.title} (-{evt.deduction})
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                                <div className="text-[9px] text-slate-400 text-center">↑ 勾選以忽略扣除 (已調課)</div>
                                            </div>
                                        )}
                                        {(!row.affectedEvents || row.affectedEvents.length === 0) && currentMonthEvents.length > 0 && (
                                            <div className="text-[9px] text-slate-400 italic">活動扣除：無</div>
                                        )}
                                        {row.leaveDeductionTotal > 0 && (
                                            <div className="mt-1 space-y-0.5">
                                                <div className="bg-orange-50 border border-orange-100 text-orange-700 text-[10px] p-1 rounded font-bold">
                                                    請假扣除: -{row.leaveDeductionTotal} 節
                                                </div>
                                                {row.leaveReasons && row.leaveReasons.length > 0 && (
                                                    <ul className="text-[9px] text-orange-600 list-disc list-inside pl-0.5">
                                                        {row.leaveReasons.map((reason: string, i: number) => (
                                                            <li key={i}>{reason}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </td>

                                <td className="px-4 py-3">
                                    <input type="text" className="w-full text-xs border border-slate-200 rounded px-2 py-1" placeholder="手動調整原因..." value={row.adjustmentReason} onChange={(e) => handleReasonChange(row.teacherId, e.target.value)}/>
                                </td>

                                <td className="px-4 py-3 text-right font-bold text-green-700 bg-green-50/10">${row.pay.toLocaleString()}</td>

                                <td className="px-2 py-3 text-center">
                                    <button onClick={() => removeFixedOvertimeConfig(row.teacherId)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                        {substituteTeachersList.map((row) => (
                            <tr key={`sub-${row.teacherId}`} className="hover:bg-slate-50 bg-emerald-50/30">
                                <td className="px-4 py-3 text-center"><span className="text-slate-300">-</span></td>
                                <td className="px-4 py-3">
                                    <div className="font-bold text-emerald-700 flex items-center">
                                        {row.teacherName}
                                        <span className="ml-2 text-[10px] bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded font-normal">代課</span>
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">{row.jobTitle}</div>
                                </td>
                                {[0, 1, 2, 3, 4].map(dayIdx => (<td key={dayIdx} className="px-2 py-3 text-center bg-blue-50/10 text-slate-300">-</td>))}
                                <td className="px-4 py-3 text-right text-slate-500 border-l">0</td>
                                <td className="px-2 py-3">
                                    <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] p-1 rounded font-bold">
                                        代課 +{row.substituteSessions} 節
                                    </div>
                                    {row.substituteDetails && row.substituteDetails.length > 0 && (
                                        <ul className="text-[9px] text-emerald-600 list-disc list-inside mt-0.5 pl-0.5">
                                            {row.substituteDetails.slice(0, 5).map((d: string, i: number) => (<li key={i}>{d}</li>))}
                                            {row.substituteDetails.length > 5 && <li className="text-slate-400">…共 {row.substituteDetails.length} 筆</li>}
                                        </ul>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-xs text-slate-500">當月代固定兼課教師之節數</td>
                                <td className="px-4 py-3 text-right font-bold text-green-700 bg-green-50/10">${row.pay.toLocaleString()}</td>
                                <td className="px-2 py-3"></td>
                            </tr>
                        ))}
                        {reportData.length === 0 && substituteTeachersList.length === 0 && (<tr><td colSpan={11} className="py-8 text-center text-slate-400">請從上方選擇並新增教師以開始設定</td></tr>)}
                    </tbody>
                </table>
            </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start text-amber-800 text-sm">
            <AlertCircle size={18} className="mr-2 mt-0.5 shrink-0"/>
            <div>
                <p className="font-bold mb-1">計算說明：</p>
                <p>1. 系統已自動排除國定假日。</p>
                <p>2. 計算公式：<span className="font-mono bg-white px-1 rounded border border-amber-200">週一節數 × 週一數 + ... + 手動增減 - 活動扣除</span>。</p>
                <p>3. <strong>課表設定：</strong>點擊教師姓名可設定詳細課表，設定後每週節數將自動鎖定並由課表計算。</p>
                <p>4. <strong>自動建議扣除：</strong>若有年級活動影響到該教師的課表，系統會列出建議扣除項目。</p>
                <p>5. <strong>調課處理：</strong>若教師已調課（有上課），請勾選該活動項目旁的方塊，系統將忽略該筆扣除。</p>
            </div>
        </div>
    </div>
  );
};

export default FixedOvertimePage;
