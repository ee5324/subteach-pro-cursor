import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Banknote } from 'lucide-react';
import type { SalaryGrade } from '../types';
import { HOURLY_RATE } from '../types';

/** 彰化縣 114 學年度公教待遇一覽表（PDF） */
export const CHC_SALARY_TABLE_114_PDF =
  'https://chcses.chc.edu.tw/storage/074687/posts/288/files/114%E5%B9%B4%E5%AD%B8%E6%A0%A1%E5%85%AC%E6%95%99%E5%BE%85%E9%81%87%E4%B8%80%E8%A6%BD%E8%A1%A8.pdf';

type AgentColSpec = {
  key: string;
  headerLines: [string, string];
  points: number;
  research: 'certMaster' | 'noCertMaster' | 'certBachelor' | 'noCertBachelor';
};

/** 對齊常見「代理教師起薪」六欄結構；俸點取自原參考表，實際金額由本系統薪級表帶入 */
const AGENT_COLUMN_SPECS: AgentColSpec[] = [
  { key: 'm_cert', headerLines: ['碩士', '有教證'], points: 245, research: 'certMaster' },
  { key: 'm_nc', headerLines: ['碩士', '無教證'], points: 245, research: 'noCertMaster' },
  { key: 'b_exam', headerLines: ['學士', '檢定教師證'], points: 190, research: 'certBachelor' },
  { key: 'b_reg', headerLines: ['學士', '登記教師證'], points: 180, research: 'certBachelor' },
  { key: 'b_prog_nc', headerLines: ['學士', '修畢師培無證'], points: 180, research: 'noCertBachelor' },
  { key: 'b_none_nc', headerLines: ['學士', '未修畢師培無證'], points: 170, research: 'noCertBachelor' },
];

function pickResearch(g: SalaryGrade, kind: AgentColSpec['research']): number {
  switch (kind) {
    case 'certMaster':
      return g.researchFeeCertMaster ?? 0;
    case 'noCertMaster':
      return g.researchFeeNoCertMaster ?? 0;
    case 'certBachelor':
      return g.researchFeeCertBachelor ?? 0;
    case 'noCertBachelor':
      return g.researchFeeNoCertBachelor ?? 0;
    default:
      return 0;
  }
}

function fmtMoney(n: number): string {
  return n.toLocaleString('zh-TW');
}

function fmtDaily(total: number, days: number): string {
  if (days <= 0) return '—';
  return String(Math.round(total / days));
}

interface SubstituteSalaryReferencePanelProps {
  salaryGrades: SalaryGrade[];
  /** 外層容器額外 class */
  className?: string;
}

/**
 * 代課清冊頁：收合式「代理／代課教師給付參考」。
 * 長期代理列依「系統設定」薪級表試算；鐘點費另列參考與本系統 HOURLY_RATE。
 */
const SubstituteSalaryReferencePanel: React.FC<SubstituteSalaryReferencePanelProps> = ({ salaryGrades, className = '' }) => {
  const [open, setOpen] = useState(false);

  const byPoints = useMemo(() => {
    const m = new Map<number, SalaryGrade>();
    (salaryGrades || []).forEach((g) => m.set(g.points, g));
    return m;
  }, [salaryGrades]);

  const cols = useMemo(() => {
    return AGENT_COLUMN_SPECS.map((spec) => {
      const g = byPoints.get(spec.points);
      if (!g) {
        return {
          ...spec,
          missing: true as const,
          base: 0,
          research: 0,
          total: 0,
        };
      }
      const base = g.salary;
      const research = pickResearch(g, spec.research);
      return {
        ...spec,
        missing: false as const,
        base,
        research,
        total: base + research,
      };
    });
  }, [byPoints]);

  return (
    <div className={`mb-2 md:mb-3 min-w-0 rounded-xl border border-indigo-100 bg-indigo-50/40 overflow-hidden ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2.5 flex items-center justify-between gap-2 text-left bg-white/80 hover:bg-white border-b border-indigo-100 min-h-[44px]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Banknote size={20} className="text-indigo-600 shrink-0" />
          <span className="font-bold text-slate-800 text-sm md:text-base truncate">
            代理／代課教師給付參考（依本系統薪級表試算）
          </span>
        </div>
        <span className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
          {open ? '收合' : '展開'}
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </span>
      </button>

      {open && (
        <div className="px-3 py-4 md:px-5 md:py-5 space-y-5 text-sm text-slate-700">
          <p className="text-xs text-slate-500 leading-relaxed">
            下列長期代理（月薪）表之欄位結構參考高雄市教育產業工會整理之「中小學教師請假所聘代理（課）教師費用明細表」（民國
            113 年 1 月 11 日版示意）；<strong>金額改以貴校於「系統設定」維護之薪級表</strong>對應俸點試算（與原表數字可能不同）。
            個案仍以主管機關、人事及契約為準。
          </p>

          <div className="overflow-x-auto min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[min(100%,44rem)] text-xs sm:text-sm border-collapse table-fixed">
              <colgroup>
                <col style={{ width: '16%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '14%' }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-100 text-slate-800">
                  <th className="border border-slate-200 px-2 py-2.5 text-left align-bottom min-w-0">項目</th>
                  {AGENT_COLUMN_SPECS.map((c) => (
                    <th
                      key={c.key}
                      className="border border-slate-200 px-1.5 py-2 text-center font-semibold leading-snug min-w-0 break-words [overflow-wrap:anywhere]"
                    >
                      <div>{c.headerLines[0]}</div>
                      <div className="text-[11px] font-normal text-slate-600">{c.headerLines[1]}</div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">俸點{c.points}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-200 px-2 py-2 font-medium bg-slate-50 align-top min-w-0 break-words">
                    薪級（俸點）
                  </td>
                  {cols.map((c) => (
                    <td
                      key={c.key}
                      className="border border-slate-200 px-1.5 py-2 text-center font-mono tabular-nums align-top min-w-0"
                    >
                      {c.missing ? '—' : c.points}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="border border-slate-200 px-2 py-2 font-medium bg-slate-50 align-top min-w-0 break-words">本薪</td>
                  {cols.map((c) => (
                    <td
                      key={c.key}
                      className="border border-slate-200 px-1.5 py-2 text-center tabular-nums align-top min-w-0"
                    >
                      {c.missing ? <span className="text-amber-600">無此俸點</span> : fmtMoney(c.base)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="border border-slate-200 px-2 py-2 font-medium bg-slate-50 align-top min-w-0 break-words">
                    學術研究加給
                  </td>
                  {cols.map((c) => (
                    <td
                      key={c.key}
                      className="border border-slate-200 px-1.5 py-2 text-center tabular-nums align-top min-w-0"
                    >
                      {c.missing ? '—' : fmtMoney(c.research)}
                    </td>
                  ))}
                </tr>
                <tr className="bg-indigo-50/50 font-bold">
                  <td className="border border-slate-200 px-2 py-2 align-top min-w-0 break-words">合計（月薪參考）</td>
                  {cols.map((c) => (
                    <td
                      key={c.key}
                      className="border border-slate-200 px-1.5 py-2 text-center text-indigo-900 tabular-nums align-top min-w-0"
                    >
                      {c.missing ? '—' : fmtMoney(c.total)}
                    </td>
                  ))}
                </tr>
                {[28, 29, 30, 31].map((d) => (
                  <tr key={d}>
                    <td className="border border-slate-200 px-2 py-2 text-slate-600 bg-slate-50 align-top min-w-0 break-words leading-snug">
                      日薪（{d} 日制，四捨五入）
                    </td>
                    {cols.map((c) => (
                      <td
                        key={`${c.key}-${d}`}
                        className="border border-slate-200 px-1.5 py-2 text-center font-mono tabular-nums align-top min-w-0"
                      >
                        {c.missing ? '—' : fmtDaily(c.total, d)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2 text-xs md:text-sm">
            <h4 className="font-bold text-slate-800">代課教師鐘點費（參考原表，各級每節）</h4>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li>高中：每節 50 分鐘，420 元</li>
              <li>國中：每節 45 分鐘，378 元</li>
              <li>國小：每節 40 分鐘，336 元</li>
            </ul>
            <p className="text-slate-600">
              本系統代課單預設鐘點單價（<code className="bg-slate-100 px-1 rounded">HOURLY_RATE</code>）：{' '}
              <strong>{HOURLY_RATE}</strong> 元／節（請於程式或設定與實際核銷規定一致處調整）。
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2 text-xs md:text-sm">
            <h4 className="font-bold text-slate-800">專（科）任教師代理導師職務得支領之代理導師鐘點費（摘要）</h4>
            <p className="text-slate-600 leading-relaxed">
              科任代理導師且無法減授時，得依規定支領「代理導師鐘點費」。試算概念：每節鐘點 × 實際代理日數 ÷ 5（每週上課日）×（科任基準節數
              − 導師基準節數）；未滿一日之日數不予併入計算（依原表註記精神，實務以人事解釋為準）。
            </p>
          </div>

          <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-4 text-xs text-amber-900 space-y-1.5">
            <p className="font-bold">註（參考原表）</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>代理導師鐘點費由學校給付擔任代理導師職務之教師。</li>
              <li>校外代理教師之勞、健保由學校（雇主）負擔。</li>
              <li>留停等給與依「公立國中小教師留職停薪期間支給待遇基準」辦理。</li>
              <li>薪級對應請依貴校人事／縣府最新函釋與本系統薪級表維護。</li>
              <li>
                本薪與學術研究加給之試算，與貴校於「系統設定」所維護之薪級級距表一致；是否等同當年度公佈之公教人員俸給現況表，請自行向人事確認。
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubstituteSalaryReferencePanel;
