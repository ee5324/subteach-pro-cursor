import React, { useMemo, useState, useEffect } from 'react';
import {
  Calendar,
  Search,
  Wallet,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ClipboardList,
  FileText,
  PlusCircle,
  Save,
} from 'lucide-react';
import EduTrackApp from '../edutrack/App';
import { useAppStore } from '../store/useAppStore';
import { resolveTeacherDefaultSchedule, teacherMatchesClassKeyword } from '../utils/teacherSchedule';
import { calculateSubstituteMonthlyBreakdown } from '../utils/substituteCompensation';
import { PayType, type LeaveRecord, type ProcessingStatus, type SubstituteDetail, type Teacher, type TeacherScheduleSlot } from '../types';
import { deduplicateDetails } from '../utils/calculations';

type TabKey = 'weekly' | 'teacher' | 'salary' | 'recordsLite' | 'edutrack';

const MOBILE_RECORD_STATUS_OPTIONS: ProcessingStatus[] = ['待處理', '已印代課單', '跑章中', '結案待算'];
const MOBILE_PAY_TYPE_OPTIONS: PayType[] = [PayType.HOURLY, PayType.DAILY, PayType.HALF_DAY];

type MobileRecordLiteDraft = {
  processingStatus: ProcessingStatus;
  adminNote: string;
  details: SubstituteDetail[];
};

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
      dayName: ['週一', '週二', '週三', '週四', '週五'][i],
    });
  }
  return days;
};

const sortTeachersByName = (list: Teacher[]) =>
  [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hant'));

const toYMD = (d: unknown): string => {
  if (d == null) return '';
  const s = String(d).trim();
  if (!s) return '';
  const normalized = s.replace(/\//g, '-');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  return normalized;
};

const recordHasActualDateInMonth = (record: LeaveRecord, monthStartStr: string, monthEndStr: string): boolean => {
  const detailDates = deduplicateDetails(record.details || []).map((d) => toYMD(d.date)).filter(Boolean);
  const slotDates = (record.slots || []).map((s) => toYMD(s.date)).filter(Boolean);
  const actualDates = [...detailDates, ...slotDates];
  const start = toYMD(record.startDate || '');
  const end = toYMD(record.endDate || '');
  const inMonthByActual = actualDates.some((date) => date >= monthStartStr && date <= monthEndStr);
  const inMonthByRange = !!start && !!end && start <= monthEndStr && end >= monthStartStr;

  // 與完整清冊頁一致：實際明細日期或請假區間任一命中即列入，避免手機版漏單。
  return inMonthByActual || inMonthByRange;
};

function salaryDetailPeriodText(d: SubstituteDetail, periodOrder: string[]): string {
  let periodText = '';
  if (d.payType === PayType.HOURLY) {
    const periods = [...(d.selectedPeriods || [])].map((x) => String(x));
    periods.sort((a, b) => periodOrder.indexOf(a) - periodOrder.indexOf(b));
    periodText = periods.length > 0 ? `第${periods.join(',')}節` : `${d.periodCount || 0}節`;
  } else if (d.payType === PayType.HALF_DAY) {
    periodText = '半日薪';
  } else {
    periodText = `${d.periodCount || 1}日薪`;
  }
  return periodText;
}

/** 過濾 Firestore／匯入造成的異常節次，避免 map／篩選時拋錯 */
const sanitizeScheduleSlots = (raw: TeacherScheduleSlot[] | undefined): TeacherScheduleSlot[] =>
  (raw || []).filter((s) => s != null && typeof s === 'object') as TeacherScheduleSlot[];

const slotClassMatchesQuery = (slot: TeacherScheduleSlot | null | undefined, classQueryLower: string): boolean => {
  if (!classQueryLower || slot == null) return false;
  return String(slot.className ?? '').toLowerCase().includes(classQueryLower);
};

const TeacherWeekGrid: React.FC<{
  schedule: TeacherScheduleSlot[];
  highlightClassLower?: string;
}> = ({ schedule, highlightClassLower }) => {
  const rows = sanitizeScheduleSlots(schedule);
  return (
    <div className="grid grid-cols-5 gap-2">
      {[1, 2, 3, 4, 5].map((day) => (
        <div key={day} className="border border-slate-200 rounded-lg p-2">
          <div className="text-xs font-bold text-slate-600 mb-1">週{['一', '二', '三', '四', '五'][day - 1]}</div>
          {rows
            .filter((s) => s.day === day)
            .map((s, idx) => {
              const hit = !!highlightClassLower && slotClassMatchesQuery(s, highlightClassLower);
              return (
                <div
                  key={idx}
                  className={`text-[11px] border rounded p-1 mb-1 last:mb-0 ${
                    hit ? 'border-amber-300 bg-amber-50 font-medium' : 'border-slate-100 bg-slate-50'
                  }`}
                >
                  第{s.period}節 {s.subject != null ? String(s.subject) : ''} {String(s.className ?? '')}
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
};

const MobileQueryHub: React.FC = () => {
  const {
    records,
    teachers,
    holidays,
    overtimeRecords,
    fixedOvertimeConfig,
    settings,
    activeSemesterId,
    updateRecord,
  } = useAppStore();

  const teacherList = Array.isArray(teachers) ? teachers : [];
  const recordList = Array.isArray(records) ? records : [];

  const [tab, setTab] = useState<TabKey>('weekly');
  const [viewDate, setViewDate] = useState(new Date());
  const [teacherQuery, setTeacherQuery] = useState('');
  const [classQuery, setClassQuery] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [salaryTeacherQuery, setSalaryTeacherQuery] = useState('');
  const [salaryTeacherId, setSalaryTeacherId] = useState('');
  const [salaryMonth, setSalaryMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [recordMonth, setRecordMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [recordTeacherQuery, setRecordTeacherQuery] = useState('');
  const [recordQuery, setRecordQuery] = useState('');
  const [selectedRecordTeacherId, setSelectedRecordTeacherId] = useState('');
  const [recordDrafts, setRecordDrafts] = useState<Record<string, MobileRecordLiteDraft>>({});
  const [recordSavingId, setRecordSavingId] = useState<string | null>(null);
  const [recordSaveMessage, setRecordSaveMessage] = useState('');

  const weekDays = useMemo(() => getWeekDays(viewDate), [viewDate]);

  const weeklyMap = useMemo(() => {
    const map = new Map<string, { original: string; substitute: string; subject?: string; className?: string }[]>();
    recordList.forEach((record) => {
      (record.slots || []).forEach((slot) => {
        const key = `${slot.date}_${slot.period}`;
        if (!map.has(key)) map.set(key, []);
        const originalTeacher = teacherList.find((t) => t.id === record.originalTeacherId)?.name || record.originalTeacherId;
        const subTeacher = teacherList.find((t) => t.id === slot.substituteTeacherId)?.name || slot.substituteTeacherId || '待聘';
        map.get(key)?.push({
          original: originalTeacher,
          substitute: subTeacher,
          subject: slot.subject,
          className: slot.className,
        });
      });
    });
    return map;
  }, [recordList, teacherList]);

  const classQueryLower = useMemo(() => classQuery.trim().toLowerCase(), [classQuery]);

  const teachersForClassFilter = useMemo(() => {
    if (!classQueryLower) {
      return sortTeachersByName(teacherList);
    }
    return sortTeachersByName(
      teacherList.filter((t) => teacherMatchesClassKeyword(t, classQueryLower, activeSemesterId)),
    );
  }, [teacherList, classQueryLower, activeSemesterId]);

  const filteredTeachers = useMemo(() => {
    const q = teacherQuery.trim().toLowerCase();
    if (!q) return teachersForClassFilter;
    return teachersForClassFilter.filter(
      (t) =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.phone || '').includes(q) ||
        (t.subjects || '').toLowerCase().includes(q),
    );
  }, [teachersForClassFilter, teacherQuery]);

  useEffect(() => {
    if (!selectedTeacherId) return;
    if (!filteredTeachers.some((t) => t.id === selectedTeacherId)) {
      setSelectedTeacherId('');
    }
  }, [filteredTeachers, selectedTeacherId]);

  const selectedTeacher = useMemo(
    () => teacherList.find((t) => t.id === selectedTeacherId) || null,
    [teacherList, selectedTeacherId],
  );

  const selectedTeacherSchedule = useMemo(() => {
    const raw = resolveTeacherDefaultSchedule(selectedTeacher || undefined, activeSemesterId) || [];
    return sanitizeScheduleSlots(raw);
  }, [selectedTeacher, activeSemesterId]);

  const selectedSalaryTeacher = useMemo(
    () => teacherList.find((t) => t.id === salaryTeacherId) || null,
    [teacherList, salaryTeacherId],
  );

  /** 該月有代課明細或超鐘點清冊之教師（查詢時可檢視本月所有與代課／超鐘點相關之給付摘要） */
  const substituteTeacherIdsInMonth = useMemo(() => {
    const ids = new Set<string>();
    recordList.forEach((record) => {
      deduplicateDetails(record.details || []).forEach((d) => {
        if (!d.substituteTeacherId) return;
        if (!String(d.date || '').startsWith(salaryMonth)) return;
        ids.add(d.substituteTeacherId);
      });
    });
    (overtimeRecords || []).forEach((o) => {
      if (o.teacherId && o.yearMonth === salaryMonth) ids.add(o.teacherId);
    });
    return ids;
  }, [recordList, salaryMonth, overtimeRecords]);

  /** 該月月薪資整合「月合計」大於 0 者才列名單（排除各項皆 0 之幽靈列） */
  const salaryTeacherIdsWithNonZeroPayout = useMemo(() => {
    const ids = new Set<string>();
    const baseArgs = {
      yearMonth: salaryMonth,
      records: recordList,
      teachers: teacherList,
      overtimeRecords,
      fixedOvertimeConfig,
      holidays,
      settings,
      activeSemesterId,
    };
    substituteTeacherIdsInMonth.forEach((teacherId) => {
      const b = calculateSubstituteMonthlyBreakdown({ ...baseArgs, teacherId });
      if (b.grandTotal > 0) ids.add(teacherId);
    });
    return ids;
  }, [
    substituteTeacherIdsInMonth,
    salaryMonth,
    recordList,
    teacherList,
    overtimeRecords,
    fixedOvertimeConfig,
    holidays,
    settings,
    activeSemesterId,
  ]);

  useEffect(() => {
    if (!salaryTeacherId) return;
    if (!salaryTeacherIdsWithNonZeroPayout.has(salaryTeacherId)) {
      setSalaryTeacherId('');
    }
  }, [salaryTeacherId, salaryTeacherIdsWithNonZeroPayout]);

  const filteredSalaryTeachers = useMemo(() => {
    const base = sortTeachersByName(
      teacherList.filter((t) => salaryTeacherIdsWithNonZeroPayout.has(t.id)),
    );
    const q = salaryTeacherQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (t) =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.phone || '').includes(q) ||
        (t.subjects || '').toLowerCase().includes(q),
    );
  }, [teacherList, salaryTeacherQuery, salaryTeacherIdsWithNonZeroPayout]);

  const monthlyBreakdown = useMemo(() => {
    if (!selectedSalaryTeacher) return null;
    return calculateSubstituteMonthlyBreakdown({
      teacherId: selectedSalaryTeacher.id,
      yearMonth: salaryMonth,
      records: recordList,
      teachers: teacherList,
      overtimeRecords,
      fixedOvertimeConfig,
      holidays,
      settings,
      activeSemesterId,
    });
  }, [selectedSalaryTeacher, salaryMonth, recordList, teacherList, overtimeRecords, fixedOvertimeConfig, holidays, settings, activeSemesterId]);

  const salaryDetails = useMemo(() => {
    if (!selectedSalaryTeacher) return [];
    const periodOrder = ['早', '1', '2', '3', '4', '午', '5', '6', '7'];
    const rows: {
      date: string;
      originalTeacherName: string;
      periodText: string;
      amount: number;
      isPtaHomeroom: boolean;
      isOvertimeSubstitute: boolean;
    }[] = [];
    recordList.forEach((record) => {
      const originalTeacherName = teacherList.find((t) => t.id === record.originalTeacherId)?.name || record.originalTeacherId;
      deduplicateDetails(record.details || []).forEach((d) => {
        if (d.substituteTeacherId !== selectedSalaryTeacher.id) return;
        if (!String(d.date || '').startsWith(salaryMonth)) return;
        const isOvertimeSubstitute = d.isOvertime === true;
        const periodText = salaryDetailPeriodText(d, periodOrder);
        const isPtaHomeroom = !!record.homeroomFeeByPta && record.leaveType !== '自理 (事假/病假)';
        rows.push({
          date: String(d.date || ''),
          originalTeacherName,
          periodText,
          amount: Number(d.calculatedAmount) || 0,
          isPtaHomeroom,
          isOvertimeSubstitute,
        });
      });
    });
    rows.sort(
      (a, b) =>
        (a.date || '').localeCompare(b.date || '') ||
        (a.originalTeacherName || '').localeCompare(b.originalTeacherName || '', 'zh-Hant'),
    );
    return rows;
  }, [selectedSalaryTeacher, salaryMonth, recordList, teacherList]);

  const recordsLiteList = useMemo(() => {
    const teacherNameById = new Map(teacherList.map((t) => [t.id, t.name || t.id]));
    const [year, month] = recordMonth.split('-').map(Number);
    const monthStartStr = `${recordMonth}-01`;
    const monthEndStr = `${recordMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
    return recordList
      .filter((r) => recordHasActualDateInMonth(r, monthStartStr, monthEndStr))
      .map((r) => {
        const teacherName = teacherNameById.get(r.originalTeacherId) || r.originalTeacherId;
        return { record: r, teacherName };
      })
      .sort((a, b) => (b.record.startDate || '').localeCompare(a.record.startDate || ''));
  }, [recordList, recordMonth, teacherList]);

  const recordsLiteTeachers = useMemo(() => {
    const byTeacher = new Map<string, { teacherId: string; teacherName: string; count: number }>();
    recordsLiteList.forEach(({ record, teacherName }) => {
      const key = record.originalTeacherId || '';
      const prev = byTeacher.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        byTeacher.set(key, { teacherId: key, teacherName, count: 1 });
      }
    });
    const q = recordTeacherQuery.trim().toLowerCase();
    return [...byTeacher.values()]
      .filter((x) => !q || x.teacherName.toLowerCase().includes(q))
      .sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'zh-Hant'));
  }, [recordsLiteList, recordTeacherQuery]);

  useEffect(() => {
    if (recordsLiteTeachers.length === 0) {
      setSelectedRecordTeacherId('');
      return;
    }
    if (!recordsLiteTeachers.some((t) => t.teacherId === selectedRecordTeacherId)) {
      setSelectedRecordTeacherId(recordsLiteTeachers[0].teacherId);
    }
  }, [recordsLiteTeachers, selectedRecordTeacherId]);

  const selectedTeacherRecordsLiteList = useMemo(() => {
    const q = recordQuery.trim().toLowerCase();
    return recordsLiteList.filter(({ record, teacherName }) => {
      if (record.originalTeacherId !== selectedRecordTeacherId) return false;
      if (!q) return true;
      return (
        teacherName.toLowerCase().includes(q) ||
        (record.leaveType || '').toLowerCase().includes(q) ||
        (record.reason || '').toLowerCase().includes(q) ||
        (record.docId || '').toLowerCase().includes(q)
      );
    });
  }, [recordsLiteList, selectedRecordTeacherId, recordQuery]);

  useEffect(() => {
    setRecordDrafts((prev) => {
      const next: Record<string, MobileRecordLiteDraft> = {};
      recordsLiteList.forEach(({ record }) => {
        const existing = prev[record.id];
        next[record.id] = existing || {
          processingStatus: (record.processingStatus || '待處理') as ProcessingStatus,
          adminNote: record.adminNote || '',
          details: deduplicateDetails(record.details || []).map((d) => ({ ...d })),
        };
      });
      return next;
    });
  }, [recordsLiteList]);

  const updateRecordDraft = (id: string, patch: Partial<MobileRecordLiteDraft>) => {
    setRecordDrafts((prev) => ({
      ...prev,
      [id]: {
        processingStatus: prev[id]?.processingStatus || '待處理',
        adminNote: prev[id]?.adminNote || '',
        details: prev[id]?.details || [],
        ...patch,
      },
    }));
  };

  const updateRecordDetailDraft = (recordId: string, detailId: string, patch: Partial<SubstituteDetail>) => {
    setRecordDrafts((prev) => {
      const base = prev[recordId];
      if (!base) return prev;
      const nextDetails = (base.details || []).map((d) => (d.id === detailId ? { ...d, ...patch } : d));
      return {
        ...prev,
        [recordId]: {
          ...base,
          details: nextDetails,
        },
      };
    });
  };

  const saveRecordLite = async (target: LeaveRecord) => {
    const draft = recordDrafts[target.id];
    if (!draft) return;
    setRecordSavingId(target.id);
    setRecordSaveMessage('');
    try {
      const merged: LeaveRecord = {
        ...target,
        processingStatus: draft.processingStatus,
        adminNote: draft.adminNote.trim() || undefined,
        details: (draft.details || []).map((d) => ({
          ...d,
          date: toYMD(d.date),
          periodCount: Number(d.periodCount) || 0,
          calculatedAmount: Number(d.calculatedAmount) || 0,
          selectedPeriods: Array.isArray(d.selectedPeriods)
            ? d.selectedPeriods.map((x) => String(x)).filter((x) => x.length > 0)
            : [],
        })),
      };
      await updateRecord(merged);
      setRecordSaveMessage(`已儲存：${target.startDate} ${draft.processingStatus}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '儲存失敗，請稍後再試。';
      setRecordSaveMessage(msg);
    } finally {
      setRecordSavingId(null);
    }
  };

  const openSalaryTab = () => {
    if (!selectedSalaryTeacher || !monthlyBreakdown) return;
    const popup = window.open('', '_blank');
    if (!popup) return;
    const title = `${selectedSalaryTeacher.name} ${salaryMonth} 薪資整合`;
    const systemUrl = `${window.location.origin}${window.location.pathname}#/`;
    const detailCardsHtml = salaryDetails.length === 0
      ? `<div style="padding:14px;border:1px solid #e2e8f0;border-radius:12px;text-align:center;color:#94a3b8;background:#ffffff;">本月無代課明細</div>`
      : salaryDetails.map((row) => {
          const amtStyle = row.isOvertimeSubstitute
            ? 'font-weight:700;color:#6d28d9;font-size:14px;'
            : 'font-weight:700;color:#334155;font-size:14px;';
          const otNote = row.isOvertimeSubstitute
            ? '<div style="margin-top:4px;font-size:11px;color:#6d28d9;">※ 超鐘點時段；該月實際給付已合併於摘要「超鐘點（另冊）」欄（與代課費、家長會加計合計見「代課費＋家長會加計＋超鐘點」小計）。</div>'
            : '';
          return `
          <div style="border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;background:#ffffff;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
              <div style="font-weight:700;color:#0f172a;font-size:14px;">${row.date}</div>
              <div style="${amtStyle}">$${row.amount.toLocaleString()}</div>
            </div>
            <div style="margin-top:6px;font-size:13px;color:#334155;">請假教師：${row.originalTeacherName}</div>
            <div style="margin-top:4px;font-size:13px;color:#475569;">節數：${row.periodText}${
              row.isOvertimeSubstitute
                ? '<span style="display:inline-block;margin-left:6px;font-size:11px;padding:2px 6px;border-radius:4px;background:#ede9fe;color:#6d28d9;font-weight:600;vertical-align:middle;">超鐘點代課</span>'
                : ''
            }${
              row.isPtaHomeroom
                ? '<span style="display:inline-block;margin-left:6px;font-size:11px;padding:2px 6px;border-radius:4px;background:#ede9fe;color:#6d28d9;font-weight:600;vertical-align:middle;">家長會導師費</span>'
                : ''
            }</div>
            ${otNote}
          </div>
        `;
        }).join('');
    popup.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        </head>
      <body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#0f172a;">
        <div style="max-width:720px;margin:0 auto;padding:14px;">
          <div style="background:linear-gradient(135deg,#4338ca,#0ea5e9);color:#fff;border-radius:16px;padding:14px 14px 12px 14px;box-shadow:0 10px 25px rgba(37,99,235,0.2);">
            <div style="font-size:18px;font-weight:800;line-height:1.35;">${title}</div>
            <div style="margin-top:6px;font-size:12px;opacity:0.95;">本月代課費、超鐘點（另冊核算）、固定兼課、導師費等整合摘要</div>
          </div>

          <div style="margin-top:12px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <div style="display:flex;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;"><span>代課費（含導師費）</span><strong>$${monthlyBreakdown.substituteTotal.toLocaleString()}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#64748b;"><span>導師費（估算，已含於代課費）</span><span>$${monthlyBreakdown.homeroomFeeEstimate.toLocaleString()}</span></div>
            <div style="display:flex;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#7c3aed;"><span>家長會導師費（加計）</span><strong>$${monthlyBreakdown.ptaHomeroomFeeTotal.toLocaleString()}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;"><span>超鐘點（另冊）</span><strong>$${monthlyBreakdown.overtimeTotal.toLocaleString()}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;background:#eff6ff;"><span style="font-weight:700;color:#1e40af;">代課費＋家長會加計＋超鐘點（小計）</span><strong style="color:#1e40af;">$${(monthlyBreakdown.substituteTotal + monthlyBreakdown.ptaHomeroomFeeTotal + monthlyBreakdown.overtimeTotal).toLocaleString()}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;"><span>固定兼課</span><strong>$${monthlyBreakdown.fixedOvertimeTotal.toLocaleString()}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:12px;background:#ecfdf5;font-size:15px;font-weight:800;"><span>月合計</span><span style="color:#0f766e;">$${monthlyBreakdown.grandTotal.toLocaleString()}</span></div>
          </div>

          <div style="margin-top:14px;">
            <div style="font-size:15px;font-weight:800;margin-bottom:8px;color:#1e293b;">本月代課節次明細（${salaryMonth}）</div>
            <div style="display:grid;gap:8px;">${detailCardsHtml}</div>
          </div>

          <div style="position:sticky;bottom:0;margin-top:14px;padding:10px 0;background:linear-gradient(to top, #f8fafc 70%, rgba(248,250,252,0));display:flex;gap:8px;justify-content:stretch;">
            <a href="${systemUrl}" style="flex:1;display:inline-flex;align-items:center;justify-content:center;padding:11px 12px;border-radius:10px;background:#4f46e5;color:white;text-decoration:none;font-size:14px;font-weight:700;">返回系統</a>
            <button onclick="window.close()" style="flex:1;padding:11px 12px;border-radius:10px;border:1px solid #cbd5e1;background:white;color:#334155;font-size:14px;font-weight:600;">關閉此頁</button>
          </div>
        </div>
      </body></html>
    `);
    popup.document.close();
  };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold text-slate-800 mb-3">手機查詢中心</h1>
      <p className="text-sm text-slate-500 mb-4">
        單一網址提供總表週課、教師課表搜尋、代課老師月薪資整合，以及教學組事務（與主站登入／白名單一致）。
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        <button
          type="button"
          onClick={() => setTab('weekly')}
          className={`px-2 py-2.5 rounded-lg text-xs sm:text-sm touch-manipulation ${tab === 'weekly' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}
        >
          總表週課
        </button>
        <button
          type="button"
          onClick={() => setTab('teacher')}
          className={`px-2 py-2.5 rounded-lg text-xs sm:text-sm touch-manipulation ${tab === 'teacher' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}
        >
          教師課表
        </button>
        <button
          type="button"
          onClick={() => setTab('salary')}
          className={`px-2 py-2.5 rounded-lg text-xs sm:text-sm touch-manipulation ${tab === 'salary' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}
        >
          代課薪資
        </button>
        <button
          type="button"
          onClick={() => setTab('recordsLite')}
          className={`px-2 py-2.5 rounded-lg text-xs sm:text-sm touch-manipulation flex items-center justify-center gap-1 ${tab === 'recordsLite' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}
        >
          <FileText size={14} className="shrink-0" />
          清冊/憑證
        </button>
        <button
          type="button"
          onClick={() => setTab('edutrack')}
          className={`px-2 py-2.5 rounded-lg text-xs sm:text-sm touch-manipulation flex items-center justify-center gap-1 ${tab === 'edutrack' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}
        >
          <ClipboardList size={14} className="shrink-0" />
          教學組
        </button>
      </div>

      {tab === 'weekly' && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-3 flex items-center justify-between border-b border-slate-200">
            <div className="flex items-center gap-2 text-slate-700 font-semibold"><Calendar size={16} /> 代課總表（週）</div>
            <div className="flex items-center gap-1">
              <button onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7))} className="p-1.5 border rounded"><ChevronLeft size={16} /></button>
              <span className="text-xs text-slate-500 min-w-[110px] text-center">{weekDays[0].label} ~ {weekDays[4].label}</span>
              <button onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7))} className="p-1.5 border rounded"><ChevronRight size={16} /></button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[820px] w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2 border">節</th>
                  {weekDays.map((d) => <th key={d.dateStr} className="p-2 border">{d.dayName}<div className="text-[10px] text-slate-400">{d.label}</div></th>)}
                </tr>
              </thead>
              <tbody>
                {PERIOD_ROWS.map((p) => (
                  <tr key={p.id}>
                    <td className="p-2 border text-center font-semibold">{p.label}</td>
                    {weekDays.map((d) => {
                      const items = weeklyMap.get(`${d.dateStr}_${p.id}`) || [];
                      return (
                        <td key={`${d.dateStr}_${p.id}`} className="p-1.5 border align-top">
                          <div className="space-y-1">
                            {items.map((x, idx) => (
                              <div key={idx} className="rounded border border-slate-200 bg-slate-50 p-1">
                                <div className="font-semibold">{x.original} → {x.substitute}</div>
                                <div className="text-slate-500">{x.subject || ''} {x.className || ''}</div>
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
        </section>
      )}

      {tab === 'teacher' && (
        <section className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="flex items-center gap-2 font-semibold text-slate-700 mb-2"><Search size={16} /> 教師課表快速搜尋</div>
          <p className="text-xs text-slate-500 mb-2">
            與教師管理搜尋一致：含「任課班級」資料欄與課表各節班級；可與下方教師關鍵字一併篩選。
          </p>
          <input
            type="text"
            value={classQuery}
            onChange={(e) => setClassQuery(e.target.value)}
            placeholder="班級關鍵字（例：301、三年甲、任課班級）"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mb-2"
          />
          <input
            value={teacherQuery}
            onChange={(e) => setTeacherQuery(e.target.value)}
            placeholder="教師：姓名 / 電話 / 科目"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mb-3"
          />

          {classQueryLower !== '' && (
            <div className="mb-4 border border-amber-100 bg-amber-50/40 rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-amber-100 bg-amber-50/80 text-sm font-semibold text-amber-950">
                班級「{classQuery.trim()}」相關教師課表（{teachersForClassFilter.length} 人）
              </div>
              <div className="max-h-[480px] overflow-y-auto p-3 space-y-4">
                {teachersForClassFilter.length === 0 ? (
                  <div className="text-sm text-slate-500 text-center py-6 px-2">
                    沒有教師的「任課班級」或本學期課表各班級欄位包含此關鍵字。請確認系統綁定學期與教師管理資料是否一致。
                  </div>
                ) : (
                  teachersForClassFilter.map((t) => {
                    const sch = sanitizeScheduleSlots(
                      resolveTeacherDefaultSchedule(t, activeSemesterId) || [],
                    );
                    const tc = String(t.teachingClasses ?? '').toLowerCase();
                    const teachingHit = classQueryLower !== '' && tc.includes(classQueryLower);
                    const scheduleHit = sch.some((s) => slotClassMatchesQuery(s, classQueryLower));
                    const isHomeroom = t.isHomeroom === true;
                    return (
                      <div
                        key={t.id}
                        className={`border rounded-lg p-3 bg-white ${
                          isHomeroom ? 'border-violet-200 bg-violet-50/40' : 'border-slate-200'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <div className="font-semibold text-slate-800">{t.name}</div>
                            {isHomeroom && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full border border-violet-200 bg-violet-100 text-violet-800 font-semibold">
                                導師
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedTeacherId(t.id)}
                            className="text-xs px-2 py-1 rounded-md border border-indigo-200 text-indigo-700 bg-indigo-50"
                          >
                            在下方清單聚焦
                          </button>
                        </div>
                        {teachingHit && (
                          <div className="text-xs text-amber-950 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 mb-2">
                            任課班級：
                            {t.teachingClasses != null && String(t.teachingClasses).trim() !== ''
                              ? String(t.teachingClasses)
                              : '（未填）'}
                            {!scheduleHit && sch.length > 0 && (
                              <span className="text-amber-800"> — 課表各節「班級」未含此關鍵字；命中來自任課班級欄位。</span>
                            )}
                          </div>
                        )}
                        {sch.length === 0 ? (
                          <div className="text-sm text-slate-500 py-2">尚未設定本學期預設週課表。</div>
                        ) : (
                          <TeacherWeekGrid schedule={sch} highlightClassLower={classQueryLower} />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          <div className="text-xs font-medium text-slate-600 mb-1">教師清單{classQueryLower ? '（已依班級篩選）' : ''}</div>
          <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg mb-3">
            {filteredTeachers.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTeacherId(t.id)}
                className={`w-full text-left px-3 py-2 border-b last:border-b-0 text-sm ${
                  selectedTeacherId === t.id
                    ? 'bg-indigo-50'
                    : classQueryLower !== '' && t.isHomeroom === true
                      ? 'bg-violet-50/60'
                      : 'bg-white'
                }`}
              >
                <div className="font-medium flex items-center gap-2">
                  <span>{t.name}</span>
                  {classQueryLower !== '' && t.isHomeroom === true && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-violet-200 bg-violet-100 text-violet-800 font-semibold">
                      導師
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">{t.phone || '無電話'} / {t.subjects || '無科目'}</div>
              </button>
            ))}
            {filteredTeachers.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-slate-400">沒有符合條件的教師</div>
            )}
          </div>
          {selectedTeacher && (
            <div>
              <div className="font-semibold text-slate-800 mb-2">{selectedTeacher.name}（綁定學期課表）</div>
              {classQueryLower !== '' &&
                String(selectedTeacher.teachingClasses ?? '').toLowerCase().includes(classQueryLower) &&
                !selectedTeacherSchedule.some((s) => slotClassMatchesQuery(s, classQueryLower)) && (
                  <div className="text-xs text-amber-950 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 mb-2">
                    任課班級：
                    {selectedTeacher.teachingClasses != null &&
                    String(selectedTeacher.teachingClasses).trim() !== ''
                      ? String(selectedTeacher.teachingClasses)
                      : '（未填）'}
                    {selectedTeacherSchedule.length > 0
                      ? ' — 課表各節「班級」未含此關鍵字；節次列表仍顯示供對照。'
                      : ''}
                  </div>
                )}
              {selectedTeacherSchedule.length === 0 ? (
                <div className="text-sm text-slate-500">尚未設定本學期預設週課表。</div>
              ) : (
                <TeacherWeekGrid
                  schedule={selectedTeacherSchedule}
                  highlightClassLower={classQueryLower || undefined}
                />
              )}
            </div>
          )}
        </section>
      )}

      {tab === 'salary' && (
        <section className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="flex items-center gap-2 font-semibold text-slate-700 mb-1"><Wallet size={16} /> 代課老師月薪資整合</div>
          <p className="text-xs text-slate-500 mb-2">僅列出所選月份在代課紀錄中有明細的教師。</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
            <input
              value={salaryTeacherQuery}
              onChange={(e) => setSalaryTeacherQuery(e.target.value)}
              placeholder="輸入教師姓名查詢"
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
            <input type="month" value={salaryMonth} onChange={(e) => setSalaryMonth(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            <button
              onClick={openSalaryTab}
              disabled={!monthlyBreakdown}
              className="px-3 py-2 border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-lg text-sm disabled:opacity-50 flex items-center justify-center gap-1"
            >
              <ExternalLink size={14} /> 另開分頁顯示
            </button>
          </div>
          <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-lg mb-3">
            {filteredSalaryTeachers.map((t) => (
              <button
                key={t.id}
                onClick={() => setSalaryTeacherId(t.id)}
                className={`w-full text-left px-3 py-2 border-b last:border-b-0 text-sm ${salaryTeacherId === t.id ? 'bg-indigo-50' : 'bg-white'}`}
              >
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-slate-500">{t.phone || '無電話'} / {t.subjects || '無科目'}</div>
              </button>
            ))}
            {filteredSalaryTeachers.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-slate-400">
                {substituteTeacherIdsInMonth.size === 0
                  ? `所選月份（${salaryMonth}）尚無代課或超鐘點薪資資料。`
                  : salaryTeacherIdsWithNonZeroPayout.size === 0
                    ? `所選月份（${salaryMonth}）代課薪資合計皆為 0，無列示代課老師。`
                    : '找不到符合查詢的教師。'}
              </div>
            )}
          </div>
          {selectedSalaryTeacher && monthlyBreakdown && (
            <>
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-sm mb-3">
                <div className="flex justify-between p-3"><span>代課費（含導師費）</span><span className="font-semibold">${monthlyBreakdown.substituteTotal.toLocaleString()}</span></div>
                <div className="flex justify-between p-3 text-slate-500"><span>導師費（估算，已含於代課費）</span><span>${monthlyBreakdown.homeroomFeeEstimate.toLocaleString()}</span></div>
                <div className="flex justify-between p-3 text-violet-700 bg-violet-50/60"><span>家長會導師費（加計）</span><span className="font-semibold">${monthlyBreakdown.ptaHomeroomFeeTotal.toLocaleString()}</span></div>
                <div className="flex justify-between p-3"><span>超鐘點（另冊）</span><span className="font-semibold">${monthlyBreakdown.overtimeTotal.toLocaleString()}</span></div>
                <div className="flex justify-between p-3 bg-sky-50 text-sky-900">
                  <span className="font-semibold">代課費＋家長會加計＋超鐘點（小計）</span>
                  <span className="font-bold tabular-nums">
                    $
                    {(
                      monthlyBreakdown.substituteTotal +
                      monthlyBreakdown.ptaHomeroomFeeTotal +
                      monthlyBreakdown.overtimeTotal
                    ).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between p-3"><span>固定兼課</span><span className="font-semibold">${monthlyBreakdown.fixedOvertimeTotal.toLocaleString()}</span></div>
                <div className="flex justify-between p-3 bg-emerald-50"><span className="font-bold">月合計</span><span className="font-bold text-emerald-700">${monthlyBreakdown.grandTotal.toLocaleString()}</span></div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-700">
                  本月代課節次明細（{salaryMonth}）
                </div>
                <p className="px-3 py-2 text-[11px] text-slate-500 border-b border-slate-100 bg-slate-50/50">
                  下列為本月每次代課（含超鐘點時段）。超鐘點列右側為單筆試算；該月實際超鐘點給付以上方「超鐘點（另冊）」為準，勿與「代課費」重複加總。若要一眼看「代課費＋家長會加計＋超鐘點」合計，請看上方小計列。
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-slate-600 border-b border-slate-200">日期</th>
                        <th className="px-3 py-2 text-left text-slate-600 border-b border-slate-200">請假教師</th>
                        <th className="px-3 py-2 text-left text-slate-600 border-b border-slate-200">節數（第幾節）</th>
                        <th className="px-3 py-2 text-right text-slate-600 border-b border-slate-200">金額</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {salaryDetails.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                            {monthlyBreakdown.substituteTotal > 0 || monthlyBreakdown.overtimeTotal > 0
                              ? '本月無可逐筆列出之請假代課明細（若仍有代課費或超鐘點金額，請以上方摘要為準；僅有超鐘點者依另冊核算）。'
                              : '本月無代課明細。'}
                          </td>
                        </tr>
                      ) : (
                        salaryDetails.map((row, idx) => (
                          <tr key={`${row.date}_${row.originalTeacherName}_${idx}`}>
                            <td className="px-3 py-2 text-slate-700">{row.date}</td>
                            <td className="px-3 py-2 text-slate-700">{row.originalTeacherName}</td>
                            <td className="px-3 py-2 text-slate-600">
                              {row.periodText}
                              {row.isOvertimeSubstitute && (
                                <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">
                                  超鐘點代課
                                </span>
                              )}
                              {row.isPtaHomeroom && (
                                <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">
                                  家長會導師費
                                </span>
                              )}
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-semibold tabular-nums ${
                                row.isOvertimeSubstitute ? 'text-violet-700' : 'text-slate-700'
                              }`}
                              title={
                                row.isOvertimeSubstitute
                                  ? '超鐘點時段單筆試算；該月實際給付見摘要「超鐘點（另冊）」'
                                  : undefined
                              }
                            >
                              ${row.amount.toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
          {!selectedSalaryTeacher && <div className="text-sm text-slate-400">請先選擇代課老師。</div>}
        </section>
      )}

      {tab === 'recordsLite' && (
        <section className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-semibold text-slate-700">
                <FileText size={16} />
                代課清冊/憑證（簡易）
              </div>
              <p className="text-xs text-slate-500 mt-1">
                僅提供手機快速調整「憑證狀態、管理備註」；完整匯出與進階功能請開啟原頁面。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { window.location.hash = '#/records'; }}
              className="w-full px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-semibold flex items-center justify-center gap-1.5"
            >
              <ExternalLink size={14} />
              開完整代課清冊/憑證
            </button>
            <button
              type="button"
              onClick={() => { window.location.hash = '#/entry'; }}
              className="w-full px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold flex items-center justify-center gap-1.5"
            >
              <PlusCircle size={14} />
              新增代課單（手機）
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="month"
              value={recordMonth}
              onChange={(e) => setRecordMonth(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
            <input
              value={recordTeacherQuery}
              onChange={(e) => setRecordTeacherQuery(e.target.value)}
              placeholder="先搜尋教師"
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
            <input
              value={recordQuery}
              onChange={(e) => setRecordQuery(e.target.value)}
              placeholder="再篩選假單：假別/事由/公文"
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          {recordSaveMessage && (
            <div className="text-xs rounded-md px-2.5 py-2 bg-slate-50 border border-slate-200 text-slate-600">
              {recordSaveMessage}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-3">
            <aside className="border border-slate-200 rounded-lg overflow-hidden bg-white">
              <div className="px-3 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 bg-slate-50">
                教師（{recordsLiteTeachers.length}）
              </div>
              <div className="max-h-80 overflow-y-auto">
                {recordsLiteTeachers.map((t) => (
                  <button
                    key={t.teacherId}
                    type="button"
                    onClick={() => setSelectedRecordTeacherId(t.teacherId)}
                    className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-b-0 ${
                      selectedRecordTeacherId === t.teacherId ? 'bg-indigo-50' : 'bg-white'
                    }`}
                  >
                    <div className="text-sm font-medium text-slate-800">{t.teacherName}</div>
                    <div className="text-xs text-slate-500">{t.count} 筆假單</div>
                  </button>
                ))}
                {recordsLiteTeachers.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-slate-400">這個月份沒有可編修資料。</div>
                )}
              </div>
            </aside>

            <div className="space-y-2">
            {selectedTeacherRecordsLiteList.map(({ record, teacherName }) => {
              const draft = recordDrafts[record.id] || {
                processingStatus: (record.processingStatus || '待處理') as ProcessingStatus,
                adminNote: record.adminNote || '',
                details: deduplicateDetails(record.details || []).map((d) => ({ ...d })),
              };
              const isSaving = recordSavingId === record.id;
              return (
                <article key={record.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{teacherName}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{record.startDate} ~ {record.endDate}</div>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                      {record.leaveType}
                    </span>
                  </div>

                  <label className="block text-xs font-semibold text-slate-600 mt-2 mb-1">憑證狀態</label>
                  <select
                    value={draft.processingStatus}
                    onChange={(e) => updateRecordDraft(record.id, { processingStatus: e.target.value as ProcessingStatus })}
                    className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {MOBILE_RECORD_STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>

                  <label className="block text-xs font-semibold text-slate-600 mt-2 mb-1">管理備註</label>
                  <textarea
                    value={draft.adminNote}
                    onChange={(e) => updateRecordDraft(record.id, { adminNote: e.target.value })}
                    rows={2}
                    placeholder="例如：已印 4/13、跑章中"
                    className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-lg bg-white resize-y"
                  />

                  <div className="mt-2 border border-slate-200 rounded-lg bg-white">
                    <div className="px-2.5 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200">
                      代課明細（可直接改）
                    </div>
                    <div className="p-2 space-y-2">
                      {(draft.details || []).map((d) => (
                        <div key={d.id} className="border border-slate-200 rounded-md p-2">
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="date"
                              value={toYMD(d.date)}
                              onChange={(e) => updateRecordDetailDraft(record.id, d.id, { date: e.target.value })}
                              className="px-2 py-1.5 text-sm border border-slate-200 rounded"
                            />
                            <select
                              value={d.payType}
                              onChange={(e) => updateRecordDetailDraft(record.id, d.id, { payType: e.target.value as PayType })}
                              className="px-2 py-1.5 text-sm border border-slate-200 rounded"
                            >
                              {MOBILE_PAY_TYPE_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                            <select
                              value={d.substituteTeacherId || ''}
                              onChange={(e) => updateRecordDetailDraft(record.id, d.id, { substituteTeacherId: e.target.value })}
                              className="px-2 py-1.5 text-sm border border-slate-200 rounded"
                            >
                              <option value="">待聘</option>
                              {sortTeachersByName(teacherList).map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={Number(d.periodCount) || 0}
                              onChange={(e) => updateRecordDetailDraft(record.id, d.id, { periodCount: Number(e.target.value) || 0 })}
                              className="px-2 py-1.5 text-sm border border-slate-200 rounded"
                              placeholder="節數/天數"
                            />
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={Number(d.calculatedAmount) || 0}
                              onChange={(e) => updateRecordDetailDraft(record.id, d.id, { calculatedAmount: Number(e.target.value) || 0 })}
                              className="px-2 py-1.5 text-sm border border-slate-200 rounded col-span-2"
                              placeholder="金額"
                            />
                            <input
                              type="text"
                              value={Array.isArray(d.selectedPeriods) ? d.selectedPeriods.join(',') : ''}
                              onChange={(e) =>
                                updateRecordDetailDraft(record.id, d.id, {
                                  selectedPeriods: e.target.value
                                    .split(',')
                                    .map((x) => x.trim())
                                    .filter((x) => x.length > 0),
                                })
                              }
                              className="px-2 py-1.5 text-sm border border-slate-200 rounded col-span-2"
                              placeholder="節次（逗號分隔，例如 早,1,2）"
                            />
                          </div>
                        </div>
                      ))}
                      {(draft.details || []).length === 0 && (
                        <div className="text-xs text-slate-400 py-2 text-center">此筆沒有可編輯代課明細。</div>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => saveRecordLite(record)}
                      className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-60 flex items-center gap-1"
                    >
                      <Save size={14} />
                      {isSaving ? '儲存中…' : '儲存'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { window.location.hash = `#/entry/${record.id}`; }}
                      className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm"
                    >
                      開完整編輯
                    </button>
                  </div>
                </article>
              );
            })}
            {selectedTeacherRecordsLiteList.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-slate-400 border border-dashed border-slate-300 rounded-lg">
                請先選擇教師，或目前教師在此篩選下沒有假單。
              </div>
            )}
            </div>
          </div>
        </section>
      )}

      {tab === 'edutrack' && (
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
          <div className="p-3 flex items-start gap-2 border-b border-slate-200 bg-slate-50/80">
            <ClipboardList size={18} className="text-indigo-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="font-semibold text-slate-800">教學組事務</div>
              <p className="text-xs text-slate-500 mt-0.5">
                行政行事曆、語言選修、計畫專案、考卷存檔等；需具教學組白名單權限。左側選單改為手機選單圖示開啟。
              </p>
            </div>
          </div>
          <div className="h-[min(70vh,calc(100dvh-13rem))] min-h-[320px] flex flex-col">
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-b-xl bg-slate-50">
              <EduTrackApp embedded mobileHub />
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default MobileQueryHub;
