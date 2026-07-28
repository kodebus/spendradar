import { kv } from '@vercel/kv';
import { requireAppSecret, plaidBaseUrl, plaidCredentials } from './_auth.js';

const STORE_KEY = 'spendradar:plaid_item';

export default async function handler(req, res) {
  if (!requireAppSecret(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { public_token } = req.body || {};
  if (!public_token) return res.status(400).json({ error: 'Missing public_token' });

  const response = await fetch(`${plaidBaseUrl()}/item/public_token/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...plaidCredentials(), public_token })
  });

  const data = await response.json();
  if (!response.ok) return res.status(response.status).json(data);

  await kv.set(STORE_KEY, {
    access_token: data.access_token,
    item_id: data.item_id,
    cursor: null
  });

  res.status(200).json({ connected: true });
}
