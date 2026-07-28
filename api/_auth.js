export function requireAppSecret(req, res) {
  const expected = process.env.APP_SECRET;
  const provided = req.headers['x-app-secret'];
  if (!expected || provided !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export function plaidBaseUrl() {
  const env = process.env.PLAID_ENV || 'sandbox';
  return `https://${env}.plaid.com`;
}

export function plaidCredentials() {
  return {
    client_id: process.env.PLAID_CLIENT_ID,
    secret: process.env.PLAID_SECRET
  };
}
