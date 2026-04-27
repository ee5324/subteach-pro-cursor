import React from 'react';

type VersionEntry = {
  version: string;
  date: string;
  commit: string;
  tag?: string;
  summary: string[];
  rollbackHint?: string;
};

const VERSION_ENTRIES: VersionEntry[] = [
  {
    version: 'stable-baseline',
    date: '2026-04-27',
    commit: '6281f6e',
    tag: 'stable-version',
    summary: ['目前設定的穩定版本基準點。', '若需快速回復，可直接以此版本作為還原目標。'],
    rollbackHint: 'git reset --hard stable-version',
  },
  {
    version: 'v2026.04.28-ux-test2',
    date: '2026-04-28',
    commit: '54d2594',
    summary: [
      '跨模組 UX 優化：提報進度空狀態判斷修正、學生名單批次全選改為僅作用於目前篩選結果。',
      '刪除/危險操作提示一致化，手機另開分頁被瀏覽器阻擋時會顯示提示。',
    ],
  },
  {
    version: 'v2026.04.27-language-grouping',
    date: '2026-04-27',
    commit: '8d8ac37',
    summary: [
      '新增「新住民語能力分組」頁（後調整為排除本土語與六年級，按現行選修語言分群）。',
      '支援能力分組、冊別欄位編輯與儲存。',
    ],
  },
  {
    version: 'v2026.04.27-progress-monitor',
    date: '2026-04-27',
    commit: '1250fda',
    summary: [
      '段考提報進度頁改為依年級分類，填報狀態字色區分。',
      '新增跳轉按鈕與未填報班級補齊顯示。',
    ],
  },
  {
    version: 'v2026.04.27-exam-submit-feedback',
    date: '2026-04-27',
    commit: 'e9d2b3e',
    summary: [
      '對外段考提報頁送出成功回饋強化：大型成功卡、送出按鈕狀態機、自動捲動。',
      '降低老師送出後「不知道是否成功」的疑慮。',
    ],
  },
];

const VersionUpdatesPage: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-2">
        <h2 className="text-xl font-bold text-slate-800">版本更新紀錄</h2>
        <p className="text-sm text-slate-600">
          用於記錄近期重大更新與可回復版本。若需要我幫你回復，直接說「回復到某版本號/commit/tag」即可。
        </p>
        <div className="text-xs text-slate-600 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          建議版本命名規則：<span className="font-mono">vYYYY.MM.DD-功能名</span>。穩定版請維持 tag：
          <span className="font-mono ml-1">stable-version</span>。
        </div>
      </div>

      <div className="space-y-3">
        {VERSION_ENTRIES.map((entry) => (
          <section key={entry.version} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-800">{entry.version}</h3>
                <p className="text-xs text-slate-500 mt-0.5">日期：{entry.date}</p>
              </div>
              <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
                <span className="px-2 py-1 rounded border border-slate-200 bg-slate-50 font-mono">commit: {entry.commit}</span>
                {entry.tag && <span className="px-2 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 font-mono">tag: {entry.tag}</span>}
              </div>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
              {entry.summary.map((line, idx) => (
                <li key={`${entry.version}_${idx}`}>{line}</li>
              ))}
            </ul>
            {entry.rollbackHint && (
              <div className="text-xs text-slate-700 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                回復參考指令：<span className="font-mono">{entry.rollbackHint}</span>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
};

export default VersionUpdatesPage;

