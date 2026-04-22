import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ExternalLink, Loader2, LogIn } from 'lucide-react';
import type { ExamCampaign, ExamSubmitProgressRow } from '../types';
import { onAuthStateChanged, signInWithGoogle } from '../services/auth';
import { getExamCampaigns, getExamSubmitAllowedUsers, getExamSubmitProgressForCampaign } from '../services/api';
import { buildExamSubmitFormHashUrl } from '../utils/publicExamRoutes';

function gradeFromClassName(className: string): number | null {
  const s = String(className ?? '').trim();
  const m = s.match(/^(\d{1,2})\d{2}$/);
  if (m) return Number(m[1]);
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 3) return Number(digits.slice(0, digits.length - 2));
  if (digits.length === 1) return Number(digits);
  return null;
}

function classSortNumber(className: string): number {
  const digits = String(className ?? '').replace(/\D/g, '');
  return digits ? Number(digits) : Number.MAX_SAFE_INTEGER;
}

function formatSubmittedAtTw(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

const ExamSubmitPublicProgressPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [authLoading, setAuthLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [examMetaLoading, setExamMetaLoading] = useState(true);
  const [examMetaError, setExamMetaError] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<ExamCampaign[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const campaignFromUrl = useMemo(
    () => String(searchParams.get('campaignId') ?? searchParams.get('campaign') ?? '').trim(),
    [searchParams]
  );
  const campaign = useMemo(() => campaigns.find((c) => c.id === campaignId) ?? null, [campaignId, campaigns]);

  const [rowsLoading, setRowsLoading] = useState(false);
  const [rows, setRows] = useState<ExamSubmitProgressRow[]>([]);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [expectedClassNames, setExpectedClassNames] = useState<string[]>([]);
  const [expectedClassHint, setExpectedClassHint] = useState<string | null>(null);
  const gradeSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const mergedRows = useMemo<ExamSubmitProgressRow[]>(() => {
    const byClass = new Map<string, ExamSubmitProgressRow>();
    rows.forEach((r) => {
      const cls = String(r.className ?? '').trim();
      if (!cls) return;
      byClass.set(cls, { className: cls, lastSubmittedAt: String(r.lastSubmittedAt ?? '') });
    });
    expectedClassNames.forEach((cls) => {
      if (!byClass.has(cls)) {
        byClass.set(cls, { className: cls, lastSubmittedAt: '' });
      }
    });
    return [...byClass.values()];
  }, [rows, expectedClassNames]);

  const groupedRows = useMemo(() => {
    const groups = new Map<string, ExamSubmitProgressRow[]>();
    mergedRows.forEach((r) => {
      const grade = gradeFromClassName(r.className);
      const key = grade == null ? '未分類' : `${grade}年級`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    });
    return [...groups.entries()]
      .sort((a, b) => {
        if (a[0] === '未分類') return 1;
        if (b[0] === '未分類') return -1;
        return Number(a[0].replace('年級', '')) - Number(b[0].replace('年級', ''));
      })
      .map(([gradeLabel, list]) => ({
        gradeLabel,
        list: [...list].sort((a, b) => classSortNumber(a.className) - classSortNumber(b.className)),
      }));
  }, [mergedRows]);

  useEffect(() => {
    const unsub = onAuthStateChanged((u) => {
      setUserEmail(u?.email ?? null);
      setAuthLoading(false);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setExamMetaLoading(true);
    setExamMetaError(null);
    getExamCampaigns()
      .then((list) => {
        if (cancelled) return;
        setCampaigns(Array.isArray(list) ? list : []);
      })
      .catch((e: any) => {
        if (!cancelled) setExamMetaError(e?.message || '無法載入段考設定');
      })
      .finally(() => {
        if (!cancelled) setExamMetaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!campaignId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setRowsLoading(true);
    setRowsError(null);
    getExamSubmitProgressForCampaign(campaignId)
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((e: any) => {
        if (!cancelled) setRowsError(e?.message || '無法讀取提報進度');
      })
      .finally(() => {
        if (!cancelled) setRowsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  useEffect(() => {
    if (!userEmail) {
      setExpectedClassNames([]);
      setExpectedClassHint('未登入時僅顯示已上傳進度，無法比對完整應填班級。');
      return;
    }
    let cancelled = false;
    setExpectedClassHint(null);
    getExamSubmitAllowedUsers()
      .then((list) => {
        if (cancelled) return;
        const classes = [...new Set(
          (Array.isArray(list) ? list : [])
            .filter((x) => x.enabled && String(x.className ?? '').trim().length > 0)
            .map((x) => String(x.className ?? '').trim()),
        )].sort((a, b) => classSortNumber(a) - classSortNumber(b));
        setExpectedClassNames(classes);
      })
      .catch(() => {
        if (cancelled) return;
        setExpectedClassNames([]);
        setExpectedClassHint('目前帳號無法讀取白名單班級，未填報班級可能無法完整顯示。');
      });
    return () => {
      cancelled = true;
    };
  }, [userEmail]);

  useEffect(() => {
    if (campaignFromUrl) setCampaignId(campaignFromUrl);
  }, [campaignFromUrl]);

  useEffect(() => {
    if (campaignFromUrl) return;
    if (campaigns.length === 0 || campaignId) return;
    const first = campaigns[0]?.id;
    if (first) setCampaignId(first);
  }, [campaigns, campaignId, campaignFromUrl]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-slate-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-800">段考提報進度</h1>
              <p className="text-xs text-slate-500 mt-1">僅顯示班級與最後送出時間（畫面不列出學生）。</p>
              {!userEmail ? (
                <p className="text-xs text-emerald-700 mt-1">您未登入；本頁僅顯示各班是否已送出之彙整（無學生個資）。</p>
              ) : null}
            </div>
            <a
              href={buildExamSubmitFormHashUrl()}
              className="shrink-0 text-sm px-3 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 inline-flex items-center justify-center gap-2"
            >
              <ExternalLink size={16} /> 前往填報
            </a>
          </div>
          {!userEmail ? (
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-600">
                需導師填報、或教學組完整權限時，請使用 Google 登入（段考填報白名單／EduTrack）。
              </p>
              <button
                type="button"
                onClick={() => signInWithGoogle().catch((e: any) => setAuthError(e?.message || 'Google 登入失敗'))}
                className="shrink-0 text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 inline-flex items-center justify-center gap-2"
              >
                <LogIn size={16} /> Google 登入
              </button>
            </div>
          ) : null}
          {authError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{authError}</div>}
          {examMetaError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{examMetaError}</div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
          <label className="block text-sm font-medium text-slate-700">段考活動</label>
          <select
            className="w-full border rounded px-2 py-2 text-sm"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            disabled={examMetaLoading || campaigns.length === 0}
          >
            {campaigns.length === 0 ? <option value="">尚無活動</option> : null}
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title || c.id}
              </option>
            ))}
          </select>
          {campaign?.academicYear ? (
            <p className="text-xs text-slate-500">學年度：{campaign.academicYear}</p>
          ) : null}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
          <h2 className="font-semibold text-slate-800">已提報班級</h2>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 space-y-1">
            <div className="font-semibold text-slate-800">狀態說明</div>
            <div>
              <span className="font-medium text-slate-900">黑色文字</span>：已填報（有最後送出時間）
            </div>
            <div>
              <span className="font-medium text-slate-400">灰色文字</span>：未填報（尚無送出時間）
            </div>
            {expectedClassHint && <div className="text-amber-700">{expectedClassHint}</div>}
          </div>
          {rowsError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{rowsError}</div>}
          {rowsLoading ? (
            <div className="flex items-center gap-2 text-slate-600 text-sm py-4">
              <Loader2 size={18} className="animate-spin" /> 讀取中…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">
              所選活動尚無可顯示的提報紀錄。若教學組確認主檔已有舊資料，請於管理端「段考提報」按「同步進度列」補寫進度後再重新整理本頁。
            </p>
          ) : (
            <div className="space-y-3">
              {groupedRows.length > 1 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-xs font-semibold text-slate-700 mb-2">跳轉至年級</div>
                  <div className="flex flex-wrap gap-2">
                    {groupedRows.map((group) => (
                      <button
                        key={`jump_${group.gradeLabel}`}
                        type="button"
                        className="px-2.5 py-1.5 rounded-md text-xs font-medium border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
                        onClick={() => gradeSectionRefs.current[group.gradeLabel]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      >
                        {group.gradeLabel}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {groupedRows.map((group) => (
                <div
                  key={group.gradeLabel}
                  ref={(el) => {
                    gradeSectionRefs.current[group.gradeLabel] = el;
                  }}
                  className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50"
                >
                  <div className="px-3 py-2 bg-slate-50 text-sm font-semibold text-slate-700">{group.gradeLabel}</div>
                  <ul className="divide-y divide-slate-100">
                    {group.list.map((r) => {
                      const submitted = !!String(r.lastSubmittedAt ?? '').trim();
                      return (
                        <li key={`${group.gradeLabel}_${r.className}`} className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 bg-slate-50">
                          <span className={`font-medium ${submitted ? 'text-slate-900' : 'text-slate-400'}`}>{r.className}</span>
                          <span className={`text-xs sm:text-right tabular-nums ${submitted ? 'text-slate-600' : 'text-slate-400'}`}>
                            {submitted ? `最後送出：${formatSubmittedAtTw(r.lastSubmittedAt)}` : '尚未填報'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExamSubmitPublicProgressPage;
