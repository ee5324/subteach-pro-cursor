import React, { useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, BookOpen, Phone, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { LeaveRecord, LeaveType, PayType, ProcessingStatus } from '../types';
import { deduplicateDetails } from '../utils/calculations';

const toYMD = (d: string | number | undefined | null): string => {
  if (d == null) return '';
  const s = String(d).trim();
  if (!s) return '';
  const normalized = s.replace(/\//g, '-');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  return normalized;
};

function recordTouchesMonth(r: LeaveRecord, monthStartStr: string, monthEndStr: string): boolean {
  const details = r.details || [];
  const slots = r.slots || [];
  let start = toYMD(r.startDate || '');
  let end = toYMD(r.endDate || '');
  if (!start || !end) {
    const dates = (slots.length > 0 ? slots.map((s) => s.date) : details.map((d) => d.date))
      .map(toYMD)
      .filter(Boolean)
      .sort();
    if (dates.length > 0) {
      start = start || dates[0];
      end = end || dates[dates.length - 1];
    } else {
      start = start || monthStartStr;
      end = end || monthEndStr;
    }
  }
  const inMonthByRange = start <= monthEndStr && end >= monthStartStr;
  const hasAnyDateInMonth = [...details.map((d) => toYMD(d.date)), ...slots.map((s) => toYMD(s.date))].some(
    (date) => date >= monthStartStr && date <= monthEndStr,
  );
  return inMonthByRange || hasAnyDateInMonth;
}

function formatDateSimple(dateStr: string) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getStatusColor(status: ProcessingStatus | undefined) {
  switch (status) {
    case '已印代課單':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case '跑章中':
      return 'bg-orange-100 text-orange-700 border-orange-200';
    case '結案待算':
      return 'bg-green-100 text-green-700 border-green-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

type LeaveTypeGroup = { leaveType: LeaveType; records: LeaveRecord[] };

const TeacherLeavePortal: React.FC = () => {
  const { records, teachers, holidays, loading } = useAppStore();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const { monthStartStr, monthEndStr } = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return {
      monthStartStr: `${selectedMonth}-01`,
      monthEndStr: `${selectedMonth}-${String(lastDay).padStart(2, '0')}`,
    };
  }, [selectedMonth]);

  const recordsInMonth = useMemo(
    () => records.filter((r) => recordTouchesMonth(r, monthStartStr, monthEndStr)),
    [records, monthStartStr, monthEndStr],
  );

  const groupedByLeaveType = useMemo((): LeaveTypeGroup[] => {
    const map = new Map<LeaveType, LeaveRecord[]>();
    for (const r of recordsInMonth) {
      const lt = r.leaveType;
      if (!map.has(lt)) map.set(lt, []);
      map.get(lt)!.push(r);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    return (Object.values(LeaveType) as LeaveType[])
      .map((leaveType) => ({ leaveType, records: map.get(leaveType) || [] }))
      .filter((g) => g.records.length > 0);
  }, [recordsInMonth]);

  const handleMonthChange = (dir: 'prev' | 'next') => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() + (dir === 'next' ? 1 : -1));
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-slate-500 text-sm">載入中…</div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 text-slate-800">
      <div className="max-w-[min(100%,96rem)] mx-auto px-3 sm:px-4 py-5 md:py-6">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="text-indigo-600 shrink-0" size={26} />
              教師請假／代課查詢
            </h1>
            <p className="text-xs md:text-sm text-slate-500 mt-1">
              依<strong>假別</strong>分區呈現當月總表；欄位與代課清冊「依請假人」一致（唯讀）。每筆含請假人、事由、期間、代課教師與日期、金額、憑證狀態與備註。
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg shadow-sm shrink-0">
            <button
              type="button"
              onClick={() => handleMonthChange('prev')}
              className="p-2 text-slate-500 hover:bg-slate-50 rounded-l-lg border-r border-slate-200"
              aria-label="上個月"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="px-3 py-2 flex items-center gap-2 font-semibold text-slate-700 tabular-nums text-sm">
              <Calendar size={16} className="text-slate-400" />
              {selectedMonth}
            </div>
            <button
              type="button"
              onClick={() => handleMonthChange('next')}
              className="p-2 text-slate-500 hover:bg-slate-50 rounded-r-lg border-l border-slate-200"
              aria-label="下個月"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {groupedByLeaveType.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 text-sm shadow-sm">
            {selectedMonth} 月份沒有代課紀錄（含跨月重疊之紀錄）
          </div>
        ) : (
          <div className="space-y-8">
            {groupedByLeaveType.map(({ leaveType, records: groupRecords }) => (
              <section key={leaveType} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-2.5">
                  <h2 className="text-sm md:text-base font-bold text-indigo-950">{leaveType}</h2>
                  <p className="text-[11px] text-indigo-800/80 mt-0.5">共 {groupRecords.length} 筆（{selectedMonth}）</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[920px] text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs md:text-sm">
                      <tr>
                        <th className="px-3 py-3 font-semibold text-slate-700 whitespace-nowrap">建立／申請日</th>
                        <th className="px-3 py-3 font-semibold text-slate-700 whitespace-nowrap">請假教師</th>
                        <th className="px-3 py-3 font-semibold text-slate-700 min-w-[7rem]">請假原因（事由）</th>
                        <th className="px-3 py-3 font-semibold text-slate-700 whitespace-nowrap">公文字號</th>
                        <th className="px-3 py-3 font-semibold text-slate-700 whitespace-nowrap">期間</th>
                        <th className="px-3 py-3 font-semibold text-slate-700 min-w-[14rem]">
                          代課明細（{selectedMonth}，含代課教師／日期）
                        </th>
                        <th className="px-3 py-3 font-semibold text-slate-700 text-right whitespace-nowrap">當月總金額</th>
                        <th className="px-3 py-3 font-semibold text-slate-700 text-center whitespace-nowrap">憑證狀態</th>
                        <th className="px-3 py-3 font-semibold text-slate-700 min-w-[6rem]">備註</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {groupRecords.map((record) => {
                        const originalTeacher = teachers.find(
                          (t) => t.id === record.originalTeacherId || t.name === record.originalTeacherId,
                        );
                        const dedupedDetails = deduplicateDetails(record.details || []);
                        const currentMonthDetails = dedupedDetails.filter(
                          (d) => d.date && toYMD(d.date).startsWith(selectedMonth),
                        );
                        const monthTotalAmount = currentMonthDetails.reduce(
                          (sum, d) => sum + (Number(d.calculatedAmount) || 0),
                          0,
                        );
                        const isWeekend = (dateStr: string) => {
                          const d = new Date(dateStr);
                          return d.getDay() === 0 || d.getDay() === 6;
                        };
                        const holidayConflicts = (record.details || [])
                          .filter((d) => holidays && holidays.includes(d.date))
                          .map((d) => d.date);
                        const weekendConflicts = (record.details || [])
                          .filter((d) => isWeekend(d.date))
                          .map((d) => d.date);
                        const allConflicts = Array.from(new Set([...holidayConflicts, ...weekendConflicts])).sort();

                        const status = record.processingStatus || '待處理';
                        const startStr =
                          record.startDate ||
                          (record.slots?.length ? record.slots.map((s) => s.date).sort()[0] : monthStartStr) ||
                          monthStartStr;
                        const endStr =
                          record.endDate ||
                          (record.slots?.length ? record.slots.map((s) => s.date).sort().pop() : monthEndStr) ||
                          monthEndStr;
                        const displayStart = startStr < monthStartStr ? monthStartStr : startStr;
                        const displayEnd = endStr > monthEndStr ? monthEndStr : endStr;

                        return (
                          <tr key={record.id} className="hover:bg-slate-50/80 align-top">
                            <td className="px-3 py-3 text-slate-600 text-xs whitespace-nowrap">
                              {record.applicationDate
                                ? formatDateSimple(record.applicationDate)
                                : new Date(record.createdAt).toLocaleDateString('zh-TW')}
                            </td>
                            <td className="px-3 py-3 font-medium text-slate-800">
                              <div>{originalTeacher?.name || record.originalTeacherId || '未知'}</div>
                              {originalTeacher?.phone && (
                                <div className="text-[11px] text-slate-400 flex items-center mt-0.5">
                                  <Phone size={10} className="mr-0.5 shrink-0" />
                                  {originalTeacher.phone}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-slate-700 text-xs leading-snug break-words max-w-[14rem]">
                              {record.reason?.trim() ? record.reason : '—'}
                            </td>
                            <td className="px-3 py-3 text-slate-600 text-xs font-mono whitespace-nowrap">
                              {record.docId?.trim() ? record.docId : '—'}
                            </td>
                            <td className="px-3 py-3 text-xs text-slate-600 font-mono whitespace-nowrap">
                              {formatDateSimple(displayStart)}～{formatDateSimple(displayEnd)}
                              {allConflicts.length > 0 && (
                                <div className="text-red-500 text-[10px] mt-1 flex items-start gap-0.5">
                                  <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                                  <span>含假日／週末 {allConflicts.length} 天</span>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-xs text-slate-600">
                              {currentMonthDetails.length > 0 ? (
                                <div className="space-y-1.5">
                                  {currentMonthDetails
                                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                                    .map((d) => {
                                      const sub = teachers.find((t) => t.id === d.substituteTeacherId);
                                      const isOvertime = d.isOvertime;
                                      return (
                                        <div
                                          key={d.id}
                                          className="flex flex-wrap items-start gap-x-2 gap-y-0.5 border-b border-slate-100 last:border-0 pb-1.5 last:pb-0"
                                        >
                                          <span className="text-slate-500 font-mono shrink-0">
                                            {formatDateSimple(d.date)}
                                          </span>
                                          <span className="font-medium text-indigo-700 shrink-0">
                                            代 {sub?.name || (d.substituteTeacherId === 'pending' ? '待聘' : d.substituteTeacherId)}
                                          </span>
                                          {sub?.phone && (
                                            <span className="text-slate-400 text-[10px] flex items-center">
                                              <Phone size={9} className="mr-0.5" />
                                              {sub.phone}
                                            </span>
                                          )}
                                          <span className="text-slate-600">
                                            {d.payType === PayType.HOURLY
                                              ? `${d.periodCount}節（${d.selectedPeriods?.join('、') || '—'}）`
                                              : d.payType === PayType.HALF_DAY
                                                ? '半日'
                                                : `${d.periodCount}日`}
                                            {isOvertime && (
                                              <span className="ml-1 text-[10px] bg-purple-100 text-purple-700 px-1 rounded font-bold">
                                                超鐘
                                              </span>
                                            )}
                                          </span>
                                          <span
                                            className={`ml-auto font-medium tabular-nums ${isOvertime ? 'text-slate-400 line-through' : 'text-slate-800'}`}
                                          >
                                            ${(Number(d.calculatedAmount) || 0).toLocaleString()}
                                          </span>
                                          {[d.subject, d.className].filter(Boolean).length > 0 && (
                                            <span className="w-full text-[11px] text-slate-500">
                                              {[d.subject, d.className].filter(Boolean).join(' · ')}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">本月無明細（跨月紀錄）</span>
                              )}
                              {allConflicts.length > 0 && currentMonthDetails.length > 0 && (
                                <div className="mt-2 bg-red-50 border border-red-100 text-red-600 text-[10px] px-2 py-1 rounded">
                                  含假日／週末：
                                  {allConflicts.map((d) => formatDateSimple(d)).join('、')}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right font-bold text-slate-800 tabular-nums whitespace-nowrap">
                              ${monthTotalAmount.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span
                                className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full border ${getStatusColor(record.processingStatus)}`}
                              >
                                {status}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-xs text-slate-600 break-words max-w-[10rem]">
                              {record.adminNote?.trim() ? record.adminNote : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherLeavePortal;
