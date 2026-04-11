import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, type Timestamp } from 'firebase/firestore';
import { Eye, Loader2, RefreshCw, X } from 'lucide-react';
import { db } from '../src/lib/firebase';
import { useAppStore } from '../store/useAppStore';

const FETCH_LIMIT = 5000;

type ViewEvent = {
  id: string;
  teacherId: string;
  teacherName: string;
  yearMonth: string;
  viewedAt: Timestamp;
};

function localYearMonth(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${y}年${m}月`;
}

function formatViewedAtTw(ts: Timestamp | undefined): string {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function recentMonthOptions(count: number): string[] {
  const out: string[] = [];
  const n = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(n.getFullYear(), n.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

const SubstituteLookupViewStats: React.FC = () => {
  const { isSubteachAdmin } = useAppStore();
  const [events, setEvents] = useState<ViewEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(localYearMonth);
  const [detailTeacher, setDetailTeacher] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    if (!isSubteachAdmin || !db) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const q = query(
        collection(db, 'substituteWeeklyLookupViews'),
        orderBy('viewedAt', 'desc'),
        limit(FETCH_LIMIT),
      );
      const snap = await getDocs(q);
      const rows: ViewEvent[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          teacherId: String(d.teacherId ?? ''),
          teacherName: String(d.teacherName ?? ''),
          yearMonth: String(d.yearMonth ?? ''),
          viewedAt: d.viewedAt as Timestamp,
        };
      });
      setEvents(rows);
    } catch (e: unknown) {
      console.error(e);
      const err = e as { code?: string; message?: string };
      const code = err?.code ?? '';
      const msg = (err?.message && String(err.message)) || String(e);
      let hint =
        '請確認已部署專案內最新 firestore.rules，且您的帳號於 subteach_allowed_users 為 admin（或符合規則中的指定管理員）。';
      if (code === 'permission-denied') {
        hint =
          'Firestore 拒絕讀取（permission-denied）。請部署含 substituteWeeklyLookupViews「僅管理員可讀」的規則，並確認白名單 role 為 admin；若剛改 Gmail 驗證狀態，請重新登入。';
      } else if (code === 'failed-precondition') {
        hint =
          '查詢需建立索引（failed-precondition）。請開啟瀏覽器開發者工具主控台，依 Firebase 錯誤內的網址建立複合索引後再按「重新整理」。';
      }
      setLoadError(`無法載入統計。\n【${code || '錯誤'}】${msg}\n\n${hint}`);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [isSubteachAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const monthOptions = useMemo(() => {
    const fromData = new Set<string>();
    events.forEach((e) => {
      if (/^\d{4}-\d{2}$/.test(e.yearMonth)) fromData.add(e.yearMonth);
    });
    recentMonthOptions(18).forEach((m) => fromData.add(m));
    return Array.from(fromData).sort((a, b) => b.localeCompare(a));
  }, [events]);

  const rowsForMonth = useMemo(() => {
    const list = events.filter((e) => e.yearMonth === selectedMonth);
    const byTeacher = new Map<string, { teacherId: string; teacherName: string; count: number; times: ViewEvent[] }>();
    list.forEach((e) => {
      if (!e.teacherId) return;
      const cur = byTeacher.get(e.teacherId) || {
        teacherId: e.teacherId,
        teacherName: e.teacherName || e.teacherId,
        count: 0,
        times: [],
      };
      cur.count += 1;
      cur.times.push(e);
      if (e.teacherName) cur.teacherName = e.teacherName;
      byTeacher.set(e.teacherId, cur);
    });
    return Array.from(byTeacher.values()).sort((a, b) => b.count - a.count || a.teacherName.localeCompare(b.teacherName, 'zh-Hant'));
  }, [events, selectedMonth]);

  const detailTimes = useMemo(() => {
    if (!detailTeacher) return [];
    return events
      .filter((e) => e.teacherId === detailTeacher.id && e.yearMonth === selectedMonth)
      .sort((a, b) => (b.viewedAt?.seconds ?? 0) - (a.viewedAt?.seconds ?? 0))
      .map((e) => formatViewedAtTw(e.viewedAt));
  }, [detailTeacher, events, selectedMonth]);

  if (!isSubteachAdmin) {
    return (
      <div className="min-h-full p-6 max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-950">
          <h1 className="text-lg font-bold mb-2">代課連結查閱統計</h1>
          <p className="text-sm">僅限代課系統<strong>管理員</strong>（白名單 role: admin）可檢視此頁。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-md">
              <Eye size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">代課連結查閱統計</h1>
              <p className="text-sm text-slate-600 mt-0.5">
                統計教師使用「代課老師週課表查詢」（#/sub-weekly）的次數；每次成功以手機查詢即記錄一筆。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            重新整理
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">檢視月份</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full sm:w-64 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          >
            {monthOptions.map((ym) => (
              <option key={ym} value={ym}>
                {formatMonthLabel(ym)}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-2">
            僅顯示該曆月內、且歸屬於該月的查詢紀錄（以伺服器收到請求時之曆月為準）。最近最多載入 {FETCH_LIMIT} 筆。
          </p>
        </div>

        {loadError && (
          <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 whitespace-pre-line font-mono leading-relaxed">
            {loadError}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500 gap-2">
              <Loader2 size={22} className="animate-spin" />
              載入中…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">教師</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-700 w-28">查閱次數</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-700 w-36">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rowsForMonth.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-10 text-center text-slate-400">
                        {formatMonthLabel(selectedMonth)} 尚無查閱紀錄。
                      </td>
                    </tr>
                  ) : (
                    rowsForMonth.map((row) => (
                      <tr key={row.teacherId} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 text-slate-800">
                          <div className="font-medium">{row.teacherName}</div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">{row.teacherId}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">{row.count}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setDetailTeacher({ id: row.teacherId, name: row.teacherName })}
                            className="text-indigo-600 hover:text-indigo-800 font-medium text-xs sm:text-sm"
                          >
                            查看時間
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {detailTeacher && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-stats-detail-title"
        >
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md max-h-[min(80vh,520px)] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h2 id="view-stats-detail-title" className="font-bold text-slate-900 pr-2">
                {detailTeacher.name}
                <span className="block text-xs font-normal text-slate-500 mt-0.5">
                  {formatMonthLabel(selectedMonth)} · 查閱時間
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setDetailTeacher(null)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
                aria-label="關閉"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <ol className="space-y-2 list-decimal list-inside text-sm text-slate-700">
                {detailTimes.map((t, i) => (
                  <li key={`${t}_${i}`} className="tabular-nums">
                    {t}
                  </li>
                ))}
              </ol>
              {detailTimes.length === 0 && <p className="text-sm text-slate-400">無紀錄</p>}
            </div>
            <div className="px-4 py-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDetailTeacher(null)}
                className="w-full py-2.5 rounded-lg bg-slate-100 text-slate-800 font-medium text-sm hover:bg-slate-200"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubstituteLookupViewStats;
