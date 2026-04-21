/**
 * 段考對外頁（HashRouter）：區分填報頁與提報進度頁。
 */
export function isExamSubmitProgressHash(hash: string): boolean {
  const h = hash || '';
  return h.startsWith('#/exam-submit-progress');
}

export function isExamSubmitFormHash(hash: string): boolean {
  const h = hash || '';
  return /^#\/exam-submit(\?|$|\/)/.test(h);
}

/** 主站 loading 略過：對外段考相關 hash */
export function isPublicExamSubmitRelatedHash(hash: string): boolean {
  return isExamSubmitProgressHash(hash) || isExamSubmitFormHash(hash);
}

export function getPublicExamStandaloneMode(): 'submit' | 'progress' | null {
  if (typeof window === 'undefined') return null;
  const p = window.location.pathname;
  const h = window.location.hash || '';
  if (p.includes('exam-submit-progress') || h.startsWith('#/exam-submit-progress')) return 'progress';
  if (p.includes('exam-submit') || isExamSubmitFormHash(h)) return 'submit';
  return null;
}

export function buildExamSubmitProgressHashUrl(): string {
  if (typeof window === 'undefined') return '#/exam-submit-progress';
  const basePath = import.meta.env.BASE_URL || '/';
  return `${window.location.origin}${basePath}#/exam-submit-progress`;
}

export function buildExamSubmitFormHashUrl(): string {
  if (typeof window === 'undefined') return '#/exam-submit';
  const basePath = import.meta.env.BASE_URL || '/';
  return `${window.location.origin}${basePath}#/exam-submit`;
}
