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
        `<span class="sg-num">${escHtml(cur.trim())}</span><br/><span class="sg-cert">${escHtml(nextTrim)}</span>`,
      );
      i += 2;
    } else {
      chunks.push(escHtml(cur));
      i += 1;
    }
  }
  return chunks.join('<br/>');
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

/** 代導師日數：數字依 3 欄排列（多筆時自動換列） */
function homeroomDaysCellHtml(s: string): string {
  const raw = String(s).trim();
  if (!raw) return '<div class="hm-days-grid"><span>—</span></div>';
  const tokens = raw.split(/\n/).map((t) => t.trim()).filter((t) => t.length > 0);
  if (tokens.length === 0) return '<div class="hm-days-grid"><span>—</span></div>';
  const spans = tokens.map((t) => `<span>${escHtml(t)}</span>`).join('');
  return `<div class="hm-days-grid">${spans}</div>`;
}

/** 導師費：不換行（多筆以空白銜接） */
function homeroomFeeSingleLineHtml(s: string): string {
  const one = String(s).replace(/\s*\n\s*/g, ' ').trim();
  return escHtml(one || '—');
}

/** 備註：每一筆摘要（如 0日2節(午,5)）維持同一行，不從括號處被拆成兩行 */
function noteCellHtml(s: string): string {
  const lines = String(s).split('\n').filter((ln) => ln.length > 0);
  if (lines.length === 0) return escHtml('—');
  return lines.map((ln) => `<span class="note-line-block">${escHtml(ln)}</span>`).join('<br/>');
}

/** A4 橫向印領清冊：19 欄寬度加總 100%，避免 table-layout:fixed 時未設寬欄被壓成極窄而數字直排 */
function ledgerTableColgroup(): string {
  /* 尾段（勞健保、補充保費、實領、簽名）加寬；事由／代課費用等略縮以平衡 */
  const widths = [
    '5.5%',
    '6%',
    '5%',
    '3.5%',
    '6.4%',
    '6.4%',
    '8.9%',
    '5%',
    '4.5%',
    '4.5%',
    '4.5%',
    '3.8%',
    '4.2%',
    '5%',
    '4.3%',
    '4.3%',
    '4.8%',
    '4.8%',
    '8.6%',
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
    table.ledger th { background: #e2e8f0; font-weight: bold; line-height: 1.2; }
    table.ledger th.th-1l { white-space: nowrap; }
    table.ledger th .th-brk { display: block; }
    table.ledger th .th-nobr { white-space: nowrap; }
    /* 連續日期區間不換行（如 04/14-04/17） */
    table.ledger th.col-date,
    table.ledger td.col-date { white-space: nowrap; word-break: normal; overflow-wrap: normal; }
    table.ledger th.col-salary-grade,
    table.ledger td.col-salary-grade {
      word-break: normal;
      overflow-wrap: normal;
      line-height: 1.3;
    }
    table.ledger td.col-salary-grade .sg-num { display: block; }
    table.ledger td.col-salary-grade .sg-cert {
      display: inline-block;
      white-space: nowrap;
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
    table.ledger .hm-days-grid {
      display: grid;
      grid-template-columns: repeat(3, auto);
      gap: 2px 4px;
      justify-content: center;
      align-items: center;
      font-variant-numeric: tabular-nums;
    }
    table.ledger .hm-days-grid span { white-space: nowrap; }
    table.ledger th.col-hm-fee,
    table.ledger td.col-hm-fee {
      white-space: nowrap;
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
    table.ledger td[contenteditable="true"],
    table.ledger th[contenteditable="true"],
    .ledger-footer-sign .sign-line span[contenteditable="true"] {
      box-shadow: inset 0 0 0 1px #94a3b8;
      background: #fffef7;
    }
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
      table.ledger td[contenteditable="true"],
      table.ledger th[contenteditable="true"],
      .ledger-footer-sign .sign-line span[contenteditable="true"] {
        box-shadow: none;
        background: transparent;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <div class="toolbar-row">
      <button type="button" onclick="window.print()">列印</button>
      <button type="button" class="secondary" id="btnResetLayout">重設版面</button>
      <label><input type="checkbox" id="chkEditable" /> 可編輯內容（表內儲存格與核章列文字）</label>
    </div>
    <div class="toolbar-row">
      <label>表格字級 <input type="range" id="rngFont" min="10" max="18" step="0.5" value="14" /><span id="lblFont">14pt</span></label>
      <label>表格寬度 <input type="range" id="rngWidth" min="78" max="118" value="100" /><span id="lblWidth">100%</span></label>
      <label>整表縮放 <input type="range" id="rngScale" min="75" max="125" value="100" /><span id="lblScale">100%</span></label>
      <span class="hint">紙張請選 A4 橫向。編輯後直接列印即可帶入紙本；「重設」還原字級／寬度／縮放（無法還原已改文字）。</span>
    </div>
  </div>
  <div class="ledger-shell" id="ledgerShell">
    <div class="ledger-scale-inner" id="ledgerScaleInner">
      ${bodyInner}
    </div>
  </div>
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
  function setEditable(on) {
    if (!shell) return;
    shell.querySelectorAll('table.ledger td, table.ledger th').forEach(function (el) {
      el.contentEditable = on ? 'true' : 'false';
    });
    shell.querySelectorAll('.ledger-footer-sign .sign-line span').forEach(function (el) {
      el.contentEditable = on ? 'true' : 'false';
    });
  }
  rngFont.addEventListener('input', applyFont);
  rngWidth.addEventListener('input', applyWidth);
  rngScale.addEventListener('input', applyScale);
  chk.addEventListener('change', function () { setEditable(chk.checked); });
  btnReset.addEventListener('click', function () {
    rngFont.value = '14';
    rngWidth.value = '100';
    rngScale.value = '100';
    applyFont();
    applyWidth();
    applyScale();
  });
  applyFont();
  applyWidth();
  applyScale();
})();
  </script>
</body>
</html>`;
}

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
    <td class="nw tr">${multilineCell(row.dailyRateLines)}</td>
    <td class="tr col-ledger-qty">${multilineCell(row.subDaysLines)}</td>
    <td class="tr col-ledger-qty">${multilineCell(row.subPeriodsLines)}</td>
    <td class="tr col-ledger-qty col-substitute-fee">${multilineCell(row.substitutePayLines)}</td>
    <td class="nw col-leave-person">${multilineCell(row.leaveTeacherLines)}</td>
    <td class="nw">${leaveTypeCellHtml(row.leaveTypeLines)}</td>
    <td class="nw tl">${multilineCell(row.reasonLines)}</td>
    <td class="nw tl col-note">${noteCellHtml(row.noteLines)}</td>
    <td class="col-hm nw tr">${homeroomDaysCellHtml(row.homeroomDaysLines)}</td>
    <td class="col-hm nw tr col-hm-fee">${homeroomFeeSingleLineHtml(row.homeroomFeeLines)}</td>
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
    <td class="col-hm tr">${homeroomDaysCellHtml(String(sums.sumHmDays))}</td>
    <td class="col-hm tr col-hm-fee">${escHtml(fmtLedgerInt(sums.sumHmFee))}</td>
    <td class="tr col-payable">${escHtml(fmtLedgerInt(sums.sumPayable))}</td>
    <td></td>
    <td></td>
    <td></td>
    <td class="tr col-payable">${escHtml(fmtLedgerInt(sums.sumPayable))}</td>
    <td></td>
  </tr>`;

  const ziLiNote = hideHomeroomCols
    ? '<p class="ledger-meta" style="margin-top:6px">課務自理「代導師日數／導師費」欄與 GAS 相同不列入本表；另「課務自理導師費」專表請以試算表匯出為準。</p>'
    : '';

  return `<section class="ledger-block${hmClass}">
  <h2 class="ledger-h1">${escHtml(fullTitle)}</h2>
  ${ziLiNote}
  <table class="ledger">${ledgerTableColgroup()}${head}<tbody>${body}${totalRow}</tbody></table>
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
