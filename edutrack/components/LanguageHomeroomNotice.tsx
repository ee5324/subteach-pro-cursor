import React, { useCallback, useMemo, useState } from 'react';
import { Loader2, Printer, RefreshCw } from 'lucide-react';
import { getLanguageElectiveRoster } from '../services/api';
import type { LanguageClassSetting, LanguageElectiveStudent } from '../types';

type NoticeView = 'by-class' | 'by-language';

interface ClassLanguageGroup {
  language: string;
  students: LanguageElectiveStudent[];
  classTimes: string[];
}

const normalize = (v: string | undefined | null) => (v ?? '').trim();

const sortByClassSeatName = (a: LanguageElectiveStudent, b: LanguageElectiveStudent) => {
  const classCmp = a.className.localeCompare(b.className, undefined, { numeric: true });
  if (classCmp !== 0) return classCmp;
  const seatCmp = parseInt(a.seat || '0', 10) - parseInt(b.seat || '0', 10);
  if (seatCmp !== 0) return seatCmp;
  return a.name.localeCompare(b.name, 'zh-TW');
};

const LanguageHomeroomNotice: React.FC = () => {
  const [academicYear, setAcademicYear] = useState('114');
  const [students, setStudents] = useState<LanguageElectiveStudent[]>([]);
  const [languageClassSettings, setLanguageClassSettings] = useState<LanguageClassSetting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<NoticeView>('by-class');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const doc = await getLanguageElectiveRoster(academicYear);
      setStudents(Array.isArray(doc?.students) ? doc!.students : []);
      setLanguageClassSettings(Array.isArray(doc?.languageClassSettings) ? doc!.languageClassSettings : []);
    } catch (e: any) {
      setError(e?.message || '載入失敗');
      setStudents([]);
      setLanguageClassSettings([]);
    } finally {
      setLoading(false);
    }
  }, [academicYear]);

  const classTimeByLanguageClass = useMemo(() => {
    const map = new Map<string, string>();
    languageClassSettings.forEach((s) => {
      const key = normalize(s.name);
      if (!key) return;
      const t = normalize(s.time);
      map.set(key, t || '未設定時間');
    });
    return map;
  }, [languageClassSettings]);

  const groupedByClass = useMemo(() => {
    const byClass = new Map<string, LanguageElectiveStudent[]>();
    students.forEach((s) => {
      const className = normalize(s.className) || '未分類';
      const list = byClass.get(className) ?? [];
      list.push(s);
      byClass.set(className, list);
    });

    const classes = Array.from(byClass.keys()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return classes.map((className) => {
      const list = [...(byClass.get(className) ?? [])].sort(sortByClassSeatName);
      const byLanguage = new Map<string, ClassLanguageGroup>();
      list.forEach((s) => {
        const lang = normalize(s.language) || '未填';
        const current = byLanguage.get(lang) ?? { language: lang, students: [], classTimes: [] };
        current.students.push(s);
        const classNameKey = normalize(s.languageClass);
        const classTime = classNameKey ? classTimeByLanguageClass.get(classNameKey) || '未設定時間' : '未設定時間';
        const timeLabel = classNameKey ? `${classNameKey}（${classTime}）` : classTime;
        if (!current.classTimes.includes(timeLabel)) current.classTimes.push(timeLabel);
        byLanguage.set(lang, current);
      });
      const groups = Array.from(byLanguage.values()).sort((a, b) => {
        if (a.language === '未填') return 1;
        if (b.language === '未填') return -1;
        return a.language.localeCompare(b.language, 'zh-TW');
      });
      return { className, groups };
    });
  }, [students, classTimeByLanguageClass]);

  const groupedByLanguage = useMemo(() => {
    const byLanguage = new Map<string, { language: string; students: LanguageElectiveStudent[]; classTimes: string[] }>();
    students.forEach((s) => {
      const lang = normalize(s.language) || '未填';
      const current = byLanguage.get(lang) ?? { language: lang, students: [], classTimes: [] };
      current.students.push(s);
      const classNameKey = normalize(s.languageClass);
      const classTime = classNameKey ? classTimeByLanguageClass.get(classNameKey) || '未設定時間' : '未設定時間';
      const timeLabel = classNameKey ? `${classNameKey}（${classTime}）` : classTime;
      if (!current.classTimes.includes(timeLabel)) current.classTimes.push(timeLabel);
      byLanguage.set(lang, current);
    });
    return Array.from(byLanguage.values())
      .map((g) => ({ ...g, students: [...g.students].sort(sortByClassSeatName) }))
      .sort((a, b) => {
        if (a.language === '未填') return 1;
        if (b.language === '未填') return -1;
        return a.language.localeCompare(b.language, 'zh-TW');
      });
  }, [students, classTimeByLanguageClass]);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="text-2xl font-bold text-slate-900">導師通知</h2>
        <p className="mt-1 text-sm text-slate-600">
          依學年名單產出通知；可切換「班級視角」與「語別視角」，並直接使用瀏覽器列印。
        </p>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 no-print">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">學年度</label>
            <input
              type="text"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
              placeholder="114"
            />
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-sm hover:bg-slate-200 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            載入
          </button>
          <div className="h-7 w-px bg-slate-200 mx-1" />
          <button
            type="button"
            onClick={() => setView('by-class')}
            className={`px-3 py-1.5 rounded-lg text-sm border ${view === 'by-class' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300'}`}
          >
            班級視角
          </button>
          <button
            type="button"
            onClick={() => setView('by-language')}
            className={`px-3 py-1.5 rounded-lg text-sm border ${view === 'by-language' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300'}`}
          >
            語別視角
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 text-sm hover:bg-emerald-200"
          >
            <Printer size={14} />
            列印目前視圖
          </button>
        </div>
        {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      </section>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-slate-400" />
        </div>
      ) : students.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-500">
          尚無資料。請先在「學生名單」完成該學年資料並儲存，再回到此頁載入。
        </div>
      ) : view === 'by-class' ? (
        <div className="space-y-4">
          {groupedByClass.map((block) => (
            <section key={block.className} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 print:break-inside-avoid">
              <h3 className="text-lg font-bold text-slate-900 mb-3">{block.className} 班導師通知</h3>
              <div className="space-y-3">
                {block.groups.map((g) => (
                  <div key={g.language} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-slate-900">語別：{g.language}</span>
                      <span className="text-xs text-slate-600">上課：{g.classTimes.join('、') || '未設定時間'}</span>
                    </div>
                    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-sm text-slate-700">
                      {g.students.map((s) => (
                        <li key={`${block.className}-${g.language}-${s.seat}-${s.name}`} className="rounded border border-slate-100 bg-slate-50 px-2 py-1">
                          {s.seat} 號 {s.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByLanguage.map((g) => (
            <section key={g.language} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 print:break-inside-avoid">
              <h3 className="text-lg font-bold text-slate-900 mb-1">{g.language} 導師通知</h3>
              <p className="text-xs text-slate-600 mb-3">上課：{g.classTimes.join('、') || '未設定時間'}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-slate-200 rounded-lg">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">班級</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">座號</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">姓名</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.students.map((s, idx) => (
                      <tr key={`${g.language}-${s.className}-${s.seat}-${s.name}-${idx}`} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-800">{s.className}</td>
                        <td className="px-3 py-1.5 text-slate-700">{s.seat}</td>
                        <td className="px-3 py-1.5 text-slate-700">{s.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageHomeroomNotice;
