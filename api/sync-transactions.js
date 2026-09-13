import { kv } from '@vercel/kv';
import { requireAccess, plaidBaseUrl, plaidCredentials } from './_auth.js';

const STORE_KEY = 'spendradar:plaid_items';

export default async function handler(req, res) {
  const scope = await requireAccess(req, res);
  if (scope === false) return;
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

    // CONFIRMED (2026-09-12): /transactions/sync's own "added" payload does
    // NOT reliably include account_owner for this Capital One item, even
    // though /transactions/get DOES return it for the exact same
    // transactions. Two different Plaid endpoints, two different behaviors
    // for the same underlying data. Rather than switch off /sync (and lose
    // its efficient cursor-based incremental behavior), backfill
    // account_owner with one bounded /transactions/get call scoped only to
    // the date range of transactions we just got from /sync.
    let ownerByTxId = {};
    if (added.length) {
      const dates = added.map(t => t.date).sort();
      const start_date = dates[0];
      const end_date = dates[dates.length - 1];
      try {
        const getResp = await fetch(`${plaidBaseUrl()}/transactions/get`, {
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
        const getData = await getResp.json();
        if (getResp.ok) {
          (getData.transactions || []).forEach(t => {
            if (t.account_owner) ownerByTxId[t.transaction_id] = t.account_owner;
          });
        } else {
          console.error('transactions/get backfill call failed:', getData);
        }
      } catch (err) {
        console.error('transactions/get backfill for account_owner failed:', err);
      }
    }

    // Amount sign alone isn't a reliable enough signal to separate real purchases
    // from bill payments/transfers, so also exclude by Plaid's own categorization.
    const EXCLUDED_PFC = ['LOAN_PAYMENTS', 'TRANSFER_IN', 'TRANSFER_OUT', 'INCOME', 'BANK_FEES'];
    const isRealPurchase = (t) => {
      const pfc = t.personal_finance_category?.primary;
      if (pfc && EXCLUDED_PFC.includes(pfc)) return false;
      const legacyCat = Array.isArray(t.category) ? t.category.join(' ').toLowerCase() : '';
      if (legacyCat.includes('payment') || legacyCat.includes('transfer')) return false;
      return true;
    };

    // One Item can have several accounts under it (e.g. multiple cards on one
    // Capital One login) — look up each transaction's specific account so the
    // source label can say which card, not just which bank.
    const accountMap = {};
    (item.accounts || []).forEach(a => { accountMap[a.account_id] = a; });

    // Prefer, in order: the /transactions/get backfill (most reliable for
    // this institution), then whatever /sync itself supplied (in case a
    // future Plaid update starts including it there too), then finally the
    // shared account-level mask as a last resort.
    const cardIdFor = (t) => ownerByTxId[t.transaction_id] || t.account_owner || accountMap[t.account_id]?.mask || '';

    const sourceLabelFor = (t) => {
      const cardId = cardIdFor(t);
      if (cardId) return `${item.institution_name} •••• ${cardId}`;
      return item.institution_name;
    };

    // Plaid already knows the real category for each transaction — use it
    // instead of guessing from the merchant name, which is much less accurate.
    const categoryFor = (t) => {
      const primary = t.personal_finance_category?.primary;
      const detailed = t.personal_finance_category?.detailed;
      if (detailed === 'TRANSPORTATION_GAS') return 'Gas';
      if (primary === 'FOOD_AND_DRINK') return 'Food';
      if (primary === 'GENERAL_MERCHANDISE') return 'Shopping';
      if (primary === 'ENTERTAINMENT') return 'Entertainment';
      return null; // no confident match — let the frontend fall back to its own guess
    };

    const tagged = added
      .filter(t => !t.pending && t.amount > 0)
      .filter(isRealPurchase)
      .map(t => ({
        date: t.authorized_date || t.date,
        merchant: t.merchant_name || t.name,
        amount: t.amount,
        category: categoryFor(t),
        source: sourceLabelFor(t),
        // account_mask is now the real per-card identifier (account_owner,
        // backfilled via /transactions/get when needed) when Plaid supplies
        // it, not just the shared parent account mask. This is the field
        // app-state.js and access-keys.js filter restricted keys on.
        account_mask: cardIdFor(t)
      }));
    allTransactions = allTransactions.concat(tagged);
  }

  await kv.set(STORE_KEY, items);

  // A restricted key only ever sees transactions from the specific card(s)
  // it's scoped to — this is enforced here, not just hidden in the UI.
  if (scope && scope.allowedMasks) {
    allTransactions = allTransactions.filter(t => scope.allowedMasks.includes(t.account_mask));
  }

  res.status(200).json({ transactions: allTransactions });
}
