import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, LogIn, Save, Lock } from 'lucide-react';
import type { ExamAwardsConfig, ExamCampaign, ExamSubmissionStudent, LanguageElectiveStudent } from '../types';
import { onAuthStateChanged, signInWithGoogle, signOut } from '../services/auth';
import { getExamAwardsConfig, getExamCampaigns, getExamSubmitAllowedUser, getLanguageElectiveRoster, saveExamSubmission } from '../services/api';

type Suggestion = { className: string; seat: string; name: string };

const buildAwardKey = (categoryId: string, itemId: string) => `${categoryId}:${itemId}`;

const ExamSubmitPublicPage: React.FC = () => {
  const [authLoading, setAuthLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [allowedLoading, setAllowedLoading] = useState(false);
  const [allowed, setAllowed] = useState<boolean>(false);

  const [campaigns, setCampaigns] = useState<ExamCampaign[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const campaign = useMemo(() => campaigns.find((c) => c.id === campaignId) ?? null, [campaignId, campaigns]);

  const [awardsConfig, setAwardsConfig] = useState<ExamAwardsConfig>({ categories: [] });

  const [rosterLoading, setRosterLoading] = useState(false);
  const [roster, setRoster] = useState<LanguageElectiveStudent[]>([]);
  const classOptions = useMemo(() => {
    const set = new Set(roster.map((s) => (s.className ?? '').trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), 'zh-TW', { numeric: true }));
  }, [roster]);

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
      setAllowed(false);
      return;
    }
    setAllowedLoading(true);
    setAuthError(null);
    getExamSubmitAllowedUser(userEmail)
      .then((doc) => {
        if (!doc?.enabled) {
          setAllowed(false);
          setAuthError(`帳號 ${userEmail} 未加入段考填報白名單，請聯絡管理者。`);
          return signOut();
        }
        setAllowed(true);
      })
      .catch((e: any) => {
        setAllowed(false);
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
    if (!userEmail || !campaignId || !className) return;
    const locked = campaign?.lockedByDefault !== false;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      await saveExamSubmission({
        campaignId,
        className,
        students: selectedList,
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

  if (allowedLoading || !allowed) {
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
                  <span className="font-semibold">要修改怎麼辦？</span> 請聯絡管理者在管理端「提報總覽」按 <span className="font-semibold">解鎖</span>，你才可以重新送出更新資料。
                </li>
                <li>
                  <span className="font-semibold">同一班重複提報</span>：以 <span className="font-semibold">最後一次送出時間</span> 為準（會記錄送出者 Email 與時間）。
                </li>
                <li>
                  <span className="font-semibold">同一學生可多個獎項</span>：在學生卡片內可複選（優異 / 進步底下的細項皆可勾選）。
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
              <select className="w-full border rounded px-2 py-2 text-sm" value={className} onChange={(e) => setClassName(e.target.value)} disabled={rosterLoading}>
                <option value="">請選擇</option>
                {classOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {rosterLoading && <div className="text-xs text-slate-500 mt-1">載入名單中…</div>}
            </div>
          </div>

          <div className="border-t pt-3 space-y-2">
            <label className="block text-sm font-medium text-slate-700">加入學生（輸入座號或姓名任一字）</label>
            <input className="w-full border rounded px-3 py-2 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="例：12 或 小明" disabled={!className} />
            {className && suggestions.length > 0 && (
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
              disabled={saving || !campaignId || !className || selectedList.length === 0}
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
                      <div className="text-xs text-slate-500 mt-1">可複選獎項</div>
                    </div>
                    <button type="button" onClick={() => removeStudent(stuKey)} className="text-xs px-2 py-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300">
                      移除
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {awardsConfig.categories.map((cat) => (
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
                          {(cat.items ?? []).length === 0 && <span className="text-xs text-slate-400">（尚無細項）</span>}
                        </div>
                      </div>
                    ))}
                    {awardsConfig.categories.length === 0 && (
                      <div className="text-sm text-slate-500">尚未設定獎項，請聯絡管理者。</div>
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

