/**
 * 點名單列印：產生整份 HTML 字串，供 window.open + document.write 列印用。
 * 每張點名表包在 .notice-page，一頁 A4 橫向。
 */
import type { AttendanceTableData, Student } from '../types';

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateMMDD(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

/** 上課時間顯示用：去掉「-早」後綴，例如 W3-早 → W3 */
function formatClassTimeForDisplay(classTime: string): string {
  const s = (classTime ?? '').trim();
  // W1-早 / W1-1 / W1-2 ... 顯示為 W1
  const m = s.match(/^(W[1-5])-.+$/i);
  if (m) return m[1].toUpperCase();
  return s.replace(/-早$/, '');
}

/** 是否為「每週時間」顯示（週一～週日），合併表用 */
function isWeeklyTimeLabel(classTime: string): boolean {
  const t = (classTime ?? '').trim();
  return /^週[一二三四五六日]$/.test(t) || /^W[1-5]$/i.test(t);
}

interface ProcessedStudent extends Student {
  rowSpan: number;
  isGray: boolean;
}

function processStudents(students: Student[]): ProcessedStudent[] {
  const normalized = students.map((s) => ({
    ...s,
    period: s.period != null ? String(s.period).trim() || '第一節' : '第一節',
  }));
  const periodCounts: Record<string, number> = {};
  normalized.forEach((s) => {
    periodCounts[s.period] = (periodCounts[s.period] || 0) + 1;
  });
  const periodRendered: Record<string, number> = {};
  let groupIndex = 0;
  let lastPeriod = normalized[0]?.period ?? '';
  return normalized.map((s) => {
    if (s.period !== lastPeriod) {
      groupIndex++;
      lastPeriod = s.period;
    }
    const count = periodRendered[s.period] || 0;
    const isFirst = count === 0;
    periodRendered[s.period] = count + 1;
    return {
      ...s,
      rowSpan: isFirst ? periodCounts[s.period] : 0,
      isGray: groupIndex % 2 !== 0,
    };
  });
}

function buildOneSheet(data: AttendanceTableData): string {
  const {
    academicYear,
    semester,
    courseName,
    instructorName,
    classTime,
    location,
    dates,
    students,
  } = data;
  const processed = processStudents(students);
  const semesterText = semester.includes('學期') ? semester : `${semester}學期`;
  const dateCells = dates.map((d) => `<th class="th-date">${esc(formatDateMMDD(d))}</th>`).join('');
  const dateCellsBody = dates.map(() => '<td class="td-cell td-date"></td>').join('');

  const rows = processed
    .map((student) => {
      const gray = student.isGray ? ' class="row-gray"' : '';
      const grayStyle = student.isGray ? ' style="-webkit-print-color-adjust: exact; print-color-adjust: exact;"' : '';
      const periodCell =
        student.rowSpan > 0
          ? `<td class="td-cell" rowspan="${student.rowSpan}" style="vertical-align: middle">${esc(student.period)}</td>`
          : '';
      return `<tr${gray}${grayStyle}>
        <td class="td-cell">${esc(student.id)}</td>${periodCell}
        <td class="td-cell td-class">${esc(student.className)}</td>
        <td class="td-cell td-name">${esc(student.name)}</td>
        ${dateCellsBody}
        <td class="td-cell td-last"></td>
      </tr>`;
    })
    .join('');

  const dateFooterCells = dates.map(() => '<td class="td-cell td-date"></td>').join('');

  return `
    <div class="sheet-content">
      <div class="sheet-header">
        <h1 class="sheet-title">${esc(academicYear)} 學年${esc(semesterText)}加昌國小${esc(courseName)}點名單</h1>
        <div class="sheet-teacher">授課教師：${esc(instructorName)}</div>
      </div>
      <div class="sheet-info">
        <div>${isWeeklyTimeLabel(classTime) ? '每週時間' : '上課時間'}：${esc(formatClassTimeForDisplay(classTime))}</div>
        <div>上課地點：${esc(location)}</div>
      </div>
      <table class="sheet-table">
        <thead>
          <tr>
            <th class="th-cell w-num"><span class="cell-inner">編<br/>號</span></th>
            <th class="th-cell w-time">上課時間</th>
            <th class="th-cell w-class">班級</th>
            <th class="th-cell w-name">姓名</th>
            ${dateCells}
            <th class="th-cell w-grade"><span class="cell-inner">成<br/>績</span></th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="row-sign">
            <td colspan="4" class="td-sign">教師簽名</td>
            <td colspan="${dates.length}" class="td-cell td-date"></td>
            <td class="td-cell td-last"></td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

const PRINT_CSS = `
  @page { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; font-family: "BiauKai", "DFKai-SB", "KaiTi", "標楷體", serif; }
  .notice-page {
    width: 100%;
    height: 210mm;
    min-height: 210mm;
    max-height: 210mm;
    page-break-after: always;
    break-after: page;
    overflow: hidden;
    padding: 2mm 0 0 0;
  }
  .notice-page:last-child { page-break-after: auto; break-after: auto; }
  .sheet-content { width: 100%; padding: 4px 0 0 0; }
  .sheet-header { text-align: center; margin-bottom: 2px; }
  .sheet-title { font-size: 20px; font-weight: bold; letter-spacing: 0.1em; margin: 0 0 4px 0; }
  .sheet-teacher { font-size: 14px; text-align: right; }
  .sheet-info { font-size: 12px; font-weight: 500; margin-bottom: 2px; }
  .sheet-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 12px;
    border-top: 1px solid #000;
    border-right: 1px solid #000;
    border-bottom: 1px solid #000;
    border-left: 1px solid #000;
  }
  .sheet-table th,
  .sheet-table td {
    border-top: 1px solid #000;
    border-right: 1px solid #000;
    border-bottom: 1px solid #000;
    border-left: 1px solid #000;
    padding: 2px 4px;
    text-align: center;
    vertical-align: middle;
    white-space: nowrap;
    overflow: hidden;
  }
  .th-cell { background: #f9fafb; font-weight: 600; }
  .td-date, .th-date { width: 8mm !important; min-width: 8mm !important; max-width: 8mm !important; }
  .w-num { width: 2.5em; }
  .w-time { width: 5em; }
  .w-class { width: 4em; font-size: 13.5pt; }
  .w-name { width: 6em; font-size: 13.5pt; }
  .w-grade { width: 4em; }
  .td-class, .td-name { font-size: 13.5pt; }
  .td-name { font-weight: 500; }
  .cell-inner { display: block; width: 100%; text-align: center; }
  .row-gray { background: #f3f4f6; }
  .row-sign .td-sign { font-weight: bold; text-align: center; padding: 4px 8px; }
  .sheet-scale-wrap { overflow: hidden; }
`;

/**
 * 由課程名稱取得「語言別」（例：排灣語3A → 排灣語、閩南語A → 閩南語）
 */
function getLanguageType(courseName: string): string {
  const s = (courseName ?? '').trim();
  return s.replace(/\s*[\dA-Za-z]+\s*$/, '').trim() || s;
}

/** 由上課時間字串解析星期幾（週一=1 … 週日=0），無法解析時回傳 -1 */
function getDayOfWeekFromClassTime(classTime: string): number {
  const t = (classTime ?? '').trim();
  // W1-早 / W1-1 ...（W1=週一, W5=週五）
  const m = t.match(/^W([1-5])(?:-.+)?$/i);
  if (m) return parseInt(m[1], 10);
  if (/週一/.test(t)) return 1;
  if (/週二/.test(t)) return 2;
  if (/週三/.test(t)) return 3;
  if (/週四/.test(t)) return 4;
  if (/週五/.test(t)) return 5;
  if (/週六/.test(t)) return 6;
  if (/週日/.test(t)) return 0;
  return -1;
}

const DAY_NAMES: Record<number, string> = { 1: 'W1', 2: 'W2', 3: 'W3', 4: 'W4', 5: 'W5' };

/**
 * 同一週幾、同一位老師、不同節的點名表合併為「多表合一」：一頁一表，所有該週幾的日期為欄，學生依「節」分組（晨光時間、第1節…）。
 * 不同星期幾或不同老師不合併。
 */
export function mergeSheetsByLanguageAndTeacher(sheets: AttendanceTableData[]): AttendanceTableData[] {
  if (sheets.length === 0) return [];
  const key = (s: AttendanceTableData) => {
    const day = getDayOfWeekFromClassTime(s.classTime ?? '');
    return `${getLanguageType(s.courseName)}|${(s.instructorName ?? '').trim()}|${day}`;
  };
  const groups = new Map<string, AttendanceTableData[]>();
  for (const s of sheets) {
    const d = getDayOfWeekFromClassTime(s.classTime ?? '');
    if (d < 0) {
      const singleKey = `single|${s.courseName}|${s.classTime}`;
      if (!groups.has(singleKey)) groups.set(singleKey, []);
      groups.get(singleKey)!.push(s);
      continue;
    }
    const k = key(s);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  }
  const result: AttendanceTableData[] = [];
  for (const [groupKey, groupSheets] of groups) {
    if (groupKey.startsWith('single')) {
      for (const sh of groupSheets) result.push(sh);
      continue;
    }
    const first = groupSheets[0];
    const groupDayOfWeek = getDayOfWeekFromClassTime(first.classTime ?? '');
    if (groupSheets.length === 1 && groupDayOfWeek >= 0) {
      result.push(first);
      continue;
    }
    const allDates = Array.from(
      new Set(groupSheets.flatMap((s) => s.dates.map((d) => d.getTime())))
    ).sort((a, b) => a - b);
    const datesList = allDates
      .map((t) => new Date(t))
      .filter((d) => d.getDay() === groupDayOfWeek);
    const languageLabel = getLanguageType(first.courseName);
    const combined: Student[] = [];
    for (const sheet of groupSheets) {
      for (const st of sheet.students) {
        combined.push({
          ...st,
          period: st.period ?? '第一節',
        });
      }
    }
    combined.sort((a, b) => {
      const p = (a.period ?? '').localeCompare(b.period ?? '');
      if (p !== 0) return p;
      const c = (a.className ?? '').localeCompare(b.className ?? '', undefined, { numeric: true });
      return c !== 0 ? c : (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0);
    });
    result.push({
      academicYear: first.academicYear,
      semester: first.semester,
      courseName: languageLabel,
      instructorName: first.instructorName,
      classTime: DAY_NAMES[groupDayOfWeek] ?? '多班',
      location: first.location ?? '',
      dates: datesList,
      students: combined.map((st, i) => ({ ...st, id: String(i + 1) })),
    });
  }
  return result;
}

/**
 * 產生完整列印用 HTML（含 DOCTYPE、head 內嵌 CSS、body 內多個 .notice-page）
 * 僅傳入的點名表會列印；同一週幾、同一位老師、不同節的會合併為該日一頁，其餘不合併。
 */
export function buildAttendanceSheetsPrintHtml(sheets: AttendanceTableData[]): string {
  const merged = mergeSheetsByLanguageAndTeacher(sheets);
  const pages = merged
    .map((data) => `<div class="notice-page">${buildOneSheet(data)}</div>`)
    .join('\n');
  const script = `
(function(){
  var pageHeightMm = 210;
  var pageHeightPx = pageHeightMm * 96 / 25.4;
  function fitPages(){
    document.querySelectorAll('.notice-page').forEach(function(page){
      var content = page.querySelector('.sheet-content');
      if (!content) return;
      var h = content.offsetHeight;
      var w = content.offsetWidth;
      if (h <= pageHeightPx) return;
      var scale = pageHeightPx / h;
      var wrap = document.createElement('div');
      wrap.className = 'sheet-scale-wrap';
      wrap.style.height = pageHeightPx + 'px';
      wrap.style.width = (w * scale) + 'px';
      wrap.style.margin = '0';
      wrap.style.padding = '0';
      content.parentNode.insertBefore(wrap, content);
      wrap.appendChild(content);
      content.style.transform = 'scale(' + scale + ')';
      content.style.transformOrigin = 'top left';
    });
  }
  if (document.readyState === 'complete') fitPages();
  else window.addEventListener('load', fitPages);
})();
`;
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>點名單列印</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
${pages}
<script>${script}<\/script>
</body>
</html>`;
}
