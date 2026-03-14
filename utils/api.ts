
export interface GasResponse {
  status: 'success' | 'error';
  message?: string;
  data?: any;
  processedCount?: number;
}

/**
 * 呼叫 Google Apps Script Web App API（直連 GAS）
 */
export const callGasApi = async (url: string, action: string, payloadData: any = {}): Promise<GasResponse> => {
  if (!url) {
    throw new Error('Web App URL 未設定');
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

