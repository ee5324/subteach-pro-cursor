/**
 * Vercel Serverless：代為呼叫 GAS，避免從 Vercel 直連時被 CORS 阻擋
 * 優先使用請求 body 的 url（系統設定），未帶則用環境變數 GAS_WEB_APP_URL
 */
const getGasUrl = (body) => {
  const url = body?.url && String(body.url).trim();
  return url || process.env.GAS_WEB_APP_URL || '';
};

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.status(405).json({ status: 'error', message: 'Method not allowed' });
    return;
  }

  const GAS_URL = getGasUrl(req.body || {});
  if (!GAS_URL) {
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
    res.status(400).json({
      status: 'error',
      message: 'GAS URL 未提供。請在系統設定填寫 Web App URL，或於 Vercel 設定 GAS_WEB_APP_URL。',
    });
    return;
  }

  const { action, data } = req.body || {};
  if (!action) {
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
    res.status(400).json({ status: 'error', message: '缺少 action' });
    return;
  }

  const payload = { action, data: data || {} };
  const targetUrl = GAS_URL.includes('?') ? `${GAS_URL}&_t=${Date.now()}` : `${GAS_URL}?_t=${Date.now()}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const text = await response.text();

    Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));

    if (!response.ok) {
      res.status(response.status).json({
        status: 'error',
        message: response.status === 404
          ? 'GAS 回傳 404：請確認部署存在、網址正確，類型為「網頁應用程式」。'
          : `GAS 回傳 HTTP ${response.status}`,
      });
      return;
    }

    if (text.trim().startsWith('<')) {
      res.status(502).json({
        status: 'error',
        message: 'GAS 回傳 HTML（可能為權限頁）。請確認部署「誰可以存取」選「任何人」。',
      });
      return;
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      res.status(502).json({ status: 'error', message: 'GAS 回傳內容非 JSON' });
      return;
    }

    res.status(200).json(json);
  } catch (err) {
    console.error('[gas-proxy]', err);
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
    res.status(502).json({
      status: 'error',
      message: err?.message || '無法連線至 GAS，請檢查網路或 GAS URL。',
    });
  }
}
