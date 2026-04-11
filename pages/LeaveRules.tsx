import React, { useMemo } from 'react';
import InstructionPanel from '../components/InstructionPanel';
import leaveRows from '../data/leaveRulesMurakami.json';

type LeaveRow = (typeof leaveRows)[number];

type TailCellMerge = { show: boolean; rowSpan: number };
type TailMerges = {
  teacher: TailCellMerge;
  agent: TailCellMerge;
  notes: TailCellMerge;
  duty: TailCellMerge;
};

/** 連續列、同假別且欄位字串完全相同時合併（專任教師／代理聘僱／注意事項／課務），減少重複 */
function computeTailMerges(rows: LeaveRow[]): TailMerges[] {
  const n = rows.length;
  const init = (): TailMerges => ({
    teacher: { show: true, rowSpan: 1 },
    agent: { show: true, rowSpan: 1 },
    notes: { show: true, rowSpan: 1 },
    duty: { show: true, rowSpan: 1 },
  });
  const out: TailMerges[] = rows.map(() => init());

  const keys = ['teacher', 'agent', 'notes', 'duty'] as const;

  for (const key of keys) {
    let i = 0;
    while (i < n) {
      if (rows[i].category === '備註') {
        i += 1;
        continue;
      }
      const base = rows[i];
      let j = i;
      while (j + 1 < n) {
        const next = rows[j + 1];
        if (next.category === '備註') break;
        if (next.category !== base.category) break;
        if (next[key] !== base[key]) break;
        j += 1;
      }
      const span = j - i + 1;
      out[i][key] = { show: true, rowSpan: span };
      for (let k = i + 1; k <= j; k++) {
        out[k][key] = { show: false, rowSpan: 1 };
      }
      i = j + 1;
    }
  }
  return out;
}

function computeCategorySpans(rows: LeaveRow[]): { rowSpan: number; show: boolean }[] {
  const spans: { rowSpan: number; show: boolean }[] = rows.map(() => ({ rowSpan: 1, show: true }));
  let i = 0;
  while (i < rows.length) {
    const cat = rows[i].category;
    if (cat === '備註') {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < rows.length && rows[j].category === cat) j += 1;
    const len = j - i;
    spans[i] = { rowSpan: len, show: true };
    for (let k = i + 1; k < j; k++) spans[k] = { rowSpan: 1, show: false };
    i = j;
  }
  return spans;
}

const LeaveRules: React.FC = () => {
  const rows = leaveRows as LeaveRow[];
  const spans = useMemo(() => computeCategorySpans(rows), []);
  const tailMerges = useMemo(() => computeTailMerges(rows), []);

  return (
    <div className="p-6 md:p-8 max-w-[100rem] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800">教職員差假（排代）給付簡明表</h1>
        <p className="text-slate-500 mt-2 text-sm md:text-base leading-relaxed">
          內容含<strong>給假日數</strong>與<strong>注意事項</strong>全文，係轉載自彰化縣大村鄉村上國民小學網頁彙整表（原編碼
          Big5）；僅供校內行政參考，個案仍以法規、人事函釋及主管機關最新規定為準。
        </p>
      </div>

      <InstructionPanel title="使用說明" isOpenDefault={false}>
        <p>
          「注意事項」欄佔表格主要寬度；「細項」與「給假日數」三欄亦會依比例留寬並可換行（含括號補註），避免文字溢出格線。連續列若「專任教師／代理聘僱／注意事項／課務」內文完全相同，會自動合併儲存格。極窄視窗時可橫向捲動整表。假別欄已依原表合併同類多列（例：流產假、喪假、休假）。
        </p>
        <p>表末備註列載明原表所依據之法規與縣府文件；與本系統代課計算邏輯無自動連動。</p>
      </InstructionPanel>

      <div className="rounded-xl border border-indigo-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto min-w-0">
          <table className="w-full min-w-[min(100%,56rem)] text-sm border-collapse table-fixed">
            <colgroup>
              <col style={{ width: '7.5%' }} />
              {/* 細項常有長句親屬稱謂，需較寬以免與給假日數欄互擠 */}
              <col style={{ width: '18%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '42.5%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <thead>
              <tr className="bg-indigo-50 text-indigo-950">
                <th className="border border-indigo-200 px-2 py-2 text-center align-middle" rowSpan={2}>
                  假別
                </th>
                <th className="border border-indigo-200 px-2 py-2 text-center align-middle" rowSpan={2}>
                  細項
                </th>
                <th className="border border-indigo-200 px-2 py-2 text-center" colSpan={3}>
                  給假日數
                </th>
                <th className="border border-indigo-200 px-2 py-2 text-center align-middle" rowSpan={2}>
                  注意事項
                </th>
                <th className="border border-indigo-200 px-2 py-2 text-center align-middle" rowSpan={2}>
                  課務
                </th>
              </tr>
              <tr className="bg-indigo-50/80 text-indigo-900 text-xs md:text-sm">
                <th className="border border-indigo-200 px-1 py-2">公務人員</th>
                <th className="border border-indigo-200 px-1 py-2">專任教師</th>
                <th className="border border-indigo-200 px-1 py-2">代理聘僱</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                if (row.category === '備註') {
                  return (
                    <tr key={`row-${idx}`} className="bg-slate-50">
                      <td className="border border-slate-200 px-3 py-3 text-slate-700 text-xs md:text-sm leading-relaxed" colSpan={7}>
                        {row.notes}
                      </td>
                    </tr>
                  );
                }
                const s = spans[idx];
                const m = tailMerges[idx];
                const cellClass =
                  'border border-slate-200 px-1.5 py-2 text-center align-top text-xs md:text-sm min-w-0 break-words [overflow-wrap:anywhere] leading-snug';

                return (
                  <tr key={`row-${idx}`} className="hover:bg-slate-50/80">
                    {s.show && (
                      <td
                        className="border border-slate-200 px-2 py-2 text-center font-semibold text-slate-800 bg-rose-50/40 align-top"
                        rowSpan={s.rowSpan}
                      >
                        {row.category}
                      </td>
                    )}
                    <td className="border border-slate-200 px-2 py-2 text-slate-700 align-top text-xs md:text-sm min-w-0 break-words [overflow-wrap:anywhere] leading-snug">
                      {row.detail || '—'}
                    </td>
                    <td className={cellClass}>{row.civil || '—'}</td>
                    {m.teacher.show && (
                      <td className={cellClass} rowSpan={m.teacher.rowSpan}>
                        {row.teacher || '—'}
                      </td>
                    )}
                    {m.agent.show && (
                      <td className={cellClass} rowSpan={m.agent.rowSpan}>
                        {row.agent || '—'}
                      </td>
                    )}
                    {m.notes.show && (
                      <td
                        className="border border-slate-200 px-3 py-2.5 text-slate-700 leading-relaxed align-top text-xs sm:text-sm min-w-0 break-words [overflow-wrap:anywhere] whitespace-pre-wrap"
                        rowSpan={m.notes.rowSpan}
                      >
                        {row.notes}
                      </td>
                    )}
                    {m.duty.show && (
                      <td
                        className="border border-slate-200 px-2 py-2 text-xs text-slate-700 align-top min-w-0 break-words [overflow-wrap:anywhere] leading-snug"
                        rowSpan={m.duty.rowSpan}
                      >
                        {row.duty || '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-400 text-right">
        ＊原表頁尾：感謝陳秀梅主任提供整理資料（107 年 11 月 19 日版）
      </p>
    </div>
  );
};

export default LeaveRules;
