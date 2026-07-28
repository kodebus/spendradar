import { requireAppSecret, plaidBaseUrl, plaidCredentials } from './_auth.js';

export default async function handler(req, res) {
  if (!requireAppSecret(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const response = await fetch(`${plaidBaseUrl()}/link/token/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...plaidCredentials(),
      client_name: 'Spend Radar',
      user: { client_user_id: 'spend-radar-single-user' },
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en'
    })
  });

  const data = await response.json();
  if (!response.ok) return res.status(response.status).json(data);
  res.status(200).json({ link_token: data.link_token });
}
