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
      // Master can save the full shared state — but NOT as a blind
      // overwrite anymore. A device with stale/empty local transactions
      // (e.g. one that's never actually synced) triggers a routine
      // autosave just by opening Settings and clicking Save, which used
      // to blow away every other device's real transaction history with
      // nothing. That exact scenario happened and lost 254 real
      // transactions before this fix.
      //
      // Guard: if this save's transactions are drastically smaller than
      // what's already stored (and there was meaningfully more than a
      // handful stored — normal single/few-transaction deletes are still
      // allowed through untouched), treat it as a likely accidental wipe
      // rather than an intentional edit, UNLESS the client explicitly
      // marks it as a confirmed reset (only "Reset everything" in
      // Settings does this, after the user has already confirmed a
      // destructive-action prompt).
      const existingTxCount = (stored.transactions || []).length;
      const incomingTxCount = Array.isArray(body.transactions) ? body.transactions.length : 0;
      const looksLikeAccidentalWipe =
        existingTxCount > 5 &&
        incomingTxCount < existingTxCount * 0.5 &&
        !body.confirmReset;

      if (looksLikeAccidentalWipe) {
        // Apply every OTHER field from this save normally (cycle day, app
        // secret, card nicknames, bank connections, etc.) — just don't let
        // the transactions field itself overwrite with something that
        // looks like accidental data loss.
        const safe = { ...stored, ...body, transactions: stored.transactions || [] };
        await kv.set(STORE_KEY, safe);
        return res.status(200).json({
          saved: true,
          transactionsProtected: true,
          existingTxCount,
          incomingTxCount
        });
      }

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
