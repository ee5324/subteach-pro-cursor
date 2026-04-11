import React, { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, ChevronLeft, ChevronRight, User, Wallet, BookOpen } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { LeaveRecord, LeaveType, PayType, SubstituteDetail, Teacher } from '../types';
import { deduplicateDetails } from '../utils/calculations';

const LEAVE_TYPE_ALL = '__ALL__' as const;

type AsOriginalRow = { record: LeaveRecord; monthCost: number; detailLines: string[] };
type AsSubRow = { record: LeaveRecord; detail: SubstituteDetail };
type ByLtRow = { leaveType: LeaveType; originalCost: number; subIncome: number; leaveCount: number };

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

function periodLabel(d: { payType: PayType; selectedPeriods?: string[]; periodCount?: number }): string {
  if (d.payType === PayType.HOURLY) {
    const p = [...(d.selectedPeriods || [])].map(String).join(',');
    return p ? `第${p}節` : `${d.periodCount || 0}節`;
  }
  if (d.payType === PayType.HALF_DAY) return '半日薪';
  return `${d.periodCount ?? 1}日薪`;
}

const TeacherLeavePortal: React.FC = () => {
  const {
    currentUser,
    teachers,
    records,
    subteachAllowedUsers,
    isSubteachAdmin,
    loading,
  } = useAppStore();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [leaveTypeKey, setLeaveTypeKey] = useState<string>(LEAVE_TYPE_ALL);
  const [adminTeacherId, setAdminTeacherId] = useState('');

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

  const sortedTeachers = useMemo(
    () => [...teachers].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hant', { numeric: true })),
    [teachers],
  );

  const effectiveTeacherId = isSubteachAdmin ? adminTeacherId : selfWhitelist?.linkedTeacherId || '';
  const effectiveTeacher = useMemo(
    () => sortedTeachers.find((t) => t.id === effectiveTeacherId),
    [sortedTeachers, effectiveTeacherId],
  );

  useEffect(() => {
    if (!isSubteachAdmin || adminTeacherId) return;
    if (sortedTeachers.length > 0) setAdminTeacherId(sortedTeachers[0].id);
  }, [isSubteachAdmin, adminTeacherId, sortedTeachers]);

  const recordsInMonth = useMemo(
    () =>
      records.filter((r) => recordTouchesMonth(r, monthStartStr, monthEndStr)),
    [records, monthStartStr, monthEndStr],
  );

  const portalBody = useMemo(() => {
    const empty = {
      asOriginalRows: [] as AsOriginalRow[],
      asSubRows: [] as AsSubRow[],
      sumOriginalMonthCost: 0,
      sumSubstituteIncome: 0,
      byLeaveType: [] as ByLtRow[],
    };
    if (!effectiveTeacher) return empty;

    const asOriginal: AsOriginalRow[] = [];
    const asSub: AsSubRow[] = [];
    let sumOriginalMonthCost = 0;
    let sumSubstituteIncome = 0;

    const byLt = new Map<LeaveType, { originalCost: number; subIncome: number; leaveCount: number }>();
    const bumpLt = (lt: LeaveType, oc: number, si: number, incLeave: boolean) => {
      const cur = byLt.get(lt) || { originalCost: 0, subIncome: 0, leaveCount: 0 };
      cur.originalCost += oc;
      cur.subIncome += si;
      if (incLeave) cur.leaveCount += 1;
      byLt.set(lt, cur);
    };

    for (const r of recordsInMonth) {
      const matchesLeave = leaveTypeKey === LEAVE_TYPE_ALL || r.leaveType === leaveTypeKey;
      if (!matchesLeave) continue;
      const ded = deduplicateDetails(r.details || []);
      const inMonth = ded.filter((d) => toYMD(d.date).startsWith(selectedMonth));

      if (originalMatchesTeacher(r, effectiveTeacher)) {
        const monthCost = inMonth.reduce((s, d) => s + (Number(d.calculatedAmount) || 0), 0);
        if (monthCost > 0 || inMonth.length > 0) {
          const detailLines = inMonth.map((d) => {
            const subName =
              d.substituteTeacherId === 'pending'
                ? '待聘'
                : teachers.find((t) => t.id === d.substituteTeacherId)?.name || d.substituteTeacherId;
            return `${toYMD(d.date)} ${periodLabel(d)} · ${subName} · $${(Number(d.calculatedAmount) || 0).toLocaleString()}`;
          });
          asOriginal.push({ record: r, monthCost, detailLines });
        }
        sumOriginalMonthCost += monthCost;
        if (leaveTypeKey === LEAVE_TYPE_ALL) {
          bumpLt(r.leaveType, monthCost, 0, true);
        }
      }

      for (const d of inMonth) {
        if (d.substituteTeacherId !== effectiveTeacher.id) continue;
        if (d.isOvertime === true) continue;
        const amt = Number(d.calculatedAmount) || 0;
        sumSubstituteIncome += amt;
        asSub.push({ record: r, detail: d });
        if (leaveTypeKey === LEAVE_TYPE_ALL) {
          const cur = byLt.get(r.leaveType) || { originalCost: 0, subIncome: 0, leaveCount: 0 };
          cur.subIncome += amt;
          byLt.set(r.leaveType, cur);
        }
      }
    }

    const byLeaveType = (Object.values(LeaveType) as LeaveType[])
      .map((leaveType) => {
        const x = byLt.get(leaveType);
        return {
          leaveType,
          originalCost: x?.originalCost ?? 0,
          subIncome: x?.subIncome ?? 0,
          leaveCount: x?.leaveCount ?? 0,
        };
      })
      .filter((row) => row.originalCost > 0 || row.subIncome > 0 || row.leaveCount > 0);

    return {
      asOriginalRows: asOriginal,
      asSubRows: asSub.sort((a, b) => toYMD(a.detail.date).localeCompare(toYMD(b.detail.date))),
      sumOriginalMonthCost,
      sumSubstituteIncome,
      byLeaveType,
    };
  }, [recordsInMonth, effectiveTeacher, teachers, selectedMonth, leaveTypeKey]);

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

  if (!isSubteachAdmin && !selfWhitelist?.linkedTeacherId) {
    return (
      <div className="max-w-lg mx-auto mt-12 px-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 text-sm leading-relaxed">
          <h1 className="text-lg font-bold text-amber-950 mb-2">尚無法使用教師查詢</h1>
          <p>
            您的帳號已通過白名單，但尚未綁定教師身分。請聯絡<strong>系統管理員</strong>在「系統設定 → 白名單管理」為您的 Email
            設定<strong>綁定教師</strong>後，即可檢視個人請假與代課資料。
          </p>
          <Link to="/dashboard" className="inline-block mt-4 text-indigo-700 font-medium hover:underline">
            返回儀表板
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 text-slate-800">
      <div className="max-w-5xl mx-auto px-4 py-6 md:py-10">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="text-indigo-600 shrink-0" size={28} />
              教師請假／代課查詢
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              依月份與假別檢視請假紀錄、代課明細與金額加總（資料與代課清冊相同來源）。需 Google 登入且於白名單內。
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg shadow-sm">
            <button
              type="button"
              onClick={() => handleMonthChange('prev')}
              className="p-2 text-slate-500 hover:bg-slate-50 rounded-l-lg border-r border-slate-200"
              aria-label="上個月"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="px-4 py-2 flex items-center gap-2 font-semibold text-slate-700 tabular-nums">
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

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6 mb-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            {isSubteachAdmin && (
              <label className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-slate-500 block mb-1">檢視教師（管理員）</span>
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={adminTeacherId}
                  onChange={(e) => setAdminTeacherId(e.target.value)}
                >
                  {sortedTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}（{t.type}）
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!isSubteachAdmin && effectiveTeacher && (
              <div className="flex items-center gap-2 text-slate-700">
                <User size={18} className="text-indigo-500 shrink-0" />
                <span className="font-semibold">{effectiveTeacher.name}</span>
                <span className="text-xs text-slate-400">（{effectiveTeacher.type}）</span>
              </div>
            )}
            <label className="flex-1 min-w-0 md:max-w-xs">
              <span className="text-xs font-semibold text-slate-500 block mb-1">假別篩選</span>
              <select
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                value={leaveTypeKey}
                onChange={(e) => setLeaveTypeKey(e.target.value)}
              >
                <option value={LEAVE_TYPE_ALL}>全部假別（下方為分假別彙總）</option>
                {Object.values(LeaveType).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {effectiveTeacher && leaveTypeKey === LEAVE_TYPE_ALL && portalBody.byLeaveType.length > 0 && (
            <div className="rounded-lg border border-slate-100 overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">依假別彙總（{selectedMonth}）</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                      <th className="px-3 py-2 font-medium">假別</th>
                      <th className="px-3 py-2 font-medium text-right">請假筆數</th>
                      <th className="px-3 py-2 font-medium text-right">請假之當月代課支出</th>
                      <th className="px-3 py-2 font-medium text-right">代課收入</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {portalBody.byLeaveType.map((row) => (
                      <tr key={row.leaveType} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2 text-slate-800">{row.leaveType}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.leaveCount}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          ${row.originalCost.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-emerald-700 tabular-nums">
                          ${row.subIncome.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-400 px-3 py-2 border-t border-slate-100">
                「請假之當月代課支出」為該假別下，您請假時當月應付之代課費加總；「代課收入」為您擔任代課之明細金額加總（同假別之請假單）。
              </p>
            </div>
          )}

          {effectiveTeacher && leaveTypeKey !== LEAVE_TYPE_ALL && (
            <div className="grid md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
                <div className="text-xs font-semibold text-indigo-800 mb-1">請假—當月代課費加總</div>
                <div className="text-2xl font-bold text-indigo-950 tabular-nums">
                  ${portalBody.sumOriginalMonthCost.toLocaleString()}
                </div>
                <p className="text-[11px] text-indigo-700/80 mt-2">您為請假人、假別為「{leaveTypeKey}」之代課明細金額合計（{selectedMonth}）。</p>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">
                <div className="text-xs font-semibold text-emerald-800 mb-1 flex items-center gap-1">
                  <Wallet size={14} /> 代課收入加總
                </div>
                <div className="text-2xl font-bold text-emerald-900 tabular-nums">
                  ${portalBody.sumSubstituteIncome.toLocaleString()}
                </div>
                <p className="text-[11px] text-emerald-800/80 mt-2">您擔任代課、且請假假別為「{leaveTypeKey}」之明細合計（{selectedMonth}，不含超鐘點明細）。</p>
              </div>
            </div>
          )}
        </div>

        {effectiveTeacher && leaveTypeKey !== LEAVE_TYPE_ALL && (
          <div className="grid gap-6 md:grid-cols-2">
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <h2 className="text-sm font-bold text-slate-700 bg-slate-50 px-4 py-3 border-b border-slate-200">
                請假紀錄（您為請假人）
              </h2>
              <div className="max-h-[480px] overflow-y-auto divide-y divide-slate-100">
                {portalBody.asOriginalRows.length === 0 ? (
                  <p className="p-6 text-sm text-slate-400 text-center">本月無符合假別之請假紀錄</p>
                ) : (
                  portalBody.asOriginalRows.map(({ record, monthCost, detailLines }) => (
                    <div key={record.id} className="p-4 text-sm">
                      <div className="font-semibold text-slate-800">{record.reason || '（無事由）'}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {record.startDate}～{record.endDate} · {record.leaveType}
                      </div>
                      <div className="mt-2 text-xs font-medium text-indigo-700">
                        當月代課費小計：${monthCost.toLocaleString()}
                      </div>
                      {detailLines.length > 0 && (
                        <ul className="mt-2 space-y-1 text-xs text-slate-600 font-mono">
                          {detailLines.map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <h2 className="text-sm font-bold text-slate-700 bg-slate-50 px-4 py-3 border-b border-slate-200">
                代課紀錄（您為代課人）
              </h2>
              <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">日期</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">請假人</th>
                      <th className="px-3 py-2 font-medium">科目／班級</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">支薪</th>
                      <th className="px-3 py-2 font-medium text-right whitespace-nowrap">金額</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {portalBody.asSubRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-slate-400 text-sm">
                          本月無符合假別之代課明細
                        </td>
                      </tr>
                    ) : (
                      portalBody.asSubRows.map(({ record, detail }) => {
                        const orig = teachers.find(
                          (t) => t.id === record.originalTeacherId || t.name === record.originalTeacherId,
                        );
                        return (
                          <tr key={`${record.id}_${detail.id}`} className="hover:bg-slate-50/80">
                            <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{toYMD(detail.date)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{orig?.name || record.originalTeacherId}</td>
                            <td className="px-3 py-2 text-xs text-slate-600">
                              {[detail.subject, detail.className].filter(Boolean).join(' ')}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs">{detail.payType}</td>
                            <td className="px-3 py-2 text-right font-medium tabular-nums">
                              ${(Number(detail.calculatedAmount) || 0).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherLeavePortal;
