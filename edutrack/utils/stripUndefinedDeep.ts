/**
 * Firestore 不允許欄位值為 `undefined`，遞迴移除以免 setDoc/updateDoc 拋錯。
 * 注意：合併寫入時若需「刪除欄位」應使用 deleteField()，而非略過 key。
 */
export function stripUndefinedDeep<T>(input: T): T {
  if (input === undefined || input === null) return input;
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) {
    return input.map((x) => stripUndefinedDeep(x)) as T;
  }
  const obj = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val === undefined) continue;
    out[key] = stripUndefinedDeep(val);
  }
  return out as T;
}
