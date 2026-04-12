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

/**
 * 薪級欄：固定兩行（數字／(有證)(無證)）；括號內不斷行；多組薪級仍以 <br/> 分隔。
 */
function salaryGradeCellHtml(s: string): string {
  const lines = String(s).split('\n');
  const chunks: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const cur = lines[i] ?? '';
    const nextRaw = lines[i + 1];
    const nextTrim = nextRaw != null ? nextRaw.trim() : '';
    if (nextTrim && /^\([^)]+\)$/.test(nextTrim)) {
      chunks.push(
        `<div class="sg-block"><span class="sg-num">${escHtml(cur.trim())}</span><span class="sg-cert">${escHtml(nextTrim)}</span></div>`,
      );
      i += 2;
    } else {
      chunks.push(escHtml(cur));
      i += 1;
    }
  }
  return chunks.join('<span class="sg-gap" aria-hidden="true"></span>');
}

/** 假別欄：12 號字，並於半形／全形括號前斷行 */
function leaveTypeCellHtml(s: string): string {
  const lines = String(s).split('\n');
  const blocks = lines.map((line) => {
    const e = escHtml(line);
    const iOpen = e.indexOf('(');
    const iFull = e.indexOf('（');
    let idx = -1;
    if (iOpen >= 0 && iFull >= 0) idx = Math.min(iOpen, iFull);
    else if (iOpen >= 0) idx = iOpen;
    else if (iFull >= 0) idx = iFull;
    if (idx <= 0) return e;
    return `${e.slice(0, idx)}<br/>${e.slice(idx)}`;
  });
  return `<span class="col-leave-type">${blocks.join('<br/>')}</span>`;
}

/**
 * 數字／金額等多筆：`\n` 與同列空白皆拆成 token，直向置中堆疊（日薪、天數、節數、代課費用、代導師日數、導師費等共用）。
 * 姓名、事由、日期等仍用 multilineCell，避免中文被空白誤拆。
 */
function ledgerStackedCellHtml(s: string): string {
  const raw = String(s).trim();
  if (!raw) return '<div class="ledger-stack"><span class="ledger-stack-item">—</span></div>';
  const tokens = raw
    .split(/\n/)
    .flatMap((line) => line.trim().split(/\s+/).filter((x) => x.length > 0));
  if (tokens.length === 0) return '<div class="ledger-stack"><span class="ledger-stack-item">—</span></div>';
  const spans = tokens.map((t) => `<span class="ledger-stack-item">${escHtml(t)}</span>`).join('');
  return `<div class="ledger-stack">${spans}</div>`;
}

/** 備註：每一筆摘要（如 0日2節(午,5)）維持同一行，不從括號處被拆成兩行 */
function noteCellHtml(s: string): string {
  const lines = String(s).split('\n').filter((ln) => ln.length > 0);
  if (lines.length === 0) return escHtml('—');
  return lines.map((ln) => `<span class="note-line-block">${escHtml(ln)}</span>`).join('<br/>');
}

/** A4 橫向印領清冊：19 欄寬度加總 100%，避免 table-layout:fixed 時未設寬欄被壓成極窄而數字直排 */
function ledgerTableColgroup(): string {
  /*
   * 預設比例：對齊紙本印領清冊常用編排——請假事由加寬以利長文換行；代課天數／節數／費用適中；
   * 薪級、日薪、代導師日數／導師費略窄；尾段勞健保、補充保費、實領、簽名保留可讀寬度。
   */
  const widths = [
    '5.2%',
    '5.5%',
    '4.2%',
    '3.8%',
    '5.0%',
    '5.0%',
    '8.0%',
    '4.8%',
    '4.5%',
    '12.0%',
    '5.2%',
    '3.5%',
    '3.8%',
    '5.0%',
    '4.0%',
    '4.0%',
    '4.3%',
    '4.3%',
    '7.9%',
  ];
  return `<colgroup>${widths.map((w) => `<col style="width:${w}" />`).join('')}</colgroup>`;
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
  const daysInMonth = new Date(year, Number(monthNum), 0).getDate();

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
        ledgerSections.push(renderLedgerTable(fullTitle, typeStr, mergedFiltered, sums, hideHm, daysInMonth));
      }
    }
  }

  const bodyInner = [
    '<h1 class="doc-title no-print">代課印領清冊預覽（瀏覽器列印）</h1>',
    ...ledgerSections,
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>印領清冊列印 ${escHtml(selectedMonth)}</title>
  <style>
    @page { size: A4 landscape; margin: 0.5cm; }
    * { box-sizing: border-box; }
    :root {
      --ledger-table-font: 14pt;
      --ledger-table-width: 100%;
      --ledger-scale: 1;
    }
    body { margin: 0; padding: 12px; font-family: "Times New Roman", Times, "標楷體", "DFKai-SB", "BiauKai ST", serif; color: #000; background: #fff; }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      background: #f1f5f9;
      border: 1px solid #94a3b8;
      padding: 10px 12px;
      margin-bottom: 14px;
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: stretch;
    }
    .toolbar-row { display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center; width: 100%; }
    .toolbar label { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #334155; white-space: nowrap; }
    .toolbar input[type="range"] { width: 120px; vertical-align: middle; }
    .toolbar .hint { font-size: 12px; color: #64748b; flex: 1 1 200px; min-width: 180px; }
    .toolbar button { padding: 8px 16px; font-size: 14px; cursor: pointer; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #fff; font-weight: 600; }
    .toolbar button:hover { background: #334155; }
    .toolbar button.secondary { background: #fff; color: #1e293b; border-color: #94a3b8; }
    .toolbar button.secondary:hover { background: #f8fafc; }
    .toolbar span { font-size: 13px; color: #334155; }
    .ledger-shell { overflow-x: auto; padding-bottom: 8px; }
    .ledger-scale-inner {
      transform: scale(var(--ledger-scale));
      transform-origin: top center;
      width: calc(100% / var(--ledger-scale));
      margin: 0 auto;
    }
    .doc-title { font-size: 16px; margin: 0 0 12px 0; color: #0f172a; }
    .ledger-block { page-break-after: always; margin-bottom: 24px; }
    .ledger-block:last-of-type { page-break-after: auto; }
    .ledger-h1 { text-align: center; font-size: 18px; font-weight: bold; margin: 8px 0 12px 0; line-height: 1.35; }
    .ledger-meta { text-align: center; font-size: 13px; margin-bottom: 10px; color: #334155; }
    table.ledger {
      width: var(--ledger-table-width);
      margin-left: auto;
      margin-right: auto;
      border-collapse: collapse;
      font-size: var(--ledger-table-font, 14pt);
      table-layout: fixed;
      max-width: none;
    }
    /* 各欄左右各加約 2pt；數字欄勿用 break-all 以免逐字直排 */
    table.ledger th, table.ledger td {
      border: 1px solid #000;
      padding: 2px 3px;
      vertical-align: middle;
      text-align: center;
      word-break: normal;
      overflow-wrap: break-word;
    }
    table.ledger th { background: #e2e8f0; font-weight: bold; line-height: 1.2; position: relative; }
    table.ledger th.th-1l { white-space: nowrap; }
    .ledger-resize-handle {
      position: absolute;
      top: 0;
      right: -4px;
      width: 8px;
      height: 100%;
      cursor: col-resize;
      z-index: 3;
      user-select: none;
      -webkit-user-select: none;
    }
    .ledger-resize-handle:hover { background: rgba(99, 102, 241, 0.25); }
    .ledger-row-resize-handle {
      position: absolute;
      left: 0;
      right: 0;
      bottom: -4px;
      height: 8px;
      cursor: row-resize;
      z-index: 2;
      user-select: none;
      -webkit-user-select: none;
    }
    .ledger-row-resize-handle:hover { background: rgba(16, 185, 129, 0.28); }
    table.ledger th .th-brk { display: block; }
    table.ledger th .th-nobr { white-space: nowrap; }
    /* 連續日期區間不換行（如 04/14-04/17） */
    table.ledger th.col-date,
    table.ledger td.col-date { white-space: nowrap; word-break: normal; overflow-wrap: normal; }
    table.ledger th.col-salary-grade,
    table.ledger td.col-salary-grade {
      word-break: normal;
      overflow-wrap: normal;
      line-height: 1.05;
    }
    table.ledger td.col-salary-grade .sg-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0;
      margin: 0;
      padding: 0;
      line-height: 1.05;
    }
    table.ledger td.col-salary-grade .sg-num,
    table.ledger td.col-salary-grade .sg-cert {
      display: block;
      margin: 0;
      padding: 0;
      line-height: 1.05;
      white-space: nowrap;
    }
    table.ledger td.col-salary-grade .sg-gap {
      display: block;
      height: 0.2em;
      line-height: 0;
      overflow: hidden;
    }
    /* 代課天數、節數、代課費用：欄寬由 colgroup 保證；多筆數字僅在 <br/> 處換行，不斷開單一金額 */
    table.ledger th.col-ledger-qty,
    table.ledger td.col-ledger-qty,
    table.ledger th.col-substitute-fee,
    table.ledger td.col-substitute-fee {
      white-space: normal;
      word-break: normal;
      overflow-wrap: normal;
      line-height: 1.35;
      font-variant-numeric: tabular-nums;
    }
    table.ledger th.col-leave-person,
    table.ledger td.col-leave-person {
      padding: 2px 3px;
      line-height: 1.25;
      text-align: center;
    }
    table.ledger td.col-note .note-line-block {
      display: block;
      white-space: nowrap;
    }
    table.ledger td .col-leave-type { font-size: 0.86em; line-height: 1.25; }
    table.ledger .ledger-stack {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0;
      line-height: 1.12;
      font-variant-numeric: tabular-nums;
    }
    table.ledger .ledger-stack .ledger-stack-item {
      display: block;
      white-space: nowrap;
      line-height: 1.12;
    }
    table.ledger th.col-hm-fee {
      white-space: nowrap;
    }
    table.ledger td.col-hm-fee {
      white-space: normal;
    }
    table.ledger .tl { text-align: left; word-break: break-word; }
    /* 數字欄位置中（與 GAS 清冊常用 14 號字一致） */
    table.ledger .tr {
      text-align: center;
      font-variant-numeric: tabular-nums;
      word-break: normal;
      overflow-wrap: normal;
    }
    table.ledger td.col-payable { white-space: nowrap; }
    table.ledger .nw { white-space: pre-wrap; }
    /* 列印時盡量維持整列在同一頁；position 供列高拖曳把手定位 */
    table.ledger thead tr,
    table.ledger tbody tr {
      position: relative;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    /* 合計列置於 tbody 末尾，列印跨頁時不會像 tfoot 在每頁重複，僅出現於資料末頁 */
    /* 手動補登空白列：單格至少約 14 號一行＋上下餘裕，方便點選與手寫對位 */
    table.ledger tbody tr.ledger-manual-row td {
      min-height: 22pt;
      padding-top: 3pt;
      padding-bottom: 3pt;
      vertical-align: middle;
      box-sizing: border-box;
    }
    table.ledger tbody tr.ledger-total-row td { font-weight: bold; background: #f1f5f9; }
    table.ledger tbody tr.ledger-total-row td.ledger-total-tail {
      min-height: 0;
      padding: 2px 4px;
      vertical-align: middle;
    }
    table.ledger td.ledger-fill { min-height: 2.2em; }
    #ledgerFormatRow.is-disabled { opacity: 0.45; pointer-events: none; filter: grayscale(0.25); }
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
    .snap-status { font-size: 12px; color: #166534; min-height: 1.2em; flex: 1 1 100%; }
    .snap-status.snap-err { color: #b91c1c; }
    /* 螢幕上不顯示截圖層（僅列印時在 .print-use-snapshot 下顯示） */
    #ledgerPrintSnap {
      display: none;
    }
    .ledger-snap-page {
      display: block;
      width: 100%;
      max-width: 100%;
      height: auto;
      page-break-after: always;
      break-after: page;
    }
    .ledger-snap-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .hm-hide .col-hm { visibility: hidden; }
    table.ledger td[contenteditable="true"],
    table.ledger th[contenteditable="true"],
    .ledger-footer-sign .sign-line span[contenteditable="true"] {
      box-shadow: inset 0 0 0 1px #94a3b8;
      background: #fffef7;
    }
    @media print {
      .no-print, .toolbar { display: none !important; }
      body {
        padding: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      /* 以截圖列印：只印圖片，與螢幕所見一致 */
      body.print-use-snapshot .ledger-shell {
        display: none !important;
      }
      body.print-use-snapshot #ledgerPrintSnap {
        display: block !important;
      }
      /* 列印引擎對 transform:scale 常與畫面不一致，改以 100% 寬列印；請用「表格字級／寬度」微調列印大小 */
      .ledger-scale-inner {
        transform: none !important;
        width: 100% !important;
        margin: 0 auto !important;
      }
      .ledger-shell {
        overflow: visible !important;
        max-width: none !important;
      }
      .ledger-block { page-break-after: always; }
      .ledger-block:last-child { page-break-after: auto; }
      /* 勿對每一資料列強制 avoid，否則瀏覽器會整表縮放塞頁導致「跑版」 */
      table.ledger thead tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      table.ledger tbody tr {
        break-inside: auto;
        page-break-inside: auto;
      }
      table.ledger tbody tr.ledger-total-row {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .ledger-footer-sign {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .sign-line {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      table.ledger td[contenteditable="true"],
      table.ledger th[contenteditable="true"],
      .ledger-footer-sign .sign-line span[contenteditable="true"] {
        box-shadow: none;
        background: transparent;
      }
      .ledger-resize-handle,
      .ledger-row-resize-handle { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <div class="toolbar-row">
      <button type="button" onclick="window.print()">列印</button>
      <button type="button" id="btnPrintFromScreenshot" title="將目前畫面（含整表縮放與欄寬列高）轉成圖片後列印，與預覽最一致">以畫面列印（截圖）</button>
      <button type="button" class="secondary" id="btnClearPrintSnap" title="清除截圖列印，改回一般表格列印">改回一般列印</button>
      <button type="button" class="secondary" id="btnResetLayout">重設版面</button>
      <label><input type="checkbox" id="chkEditable" /> 可編輯內容（表內儲存格與核章列文字）</label>
    </div>
    <div class="toolbar-row no-print">
      <span id="snapStatus" class="snap-status" role="status"></span>
    </div>
    <div class="toolbar-row">
      <label>表格字級 <input type="range" id="rngFont" min="10" max="18" step="0.5" value="14" /><span id="lblFont">14pt</span></label>
      <label>表格寬度 <input type="range" id="rngWidth" min="78" max="118" value="100" /><span id="lblWidth">100%</span></label>
      <label>整表縮放 <input type="range" id="rngScale" min="75" max="125" value="100" /><span id="lblScale">100%</span></label>
      <span class="hint">若一般列印仍跑版，請按<strong>「以畫面列印（截圖）」</strong>（需短暫連線載入函式庫），再按列印——即與目前預覽相同。紙張選 A4 橫向；列印對話框縮放建議 100%。一般列印時整表縮放不套用，請改表格字級／寬度。合計上有四列空白；表頭右緣調欄寬、列底橫線調列高。</span>
    </div>
    <div class="toolbar-row is-disabled" id="ledgerFormatRow">
      <span style="font-size:12px;color:#475569;font-weight:600">選取表內文字後套用（須勾選可編輯）：</span>
      <button type="button" class="secondary" id="btnFmtBold">粗體</button>
      <label>局部字級 <select id="selFmtSize">
        <option value="">—</option>
        <option value="10">10pt</option>
        <option value="11">11pt</option>
        <option value="12">12pt</option>
        <option value="13">13pt</option>
        <option value="14">14pt</option>
        <option value="15">15pt</option>
        <option value="16">16pt</option>
        <option value="17">17pt</option>
        <option value="18">18pt</option>
      </select></label>
      <label>顏色 <input type="color" id="inpFmtColor" value="#000000" title="套用至選取文字" /></label>
    </div>
  </div>
  <div class="ledger-shell" id="ledgerShell">
    <div class="ledger-scale-inner" id="ledgerScaleInner">
      ${bodyInner}
    </div>
  </div>
  <div id="ledgerPrintSnap" aria-hidden="true"></div>
  <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js" crossorigin="anonymous"></script>
  <script>
(function () {
  var root = document.documentElement;
  var shell = document.getElementById('ledgerShell');
  var scaleInner = document.getElementById('ledgerScaleInner');
  var chk = document.getElementById('chkEditable');
  var rngFont = document.getElementById('rngFont');
  var rngWidth = document.getElementById('rngWidth');
  var rngScale = document.getElementById('rngScale');
  var lblFont = document.getElementById('lblFont');
  var lblWidth = document.getElementById('lblWidth');
  var lblScale = document.getElementById('lblScale');
  var btnReset = document.getElementById('btnResetLayout');
  var btnPrintFromScreenshot = document.getElementById('btnPrintFromScreenshot');
  var btnClearPrintSnap = document.getElementById('btnClearPrintSnap');
  var ledgerPrintSnap = document.getElementById('ledgerPrintSnap');
  var snapStatus = document.getElementById('snapStatus');
  function setSnapStatus(msg, isErr) {
    if (!snapStatus) return;
    snapStatus.textContent = msg || '';
    snapStatus.classList.toggle('snap-err', !!isErr);
  }
  function clearPrintSnapshot() {
    document.body.classList.remove('print-use-snapshot');
    if (ledgerPrintSnap) ledgerPrintSnap.innerHTML = '';
    setSnapStatus('');
  }
  if (btnClearPrintSnap) {
    btnClearPrintSnap.addEventListener('click', function () {
      clearPrintSnapshot();
      setSnapStatus('已改回一般表格列印。');
    });
  }
  if (btnPrintFromScreenshot) {
    btnPrintFromScreenshot.addEventListener('click', function () {
      if (typeof html2canvas !== 'function') {
        setSnapStatus('無法載入截圖程式庫，請確認網路後重新開啟本頁。', true);
        return;
      }
      if (!scaleInner || !ledgerPrintSnap) return;
      var blocks = Array.from(scaleInner.querySelectorAll('.ledger-block'));
      if (blocks.length === 0) {
        setSnapStatus('沒有可截圖的清冊區塊。', true);
        return;
      }
      clearPrintSnapshot();
      btnPrintFromScreenshot.disabled = true;
      if (btnClearPrintSnap) btnClearPrintSnap.disabled = true;
      setSnapStatus('正在產生截圖…（資料多時請稍候）');
      var baseOpts = {
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        ignoreElements: function (node) {
          if (!node || !node.classList) return false;
          return (
            node.classList.contains('ledger-resize-handle') ||
            node.classList.contains('ledger-row-resize-handle')
          );
        },
      };
      function captureOne(block, scaleVal) {
        return html2canvas(block, Object.assign({}, baseOpts, { scale: scaleVal }));
      }
      var p = Promise.resolve();
      blocks.forEach(function (block, idx) {
        p = p
          .then(function () {
            setSnapStatus('正在截圖 ' + (idx + 1) + ' / ' + blocks.length + '…');
            return captureOne(block, 2).catch(function () {
              return captureOne(block, 1);
            });
          })
          .then(function (canvas) {
            var img = document.createElement('img');
            img.className = 'ledger-snap-page';
            img.alt = '印領清冊';
            img.src = canvas.toDataURL('image/png');
            ledgerPrintSnap.appendChild(img);
          });
      });
      var done = function () {
        btnPrintFromScreenshot.disabled = false;
        if (btnClearPrintSnap) btnClearPrintSnap.disabled = false;
      };
      p.then(function () {
          document.body.classList.add('print-use-snapshot');
          setSnapStatus(
            '截圖完成。請按「列印」；版面請以畫面上為準。若要改回一般表格列印請按「改回一般列印」。',
          );
        })
        .catch(function () {
          setSnapStatus('截圖失敗（內容過大或瀏覽器限制），請略縮小整表縮放或字級後再試。', true);
          clearPrintSnapshot();
        })
        .then(done, done);
    });
  }
  function applyFont() {
    var v = rngFont.value;
    root.style.setProperty('--ledger-table-font', v + 'pt');
    lblFont.textContent = v + 'pt';
  }
  function applyWidth() {
    var v = rngWidth.value;
    root.style.setProperty('--ledger-table-width', v + '%');
    lblWidth.textContent = v + '%';
  }
  function applyScale() {
    var p = Number(rngScale.value) / 100;
    if (p < 0.5) p = 0.5;
    if (p > 1.5) p = 1.5;
    root.style.setProperty('--ledger-scale', String(p));
    lblScale.textContent = rngScale.value + '%';
  }
  var fmtRow = document.getElementById('ledgerFormatRow');
  var btnFmtBold = document.getElementById('btnFmtBold');
  var selFmtSize = document.getElementById('selFmtSize');
  var inpFmtColor = document.getElementById('inpFmtColor');
  function setEditable(on) {
    if (!shell) return;
    shell.querySelectorAll('table.ledger td, table.ledger th').forEach(function (el) {
      el.contentEditable = on ? 'true' : 'false';
    });
    shell.querySelectorAll('.ledger-footer-sign .sign-line span').forEach(function (el) {
      el.contentEditable = on ? 'true' : 'false';
    });
    if (fmtRow) fmtRow.classList.toggle('is-disabled', !on);
  }
  function selInShell() {
    if (!shell) return false;
    var sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return false;
    var r = sel.getRangeAt(0);
    var n = r.commonAncestorContainer;
    if (n.nodeType === 3) n = n.parentElement;
    return !!(n && shell.contains(n));
  }
  function wrapSelectionFontSize(pt) {
    if (!chk.checked || !selInShell()) return;
    var sel = window.getSelection();
    var range = sel.getRangeAt(0);
    var span = document.createElement('span');
    span.style.fontSize = pt + 'pt';
    try {
      span.appendChild(range.extractContents());
      range.insertNode(span);
    } catch (e) {
      return;
    }
    sel.removeAllRanges();
  }
  if (btnFmtBold) {
    btnFmtBold.addEventListener('click', function () {
      if (!chk.checked || !selInShell()) return;
      try {
        document.execCommand('bold', false, null);
      } catch (e) {}
    });
  }
  if (selFmtSize) {
    selFmtSize.addEventListener('change', function () {
      var v = selFmtSize.value;
      if (!v) return;
      wrapSelectionFontSize(v);
      selFmtSize.value = '';
    });
  }
  if (inpFmtColor) {
    inpFmtColor.addEventListener('input', function () {
      if (!chk.checked || !selInShell()) return;
      try {
        document.execCommand('styleWithCSS', false, true);
      } catch (e) {}
      try {
        document.execCommand('foreColor', false, inpFmtColor.value);
      } catch (e2) {}
    });
  }
  rngFont.addEventListener('input', applyFont);
  rngWidth.addEventListener('input', applyWidth);
  rngScale.addEventListener('input', applyScale);
  chk.addEventListener('change', function () {
    setEditable(chk.checked);
  });
  function parseColPercentages(table) {
    var cols = table.querySelectorAll('colgroup col');
    return Array.from(cols).map(function (c) {
      var st = c.getAttribute('style') || '';
      var k = st.indexOf('width:');
      if (k < 0) return 0;
      var rest = st.slice(k + 6).trim();
      var end = rest.indexOf('%');
      if (end < 0) return 0;
      var n = parseFloat(rest.slice(0, end));
      return isNaN(n) ? 0 : n;
    });
  }
  function ensureColBackup(table) {
    if (table.dataset.ledgerColBackup) return;
    var p = parseColPercentages(table);
    if (p.some(function (x) { return x > 0; })) table.dataset.ledgerColBackup = JSON.stringify(p);
  }
  function restoreLedgerColWidths() {
    if (!shell) return;
    shell.querySelectorAll('table.ledger').forEach(function (table) {
      var raw = table.dataset.ledgerColBackup;
      if (!raw) return;
      try {
        var arr = JSON.parse(raw);
        var cols = table.querySelectorAll('colgroup col');
        arr.forEach(function (pct, j) {
          if (cols[j]) cols[j].setAttribute('style', 'width:' + pct + '%');
        });
      } catch (_) {}
    });
  }
  function initLedgerColResize() {
    if (!shell) return;
    var MIN_PX = 28;
    shell.querySelectorAll('table.ledger').forEach(function (table) {
      ensureColBackup(table);
      var colgroup = table.querySelector('colgroup');
      if (!colgroup) return;
      var cols = Array.from(colgroup.querySelectorAll('col'));
      var ths = Array.from(table.querySelectorAll('thead tr th'));
      if (cols.length !== ths.length || cols.length < 2) return;
      ths.forEach(function (th, colIndex) {
        if (colIndex >= ths.length - 1) return;
        var old = th.querySelector('.ledger-resize-handle');
        if (old) old.remove();
        var h = document.createElement('span');
        h.className = 'ledger-resize-handle no-print';
        h.title = '拖曳調整此欄與右鄰欄寬度';
        th.appendChild(h);
        h.addEventListener('mousedown', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var i = colIndex;
          var startX = e.clientX;
          var initWidths = ths.map(function (t) {
            return t.getBoundingClientRect().width;
          });
          function onMove(ev) {
            var delta = ev.clientX - startX;
            var w = initWidths.slice();
            w[i] = initWidths[i] + delta;
            w[i + 1] = initWidths[i + 1] - delta;
            if (w[i] < MIN_PX) {
              w[i + 1] -= MIN_PX - w[i];
              w[i] = MIN_PX;
            }
            if (w[i + 1] < MIN_PX) {
              w[i] -= MIN_PX - w[i + 1];
              w[i + 1] = MIN_PX;
            }
            var sum = w.reduce(function (a, b) {
              return a + b;
            }, 0);
            if (sum <= 0) return;
            w.forEach(function (px, j) {
              if (cols[j]) cols[j].setAttribute('style', 'width:' + ((px / sum) * 100).toFixed(4) + '%');
            });
          }
          function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
          }
          document.body.style.cursor = 'col-resize';
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      });
    });
  }
  function restoreLedgerRowHeights() {
    if (!shell) return;
    shell.querySelectorAll('table.ledger thead tr, table.ledger tbody tr').forEach(function (tr) {
      tr.style.height = '';
      tr.style.minHeight = '';
    });
  }
  function initLedgerRowResize() {
    if (!shell) return;
    var MIN_ROW = 22;
    shell.querySelectorAll('table.ledger').forEach(function (table) {
      var rows = table.querySelectorAll('thead tr, tbody tr');
      rows.forEach(function (tr) {
        var old = tr.querySelector('.ledger-row-resize-handle');
        if (old) old.remove();
        var rh = document.createElement('span');
        rh.className = 'ledger-row-resize-handle no-print';
        rh.title = '拖曳調整本列高度';
        tr.appendChild(rh);
        rh.addEventListener('mousedown', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var startY = e.clientY;
          var initH = tr.getBoundingClientRect().height;
          function onMove(ev) {
            var dy = ev.clientY - startY;
            var newH = Math.max(MIN_ROW, Math.round(initH + dy));
            tr.style.height = newH + 'px';
            tr.style.minHeight = newH + 'px';
          }
          function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
          }
          document.body.style.cursor = 'row-resize';
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      });
    });
  }
  function initLedgerTableResize() {
    initLedgerColResize();
    initLedgerRowResize();
  }
  btnReset.addEventListener('click', function () {
    clearPrintSnapshot();
    rngFont.value = '14';
    rngWidth.value = '100';
    rngScale.value = '100';
    applyFont();
    applyWidth();
    applyScale();
    restoreLedgerColWidths();
    restoreLedgerRowHeights();
    setTimeout(initLedgerTableResize, 0);
  });
  applyFont();
  applyWidth();
  applyScale();
  setTimeout(initLedgerTableResize, 0);
})();
  </script>
</body>
</html>`;
}

/** 合計列上方：供列印預覽手動補登之空白列（與資料列同欄位 class，便於勾選可編輯後填寫） */
const LEDGER_MANUAL_BLANK_ROW = `<tr class="ledger-manual-row">
    <td class="nw col-date"></td>
    <td class="nw"></td>
    <td class="col-salary-grade"></td>
    <td class="nw tr"></td>
    <td class="tr col-ledger-qty"></td>
    <td class="tr col-ledger-qty"></td>
    <td class="tr col-ledger-qty col-substitute-fee"></td>
    <td class="nw col-leave-person"></td>
    <td class="nw"></td>
    <td class="nw tl"></td>
    <td class="nw tl col-note"></td>
    <td class="col-hm nw tr"></td>
    <td class="col-hm nw tr col-hm-fee"></td>
    <td class="tr col-payable"></td>
    <td class="ledger-fill"></td>
    <td class="ledger-fill"></td>
    <td class="ledger-fill"></td>
    <td class="ledger-fill"></td>
    <td class="ledger-fill"></td>
  </tr>`;

const LEDGER_MANUAL_BLANK_ROWS = Array.from({ length: 4 }, () => LEDGER_MANUAL_BLANK_ROW).join('\n');

function renderLedgerTable(
  fullTitle: string,
  typeStr: string,
  rows: MergedLedgerRow[],
  sums: ReturnType<typeof sumLines>,
  hideHomeroomCols: boolean,
  daysInMonth: number,
): string {
  const hmClass = hideHomeroomCols ? ' hm-hide' : '';
  const dim = Math.max(1, Math.min(31, Math.floor(Number(daysInMonth)) || 30));
  const head = `<thead><tr>
    <th class="col-date th-1l">代課日期</th>
    <th class="th-1l">代課教師</th>
    <th class="col-salary-grade th-1l">薪級</th>
    <th><span class="th-nobr">日薪</span><span class="th-brk">(${dim}天)</span></th>
    <th class="col-ledger-qty th-1l">代課天數</th>
    <th class="col-ledger-qty th-1l">代課節數</th>
    <th class="col-ledger-qty col-substitute-fee th-1l">代課費用</th>
    <th class="col-leave-person th-1l">請假人</th>
    <th class="th-1l">假別</th>
    <th><span class="th-nobr">請假</span><span class="th-brk">事由</span></th>
    <th class="th-1l">備註</th>
    <th class="col-hm"><span class="th-nobr">代導師</span><span class="th-brk">日數</span></th>
    <th class="col-hm col-hm-fee th-1l">導師費</th>
    <th><span class="th-nobr">應發</span><span class="th-brk">金額</span></th>
    <th class="th-1l">勞保</th>
    <th class="th-1l">健保</th>
    <th><span class="th-nobr">代扣補充</span><span class="th-brk">保費</span></th>
    <th><span class="th-nobr">實領</span><span class="th-brk">金額</span></th>
    <th><span class="th-nobr">代課教師</span><span class="th-brk">簽名</span></th>
  </tr></thead>`;

  const body = rows
    .map(
      (row) => `<tr>
    <td class="nw col-date">${multilineCell(row.dateLines)}</td>
    <td class="nw">${escHtml(row.substituteName)}</td>
    <td class="col-salary-grade">${salaryGradeCellHtml(row.salaryPointsLines)}</td>
    <td class="tr">${ledgerStackedCellHtml(row.dailyRateLines)}</td>
    <td class="tr col-ledger-qty">${ledgerStackedCellHtml(row.subDaysLines)}</td>
    <td class="tr col-ledger-qty">${ledgerStackedCellHtml(row.subPeriodsLines)}</td>
    <td class="tr col-ledger-qty col-substitute-fee">${ledgerStackedCellHtml(row.substitutePayLines)}</td>
    <td class="nw col-leave-person">${multilineCell(row.leaveTeacherLines)}</td>
    <td class="nw">${leaveTypeCellHtml(row.leaveTypeLines)}</td>
    <td class="nw tl">${multilineCell(row.reasonLines)}</td>
    <td class="nw tl col-note">${noteCellHtml(row.noteLines)}</td>
    <td class="col-hm tr">${ledgerStackedCellHtml(row.homeroomDaysLines)}</td>
    <td class="col-hm tr col-hm-fee">${ledgerStackedCellHtml(row.homeroomFeeLines)}</td>
    <td class="tr col-payable">${escHtml(fmtLedgerInt(row.payableTotal))}</td>
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
    <td class="tr col-ledger-qty">${escHtml(String(sums.sumDays))}</td>
    <td class="tr col-ledger-qty">${escHtml(String(sums.sumPeriods))}</td>
    <td class="tr col-ledger-qty col-substitute-fee">${escHtml(fmtLedgerInt(sums.sumHourly))}</td>
    <td colspan="4"></td>
    <td class="col-hm tr">${ledgerStackedCellHtml(String(sums.sumHmDays))}</td>
    <td class="col-hm tr col-hm-fee">${ledgerStackedCellHtml(fmtLedgerInt(sums.sumHmFee))}</td>
    <td class="tr col-payable">${escHtml(fmtLedgerInt(sums.sumPayable))}</td>
    <td colspan="5" class="ledger-total-tail"></td>
  </tr>`;

  const ziLiNote = hideHomeroomCols
    ? '<p class="ledger-meta" style="margin-top:6px">課務自理「代導師日數／導師費」欄與 GAS 相同不列入本表；另「課務自理導師費」專表請以試算表匯出為準。</p>'
    : '';

  return `<section class="ledger-block${hmClass}">
  <h2 class="ledger-h1">${escHtml(fullTitle)}</h2>
  ${ziLiNote}
  <table class="ledger">${ledgerTableColgroup()}${head}<tbody>${body}${LEDGER_MANUAL_BLANK_ROWS}${totalRow}</tbody></table>
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
