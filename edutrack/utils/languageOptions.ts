/** 學生名單「選修語言」維度之選項；正式環境存於 Firebase（edutrack_system/settings），由 api.getLanguageOptions / saveLanguageOptionsToFirebase 讀寫 */

export const LANGUAGE_OPTIONS_KEY = 'edutrack_language_options';
export const DEFAULT_LANGUAGE_OPTIONS = ['閩南語', '客家語', '原住民族語', '新住民語', '越南語', '手語', '無／未選'];

/** 僅供初始 state 或離線 fallback；實際選項請用 api.getLanguageOptions() 從 Firebase 讀取 */
export function loadLanguageOptions(): string[] {
  return [...DEFAULT_LANGUAGE_OPTIONS];
}
