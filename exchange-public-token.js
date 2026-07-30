const { plaidClient } = require('./_plaid');
const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { public_token } = req.body || {};
  if (!public_token) return res.status(400).json({ error: 'Missing public_token' });

  try {
    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = response.data;

    // The access token is a live credential — it is stored server-side only,
    // and is never sent back to the browser.
    await kv.set('plaid_access_token', access_token);
    await kv.set('plaid_item_id', item_id);
    await kv.del('plaid_cursor'); // reset sync cursor for a fresh Item

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
};
