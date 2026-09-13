import { kv } from '@vercel/kv';
import { requireFullAccess } from './_auth.js';

const ACCESS_KEYS_STORE = 'spendradar:access_keys';

function randomKey() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `sr-${out}`;
}

export default async function handler(req, res) {
  // Only the master (full-access) key may create, list, or revoke restricted
  // keys — a restricted key must never be able to grant itself more access
  // or see who else has a key.
  const ok = await requireFullAccess(req, res);
  if (!ok) return;

  const keys = (await kv.get(ACCESS_KEYS_STORE)) || {};

  if (req.method === 'GET') {
    const list = Object.entries(keys).map(([secret, entry]) => ({
      secret,
      label: entry.label,
      allowedMasks: entry.allowedMasks || []
    }));
    return res.status(200).json({ keys: list });
  }

  if (req.method === 'POST') {
    const { label, allowedMasks } = req.body || {};
    if (!label || !Array.isArray(allowedMasks) || !allowedMasks.length) {
      return res.status(400).json({ error: 'label and at least one allowedMask are required' });
    }
    const secret = randomKey();
    keys[secret] = { label, allowedMasks };
    await kv.set(ACCESS_KEYS_STORE, keys);
    return res.status(200).json({ secret, label, allowedMasks });
  }

  if (req.method === 'DELETE') {
    const { secret } = req.body || {};
    if (!secret) return res.status(400).json({ error: 'Missing secret' });
    delete keys[secret];
    await kv.set(ACCESS_KEYS_STORE, keys);
    return res.status(200).json({ revoked: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
