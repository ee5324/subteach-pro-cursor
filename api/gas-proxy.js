/**
 * Vercel Serverless：代為呼叫 GAS Web App，避免瀏覽器 CORS 阻擋
 * 教師請假表單「列印／產生代課單」從 Vercel 呼叫 GAS 時會經由此 proxy
 */
const GAS_URL = process.env.GAS_WEB_APP_URL || '';

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
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }

  if (!GAS_URL) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    return res.status(500).json({
      status: 'error',
      message: 'GAS Web App URL 未設定。請在 Vercel 專案設定 > Environment Variables 新增 GAS_WEB_APP_URL',
    });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    return res.status(400).json({ status: 'error', message: 'Invalid JSON body' });
  }

  const { action, data } = body;
  if (!action) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    return res.status(400).json({ status: 'error', message: 'Missing action' });
  }

  const payload = { action, data: data ?? {} };
  const targetUrl = GAS_URL.replace(/\?.*$/, '') + (GAS_URL.includes('?') ? '&' : '?') + '_t=' + Date.now();

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      return res.status(502).json({
        status: 'error',
        message: 'GAS 回傳非 JSON。請確認部署權限為 Anyone、網址正確。',
      });
    }
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.status(200).json(result);
  } catch (err) {
    console.error('[gas-proxy]', err);
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.status(502).json({
      status: 'error',
      message: err.message || '無法連線至 GAS',
    });
  }
}
