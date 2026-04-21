import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, LogIn, Save, Lock, CheckCircle2, ExternalLink } from 'lucide-react';
import type { ExamAwardsConfig, ExamCampaign, ExamSubmissionStudent, ExamSubmitAllowedUser, LanguageElectiveStudent } from '../types';
import { onAuthStateChanged, signInWithGoogle, signOut } from '../services/auth';
import { getAuthInstance } from '../services/firebase';
import { getExamAwardsConfig, getExamCampaigns, getExamSubmitAllowedUser, getLanguageElectiveRoster, saveExamSubmission } from '../services/api';
import {
  awardKeyToDisplayLabel,
  buildVisibleAwardKeySet,
  dedupeAwardKeys,
  filterExamAwardsConfigForGrade,
  findAwardKeysWithMultipleStudents,
  findStudentCategoryMultiSelectConflicts,
  parseGradeFromClassName,
} from '../utils/examAwardGrade';
import { buildExamSubmitProgressHashUrl } from '../utils/publicExamRoutes';

type Suggestion = { className: string; seat: string; name: string };
type SubmitSuccessMeta = {
  className: string;
  submittedAt: string;
  submittedByEmail: string;
  studentCount: number;
  locked: boolean;
};

const buildAwardKey = (categoryId: string, itemId: string) => `${categoryId}:${itemId}`;

function maskStudentNameForPublic(raw: string): string {
  const name = String(raw ?? '').trim();
  if (!name) return '';
  const chars = Array.from(name);
  if (chars.length <= 1) return name;
  if (chars.length === 2) return `${chars[0]}O`;
  return `${chars[0]}${'O'.repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

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

  /** 段考活動／獎項設定自 Firestore 載入（失敗時不可靜默，否則會誤顯「主檔無班級」） */
  const [examMetaLoading, setExamMetaLoading] = useState(true);
  const [examMetaError, setExamMetaError] = useState<string | null>(null);

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

  /** 須在 teacherGrade 之前宣告，否則 useMemo 依賴會觸發 TDZ（Cannot access before initialization） */
  const [className, setClassName] = useState('');

  const teacherGrade = useMemo(
    () => parseGradeFromClassName(teacherResolvedClass ?? className),
    [teacherResolvedClass, className]
  );

  const displayAwardsConfig = useMemo(
    () => filterExamAwardsConfigForGrade(awardsConfig, teacherGrade),
    [awardsConfig, teacherGrade]
  );
  const allowPublicSubmitNoLogin = awardsConfig.allowPublicSubmitNoLogin === true;
  const anonymousMode = !userEmail && allowPublicSubmitNoLogin;
  const displayStudentName = (name: string) => (anonymousMode ? maskStudentNameForPublic(name) : name);
  const rosterClassOptions = useMemo(() => {
    const classes: string[] = roster
      .map((s) => String(s.className ?? '').trim())
      .filter((v) => v.length > 0);
    return [...new Set(classes)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [roster]);

  const classConfigError = useMemo(() => {
    if (anonymousMode) return null;
    if (!allowedUser) return null;
    if (!allowedUser.className) {
      return '管理者尚未在白名單設定您的「班級」，無法填報。請聯絡教學組。';
    }
    if (examMetaLoading) return null;
    if (examMetaError) {
      return `無法讀取段考活動或獎項設定：${examMetaError}。請重新整理頁面，或聯絡教學組檢查 Firebase 權限與網路。`;
    }
    if (rosterLoading) return null;
    /** 須先有「段考活動」且含學年度，才會載入該學年語言選修／學生主檔；否則 roster 為空，不可誤判為「主檔無此班」 */
    if (!campaign?.academicYear?.trim()) {
      if (campaigns.length === 0) {
        return '尚未建立任何段考活動，無法依學年度載入學生名單。請聯絡教學組於管理端新增「段考活動」。';
      }
      return '所選段考活動缺少「學年度」，無法載入學生名單。請聯絡教學組修正活動設定。';
    }
    if (teacherResolvedClass) return null;
    if (fuzzyClassHint) {
      return `白名單班級「${allowedUser.className}」與本學年度學生主檔班級字串不一致；請管理者將白名單改為「${fuzzyClassHint}」（須與主檔完全相同）。`;
    }
    return `本學年度學生主檔中找不到班級「${allowedUser.className}」。請管理者核對白名單班級與語言選修／學生主檔。`;
  }, [anonymousMode, allowedUser, examMetaLoading, examMetaError, rosterLoading, campaign, campaigns.length, teacherResolvedClass, fuzzyClassHint]);

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

  /** 同一獎項細項被多位學生勾選（送出前須排除） */
  const awardDuplicateConflicts = useMemo(
    () => findAwardKeysWithMultipleStudents(selectedList),
    [selectedList]
  );
  const studentCategoryConflicts = useMemo(
    () => findStudentCategoryMultiSelectConflicts(selectedList),
    [selectedList]
  );

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitSuccessMeta, setSubmitSuccessMeta] = useState<SubmitSuccessMeta | null>(null);
  const feedbackRef = useRef<HTMLDivElement | null>(null);

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

  /**
   * 須等登入身分就緒後再讀 Firestore。Google 登入跳轉回來時，若首屏即打段考／獎項 API，
   * 常會在 Auth 尚未附加到請求時送出 → 權限錯誤；重新整理則 session 已還原故正常。
   */
  useEffect(() => {
    let cancelled = false;
    setExamMetaLoading(true);
    setExamMetaError(null);

    (async () => {
      try {
        const auth = getAuthInstance();
        await auth?.currentUser?.getIdToken();
      } catch {
        /* 仍嘗試讀取；失敗由 catch 顯示 */
      }
      if (cancelled) return;

      try {
        const [camps, cfg] = await Promise.all([getExamCampaigns(), getExamAwardsConfig()]);
        if (cancelled) return;
        setCampaigns(camps);
        setAwardsConfig(cfg);
        if (camps.length > 0) setCampaignId(camps[0].id);
      } catch (e: any) {
        if (!cancelled) setExamMetaError(e?.message || '讀取失敗');
      } finally {
        if (!cancelled) setExamMetaLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
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
    if (!anonymousMode) {
      if (teacherResolvedClass) setClassName(teacherResolvedClass);
      else setClassName('');
    }
  }, [anonymousMode, teacherResolvedClass]);

  useEffect(() => {
    const visible = buildVisibleAwardKeySet(awardsConfig, teacherGrade);
    setSelected((prev) => {
      let changed = false;
      const next: Record<string, ExamSubmissionStudent> = {};
      for (const [k, stu] of Object.entries(prev) as [string, ExamSubmissionStudent][]) {
        const filtered = stu.awards.filter((a) => visible.has(a));
        const awards = dedupeAwardKeys(filtered);
        if (filtered.length !== stu.awards.length || awards.length !== filtered.length) changed = true;
        next[k] = { ...stu, awards };
      }
      return changed ? next : prev;
    });
  }, [awardsConfig, teacherGrade]);

  useEffect(() => {
    if (!msg && !err && !submitSuccessMeta) return;
    feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [msg, err, submitSuccessMeta]);

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
      if (has) {
        const awards = row.awards.filter((x) => x !== awardKey);
        return { ...prev, [stuKey]: { ...row, awards } };
      }
      for (const [k, stu] of Object.entries(prev) as [string, ExamSubmissionStudent][]) {
        if (k === stuKey) continue;
        if (stu.awards.includes(awardKey)) {
          const label = awardKeyToDisplayLabel(awardKey, awardsConfig);
          const other = `${stu.seat}號 ${displayStudentName(stu.name)}`;
          queueMicrotask(() =>
            setErr(`「${label}」已由 ${other} 勾選，同一獎項細項僅限一位學生，請先取消其中一方。`)
          );
          return prev;
        }
      }
      const idx = awardKey.indexOf(':');
      if (idx > 0) {
        const categoryId = awardKey.slice(0, idx);
        const existed = row.awards.find((k) => k.startsWith(`${categoryId}:`) && k !== awardKey);
        if (existed) {
          const catLabel = awardsConfig.categories.find((c) => c.id === categoryId)?.label ?? categoryId;
          const existedLabel = awardKeyToDisplayLabel(existed, awardsConfig);
          const newLabel = awardKeyToDisplayLabel(awardKey, awardsConfig);
          queueMicrotask(() =>
            setErr(`同一學生在「${catLabel}」類別僅能勾選一項（已選：${existedLabel}；欲選：${newLabel}）。`)
          );
          return prev;
        }
      }
      return { ...prev, [stuKey]: { ...row, awards: [...row.awards, awardKey] } };
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
    if (!campaignId || !className) return;
    if (!anonymousMode && (!userEmail || !teacherResolvedClass)) return;
    if (!anonymousMode && className !== teacherResolvedClass) {
      setErr('班級與白名單不一致，無法送出。');
      return;
    }
    for (const stu of selectedList) {
      if (String(stu.className) !== String(className)) {
        setErr('含有非本班學生，請移除後再送出。');
        return;
      }
    }
    const visible = buildVisibleAwardKeySet(awardsConfig, teacherGrade);
    const studentsPayload = selectedList.map((stu) => ({
      ...stu,
      awards: dedupeAwardKeys(stu.awards.filter((a) => visible.has(a))),
    }));
    const dup = findAwardKeysWithMultipleStudents(studentsPayload);
    if (dup.length > 0) {
      const detail = dup
        .map((d) => {
          const masked = d.labels.map((s) => s.replace(/號\s+(.+)$/, (_m, n) => `號 ${displayStudentName(String(n))}`));
          return `${awardKeyToDisplayLabel(d.key, awardsConfig)}：${masked.join('、')}`;
        })
        .join('\n');
      setErr(`同一獎項細項不可重複勾選於多位學生，請調整後再送出：\n${detail}`);
      return;
    }
    const categoryConflicts = findStudentCategoryMultiSelectConflicts(studentsPayload);
    if (categoryConflicts.length > 0) {
      const detail = categoryConflicts
        .map((d) => {
          const catLabel = awardsConfig.categories.find((c) => c.id === d.categoryId)?.label ?? d.categoryId;
          const picked = d.awardKeys.map((k) => awardKeyToDisplayLabel(k, awardsConfig)).join('、');
          const maskedStudentLabel = d.studentLabel.replace(/號\s+(.+)$/, (_m, n) => `號 ${displayStudentName(String(n))}`);
          return `${maskedStudentLabel}（${catLabel}）：${picked}`;
        })
        .join('\n');
      setErr(`同一學生在同一類別僅能勾選一項，請調整後再送出：\n${detail}`);
      return;
    }
    const locked = campaign?.lockedByDefault !== false;
    setSaving(true);
    setErr(null);
    setMsg(null);
    setSubmitSuccessMeta(null);
    const submittedAtIso = new Date().toISOString();
    try {
      await saveExamSubmission({
        campaignId,
        className,
        students: studentsPayload,
        locked,
        submittedByEmail: userEmail || 'public',
        submittedAt: submittedAtIso,
      } as any);
      setMsg(locked ? '已送出（已鎖定）。如需修改請聯絡管理者解鎖。' : '已送出（未鎖定，可再次送出更新）。');
      setSubmitSuccessMeta({
        className,
        submittedAt: submittedAtIso,
        submittedByEmail: userEmail || 'public',
        studentCount: studentsPayload.length,
        locked,
      });
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

  // 未登入時需先讀到段考設定（含 allowPublicSubmitNoLogin），避免重新整理瞬間誤判成「必須登入」。
  if (!userEmail && examMetaLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-slate-200 p-6 space-y-3">
          <h1 className="text-lg font-bold text-slate-800">段考名單填報</h1>
          <div className="flex items-center gap-2 text-slate-600 text-sm">
            <Loader2 size={18} className="animate-spin" /> 載入填報設定中…
          </div>
        </div>
      </div>
    );
  }

  if (!userEmail && !allowPublicSubmitNoLogin) {
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

  if (!anonymousMode && (allowedLoading || !allowedUser)) {
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
    <div className="min-h-screen bg-slate-100 p-3 sm:p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-800">段考名單填報</h1>
            <p className="text-xs text-slate-500 mt-1 font-mono">{userEmail || 'public (免登入模式)'}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:items-center sm:justify-end">
            <a
              href={buildExamSubmitProgressHashUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto text-sm px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 inline-flex items-center justify-center gap-2"
            >
              <ExternalLink size={16} />
              已提報班級清單（另開，無個資）
            </a>
            {userEmail ? (
              <button
                type="button"
                onClick={() => signOut().then(() => window.location.reload())}
                className="w-full sm:w-auto text-sm px-3 py-2 rounded bg-slate-200 text-slate-700 hover:bg-slate-300"
              >
                登出
              </button>
            ) : (
              <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2 text-center sm:text-left">
                目前為免登入填報模式
              </div>
            )}
          </div>
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
                {anonymousMode && (
                  <li>
                    <span className="font-semibold">免登入模式</span>：本頁目前允許未登入填報，請先自行選擇班級後再提報，送出者會記錄為 public。
                  </li>
                )}
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

        <div ref={feedbackRef} />
        {(err || msg || submitSuccessMeta) && (
          <div className="space-y-3">
            {submitSuccessMeta && (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 sm:p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={22} className="text-emerald-700 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-emerald-800">名單已成功送出</h3>
                    <p className="text-sm text-emerald-900 mt-1">
                      系統已收到本次段考提報。若需修改，請聯絡管理者於提報總覽解鎖後再重新送出。
                    </p>
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-700 space-y-1">
                      <div>班級：<span className="font-mono font-semibold">{submitSuccessMeta.className}</span></div>
                      <div>送出時間：{new Date(submitSuccessMeta.submittedAt).toLocaleString('zh-TW', { hour12: false })}</div>
                      <div>送出者：<span className="font-mono">{submitSuccessMeta.submittedByEmail}</span></div>
                      <div>提報筆數：{submitSuccessMeta.studentCount} 人</div>
                      <div>狀態：{submitSuccessMeta.locked ? '已鎖定（需管理者解鎖才能改）' : '未鎖定（可再次送出更新）'}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {(err || msg) && (
              <div className={`rounded-lg border p-3 text-sm ${err ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                {err ?? msg}
              </div>
            )}
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
              <select
                className="w-full border rounded px-2 py-2 text-sm"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                disabled={examMetaLoading || campaigns.length === 0}
              >
                {campaigns.length === 0 ? (
                  <option value="" disabled>
                    {examMetaLoading ? '載入中…' : '尚無段考活動'}
                  </option>
                ) : (
                  campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title || c.id}
                    </option>
                  ))
                )}
              </select>
              {!examMetaLoading && campaigns.length === 0 && !examMetaError && (
                <p className="text-xs text-amber-800 mt-1">請聯絡教學組在管理端建立「段考活動」，並填寫學年度，才能載入學生名單。</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">班級</label>
              {examMetaLoading ? (
                <div className="text-sm text-slate-500 py-2">載入段考活動與獎項設定中…</div>
              ) : rosterLoading ? (
                <div className="text-sm text-slate-500 py-2">載入學生名單中…</div>
              ) : anonymousMode ? (
                <div className="space-y-1">
                  <select
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                  >
                    <option value="">請選擇班級</option>
                    {rosterClassOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-slate-500">免登入模式：請自行選擇班級。</div>
                </div>
              ) : classConfigError ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 whitespace-pre-wrap">{classConfigError}</div>
              ) : (
                <div className="space-y-1">
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
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
              disabled={examMetaLoading || !className || !!classConfigError || rosterLoading}
            />
            {className && !classConfigError && suggestions.length > 0 && (
              <div className="border rounded-lg bg-white max-h-56 overflow-y-auto">
                {suggestions.map((s) => (
                  <button
                    key={`${s.className}_${s.seat}`}
                    type="button"
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 flex items-start sm:items-center justify-between gap-2"
                    onClick={() => addStudent(s)}
                  >
                    <span className="min-w-0">
                      <span className="font-mono mr-2">{s.seat}</span>
                      <span className="font-medium">{displayStudentName(s.name)}</span>
                    </span>
                    <span className="text-slate-400 text-xs sm:text-sm shrink-0">{s.className}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h2 className="font-semibold text-slate-800">已選學生（{selectedList.length}）</h2>
            <button
              type="button"
              onClick={handleSave}
              disabled={
                saving ||
                examMetaLoading ||
                !campaignId ||
                !className ||
                !!classConfigError ||
                rosterLoading ||
                selectedList.length === 0 ||
                awardDuplicateConflicts.length > 0 ||
                studentCategoryConflicts.length > 0
              }
              className="w-full sm:w-auto px-3 py-2.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : submitSuccessMeta ? <CheckCircle2 size={16} /> : <Save size={16} />}
              {saving
                ? '送出中...'
                : submitSuccessMeta
                  ? '已送出'
                  : campaign?.lockedByDefault === false
                    ? '送出（不鎖定）'
                    : '送出並鎖定'}
            </button>
          </div>

          {awardDuplicateConflicts.length > 0 && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 space-y-1"
            >
              <div className="font-semibold">偵測到獎項重複：同一細項僅限一位學生，請調整勾選後再送出</div>
              <ul className="list-disc pl-5 space-y-0.5">
                {awardDuplicateConflicts.map((d) => (
                  <li key={d.key}>
                    <span className="font-medium">{awardKeyToDisplayLabel(d.key, awardsConfig)}</span>
                    ：{d.labels
                      .map((s) => s.replace(/號\s+(.+)$/, (_m, n) => `號 ${displayStudentName(String(n))}`))
                      .join('、')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {studentCategoryConflicts.length > 0 && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 space-y-1"
            >
              <div className="font-semibold">偵測到同一學生於同類別重複勾選：每位學生每一類別僅限一項</div>
              <ul className="list-disc pl-5 space-y-0.5">
                {studentCategoryConflicts.map((d, idx) => {
                  const catLabel = awardsConfig.categories.find((c) => c.id === d.categoryId)?.label ?? d.categoryId;
                  return (
                    <li key={`${d.studentLabel}_${d.categoryId}_${idx}`}>
                      <span className="font-medium">
                        {d.studentLabel.replace(/號\s+(.+)$/, (_m, n) => `號 ${displayStudentName(String(n))}`)}
                      </span>
                      ：{catLabel}（{d.awardKeys.map((k) => awardKeyToDisplayLabel(k, awardsConfig)).join('、')}）
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="space-y-3">
            {selectedList.map((stu) => {
              const stuKey = `${stu.className}_${stu.seat}`;
              return (
                <div key={stuKey} className="border rounded-lg p-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800">
                        <span className="font-mono mr-2">{stu.seat}</span>
                        {displayStudentName(stu.name)}
                        <span className="text-slate-400 ml-2">{stu.className}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        同一學生可跨類別複選；同一學生於同一類別僅限一項，且同一細項於全班僅限一位學生。
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeStudent(stuKey)}
                      className="w-full sm:w-auto text-xs px-2 py-1.5 rounded bg-slate-200 text-slate-700 hover:bg-slate-300"
                    >
                      移除
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {displayAwardsConfig.categories.map((cat) => (
                      <div key={cat.id} className="border rounded p-2">
                        <div className="text-sm font-semibold text-slate-700 mb-1">{cat.label}</div>
                        <div className="flex flex-wrap gap-2.5">
                          {(cat.items ?? []).map((it) => {
                            const key = buildAwardKey(cat.id, it.id);
                            const checked = stu.awards.includes(key);
                            return (
                              <label key={key} className="text-sm inline-flex items-center gap-1.5 cursor-pointer select-none rounded px-1 py-0.5 hover:bg-slate-50">
                                <input type="checkbox" checked={checked} onChange={() => toggleAward(stuKey, key)} className="h-4 w-4" />
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

