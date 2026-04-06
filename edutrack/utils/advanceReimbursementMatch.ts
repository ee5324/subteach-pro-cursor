import type { BudgetPlanAdvance } from '../types';

export const REIMBURSE_MATCH_MAX_POOL = 24;
export const REIMBURSE_MATCH_MAX_SOLUTIONS = 35;
export const REIMBURSE_MATCH_MAX_COMBO_SIZE = 14;

/**
 * 自待歸還代墊中找出「實支金額加總恰好等於 target」的組合（可能多組）。
 * 筆數過多時請先縮小篩選範圍，避免組合爆炸。
 */
export function findOutstandingAdvanceSubsetsExact(
  outstanding: BudgetPlanAdvance[],
  target: number,
  options?: {
    maxPool?: number;
    maxSolutions?: number;
    maxComboSize?: number;
  },
): { solutions: BudgetPlanAdvance[][]; truncatedPool: boolean; poolSize: number } {
  const maxPool = options?.maxPool ?? REIMBURSE_MATCH_MAX_POOL;
  const maxSolutions = options?.maxSolutions ?? REIMBURSE_MATCH_MAX_SOLUTIONS;
  const maxComboSize = options?.maxComboSize ?? REIMBURSE_MATCH_MAX_COMBO_SIZE;

  const targetInt = Math.round(Number(target));
  if (!Number.isFinite(targetInt) || targetInt <= 0) {
    return { solutions: [], truncatedPool: false, poolSize: 0 };
  }

  const items = outstanding
    .filter((a) => (Number(a.amount) || 0) > 0)
    .map((a) => ({ advance: a, amount: Math.round(Number(a.amount)) }))
    .sort((x, y) => y.amount - x.amount);

  const truncatedPool = items.length > maxPool;
  const pool = truncatedPool ? items.slice(0, maxPool) : items;
  const n = pool.length;

  const solutions: BudgetPlanAdvance[][] = [];

  const dfs = (i: number, sum: number, path: BudgetPlanAdvance[]) => {
    if (solutions.length >= maxSolutions) return;
    if (sum === targetInt && path.length > 0) {
      solutions.push([...path]);
      return;
    }
    if (i >= n || sum > targetInt) return;
    if (path.length >= maxComboSize) return;

    dfs(i + 1, sum, path);
    const next = sum + pool[i].amount;
    if (next <= targetInt) {
      path.push(pool[i].advance);
      dfs(i + 1, next, path);
      path.pop();
    }
  };

  dfs(0, 0, []);

  return { solutions, truncatedPool, poolSize: n };
}
