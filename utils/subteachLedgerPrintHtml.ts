import { LeaveRecord, LeaveType, PayType, Teacher } from '../types';
import type { FixedOvertimeConfig } from '../types';
import { deduplicateDetails } from './calculations';
import { shouldExcludeLeaveRecordFromSubteachLedger } from './fixedOvertimeLedger';
import {
  LEDGER_EXPORT_TYPE_ORDER,
  displayTypeStrFromSuffix,
  ledgerExportSuffixFromLeaveType,
} from './ledgerExportKey';
import {
  buildLedgerLine,
  gasSubstituteGroupKey,
  mergeLedgerLinesBySubstituteTeacher,
  fmtLedgerInt,
  toYMD,
  type LedgerLine,
  type MergedLedgerRow,
} from './subteachLedgerLines';

type FixedOvertimeConfigList = FixedOvertimeConfig[] | undefined;

function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function multilineCell(s: string): string {
  return escHtml(s).replace(/\n/g, '<br/>');
}

/** 與 GAS SheetManager.generateReports titlePrefix 一致 */
function titlePrefixRoc(rocYear: number, monthNum: string): string {
  return `加昌國小${rocYear}年${monthNum}月代課教師印領清冊~~【級科任教師】`;
}

function sumLines(lines: LedgerLine[]) {
  let sumDays = 0;
  let sumPeriods = 0;
  let sumHourly = 0;
  let sumHmDays = 0;
  let sumHmFee = 0;
  let sumPayable = 0;
  for (const L of lines) {
    sumDays += L.subDays;
    sumPeriods += L.subPeriods;
    sumHourly += L.substitutePayExclHomeroom;
    sumHmDays += L.homeroomDays;
    sumHmFee += L.homeroomFee;
    sumPayable += L.payableAmount;
  }
  return { sumDays, sumPeriods, sumHourly, sumHmDays, sumHmFee, sumPayable };
}

/**
 * 依 GAS syncRecords／getMonthSheetName 分桶（含家長會三種情況），再以與薪水幹事查詢相同之 buildLedgerLine + merge 產出列印列。
 */
export function collectLedgerLinesByExportKey(
  records: LeaveRecord[],
  teachers: Teacher[],
  fixedOvertimeConfig: FixedOvertimeConfigList,
  selectedMonth: string,
): Map<string, LedgerLine[]> {
  const buckets = new Map<string, LedgerLine[]>();
  for (const k of LEDGER_EXPORT_TYPE_ORDER) buckets.set(k, []);

  const case2bSeen = new Set<string>();

  for (const r of records) {
    const deduped = deduplicateDetails(r.details || []);
    for (const d of deduped) {
      const ymd = toYMD(d.date);
      if (!ymd || !ymd.startsWith(selectedMonth)) continue;
      if (d.isOvertime === true) continue;

      const isCase1 = r.leaveType === '公派(家長會)';
      const isCase2a = Boolean(r.ptaPaysHourly) && d.payType === PayType.HOURLY;
      const isCase2b =
        Boolean(r.homeroomFeeByPta) && r.leaveType !== LeaveType.PERSONAL && d.payType === PayType.HOURLY;

      if (isCase1 || isCase2a || isCase2b) {
        if (isCase2b && !isCase1 && !isCase2a) {
          const sk = `${gasSubstituteGroupKey(d)}|${ymd}`;
          if (case2bSeen.has(sk)) continue;
          case2bSeen.add(sk);
        }
        const line = buildLedgerLine(r, d, teachers, gasSubstituteGroupKey(d));
        buckets.get('家長會')!.push(line);
        continue;
      }

      if (shouldExcludeLeaveRecordFromSubteachLedger(r, teachers, fixedOvertimeConfig)) continue;

      const suffix = ledgerExportSuffixFromLeaveType(r.leaveType);
      const key = LEDGER_EXPORT_TYPE_ORDER.includes(suffix as (typeof LEDGER_EXPORT_TYPE_ORDER)[number])
        ? suffix
        : '公付其他';
      const line = buildLedgerLine(r, d, teachers, gasSubstituteGroupKey(d));
      buckets.get(key)!.push(line);
    }
  }

  return buckets;
}

export type BuildSubteachPrintHtmlArgs = {
  records: LeaveRecord[];
  teachers: Teacher[];
  fixedOvertimeConfig: FixedOvertimeConfigList;
  selectedMonth: string;
  ledgerKeys: Set<string>;
};

export function buildSubteachPrintHtmlDocument(args: BuildSubteachPrintHtmlArgs): string {
  const { records, teachers, fixedOvertimeConfig, selectedMonth, ledgerKeys } = args;
  const [yStr, mStr] = selectedMonth.split('-');
  const year = Number(yStr);
  const monthNum = mStr;
  const rocYear = year - 1911;
  const tp = titlePrefixRoc(rocYear, monthNum);

  const buckets = collectLedgerLinesByExportKey(records, teachers, fixedOvertimeConfig, selectedMonth);

  const ledgerSections: string[] = [];

  for (const typeRaw of LEDGER_EXPORT_TYPE_ORDER) {
    const lines = buckets.get(typeRaw) || [];
    const merged = mergeLedgerLinesBySubstituteTeacher(lines);
    const mergedFiltered =
      typeRaw === '家長會' ? merged.filter((row) => Math.ceil(row.payableTotal) > 0) : merged;

    const typeStr = typeRaw === '家長會' ? '公假家長會' : displayTypeStrFromSuffix(typeRaw);
    const fullTitle = tp + typeStr;
    const hideHm = typeRaw === '自理';

    if (ledgerKeys.has(typeRaw)) {
      if (mergedFiltered.length === 0) {
        ledgerSections.push(`<section class="ledger-block"><p class="muted">【${escHtml(typeStr)}】本月無資料</p></section>`);
      } else {
        const sums = sumLines(lines);
        ledgerSections.push(renderLedgerTable(fullTitle, typeStr, mergedFiltered, sums, hideHm));
      }
    }
  }

  const bodyParts: string[] = [
    '<h1 class="doc-title no-print">代課印領清冊預覽（瀏覽器列印）</h1>',
    ...ledgerSections,
  ];

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>印領清冊列印 ${escHtml(selectedMonth)}</title>
  <style>
    @page { size: A4 landscape; margin: 0.5cm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 12px; font-family: "Times New Roman", Times, "標楷體", "DFKai-SB", "BiauKai ST", serif; color: #000; background: #fff; }
    .toolbar { position: sticky; top: 0; z-index: 10; background: #f1f5f9; border: 1px solid #94a3b8; padding: 10px 12px; margin-bottom: 14px; border-radius: 6px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .toolbar button { padding: 8px 16px; font-size: 14px; cursor: pointer; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #fff; font-weight: 600; }
    .toolbar button:hover { background: #334155; }
    .toolbar span { font-size: 13px; color: #334155; }
    .doc-title { font-size: 16px; margin: 0 0 12px 0; color: #0f172a; }
    .ledger-block { page-break-after: always; margin-bottom: 24px; }
    .ledger-block:last-of-type { page-break-after: auto; }
    .ledger-h1 { text-align: center; font-size: 18px; font-weight: bold; margin: 8px 0 12px 0; line-height: 1.35; }
    .ledger-meta { text-align: center; font-size: 13px; margin-bottom: 10px; color: #334155; }
    table.ledger { width: 100%; border-collapse: collapse; font-size: 11pt; table-layout: fixed; }
    table.ledger th, table.ledger td { border: 1px solid #000; padding: 3px 4px; vertical-align: middle; text-align: center; word-break: break-word; }
    table.ledger th { background: #e2e8f0; font-weight: bold; }
    /* 連續日期區間不換行（如 04/14-04/17） */
    table.ledger th.col-date,
    table.ledger td.col-date { white-space: nowrap; word-break: normal; overflow-wrap: normal; }
    /* 代課天數／節數／鐘點費：縮欄、略小字，多筆數字易直向斷行 */
    table.ledger th.col-narrow-num,
    table.ledger td.col-narrow-num {
      width: 2.6%;
      max-width: 2.2em;
      min-width: 0;
      padding: 2px 1px;
      font-size: 9pt;
      line-height: 1.2;
      white-space: pre-wrap;
      word-break: break-all;
    }
    table.ledger th.col-leave-person,
    table.ledger td.col-leave-person {
      width: 4.8%;
      max-width: 4.5em;
      min-width: 0;
      padding: 2px 3px;
      font-size: 9.5pt;
      line-height: 1.25;
    }
    table.ledger .tl { text-align: left; }
    table.ledger .tr { text-align: right; font-variant-numeric: tabular-nums; }
    table.ledger .nw { white-space: pre-wrap; }
    /* 列印時盡量維持整列在同一頁（瀏覽器仍可能對極高列忽略） */
    table.ledger thead tr,
    table.ledger tbody tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    /* 合計列置於 tbody 末尾，列印跨頁時不會像 tfoot 在每頁重複，僅出現於資料末頁 */
    table.ledger tbody tr.ledger-total-row td { font-weight: bold; background: #f1f5f9; }
    table.ledger td.ledger-fill { min-height: 2.2em; }
    .ledger-footer-sign {
      margin-top: 16px;
      width: 100%;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    /* 核章六欄均分；最後一格固定為校長 */
    .sign-line {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      align-items: baseline;
      gap: 0.2rem 0.35rem;
      font-size: 10.5pt;
      font-weight: bold;
      line-height: 1.45;
      text-align: center;
    }
    .sign-line span { white-space: nowrap; min-width: 0; }
    .muted { color: #64748b; font-size: 13px; }
    .hm-hide .col-hm { visibility: hidden; }
    @media print {
      .no-print, .toolbar { display: none !important; }
      body { padding: 0; }
      .ledger-block { page-break-after: always; }
      .ledger-block:last-child { page-break-after: auto; }
      table.ledger thead tr,
      table.ledger tbody tr {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
      .ledger-footer-sign {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
      .sign-line {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <button type="button" onclick="window.print()">列印</button>
    <span>紙張請選 A4 橫向；邊界約 0.5cm（依瀏覽器「更多設定」微調）。格式對齊 GAS 印領清冊欄位與合計列。</span>
  </div>
  ${bodyParts.join('\n')}
</body>
</html>`;
}

function renderLedgerTable(
  fullTitle: string,
  typeStr: string,
  rows: MergedLedgerRow[],
  sums: ReturnType<typeof sumLines>,
  hideHomeroomCols: boolean,
): string {
  const hmClass = hideHomeroomCols ? ' hm-hide' : '';
  const head = `<thead><tr>
    <th class="col-date" style="width:6%">代課日期</th>
    <th style="width:6%">代課教師</th>
    <th style="width:4%">薪級</th>
    <th style="width:4%">日薪</th>
    <th class="col-narrow-num">代課<br/>天數</th>
    <th class="col-narrow-num">代課<br/>節數</th>
    <th class="col-narrow-num">代課<br/>鐘點費</th>
    <th class="col-leave-person">請假人</th>
    <th style="width:5%">假別</th>
    <th style="width:9%">請假事由</th>
    <th style="width:8%">備註</th>
    <th class="col-hm" style="width:4%">代導師日數</th>
    <th class="col-hm" style="width:4%">導師費</th>
    <th style="width:5%">應發金額</th>
    <th style="width:4%">勞保</th>
    <th style="width:4%">健保</th>
    <th style="width:4.5%">代扣補充保費</th>
    <th style="width:4.5%">實領金額</th>
    <th style="width:5.5%">代課教師簽名</th>
  </tr></thead>`;

  const body = rows
    .map(
      (row) => `<tr>
    <td class="nw col-date">${multilineCell(row.dateLines)}</td>
    <td class="nw">${escHtml(row.substituteName)}</td>
    <td class="nw">${multilineCell(row.salaryPointsLines)}</td>
    <td class="nw tr">${multilineCell(row.dailyRateLines)}</td>
    <td class="nw tr col-narrow-num">${multilineCell(row.subDaysLines)}</td>
    <td class="nw tr col-narrow-num">${multilineCell(row.subPeriodsLines)}</td>
    <td class="nw tr col-narrow-num">${multilineCell(row.substitutePayLines)}</td>
    <td class="nw tl col-leave-person">${multilineCell(row.leaveTeacherLines)}</td>
    <td class="nw">${multilineCell(row.leaveTypeLines)}</td>
    <td class="nw tl">${multilineCell(row.reasonLines)}</td>
    <td class="nw tl">${multilineCell(row.noteLines)}</td>
    <td class="col-hm nw tr">${multilineCell(row.homeroomDaysLines)}</td>
    <td class="col-hm nw tr">${multilineCell(row.homeroomFeeLines)}</td>
    <td class="tr">${escHtml(fmtLedgerInt(row.payableTotal))}</td>
    <td class="ledger-fill"></td>
    <td class="ledger-fill"></td>
    <td class="ledger-fill"></td>
    <td class="ledger-fill"></td>
    <td class="ledger-fill"></td>
  </tr>`,
    )
    .join('');

  const totalRow = `<tr class="ledger-total-row">
    <td colspan="4">合計</td>
    <td class="tr col-narrow-num">${escHtml(String(sums.sumDays))}</td>
    <td class="tr col-narrow-num">${escHtml(String(sums.sumPeriods))}</td>
    <td class="tr col-narrow-num">${escHtml(fmtLedgerInt(sums.sumHourly))}</td>
    <td colspan="4"></td>
    <td class="col-hm tr">${escHtml(String(sums.sumHmDays))}</td>
    <td class="col-hm tr">${escHtml(fmtLedgerInt(sums.sumHmFee))}</td>
    <td class="tr">${escHtml(fmtLedgerInt(sums.sumPayable))}</td>
    <td></td>
    <td></td>
    <td></td>
    <td class="tr">${escHtml(fmtLedgerInt(sums.sumPayable))}</td>
    <td></td>
  </tr>`;

  const ziLiNote = hideHomeroomCols
    ? '<p class="ledger-meta" style="margin-top:6px">課務自理「代導師日數／導師費」欄與 GAS 相同不列入本表；另「課務自理導師費」專表請以試算表匯出為準。</p>'
    : '';

  return `<section class="ledger-block${hmClass}">
  <h2 class="ledger-h1">${escHtml(fullTitle)}</h2>
  ${ziLiNote}
  <table class="ledger">${head}<tbody>${body}${totalRow}</tbody></table>
  <div class="ledger-footer-sign">
    <div class="sign-line">
      <span>製表人：</span>
      <span>勞保承辦：</span>
      <span>教務主任：</span>
      <span>人事主任：</span>
      <span>會計主任：</span>
      <span>校長：</span>
    </div>
  </div>
</section>`;
}

export function openSubteachPrintPreview(args: BuildSubteachPrintHtmlArgs): void {
  const html = buildSubteachPrintHtmlDocument(args);
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
