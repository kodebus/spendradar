import { kv } from '@vercel/kv';
import { requireAppSecret } from './_auth.js';

const STORE_KEY = 'spendradar:plaid_items';

export default async function handler(req, res) {
  if (!requireAppSecret(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const items = (await kv.get(STORE_KEY)) || {};
  const connections = Object.entries(items).map(([item_id, item]) => ({
    item_id,
    institution_name: item.institution_name,
    mask: item.mask
  }));

  res.status(200).json({ connections });
}
