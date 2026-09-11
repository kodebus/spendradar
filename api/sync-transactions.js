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

    // --- TEMP DIAGNOSTIC: check whether this institution populates account_owner ---
    // Plaid's docs say account_owner is "not typically populated" and, when it
    // is, its format is institution-specific — this checks what Capital One
    // (or whichever bank this item is) actually sends back. Safe to leave in
    // short-term; remove once we know the answer, since it's noisy in prod logs.
    console.log(`[DIAGNOSTIC] item ${itemId} (${item.institution_name}) — accounts:`,
      (item.accounts || []).map(a => ({ account_id: a.account_id, mask: a.mask, name: a.name }))
    );
    console.log(`[DIAGNOSTIC] item ${itemId} — sample account_owner values:`,
      added.slice(0, 10).map(t => ({
        account_id: t.account_id,
        account_owner: t.account_owner,
        merchant_name: t.merchant_name || t.name,
        amount: t.amount,
        date: t.date
      }))
    );
    // --- END TEMP DIAGNOSTIC ---

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
    const sourceLabelFor = (t) => {
      const acct = accountMap[t.account_id];
      if (acct && acct.mask) return `${item.institution_name} •••• ${acct.mask}`;
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
        account_mask: accountMap[t.account_id]?.mask || '',
        // --- TEMP DIAGNOSTIC: carry this through to the response too, so you can
        // see it in the browser network tab / app UI without digging through
        // Vercel logs. Remove this field once the account_owner question is settled.
        _diagnostic_account_owner: t.account_owner || null
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
