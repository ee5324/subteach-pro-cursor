import React, { useMemo, useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, User, BookOpen } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { LeaveRecord, LeaveType, Teacher, TeacherType } from '../types';
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

function originalMatchesTeacher(r: LeaveRecord, teacher: Teacher): boolean {
  const oid = String(r.originalTeacherId ?? '').trim();
  if (!oid) return false;
  if (oid === teacher.id) return true;
  if (oid === teacher.name) return true;
  return false;
}

/**
 * 與代課清冊「依代課人」標籤邏輯一致：該月 slots（非超鐘）＋ 當月明細之代課者，有代課紀錄才列入。
 */
function collectSubstituteTeacherIdsInMonth(
  records: LeaveRecord[],
  monthStartStr: string,
  monthEndStr: string,
  selectedMonth: string,
): string[] {
  const fromDetails = new Set<string>();
  const fromSlots = new Set<string>();
  for (const r of records) {
    if (!recordTouchesMonth(r, monthStartStr, monthEndStr)) continue;
    if (!r.slots || r.slots.length === 0) continue;
    const detailsDeduped = deduplicateDetails(r.details || []);
    detailsDeduped.forEach((d) => {
      if (d.substituteTeacherId && toYMD(d.date).startsWith(selectedMonth)) {
        fromDetails.add(d.substituteTeacherId);
      }
    });
    r.slots.forEach((s) => {
      if (!s.substituteTeacherId) return;
      const ymd = toYMD(s.date);
      if (!ymd || !ymd.startsWith(selectedMonth)) return;
      if (s.isOvertime === true) return;
      fromSlots.add(s.substituteTeacherId);
    });
  }
  return Array.from(new Set([...fromDetails, ...fromSlots]));
}

type LeaveTypeRow = {
  leaveType: LeaveType;
  /** 擔任代課：當月明細筆數（不含超鐘點） */
  substituteDetailCount: number;
  /** 擔任代課：金額加總 */
  substituteIncome: number;
  /** 擔任請假人：該假別之請假單筆數（當月有明細者） */
  leaveAsOriginalRecordCount: number;
  /** 擔任請假人：當月應付代課費加總 */
  leaveAsOriginalCost: number;
};

const TeacherLeavePortal: React.FC = () => {
  const { currentUser, teachers, records, subteachAllowedUsers, isSubteachAdmin, loading } = useAppStore();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  /** 僅能選「當月有代課紀錄」之代課教師 id */
  const [selectedSubTeacherId, setSelectedSubTeacherId] = useState('');

  const { monthStartStr, monthEndStr } = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return {
      monthStartStr: `${selectedMonth}-01`,
      monthEndStr: `${selectedMonth}-${String(lastDay).padStart(2, '0')}`,
    };
  }, [selectedMonth]);

  const selfWhitelist = useMemo(() => {
    const em = (currentUser?.email || '').trim().toLowerCase();
    if (!em) return undefined;
    return subteachAllowedUsers.find((u) => (u.email || '').toLowerCase() === em);
  }, [currentUser?.email, subteachAllowedUsers]);

  const recordsInMonth = useMemo(
    () => records.filter((r) => recordTouchesMonth(r, monthStartStr, monthEndStr)),
    [records, monthStartStr, monthEndStr],
  );

  const substituteIdsInMonth = useMemo(
    () => collectSubstituteTeacherIdsInMonth(records, monthStartStr, monthEndStr, selectedMonth),
    [records, monthStartStr, monthEndStr, selectedMonth],
  );

  const substituteTeacherOptions = useMemo(() => {
    return substituteIdsInMonth
      .map((id) => ({
        id,
        name: id === 'pending' ? '待聘' : teachers.find((t) => t.id === id)?.name || id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant', { numeric: true }));
  }, [substituteIdsInMonth, teachers]);

  const selectedTeacher: Teacher | undefined = useMemo(() => {
    if (!selectedSubTeacherId) return undefined;
    if (selectedSubTeacherId === 'pending') {
      return {
        id: 'pending',
        name: '待聘',
        type: TeacherType.EXTERNAL,
        hasCertificate: false,
        isRetired: false,
        isSpecialEd: false,
        isGraduatingHomeroom: false,
        baseSalary: 0,
        researchFee: 0,
        isHomeroom: false,
      };
    }
    const found = teachers.find((t) => t.id === selectedSubTeacherId);
    if (found) return found;
    return {
      id: selectedSubTeacherId,
      name: selectedSubTeacherId,
      type: TeacherType.EXTERNAL,
      hasCertificate: false,
      isRetired: false,
      isSpecialEd: false,
      isGraduatingHomeroom: false,
      baseSalary: 0,
      researchFee: 0,
      isHomeroom: false,
    };
  }, [teachers, selectedSubTeacherId]);

  /** 非管理員：僅能檢視白名單綁定且當月有代課紀錄之本人 */
  const linkedId = selfWhitelist?.linkedTeacherId?.trim() || '';
  const canViewLinked =
    !isSubteachAdmin && linkedId && substituteIdsInMonth.includes(linkedId) && teachers.some((t) => t.id === linkedId);

  useEffect(() => {
    if (isSubteachAdmin) {
      if (substituteTeacherOptions.length === 0) {
        setSelectedSubTeacherId('');
        return;
      }
      setSelectedSubTeacherId((prev) =>
        prev && substituteIdsInMonth.includes(prev) ? prev : substituteTeacherOptions[0].id,
      );
      return;
    }
    if (canViewLinked) {
      setSelectedSubTeacherId(linkedId);
      return;
    }
    setSelectedSubTeacherId('');
  }, [isSubteachAdmin, canViewLinked, linkedId, substituteTeacherOptions, substituteIdsInMonth]);

  const leaveTypeTableRows = useMemo((): LeaveTypeRow[] => {
    if (!selectedTeacher || !selectedSubTeacherId) return [];
    const t = selectedTeacher;
    const byLt = new Map<
      LeaveType,
      { substituteDetailCount: number; substituteIncome: number; leaveAsOriginalRecordCount: number; leaveAsOriginalCost: number }
    >();
    const bump = (lt: LeaveType) => {
      if (!byLt.has(lt)) {
        byLt.set(lt, {
          substituteDetailCount: 0,
          substituteIncome: 0,
          leaveAsOriginalRecordCount: 0,
          leaveAsOriginalCost: 0,
        });
      }
      return byLt.get(lt)!;
    };

    for (const r of recordsInMonth) {
      const ded = deduplicateDetails(r.details || []);
      const inMonth = ded.filter((d) => toYMD(d.date).startsWith(selectedMonth));

      if (originalMatchesTeacher(r, t)) {
        const monthCost = inMonth.reduce((s, d) => s + (Number(d.calculatedAmount) || 0), 0);
        if (monthCost > 0 || inMonth.length > 0) {
          const cell = bump(r.leaveType);
          cell.leaveAsOriginalCost += monthCost;
          cell.leaveAsOriginalRecordCount += 1;
        }
      }

      for (const d of inMonth) {
        if (d.substituteTeacherId !== t.id) continue;
        if (d.isOvertime === true) continue;
        const cell = bump(r.leaveType);
        cell.substituteIncome += Number(d.calculatedAmount) || 0;
        cell.substituteDetailCount += 1;
      }
    }

    return (Object.values(LeaveType) as LeaveType[])
      .map((leaveType) => {
        const x = byLt.get(leaveType);
        return {
          leaveType,
          substituteDetailCount: x?.substituteDetailCount ?? 0,
          substituteIncome: x?.substituteIncome ?? 0,
          leaveAsOriginalRecordCount: x?.leaveAsOriginalRecordCount ?? 0,
          leaveAsOriginalCost: x?.leaveAsOriginalCost ?? 0,
        };
      })
      .filter(
        (row) =>
          row.substituteDetailCount > 0 ||
          row.substituteIncome > 0 ||
          row.leaveAsOriginalRecordCount > 0 ||
          row.leaveAsOriginalCost > 0,
      );
  }, [recordsInMonth, selectedTeacher, selectedSubTeacherId, selectedMonth]);

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

  if (!isSubteachAdmin && !linkedId) {
    return (
      <div className="max-w-lg mx-auto mt-12 px-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 text-sm leading-relaxed">
          <h1 className="text-lg font-bold text-amber-950 mb-2">尚無法使用本查詢</h1>
          <p>
            您的帳號尚未綁定教師身分。請聯絡<strong>系統管理員</strong>在「系統設定 → 白名單管理」為您的 Email 設定<strong>綁定教師</strong>。
          </p>
        </div>
      </div>
    );
  }

  if (!isSubteachAdmin && linkedId && !substituteIdsInMonth.includes(linkedId)) {
    const linkedName = teachers.find((x) => x.id === linkedId)?.name || '已綁定教師';
    return (
      <div className="max-w-lg mx-auto mt-12 px-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-700 text-sm leading-relaxed shadow-sm">
          <h1 className="text-lg font-bold text-slate-900 mb-2">{selectedMonth} 無代課紀錄</h1>
          <p>
            名單僅列出<strong>當月有代課紀錄</strong>之代課教師。您（{linkedName}）於 {selectedMonth}{' '}
            查無擔任代課之紀錄，故無資料可顯示。請切換月份或向教務／人事確認登錄是否完整。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 text-slate-800">
      <div className="max-w-4xl mx-auto px-4 py-6 md:py-8">
        <div className="mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="text-indigo-600 shrink-0" size={26} />
              教師請假／代課查詢
            </h1>
            <p className="text-xs md:text-sm text-slate-500 mt-1">
              僅列出<strong>該月有代課紀錄</strong>之代課教師；下方以<strong>假別彙整</strong>為單一表格（不含超鐘點明細）。需 Google
              登入且於白名單內。
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

        {substituteTeacherOptions.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 text-sm shadow-sm">
            {selectedMonth} 尚無可列出之代課教師（當月無代課分配／明細紀錄）。
          </div>
        ) : (
          <div className="space-y-4">
            {isSubteachAdmin && (
              <label className="block max-w-md">
                <span className="text-xs font-semibold text-slate-600 block mb-1">代課教師（僅有當月代課紀錄者）</span>
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={selectedSubTeacherId}
                  onChange={(e) => setSelectedSubTeacherId(e.target.value)}
                >
                  {substituteTeacherOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {!isSubteachAdmin && selectedTeacher && (
              <div className="flex items-center gap-2 text-slate-800 bg-white border border-slate-200 rounded-lg px-4 py-3 shadow-sm">
                <User size={18} className="text-indigo-500 shrink-0" />
                <span className="font-semibold">{selectedTeacher.name}</span>
                <span className="text-xs text-slate-500">（{selectedTeacher.type}）</span>
              </div>
            )}

            {selectedTeacher && (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-sm font-bold text-slate-700">
                  {selectedMonth} · {selectedTeacher.name} — 依假別彙整
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-white">
                        <th className="px-4 py-3 font-semibold">假別</th>
                        <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">代課明細筆數</th>
                        <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">代課收入合計</th>
                        <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">請假單筆數</th>
                        <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">請假之代課費合計</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {leaveTypeTableRows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                            本月無可彙整之假別資料
                          </td>
                        </tr>
                      ) : (
                        leaveTypeTableRows.map((row) => (
                          <tr key={row.leaveType} className="hover:bg-slate-50/80">
                            <td className="px-4 py-2.5 text-slate-800">{row.leaveType}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                              {row.substituteDetailCount}
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium tabular-nums text-emerald-700">
                              ${row.substituteIncome.toLocaleString()}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                              {row.leaveAsOriginalRecordCount}
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium tabular-nums text-indigo-800">
                              ${row.leaveAsOriginalCost.toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {leaveTypeTableRows.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-50 font-semibold text-slate-800 border-t border-slate-200">
                          <td className="px-4 py-2.5">合計</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {leaveTypeTableRows.reduce((s, r) => s + r.substituteDetailCount, 0)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-emerald-800">
                            $
                            {leaveTypeTableRows.reduce((s, r) => s + r.substituteIncome, 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {leaveTypeTableRows.reduce((s, r) => s + r.leaveAsOriginalRecordCount, 0)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-indigo-900">
                            $
                            {leaveTypeTableRows.reduce((s, r) => s + r.leaveAsOriginalCost, 0).toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                <p className="text-[11px] text-slate-400 px-4 py-2 border-t border-slate-100 bg-slate-50/50">
                  代課欄位依請假單<strong>假別</strong>歸類；請假欄位為同一人若亦擔任請假人時之當月代課費加總。與代課清冊「依代課人」之資料來源一致（不含超鐘點明細）。
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherLeavePortal;
