import { kv } from '@vercel/kv';
import { requireAppSecret, plaidBaseUrl, plaidCredentials } from './_auth.js';

const STORE_KEY = 'spendradar:plaid_items';

export default async function handler(req, res) {
  if (!requireAppSecret(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { item_id } = req.body || {};
  if (!item_id) return res.status(400).json({ error: 'Missing item_id' });

  const items = (await kv.get(STORE_KEY)) || {};
  const item = items[item_id];

  if (item && item.access_token) {
    try {
      await fetch(`${plaidBaseUrl()}/item/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...plaidCredentials(), access_token: item.access_token })
      });
    } catch (err) {
      // Even if Plaid's own removal call fails, still clear our local record
      // so the app doesn't get stuck thinking a dead connection is live.
      console.error('Plaid item/remove failed:', err);
    }
  }

  delete items[item_id];
  await kv.set(STORE_KEY, items);
  res.status(200).json({ disconnected: true });
}
