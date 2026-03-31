import React, { useMemo, useState, useEffect } from 'react';
import { Calendar, Search, Wallet, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { resolveTeacherDefaultSchedule, teacherMatchesClassKeyword } from '../utils/teacherSchedule';
import { calculateSubstituteMonthlyBreakdown } from '../utils/substituteCompensation';
import { PayType, type Teacher, type TeacherScheduleSlot } from '../types';
import { deduplicateDetails } from '../utils/calculations';

type TabKey = 'weekly' | 'teacher' | 'salary';

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

/** 過濾 Firestore／匯入造成的異常節次，避免 map／篩選時拋錯 */
const sanitizeScheduleSlots = (raw: TeacherScheduleSlot[] | undefined): TeacherScheduleSlot[] =>
  (raw || []).filter((s) => s != null && typeof s === 'object') as TeacherScheduleSlot[];

const slotClassMatchesQuery = (slot: TeacherScheduleSlot | null | undefined, classQueryLower: string): boolean => {
  if (!classQueryLower || slot == null) return false;
  return (slot.className || '').toLowerCase().includes(classQueryLower);
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
                  第{s.period}節 {s.subject || ''} {s.className || ''}
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

  const filteredSalaryTeachers = useMemo(() => {
    const q = salaryTeacherQuery.trim().toLowerCase();
    const source = sortTeachersByName(teacherList);
    if (!q) return source;
    return source.filter((t) =>
      (t.name || '').toLowerCase().includes(q) ||
      (t.phone || '').includes(q) ||
      (t.subjects || '').toLowerCase().includes(q),
    );
  }, [teacherList, salaryTeacherQuery]);

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
    const rows: { date: string; originalTeacherName: string; periodText: string; amount: number; isPtaHomeroom: boolean }[] = [];
    recordList.forEach((record) => {
      const originalTeacherName = teacherList.find((t) => t.id === record.originalTeacherId)?.name || record.originalTeacherId;
      deduplicateDetails(record.details || []).forEach((d) => {
        if (d.substituteTeacherId !== selectedSalaryTeacher.id) return;
        if (!String(d.date || '').startsWith(salaryMonth)) return;
        if (d.isOvertime === true) return;
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
        const isPtaHomeroom = !!record.homeroomFeeByPta && record.leaveType !== '自理 (事假/病假)';
        rows.push({
          date: String(d.date || ''),
          originalTeacherName,
          periodText,
          amount: Number(d.calculatedAmount) || 0,
          isPtaHomeroom,
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

  const openSalaryTab = () => {
    if (!selectedSalaryTeacher || !monthlyBreakdown) return;
    const popup = window.open('', '_blank');
    if (!popup) return;
    const title = `${selectedSalaryTeacher.name} ${salaryMonth} 薪資整合`;
    const systemUrl = `${window.location.origin}${window.location.pathname}#/`;
    const detailCardsHtml = salaryDetails.length === 0
      ? `<div style="padding:14px;border:1px solid #e2e8f0;border-radius:12px;text-align:center;color:#94a3b8;background:#ffffff;">本月無代課明細</div>`
      : salaryDetails.map((row) => `
          <div style="border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;background:#ffffff;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
              <div style="font-weight:700;color:#0f172a;font-size:14px;">${row.date}</div>
              <div style="font-weight:700;color:#334155;font-size:14px;">$${row.amount.toLocaleString()}</div>
            </div>
            <div style="margin-top:6px;font-size:13px;color:#334155;">請假教師：${row.originalTeacherName}</div>
            <div style="margin-top:4px;font-size:13px;color:#475569;">節數：${row.periodText}${row.isPtaHomeroom ? '（家長會導師費）' : ''}</div>
          </div>
        `).join('');
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
            <div style="margin-top:6px;font-size:12px;opacity:0.95;">代課、超鐘點、固定兼課、導師費（估算）整合摘要</div>
          </div>

          <div style="margin-top:12px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <div style="display:flex;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;"><span>代課費（含導師費）</span><strong>$${monthlyBreakdown.substituteTotal.toLocaleString()}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#64748b;"><span>導師費（估算，已含於代課費）</span><span>$${monthlyBreakdown.homeroomFeeEstimate.toLocaleString()}</span></div>
            <div style="display:flex;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#7c3aed;"><span>家長會導師費（加計）</span><strong>$${monthlyBreakdown.ptaHomeroomFeeTotal.toLocaleString()}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;"><span>超鐘點</span><strong>$${monthlyBreakdown.overtimeTotal.toLocaleString()}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;"><span>固定兼課</span><strong>$${monthlyBreakdown.fixedOvertimeTotal.toLocaleString()}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:12px;background:#ecfdf5;font-size:15px;font-weight:800;"><span>月合計</span><span style="color:#0f766e;">$${monthlyBreakdown.grandTotal.toLocaleString()}</span></div>
          </div>

          <div style="margin-top:14px;">
            <div style="font-size:15px;font-weight:800;margin-bottom:8px;color:#1e293b;">代課狀況明細（${salaryMonth}）</div>
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
      <p className="text-sm text-slate-500 mb-4">單一網址提供總表週課、教師課表搜尋、代課老師月薪資整合。</p>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <button onClick={() => setTab('weekly')} className={`px-2 py-2 rounded-lg text-xs sm:text-sm ${tab === 'weekly' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>總表週課</button>
        <button onClick={() => setTab('teacher')} className={`px-2 py-2 rounded-lg text-xs sm:text-sm ${tab === 'teacher' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>教師課表</button>
        <button onClick={() => setTab('salary')} className={`px-2 py-2 rounded-lg text-xs sm:text-sm ${tab === 'salary' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>代課薪資</button>
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
                    return (
                      <div key={t.id} className="border border-slate-200 rounded-lg p-3 bg-white">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div className="font-semibold text-slate-800">{t.name}</div>
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
              <button key={t.id} onClick={() => setSelectedTeacherId(t.id)} className={`w-full text-left px-3 py-2 border-b last:border-b-0 text-sm ${selectedTeacherId === t.id ? 'bg-indigo-50' : 'bg-white'}`}>
                <div className="font-medium">{t.name}</div>
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
          <div className="flex items-center gap-2 font-semibold text-slate-700 mb-2"><Wallet size={16} /> 代課老師月薪資整合</div>
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
              <div className="px-3 py-6 text-center text-sm text-slate-400">找不到符合的教師</div>
            )}
          </div>
          {selectedSalaryTeacher && monthlyBreakdown && (
            <>
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-sm mb-3">
                <div className="flex justify-between p-3"><span>代課費（含導師費）</span><span className="font-semibold">${monthlyBreakdown.substituteTotal.toLocaleString()}</span></div>
                <div className="flex justify-between p-3 text-slate-500"><span>導師費（估算，已含於代課費）</span><span>${monthlyBreakdown.homeroomFeeEstimate.toLocaleString()}</span></div>
                <div className="flex justify-between p-3 text-violet-700 bg-violet-50/60"><span>家長會導師費（加計）</span><span className="font-semibold">${monthlyBreakdown.ptaHomeroomFeeTotal.toLocaleString()}</span></div>
                <div className="flex justify-between p-3"><span>超鐘點</span><span className="font-semibold">${monthlyBreakdown.overtimeTotal.toLocaleString()}</span></div>
                <div className="flex justify-between p-3"><span>固定兼課</span><span className="font-semibold">${monthlyBreakdown.fixedOvertimeTotal.toLocaleString()}</span></div>
                <div className="flex justify-between p-3 bg-emerald-50"><span className="font-bold">合計</span><span className="font-bold text-emerald-700">${monthlyBreakdown.grandTotal.toLocaleString()}</span></div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-700">代課狀況明細（{salaryMonth}）</div>
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
                          <td colSpan={4} className="px-3 py-6 text-center text-slate-400">本月無代課明細</td>
                        </tr>
                      ) : (
                        salaryDetails.map((row, idx) => (
                          <tr key={`${row.date}_${row.originalTeacherName}_${idx}`}>
                            <td className="px-3 py-2 text-slate-700">{row.date}</td>
                            <td className="px-3 py-2 text-slate-700">{row.originalTeacherName}</td>
                            <td className="px-3 py-2 text-slate-600">
                              {row.periodText}
                              {row.isPtaHomeroom && <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">家長會導師費</span>}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-700">${row.amount.toLocaleString()}</td>
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
    </div>
  );
};

export default MobileQueryHub;
