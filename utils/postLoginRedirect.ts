import type { Location } from 'react-router-dom';

type FromState = { from?: Pick<Location, 'pathname' | 'search' | 'hash'> };

/**
 * 登入成功後導向路徑：僅接受 ProtectedRoute 傳入之站內 location，避免開放重導向。
 */
export function safePathAfterLogin(locationState: unknown): string {
  const st = locationState as FromState | null | undefined;
  const pathname = st?.from?.pathname;
  if (typeof pathname !== 'string' || pathname.length === 0 || pathname.length > 512) {
    return '/';
  }
  if (!pathname.startsWith('/') || pathname.startsWith('//')) {
    return '/';
  }
  if (pathname === '/login') {
    return '/';
  }
  const search = typeof st?.from?.search === 'string' && st.from.search.length <= 512 ? st.from.search : '';
  const hash = typeof st?.from?.hash === 'string' && st.from.hash.length <= 256 ? st.from.hash : '';
  return `${pathname}${search}${hash}`;
}
