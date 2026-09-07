import { kv } from '@vercel/kv';
import { requireAppSecret, plaidBaseUrl, plaidCredentials } from './_auth.js';

const STORE_KEY = 'spendradar:plaid_item';

export default async function handler(req, res) {
  if (!requireAppSecret(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const item = await kv.get(STORE_KEY);

  if (item && item.access_token) {
    try {
      await fetch(`${plaidBaseUrl()}/item/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...plaidCredentials(), access_token: item.access_token })
      });
    } catch (err) {
      // Even if Plaid's own removal call fails (e.g. already-invalid token),
      // we still want to clear our local record so the app can link fresh.
      console.error('Plaid item/remove failed:', err);
    }
  }

  await kv.del(STORE_KEY);
  res.status(200).json({ disconnected: true });
}
