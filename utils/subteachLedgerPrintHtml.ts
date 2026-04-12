import { LeaveRecord, LeaveType, PayType, Teacher } from '../types';
import type { FixedOvertimeConfig } from '../types';

type FixedOvertimeConfigList = FixedOvertimeConfig[] | undefined;
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

export function sumPayableMerged(rows: MergedLedgerRow[]): number {
  return rows.reduce((s, row) => s + Math.ceil(Number(row.payableTotal) || 0), 0);
}

export type SubteachPrintMode = 'ledgers' | 'vouchers' | 'both';

export type BuildSubteachPrintHtmlArgs = {
  records: LeaveRecord[];
  teachers: Teacher[];
  fixedOvertimeConfig: FixedOvertimeConfigList;
  selectedMonth: string;
  ledgerKeys: Set<string>;
  voucherKeys: Set<string>;
  mode: SubteachPrintMode;
};

export function buildSubteachPrintHtmlDocument(args: BuildSubteachPrintHtmlArgs): string {
  const { records, teachers, fixedOvertimeConfig, selectedMonth, ledgerKeys, voucherKeys, mode } = args;
  const [yStr, mStr] = selectedMonth.split('-');
  const year = Number(yStr);
  const monthNum = mStr;
  const rocYear = year - 1911;
  const lastDay = new Date(year, Number(monthNum), 0).getDate();
  const tp = titlePrefixRoc(rocYear, monthNum);

  const buckets = collectLedgerLinesByExportKey(records, teachers, fixedOvertimeConfig, selectedMonth);

  const ledgerSections: string[] = [];
  const voucherSections: string[] = [];

  for (const typeRaw of LEDGER_EXPORT_TYPE_ORDER) {
    const lines = buckets.get(typeRaw) || [];
    const merged = mergeLedgerLinesBySubstituteTeacher(lines);
    const mergedFiltered =
      typeRaw === '家長會' ? merged.filter((row) => Math.ceil(row.payableTotal) > 0) : merged;

    const typeStr = typeRaw === '家長會' ? '公假家長會' : displayTypeStrFromSuffix(typeRaw);
    const fullTitle = tp + typeStr;
    const hideHm = typeRaw === '自理';

    if ((mode === 'ledgers' || mode === 'both') && ledgerKeys.has(typeRaw)) {
      if (mergedFiltered.length === 0) {
        ledgerSections.push(`<section class="ledger-block"><p class="muted">【${escHtml(typeStr)}】本月無資料</p></section>`);
      } else {
        const sums = sumLines(lines);
        ledgerSections.push(renderLedgerTable(fullTitle, typeStr, mergedFiltered, sums, hideHm));
      }
    }

    if ((mode === 'vouchers' || mode === 'both') && voucherKeys.has(typeRaw)) {
      const sumTotal = sumPayableMerged(mergedFiltered);
      const voucherTitle = typeRaw === '家長會' ? tp + '公假家長會' : tp + displayTypeStrFromSuffix(typeRaw);
      voucherSections.push(renderVoucherBlock(voucherTitle, sumTotal, rocYear, Number(monthNum), lastDay));
    }
  }

  const bodyParts: string[] = [];
  if (mode === 'ledgers' || mode === 'both') {
    bodyParts.push('<h1 class="doc-title no-print">代課印領清冊預覽（瀏覽器列印）</h1>');
    bodyParts.push(...ledgerSections);
  }
  if (mode === 'vouchers' || mode === 'both') {
    bodyParts.push('<h1 class="doc-title no-print voucher-title-gap">黏貼憑證預覽（瀏覽器列印）</h1>');
    bodyParts.push(...voucherSections);
  }

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>清冊／憑證列印 ${escHtml(selectedMonth)}</title>
  <style>
    @page { size: A4 landscape; margin: 0.5cm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 12px; font-family: "Times New Roman", Times, "標楷體", "DFKai-SB", "BiauKai ST", serif; color: #000; background: #fff; }
    .toolbar { position: sticky; top: 0; z-index: 10; background: #f1f5f9; border: 1px solid #94a3b8; padding: 10px 12px; margin-bottom: 14px; border-radius: 6px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .toolbar button { padding: 8px 16px; font-size: 14px; cursor: pointer; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #fff; font-weight: 600; }
    .toolbar button:hover { background: #334155; }
    .toolbar span { font-size: 13px; color: #334155; }
    .doc-title { font-size: 16px; margin: 0 0 12px 0; color: #0f172a; }
    .voucher-title-gap { margin-top: 28px; }
    .ledger-block { page-break-after: always; margin-bottom: 24px; }
    .ledger-block:last-of-type { page-break-after: auto; }
    .ledger-h1 { text-align: center; font-size: 18px; font-weight: bold; margin: 8px 0 12px 0; line-height: 1.35; }
    .ledger-meta { text-align: center; font-size: 13px; margin-bottom: 10px; color: #334155; }
    table.ledger { width: 100%; border-collapse: collapse; font-size: 11pt; table-layout: fixed; }
    table.ledger th, table.ledger td { border: 1px solid #000; padding: 3px 4px; vertical-align: middle; text-align: center; word-break: break-word; }
    table.ledger th { background: #e2e8f0; font-weight: bold; }
    table.ledger .tl { text-align: left; }
    table.ledger .tr { text-align: right; font-variant-numeric: tabular-nums; }
    table.ledger .nw { white-space: pre-wrap; }
    table.ledger tfoot td { font-weight: bold; background: #f1f5f9; }
    .ledger-footer-sign { margin-top: 14px; font-size: 10.5pt; font-weight: bold; line-height: 1.9; }
    .ledger-footer-sign .row { display: flex; flex-wrap: wrap; gap: 12px 48px; }
    .muted { color: #64748b; font-size: 13px; }
    .voucher-wrap { page-break-after: always; margin-bottom: 20px; border: 2px solid #000; padding: 16px 20px; max-width: 100%; }
    .voucher-wrap:last-child { page-break-after: auto; }
    .voucher-grid { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: start; }
    .voucher-title { font-size: 14pt; font-weight: bold; text-align: center; margin: 8px 0; line-height: 1.4; }
    .digits { display: flex; justify-content: flex-end; gap: 4px; margin: 10px 0; }
    .digits span { display: inline-block; min-width: 1.25em; border: 1px solid #000; text-align: center; font-size: 16pt; padding: 4px 6px; font-weight: bold; }
    .voucher-date { font-size: 12pt; margin-top: 8px; text-align: right; }
    .hm-hide .col-hm { visibility: hidden; }
    @media print {
      .no-print, .toolbar { display: none !important; }
      body { padding: 0; }
      .ledger-block, .voucher-wrap { page-break-after: always; }
      .ledger-block:last-child, .voucher-wrap:last-child { page-break-after: auto; }
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
    <th style="width:6%">代課日期</th>
    <th style="width:7%">代課教師</th>
    <th style="width:5%">薪級</th>
    <th style="width:5%">日薪</th>
    <th style="width:5%">代課天數</th>
    <th style="width:5%">代課節數</th>
    <th style="width:6%">代課鐘點費</th>
    <th style="width:7%">請假人</th>
    <th style="width:6%">假別</th>
    <th style="width:10%">請假事由</th>
    <th style="width:9%">備註</th>
    <th class="col-hm" style="width:5%">代導師日數</th>
    <th class="col-hm" style="width:5%">導師費</th>
    <th style="width:6%">應發金額</th>
  </tr></thead>`;

  const body = rows
    .map(
      (row) => `<tr>
    <td class="nw">${multilineCell(row.dateLines)}</td>
    <td class="nw">${escHtml(row.substituteName)}</td>
    <td class="nw">${multilineCell(row.salaryPointsLines)}</td>
    <td class="nw tr">${multilineCell(row.dailyRateLines)}</td>
    <td class="nw tr">${multilineCell(row.subDaysLines)}</td>
    <td class="nw tr">${multilineCell(row.subPeriodsLines)}</td>
    <td class="nw tr">${multilineCell(row.substitutePayLines)}</td>
    <td class="nw tl">${multilineCell(row.leaveTeacherLines)}</td>
    <td class="nw">${multilineCell(row.leaveTypeLines)}</td>
    <td class="nw tl">${multilineCell(row.reasonLines)}</td>
    <td class="nw tl">${multilineCell(row.noteLines)}</td>
    <td class="col-hm nw tr">${multilineCell(row.homeroomDaysLines)}</td>
    <td class="col-hm nw tr">${multilineCell(row.homeroomFeeLines)}</td>
    <td class="tr">${escHtml(fmtLedgerInt(row.payableTotal))}</td>
  </tr>`,
    )
    .join('');

  const foot = `<tfoot><tr>
    <td colspan="4">合計</td>
    <td class="tr">${escHtml(String(sums.sumDays))}</td>
    <td class="tr">${escHtml(String(sums.sumPeriods))}</td>
    <td class="tr">${escHtml(fmtLedgerInt(sums.sumHourly))}</td>
    <td colspan="4"></td>
    <td class="col-hm tr">${escHtml(String(sums.sumHmDays))}</td>
    <td class="col-hm tr">${escHtml(fmtLedgerInt(sums.sumHmFee))}</td>
    <td class="tr">${escHtml(fmtLedgerInt(sums.sumPayable))}</td>
  </tr></tfoot>`;

  const ziLiNote = hideHomeroomCols
    ? '<p class="ledger-meta" style="margin-top:6px">課務自理「代導師日數／導師費」欄與 GAS 相同不列入本表；另「課務自理導師費」專表請以試算表匯出為準。</p>'
    : '';

  return `<section class="ledger-block${hmClass}">
  <h2 class="ledger-h1">${escHtml(fullTitle)}</h2>
  <p class="ledger-meta">共 <strong>${rows.length}</strong> 列（同代課教師合併；與網站薪水幹事查詢／GAS 逐筆換行格式一致）</p>
  ${ziLiNote}
  <table class="ledger">${head}<tbody>${body}</tbody>${foot}</table>
  <div class="ledger-footer-sign">
    <div class="row"><span>製表人：</span><span>勞保承辦：</span><span>校長：</span></div>
    <div class="row"><span>教務主任：</span><span>人事主任：</span></div>
    <div class="row"><span>會計主任：</span></div>
  </div>
</section>`;
}

function renderVoucherBlock(
  title: string,
  sumTotal: number,
  rocYear: number,
  month: number,
  lastDayOfMonth: number,
): string {
  const amount = Math.ceil(Number(sumTotal) || 0);
  const moneyStr = String(amount);
  const cells: string[] = [];
  for (let i = 0; i < 6; i++) {
    const charIndex = moneyStr.length - 1 - i;
    const ch = charIndex >= 0 ? moneyStr.charAt(charIndex) : '—';
    cells.unshift(`<span>${escHtml(ch)}</span>`);
  }
  return `<section class="voucher-wrap">
  <div class="voucher-title">${escHtml(title)}</div>
  <div class="voucher-grid">
    <div>
      <p class="muted" style="margin:0 0 6px 0;">黏貼憑證（金額欄位對齊 GAS 六位數配置；實際格線以學校紙本為準）</p>
      <div class="digits">${cells.join('')}</div>
      <p style="font-size:13pt;font-weight:bold;margin:12px 0 0 0;">金額合計：<span style="border-bottom:1px solid #000;padding:0 8px">${escHtml(String(amount))}</span> 元</p>
    </div>
  </div>
  <div class="voucher-date">中　華　民　國　　${escHtml(String(rocYear))}　　年　　${escHtml(String(month))}　　月　　${escHtml(String(lastDayOfMonth))}　　日　止</div>
  <p class="voucher-title" style="margin-top:20px;font-size:12pt;">${escHtml(title)}</p>
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
