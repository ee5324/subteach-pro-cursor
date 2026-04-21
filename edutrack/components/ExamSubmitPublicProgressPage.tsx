import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ExternalLink, Loader2, LogIn } from 'lucide-react';
import type { ExamCampaign, ExamSubmitProgressRow } from '../types';
import { onAuthStateChanged, signInWithGoogle } from '../services/auth';
import { getExamCampaigns, getExamSubmitProgressForCampaign } from '../services/api';
import { buildExamSubmitFormHashUrl } from '../utils/publicExamRoutes';

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
          <p className="text-xs text-slate-500">依「最後送出時間」新到舊排序。</p>
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
            <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
              {rows.map((r) => (
                <li key={r.className} className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 bg-white">
                  <span className="font-medium text-slate-800">{r.className}</span>
                  <span className="text-xs text-slate-500 sm:text-right tabular-nums">最後送出：{formatSubmittedAtTw(r.lastSubmittedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExamSubmitPublicProgressPage;
