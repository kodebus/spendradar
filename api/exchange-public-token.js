import { kv } from '@vercel/kv';
import { requireAppSecret, plaidBaseUrl, plaidCredentials } from './_auth.js';

const STORE_KEY = 'spendradar:plaid_items';

export default async function handler(req, res) {
  if (!requireAppSecret(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { public_token, institution_name, institution_id, mask } = req.body || {};
  if (!public_token) return res.status(400).json({ error: 'Missing public_token' });

  const response = await fetch(`${plaidBaseUrl()}/item/public_token/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...plaidCredentials(), public_token })
  });
  const data = await response.json();
  if (!response.ok) return res.status(response.status).json(data);

  // A single Item can have several accounts under it (e.g. multiple cards on
  // one Capital One login) — fetch them all so transactions can be tagged
  // with exactly which account/card they came from, not just the bank.
  let accounts = [];
  try {
    const acctResponse = await fetch(`${plaidBaseUrl()}/accounts/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...plaidCredentials(), access_token: data.access_token })
    });
    const acctData = await acctResponse.json();
    if (acctResponse.ok) {
      accounts = (acctData.accounts || []).map(a => ({
        account_id: a.account_id,
        name: a.official_name || a.name || '',
        mask: a.mask || ''
      }));
    }
  } catch (err) {
    console.error('Failed to fetch accounts for this item:', err);
  }

  // Multiple banks are stored keyed by item_id. Plaid issues a brand-new
  // item_id every time Link runs, even when relinking the exact same
  // institution, so we dedupe on institution_id (or name, as a fallback)
  // and remove any prior connection to that same bank before adding this one.
  const items = (await kv.get(STORE_KEY)) || {};

  for (const [oldItemId, oldItem] of Object.entries(items)) {
    const idMatch = institution_id && oldItem.institution_id && oldItem.institution_id === institution_id;
    const nameMatch = institution_name && oldItem.institution_name && oldItem.institution_name === institution_name;
    const sameInstitution = idMatch || nameMatch;
    if (sameInstitution) {
      try {
        await fetch(`${plaidBaseUrl()}/item/remove`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...plaidCredentials(), access_token: oldItem.access_token })
        });
      } catch (err) {
        console.error('Plaid item/remove failed while replacing old connection:', err);
      }
      delete items[oldItemId];
    }
  }

  items[data.item_id] = {
    access_token: data.access_token,
    institution_name: institution_name || 'Bank',
    institution_id: institution_id || '',
    mask: mask || '',
    accounts: accounts,
    cursor: null
  };
  await kv.set(STORE_KEY, items);

  res.status(200).json({ connected: true, item_id: data.item_id });
}
