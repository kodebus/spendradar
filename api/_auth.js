import { kv } from '@vercel/kv';

const ACCESS_KEYS_STORE = 'spendradar:access_keys';

// Resolves whichever secret was sent in the request:
//  - the master APP_SECRET (env var) → full, unrestricted access
//  - a stored restricted key → access scoped to specific account masks only
//  - anything else → not authorized
// Returns { ok: false } or { ok: true, scope: null | { label, allowedMasks } }.
export async function checkAccess(req) {
  const provided = req.headers['x-app-secret'];
  if (!provided) return { ok: false };

  const master = process.env.APP_SECRET;
  if (master && provided === master) {
    return { ok: true, scope: null }; // null scope = full access
  }

  const keys = (await kv.get(ACCESS_KEYS_STORE)) || {};
  const entry = keys[provided];
  if (entry) return { ok: true, scope: entry };

  return { ok: false };
}

// Use in routes that any authorized key (master or restricted) may call.
// Returns `false` if unauthorized (401 already sent) — check for that exact
// value, since a valid master key legitimately resolves to `null`.
export async function requireAccess(req, res) {
  const result = await checkAccess(req);
  if (!result.ok) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return result.scope;
}

// Use in routes that only the master (full-access) key may call — managing
// bank connections themselves, not just viewing transactions.
export async function requireFullAccess(req, res) {
  const scope = await requireAccess(req, res);
  if (scope === false) return false;
  if (scope !== null) {
    res.status(403).json({ error: 'This action requires full access' });
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
