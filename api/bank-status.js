import { kv } from '@vercel/kv';
import { requireAppSecret } from './_auth.js';

export default async function handler(req, res) {
  if (!requireAppSecret(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const item = await kv.get('spendradar:plaid_item');
  res.status(200).json({ connected: !!(item && item.access_token) });
}
