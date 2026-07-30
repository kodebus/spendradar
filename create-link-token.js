const { plaidClient } = require('./_plaid');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'spend-radar-single-user' },
      client_name: 'Spend Radar',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
    });
    res.status(200).json({ link_token: response.data.link_token });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create link token' });
  }
};
