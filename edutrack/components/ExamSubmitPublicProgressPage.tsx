import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, LogIn } from 'lucide-react';
import type { ExamCampaign, ExamSubmitProgressRow } from '../types';
import { onAuthStateChanged, signInWithGoogle } from '../services/auth';
import { getExamAwardsConfig, getExamCampaigns, getExamSubmitProgressForCampaign } from '../services/api';
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
  const [authLoading, setAuthLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [examMetaLoading, setExamMetaLoading] = useState(true);
  const [examMetaError, setExamMetaError] = useState<string | null>(null);
  const [awardsConfig, setAwardsConfig] = useState<{ allowPublicSubmitNoLogin?: boolean }>({});
  const allowPublicSubmitNoLogin = awardsConfig.allowPublicSubmitNoLogin === true;

  const [campaigns, setCampaigns] = useState<ExamCampaign[]>([]);
  const [campaignId, setCampaignId] = useState('');
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
    Promise.all([getExamAwardsConfig(), getExamCampaigns()])
      .then(([cfg, list]) => {
        if (cancelled) return;
        setAwardsConfig(cfg ?? {});
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
    if (campaigns.length === 0 || campaignId) return;
    const first = campaigns[0]?.id;
    if (first) setCampaignId(first);
  }, [campaigns, campaignId]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-slate-600" />
      </div>
    );
  }

  if (!userEmail && examMetaLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-slate-200 p-6 space-y-3">
          <h1 className="text-lg font-bold text-slate-800">段考提報進度</h1>
          <div className="flex items-center gap-2 text-slate-600 text-sm">
            <Loader2 size={18} className="animate-spin" /> 載入中…
          </div>
        </div>
      </div>
    );
  }

  if (!userEmail && !allowPublicSubmitNoLogin) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-slate-200 p-6 space-y-4">
          <h1 className="text-lg font-bold text-slate-800">段考提報進度</h1>
          <p className="text-sm text-slate-600">請使用 Google 登入（需在段考填報白名單）後檢視各班提報狀況。</p>
          {authError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{authError}</div>}
          <button
            type="button"
            onClick={() => signInWithGoogle().catch((e: any) => setAuthError(e?.message || 'Google 登入失敗'))}
            className="w-full py-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-900 inline-flex items-center justify-center gap-2"
          >
            <LogIn size={18} /> 使用 Google 登入
          </button>
          <a
            href={buildExamSubmitFormHashUrl()}
            className="block text-center text-sm text-blue-700 hover:underline"
          >
            前往段考名單填報
          </a>
        </div>
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
              <p className="text-xs text-slate-500 mt-1">僅顯示已成功送出之班級，不含學生姓名、座號等個資。</p>
            </div>
            <a
              href={buildExamSubmitFormHashUrl()}
              className="shrink-0 text-sm px-3 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 inline-flex items-center justify-center gap-2"
            >
              <ExternalLink size={16} /> 前往填報
            </a>
          </div>
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
                {c.name || c.id}
              </option>
            ))}
          </select>
          {campaign?.academicYear ? (
            <p className="text-xs text-slate-500">學年度：{campaign.academicYear}</p>
          ) : null}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
          <h2 className="font-semibold text-slate-800">已提報班級</h2>
          <p className="text-xs text-slate-500">
            列表依「最後送出時間」新到舊排序。本頁資料於每次成功送出時更新；若需完整內容請洽教學組。
          </p>
          {rowsError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{rowsError}</div>}
          {rowsLoading ? (
            <div className="flex items-center gap-2 text-slate-600 text-sm py-4">
              <Loader2 size={18} className="animate-spin" /> 讀取中…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">目前尚無班級寫入進度紀錄，或所選活動尚無成功送出之班級。</p>
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
