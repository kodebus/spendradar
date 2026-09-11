import { kv } from '@vercel/kv';
import { requireAccess } from './_auth.js';

const STORE_KEY = 'spendradar:plaid_items';

export default async function handler(req, res) {
  const scope = await requireAccess(req, res);
  if (scope === false) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const items = (await kv.get(STORE_KEY)) || {};

  if (scope === null) {
    // Master sees every connected bank, including each individual account
    // under it, so a specific card can be picked when creating a restricted key.
    const connections = Object.entries(items).map(([item_id, item]) => ({
      item_id,
      institution_name: item.institution_name,
      mask: item.mask,
      accounts: item.accounts || []
    }));
    return res.status(200).json({ connections, restricted: false });
  }

  // Restricted keys don't manage connections at all — nothing to show here,
  // even which banks exist. The app treats this as "no connections to display".
  res.status(200).json({ connections: [], restricted: true, allowedMasks: scope.allowedMasks, label: scope.label });
}
