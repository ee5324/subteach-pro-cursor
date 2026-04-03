/**
 * 學生名單 Excel/CSV 解析：辨識「班級」區塊，擷取座號、姓名。
 * 供系統設定頁上傳與（若需要）學生名單頁使用。
 */
import * as XLSX from 'xlsx';
import type { LanguageElectiveStudent } from '../types';

export type RosterMap = Record<string, Record<string, string>>;

export function parseRosterFromRows(rows: string[][]): RosterMap {
  const roster: RosterMap = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] ?? '').trim();
      if (cell.includes('班') && cell.includes('級')) {
        const className = String(row[j + 1] ?? '').trim();
        if (!className) continue;
        if (!roster[className]) roster[className] = {};
        // 學生列從班級列「下一列」開始（常見為標題下一列即第一筆）；若為空白列會因座號不符而略過
        let rowIdx = i + 1;
        while (rowIdx < rows.length) {
          const targetRow = rows[rowIdx];
          if (!targetRow || targetRow.length <= j) {
            rowIdx++;
            continue;
          }
          const seat = String((targetRow[j - 2] ?? '')).trim();
          const name = String((targetRow[j - 1] ?? '')).trim();
          if (seat.includes('合計') || seat.includes('男')) break;
          if (/^\d+$/.test(seat) && name) roster[className][seat] = name;
          rowIdx++;
        }
      }
    }
  }
  return roster;
}

export function rosterMapToStudents(
  roster: RosterMap,
  nameToLanguage: Record<string, string>,
  defaultLanguage: string
): LanguageElectiveStudent[] {
  const list: LanguageElectiveStudent[] = [];
  const classNames = Object.keys(roster).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const className of classNames) {
    const seats = roster[className];
    const seatNums = Object.keys(seats).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    for (const seat of seatNums) {
      const name = seats[seat];
      list.push({
        className,
        seat,
        name,
        language: nameToLanguage[name] ?? defaultLanguage,
        languageClass: undefined,
      });
    }
  }
  return list;
}

export function sheetToRows(sheet: XLSX.WorkSheet): string[][] {
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as (string | number)[][];
  return aoa.map((row) => row.map((c) => (c != null ? String(c).trim() : '')));
}
