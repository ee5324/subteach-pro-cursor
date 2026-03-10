
// ... (Previous imports and components unchanged)

// Only modifying the Overtime component logic significantly.
// Including full file for context safety, but focusing on filteredRowData and handleExportExcel.

import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { TeacherType, OvertimeRecord, HOURLY_RATE, Teacher, ReductionItem, PayType } from '../types';
import { Calendar, Calculator, Coins, Save, AlertCircle, ChevronLeft, ChevronRight, GraduationCap, X, Clock, Info, RefreshCcw, RefreshCw, Flag, CloudUpload, Loader2, Search, Filter, MinusCircle, Plus, Trash2, Edit2, Settings, AlertTriangle, ArrowDownToLine, Printer, FileText, FileOutput, Users, Copy, BarChart3, RotateCcw, GripVertical } from 'lucide-react';
import Modal, { ModalMode, ModalType } from '../components/Modal';
import { getStandardBase, parseLocalDate, normalizeDateString, getEffectiveFixedOvertimeSlots } from '../utils/calculations';
import { callGasApi } from '../utils/api';
import InstructionPanel, { CollapsibleItem } from '../components/InstructionPanel';

const ScheduleSlot: React.FC<{ 
    label: string; 
    isOvertime: boolean; 
    onClick: () => void;
}> = ({ label, isOvertime, onClick }) => (
    <div 
        onClick={onClick}
        className={`
            border rounded p-2 text-center cursor-pointer transition-all text-xs h-12 flex items-center justify-center
            ${isOvertime 
                ? 'bg-amber-100 border-amber-300 text-amber-700 font-bold shadow-sm' 
                : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
            }
        `}
    >
        {isOvertime ? '超鐘點' : label}
    </div>
);

// ... (OvertimeStatsModal, OvertimeScheduleModal, ReductionSettingsModal components remain unchanged) ...
const OvertimeStatsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    data: any[];
    month: string;
    grandTotal: number;
}> = ({ isOpen, onClose, data, month, grandTotal }) => {
    if (!isOpen) return null;

    const handlePrint = () => {
        window.print();
    };

    const [year, m] = month.split('-');
    const title = `${Number(year) - 1911}年${Number(m)}月 超鐘點經費核銷統計與檢核表`;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
                <div className="bg-slate-800 text-white px-6 py-4 flex justify-between items-center print:hidden shrink-0">
                    <div className="flex items-center space-x-2">
                        <FileText className="text-emerald-400" />
                        <h3 className="font-bold text-lg">檢核報表預覽</h3>
                    </div>
                    <div className="flex space-x-3">
                        <button onClick={handlePrint} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold flex items-center shadow-sm transition-colors">
                            <Printer size={18} className="mr-2"/> 列印 / 存為 PDF
                        </button>
                        <button onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2 rounded-lg transition-colors">
                            <X size={20}/>
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto bg-slate-100 p-8 print:p-0 print:bg-white printable-area">
                    <div className="bg-white p-8 shadow-sm max-w-[297mm] mx-auto min-h-[210mm] print:shadow-none print:w-full print:max-w-none print:m-0">
                        <div className="text-center mb-6">
                            <h1 className="text-2xl font-bold text-slate-900 border-b-2 border-slate-800 pb-2 inline-block px-8 mb-2">
                                {title}
                            </h1>
                            <div className="text-sm text-slate-500 flex justify-between items-end mt-2">
                                <span>列印日期：{new Date().toLocaleDateString()}</span>
                                <span>單位：節 / 新台幣元</span>
                            </div>
                        </div>
                        <table className="w-full border-collapse border border-slate-400 text-sm text-center">
                            <thead className="bg-slate-50 print:bg-slate-100 text-slate-700">
                                <tr>
                                    <th className="border border-slate-400 py-2 px-1 w-24">姓名</th>
                                    <th className="border border-slate-400 py-2 px-1 w-20">職別</th>
                                    <th className="border border-slate-400 py-2 px-1 w-32 bg-blue-50/50 print:bg-transparent">
                                        節數結構<br/>
                                        <span className="text-[10px] font-normal scale-90 block">實授 + 減授 - 超鐘 = 法定</span>
                                    </th>
                                    <th className="border border-slate-400 py-2 px-1 w-20">計算<br/>模式</th>
                                    <th className="border border-slate-400 py-2 px-1 w-16">每週<br/>超授</th>
                                    <th className="border border-slate-400 py-2 px-1 w-16">週數<br/>基數</th>
                                    <th className="border border-slate-400 py-2 px-1 w-20">應計<br/>總節數</th>
                                    <th className="border border-slate-400 py-2 px-1">扣除紀錄 / 調整備註</th>
                                    <th className="border border-slate-400 py-2 px-1 w-20 bg-green-50/50 print:bg-transparent">實發<br/>節數</th>
                                    <th className="border border-slate-400 py-2 px-1 w-24 font-bold">金額</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((row, idx) => {
                                    const structStr = `${row.weeklyActual} + ${row.reduction} - ${row.finalOvertimeCount} = ${row.standardBase}`;
                                    const isStructValid = row.isBalanced;
                                    const modeStr = row.hasPreciseConfig ? "指定時段" : "週數概算";
                                    const deductions = row.leaveDeductions || [];
                                    const additions = row.subAdditions?.details || [];
                                    const manualAdj = row.adjustment !== 0 ? `手動調整: ${row.adjustment > 0 ? '+' : ''}${row.adjustment} (${row.adjustmentReason})` : '';
                                    const displayNotes = [...deductions, ...additions, manualAdj].filter(Boolean);
                                    const weeklyOvertime = row.finalOvertimeCount;
                                    const gross = row.hasPreciseConfig ? row.preciseGross : Math.ceil(weeklyOvertime * row.weeksCount);
                                    const net = row.displayCount;
                                    const pay = Math.round(net * HOURLY_RATE);

                                    return (
                                        <tr key={idx} className="break-inside-avoid">
                                            <td className="border border-slate-400 py-2 px-1 font-bold text-slate-800 text-left pl-3">
                                                {row.teacher.name}
                                                {row.teacher.isGraduatingHomeroom && <span className="text-[10px] ml-1 text-slate-500">(畢)</span>}
                                            </td>
                                            <td className="border border-slate-400 py-2 px-1 text-xs">{row.teacher.jobTitle || row.teacher.teacherRole}</td>
                                            <td className={`border border-slate-400 py-1 px-1 text-[10px] font-mono ${!isStructValid ? 'text-red-600 font-bold bg-red-50 print:bg-transparent' : 'text-slate-500'}`}>
                                                {structStr}
                                                {!isStructValid && <div className="text-[9px]">異常</div>}
                                            </td>
                                            <td className="border border-slate-400 py-2 px-1 text-xs text-slate-600">{modeStr}</td>
                                            <td className="border border-slate-400 py-2 px-1 font-bold">{weeklyOvertime}</td>
                                            <td className="border border-slate-400 py-2 px-1 text-xs">{row.hasPreciseConfig ? '日曆' : row.weeksCount}</td>
                                            <td className="border border-slate-400 py-2 px-1 text-slate-600">{gross}</td>
                                            <td className="border border-slate-400 py-1 px-2 text-left text-[10px]">
                                                {displayNotes.length > 0 ? (
                                                    <ul className="list-disc list-inside text-slate-700">
                                                        {displayNotes.map((note, i) => <li key={i}>{note}</li>)}
                                                    </ul>
                                                ) : (
                                                    <span className="text-slate-300 text-center block">-</span>
                                                )}
                                            </td>
                                            <td className="border border-slate-400 py-2 px-1 font-bold text-lg">{net}</td>
                                            <td className="border border-slate-400 py-2 px-1 font-bold text-right pr-2">${pay.toLocaleString()}</td>
                                        </tr>
                                    );
                                })}
                                <tr className="bg-slate-100 font-bold print:bg-white">
                                    <td colSpan={8} className="border border-slate-400 py-3 text-right pr-4">總計</td>
                                    <td className="border border-slate-400 py-3 text-center">-</td>
                                    <td className="border border-slate-400 py-3 text-right pr-2">${grandTotal.toLocaleString()}</td>
                                </tr>
                            </tbody>
                        </table>
                        <div className="mt-12 flex justify-between text-sm break-inside-avoid">
                            <div className="w-1/4 border-b border-slate-800 pb-2">承辦人：</div>
                            <div className="w-1/4 border-b border-slate-800 pb-2">處室主管：</div>
                            <div className="w-1/4 border-b border-slate-800 pb-2">會計主任：</div>
                            <div className="w-1/4 border-b border-slate-800 pb-2">校長：</div>
                        </div>
                        <div className="mt-4 text-[10px] text-slate-400 text-right">
                            系統產生時間：{new Date().toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const OvertimeScheduleModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    teacher: Teacher;
    record: OvertimeRecord;
    onSave: (slots: { day: number; period: string }[]) => void;
}> = ({ isOpen, onClose, teacher, record, onSave }) => {
    const [slots, setSlots] = useState<{ day: number; period: string }[]>(record.overtimeSlots || []);
    
    useEffect(() => {
        setSlots(record.overtimeSlots || []);
    }, [record]);

    if (!isOpen) return null;

    const periods = ['早', '1', '2', '3', '4', '午', '5', '6', '7'];
    const days = ['一', '二', '三', '四', '五'];

    const toggleSlot = (dayIdx: number, period: string) => {
        const day = dayIdx + 1; 
        const exists = (slots ?? []).some(s => s.day === day && s.period === period);
        if (exists) {
            setSlots(slots.filter(s => !(s.day === day && s.period === period)));
        } else {
            setSlots([...slots, { day, period }]);
        }
    };

    const handleSave = () => {
        onSave(slots);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-indigo-600 p-4 flex justify-between items-center text-white">
                    <div>
                        <h3 className="font-bold text-lg flex items-center">
                            <Clock className="mr-2" size={20}/>
                            {teacher.name} - 超鐘點時段設定
                        </h3>
                        <p className="text-indigo-200 text-xs mt-1">點擊格子標記為「超鐘點」，若該時段有請假將自動扣除。</p>
                    </div>
                    <button onClick={onClose} className="text-indigo-200 hover:text-white"><X size={24}/></button>
                </div>
                <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
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
                                    const isOvertime = (slots ?? []).some(s => s.day === dayNum && s.period === p);
                                    return (
                                        <ScheduleSlot 
                                            key={`${dayNum}-${p}`}
                                            label="-"
                                            isOvertime={isOvertime}
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
                        目前設定：<span className="font-bold text-indigo-600">{slots.length}</span> 節/週
                    </div>
                    <div className="flex space-x-2">
                        <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
                        <button onClick={handleSave} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md">儲存設定</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const Overtime: React.FC = () => {
  const { teachers, overtimeRecords, updateOvertimeRecord, updateTeacher, records: leaveRecords, holidays, settings, fixedOvertimeConfig } = useAppStore();

  // State: Month Selection
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [showConfiguredOnly, setShowConfiguredOnly] = useState(true);
  
  // Doc Number State
  const [docNumber, setDocNumber] = useState('');

  const [modal, setModal] = useState<{ 
      isOpen: boolean; 
      title: string; 
      message: React.ReactNode; 
      type: ModalType;
      mode: ModalMode;
      onConfirm?: () => void;
  }>({ isOpen: false, title: '', message: '', type: 'info', mode: 'alert' });

  const [scheduleModal, setScheduleModal] = useState<{ isOpen: boolean; teacherId: string | null; }>({ isOpen: false, teacherId: null });
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false); 
  const [draggingTeacherId, setDraggingTeacherId] = useState<string | null>(null);
  const [dragOverTeacherId, setDragOverTeacherId] = useState<string | null>(null);

  const showModal = (title: string, message: React.ReactNode, type: ModalType = 'info', onConfirm?: () => void) => { 
      setModal({ 
          isOpen: true, 
          title, 
          message, 
          type, 
          mode: onConfirm ? 'confirm' : 'alert',
          onConfirm 
      }); 
  };

  const handleMonthChange = (direction: 'prev' | 'next') => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const current = new Date(year, month - 1, 1);
    current.setMonth(current.getMonth() + (direction === 'next' ? 1 : -1));
    const newYear = current.getFullYear();
    const newMonth = String(current.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${newYear}-${newMonth}`);
  };

  const graduationDate = settings?.graduationDate || null;

  const monthWeekdayCounts = useMemo(() => {
      const [year, month] = selectedMonth.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const counts = [0, 0, 0, 0, 0]; 
      const semStart = settings?.semesterStart;
      const semEnd = settings?.semesterEnd;
      for(let d=1; d<=daysInMonth; d++) {
          const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          if (semStart && dateStr < semStart) continue;
          if (semEnd && dateStr > semEnd) continue;
          const dateObj = parseLocalDate(dateStr);
          const day = dateObj.getDay(); 
          if(day >= 1 && day <= 5) { counts[day - 1]++; }
      }
      return counts;
  }, [selectedMonth, settings?.semesterStart, settings?.semesterEnd]);

  const totalWorkingDays = monthWeekdayCounts.reduce((a, b) => a + b, 0);
  const calculatedWeeks = parseFloat((totalWorkingDays / 5).toFixed(2));

  const internalTeachers = useMemo(() => {
    // Include all teachers so external substitutes can also receive overtime pay; filter out invalid entries
    const list = teachers ?? [];
    return list.filter((t): t is Teacher => !!t && !!t.id);
  }, [teachers]);

  const calculateDefaultBasic = (teacher: Teacher) => {
      const standard = getStandardBase(teacher);
      const totalReduction = (teacher.reductions && teacher.reductions.length > 0)
          ? teacher.reductions.reduce((sum, item) => sum + item.periods, 0)
          : (teacher.adminReduction || 0);
      return Math.max(0, standard - totalReduction);
  };

  const periodOrderOvertime = ['早', '1', '2', '3', '4', '午', '5', '6', '7'];
  const calculatePreciseOvertime = (teacherId: string, overtimeSlots: { day: number; period: string }[]): { grossCount: number, netCount: number, details: string[] } => {
      if (!overtimeSlots || overtimeSlots.length === 0) return { grossCount: 0, netCount: 0, details: [] };
      const teacher = (teachers || []).find(t => t.id === teacherId);
      const [year, month] = selectedMonth.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const semStart = settings?.semesterStart;
      const semEnd = settings?.semesterEnd;
      let grossCount = 0;
      let netCount = 0;
      const leaveByDate = new Map<string, Set<string>>();
      const graduateDates = new Set<string>();

      for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          if (semStart && dateStr < semStart) continue;
          if (semEnd && dateStr > semEnd) continue;
          const dateObj = parseLocalDate(dateStr);
          let dayOfWeek = dateObj.getDay(); 
          if (dayOfWeek === 0) dayOfWeek = 7;
          const dailySlots = overtimeSlots.filter(s => s.day === dayOfWeek);
          if (dailySlots.length > 0) {
              dailySlots.forEach(slot => {
                  grossCount++;
                  if (teacher?.isGraduatingHomeroom && graduationDate && dateStr > graduationDate) {
                      graduateDates.add(dateStr.substring(5));
                      return;
                  }
                  const isOnLeave = (leaveRecords || []).some(r => {
                      if (r.originalTeacherId !== teacherId) return false;
                      const normStart = normalizeDateString(r.startDate);
                      const normEnd = normalizeDateString(r.endDate);
                      if (dateStr < normStart || dateStr > normEnd) return false;
                      
                      if (r.slots && r.slots.length > 0) {
                          const slotsForThisDay = r.slots.filter(s => normalizeDateString(s.date) === dateStr);
                          if (slotsForThisDay.length > 0) {
                              return slotsForThisDay.some(s => String(s.period) === String(slot.period));
                          }
                          return false;
                      }
                      if (r.details && r.details.length > 0) {
                          const detailsForThisDay = r.details.filter(d => normalizeDateString(d.date) === dateStr);
                          if (detailsForThisDay.length > 0) {
                              return detailsForThisDay.some(d => {
                                  if (!d.selectedPeriods || d.selectedPeriods.length === 0) return true;
                                  return d.selectedPeriods.map(p => String(p).trim()).includes(String(slot.period));
                              });
                          }
                          return false;
                      }
                      return true; 
                  });
                  if (!isOnLeave) { 
                      netCount++; 
                  } else { 
                      const shortDate = dateStr.substring(5);
                      if (!leaveByDate.has(shortDate)) leaveByDate.set(shortDate, new Set());
                      leaveByDate.get(shortDate)!.add(String(slot.period));
                  }
              });
          }
      }
      const log: string[] = [];
      graduateDates.forEach(d => log.push(`${d} (畢業後)`));
      leaveByDate.forEach((periods, shortDate) => {
          const sorted = Array.from(periods).sort((a, b) => periodOrderOvertime.indexOf(a) - periodOrderOvertime.indexOf(b));
          log.push(`${shortDate}(${sorted.join('、')}節)請假扣除`);
      });
      return { grossCount, netCount, details: log };
  };

  const calculateSubstituteAdditions = (teacherId: string): { count: number, details: string[], relatedOriginalTeacherIds: string[], sessionsByDate: { date: string; count: number }[] } => {
      const [year, month] = selectedMonth.split('-').map(Number);
      const monthPrefix = `${year}-${String(month).padStart(2,'0')}`;
      const seenDatePeriod = new Set<string>();
      const groupByDateOriginal = new Map<string, { date: string; originalName: string; periods: Set<string> }>();
      const relatedOriginalTeacherIds = new Set<string>();
      const countByDate = new Map<string, number>();

      (leaveRecords || []).forEach(record => {
          const normStart = normalizeDateString(record.startDate);
          const normEnd = normalizeDateString(record.endDate);
          if (normEnd < `${monthPrefix}-01`) return;
          if (normStart > `${monthPrefix}-31`) return;

          const originalRecord = (overtimeRecords || []).find(r => r.id === `${selectedMonth}_${record.originalTeacherId}`);
          const originalOvertimeSlots = originalRecord?.overtimeSlots ?? [];
          if (originalOvertimeSlots.length === 0) return;
          const originalName = (teachers || []).find(t => t.id === record.originalTeacherId)?.name || '老師';

          if (record.slots && record.slots.length > 0) {
              record.slots.forEach(slot => {
                  const normDate = normalizeDateString(slot.date);
                  const dateObj = parseLocalDate(normDate);
                  let dayOfWeek = dateObj.getDay();
                  if (dayOfWeek === 0) dayOfWeek = 7;
                  const isOvertimeSlot = originalOvertimeSlots.some(s => s.day === dayOfWeek && String(s.period) === String(slot.period));

                  if (slot.substituteTeacherId === teacherId && normDate.startsWith(monthPrefix)) {
                      const isDailyPay = slot.payType === PayType.DAILY || slot.payType === PayType.HALF_DAY || (slot as any).payType === '日薪' || (slot as any).payType === '半日薪';
                      if (isOvertimeSlot && !isDailyPay) {
                          const key = `${normDate}|${String(slot.period)}`;
                          if (!seenDatePeriod.has(key)) {
                              seenDatePeriod.add(key);
                              relatedOriginalTeacherIds.add(record.originalTeacherId);
                              countByDate.set(normDate, (countByDate.get(normDate) || 0) + 1);
                              const dateKey = normDate.substring(5);
                              const groupKey = `${dateKey}|${originalName}`;
                              if (!groupByDateOriginal.has(groupKey)) {
                                  groupByDateOriginal.set(groupKey, { date: dateKey, originalName, periods: new Set() });
                              }
                              groupByDateOriginal.get(groupKey)!.periods.add(String(slot.period));
                          }
                      }
                  }
              });
          } else if (record.details && record.details.length > 0) {
              const handledPeriodsByDate: Record<string, Set<string>> = {};

              record.details.forEach(detail => {
                  const normDate = normalizeDateString(detail.date);
                  if (detail.substituteTeacherId !== teacherId || !normDate.startsWith(monthPrefix)) return;
                  const isDailyPay = detail.payType === PayType.DAILY || detail.payType === PayType.HALF_DAY || (detail as any).payType === '日薪' || (detail as any).payType === '半日薪';
                  if (isDailyPay) return;

                  const dateObj = parseLocalDate(normDate);
                  let dayOfWeek = dateObj.getDay();
                  if (dayOfWeek === 0) dayOfWeek = 7;
                  if (!handledPeriodsByDate[normDate]) handledPeriodsByDate[normDate] = new Set();
                  const newPeriodsForThisDetail: string[] = [];
                  const dateKey = normDate.substring(5);
                  const groupKey = `${dateKey}|${originalName}`;

                  (detail.selectedPeriods || []).forEach(p => {
                      const pStr = String(p).trim();
                      if (handledPeriodsByDate[normDate].has(pStr)) return;
                      const inOriginalOvertime = originalOvertimeSlots.some(s => s.day === dayOfWeek && String(s.period) === pStr);
                      if (!inOriginalOvertime) return;
                      const key = `${normDate}|${pStr}`;
                      if (!seenDatePeriod.has(key)) {
                          seenDatePeriod.add(key);
                          relatedOriginalTeacherIds.add(record.originalTeacherId);
                          countByDate.set(normDate, (countByDate.get(normDate) || 0) + 1);
                          handledPeriodsByDate[normDate].add(pStr);
                          newPeriodsForThisDetail.push(pStr);
                          if (!groupByDateOriginal.has(groupKey)) {
                              groupByDateOriginal.set(groupKey, { date: dateKey, originalName, periods: new Set() });
                          }
                          groupByDateOriginal.get(groupKey)!.periods.add(pStr);
                      }
                  });
                  if (newPeriodsForThisDetail.length === 0 && detail.isOvertime && detail.periodCount > 0 && (!detail.selectedPeriods || detail.selectedPeriods.length === 0)) {
                      const legacyKeyBase = `${normDate}|legacy|${record.id}`;
                      const anyMatch = originalOvertimeSlots.some(s => s.day === dayOfWeek);
                      if (anyMatch) {
                          for (let i = 0; i < detail.periodCount; i++) {
                              const key = `${legacyKeyBase}|${i}`;
                              if (!seenDatePeriod.has(key)) {
                                  seenDatePeriod.add(key);
                                  relatedOriginalTeacherIds.add(record.originalTeacherId);
                                  countByDate.set(normDate, (countByDate.get(normDate) || 0) + 1);
                                  if (!groupByDateOriginal.has(groupKey)) {
                                      groupByDateOriginal.set(groupKey, { date: dateKey, originalName, periods: new Set() });
                                  }
                                  groupByDateOriginal.get(groupKey)!.periods.add(String(detail.periodCount));
                              }
                          }
                      }
                  }
              });
          }
      });
      const details: string[] = [];
      groupByDateOriginal.forEach(({ date, originalName, periods }) => {
          const sorted = Array.from(periods).sort((a, b) => periodOrderOvertime.indexOf(a) - periodOrderOvertime.indexOf(b));
          details.push(`${date}(${sorted.join('、')}節)代${originalName}`);
      });
      const sessionsByDate = Array.from(countByDate.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, count]) => ({ date, count }));
      return { count: seenDatePeriod.size, details, relatedOriginalTeacherIds: Array.from(relatedOriginalTeacherIds), sessionsByDate };
  };

  const calculateLeaveDeductionsFromRecords = (teacherId: string): { count: number, details: string[] } => {
      let count = 0;
      const [year, month] = selectedMonth.split('-').map(Number);
      const monthPrefix = `${year}-${String(month).padStart(2,'0')}`;
      const leaveByDate = new Map<string, Set<string>>();

      (leaveRecords || []).forEach(record => {
          if (record.originalTeacherId !== teacherId) return;
          const normStart = normalizeDateString(record.startDate);
          const normEnd = normalizeDateString(record.endDate);
          if (normEnd < `${monthPrefix}-01`) return;
          if (normStart > `${monthPrefix}-31`) return;

          if (record.slots && record.slots.length > 0) {
              record.slots.forEach(slot => {
                  const normDate = normalizeDateString(slot.date);
                  if (normDate.startsWith(monthPrefix)) {
                      let isAutoOvertime = false;
                      const originalTeacherConfig = (fixedOvertimeConfig || []).find(c => c.teacherId === record.originalTeacherId);
                      const originalTeacher = (teachers || []).find(t => t.id === record.originalTeacherId);
                      if (originalTeacherConfig && originalTeacher) {
                          const effectiveSlots = getEffectiveFixedOvertimeSlots(originalTeacher, originalTeacherConfig);
                          const dateObj = parseLocalDate(normDate);
                          const dayOfWeek = dateObj.getDay();
                          isAutoOvertime = effectiveSlots.some(s => s.day === dayOfWeek && String(s.period) === String(slot.period));
                      }
                      if (slot.isOvertime || isAutoOvertime) {
                          count++;
                          const shortDate = normDate.substring(5);
                          if (!leaveByDate.has(shortDate)) leaveByDate.set(shortDate, new Set());
                          leaveByDate.get(shortDate)!.add(String(slot.period));
                      }
                  }
              });
          } else if (record.details && record.details.length > 0) {
              record.details.forEach(detail => {
                  const normDate = normalizeDateString(detail.date);
                  if (normDate.startsWith(monthPrefix)) {
                      let overtimePeriods: string[] = [];
                      if (detail.isOvertime) {
                          overtimePeriods = (detail.selectedPeriods || []).map(p => String(p).trim());
                          if (overtimePeriods.length === 0 && detail.periodCount > 0) overtimePeriods = [String(detail.periodCount)];
                      } else {
                          const originalTeacherConfig = (fixedOvertimeConfig || []).find(c => c.teacherId === record.originalTeacherId);
                          const originalTeacher = (teachers || []).find(t => t.id === record.originalTeacherId);
                          if (originalTeacherConfig && originalTeacher && detail.selectedPeriods) {
                              const effectiveSlots = getEffectiveFixedOvertimeSlots(originalTeacher, originalTeacherConfig);
                              const dateObj = parseLocalDate(normDate);
                              const dayOfWeek = dateObj.getDay();
                              detail.selectedPeriods.forEach(p => {
                                  if (effectiveSlots.some(s => s.day === dayOfWeek && String(s.period) === String(p).trim())) {
                                      overtimePeriods.push(String(p).trim());
                                  }
                              });
                          }
                      }
                      if (overtimePeriods.length > 0) {
                          count += overtimePeriods.length;
                          const shortDate = normDate.substring(5);
                          if (!leaveByDate.has(shortDate)) leaveByDate.set(shortDate, new Set());
                          overtimePeriods.forEach(p => leaveByDate.get(shortDate)!.add(p));
                      }
                  }
              });
          }
      });
      const details: string[] = [];
      leaveByDate.forEach((periods, shortDate) => {
          const sorted = Array.from(periods).sort((a, b) => periodOrderOvertime.indexOf(a) - periodOrderOvertime.indexOf(b));
          details.push(`${shortDate}(${sorted.join('、')}節)請假扣除`);
      });
      return { count, details };
  };

  const rowData = useMemo(() => {
    return (internalTeachers || []).map(t => {
        const recordId = `${selectedMonth}_${t.id}`;
        const existing = (overtimeRecords || []).find(r => r.id === recordId);
        const standardBase = getStandardBase(t);
        const defaultBasic = calculateDefaultBasic(t);
        
        // 超鐘點與固定兼課為獨立事件：本頁僅用「本頁當月設定的超鐘點週課表」，不納入固定兼課名單
        const overtimeSlots: { day: number; period: string }[] = existing?.overtimeSlots ?? [];
        
        const scheduleCount = t.defaultSchedule?.length || 0;
        const autoActual = scheduleCount > 0 ? scheduleCount : defaultBasic;
        const preciseData = calculatePreciseOvertime(t.id, overtimeSlots);
        const subData = calculateSubstituteAdditions(t.id);
        const leaveDeductionsData = calculateLeaveDeductionsFromRecords(t.id);
        const hasPreciseConfig = overtimeSlots.length > 0; // 僅：當月在本頁點選設定超鐘點週課表者
        const totalReduction = (t.reductions && t.reductions.length > 0) ? t.reductions.reduce((sum, item) => sum + item.periods, 0) : (t.adminReduction || 0);
        const reductionDetails = (t.reductions && t.reductions.length > 0) ? t.reductions.map(r => `${r.title}: ${r.periods}`).join(', ') : '基本減授';
        let finalWeeklyActual = existing?.weeklyActual;
        if (finalWeeklyActual === undefined) { finalWeeklyActual = autoActual; } else if (finalWeeklyActual === 0 && scheduleCount > 0) { finalWeeklyActual = scheduleCount; }
        const finalOvertimeCount = hasPreciseConfig ? overtimeSlots.length : Math.max(0, finalWeeklyActual - (existing?.weeklyBasic ?? defaultBasic));
        const validationBalance = finalWeeklyActual + totalReduction - finalOvertimeCount;
        const isBalanced = validationBalance === standardBase;

        // Calculate final payable periods to determine if this row should be visible in filters
        // Add subData.count to the total, subtract leaveDeductionsData.count if not using precise config
        // Note: We no longer rely on manual adjustment for these automatic additions/deductions
        const displayCount = hasPreciseConfig 
            ? Math.max(0, preciseData.netCount + subData.count + (existing?.adjustment || 0))
            : Math.max(0, Math.ceil(Math.max(0, finalWeeklyActual - (existing?.weeklyBasic ?? defaultBasic)) * (existing?.weeksCount ?? calculatedWeeks)) - leaveDeductionsData.count + subData.count + (existing?.adjustment || 0));

        const finalLeaveDeductions = hasPreciseConfig ? preciseData.details : leaveDeductionsData.details;
        const isSubstituteOnly = !hasPreciseConfig && subData.count > 0 && finalOvertimeCount === 0;

        return {
            teacher: t,
            recordId,
            sortOrder: existing?.sortOrder ?? null,
            standardBase, 
            reduction: totalReduction,
            reductionDetails,
            weeklyBasic: existing?.weeklyBasic ?? defaultBasic, 
            weeklyActual: finalWeeklyActual,
            weeksCount: existing?.weeksCount ?? calculatedWeeks,
            adjustment: existing?.adjustment ?? 0,
            adjustmentReason: existing?.adjustmentReason ?? '',
            note: existing?.note ?? '',
            overtimeSlots,
            preciseGross: preciseData.grossCount,
            preciseNet: preciseData.netCount,
            subAdditions: subData, // Store sub details
            hasPreciseConfig,
            leaveDeductions: finalLeaveDeductions,
            isBalanced,
            validationBalance,
            finalOvertimeCount,
            displayCount,
            isSubstituteOnly,
        };
    });
  }, [internalTeachers, overtimeRecords, selectedMonth, calculatedWeeks, leaveRecords, holidays, settings?.semesterStart, settings?.semesterEnd, graduationDate, fixedOvertimeConfig]);

  const compareRowsBySortOrder = (a: typeof rowData[number], b: typeof rowData[number]) => {
      const aSort = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const bSort = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (aSort !== bSort) return aSort - bSort;
      return (a.teacher.name || '').localeCompare((b.teacher.name || ''), 'zh-Hant', { numeric: true });
  };

  const filteredRowData = useMemo(() => {
      let data = rowData;
      // 超鐘點與固定兼課為獨立事件：本清冊只顯示 (1) 本頁點選姓名設定超鐘點週課表者 (2) 當月協助代課的教師
      if (showConfiguredOnly) { 
          data = data.filter(row => 
              row.hasPreciseConfig ||   // 當月在本頁有設超鐘點週課表
              row.subAdditions.count > 0   // 當月有協助代課（代的是超鐘點教師的課）
          ); 
      }
      if (searchTerm) {
          const lower = searchTerm.toLowerCase();
          data = data.filter(row => (row.teacher.name || '').toLowerCase().includes(lower) || (row.teacher.jobTitle || '').toLowerCase().includes(lower) || (row.teacher.teacherRole || '').toLowerCase().includes(lower));
      }
      const baseSorted = [...data].sort(compareRowsBySortOrder);
      const anchoredSubstituteIds = new Set(
          baseSorted
              .filter(row => row.isSubstituteOnly && row.subAdditions.relatedOriginalTeacherIds.length > 0)
              .map(row => row.teacher.id)
      );
      const substituteRowsByOriginal = new Map<string, typeof baseSorted>();

      baseSorted.forEach(row => {
          if (!row.isSubstituteOnly) return;
          row.subAdditions.relatedOriginalTeacherIds.forEach(originalTeacherId => {
              if (!substituteRowsByOriginal.has(originalTeacherId)) {
                  substituteRowsByOriginal.set(originalTeacherId, []);
              }
              substituteRowsByOriginal.get(originalTeacherId)!.push(row);
          });
      });

      const placedIds = new Set<string>();
      const orderedRows: typeof baseSorted = [];

      baseSorted.forEach(row => {
          if (placedIds.has(row.teacher.id) || anchoredSubstituteIds.has(row.teacher.id)) return;
          orderedRows.push(row);
          placedIds.add(row.teacher.id);

          const linkedSubstituteRows = substituteRowsByOriginal.get(row.teacher.id) || [];
          linkedSubstituteRows.forEach(substituteRow => {
              if (placedIds.has(substituteRow.teacher.id)) return;
              orderedRows.push(substituteRow);
              placedIds.add(substituteRow.teacher.id);
          });
      });

      baseSorted.forEach(row => {
          if (placedIds.has(row.teacher.id)) return;
          orderedRows.push(row);
          placedIds.add(row.teacher.id);
      });

      return orderedRows;
  }, [rowData, searchTerm, showConfiguredOnly]);

  const handleCellChange = (teacherId: string, field: keyof OvertimeRecord, value: any) => {
      const recordId = `${selectedMonth}_${teacherId}`;
      const existing = (overtimeRecords || []).find(r => r.id === recordId);
      const teacher = (teachers || []).find(t => t.id === teacherId);
      const numVal = (['weeklyBasic','weeklyActual','weeksCount','adjustment'].includes(field)) ? Number(value) : value;
      
      let baseRecord: OvertimeRecord = existing || { 
          id: recordId, 
          teacherId, 
          yearMonth: selectedMonth, 
          sortOrder: existing?.sortOrder,
          weeklyBasic: teacher ? calculateDefaultBasic(teacher) : 0, 
          weeklyActual: teacher?.defaultSchedule?.length || 0, 
          weeksCount: calculatedWeeks, 
          adjustment: 0, 
          adjustmentReason: '', 
          note: '', 
          updatedAt: Date.now(), 
          overtimeSlots: [] 
      };
      const updatedRecord = { ...baseRecord, [field]: numVal, updatedAt: Date.now() };
      updateOvertimeRecord(updatedRecord);
  };

  const persistRowOrder = async (orderedRows: typeof rowData) => {
      await Promise.all(orderedRows.map((row, index) => {
          const existing = (overtimeRecords || []).find(r => r.id === row.recordId);
          const teacher = (teachers || []).find(t => t.id === row.teacher.id);
          const record: OvertimeRecord = existing || {
              id: row.recordId,
              teacherId: row.teacher.id,
              yearMonth: selectedMonth,
              sortOrder: index,
              weeklyBasic: teacher ? calculateDefaultBasic(teacher) : 0,
              weeklyActual: teacher?.defaultSchedule?.length || 0,
              weeksCount: calculatedWeeks,
              adjustment: 0,
              adjustmentReason: '',
              note: '',
              updatedAt: Date.now(),
              overtimeSlots: []
          };
          return updateOvertimeRecord({
              ...record,
              sortOrder: index,
              updatedAt: Date.now()
          });
      }));
  };

  const buildReorderedRows = (draggedTeacherId: string, targetTeacherId: string) => {
      const fullOrderedRows = [...rowData].sort(compareRowsBySortOrder);
      const visibleIds = new Set(filteredRowData.map(row => row.teacher.id));
      const visibleRows = fullOrderedRows.filter(row => visibleIds.has(row.teacher.id));
      const draggedRow = visibleRows.find(row => row.teacher.id === draggedTeacherId);
      const targetIndex = visibleRows.findIndex(row => row.teacher.id === targetTeacherId);
      if (!draggedRow || targetIndex === -1) return null;

      const reorderedVisibleRows = visibleRows.filter(row => row.teacher.id !== draggedTeacherId);
      reorderedVisibleRows.splice(targetIndex, 0, draggedRow);

      let visiblePointer = 0;
      return fullOrderedRows.map(row => (
          visibleIds.has(row.teacher.id) ? reorderedVisibleRows[visiblePointer++] : row
      ));
  };

  const handleDropRow = async (targetTeacherId: string) => {
      if (isSaving || filteredRowData.length <= 1 || !draggingTeacherId || draggingTeacherId === targetTeacherId) {
          setDraggingTeacherId(null);
          setDragOverTeacherId(null);
          return;
      }

      const mergedRows = buildReorderedRows(draggingTeacherId, targetTeacherId);
      if (!mergedRows) {
          setDraggingTeacherId(null);
          setDragOverTeacherId(null);
          return;
      }

      setIsSaving(true);
      try {
          await persistRowOrder(mergedRows);
      } catch (error) {
          console.error('Failed to save overtime row order', error);
          showModal('排序失敗', '無法儲存超鐘點清冊排序，請稍後再試。', 'error');
      } finally {
          setIsSaving(false);
          setDraggingTeacherId(null);
          setDragOverTeacherId(null);
      }
  };

  const handleSaveSchedule = (slots: { day: number; period: string }[]) => { if (!scheduleModal.teacherId) return; handleCellChange(scheduleModal.teacherId, 'overtimeSlots', slots); };
  const handleResetToSchedule = (teacherId: string) => { const teacher = (teachers || []).find(t => t.id === teacherId); if (teacher?.defaultSchedule) { handleCellChange(teacherId, 'weeklyActual', teacher.defaultSchedule.length); } };
  const handleBatchResetToSchedule = () => { if (!confirm(`確定要將本月 (${selectedMonth}) 所有教師的「實授節數」重設為「預設課表總節數」嗎？\n此操作將覆蓋目前的手動輸入值。`)) return; let updateCount = 0; (internalTeachers || []).forEach(t => { if (t.defaultSchedule && t.defaultSchedule.length > 0) { handleCellChange(t.id, 'weeklyActual', t.defaultSchedule.length); updateCount++; } }); showModal('完成', `已更新 ${updateCount} 位教師的實授節數。`, 'success'); };
  
  const handleLoadFromTeacherDefaults = () => {
    showModal(
        '確認載入',
        `確定要從「教師管理」載入所有教師的預設超鐘點時段到 ${selectedMonth} 嗎？\n這將會覆蓋目前已有的設定。`,
        'warning',
        () => {
            let count = 0;
            (internalTeachers || []).forEach(teacher => {
                if (teacher.defaultOvertimeSlots && teacher.defaultOvertimeSlots.length > 0) {
                    const newRecordId = `${selectedMonth}_${teacher.id}`;
                    const existing = (overtimeRecords || []).find(r => r.id === newRecordId);
                    
                    const newRecord: OvertimeRecord = {
                        id: newRecordId,
                        teacherId: teacher.id,
                        yearMonth: selectedMonth,
                        sortOrder: existing?.sortOrder,
                        weeklyBasic: existing?.weeklyBasic ?? calculateDefaultBasic(teacher),
                        weeklyActual: existing?.weeklyActual ?? (teacher.defaultSchedule?.length || 0),
                        weeksCount: existing?.weeksCount ?? calculatedWeeks,
                        adjustment: existing?.adjustment ?? 0,
                        adjustmentReason: existing?.adjustmentReason ?? '',
                        note: existing?.note ?? '',
                        updatedAt: Date.now(),
                        overtimeSlots: [...teacher.defaultOvertimeSlots!] // Copy from default
                    };
                    updateOvertimeRecord(newRecord);
                    count++;
                }
            });
            
            if (count > 0) {
                showModal('完成', `已成功從教師預設值載入 ${count} 位教師的超鐘點設定。`, 'success');
            } else {
                showModal('無資料', '沒有任何教師設定了「預設超鐘點時段」。請先至「教師管理」頁面設定。', 'warning');
            }
        }
    );
  };

  const handleCopyFromPreviousMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    
    const prevRecords = (overtimeRecords || []).filter(r => r.yearMonth === prevMonthStr);
    
    if (prevRecords.length === 0) {
        showModal('無資料', `找不到 ${prevMonthStr} 的設定資料。`, 'warning');
        return;
    }
    
    if (!confirm(`確定要從 ${prevMonthStr} 複製所有教師的超鐘點設定（含時段與節數）到 ${selectedMonth} 嗎？\n這將會覆蓋目前已有的設定（不包含特殊調整與備註）。`)) {
        return;
    }
    
    let count = 0;
    prevRecords.forEach(prev => {
        const newRecordId = `${selectedMonth}_${prev.teacherId}`;
        const existing = (overtimeRecords || []).find(r => r.id === newRecordId);
        
        const newRecord: OvertimeRecord = {
            ...prev,
            id: newRecordId,
            yearMonth: selectedMonth,
            sortOrder: existing?.sortOrder ?? prev.sortOrder,
            updatedAt: Date.now(),
            // 保留目前的調整與備註
            adjustment: existing?.adjustment ?? 0,
            adjustmentReason: existing?.adjustmentReason ?? '',
            note: existing?.note ?? '',
            // 週數基數應使用新月份的計算值
            weeksCount: calculatedWeeks,
            // 確保深拷貝 overtimeSlots，避免參照污染
            overtimeSlots: prev.overtimeSlots ? [...prev.overtimeSlots] : []
        };
        updateOvertimeRecord(newRecord);
        count++;
    });
    
    showModal('成功', `已從 ${prevMonthStr} 複製 ${count} 位教師的設定。`, 'success');
  };

  const formatExportJobTitle = (teacher: Teacher) => {
      const baseTitle = teacher.jobTitle || teacher.teacherRole || '';
      const classLabel = String(teacher.teachingClasses ?? '').trim();
      const isHomeroomTitle = baseTitle.includes('導師');
      if (!isHomeroomTitle || !classLabel) return baseTitle;
      return classLabel;
  };

  // Fixed Export Function with Fallback Link and Filter logic
  const handleExportExcel = async () => {
      if (!settings?.gasWebAppUrl) { showModal('錯誤', '請先設定 GAS URL', 'error'); return; }
      
      // Filter out records with no overtime payment (> 0)
      const exportableData = filteredRowData.filter(row => row.displayCount > 0);

      if (exportableData.length === 0) { showModal('無資料', '沒有需要支付超鐘點費的教師資料可匯出', 'warning'); return; }
      
      setIsGenerating(true);
      try {
          const [year, month] = selectedMonth.split('-').map(Number);
          
          const reportPayload = exportableData.map(row => {
              // Convert Overtime Slots to Mon-Fri counts for Precise Mode
              const periods = [0, 0, 0, 0, 0];
              
              if (row.hasPreciseConfig) {
                  row.overtimeSlots.forEach(s => {
                      if (s.day >= 1 && s.day <= 5) periods[s.day - 1]++;
                  });
              } 
              // Note: For Simple Mode, the backend uses 'weeklyOvertime' directly if flags set correctly, 
              // but we send periods array anyway as backup for patterns.
              
              // Reduction Details Text
              const reductionDetail = (row.teacher.reductions || []).map(r => `${r.title}(${r.periods})`).join('、');
              
              // Slot Details Text
              const slotDetail = row.hasPreciseConfig ? row.overtimeSlots.map(s => {
                  const dayName = ['一','二','三','四','五'][s.day-1];
                  return `週${dayName}${s.period}`;
              }).join('、') : '';

              const remarks = [
                  row.adjustmentReason,
                  ...(row.leaveDeductions || []),
                  ...((row.subAdditions && row.subAdditions.details) || [])
              ].filter(Boolean).join('；');

              return {
                  teacherId: row.teacher.id,
                  teacherName: row.teacher.name,
                  jobTitle: formatExportJobTitle(row.teacher),
                  payablePeriods: row.displayCount,
                  remarks,
                  isSubstituteOnly: row.isSubstituteOnly,
                  substituteSessionsByDate: row.subAdditions?.sessionsByDate || [],
                  
                  // Columns C, D, E, F
                  standard: row.standardBase,
                  weeklyActual: row.weeklyActual,
                  adminReduction: row.reduction,
                  weeklyOvertime: row.hasPreciseConfig ? row.overtimeSlots.length : Math.max(0, row.weeklyActual - row.weeklyBasic),
                  
                  // Mode Flag
                  isSimpleMode: !row.hasPreciseConfig,
                  
                  // Precise Mode Data
                  overtimePattern: periods, // [1, 0, 1, 0, 0]
                  
                  // Adjustment & Reason
                  adjustment: row.adjustment,
                  adjustmentReason: row.adjustmentReason + 
                      (row.leaveDeductions ? " " + row.leaveDeductions.join(' ') : "") + 
                      (row.subAdditions && row.subAdditions.details.length > 0 ? " " + row.subAdditions.details.join(' ') : ""),
                  
                  // Text Fields for P & Q columns
                  reductionDetail: reductionDetail,
                  slotDetail: slotDetail
              };
          });

          // Call the NEW API action for Overtime Report
          const result = await callGasApi(settings!.gasWebAppUrl, 'GENERATE_OVERTIME_REPORT', { 
              year, 
              month, 
              reportData: reportPayload,
              semesterStart: settings?.semesterStart,
              semesterEnd: settings?.semesterEnd,
              docNumber: docNumber, // Pass document number
              holidays: holidays // New: Pass holidays from store
          });
          
          if (result.status === 'success' && result.data.url) {
              const url = result.data.url;
              const win = window.open(url, '_blank');
              if (win) {
                  showModal('成功', 'Excel 清冊已產生並開啟。', 'success');
              } else {
                  setModal({
                      isOpen: true,
                      title: '成功',
                      type: 'success',
                      mode: 'alert',
                      message: (
                          <div>
                              <p className="mb-2">Excel 清冊已產生，但瀏覽器攔截了自動開啟視窗。</p>
                              <a href={url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-bold bg-indigo-50 px-3 py-2 rounded-lg block text-center">點擊此處下載檔案</a>
                          </div>
                      )
                  });
              }
          } else { 
              throw new Error(result.message || '產生失敗'); 
          }
      } catch (e: any) { 
          showModal('失敗', e.message, 'error'); 
      } finally { 
          setIsGenerating(false); 
      }
  };

  const grandTotal = filteredRowData.reduce((sum, row) => {
      // Use pre-calculated displayCount
      return sum + Math.round(row.displayCount * HOURLY_RATE);
  }, 0);

  const activeTeacher = useMemo(() => (teachers || []).find(t => t.id === scheduleModal.teacherId), [teachers, scheduleModal.teacherId]);
  const activeRecord = useMemo(() => (overtimeRecords || []).find(r => r.id === `${selectedMonth}_${scheduleModal.teacherId}`) || { id: '', teacherId: '', yearMonth: selectedMonth, sortOrder: undefined, weeklyBasic: 0, weeklyActual: 0, weeksCount: 0, adjustment: 0, adjustmentReason: '', note: '', updatedAt: 0, overtimeSlots: [] }, [overtimeRecords, selectedMonth, scheduleModal.teacherId]);

  return (
    <div className="p-8 pb-20">
      <Modal 
        isOpen={modal.isOpen} 
        onClose={() => setModal({...modal, isOpen: false})} 
        title={modal.title} 
        message={modal.message} 
        type={modal.type} 
        mode={modal.mode}
        onConfirm={modal.onConfirm ? () => { modal.onConfirm!(); setModal({...modal, isOpen: false}); } : undefined}
      />
      {activeTeacher && <OvertimeScheduleModal isOpen={scheduleModal.isOpen} onClose={() => setScheduleModal({ ...scheduleModal, isOpen: false })} teacher={activeTeacher} record={activeRecord} onSave={handleSaveSchedule} />}
      <OvertimeStatsModal isOpen={showStatsModal} onClose={() => setShowStatsModal(false)} data={filteredRowData} month={selectedMonth} grandTotal={grandTotal} />

      <header className="mb-6 flex justify-between items-end">
        <div>
           <h1 className="text-3xl font-bold text-slate-800 flex items-center"><Coins className="mr-3 text-amber-500" /> 超鐘點計算清冊</h1>
           <p className="text-slate-500 mt-2">清冊僅顯示：本頁點選姓名設定超鐘點週課表者、以及當月協助代課的教師（固定兼課為獨立清冊）。依據台灣日曆精確計算每月上班日。<br/><span className="text-rose-500 font-bold">注意：超鐘點計算不受國定假日影響，僅排除非學期日與畢業後日期。</span></p>
        </div>
        <div className="flex items-center space-x-4">
             <div className="flex items-center bg-white border border-slate-300 rounded-lg shadow-sm">
                <button onClick={() => handleMonthChange('prev')} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 border-r border-slate-200"><ChevronLeft size={20} /></button>
                <div className="px-4 py-2 flex items-center font-bold text-slate-700 min-w-[140px] justify-center text-lg"><Calendar size={20} className="text-slate-400 mr-2" />{selectedMonth}</div>
                <button onClick={() => handleMonthChange('next')} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 border-l border-slate-200"><ChevronRight size={20} /></button>
            </div>
            <div className="bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-200 flex items-center space-x-4">
                <div>
                    <span className="text-xs text-indigo-600 font-bold uppercase block">超鐘點人數</span>
                    <div className="flex items-center">
                        <Users size={18} className="text-indigo-500 mr-2"/>
                        <span className="text-xl font-bold text-indigo-700">{filteredRowData.filter(r => r.displayCount > 0).length}</span>
                        <span className="text-xs text-indigo-500 ml-1 font-bold">人</span>
                    </div>
                </div>
                <div className="w-px h-8 bg-indigo-200"></div>
                <div>
                    <span className="text-xs text-indigo-600 font-bold uppercase block">本月總支出預估</span>
                    <span className="text-xl font-bold text-indigo-700">${grandTotal.toLocaleString()}</span>
                </div>
            </div>
        </div>
      </header>

      <InstructionPanel title="使用說明：超鐘點計算清冊" isOpenDefault={false}>
        <div className="space-y-1">
          <CollapsibleItem title="節數計算細節">
            <div className="space-y-3 text-xs text-slate-600">
              <div>
                <p className="font-bold text-slate-700 mb-1">一、名詞與關係</p>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li><strong>法定節數</strong>：依職別（主任 1、組長 9、導師 16、專任/科任 20）。</li>
                  <li><strong>減授節數</strong>：行政或職務減授（如組長、主任）。</li>
                  <li><strong>基本節數</strong> = 法定節數 − 減授節數。</li>
                  <li><strong>每週實授</strong>：該教師每週實際排課節數（可從預設課表帶入或手動輸入）。</li>
                  <li><strong>每週超鐘點</strong> = 每週實授 − 基本節數（或精確模式下＝設定的超鐘點時段數/週）。</li>
                  <li><strong>計算週數</strong>：當月學期內工作日 ÷ 5（可手動微調）。</li>
                </ul>
              </div>
              <div>
                <p className="font-bold text-slate-700 mb-1">二、節數結構檢核</p>
                <p className="ml-1 font-mono bg-slate-100 px-2 py-1 rounded">實授 ＋ 減授 − 超鐘點 ＝ 法定節數</p>
                <p className="ml-1 mt-1">若不等於法定節數，該列會顯示紅色警示，請檢查實授或減授是否正確。</p>
              </div>
              <div>
                <p className="font-bold text-slate-700 mb-1">三、精確模式（有設超鐘點週課表）</p>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li>系統依當月日曆掃描，只計學期內、週一～五，且僅計您設定的時段（如「週五第4節」）。</li>
                  <li><strong>粗節數</strong>：符合「週幾＋第幾節」的當月總次數。</li>
                  <li><strong>扣除</strong>：該時段若為請假則不計；六年級導師於畢業典禮日後之該時段亦不計。</li>
                  <li><strong>淨節數</strong> = 粗節數 − 請假扣除（− 畢業後扣除）。</li>
                  <li><strong>應發節數</strong> = 淨節數 ＋ 代課加計 ＋ 手動調整（可為負數）。</li>
                </ul>
              </div>
              <div>
                <p className="font-bold text-slate-700 mb-1">四、概算模式（未設週課表）</p>
                <p className="ml-1">應發節數 ＝ 無條件進位(每週超鐘點 × 計算週數) − 請假扣除節數 ＋ 代課加計 ＋ 手動調整。</p>
              </div>
              <div>
                <p className="font-bold text-slate-700 mb-1">五、代課加計與其他規則</p>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li><strong>代課加計</strong>：當月代「有設超鐘點」教師的課，且該代課為<strong>鐘點費</strong>才計入；若為日薪代課則不另計超鐘點。</li>
                  <li><strong>請假扣除</strong>：本人請假當日之超鐘點時段不計入應發。</li>
                  <li><strong>金額</strong>：應發節數 × 鐘點費單價（405 元/節），四捨五入後加總。</li>
                </ul>
              </div>
            </div>
          </CollapsibleItem>
          <CollapsibleItem title="功能概述">
            <p>依據教師的「基本授課節數」與「實際授課節數」計算超鐘點費。系統會自動抓取教師課表並比對其職別的法定節數。</p>
          </CollapsibleItem>
          <CollapsibleItem title="設定模式：精確模式 (推薦)">
            <p>點擊教師姓名，設定每週固定的超鐘點時段 (如週五第4節)。系統會自動掃描該月日曆，扣除請假、國定假日與非學期日。</p>
          </CollapsibleItem>
          <CollapsibleItem title="設定模式：概算模式">
            <p>直接輸入「每週超授節數」與「計算週數」，適用於快速核對或特殊情況。</p>
          </CollapsibleItem>
          <CollapsibleItem title="減授設定">
            <p>點擊「減授節數」欄位的設定按鈕，可輸入行政或職務減授，系統會自動更新基本節數。</p>
          </CollapsibleItem>
          <CollapsibleItem title="匯出報表">
            <p>設定完成後，可匯出 Excel 清冊或列印檢核報表。建議先點擊「統計總表」確認總額後再匯出。</p>
          </CollapsibleItem>
        </div>
      </InstructionPanel>

      {graduationDate && (<div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2 flex items-center text-sm text-indigo-800"><Flag size={16} className="mr-2 text-indigo-600"/>本學期畢業典禮：<span className="font-bold mx-1">{graduationDate}</span>。六年級導師於該日後之超鐘點將自動扣除。</div>)}

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 shadow-sm flex flex-wrap items-center gap-4">
          <div className="flex items-center text-sm font-bold text-slate-700 border-r pr-4 border-slate-200"><Info size={16} className="mr-2 text-indigo-500"/>本月平日統計 (含國定假日，僅排除非學期日)</div>
          <div className="flex gap-2">{['一','二','三','四','五'].map((d, i) => (<div key={d} className="px-3 py-1 bg-slate-100 rounded text-xs font-medium text-slate-600">週{d}: <span className="font-bold text-indigo-600 text-sm ml-1">{monthWeekdayCounts[i]}</span> 次</div>))}</div>
          <div className="ml-auto text-xs text-slate-400">總工作日: {totalWorkingDays} 天 / 平均週數: {calculatedWeeks} 週</div>
      </div>

      <div className="mb-4 flex flex-col xl:flex-row gap-4">
          <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input type="text" placeholder="搜尋教師姓名或職務..." className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          
          <div className="flex flex-wrap gap-2 items-center justify-end">
              {/* Doc Number Input */}
              <div className="flex items-center mr-2">
                  <span className="text-sm font-bold text-slate-600 mr-2 whitespace-nowrap">文號:</span>
                  <input type="text" className="border border-slate-300 rounded px-2 py-2 text-sm w-32 md:w-40" placeholder="例: 高市教小字第..." value={docNumber} onChange={e => setDocNumber(e.target.value)} />
              </div>

              {/* Export Button */}
              <button onClick={handleExportExcel} disabled={isGenerating} className="px-3 py-2.5 rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-700 font-bold flex items-center hover:bg-cyan-100 transition-colors shadow-sm disabled:opacity-50 whitespace-nowrap">
                  {isGenerating ? <Loader2 size={18} className="animate-spin mr-2"/> : <FileOutput size={18} className="mr-2"/>}
                  匯出清冊
              </button>

              <button onClick={() => setShowStatsModal(true)} className="px-3 py-2.5 rounded-lg border border-teal-200 bg-teal-50 text-teal-700 font-bold flex items-center hover:bg-teal-100 transition-colors whitespace-nowrap" title="預覽並列印檢核報表"><FileText size={18} className="mr-2"/>檢核表</button>
              <button onClick={handleBatchResetToSchedule} className="px-3 py-2.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 font-bold flex items-center hover:bg-indigo-100 transition-colors whitespace-nowrap" title="將所有教師的「實授節數」強制重設為其預設課表總數"><ArrowDownToLine size={18} className="mr-2"/>匯入預設</button>
              <button onClick={handleLoadFromTeacherDefaults} className="px-3 py-2.5 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 font-bold flex items-center hover:bg-purple-100 transition-colors whitespace-nowrap" title="從「教師管理」載入預設超鐘點時段"><RefreshCw size={18} className="mr-2"/>載入設定</button>
              <button onClick={handleCopyFromPreviousMonth} className="px-3 py-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 font-bold flex items-center hover:bg-amber-100 transition-colors whitespace-nowrap" title="從上個月複製所有教師的超鐘點時段設定"><Copy size={18} className="mr-2"/>複製上月</button>
              <button onClick={() => setShowConfiguredOnly(!showConfiguredOnly)} className={`px-3 py-2.5 rounded-lg border font-bold flex items-center transition-colors whitespace-nowrap ${showConfiguredOnly ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}><Filter size={18} className="mr-2"/>{showConfiguredOnly ? '僅顯示超鐘點' : '顯示全部'}</button>
          </div>
      </div>
      <div className="mb-3 text-xs text-slate-500">
          拖曳每列右側把手即可調整清冊順序，排序會自動儲存。
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
         <div className="overflow-x-auto">
             <table className="w-full text-left whitespace-nowrap">
                 <thead className="bg-slate-50 border-b border-slate-200">
                     <tr>
                         <th className="px-4 py-3 font-semibold text-slate-700 w-40">教師姓名 / 職別</th>
                         <th className="px-2 py-3 font-semibold text-slate-700 text-center w-16 text-xs text-slate-500">法定<br/>節數</th>
                         <th className="px-2 py-3 font-semibold text-slate-700 text-center w-16 text-xs text-slate-500">減授<br/>節數</th>
                         <th className="px-2 py-3 font-semibold text-slate-700 text-center w-24">每週超鐘點<br/><span className="text-[10px] font-normal">(設定值)</span></th>
                         <th className="px-2 py-3 font-semibold text-slate-700 text-center w-20">計算週數</th>
                         <th className="px-2 py-3 font-semibold text-slate-700 text-center w-24 bg-indigo-50/50">實際應發<br/><span className="text-[10px] font-normal">(總節數)</span></th>
                         <th className="px-2 py-3 font-semibold text-slate-700 text-center w-32 bg-amber-50/50">特殊調整<br/><span className="text-[10px] font-normal">(總節數)</span></th>
                         <th className="px-4 py-3 font-semibold text-slate-700 w-48">備註 / 扣除紀錄</th>
                         <th className="px-4 py-3 font-semibold text-slate-700 text-right w-32">金額</th>
                         <th className="px-4 py-3 font-semibold text-slate-700 text-center w-28">拖曳 / 操作</th>
                     </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                     {filteredRowData.map((row, index) => {
                         const onlySubstitute = !row.hasPreciseConfig && row.subAdditions.count > 0 && row.finalOvertimeCount === 0;
                         let calcMethod = ''; 
                         if (row.hasPreciseConfig) { calcMethod = 'precise'; } 
                         else if (!onlySubstitute) { calcMethod = 'simple'; }
                         const totalPay = Math.round(row.displayCount * HOURLY_RATE);
                         const isGraduating = row.teacher.isGraduatingHomeroom;
                         const isHomeroom = row.teacher.isHomeroom || (row.teacher.teacherRole && row.teacher.teacherRole.includes('導師')) || (row.teacher.jobTitle && row.teacher.jobTitle.includes('導師'));

                         return (
                            <tr
                                key={row.teacher.id}
                                onDragOver={(e) => {
                                    if (!draggingTeacherId || draggingTeacherId === row.teacher.id) return;
                                    e.preventDefault();
                                    setDragOverTeacherId(row.teacher.id);
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    handleDropRow(row.teacher.id);
                                }}
                                className={`transition-colors ${draggingTeacherId === row.teacher.id ? 'opacity-50 bg-indigo-50' : dragOverTeacherId === row.teacher.id ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-300' : 'hover:bg-slate-50'}`}
                            >
                                 <td className="px-4 py-3 group cursor-pointer" onClick={() => !onlySubstitute && setScheduleModal({ isOpen: true, teacherId: row.teacher.id })}>
                                     <div className="font-bold text-indigo-700 group-hover:text-indigo-900 flex items-center underline decoration-dotted decoration-indigo-300 underline-offset-4">{row.teacher.name}{isGraduating && <span title="畢業班導師" className="flex items-center ml-2 text-blue-500"><GraduationCap size={14} /></span>}{!onlySubstitute && <Clock size={14} className="ml-2 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"/>}</div>
                                     <div className="text-xs text-slate-500 mt-1 flex items-center"><span>{row.teacher.teacherRole || row.teacher.jobTitle || '一般教師'}</span>{isHomeroom && row.teacher.teachingClasses && (<span className="ml-2 bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-mono">{row.teacher.teachingClasses}</span>)}</div>
                                 </td>
                                 <td className="px-2 py-3 text-center text-slate-500 text-sm">{row.standardBase}</td>
                                 <td className="px-2 py-3 text-center">
                                     {row.reduction > 0 ? (
                                         <span className="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-white border border-amber-300 text-amber-700">
                                             {row.reduction} <span className="ml-1 text-[10px] opacity-70">節</span>
                                         </span>
                                     ) : (
                                         <span className="text-slate-300 text-xs">-</span>
                                     )}
                                 </td>
                                 <td className="px-2 py-3 text-center relative">
                                     {onlySubstitute ? (
                                         <span className="text-slate-300 text-xs">—</span>
                                     ) : row.hasPreciseConfig ? (<span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-xs font-bold block w-full cursor-pointer hover:bg-amber-200" onClick={() => setScheduleModal({ isOpen: true, teacherId: row.teacher.id })}>{row.overtimeSlots.length} 節/週</span>) : (<div className="flex flex-col items-center"><div className="flex items-center text-xs"><input type="number" className="w-10 text-center border border-slate-200 rounded py-0.5 mx-1" value={row.weeklyActual} onChange={(e) => handleCellChange(row.teacher.id, 'weeklyActual', e.target.value)} /><button onClick={() => handleResetToSchedule(row.teacher.id)} className="text-slate-400 hover:text-indigo-500 p-0.5" title="從預設課表重算"><RefreshCcw size={10}/></button><span className="text-slate-400 ml-1">- {row.weeklyBasic}</span></div><span className="text-[9px] text-slate-400 mt-1">實授 - 基本</span></div>)}
                                     {!onlySubstitute && !row.isBalanced && (<div className="absolute top-1 right-1 text-rose-500 group relative cursor-help"><AlertTriangle size={14} /><div className="absolute z-10 hidden group-hover:block bg-slate-800 text-white text-xs p-2 rounded shadow-lg -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap"><div className="font-bold mb-1 text-rose-300">節數檢核異常</div><div>實授({row.weeklyActual}) + 減授({row.reduction}) - 超鐘({row.finalOvertimeCount}) ≠ 法定({row.standardBase})</div><div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div></div></div>)}
                                 </td>
                                 <td className="px-2 py-3 text-center">{onlySubstitute ? (<span className="text-slate-300 text-xs">—</span>) : row.hasPreciseConfig ? (<span className="text-xs text-slate-300">-</span>) : (<input type="number" step="0.1" className="w-14 text-center border border-slate-200 rounded py-1 text-slate-700" value={row.weeksCount} onChange={(e) => handleCellChange(row.teacher.id, 'weeksCount', e.target.value)} />)}</td>
                                 <td className="px-2 py-3 text-center bg-indigo-50/20"><span className="font-bold text-lg text-indigo-700">{row.displayCount}</span><div className="text-[9px] text-slate-400">{onlySubstitute ? '代課加計' : calcMethod === 'precise' ? `日曆累計 (共${row.preciseGross}節)` : `概算 (x${row.weeksCount}週)`}</div></td>
                                 <td className="px-2 py-3 text-center bg-amber-50/20"><input type="number" className="w-16 text-center border border-amber-200 rounded py-1 focus:ring-2 focus:ring-amber-500 outline-none text-amber-700 font-medium" placeholder="0" value={row.adjustment} onChange={(e) => handleCellChange(row.teacher.id, 'adjustment', e.target.value)} /></td>
                                 <td className="px-4 py-3"><div className="flex flex-col space-y-1"><input type="text" className="w-full text-xs border border-slate-200 rounded px-2 py-1 placeholder-slate-300" placeholder="手動調整原因..." value={row.adjustmentReason} onChange={(e) => handleCellChange(row.teacher.id, 'adjustmentReason', e.target.value)} />{row.leaveDeductions && row.leaveDeductions.length > 0 && (<div className="text-[10px] text-rose-500 bg-rose-50 p-1 rounded mt-1">{row.leaveDeductions.map((d, i) => (<div key={i}>- {d}</div>))}</div>)}{row.subAdditions && row.subAdditions.details.length > 0 && (<div className="text-[10px] text-emerald-600 bg-emerald-50 p-1 rounded mt-1">{row.subAdditions.details.map((d, i) => (<div key={i}>+ {d}</div>))}</div>)}</div></td>
                                 <td className="px-4 py-3 text-right"><div className="font-bold text-slate-800">${totalPay.toLocaleString()}</div></td>
                                 <td className="px-4 py-3 text-center">
                                     <div className="flex items-center justify-center gap-1">
                                         <button
                                             type="button"
                                             draggable={!isSaving}
                                             onDragStart={(e) => {
                                                 setDraggingTeacherId(row.teacher.id);
                                                 setDragOverTeacherId(row.teacher.id);
                                                 e.dataTransfer.effectAllowed = 'move';
                                                 e.dataTransfer.setData('text/plain', row.teacher.id);
                                             }}
                                             onDragEnd={() => {
                                                 setDraggingTeacherId(null);
                                                 setDragOverTeacherId(null);
                                             }}
                                             disabled={isSaving || filteredRowData.length <= 1}
                                             className="text-slate-400 hover:text-indigo-600 p-1 cursor-grab active:cursor-grabbing disabled:text-slate-200 disabled:cursor-not-allowed"
                                             title="拖曳排序"
                                         >
                                             <GripVertical size={16} />
                                         </button>
                                         {onlySubstitute ? (
                                             <span className="text-slate-300 px-1">—</span>
                                         ) : (
                                             <button 
                                                 onClick={() => handleResetToSchedule(row.teacher.id)} 
                                                 className="text-slate-400 hover:text-indigo-600 p-1"
                                                 title="重設為預設課表"
                                             >
                                                 <RefreshCw size={16} />
                                             </button>
                                         )}
                                     </div>
                                 </td>
                             </tr>
                         );
                     })}
                     {filteredRowData.length === 0 && (<tr><td colSpan={10} className="py-12 text-center text-slate-400">{showConfiguredOnly ? <div><p className="mb-2">目前清冊中無符合條件的教師（需為：本頁已設超鐘點週課表、或當月有協助代課者）。</p><button onClick={() => setShowConfiguredOnly(false)} className="text-indigo-600 underline hover:text-indigo-800">顯示全部教師以進行設定</button></div> : (searchTerm ? '找不到符合搜尋條件的教師' : '尚無校內教師資料。請先至「教師管理」新增類別為「校內教師」的人員。')}</td></tr>)}
                 </tbody>
             </table>
         </div>
      </div>
    </div>
  );
};

export default Overtime;
