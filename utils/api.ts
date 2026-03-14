
export interface GasResponse {
  status: 'success' | 'error';
  message?: string;
  data?: any;
  processedCount?: number;
}

/** 經同源 proxy 呼叫 GAS（由 proxy 代轉，避免 CORS） */
async function callGasApiViaProxy(url: string, action: string, payloadData: any): Promise<GasResponse> {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const proxyUrl = base ? `${base}/api/gas-proxy` : '';
  if (!proxyUrl) throw new Error('無法取得 API 網址');
  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, data: payloadData, url: url || undefined }),
  });
  const result: GasResponse = await res.json().catch(() => ({ status: 'error' as const, message: '回應格式錯誤' }));
  if (!res.ok) throw new Error(result.message || `請求失敗 (${res.status})`);
  if (result.status !== 'success') throw new Error(result.message || '請求失敗');
  return result;
}

/**
 * 呼叫 Google Apps Script Web App API
 * 從 Vercel 等非 localhost 時改走同源 /api/gas-proxy（解決 CORS）；本機仍直連
 */
export const callGasApi = async (url: string, action: string, payloadData: any = {}): Promise<GasResponse> => {
  if (!url) {
    throw new Error('Web App URL 未設定');
  }

  const isBrowser = typeof window !== 'undefined';
  const origin = isBrowser ? window.location.origin : '';
  const useProxy = isBrowser && origin && !/localhost|127\.0\.0\.1/.test(origin);

  if (useProxy) {
    return callGasApiViaProxy(url, action, payloadData);
  }

  let targetUrl = url.trim();
  const separator = targetUrl.includes('?') ? '&' : '?';
  targetUrl = `${targetUrl}${separator}_t=${Date.now()}`;
  const payload = { action, data: payloadData };

  try {
    let response;
    let lastError;
    for (let i = 0; i < 3; i++) {
      try {
        response = await fetch(targetUrl, {
          method: 'POST',
          mode: 'cors',
          cache: 'no-cache',
          credentials: 'omit',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          redirect: 'follow',
          body: JSON.stringify(payload),
        });
        if (response.ok) break;
      } catch (e) {
        lastError = e;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }

    if (!response) {
      const errMsg = (lastError as any)?.message;
      if (/Failed to fetch|NetworkError|Load failed/i.test(errMsg || '')) {
        throw new Error('無法連線至 GAS（請檢查網路、GAS URL 是否正確，或稍後再試）。');
      }
      throw lastError || new Error('無法連接至 GAS 伺服器 (重試 3 次失敗)');
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('GAS 回傳 404：請確認網址正確、部署仍存在且類型為「網頁應用程式」。');
      }
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    if (text.trim().startsWith('<')) {
      console.error("[API] Received HTML:", text);
      throw new Error('伺服器回傳了 HTML 錯誤頁面。請檢查：\n1. GAS 部署權限是否為 "Anyone"\n2. 網址是否正確 (結尾 /exec)');
    }

    let result: GasResponse;
    try {
      result = JSON.parse(text);
    } catch (e) {
      throw new Error(`解析失敗: 伺服器回傳內容非 JSON 格式。內容開頭: ${text.substring(0, 50)}...`);
    }

    if (result.status !== 'success') {
      throw new Error(result.message || 'GAS 發生未知錯誤');
    }

    return result;
  } catch (error: any) {
    console.error(`GAS API Error [${action}]:`, error);
    if (/Failed to fetch|NetworkError|Load failed/i.test(error?.message || '')) {
      throw new Error('無法連線至 GAS（請檢查網路、GAS URL 是否正確，或稍後再試）。');
    }
    throw error;
  }
};

