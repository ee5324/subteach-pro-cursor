/**
 * PIN 測試登入（匿名快速進入）— 僅存在本機 localStorage
 * 在「系統設定」開啟/關閉與設定 PIN；登入頁讀取後決定是否顯示區塊。
 */
const STORAGE_KEY = 'subteach_quick_login';

export interface QuickLoginConfig {
  enabled: boolean;
  pin: string;
}

const defaultConfig: QuickLoginConfig = { enabled: false, pin: '' };

export function getQuickLoginConfig(): QuickLoginConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultConfig };
    const parsed = JSON.parse(raw) as Partial<QuickLoginConfig>;
    return {
      enabled: !!parsed.enabled,
      pin: typeof parsed.pin === 'string' ? parsed.pin : '',
    };
  } catch {
    return { ...defaultConfig };
  }
}

export function setQuickLoginConfig(config: QuickLoginConfig): void {
  const next = {
    enabled: !!config.enabled,
    pin: (config.pin || '').trim(),
  };
  if (!next.enabled || !next.pin) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: false, pin: '' }));
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/** 登入頁用：是否應顯示 PIN 區塊（已啟用且 PIN 非空） */
export function isQuickLoginActive(): boolean {
  const c = getQuickLoginConfig();
  return c.enabled && c.pin.length > 0;
}

/** 驗證 PIN 是否正確 */
export function verifyQuickLoginPin(input: string): boolean {
  const c = getQuickLoginConfig();
  if (!c.enabled || !c.pin) return false;
  return input.trim() === c.pin;
}
