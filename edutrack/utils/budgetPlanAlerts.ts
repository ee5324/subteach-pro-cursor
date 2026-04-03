import type { BudgetPlan } from '../types';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** 結案日與今天相差天數：正數＝尚餘天數，0＝今天結案，負數＝已逾期 */
export function daysUntilCloseDate(closeByDate: string, today = new Date()): number | null {
  if (!ISO.test(closeByDate)) return null;
  const [y, m, d] = closeByDate.split('-').map(Number);
  const close = new Date(y, m - 1, d);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((close.getTime() - t.getTime()) / 86400000);
}

/** 距結案一個月內（含當天）或已逾期；已結案不警示 */
export function budgetPlanNeedsNavAlert(plan: BudgetPlan): boolean {
  if (plan.status === 'closed') return false;
  const days = daysUntilCloseDate(plan.closeByDate);
  if (days === null) return false;
  if (days < 0) return true;
  return days <= 30;
}

export function budgetPlanIsOverdue(plan: BudgetPlan): boolean {
  if (plan.status === 'closed') return false;
  const days = daysUntilCloseDate(plan.closeByDate);
  return days !== null && days < 0;
}

export function summarizeBudgetPlanAlerts(plans: BudgetPlan[]): { count: number; overdue: number } {
  let count = 0;
  let overdue = 0;
  for (const p of plans) {
    if (!budgetPlanNeedsNavAlert(p)) continue;
    count++;
    if (budgetPlanIsOverdue(p)) overdue++;
  }
  return { count, overdue };
}

/** 列表列顯示用簡短標籤 */
export function closeDateAlertLabel(plan: BudgetPlan): string | null {
  if (plan.status === 'closed') return null;
  const days = daysUntilCloseDate(plan.closeByDate);
  if (days === null) return null;
  if (days < 0) return `已逾期 ${Math.abs(days)} 天`;
  if (days === 0) return '今日結案';
  if (days <= 30) return `剩 ${days} 天結案`;
  return null;
}
