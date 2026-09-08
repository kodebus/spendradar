import { kv } from '@vercel/kv';
import { requireAppSecret, plaidBaseUrl, plaidCredentials } from './_auth.js';

const STORE_KEY = 'spendradar:plaid_items';

export default async function handler(req, res) {
  if (!requireAppSecret(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const items = (await kv.get(STORE_KEY)) || {};
  const itemIds = Object.keys(items);
  if (!itemIds.length) {
    return res.status(400).json({ error: 'No bank account connected yet' });
  }

  let allTransactions = [];

  // Sync every connected bank in turn, tagging each transaction with that
  // bank's institution name so the source is accurate per-item.
  for (const itemId of itemIds) {
    const item = items[itemId];
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

    items[itemId] = { ...item, cursor };

    const tagged = added
      .filter(t => !t.pending && t.amount > 0)
      .map(t => ({
        date: t.date,
        merchant: t.merchant_name || t.name,
        amount: t.amount,
        source: item.institution_name
      }));
    allTransactions = allTransactions.concat(tagged);
  }

  await kv.set(STORE_KEY, items);
  res.status(200).json({ transactions: allTransactions });
}
