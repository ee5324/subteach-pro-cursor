
import React, { useMemo } from 'react';
import { X, Printer, Calendar, AlertCircle, Download } from 'lucide-react';
import { parseLocalDate } from '../utils/calculations';

export interface ScheduleItem {
  date: string;
  period: string;
  subject: string;
  className: string;
  reason?: string;
  payType?: string;
}

export interface ScheduleGroup {
  title: string;
  items: ScheduleItem[];
}

interface WeeklyScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: ScheduleGroup[];
  defaultDate?: string;
}

const PERIOD_ORDER = ['早', '1', '2', '3', '4', '午', '5', '6', '7'];
const PERIOD_LABELS: Record<string, string> = {
  '早': '早自習',
  '1': '第一節',
  '2': '第二節',
  '3': '第三節',
  '4': '第四節',
  '午': '午休',
  '5': '第五節',
  '6': '第六節',
  '7': '第七節'
};

const WeeklyScheduleModal: React.FC<WeeklyScheduleModalProps> = ({
  isOpen,
  onClose,
  groups
}) => {
  
  // Logic: Split items by Week (Monday)
  const processedGroups = useMemo(() => {
      if (!groups || !Array.isArray(groups)) return [];

      return groups.map(group => {
          // Bucket items by Monday Timestamp
          const itemsByWeek: Record<number, ScheduleItem[]> = {};
          
          if (group.items && Array.isArray(group.items)) {
            group.items.forEach(item => {
                try {
                  // Use safe parse
                  const date = parseLocalDate(item.date);
                  if (isNaN(date.getTime())) return; // Skip invalid dates

                  // Calculate Monday of that week
                  const day = date.getDay();
                  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
                  const monday = new Date(date);
                  monday.setDate(diff);
                  // Normalize time to avoid sub-day differences
                  monday.setHours(12, 0, 0, 0); 
                  
                  const key = monday.getTime();
                  if (!itemsByWeek[key]) itemsByWeek[key] = [];
                  itemsByWeek[key].push(item);
                } catch (e) {
                  console.warn("Date parsing error for item:", item, e);
                }
            });
          }

          // Convert to sorted array of weeks
          const weeks = Object.keys(itemsByWeek)
              .map(k => Number(k))
              .sort((a, b) => a - b)
              .map(timestamp => {
                  const monday = new Date(timestamp);
                  return {
                      monday: monday,
                      items: itemsByWeek[timestamp] || []
                  };
              });

          return {
              ...group,
              weeks
          };
      });
  }, [groups, isOpen]);

  const handlePrint = () => {
    window.print();
  };

  // Prevent rendering if not open to save resources
  if (!isOpen) return null;

  // Helper to generate the 5 days string for header
  const getWeekRangeStr = (monday: Date) => {
      try {
        const friday = new Date(monday);
        friday.setDate(monday.getDate() + 4);
        
        const mStr = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
        const fStr = `${friday.getFullYear()}-${String(friday.getMonth()+1).padStart(2,'0')}-${String(friday.getDate()).padStart(2,'0')}`;
        return `${mStr} ~ ${fStr}`;
      } catch (e) {
        return "日期計算錯誤";
      }
  };

  // Helper to get array of dates for table header
  const getWeekDates = (monday: Date) => {
      const dates = [];
      for(let i=0; i<5; i++){
          const d = new Date(monday);
          d.setDate(monday.getDate() + i);
          dates.push(d);
      }
      return dates;
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header - No Print */}
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 no-print flex-shrink-0">
          <div>
            <h3 className="text-xl font-bold text-slate-800 flex items-center">
               <Calendar className="mr-2 text-indigo-600"/> 待聘課表預覽
            </h3>
            <p className="text-sm text-slate-500 mt-1">
                已自動展開所有待聘週次，可直接列印或另存為 PDF。
            </p>
          </div>
          <div className="flex items-center">
            <button 
                type="button"
                onClick={handlePrint}
                className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-bold flex items-center space-x-2 shadow-sm transition-colors mr-2"
            >
                <Download size={18} />
                <span>匯出 PDF</span>
            </button>
            <button 
                type="button"
                onClick={handlePrint}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold flex items-center space-x-2 shadow-sm transition-colors mr-2"
            >
                <Printer size={18} />
                <span>列印</span>
            </button>
            <button 
                type="button"
                onClick={onClose} 
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                title="關閉視窗"
            >
                <X size={24} />
            </button>
          </div>
        </div>

        {/* Printable Area */}
        <div className="flex-1 overflow-auto p-8 bg-slate-100 printable-area">
            <div className="mx-auto max-w-4xl">
                
                {processedGroups.length === 0 && (
                   <div className="text-center py-10 text-slate-400">
                      <AlertCircle size={48} className="mx-auto mb-2 text-slate-300"/>
                      <p>沒有可顯示的課表資料</p>
                   </div>
                )}

                {processedGroups.map((group, groupIndex) => {
                    if (group.weeks.length === 0) return null;

                    // Render a table for EACH week this group has data for
                    return group.weeks.map((weekData, weekIndex) => {
                        
                        const weekRangeStr = getWeekRangeStr(weekData.monday);
                        const weekDates = getWeekDates(weekData.monday);
                        
                        // Map items for lookup
                        const scheduleMap: Record<string, ScheduleItem> = {};
                        weekData.items.forEach(item => {
                            try {
                              // Ensure key matches what we generate in the table loop
                              // Use safe normalization
                              const d = parseLocalDate(item.date);
                              const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                              const key = `${dStr}_${item.period}`;
                              scheduleMap[key] = item;
                            } catch(e) {}
                        });

                        return (
                            <div key={`${groupIndex}-${weekIndex}`} className="bg-white p-8 shadow-sm border border-slate-200 mb-8 last:mb-0 print:border-none print:shadow-none print:w-full print:max-w-none print:p-0 print:mb-0 print:break-after-page">
                                
                                {/* Print Header */}
                                <div className="text-center mb-6">
                                    <h1 className="text-2xl font-bold text-slate-900 border-b-2 border-slate-800 pb-2 inline-block px-8">
                                        {group.title}
                                    </h1>
                                    <div className="mt-2 text-slate-600 font-medium">
                                        週次：{weekRangeStr}
                                    </div>
                                </div>

                                {/* Schedule Table */}
                                <table className="w-full border-collapse border border-slate-800 text-center table-fixed">
                                    <thead>
                                        <tr className="bg-slate-100 print:bg-slate-50">
                                            <th className="border border-slate-400 py-2 w-20 text-slate-600 font-bold">節次</th>
                                            {weekDates.map((d, i) => (
                                                <th key={i} className="border border-slate-400 py-2 font-bold text-slate-800">
                                                    {['週一', '週二', '週三', '週四', '週五'][i]}
                                                    <div className="text-xs font-normal text-slate-500 mt-1">
                                                        {d.getMonth()+1}/{d.getDate()}
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {PERIOD_ORDER.map(period => (
                                            <tr key={period}>
                                                <td className="border border-slate-400 py-3 font-bold text-slate-600 bg-slate-50 print:bg-transparent">
                                                    {period}
                                                    <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                                                        {PERIOD_LABELS[period]}
                                                    </div>
                                                </td>
                                                {weekDates.map((dateObj, idx) => {
                                                    // Normalize to YYYY-MM-DD string for key lookup
                                                    const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`;
                                                    const key = `${dateStr}_${period}`;
                                                    const item = scheduleMap[key];
                                                    
                                                    return (
                                                        <td key={idx} className="border border-slate-400 p-1 h-24 align-middle relative overflow-hidden">
                                                            {item ? (
                                                                <div className="flex flex-col items-center justify-center h-full w-full p-1">
                                                                    <div className="font-bold text-lg text-slate-800 leading-tight">
                                                                        {item.subject}
                                                                    </div>
                                                                    <div className="font-medium text-slate-600 text-sm mt-1">
                                                                        {item.className}
                                                                    </div>
                                                                    {item.payType && (
                                                                        <div className={`text-[10px] px-1 rounded inline-block mt-0.5 ${item.payType === '日薪' ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'}`}>
                                                                            {item.payType}
                                                                        </div>
                                                                    )}
                                                                    {item.reason && (
                                                                        <div className="text-[10px] text-slate-400 mt-1 max-w-full truncate px-1">
                                                                            ({item.reason})
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <span className="text-slate-100 print:hidden">-</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                
                                <div className="mt-4 text-xs text-slate-400 text-right print:text-slate-500">
                                    製表時間：{new Date().toLocaleString()} | SubTeach Pro
                                </div>
                            </div>
                        );
                    });
                })}

            </div>
        </div>

      </div>
    </div>
  );
};

export default WeeklyScheduleModal;
