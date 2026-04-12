/**
 * 與 gas/Utilities.gs getMonthSheetName 假別後綴邏輯一致（不含年月前綴）。
 * 用於代課清冊列印預覽與 GAS 匯出選項鍵（公假、喪病產…）對齊。
 */
export function ledgerExportSuffixFromLeaveType(leaveType: string | undefined): string {
  const lt = String(leaveType || '');
  if (lt.indexOf('公假') > -1) return '公假';
  if (lt.indexOf('喪病') > -1 || lt.indexOf('產假') > -1) return '喪病產';
  if (lt.indexOf('身心') > -1) return '身心假';
  if (lt.indexOf('學輔') > -1) return '學輔事務';
  if (lt.indexOf('其他事務') > -1) return '其他事務';
  if (lt.indexOf('自理') > -1 || lt.indexOf('事假') > -1 || lt.indexOf('病假') > -1) return '自理';
  if (lt.indexOf('公付') > -1) return '公付其他';
  return '其他';
}

/** GAS generateReports typeOrder 與 Records 匯出勾選鍵 */
export const LEDGER_EXPORT_TYPE_ORDER = [
  '公假',
  '喪病產',
  '身心假',
  '學輔事務',
  '其他事務',
  '公付其他',
  '自理',
  '家長會',
] as const;

export type LedgerExportTypeKey = (typeof LEDGER_EXPORT_TYPE_ORDER)[number];

export function displayTypeStrFromSuffix(suffix: string): string {
  if (suffix === '自理') return '課務自理';
  if (suffix === '喪病產') return '喪病產假';
  if (suffix === '身心假') return '身心假';
  return suffix;
}
