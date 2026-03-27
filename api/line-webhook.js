/**
 * LINE Messaging API Webhook 入口（給 LINE Developers 填寫的 URL）
 *
 * 為何需要：GAS Web App 的 /exec 對匿名 POST 會先回 302，LINE 驗證要求「第一個回應」為 HTTP 200。
 * 逾時：若先 await GAS 再回 LINE，GAS 常超過 LINE 的逾時 →「A timeout occurred when sending a webhook event」。
 * 作法：立刻對 LINE 回 200，再用 waitUntil 在背景轉發到 GAS（fetch 會跟隨重新導向）。
 *
 * 環境變數：GAS_WEB_APP_URL = 你的 .../exec 網址（與前端設定一致）
 */
import { waitUntil } from '@vercel/functions';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('ok');
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const gasUrl = (process.env.GAS_WEB_APP_URL || '').trim();
  if (!gasUrl) {
    return res.status(500).json({ error: 'GAS_WEB_APP_URL is not set' });
  }

  const payload =
    typeof req.body === 'string'
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : JSON.stringify(req.body != null ? req.body : {});

  const lineSig = req.headers['x-line-signature'];

  waitUntil(
    (async () => {
      try {
        const upstream = await fetch(gasUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...(lineSig ? { 'X-Line-Signature': String(lineSig) } : {}),
          },
          body: payload,
          redirect: 'follow',
        });
        const text = await upstream.text();
        if (!upstream.ok) {
          console.error('[line-webhook] GAS upstream', upstream.status, text.slice(0, 500));
        }
      } catch (err) {
        console.error('[line-webhook] forward to GAS failed', err);
      }
    })()
  );

  return res.status(200).send('OK');
}
