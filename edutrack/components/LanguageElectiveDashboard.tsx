/**
 * 語言選修儀表板：依學年顯示各語言、各年級選修人數與開班班別。
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BarChart3, Loader2, CalendarDays } from 'lucide-react';
import { getLanguageElectiveRoster, getLanguageOptions } from '../services/api';
import { loadLanguageOptions } from '../utils/languageOptions';
import {
  groupLanguageSettingsByWeekday,
  weekdayColumnsForSchedule,
  weekendSettings,
  weekdayLabel,
  weekdayFromLanguageClassTime,
  type WeekdayKey,
} from '../utils/languageElectiveWeeklySchedule';
import type { LanguageElectiveStudent, LanguageClassSetting } from '../types';

const GRADES = [1, 2, 3, 4, 5, 6] as const;

/** 從班級名稱推估年級（例：101→1、609→6）；非 1–6 視為 0（其他） */
function gradeFromClassName(className: string): number {
  const first = className.trim().charAt(0);
  const n = parseInt(first, 10);
  if (n >= 1 && n <= 6) return n;
  return 0;
}

const LanguageElectiveDashboard: React.FC = () => {
  const [academicYear, setAcademicYear] = useState('114');
  const [students, setStudents] = useState<LanguageElectiveStudent[]>([]);
  const [languageClassSettings, setLanguageClassSettings] = useState<LanguageClassSetting[]>([]);
  const [loading, setLoading] = useState(false);
  const [languageOptions, setLanguageOptions] = useState<string[]>(() => loadLanguageOptions());

  useEffect(() => {
    getLanguageOptions().then(setLanguageOptions);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const doc = await getLanguageElectiveRoster(academicYear);
      setStudents(doc?.students ?? []);
      setLanguageClassSettings(doc?.languageClassSettings ?? []);
    } finally {
      setLoading(false);
    }
  }, [academicYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** 各語言 × 年級 人數；語言選項 + 實際出現的語言（含「未填」） */
  const { matrix, languageList } = useMemo(() => {
    const langSet = new Set<string>(languageOptions);
    students.forEach((s) => {
      const v = (s.language ?? '').trim();
      langSet.add(v || '未填');
    });
    const list = Array.from(langSet).filter(Boolean).sort((a, b) => a.localeCompare(b));
    const matrix: Record<string, Record<number, number>> = {};
    list.forEach((lang) => {
      matrix[lang] = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    });
    students.forEach((s) => {
      const lang = (s.language ?? '').trim() || '未填';
      if (!matrix[lang]) matrix[lang] = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
      const grade = gradeFromClassName(s.className);
      matrix[lang][grade]++;
    });
    return { matrix, languageList: list };
  }, [students, languageOptions]);

  /** 各語言對應的開班班別（班別名稱包含該語言者） */
  const classByLanguage = useMemo(() => {
    const map: Record<string, string[]> = {};
    languageList.forEach((lang) => {
      const names = languageClassSettings
        .filter((s) => (s.name ?? '').includes(lang))
        .map((s) => s.name ?? '')
        .filter(Boolean);
      map[lang] = names;
    });
    return map;
  }, [languageList, languageClassSettings]);

  const weekdayCols = useMemo(() => weekdayColumnsForSchedule(), []);
  const { byDay, unmatched } = useMemo(
    () => groupLanguageSettingsByWeekday(languageClassSettings),
    [languageClassSettings]
  );
  const weekendList = useMemo(() => weekendSettings(byDay), [byDay]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-sm font-medium">
          <BarChart3 size={16} />
          語言選修儀表板
        </div>
        <h2 className="mt-3 text-2xl font-bold text-slate-900">各語言、各年級選修人數與開班班別</h2>
        <p className="mt-2 text-slate-600 text-sm">
          依學年載入學生名單與語言班別設定；年級由班級名稱首字推估（如 101→一年級、609→六年級）。
        </p>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">學年度</label>
            <input
              type="text"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
              placeholder="114"
            />
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-sm hover:bg-slate-200 disabled:opacity-50 flex items-center gap-1"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            載入
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-200 rounded-lg">
              <thead>
                <tr className="bg-slate-100">
                  <th className="px-4 py-3 text-left font-semibold text-slate-700 border-b border-slate-200">語言</th>
                  {GRADES.map((g) => (
                    <th key={g} className="px-3 py-3 text-center font-semibold text-slate-700 border-b border-slate-200">
                      {g}年級
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center font-semibold text-slate-700 border-b border-slate-200">小計</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700 border-b border-slate-200">開班班別</th>
                </tr>
              </thead>
              <tbody>
                {languageList.map((lang) => {
                  const row = matrix[lang];
                  const total = GRADES.reduce((sum, g) => sum + (row[g] ?? 0), 0) + (row[0] ?? 0);
                  const classes = classByLanguage[lang] ?? [];
                  return (
                    <tr key={lang} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2 font-medium text-slate-800">{lang}</td>
                      {GRADES.map((g) => (
                        <td key={g} className="px-3 py-2 text-center text-slate-700">
                          {row[g] ?? 0}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center font-medium text-slate-800">{total}</td>
                      <td className="px-4 py-2 text-slate-600">
                        {classes.length > 0 ? classes.join('、') : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && students.length === 0 && (
          <p className="mt-4 text-slate-500 text-sm">尚無名單資料，請先於「學生名單」建置並儲存該學年名單。</p>
        )}
      </section>

      {/* 週課表：語言班別設定之上課時間（由「學生名單」內語言班別的時間欄解析星期） */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-sm font-medium mb-3">
          <CalendarDays size={16} />
          週課表（語言班別）
        </div>
        <h3 className="text-lg font-bold text-slate-900">各語言班別上課時間一覽</h3>
        <p className="mt-1 text-slate-600 text-sm mb-4">
          班別編號／名稱置於每格上方；時間欄請含<strong>星期</strong>（如：週一 08:00、W3-早）以便自動對應欄位。資料來自該學年之
          <strong>語言班別設定</strong>（與「學生名單」相同來源）。
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={28} className="animate-spin text-slate-400" />
          </div>
        ) : languageClassSettings.length === 0 ? (
          <p className="text-slate-500 text-sm">
            尚無語言班別設定。請至「學生名單」新增班別並填寫<strong>上課時間</strong>與教室、教師。
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm min-w-[640px] border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    {weekdayCols.map((col) => (
                      <th key={col.key} className="px-3 py-3 text-center font-semibold border-b border-slate-700">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="align-top bg-slate-50/80">
                    {weekdayCols.map((col) => {
                      const list = byDay[col.key as WeekdayKey] ?? [];
                      return (
                        <td
                          key={col.key}
                          className="border border-slate-200 px-2 py-3 align-top min-w-[8.5rem] max-w-[14rem]"
                        >
                          {list.length === 0 ? (
                            <span className="text-slate-400 text-xs block text-center py-2">—</span>
                          ) : (
                            <ul className="space-y-2">
                              {list.map((s) => (
                                <li
                                  key={s.id}
                                  className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm"
                                >
                                  <div className="font-semibold text-slate-900 text-xs leading-tight border-b border-slate-100 pb-1 mb-1">
                                    {s.name || '（未命名班別）'}
                                  </div>
                                  <div className="text-xs text-slate-700 font-mono whitespace-pre-wrap break-words">
                                    {s.time?.trim() || '—'}
                                  </div>
                                  {s.classroom?.trim() && (
                                    <div className="text-xs text-slate-500 mt-1">教室 {s.classroom}</div>
                                  )}
                                  {s.teacher?.trim() && (
                                    <div className="text-xs text-slate-500">教師 {s.teacher}</div>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            {weekendList.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm">
                <span className="font-semibold text-amber-900">週末時段：</span>
                <ul className="mt-2 space-y-1 text-amber-950">
                  {weekendList.map((s) => {
                    const wk = weekdayFromLanguageClassTime(s.time);
                    return (
                      <li key={s.id}>
                        <span className="font-medium">{s.name}</span>
                        <span className="text-amber-800 mx-1">·</span>
                        {wk ? weekdayLabel(wk) : ''}
                        {s.time?.trim() ? ` ${s.time.trim()}` : ''}
                        {s.classroom?.trim() ? ` · 教室 ${s.classroom}` : ''}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {unmatched.length > 0 && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-800 mb-2">
                  無法從時間欄辨識星期之班別（仍會列出上課時間全文）
                </p>
                <ul className="text-sm text-slate-700 space-y-1">
                  {unmatched.map((s) => (
                    <li key={s.id}>
                      <span className="font-semibold">{s.name}</span>：{s.time?.trim() || '（未填時間）'}
                      {s.classroom?.trim() ? ` · ${s.classroom}` : ''}
                      {s.teacher?.trim() ? ` · ${s.teacher}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};

export default LanguageElectiveDashboard;
