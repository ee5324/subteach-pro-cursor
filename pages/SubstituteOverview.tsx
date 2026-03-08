
import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, User, ArrowRight, BookOpen } from 'lucide-react';
import { TeacherType } from '../types';
import InstructionPanel from '../components/InstructionPanel';

const PERIOD_ROWS = [
  { id: '早', label: '早自習' },
  { id: '1', label: '第一節' },
  { id: '2', label: '第二節' },
  { id: '3', label: '第三節' },
  { id: '4', label: '第四節' },
  { id: '午', label: '午休' },
  { id: '5', label: '第五節' },
  { id: '6', label: '第六節' },
  { id: '7', label: '第七節' },
];

// Helper: Get Week Days
const getWeekDays = (baseDate: Date) => {
    const d = new Date(baseDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    
    const days = [];
    for (let i = 0; i < 5; i++) {
        const temp = new Date(monday);
        temp.setDate(monday.getDate() + i);
        const y = temp.getFullYear();
        const m = String(temp.getMonth() + 1).padStart(2, '0');
        const dayStr = String(temp.getDate()).padStart(2, '0');
        days.push({
            dateStr: `${y}-${m}-${dayStr}`,
            label: `${Number(m)}/${Number(dayStr)}`,
            dayName: ['週一', '週二', '週三', '週四', '週五'][i]
        });
    }
    return days;
};

const SubstituteOverview: React.FC = () => {
    const { records, teachers, holidays } = useAppStore();
    const [viewDate, setViewDate] = useState(new Date());

    const currentWeekDays = useMemo(() => getWeekDays(viewDate), [viewDate]);

    // Build the Grid Data
    // Map<"Date_Period", Array<SlotInfo>>
    const scheduleData = useMemo(() => {
        const map = new Map<string, any[]>();
        
        records.forEach(record => {
            if (!record.slots) return;
            record.slots.forEach(slot => {
                const key = `${slot.date}_${slot.period}`;
                if (!map.has(key)) map.set(key, []);
                
                const originalTeacher = teachers.find(t => t.id === record.originalTeacherId);
                const subTeacher = teachers.find(t => t.id === slot.substituteTeacherId);
                
                map.get(key)?.push({
                    originalName: originalTeacher?.name || record.originalTeacherId,
                    subName: subTeacher?.name || slot.substituteTeacherId || '待聘',
                    subject: slot.subject,
                    className: slot.className,
                    isPending: !slot.substituteTeacherId,
                    payType: slot.payType,
                    reason: record.reason
                });
            });
        });
        return map;
    }, [records, teachers]);

    const handleWeekNav = (direction: 'prev' | 'next') => {
        const newDate = new Date(viewDate);
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
        setViewDate(newDate);
    };

    const handleToday = () => setViewDate(new Date());

    return (
        <div className="p-8 h-full flex flex-col">
            <header className="mb-6 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 flex items-center">
                        <CalendarIcon className="mr-3 text-indigo-600" />
                        代課資料總表
                    </h1>
                    <p className="text-slate-500 mt-2">
                        以週課表形式檢視全校代課狀況，掌握實際派代情形。
                    </p>
                </div>
                
                <div className="flex items-center space-x-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                    <button onClick={() => handleWeekNav('prev')} className="p-2 hover:bg-slate-100 rounded text-slate-600">
                        <ChevronLeft size={20} />
                    </button>
                    <div className="px-4 font-bold text-slate-700 min-w-[140px] text-center flex items-center justify-center cursor-pointer hover:bg-slate-50 rounded py-1" onClick={handleToday} title="回到本週">
                        {currentWeekDays[0].label} ~ {currentWeekDays[4].label}
                    </div>
                    <button onClick={() => handleWeekNav('next')} className="p-2 hover:bg-slate-100 rounded text-slate-600">
                        <ChevronRight size={20} />
                    </button>
                </div>
            </header>

            <InstructionPanel title="使用說明：代課資料總表">
                <ul className="list-disc pl-5 space-y-1">
                    <li><strong>週課表檢視：</strong>此頁面以「週」為單位，顯示全校的代課情形。</li>
                    <li><strong>狀態識別：</strong>
                        <ul className="list-circle pl-5 mt-1 text-slate-500">
                            <li><span className="text-emerald-600 font-bold">綠色文字</span>：已安排代課教師。</li>
                            <li><span className="text-red-600 font-bold">紅色區塊</span>：尚未安排代課教師 (待聘)。</li>
                            <li><span className="bg-amber-100 text-amber-700 px-1 rounded text-xs">日薪</span>：標示為日薪制的代課紀錄。</li>
                        </ul>
                    </li>
                    <li><strong>詳細資訊：</strong>滑鼠游標停留在代課卡片上，可查看請假事由與詳細狀態。</li>
                </ul>
            </InstructionPanel>

            <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="overflow-auto flex-1">
                    <table className="w-full border-collapse text-left min-w-[1000px]">
                        <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-3 border-b border-r border-slate-200 w-24 text-center text-slate-500 font-bold bg-slate-50">節次</th>
                                {currentWeekDays.map(day => (
                                    <th key={day.dateStr} className={`p-3 border-b border-r border-slate-200 text-center min-w-[180px] ${holidays.includes(day.dateStr) ? 'bg-rose-50' : ''}`}>
                                        <div className={`font-bold ${holidays.includes(day.dateStr) ? 'text-rose-600' : 'text-slate-700'}`}>
                                            {day.dayName}
                                        </div>
                                        <div className="text-xs text-slate-400 font-medium">{day.label}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {PERIOD_ROWS.map(period => (
                                <tr key={period.id}>
                                    <td className="p-3 border-r border-slate-200 text-center font-bold text-slate-600 text-sm bg-slate-50/50 sticky left-0">
                                        {period.label}
                                    </td>
                                    {currentWeekDays.map(day => {
                                        const key = `${day.dateStr}_${period.id}`;
                                        const items = scheduleData.get(key) || [];
                                        const isHoliday = holidays.includes(day.dateStr);

                                        return (
                                            <td key={key} className={`p-2 border-r border-slate-100 align-top h-24 ${isHoliday ? 'bg-rose-50/30' : 'hover:bg-slate-50'} transition-colors`}>
                                                <div className="flex flex-col gap-2">
                                                    {items.map((item, idx) => (
                                                        <div 
                                                            key={idx} 
                                                            className={`
                                                                rounded-lg p-2 text-xs border shadow-sm relative group
                                                                ${item.isPending 
                                                                    ? 'bg-red-50 border-red-200' 
                                                                    : 'bg-white border-indigo-100 hover:border-indigo-300'}
                                                            `}
                                                        >
                                                            {/* Header: Original -> Sub */}
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="font-bold text-slate-700 truncate max-w-[45%] text-[11px]" title={item.originalName}>{item.originalName}</span>
                                                                <ArrowRight size={10} className="text-slate-300 shrink-0 mx-1" />
                                                                <span className={`font-bold truncate max-w-[45%] text-[11px] ${item.isPending ? 'text-red-600' : 'text-emerald-600'}`} title={item.subName}>
                                                                    {item.subName}
                                                                </span>
                                                            </div>
                                                            
                                                            {/* Body: Subject & Class */}
                                                            <div className="flex items-center text-slate-500 mb-0.5">
                                                                <BookOpen size={10} className="mr-1" />
                                                                <span className="truncate">{item.subject}</span>
                                                                <span className="mx-1">|</span>
                                                                <span className="truncate">{item.className}</span>
                                                            </div>

                                                            {/* Footer: PayType Badge */}
                                                            {item.payType === '日薪' && (
                                                                <span className="absolute top-0 right-0 bg-amber-100 text-amber-700 text-[9px] px-1 rounded-bl-md font-bold">
                                                                    日薪
                                                                </span>
                                                            )}
                                                            
                                                            {/* Tooltip on Hover */}
                                                            <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block w-48 bg-slate-800 text-white text-[10px] p-2 rounded shadow-xl z-20 pointer-events-none">
                                                                <div>事由: {item.reason}</div>
                                                                <div>狀態: {item.isPending ? '待聘中' : '已安排'}</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default SubstituteOverview;
