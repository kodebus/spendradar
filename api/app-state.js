import { kv } from '@vercel/kv';
import { requireAccess } from './_auth.js';

const STORE_KEY = 'spendradar:app_state';

export default async function handler(req, res) {
  const scope = await requireAccess(req, res);
  if (scope === false) return;

  const stored = (await kv.get(STORE_KEY)) || {};

  if (req.method === 'GET') {
    if (scope === null) {
      // Master (full access) sees everything, unchanged.
      return res.status(200).json({ state: stored });
    }

    // A restricted key only ever gets back transactions from its own
    // allowed card(s). Anything without a known account_mask (manual CSV/
    // paste imports, for example) can't be safely attributed, so it's left
    // out of restricted views entirely rather than risk exposing it.
    const allTx = stored.transactions || [];
    const filteredTx = allTx.filter(t => t.account_mask && scope.allowedMasks.includes(t.account_mask));
    return res.status(200).json({
      state: {
        cycleDay: stored.cycleDay ?? null,
        transactions: filteredTx,
        lastSyncedAt: stored.lastSyncedAt ?? null,
        manualMethod: null,
        bankConnections: [] // connection management stays master-only; nothing to show here
      }
    });
  }

  if (req.method === 'POST') {
    const body = req.body || {};

    if (scope === null) {
      // Master can save the full shared state, same as before.
      await kv.set(STORE_KEY, body);
      return res.status(200).json({ saved: true });
    }

    // A restricted key can only ever affect transactions tagged with its own
    // allowed mask(s) — never the master's settings, connections, or another
    // card's transactions. This is a scoped merge, not an overwrite.
    const existingTx = stored.transactions || [];
    const untouched = existingTx.filter(t => !(t.account_mask && scope.allowedMasks.includes(t.account_mask)));
    const incomingTx = Array.isArray(body.transactions) ? body.transactions : [];
    const ownIncoming = incomingTx.filter(t => t.account_mask && scope.allowedMasks.includes(t.account_mask));

    const merged = { ...stored, transactions: [...untouched, ...ownIncoming] };
    await kv.set(STORE_KEY, merged);
    return res.status(200).json({ saved: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
