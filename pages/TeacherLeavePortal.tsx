import React, { useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, BookOpen, Filter } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { HOMEROOM_FEE_MONTHLY, LeaveRecord, LeaveType, PayType, SubstituteDetail, Teacher } from '../types';
import { deduplicateDetails, getDaysInMonth, getExpectedDailyRateNoHomeroom } from '../utils/calculations';

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

/** 與印領清冊 GAS 邏輯一致：固定兼課身分之請假人不入一般清冊列 */
function isFixedOvertimeLeaveTeacher(leaveTeacherId: string, teachers: Teacher[]): boolean {
  const key = String(leaveTeacherId || '').trim();
  if (!key) return false;
  const t = teachers.find((x) => x.id === key || x.name === key);
  return t?.isFixedOvertimeTeacher === true;
}

function formatDateReceipt(ymd: string): string {
  const y = toYMD(ymd);
  const m = y.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${m[2]}/${m[3]}`;
}

function resolveSubstituteTeacher(
  substituteTeacherId: string,
  teachers: Teacher[],
): Teacher | undefined {
  if (!substituteTeacherId || substituteTeacherId === 'pending') return undefined;
  return teachers.find((t) => t.id === substituteTeacherId || t.name === substituteTeacherId);
}

function substituteDisplayName(substituteTeacherId: string, teachers: Teacher[]): string {
  if (!substituteTeacherId || substituteTeacherId === 'pending') return '待聘';
  return resolveSubstituteTeacher(substituteTeacherId, teachers)?.name ?? substituteTeacherId;
}

/** 與 GAS SheetManager.syncRecords 群組鍵一致：代課教師 id，待聘為字串「待聘」 */
function gasSubstituteGroupKey(detail: SubstituteDetail): string {
  const id = detail.substituteTeacherId;
  if (!id || id === 'pending') return '待聘';
  return String(id).trim();
}

function dateSortKeyYmd(ymd: string): number {
  const y = toYMD(ymd);
  if (!/^\d{4}-\d{2}-\d{2}/.test(y)) return 0;
  return Number(y.slice(0, 10).replace(/-/g, ''));
}

function leaveTeacherDisplayName(record: LeaveRecord, teachers: Teacher[]): string {
  const t = teachers.find((x) => x.id === record.originalTeacherId || x.name === record.originalTeacherId);
  return t?.name ?? record.originalTeacherId ?? '—';
}

type LedgerLine = {
  key: string;
  /** 與 GAS 印領清冊列群組鍵相同（teacherId 或「待聘」） */
  substituteKey: string;
  dateYmd: string;
  dateDisplay: string;
  substituteName: string;
  salaryPointsText: string;
  dailyRateText: string;
  subDays: number;
  subPeriods: number;
  substitutePayExclHomeroom: number;
  leaveTeacherName: string;
  leaveTypeLabel: string;
  reason: string;
  note: string;
  homeroomDays: number;
  homeroomFee: number;
  payableAmount: number;
};

function buildLedgerLine(
  record: LeaveRecord,
  detail: SubstituteDetail,
  teachers: Teacher[],
  substituteKey: string,
): LedgerLine {
  const ymd = toYMD(detail.date);
  const daysInMonth = getDaysInMonth(detail.date) || 30;
  const subTeacher = resolveSubstituteTeacher(detail.substituteTeacherId, teachers);
  const dailyRateNoHm = getExpectedDailyRateNoHomeroom(subTeacher, daysInMonth);
  const ledgerFull = Number(detail.calculatedAmount) || 0;

  let lineDays = 0;
  let linePeriods = 0;
  let lineHomeroomDays = 0;
  let lineHomeroomFee = 0;
  let substitutePayExclHm = 0;

  if (detail.payType === PayType.HOURLY) {
    lineDays = 0;
    linePeriods = Number(detail.periodCount) || 0;
    lineHomeroomDays = 0;
    lineHomeroomFee = 0;
    substitutePayExclHm = ledgerFull;
  } else if (detail.payType === PayType.HALF_DAY) {
    lineDays = 0.5;
    linePeriods = 0;
    lineHomeroomDays = 0.5;
    lineHomeroomFee = Math.round((HOMEROOM_FEE_MONTHLY / daysInMonth) * 0.5);
    substitutePayExclHm = ledgerFull - lineHomeroomFee;
  } else {
    lineDays = Number(detail.periodCount) || 0;
    linePeriods = 0;
    lineHomeroomDays = Number(detail.periodCount) || 0;
    lineHomeroomFee = Math.round((HOMEROOM_FEE_MONTHLY / daysInMonth) * lineHomeroomDays);
    substitutePayExclHm = ledgerFull - lineHomeroomFee;
  }

  let note = '';
  if (detail.payType === PayType.HOURLY) {
    const n = Number(detail.periodCount) || 0;
    note = `0日${n}節`;
    if (detail.selectedPeriods && detail.selectedPeriods.length > 0) {
      note += `(${detail.selectedPeriods.join(',')})`;
    }
  } else if (detail.payType === PayType.HALF_DAY) {
    note = '半日0節';
  } else {
    note = `${lineDays}日0節`;
  }
  if (record.adminNote?.trim()) {
    note = note ? `${note}；${record.adminNote.trim()}` : record.adminNote.trim();
  }

  const salaryPts = subTeacher?.salaryPoints;
  // 與 GAS buildRowsFromGroups：C 欄薪級＋(有證)/(無證)
  const salaryPointsText =
    salaryPts != null && salaryPts > 0
      ? `${salaryPts}\n${subTeacher?.hasCertificate ? '(有證)' : '(無證)'}`
      : '—';
  // D 欄：與 GAS 試算表相同時用俸點表；若舊合併四捨五入使 G 欄與「表列日薪×天數」差 1 元，改以 G÷天數顯示，清冊內不自相矛盾
  const tableProduct =
    dailyRateNoHm != null && lineDays > 0 ? Math.round(dailyRateNoHm * lineDays) : null;
  let dailyRateText: string;
  if (detail.payType === PayType.HOURLY) {
    dailyRateText = dailyRateNoHm != null ? String(dailyRateNoHm) : '—';
  } else if (lineDays > 0 && dailyRateNoHm != null && tableProduct === substitutePayExclHm) {
    dailyRateText = String(dailyRateNoHm);
  } else if (lineDays > 0) {
    dailyRateText = String(Math.round(substitutePayExclHm / lineDays));
  } else {
    dailyRateText = dailyRateNoHm != null ? String(dailyRateNoHm) : '—';
  }

  return {
    key: `${record.id}_${detail.id}`,
    substituteKey,
    dateYmd: ymd,
    dateDisplay: formatDateReceipt(detail.date),
    substituteName: substituteDisplayName(detail.substituteTeacherId, teachers),
    salaryPointsText,
    dailyRateText,
    subDays: lineDays,
    subPeriods: linePeriods,
    substitutePayExclHomeroom: substitutePayExclHm,
    leaveTeacherName: leaveTeacherDisplayName(record, teachers),
    leaveTypeLabel: record.leaveType,
    reason: record.reason?.trim() ? record.reason.trim() : '—',
    note,
    homeroomDays: lineHomeroomDays,
    homeroomFee: lineHomeroomFee,
    payableAmount: ledgerFull,
  };
}

type LeaveTypeGroup = { leaveType: LeaveType; lines: LedgerLine[] };

/** 同假別內「同一代課教師」合併一列：多欄以換行對齊各筆明細，應發金額為合計（與印領清冊 GAS 列格式一致） */
type MergedLedgerRow = {
  key: string;
  substituteName: string;
  dateLines: string;
  salaryPointsLines: string;
  dailyRateLines: string;
  subDaysLines: string;
  subPeriodsLines: string;
  substitutePayLines: string;
  leaveTeacherLines: string;
  leaveTypeLines: string;
  reasonLines: string;
  noteLines: string;
  homeroomDaysLines: string;
  homeroomFeeLines: string;
  payableTotal: number;
};

function fmtLedgerQty(n: number): string {
  return n === 0 ? '0' : Number.isInteger(n) ? String(n) : String(n);
}

/** 與 GAS 清冊儲存格相同：整數、無千分位 */
function fmtLedgerInt(n: number): string {
  return String(Math.round(n));
}

/** 各筆字串皆相同則單行顯示，否則多行 */
function uniformOrMultiline(values: string[]): string {
  if (values.length === 0) return '—';
  const first = values[0];
  if (values.every((v) => v === first)) return first;
  return values.join('\n');
}

/**
 * 同假別內依 GAS 邏輯合併：列順序＝syncRecords 掃描時「代課群組鍵」首次出現序（records 為 createdAt 新→舊 × details 順）；
 * 同列多行＝buildRowsFromGroups 內 lineItems 排序（dateSortKey 升冪，同日再請假人 localeCompare）。
 */
function mergeLedgerLinesBySubstituteTeacher(lines: LedgerLine[]): MergedLedgerRow[] {
  const bySub = new Map<string, LedgerLine[]>();
  for (const L of lines) {
    const k = L.substituteKey;
    if (!bySub.has(k)) bySub.set(k, []);
    bySub.get(k)!.push(L);
  }
  const blocks = Array.from(bySub.entries()).map(([substituteKey, grp]) => {
    const sorted = grp.slice().sort((a, b) => {
      const ka = dateSortKeyYmd(a.dateYmd);
      const kb = dateSortKeyYmd(b.dateYmd);
      if (ka !== kb) return ka - kb;
      return a.leaveTeacherName.localeCompare(b.leaveTeacherName, 'zh-Hant');
    });
    return { substituteKey, sorted };
  });
  return blocks.map(({ substituteKey, sorted }) => ({
    key: `merged_${substituteKey}_${sorted.map((x) => x.key).join('_')}`,
    substituteName: sorted[0]?.substituteName ?? substituteKey,
    dateLines: sorted.map((x) => x.dateDisplay).join('\n'),
    salaryPointsLines: uniformOrMultiline(sorted.map((x) => x.salaryPointsText)),
    dailyRateLines: uniformOrMultiline(sorted.map((x) => x.dailyRateText)),
    subDaysLines: sorted.map((x) => fmtLedgerQty(x.subDays)).join('\n'),
    subPeriodsLines: sorted.map((x) => String(x.subPeriods)).join('\n'),
    substitutePayLines: sorted.map((x) => fmtLedgerInt(x.substitutePayExclHomeroom)).join('\n'),
    leaveTeacherLines: sorted.map((x) => x.leaveTeacherName).join('\n'),
    leaveTypeLines: uniformOrMultiline(sorted.map((x) => x.leaveTypeLabel)),
    reasonLines: sorted.map((x) => x.reason).join('\n'),
    noteLines: sorted.map((x) => x.note).join('\n'),
    homeroomDaysLines: sorted.map((x) => fmtLedgerQty(x.homeroomDays)).join('\n'),
    homeroomFeeLines: sorted.map((x) => fmtLedgerInt(x.homeroomFee)).join('\n'),
    payableTotal: sorted.reduce((s, x) => s + x.payableAmount, 0),
  }));
}

const ALL_LEAVE_TYPES = Object.values(LeaveType) as LeaveType[];

/** 頁面表格外之數字以 Times New Roman 呈現 */
const NUM_FONT = "tabular-nums font-['Times_New_Roman',Times,serif]";

/** 清冊表格：英數 Times New Roman；中文標楷體（macOS DFKai-SB／Windows 標楷體等 fallback） */
const LEDGER_TABLE_FONT_FAMILY =
  '"Times New Roman", Times, "標楷體", "DFKai-SB", "BiauKai ST", "BiauKai", "KaiTi", "Kaiti SC", serif';

const TeacherLeavePortal: React.FC = () => {
  const { records, teachers, loading } = useAppStore();

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
      if (isFixedOvertimeLeaveTeacher(r.originalTeacherId, teachers)) continue;
      const lt = r.leaveType;
      if (!map.has(lt)) map.set(lt, []);
      const deduped = deduplicateDetails(r.details || []);
      for (const d of deduped) {
        if (!d.date || !toYMD(d.date).startsWith(selectedMonth)) continue;
        map.get(lt)!.push(buildLedgerLine(r, d, teachers, gasSubstituteGroupKey(d)));
      }
    }
    return (Object.values(LeaveType) as LeaveType[])
      .map((leaveType) => ({ leaveType, lines: map.get(leaveType) || [] }))
      .filter((g) => g.lines.length > 0);
  }, [recordsInMonth, teachers, selectedMonth]);

  const displayedLeaveTypeGroups = useMemo(
    () => groupedByLeaveType.filter((g) => leaveTypeSelection.has(g.leaveType)),
    [groupedByLeaveType, leaveTypeSelection],
  );

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

  return (
    <div className="min-h-full bg-slate-100 text-slate-900 print:bg-white">
      <div className="max-w-[min(100%,120rem)] mx-auto px-3 sm:px-4 py-5 md:py-6">
        <div className="mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="text-indigo-600 shrink-0" size={28} />
              教師請假／代課查詢
            </h1>
            <p className="text-sm md:text-base text-slate-600 mt-1.5">
              當月依假別分區，以<strong>代課教師印領清冊</strong>格式呈現；同假別、同代課教師合併一列（欄位內多行對齊各筆，應發金額為合計）。
              <strong>列順序與 GAS 產出清冊一致</strong>（紀錄依建立時間新→舊掃描、代課者以主檔 id 分群；群組內再依日期與請假人排序）。可下方篩選假別。
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg shadow-sm shrink-0">
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
        </div>

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

        {groupedByLeaveType.length === 0 ? (
          <div className="rounded-lg border border-slate-300 bg-white p-12 text-center text-slate-600 text-base shadow-sm">
            <span className={NUM_FONT}>{selectedMonth}</span>
            月份沒有可列入印領清冊格式之代課明細（已排除固定兼課請假人之紀錄；與產報表相同）
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
        )}
      </div>
    </div>
  );
};

export default TeacherLeavePortal;
