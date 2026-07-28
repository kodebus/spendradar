import { kv } from '@vercel/kv';
import { requireAppSecret, plaidBaseUrl, plaidCredentials } from './_auth.js';

const STORE_KEY = 'spendradar:plaid_item';

export default async function handler(req, res) {
  if (!requireAppSecret(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const item = await kv.get(STORE_KEY);
  if (!item || !item.access_token) {
    return res.status(400).json({ error: 'No bank account connected yet' });
  }

  let cursor = item.cursor || undefined;
  let added = [];
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(`${plaidBaseUrl()}/transactions/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...plaidCredentials(), access_token: item.access_token, cursor })
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    added = added.concat(data.added);
    cursor = data.next_cursor;
    hasMore = data.has_more;
  }

  await kv.set(STORE_KEY, { ...item, cursor });

  const transactions = added
    .filter(t => !t.pending && t.amount > 0)
    .map(t => ({
      date: t.date,
      merchant: t.merchant_name || t.name,
      amount: t.amount
    }));

  res.status(200).json({ transactions });
}
