import { HOMEROOM_FEE_MONTHLY, LeaveRecord, PayType, SubstituteDetail, Teacher } from '../types';
import { deduplicateDetails, getDaysInMonth, getExpectedDailyRateNoHomeroom } from './calculations';

export const toYMD = (d: string | number | undefined | null): string => {
  if (d == null) return '';
  const s = String(d).trim();
  if (!s) return '';
  const normalized = s.replace(/\//g, '-');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  return normalized;
};

export function resolveSubstituteTeacher(
  substituteTeacherId: string,
  teachers: Teacher[],
): Teacher | undefined {
  if (!substituteTeacherId || substituteTeacherId === 'pending') return undefined;
  return teachers.find((t) => t.id === substituteTeacherId || t.name === substituteTeacherId);
}

export function substituteDisplayName(substituteTeacherId: string, teachers: Teacher[]): string {
  if (!substituteTeacherId || substituteTeacherId === 'pending') return '待聘';
  return resolveSubstituteTeacher(substituteTeacherId, teachers)?.name ?? substituteTeacherId;
}

/** 與 GAS SheetManager.syncRecords 群組鍵一致：代課教師 id，待聘為字串「待聘」 */
export function gasSubstituteGroupKey(detail: SubstituteDetail): string {
  const id = detail.substituteTeacherId;
  if (!id || id === 'pending') return '待聘';
  return String(id).trim();
}

export function dateSortKeyYmd(ymd: string): number {
  const y = toYMD(ymd);
  if (!/^\d{4}-\d{2}-\d{2}/.test(y)) return 0;
  return Number(y.slice(0, 10).replace(/-/g, ''));
}

export function leaveTeacherDisplayName(record: LeaveRecord, teachers: Teacher[]): string {
  const t = teachers.find((x) => x.id === record.originalTeacherId || x.name === record.originalTeacherId);
  return t?.name ?? record.originalTeacherId ?? '—';
}

export type LedgerLine = {
  key: string;
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

function formatDateReceipt(ymd: string): string {
  const y = toYMD(ymd);
  const m = y.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${m[2]}/${m[3]}`;
}

export function buildLedgerLine(
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
    lineHomeroomFee = Math.ceil((HOMEROOM_FEE_MONTHLY / daysInMonth) * 0.5);
    substitutePayExclHm = ledgerFull - lineHomeroomFee;
  } else {
    lineDays = Number(detail.periodCount) || 0;
    linePeriods = 0;
    lineHomeroomDays = Number(detail.periodCount) || 0;
    lineHomeroomFee = Math.ceil((HOMEROOM_FEE_MONTHLY / daysInMonth) * lineHomeroomDays);
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
  const salaryPointsText =
    salaryPts != null && salaryPts > 0
      ? `${salaryPts}\n${subTeacher?.hasCertificate ? '(有證)' : '(無證)'}`
      : '—';
  const tableProduct =
    dailyRateNoHm != null && lineDays > 0 ? Math.ceil(dailyRateNoHm * lineDays) : null;
  let dailyRateText: string;
  if (detail.payType === PayType.HOURLY) {
    dailyRateText = dailyRateNoHm != null ? String(dailyRateNoHm) : '—';
  } else if (lineDays > 0 && dailyRateNoHm != null && tableProduct === substitutePayExclHm) {
    dailyRateText = String(dailyRateNoHm);
  } else if (lineDays > 0) {
    dailyRateText = String(Math.ceil(substitutePayExclHm / lineDays));
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

export type MergedLedgerRow = {
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

export function fmtLedgerQty(n: number): string {
  return n === 0 ? '0' : Number.isInteger(n) ? String(n) : String(n);
}

export function fmtLedgerInt(n: number): string {
  return String(Math.ceil(Number(n) || 0));
}

function uniformOrMultiline(values: string[]): string {
  if (values.length === 0) return '—';
  const first = values[0];
  if (values.every((v) => v === first)) return first;
  return values.join('\n');
}

export function mergeLedgerLinesBySubstituteTeacher(lines: LedgerLine[]): MergedLedgerRow[] {
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
