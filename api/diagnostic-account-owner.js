import { kv } from '@vercel/kv';
import { requireFullAccess, plaidBaseUrl, plaidCredentials } from './_auth.js';

// TEMP DIAGNOSTIC ENDPOINT — read-only, does not touch the sync cursor or
// write anything to KV. Delete this file once the account_owner question
// (whether Capital One populates it) is settled.
//
// Usage: GET /api/diagnostic-account-owner  with header x-app-secret: <APP_SECRET>

const STORE_KEY = 'spendradar:plaid_items';

export default async function handler(req, res) {
  const ok = await requireFullAccess(req, res);
  if (!ok) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const items = (await kv.get(STORE_KEY)) || {};
  const results = {};

  const end_date = new Date().toISOString().slice(0, 10);
  const start = new Date();
  start.setDate(start.getDate() - 730); // Plaid's max history window
  const start_date = start.toISOString().slice(0, 10);

  for (const [itemId, item] of Object.entries(items)) {
    const response = await fetch(`${plaidBaseUrl()}/transactions/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...plaidCredentials(),
        access_token: item.access_token,
        start_date,
        end_date,
        options: { count: 500 }
      })
    });
    const data = await response.json();
    if (!response.ok) {
      results[itemId] = { institution_name: item.institution_name, error: data };
      continue;
    }

    const transactions = data.transactions || [];
    const distinctOwners = [...new Set(transactions.map(t => t.account_owner))];

    results[itemId] = {
      institution_name: item.institution_name,
      total_transactions: transactions.length,
      distinct_account_owner_values: distinctOwners,
      sample: transactions.slice(0, 10).map(t => ({
        account_id: t.account_id,
        account_owner: t.account_owner,
        merchant_name: t.merchant_name || t.name,
        amount: t.amount,
        date: t.date
      }))
    };
  }

  res.status(200).json(results);
}
