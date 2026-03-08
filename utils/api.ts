
export interface GasResponse {
  status: 'success' | 'error';
  message?: string;
  data?: any;
  processedCount?: number;
}

/**
 * 呼叫 Google Apps Script Web App API
 * 移除 Headers 以強制使用 Simple Request 避開 CORS 預檢
 */
export const callGasApi = async (url: string, action: string, payloadData: any = {}): Promise<GasResponse> => {
  if (!url) {
    throw new Error('Web App URL 未設定');
  }

  // 1. 確保 URL 格式正確
  let targetUrl = url.trim();
  const separator = targetUrl.includes('?') ? '&' : '?';
  targetUrl = `${targetUrl}${separator}_t=${Date.now()}`;

  // 2. 準備 Payload
  const payload = {
    action,
    data: payloadData
  };

  try {
    // 3. 發送請求
    // 強制設定 Content-Type 為 text/plain 以觸發 Simple Request
    // 增加重試機制 (最多 3 次)
    let response;
    let lastError;
    for (let i = 0; i < 3; i++) {
      try {
        response = await fetch(targetUrl, {
          method: 'POST',
          mode: 'cors', // 明確指定 CORS 模式
          cache: 'no-cache', // 不快取
          credentials: 'omit', // 不發送 Cookie，避免跨域問題
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          redirect: 'follow',
          body: JSON.stringify(payload),
        });
        if (response.ok) break;
      } catch (e) {
        lastError = e;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // 指數退避
      }
    }

    if (!response) {
      throw lastError || new Error('無法連接至 GAS 伺服器 (重試 3 次失敗)');
    }

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();

    // 4. 錯誤偵測：檢查是否為 HTML
    if (text.trim().startsWith('<')) {
      console.error("[API] Received HTML:", text);
      throw new Error('伺服器回傳了 HTML 錯誤頁面。請檢查：\n1. GAS 部署權限是否為 "Anyone"\n2. 網址是否正確 (結尾 /exec)');
    }

    // 5. 解析 JSON
    let result: GasResponse;
    try {
      result = JSON.parse(text);
    } catch (e) {
      throw new Error(`解析失敗: 伺服器回傳內容非 JSON 格式。內容開頭: ${text.substring(0, 50)}...`);
    }

    // 6. 應用層錯誤檢查
    if (result.status !== 'success') {
      throw new Error(result.message || 'GAS 發生未知錯誤');
    }

    return result;
  } catch (error: any) {
    console.error(`GAS API Error [${action}]:`, error);
    throw error;
  }
};
