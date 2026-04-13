import React, { useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, BookOpen, Filter, Search, Sun } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { FixedOvertimeConfig, LeaveRecord, LeaveType, Teacher } from '../types';
import { deduplicateDetails } from '../utils/calculations';
import { shouldExcludeLeaveRecordFromSubteachLedger } from '../utils/fixedOvertimeLedger';
import {
  buildLedgerLine,
  fmtLedgerInt,
  gasSubstituteGroupKey,
  mergeLedgerLinesBySubstituteTeacher,
  substituteDisplayName,
  toYMD,
  type LedgerLine,
  type MergedLedgerRow,
} from '../utils/subteachLedgerLines';

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

type LeaveTypeGroup = { leaveType: LeaveType; lines: LedgerLine[] };

const ALL_LEAVE_TYPES = Object.values(LeaveType) as LeaveType[];

/** 本地當日 YYYY-MM-DD（中午避免時區誤差） */
function getTodayYmdLocal(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 本地日曆隔日 YYYY-MM-DD（中午避免時區誤差） */
function getTomorrowYmdLocal(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultSubDateRange(): { start: string; end: string } {
  return { start: getTodayYmdLocal(), end: getTomorrowYmdLocal() };
}

const SUB_DATE_RANGE_MAX_DAYS = 31;

/** 含首尾之連續本地日 YYYY-MM-DD；若起訖顛倒則自動對調 */
function enumerateYmdInclusive(startYmd: string, endYmd: string): string[] {
  const a = startYmd <= endYmd ? startYmd : endYmd;
  const b = startYmd <= endYmd ? endYmd : startYmd;
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  const end = new Date(y2, m2 - 1, d2, 12, 0, 0, 0);
  const out: string[] = [];
  let cur = new Date(y1, m1 - 1, d1, 12, 0, 0, 0);
  let n = 0;
  while (cur <= end && n < SUB_DATE_RANGE_MAX_DAYS) {
    out.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`,
    );
    cur.setDate(cur.getDate() + 1);
    n += 1;
  }
  return out;
}

function ymdToRocParts(ymd: string): { roc: number; mm: string; dd: string } | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { roc: Number(m[1]) - 1911, mm: m[2], dd: m[3] };
}

function collectSubstituteRowsForYmd(
  ymd: string,
  records: LeaveRecord[],
  teachers: Teacher[],
  fixedOvertimeConfig: FixedOvertimeConfig[] | undefined,
): TomorrowSubstituteNameRow[] {
  const byKey = new Map<string, TomorrowSubstituteNameRow>();
  for (const r of records) {
    if (shouldExcludeLeaveRecordFromSubteachLedger(r, teachers, fixedOvertimeConfig)) continue;
    const deduped = deduplicateDetails(r.details || []);
    for (const d of deduped) {
      if (d.isOvertime === true) continue;
      if (toYMD(d.date) !== ymd) continue;
      const subName = substituteDisplayName(d.substituteTeacherId, teachers);
      const id = (d.substituteTeacherId || '').trim();
      const dedupKey = id || `name:${subName}`;
      if (byKey.has(dedupKey)) continue;
      const searchText = [subName, id].join(' ').toLowerCase();
      byKey.set(dedupKey, {
        key: dedupKey,
        substituteName: subName,
        substituteTeacherId: id,
        searchText,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => a.substituteName.localeCompare(b.substituteName, 'zh-Hant'));
}

type TomorrowSubstituteNameRow = {
  key: string;
  substituteName: string;
  substituteTeacherId: string;
  searchText: string;
};

/** 頁面表格外之數字以 Times New Roman 呈現 */
const NUM_FONT = "tabular-nums font-['Times_New_Roman',Times,serif]";

/** 清冊表格：英數 Times New Roman；中文標楷體（macOS DFKai-SB／Windows 標楷體等 fallback） */
const LEDGER_TABLE_FONT_FAMILY =
  '"Times New Roman", Times, "標楷體", "DFKai-SB", "BiauKai ST", "BiauKai", "KaiTi", "Kaiti SC", serif';

const TeacherLeavePortal: React.FC = () => {
  const { records, teachers, fixedOvertimeConfig, loading } = useAppStore();

  const [leaveTypeSelection, setLeaveTypeSelection] = useState<Set<LeaveType>>(
    () => new Set(ALL_LEAVE_TYPES),
  );

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const { monthStartStr, monthEndStr, rocYear, monthNumPadded } = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return {
      monthStartStr: `${selectedMonth}-01`,
      monthEndStr: `${selectedMonth}-${String(lastDay).padStart(2, '0')}`,
      rocYear: year - 1911,
      monthNumPadded: String(month).padStart(2, '0'),
    };
  }, [selectedMonth]);

  const recordsInMonth = useMemo(
    () => records.filter((r) => recordTouchesMonth(r, monthStartStr, monthEndStr)),
    [records, monthStartStr, monthEndStr],
  );

  const groupedByLeaveType = useMemo((): LeaveTypeGroup[] => {
    const map = new Map<LeaveType, LedgerLine[]>();
    // 與 AppContext／GAS 一致：records 已為 createdAt 新→舊；勿再排序，以還原 syncRecords 掃描順序
    for (const r of recordsInMonth) {
      if (shouldExcludeLeaveRecordFromSubteachLedger(r, teachers, fixedOvertimeConfig)) continue;
      const lt = r.leaveType;
      if (!map.has(lt)) map.set(lt, []);
      const deduped = deduplicateDetails(r.details || []);
      for (const d of deduped) {
        if (!d.date || !toYMD(d.date).startsWith(selectedMonth)) continue;
        // 與一般代課印領清冊相同：超鐘點時段另入超鐘點清冊，不列入本頁
        if (d.isOvertime === true) continue;
        map.get(lt)!.push(buildLedgerLine(r, d, teachers, gasSubstituteGroupKey(d)));
      }
    }
    return (Object.values(LeaveType) as LeaveType[])
      .map((leaveType) => ({ leaveType, lines: map.get(leaveType) || [] }))
      .filter((g) => g.lines.length > 0);
  }, [recordsInMonth, teachers, fixedOvertimeConfig, selectedMonth]);

  const displayedLeaveTypeGroups = useMemo(
    () => groupedByLeaveType.filter((g) => leaveTypeSelection.has(g.leaveType)),
    [groupedByLeaveType, leaveTypeSelection],
  );

  const [portalTab, setPortalTab] = useState<'ledger' | 'tomorrow'>('ledger');
  const [tomorrowQuery, setTomorrowQuery] = useState('');
  const [subDateStart, setSubDateStart] = useState(() => defaultSubDateRange().start);
  const [subDateEnd, setSubDateEnd] = useState(() => defaultSubDateRange().end);

  const subViewYmdList = useMemo(
    () => enumerateYmdInclusive(subDateStart, subDateEnd),
    [subDateStart, subDateEnd],
  );

  const byDateSubRows = useMemo(
    () =>
      subViewYmdList.map((ymd) => ({
        dateYmd: ymd,
        rows: collectSubstituteRowsForYmd(ymd, records, teachers, fixedOvertimeConfig),
      })),
    [subViewYmdList, records, teachers, fixedOvertimeConfig],
  );

  const displayedByDateSubRows = useMemo(() => {
    const q = tomorrowQuery.trim().toLowerCase();
    if (!q) return byDateSubRows;
    return byDateSubRows.map(({ dateYmd, rows }) => ({
      dateYmd,
      rows: rows.filter((row) => row.searchText.includes(q)),
    }));
  }, [byDateSubRows, tomorrowQuery]);

  const subDateRangeLabel = useMemo(() => {
    if (subDateStart === subDateEnd) return subDateStart;
    return `${subDateStart} ～ ${subDateEnd}`;
  }, [subDateStart, subDateEnd]);

  const totalSubstituteSlots = useMemo(
    () => byDateSubRows.reduce((s, d) => s + d.rows.length, 0),
    [byDateSubRows],
  );

  const totalDisplayedSlots = useMemo(
    () => displayedByDateSubRows.reduce((s, d) => s + d.rows.length, 0),
    [displayedByDateSubRows],
  );

  const applyDefaultSubDateRange = () => {
    const { start, end } = defaultSubDateRange();
    setSubDateStart(start);
    setSubDateEnd(end);
  };

  const onSubDateStartChange = (v: string) => {
    setSubDateStart(v);
    setSubDateEnd((end) => (v > end ? v : end));
  };

  const onSubDateEndChange = (v: string) => {
    setSubDateEnd(v);
    setSubDateStart((start) => (v < start ? v : start));
  };

  const toggleLeaveTypeFilter = (lt: LeaveType) => {
    setLeaveTypeSelection((prev) => {
      const next = new Set(prev);
      if (next.has(lt)) next.delete(lt);
      else next.add(lt);
      return next;
    });
  };

  const selectAllLeaveTypes = () => {
    setLeaveTypeSelection(new Set(ALL_LEAVE_TYPES));
  };

  const clearLeaveTypeSelection = () => {
    setLeaveTypeSelection(new Set());
  };

  const handleMonthChange = (dir: 'prev' | 'next') => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() + (dir === 'next' ? 1 : -1));
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-slate-500 text-base">載入中…</div>
    );
  }

  const tableCell = 'border border-slate-800 px-2 py-2 align-middle text-slate-900';
  const tableHead = `${tableCell} bg-slate-200 font-bold text-center whitespace-nowrap text-base`;

  const tabBtnBase =
    'inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors rounded-t-md';
  const tabBtnActive = 'border-indigo-600 text-indigo-700 bg-white';
  const tabBtnIdle = 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50';

  return (
    <div className="min-h-full bg-slate-100 text-slate-900 print:bg-white">
      <div className="max-w-[min(100%,120rem)] mx-auto px-3 sm:px-4 py-5 md:py-6">
        <div className="mb-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 print:hidden">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="text-indigo-600 shrink-0" size={28} />
              薪水幹事查詢
            </h1>
            <div className="mt-3 flex flex-wrap gap-1 border-b border-slate-300">
              <button
                type="button"
                onClick={() => setPortalTab('ledger')}
                className={`${tabBtnBase} ${portalTab === 'ledger' ? tabBtnActive : tabBtnIdle}`}
              >
                <Calendar size={16} aria-hidden />
                印領清冊（依月）
              </button>
              <button
                type="button"
                onClick={() => setPortalTab('tomorrow')}
                className={`${tabBtnBase} ${portalTab === 'tomorrow' ? tabBtnActive : tabBtnIdle}`}
              >
                <Sun size={16} aria-hidden />
                明日代課
              </button>
            </div>
            {portalTab === 'ledger' ? (
              <p className="text-sm md:text-base text-slate-600 mt-2">
                當月依假別分區，以<strong>代課教師印領清冊</strong>格式呈現（<strong>不含</strong>標示為超鐘點之代課時段，該類另計入超鐘點清冊；<strong>不含</strong>固定兼課身分之請假人及其代課明細，該類另列固定兼課清冊）；同假別、同代課教師合併一列（欄位內多行對齊各筆，應發金額為合計）。
                <strong>列順序與 GAS 產出清冊一致</strong>（紀錄依建立時間新→舊掃描、代課者以主檔 id 分群；群組內再依日期與請假人排序）。可下方篩選假別。
              </p>
            ) : (
              <p className="text-sm md:text-base text-slate-600 mt-2">
                預設為<strong>今日至明日</strong>（本機日曆），可依下方起訖日期調整（最長連續{' '}
                <span className={NUM_FONT}>{SUB_DATE_RANGE_MAX_DAYS}</span> 日）。列出所選各日之<strong>代課教師名單</strong>
                （同一日同一人僅列一次）；不含超鐘點與固定兼課請假人。下方可搜尋代課教師姓名。
              </p>
            )}
          </div>
          {portalTab === 'ledger' && (
            <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg shadow-sm shrink-0 self-end">
              <button
                type="button"
                onClick={() => handleMonthChange('prev')}
                className="p-2.5 text-slate-600 hover:bg-slate-50 rounded-l-lg border-r border-slate-300"
                aria-label="上個月"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="px-4 py-2.5 flex items-center gap-2 font-semibold text-slate-800 text-base">
                <Calendar size={18} className="text-slate-500" />
                <span className={NUM_FONT}>{selectedMonth}</span>
              </div>
              <button
                type="button"
                onClick={() => handleMonthChange('next')}
                className="p-2.5 text-slate-600 hover:bg-slate-50 rounded-r-lg border-l border-slate-300"
                aria-label="下個月"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>

        {portalTab === 'ledger' && (
          <div className="mb-5 rounded-lg border border-slate-300 bg-white px-3 py-3 shadow-sm print:hidden">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 mb-2">
              <Filter size={18} className="text-indigo-600 shrink-0" aria-hidden />
              <span className="text-sm font-bold text-slate-800">假別篩選</span>
              <button
                type="button"
                onClick={clearLeaveTypeSelection}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline"
              >
                全不選
              </button>
              <button
                type="button"
                onClick={selectAllLeaveTypes}
                className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 underline-offset-2 hover:underline"
              >
                全選
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_LEAVE_TYPES.map((lt) => {
                const on = leaveTypeSelection.has(lt);
                return (
                  <button
                    key={lt}
                    type="button"
                    onClick={() => toggleLeaveTypeFilter(lt)}
                    title={on ? '點擊取消此假別' : '點擊加入此假別'}
                    className={`rounded-full border px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
                      on
                        ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                        : 'border-slate-300 bg-slate-50 text-slate-500 hover:border-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    {lt}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {portalTab === 'ledger' ? (
          groupedByLeaveType.length === 0 ? (
          <div className="rounded-lg border border-slate-300 bg-white p-12 text-center text-slate-600 text-base shadow-sm">
            <span className={NUM_FONT}>{selectedMonth}</span>
            月份沒有可列入印領清冊格式之代課明細（已排除固定兼課請假人—含僅列於固定兼課設定者—與超鐘點時段）
          </div>
        ) : leaveTypeSelection.size === 0 ? (
          <div className="rounded-lg border border-slate-300 bg-slate-50 p-10 text-center text-slate-700 text-base shadow-sm">
            已<strong>全不選</strong>假別，不顯示任何清冊。請點選假別或按「全選」以顯示資料。
          </div>
        ) : displayedLeaveTypeGroups.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-10 text-center text-amber-900 text-base shadow-sm">
            所選假別於 <span className={NUM_FONT}>{selectedMonth}</span> 無代課明細，請調整篩選或按「全選」。
          </div>
        ) : (
          <div className="space-y-10 print:space-y-6">
            {displayedLeaveTypeGroups.map(({ leaveType, lines }) => {
              const mergedRows = mergeLedgerLinesBySubstituteTeacher(lines);
              const sumDays = lines.reduce((s, x) => s + x.subDays, 0);
              const sumPeriods = lines.reduce((s, x) => s + x.subPeriods, 0);
              const sumSubstitutePay = lines.reduce((s, x) => s + x.substitutePayExclHomeroom, 0);
              const sumHmDays = lines.reduce((s, x) => s + x.homeroomDays, 0);
              const sumHmFee = lines.reduce((s, x) => s + x.homeroomFee, 0);
              const sumPayable = lines.reduce((s, x) => s + x.payableAmount, 0);

              const cellMulti = `${tableCell} align-top whitespace-pre-line leading-snug`;

              return (
                <section
                  key={leaveType}
                  className="bg-white border border-slate-400 shadow-sm print:shadow-none print:border-black overflow-hidden"
                >
                  <div className="px-3 py-3 border-b border-slate-400 print:border-black">
                    <h2 className="text-lg md:text-xl font-bold text-center leading-snug">
                      代課教師印領清冊　<span className={NUM_FONT}>{rocYear}</span>年
                      <span className={NUM_FONT}>{monthNumPadded}</span>月　【{leaveType}】
                    </h2>
                    <p className="text-center text-sm text-slate-600 mt-1 print:text-slate-800">
                      共 <span className={NUM_FONT}>{lines.length}</span> 筆明細，合併為{' '}
                      <span className={NUM_FONT}>{mergedRows.length}</span> 列（同代課教師合併；唯讀）
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table
                      className="w-full border-collapse text-base md:text-lg tabular-nums"
                      style={{ fontFamily: LEDGER_TABLE_FONT_FAMILY }}
                    >
                      <thead>
                        <tr>
                          <th className={tableHead}>代課日期</th>
                          <th className={tableHead}>代課教師</th>
                          <th className={tableHead}>薪級</th>
                          <th className={tableHead}>日薪</th>
                          <th className={tableHead}>代課天數</th>
                          <th className={tableHead}>代課節數</th>
                          <th className={tableHead}>代課鐘點費</th>
                          <th className={`${tableHead} whitespace-nowrap min-w-[7rem]`}>請假人</th>
                          <th className={tableHead}>假別</th>
                          <th className={`${tableHead} min-w-[6rem]`}>請假事由</th>
                          <th className={`${tableHead} min-w-[7rem]`}>備註</th>
                          <th className={tableHead}>代導師日數</th>
                          <th className={tableHead}>導師費</th>
                          <th className={tableHead}>應發金額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mergedRows.map((row) => (
                          <tr key={row.key}>
                            <td className={`${cellMulti} text-center`}>{row.dateLines}</td>
                            <td className={`${tableCell} text-center whitespace-nowrap align-top`}>{row.substituteName}</td>
                            <td className={`${cellMulti} text-center tabular-nums`}>{row.salaryPointsLines}</td>
                            <td className={`${cellMulti} text-center tabular-nums`}>{row.dailyRateLines}</td>
                            <td className={`${cellMulti} text-center tabular-nums`}>{row.subDaysLines}</td>
                            <td className={`${cellMulti} text-center tabular-nums`}>{row.subPeriodsLines}</td>
                            <td className={`${cellMulti} text-right tabular-nums`}>{row.substitutePayLines}</td>
                            <td className={`${cellMulti} text-center min-w-[7rem]`}>{row.leaveTeacherLines}</td>
                            <td className={`${cellMulti} text-center text-sm md:text-base`}>{row.leaveTypeLines}</td>
                            <td className={`${cellMulti} text-sm md:text-base`}>{row.reasonLines}</td>
                            <td className={`${cellMulti} text-sm md:text-base`}>{row.noteLines}</td>
                            <td className={`${cellMulti} text-center tabular-nums`}>{row.homeroomDaysLines}</td>
                            <td className={`${cellMulti} text-right tabular-nums`}>{row.homeroomFeeLines}</td>
                            <td className={`${tableCell} text-right font-semibold tabular-nums align-top`}>
                              {fmtLedgerInt(row.payableTotal)}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-slate-100 font-bold">
                          <td className={tableCell} colSpan={4}>
                            合計
                          </td>
                          <td className={`${tableCell} text-center tabular-nums`}>{String(sumDays)}</td>
                          <td className={`${tableCell} text-center tabular-nums`}>{sumPeriods}</td>
                          <td className={`${tableCell} text-right tabular-nums`}>{fmtLedgerInt(sumSubstitutePay)}</td>
                          <td className={tableCell} colSpan={4} />
                          <td className={`${tableCell} text-center tabular-nums`}>{String(sumHmDays)}</td>
                          <td className={`${tableCell} text-right tabular-nums`}>{fmtLedgerInt(sumHmFee)}</td>
                          <td className={`${tableCell} text-right tabular-nums`}>{fmtLedgerInt(sumPayable)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )
        ) : (
          <>
            <div className="mb-5 rounded-lg border border-slate-300 bg-white px-3 py-3 shadow-sm print:hidden space-y-4">
              <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-end gap-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                    起日
                    <input
                      type="date"
                      value={subDateStart}
                      onChange={(e) => onSubDateStartChange(e.target.value)}
                      className="border border-slate-300 rounded-lg px-2 py-2 text-base text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                    迄日
                    <input
                      type="date"
                      value={subDateEnd}
                      onChange={(e) => onSubDateEndChange(e.target.value)}
                      className="border border-slate-300 rounded-lg px-2 py-2 text-base text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={applyDefaultSubDateRange}
                    className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"
                  >
                    今日～明日
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const t = getTodayYmdLocal();
                      setSubDateStart(t);
                      setSubDateEnd(t);
                    }}
                    className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    僅今日
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const t = getTomorrowYmdLocal();
                      setSubDateStart(t);
                      setSubDateEnd(t);
                    }}
                    className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    僅明日
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-600">
                目前區間：<span className={NUM_FONT}>{subDateRangeLabel}</span>（共{' '}
                <span className={NUM_FONT}>{subViewYmdList.length}</span> 日）
              </p>
              <label className="flex items-center gap-2 max-w-2xl">
                <Search className="text-slate-500 shrink-0" size={20} aria-hidden />
                <input
                  type="search"
                  value={tomorrowQuery}
                  onChange={(e) => setTomorrowQuery(e.target.value)}
                  placeholder="搜尋代課教師姓名…"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  autoComplete="off"
                />
              </label>
              <p className="text-xs text-slate-500">
                範圍內各日去重後合計 <span className={NUM_FONT}>{totalSubstituteSlots}</span> 人次
                {tomorrowQuery.trim() ? (
                  <>
                    ，符合關鍵字 <span className={NUM_FONT}>{totalDisplayedSlots}</span> 人次
                  </>
                ) : null}
              </p>
            </div>
            {totalSubstituteSlots === 0 ? (
              <div className="rounded-lg border border-slate-300 bg-white p-12 text-center text-slate-600 text-base shadow-sm">
                所選區間（<span className={NUM_FONT}>{subDateRangeLabel}</span>
                ）尚無代課教師名單，或該期間資料尚未建立。
              </div>
            ) : totalDisplayedSlots === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-10 text-center text-amber-900 text-base shadow-sm">
                查無符合「<span className="font-mono">{tomorrowQuery.trim()}</span>」的項目，請調整關鍵字。
              </div>
            ) : (
              <div className="space-y-8 max-w-md">
                {displayedByDateSubRows
                  .filter(({ rows }) => !tomorrowQuery.trim() || rows.length > 0)
                  .map(({ dateYmd, rows }) => {
                  const roc = ymdToRocParts(dateYmd);
                  const dayTotal =
                    byDateSubRows.find((d) => d.dateYmd === dateYmd)?.rows.length ?? 0;
                  return (
                    <section key={dateYmd}>
                      <h3 className="text-sm font-bold text-slate-800 mb-2 leading-snug">
                        西元 <span className={NUM_FONT}>{dateYmd}</span>
                        {roc ? (
                          <>
                            {' '}
                            （民國 <span className={NUM_FONT}>{roc.roc}</span> 年{' '}
                            <span className={NUM_FONT}>{roc.mm}</span> 月 <span className={NUM_FONT}>{roc.dd}</span> 日）
                          </>
                        ) : null}
                        <span className="text-slate-500 font-normal">
                          {' '}
                          · 該日 <span className={NUM_FONT}>{dayTotal}</span> 位
                          {tomorrowQuery.trim() && rows.length !== dayTotal ? (
                            <>
                              ，符合 <span className={NUM_FONT}>{rows.length}</span> 位
                            </>
                          ) : null}
                        </span>
                      </h3>
                      <div className="bg-white border border-slate-400 shadow-sm rounded-sm overflow-hidden print:border-black">
                        <ul className="m-0 list-none divide-y divide-slate-200 p-0">
                          {rows.map((row, i) => (
                            <li
                              key={`${dateYmd}-${row.key}`}
                              className="flex items-baseline gap-3 px-4 py-3 text-base text-slate-900"
                            >
                              <span className={`${NUM_FONT} w-8 shrink-0 text-right text-slate-500`}>{i + 1}.</span>
                              <span className="font-medium">{row.substituteName}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TeacherLeavePortal;
