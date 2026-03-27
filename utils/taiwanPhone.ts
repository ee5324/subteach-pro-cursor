/**
 * 正規化為台灣手機全碼（10 碼數字、09 開頭）。
 * 支援「0912345678」「912345678」「+886912345678」等輸入。
 */
export function normalizeTaiwanMobileDigits(raw: string | undefined | null): string {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('886') && d.length >= 11) {
    d = '0' + d.slice(3);
  }
  if (d.length === 9 && d[0] === '9') {
    d = '0' + d;
  }
  if (d.length === 10 && d.startsWith('09')) return d;
  return '';
}

/** 顯示用遮罩（不暴露完整號碼） */
export function maskTaiwanMobileDigits(d: string): string {
  if (d.length !== 10) return '—';
  return `${d.slice(0, 4)}***${d.slice(-3)}`;
}
