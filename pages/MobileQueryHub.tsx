import React, { useMemo, useState } from 'react';
import { Calendar, Search, User, Wallet, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { resolveTeacherDefaultSchedule } from '../utils/teacherSchedule';
import { calculateSubstituteMonthlyBreakdown } from '../utils/substituteCompensation';

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

  const [tab, setTab] = useState<TabKey>('weekly');
  const [viewDate, setViewDate] = useState(new Date());
  const [teacherQuery, setTeacherQuery] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [salaryTeacherId, setSalaryTeacherId] = useState('');
  const [salaryMonth, setSalaryMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const weekDays = useMemo(() => getWeekDays(viewDate), [viewDate]);

  const weeklyMap = useMemo(() => {
    const map = new Map<string, { original: string; substitute: string; subject?: string; className?: string }[]>();
    records.forEach((record) => {
      (record.slots || []).forEach((slot) => {
        const key = `${slot.date}_${slot.period}`;
        if (!map.has(key)) map.set(key, []);
        const originalTeacher = teachers.find((t) => t.id === record.originalTeacherId)?.name || record.originalTeacherId;
        const subTeacher = teachers.find((t) => t.id === slot.substituteTeacherId)?.name || slot.substituteTeacherId || '待聘';
        map.get(key)?.push({
          original: originalTeacher,
          substitute: subTeacher,
          subject: slot.subject,
          className: slot.className,
        });
      });
    });
    return map;
  }, [records, teachers]);

  const filteredTeachers = useMemo(() => {
    const q = teacherQuery.trim().toLowerCase();
    const source = [...teachers].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    if (!q) return source;
    return source.filter((t) =>
      (t.name || '').toLowerCase().includes(q) ||
      (t.phone || '').includes(q) ||
      (t.subjects || '').toLowerCase().includes(q),
    );
  }, [teachers, teacherQuery]);

  const selectedTeacher = useMemo(
    () => teachers.find((t) => t.id === selectedTeacherId) || null,
    [teachers, selectedTeacherId],
  );

  const selectedTeacherSchedule = useMemo(
    () => resolveTeacherDefaultSchedule(selectedTeacher || undefined, activeSemesterId) || [],
    [selectedTeacher, activeSemesterId],
  );

  const selectedSalaryTeacher = useMemo(
    () => teachers.find((t) => t.id === salaryTeacherId) || null,
    [teachers, salaryTeacherId],
  );

  const monthlyBreakdown = useMemo(() => {
    if (!selectedSalaryTeacher) return null;
    return calculateSubstituteMonthlyBreakdown({
      teacherId: selectedSalaryTeacher.id,
      yearMonth: salaryMonth,
      records,
      teachers,
      overtimeRecords,
      fixedOvertimeConfig,
      holidays,
      settings,
      activeSemesterId,
    });
  }, [selectedSalaryTeacher, salaryMonth, records, teachers, overtimeRecords, fixedOvertimeConfig, holidays, settings, activeSemesterId]);

  const openSalaryTab = () => {
    if (!selectedSalaryTeacher || !monthlyBreakdown) return;
    const popup = window.open('', '_blank');
    if (!popup) return;
    const title = `${selectedSalaryTeacher.name} ${salaryMonth} 薪資整合`;
    popup.document.write(`
      <html><head><title>${title}</title></head>
      <body style="font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; padding: 20px; color: #0f172a;">
        <h2 style="margin: 0 0 10px 0;">${title}</h2>
        <p style="margin: 0 0 12px 0; color: #475569;">代課、超鐘點、固定兼課、導師費（估算）整合摘要</p>
        <table style="border-collapse: collapse; width: 100%; max-width: 520px;">
          <tr><td style="padding:8px;border:1px solid #e2e8f0;">代課費（含導師費）</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">$${monthlyBreakdown.substituteTotal.toLocaleString()}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;">導師費（估算，已含於代課費）</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">$${monthlyBreakdown.homeroomFeeEstimate.toLocaleString()}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;">超鐘點</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">$${monthlyBreakdown.overtimeTotal.toLocaleString()}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;">固定兼課</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">$${monthlyBreakdown.fixedOvertimeTotal.toLocaleString()}</td></tr>
          <tr><td style="padding:10px;border:1px solid #94a3b8;font-weight:700;">月合計</td><td style="padding:10px;border:1px solid #94a3b8;text-align:right;font-weight:700;color:#0f766e;">$${monthlyBreakdown.grandTotal.toLocaleString()}</td></tr>
        </table>
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
          <input
            value={teacherQuery}
            onChange={(e) => setTeacherQuery(e.target.value)}
            placeholder="輸入姓名 / 電話 / 科目"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mb-3"
          />
          <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg mb-3">
            {filteredTeachers.map((t) => (
              <button key={t.id} onClick={() => setSelectedTeacherId(t.id)} className={`w-full text-left px-3 py-2 border-b last:border-b-0 text-sm ${selectedTeacherId === t.id ? 'bg-indigo-50' : 'bg-white'}`}>
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-slate-500">{t.phone || '無電話'} / {t.subjects || '無科目'}</div>
              </button>
            ))}
          </div>
          {selectedTeacher && (
            <div>
              <div className="font-semibold text-slate-800 mb-2">{selectedTeacher.name}（綁定學期課表）</div>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((day) => (
                  <div key={day} className="border border-slate-200 rounded-lg p-2">
                    <div className="text-xs font-bold text-slate-600 mb-1">週{['一', '二', '三', '四', '五'][day - 1]}</div>
                    {(selectedTeacherSchedule.filter((s) => s.day === day)).map((s, idx) => (
                      <div key={idx} className="text-[11px] border border-slate-100 rounded p-1 mb-1 bg-slate-50">
                        第{s.period}節 {s.subject || ''} {s.className || ''}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'salary' && (
        <section className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="flex items-center gap-2 font-semibold text-slate-700 mb-2"><Wallet size={16} /> 代課老師月薪資整合</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
            <select value={salaryTeacherId} onChange={(e) => setSalaryTeacherId(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
              <option value="">選擇代課老師</option>
              {[...teachers].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <input type="month" value={salaryMonth} onChange={(e) => setSalaryMonth(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            <button
              onClick={openSalaryTab}
              disabled={!monthlyBreakdown}
              className="px-3 py-2 border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-lg text-sm disabled:opacity-50 flex items-center justify-center gap-1"
            >
              <ExternalLink size={14} /> 另開分頁顯示
            </button>
          </div>
          {selectedSalaryTeacher && monthlyBreakdown && (
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-sm">
              <div className="flex justify-between p-3"><span>代課費（含導師費）</span><span className="font-semibold">${monthlyBreakdown.substituteTotal.toLocaleString()}</span></div>
              <div className="flex justify-between p-3 text-slate-500"><span>導師費（估算，已含於代課費）</span><span>${monthlyBreakdown.homeroomFeeEstimate.toLocaleString()}</span></div>
              <div className="flex justify-between p-3"><span>超鐘點</span><span className="font-semibold">${monthlyBreakdown.overtimeTotal.toLocaleString()}</span></div>
              <div className="flex justify-between p-3"><span>固定兼課</span><span className="font-semibold">${monthlyBreakdown.fixedOvertimeTotal.toLocaleString()}</span></div>
              <div className="flex justify-between p-3 bg-emerald-50"><span className="font-bold">合計</span><span className="font-bold text-emerald-700">${monthlyBreakdown.grandTotal.toLocaleString()}</span></div>
            </div>
          )}
          {!selectedSalaryTeacher && <div className="text-sm text-slate-400">請先選擇代課老師。</div>}
        </section>
      )}
    </div>
  );
};

export default MobileQueryHub;
