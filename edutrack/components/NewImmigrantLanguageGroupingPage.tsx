import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, Save } from 'lucide-react';
import type { LanguageElectiveStudent } from '../types';
import { getLanguageElectiveRoster, saveLanguageElectiveRoster } from '../services/api';

type LanguageLinkMap = Record<string, string>;

const EXTERNAL_LINKS_STORAGE_KEY = 'edutrack.newImmigrantLanguage.externalLinks.v1';

function loadExternalLinks(): LanguageLinkMap {
  try {
    const raw = localStorage.getItem(EXTERNAL_LINKS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LanguageLinkMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveExternalLinks(map: LanguageLinkMap): void {
  try {
    localStorage.setItem(EXTERNAL_LINKS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore localStorage errors
  }
}

function isNewImmigrantLanguage(language: string): boolean {
  return /新住民/.test(String(language ?? '').trim());
}

function isSixthGradeClass(className: string): boolean {
  const s = String(className ?? '').trim();
  if (!s) return false;
  const m = s.match(/^(\d{1,2})\d{2}$/);
  if (m) return Number(m[1]) === 6;
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 3) return Number(digits.slice(0, digits.length - 2)) === 6;
  return digits.length === 1 ? Number(digits) === 6 : false;
}

const NewImmigrantLanguageGroupingPage: React.FC = () => {
  const [academicYear, setAcademicYear] = useState(() => {
    const roc = new Date().getFullYear() - 1911;
    return String(roc);
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState<LanguageElectiveStudent[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [externalLinks, setExternalLinks] = useState<LanguageLinkMap>(() => loadExternalLinks());
  const [languageClassSettings, setLanguageClassSettings] = useState<any[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    setError(null);
    getLanguageElectiveRoster(academicYear)
      .then((doc) => {
        if (cancelled) return;
        setStudents(doc?.students ?? []);
        setLanguageClassSettings(doc?.languageClassSettings);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setStudents([]);
        setError(e?.message || '載入名單失敗');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [academicYear]);

  const languageGroups = useMemo(() => {
    const map = new Map<string, LanguageElectiveStudent[]>();
    students
      .filter((s) => isNewImmigrantLanguage(s.language) && !isSixthGradeClass(s.className))
      .forEach((s) => {
        const language = String(s.language ?? '').trim();
        if (!map.has(language)) map.set(language, []);
        map.get(language)!.push(s);
      });
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant'))
      .map(([language, rows]) => ({
        language,
        rows: [...rows].sort(
          (a, b) =>
            a.className.localeCompare(b.className, 'zh-Hant', { numeric: true }) ||
            String(a.seat).localeCompare(String(b.seat), 'zh-Hant', { numeric: true }),
        ),
      }));
  }, [students]);

  const updateStudentField = (target: LanguageElectiveStudent, patch: Partial<LanguageElectiveStudent>) => {
    setStudents((prev) =>
      prev.map((s) =>
        s.className === target.className &&
        String(s.seat) === String(target.seat) &&
        s.name === target.name &&
        s.language === target.language
          ? { ...s, ...patch }
          : s,
      ),
    );
  };

  const updateLanguageLink = (language: string, url: string) => {
    setExternalLinks((prev) => {
      const next = { ...prev, [language]: url };
      saveExternalLinks(next);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await saveLanguageElectiveRoster(academicYear, students, languageClassSettings);
      setMessage('已儲存新住民語能力分組與冊別。');
    } catch (e: any) {
      setError(e?.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">新住民語能力分組</h2>
            <p className="text-xs text-slate-500 mt-1">
              依「選修語言」分群，供語言教師填寫能力分組與冊別。可設定各語言之外連分組網址，快速前往協作。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-700">學年度</label>
            <input
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
              placeholder="114"
            />
          </div>
        </div>
        <div className="text-xs text-slate-600 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          建議流程：先按語言別設定「外連分組頁」→ 語言教師於外部頁面完成能力分組討論 → 回到此頁填「能力分組／冊別」並儲存。
        </div>
        {(message || error) && (
          <div className={`rounded-lg border px-3 py-2 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {error ?? message}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">分群名單</h3>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? '儲存中…' : '儲存分組與冊別'}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-600 py-8">
            <Loader2 size={18} className="animate-spin" /> 載入名單中…
          </div>
        ) : languageGroups.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">此學年度目前沒有「新住民語」選修學生。</p>
        ) : (
          <div className="space-y-4">
            {languageGroups.map((group) => {
              const externalUrl = externalLinks[group.language] ?? '';
              return (
                <section key={group.language} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 space-y-2">
                    <div className="font-semibold text-slate-800">
                      {group.language}（{group.rows.length} 人）
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <input
                        value={externalUrl}
                        onChange={(e) => updateLanguageLink(group.language, e.target.value)}
                        placeholder="此語言的外連分組頁（可貼 Google Sheet / 表單連結）"
                        className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm"
                      />
                      <a
                        href={externalUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`px-3 py-1.5 rounded-lg text-sm inline-flex items-center justify-center gap-1.5 border ${
                          externalUrl
                            ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                            : 'bg-slate-100 border-slate-200 text-slate-400 pointer-events-none'
                        }`}
                      >
                        <ExternalLink size={14} />
                        外連分組頁
                      </a>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="bg-white">
                        <tr className="border-b border-slate-200">
                          <th className="px-3 py-2 text-left">班級</th>
                          <th className="px-3 py-2 text-left">座號</th>
                          <th className="px-3 py-2 text-left">姓名</th>
                          <th className="px-3 py-2 text-left">語言班別</th>
                          <th className="px-3 py-2 text-left">能力分組</th>
                          <th className="px-3 py-2 text-left">冊別</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {group.rows.map((s) => (
                          <tr key={`${s.className}_${s.seat}_${s.name}_${s.language}`}>
                            <td className="px-3 py-2">{s.className}</td>
                            <td className="px-3 py-2">{s.seat}</td>
                            <td className="px-3 py-2 font-medium text-slate-800">{s.name}</td>
                            <td className="px-3 py-2 text-slate-600">{s.languageClass || '—'}</td>
                            <td className="px-3 py-2">
                              <input
                                value={s.proficiencyGroup ?? ''}
                                onChange={(e) => updateStudentField(s, { proficiencyGroup: e.target.value || undefined })}
                                placeholder="例：A組 / 初階"
                                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={s.booklet ?? ''}
                                onChange={(e) => updateStudentField(s, { booklet: e.target.value || undefined })}
                                placeholder="例：第1冊 / Book 2"
                                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                              />
                            </td>
                          </tr>
                        ))}
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

export default NewImmigrantLanguageGroupingPage;
