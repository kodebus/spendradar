const { plaidClient } = require('./_plaid');
const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const access_token = await kv.get('plaid_access_token');
    if (!access_token) return res.status(400).json({ error: 'No linked account yet' });

    let cursor = (await kv.get('plaid_cursor')) || undefined;
    let added = [];
    let hasMore = true;

    while (hasMore) {
      const response = await plaidClient.transactionsSync({ access_token, cursor });
      added = added.concat(response.data.added);
      hasMore = response.data.has_more;
      cursor = response.data.next_cursor;
    }

    await kv.set('plaid_cursor', cursor);

    const transactions = added
      .filter(t => !t.pending && t.amount > 0) // Plaid uses positive amounts for outflows
      .map(t => ({
        date: t.date,
        merchant: t.merchant_name || t.name,
        amount: t.amount,
        account_id: t.account_id,
      }));

    res.status(200).json({ transactions });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to sync transactions' });
  }
};
