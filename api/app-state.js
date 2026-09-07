import { kv } from '@vercel/kv';
import { requireAppSecret } from './_auth.js';

const STORE_KEY = 'spendradar:app_state';

export default async function handler(req, res) {
  if (!requireAppSecret(req, res)) return;

  if (req.method === 'GET') {
    const state = await kv.get(STORE_KEY);
    return res.status(200).json({ state: state || null });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    await kv.set(STORE_KEY, body);
    return res.status(200).json({ saved: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
