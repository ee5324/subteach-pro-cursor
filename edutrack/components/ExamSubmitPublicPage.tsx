import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, LogIn, Save, Lock } from 'lucide-react';
import type { ExamAwardsConfig, ExamCampaign, ExamSubmissionStudent, ExamSubmitAllowedUser, LanguageElectiveStudent } from '../types';
import { onAuthStateChanged, signInWithGoogle, signOut } from '../services/auth';
import { getExamAwardsConfig, getExamCampaigns, getExamSubmitAllowedUser, getLanguageElectiveRoster, saveExamSubmission } from '../services/api';
import {
  buildVisibleAwardKeySet,
  filterExamAwardsConfigForGrade,
  parseGradeFromClassName,
} from '../utils/examAwardGrade';

type Suggestion = { className: string; seat: string; name: string };

const buildAwardKey = (categoryId: string, itemId: string) => `${categoryId}:${itemId}`;

/** 白名單班級字串須與語言選修學生主檔「班級」欄完全一致（含空白需一致；建議管理者從名單複製）。 */
function resolveTeacherClassInRoster(
  whitelistClass: string | null | undefined,
  roster: LanguageElectiveStudent[]
): string | null {
  const w = (whitelistClass ?? '').trim();
  if (!w) return null;
  const rosterClasses = [...new Set(roster.map((s) => String(s.className ?? '').trim()).filter(Boolean))];
  if (rosterClasses.includes(w)) return w;
  return null;
}

/** 白名單與主檔字串不同但班級代碼數字相同時，提示應改為的主檔班級字串 */
function hintFuzzyClassMatch(whitelistClass: string | null | undefined, roster: LanguageElectiveStudent[]): string | null {
  const w = (whitelistClass ?? '').trim();
  if (!w) return null;
  const rosterClasses = [...new Set(roster.map((s) => String(s.className ?? '').trim()).filter(Boolean))];
  if (rosterClasses.includes(w)) return null;
  const wDigits = w.replace(/\D/g, '');
  if (!wDigits) return null;
  const candidates = rosterClasses.filter((c) => c.replace(/\D/g, '') === wDigits);
  if (candidates.length === 1) return candidates[0];
  return null;
}

const ExamSubmitPublicPage: React.FC = () => {
  const [authLoading, setAuthLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [allowedLoading, setAllowedLoading] = useState(false);
  const [allowedUser, setAllowedUser] = useState<ExamSubmitAllowedUser | null>(null);

  const [campaigns, setCampaigns] = useState<ExamCampaign[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const campaign = useMemo(() => campaigns.find((c) => c.id === campaignId) ?? null, [campaignId, campaigns]);

  const [awardsConfig, setAwardsConfig] = useState<ExamAwardsConfig>({ categories: [] });

  const [rosterLoading, setRosterLoading] = useState(false);
  const [roster, setRoster] = useState<LanguageElectiveStudent[]>([]);

  const teacherResolvedClass = useMemo(
    () => resolveTeacherClassInRoster(allowedUser?.className ?? null, roster),
    [allowedUser?.className, roster]
  );

  const fuzzyClassHint = useMemo(
    () => hintFuzzyClassMatch(allowedUser?.className ?? null, roster),
    [allowedUser?.className, roster]
  );

  const teacherGrade = useMemo(
    () => parseGradeFromClassName(teacherResolvedClass ?? className),
    [teacherResolvedClass, className]
  );

  const displayAwardsConfig = useMemo(
    () => filterExamAwardsConfigForGrade(awardsConfig, teacherGrade),
    [awardsConfig, teacherGrade]
  );

  const classConfigError = useMemo(() => {
    if (!allowedUser) return null;
    if (!allowedUser.className) {
      return '管理者尚未在白名單設定您的「班級」，無法填報。請聯絡教學組。';
    }
    if (rosterLoading) return null;
    if (teacherResolvedClass) return null;
    if (fuzzyClassHint) {
      return `白名單班級「${allowedUser.className}」與本學年度學生主檔班級字串不一致；請管理者將白名單改為「${fuzzyClassHint}」（須與主檔完全相同）。`;
    }
    return `本學年度學生主檔中找不到班級「${allowedUser.className}」。請管理者核對白名單班級與語言選修／學生主檔。`;
  }, [allowedUser, rosterLoading, teacherResolvedClass, fuzzyClassHint]);

  const [className, setClassName] = useState('');

  const classStudents = useMemo(() => roster.filter((s) => String(s.className) === String(className)), [roster, className]);

  const [query, setQuery] = useState('');
  const suggestions: Suggestion[] = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const isSeat = /^\d+$/.test(q);
    const list = classStudents
      .filter((s) => {
        if (isSeat) return String(s.seat ?? '').includes(q);
        return String(s.name ?? '').includes(q);
      })
      .slice(0, 20)
      .map((s) => ({ className: s.className, seat: s.seat, name: s.name }));
    return list;
  }, [classStudents, query]);

  const [selected, setSelected] = useState<Record<string, ExamSubmissionStudent>>({});

  const selectedList = useMemo(
    () =>
      (Object.values(selected) as ExamSubmissionStudent[]).sort((a, b) =>
        String(a.seat ?? '').localeCompare(String(b.seat ?? ''), undefined, { numeric: true })
      ),
    [selected]
  );

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged((u) => {
      setUserEmail(u?.email ?? null);
      setAuthLoading(false);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!userEmail) {
      setAllowedUser(null);
      return;
    }
    setAllowedLoading(true);
    setAuthError(null);
    getExamSubmitAllowedUser(userEmail)
      .then((doc) => {
        if (!doc?.enabled) {
          setAllowedUser(null);
          setAuthError(`帳號 ${userEmail} 未加入段考填報白名單，請聯絡管理者。`);
          return signOut();
        }
        setAllowedUser(doc);
      })
      .catch((e: any) => {
        setAllowedUser(null);
        setAuthError(e?.message || '無法驗證白名單');
        return signOut();
      })
      .finally(() => setAllowedLoading(false));
  }, [userEmail]);

  useEffect(() => {
    Promise.all([getExamCampaigns(), getExamAwardsConfig()])
      .then(([camps, cfg]) => {
        setCampaigns(camps);
        setAwardsConfig(cfg);
        if (camps.length > 0) setCampaignId(camps[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!campaign?.academicYear) return;
    setRosterLoading(true);
    getLanguageElectiveRoster(campaign.academicYear)
      .then((doc) => setRoster(doc?.students ?? []))
      .catch(() => setRoster([]))
      .finally(() => setRosterLoading(false));
  }, [campaign?.academicYear]);

  useEffect(() => {
    setSelected({});
    setQuery('');
  }, [campaignId, className]);

  useEffect(() => {
    if (teacherResolvedClass) setClassName(teacherResolvedClass);
    else setClassName('');
  }, [teacherResolvedClass]);

  useEffect(() => {
    const visible = buildVisibleAwardKeySet(awardsConfig, teacherGrade);
    setSelected((prev) => {
      let changed = false;
      const next: Record<string, ExamSubmissionStudent> = {};
      for (const [k, stu] of Object.entries(prev)) {
        const awards = stu.awards.filter((a) => visible.has(a));
        if (awards.length !== stu.awards.length) changed = true;
        next[k] = { ...stu, awards };
      }
      return changed ? next : prev;
    });
  }, [awardsConfig, teacherGrade]);

  const addStudent = (s: Suggestion) => {
    const key = `${s.className}_${s.seat}`;
    setSelected((prev) => {
      if (prev[key]) return prev;
      return { ...prev, [key]: { className: s.className, seat: s.seat, name: s.name, awards: [] } };
    });
    setQuery('');
  };

  const toggleAward = (stuKey: string, awardKey: string) => {
    setSelected((prev) => {
      const row = prev[stuKey];
      if (!row) return prev;
      const has = row.awards.includes(awardKey);
      const awards = has ? row.awards.filter((x) => x !== awardKey) : [...row.awards, awardKey];
      return { ...prev, [stuKey]: { ...row, awards } };
    });
  };

  const removeStudent = (stuKey: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      delete next[stuKey];
      return next;
    });
  };

  const handleSave = async () => {
    if (!userEmail || !campaignId || !className || !teacherResolvedClass) return;
    if (className !== teacherResolvedClass) {
      setErr('班級與白名單不一致，無法送出。');
      return;
    }
    for (const stu of selectedList) {
      if (String(stu.className) !== String(className)) {
        setErr('含有非本班學生，請移除後再送出。');
        return;
      }
    }
    const locked = campaign?.lockedByDefault !== false;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const visible = buildVisibleAwardKeySet(awardsConfig, teacherGrade);
      const studentsPayload = selectedList.map((stu) => ({
        ...stu,
        awards: stu.awards.filter((a) => visible.has(a)),
      }));
      await saveExamSubmission({
        campaignId,
        className,
        students: studentsPayload,
        locked,
        submittedByEmail: userEmail,
        submittedAt: new Date().toISOString(),
      } as any);
      setMsg(locked ? '已送出（已鎖定）。如需修改請聯絡管理者解鎖。' : '已送出（未鎖定，可再次送出更新）。');
    } catch (e: any) {
      setErr(e?.message || '送出失敗');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-slate-600" />
      </div>
    );
  }

  if (!userEmail) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-slate-200 p-6 space-y-4">
          <h1 className="text-lg font-bold text-slate-800">段考名單填報</h1>
          <p className="text-sm text-slate-600">請使用 Google 登入（需在白名單）。</p>
          {authError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{authError}</div>}
          <button
            type="button"
            onClick={() => signInWithGoogle().catch((e: any) => setAuthError(e?.message || 'Google 登入失敗'))}
            className="w-full py-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-900 inline-flex items-center justify-center gap-2"
          >
            <LogIn size={18} /> 使用 Google 登入
          </button>
        </div>
      </div>
    );
  }

  if (allowedLoading || !allowedUser) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-slate-200 p-6 space-y-3">
          <h1 className="text-lg font-bold text-slate-800">段考名單填報</h1>
          <p className="text-sm text-slate-600 font-mono">{userEmail}</p>
          {allowedLoading ? (
            <div className="flex items-center gap-2 text-slate-600 text-sm">
              <Loader2 size={18} className="animate-spin" /> 驗證白名單中…
            </div>
          ) : (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{authError ?? '未通過白名單'}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">段考名單填報</h1>
            <p className="text-xs text-slate-500 mt-1 font-mono">{userEmail}</p>
          </div>
          <button type="button" onClick={() => signOut().then(() => window.location.reload())} className="text-sm px-3 py-1.5 rounded bg-slate-200 text-slate-700 hover:bg-slate-300">
            登出
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <details className="group">
            <summary className="cursor-pointer select-none flex items-center justify-between gap-3">
              <span className="font-semibold text-slate-800">使用說明（可摺疊）</span>
              <span className="text-xs text-slate-500 group-open:hidden">展開</span>
              <span className="text-xs text-slate-500 hidden group-open:inline">收合</span>
            </summary>
            <div className="mt-3 text-sm text-slate-700 space-y-2">
              <p>
                <span className="font-semibold">送出並鎖定</span> 的意思是：你按下送出後，系統會把本班本次段考的提報資料標記為
                <span className="font-mono mx-1">locked=true</span>，避免反覆修改造成資料混亂。
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <span className="font-semibold">班級與學生名單</span>：系統會依教學組白名單將你的 Google 帳號綁定一個班級；你只能搜尋、勾選該班學生，無法改選他班。
                </li>
                <li>
                  <span className="font-semibold">要修改怎麼辦？</span> 請聯絡管理者在管理端「提報總覽」按 <span className="font-semibold">解鎖</span>，你才可以重新送出更新資料。
                </li>
                <li>
                  <span className="font-semibold">同一班重複提報</span>：以 <span className="font-semibold">最後一次送出時間</span> 為準（會記錄送出者 Email 與時間）。
                </li>
                <li>
                  <span className="font-semibold">同一學生可多個獎項</span>：在學生卡片內可複選（各分類底下的細項皆可勾選）。
                </li>
                <li>
                  <span className="font-semibold">該勾選哪個獎項？</span> 頁面上方「獎項提報說明」會列出本次開放的分類與細項；教學組若另有公告（標準、名額、連結）也會一併顯示。實際認定仍以校內規定為準，不清楚請洽教學組。
                </li>
              </ul>
            </div>
          </details>
        </div>

        {(err || msg) && (
          <div className={`rounded-lg border p-3 text-sm ${err ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
            {err ?? msg}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
          <h2 className="font-semibold text-slate-800">獎項提報說明</h2>
          <p className="text-sm text-slate-700">
            教學組已設定下方「分類」（例如優異、進步）與「細項」（各科或項目）。請依
            <span className="font-semibold"> 校內公告或教學組訂定之標準 </span>
            ，為符合條件之學生在該生卡片內勾選對應細項；可複選多個細項。若不清楚應勾選哪些項目，請洽教學組。
          </p>
          {awardsConfig.teacherInstructions ? (
            <div className="rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-sm text-slate-900 whitespace-pre-wrap">
              <div className="text-xs font-semibold text-sky-900 mb-1">教學組說明</div>
              {awardsConfig.teacherInstructions}
            </div>
          ) : null}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <div className="text-xs font-semibold text-slate-700 mb-2">
              本次開放勾選之分類與細項
              {teacherGrade != null && (
                <span className="font-normal text-slate-500">（依您班級之年級：{teacherGrade} 年級）</span>
              )}
            </div>
            {displayAwardsConfig.categories.length === 0 ? (
              <p className="text-slate-500">尚未設定獎項，或此年級尚無適用細項，請聯絡教學組。</p>
            ) : (
              <ul className="space-y-2 list-none pl-0">
                {displayAwardsConfig.categories.map((cat) => (
                  <li key={cat.id}>
                    <span className="font-medium text-slate-800">{cat.label}</span>
                    <span className="text-slate-600">
                      ：
                      {(cat.items ?? []).length > 0 ? (cat.items ?? []).map((it) => it.label).join('、') : '（此年級無細項）'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">段考活動</label>
              <select className="w-full border rounded px-2 py-2 text-sm" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">班級</label>
              {rosterLoading ? (
                <div className="text-sm text-slate-500 py-2">載入學生名單中…</div>
              ) : classConfigError ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 whitespace-pre-wrap">{classConfigError}</div>
              ) : (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex-1 min-w-[120px] border rounded px-3 py-2 text-sm bg-slate-50 text-slate-900 font-medium">
                      {teacherResolvedClass ?? '—'}
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">依登入帳號白名單（僅能填報本班）</span>
                  </div>
                  {allowedUser?.teacherName ? (
                    <div className="text-xs text-slate-500">導師：{allowedUser.teacherName}</div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="border-t pt-3 space-y-2">
            <label className="block text-sm font-medium text-slate-700">加入學生（輸入座號或姓名任一字）</label>
            <input
              className="w-full border rounded px-3 py-2 text-sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="例：12 或 小明"
              disabled={!className || !!classConfigError || rosterLoading}
            />
            {className && !classConfigError && suggestions.length > 0 && (
              <div className="border rounded-lg bg-white max-h-56 overflow-y-auto">
                {suggestions.map((s) => (
                  <button
                    key={`${s.className}_${s.seat}`}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex justify-between"
                    onClick={() => addStudent(s)}
                  >
                    <span>
                      <span className="font-mono mr-2">{s.seat}</span>
                      <span className="font-medium">{s.name}</span>
                    </span>
                    <span className="text-slate-400">{s.className}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">已選學生（{selectedList.length}）</h2>
            <button
              type="button"
              onClick={handleSave}
              disabled={
                saving ||
                !campaignId ||
                !className ||
                !!classConfigError ||
                rosterLoading ||
                selectedList.length === 0
              }
              className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {campaign?.lockedByDefault === false ? '送出（不鎖定）' : '送出並鎖定'}
            </button>
          </div>

          <div className="space-y-3">
            {selectedList.map((stu) => {
              const stuKey = `${stu.className}_${stu.seat}`;
              return (
                <div key={stuKey} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800">
                        <span className="font-mono mr-2">{stu.seat}</span>
                        {stu.name}
                        <span className="text-slate-400 ml-2">{stu.className}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">依規定勾選符合之細項（可複選）</div>
                    </div>
                    <button type="button" onClick={() => removeStudent(stuKey)} className="text-xs px-2 py-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300">
                      移除
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {displayAwardsConfig.categories.map((cat) => (
                      <div key={cat.id} className="border rounded p-2">
                        <div className="text-sm font-semibold text-slate-700 mb-1">{cat.label}</div>
                        <div className="flex flex-wrap gap-2">
                          {(cat.items ?? []).map((it) => {
                            const key = buildAwardKey(cat.id, it.id);
                            const checked = stu.awards.includes(key);
                            return (
                              <label key={key} className="text-sm inline-flex items-center gap-1 cursor-pointer select-none">
                                <input type="checkbox" checked={checked} onChange={() => toggleAward(stuKey, key)} />
                                <span>{it.label}</span>
                              </label>
                            );
                          })}
                          {(cat.items ?? []).length === 0 && <span className="text-xs text-slate-400">（此年級無適用細項）</span>}
                        </div>
                      </div>
                    ))}
                    {displayAwardsConfig.categories.length === 0 && (
                      <div className="text-sm text-slate-500">此年級尚無可勾選之獎項細項，請聯絡教學組。</div>
                    )}
                  </div>
                </div>
              );
            })}
            {selectedList.length === 0 && (
              <div className="text-sm text-slate-500 flex items-center gap-2">
                <Lock size={16} className="text-slate-400" /> 尚未加入學生
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamSubmitPublicPage;

