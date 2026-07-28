# Connecting Spend Radar to a real bank

Spend Radar can now pull transactions directly from Capital One (or any bank
Plaid supports) instead of CSV/paste/screenshot. This requires a small backend
(can't hold API secrets in a browser), so the app now deploys to **Vercel**
instead of GitHub Pages — Vercel serves the static `index.html` and the
`/api` functions from the same URL, so there's no separate backend host to
manage.

## One-time setup

1. **Push this repo to GitHub** (if not already), then go to
   [vercel.com/new](https://vercel.com/new) and import it. Framework preset:
   "Other" — no build step needed.

2. **Add a KV store** (used to hold your bank's access token server-side, so
   it never touches the browser). In the Vercel project → **Storage** tab →
   **Create Database** → **Upstash for Redis** (KV). Connect it to this
   project — Vercel auto-injects `KV_REST_API_URL` / `KV_REST_API_TOKEN`.

3. **Create a free Plaid developer account** at
   [dashboard.plaid.com/signup](https://dashboard.plaid.com/signup). Once in,
   go to **Team Settings → Keys** and copy your `client_id` and the
   **Sandbox** `secret`.

4. In the Vercel project → **Settings → Environment Variables**, add:
   - `PLAID_CLIENT_ID` — from step 3
   - `PLAID_SECRET` — the Sandbox secret from step 3
   - `PLAID_ENV` — `sandbox`
   - `APP_SECRET` — any password you make up (protects the API — see below)

5. Redeploy (Vercel does this automatically after env vars change, or trigger
   one manually).

6. Open the deployed site → **Settings** → enter the same value you used for
   `APP_SECRET` into the **App password** field → Save.

7. Click **Connect bank**. In Sandbox mode Plaid shows you a list of fake test
   institutions — search "Capital One" (Plaid simulates it) and log in with
   the test credentials `user_good` / `pass_good`. You'll see fake transactions
   flow into the review screen exactly like the CSV/paste import does today.

## Why "App password"?

Once this is live at a public URL, the `/api` routes can reach your real bank
data. Without a check, anyone who finds the URL could trigger a sync and read
your transactions. The App password is a shared secret only you (and whoever
you tell) know — the frontend sends it on every API call, and the backend
rejects requests that don't match `APP_SECRET`. Simple by design, since this
is a single-family tool, not a multi-user product.

## Going live with real Capital One data

Sandbox only returns fake test data. To pull your actual card:

1. In the Plaid dashboard, request **Production access** (a short form asking
   what you're building — "personal/family spend tracking" is a normal,
   commonly-approved use case). This is a manual review on Plaid's side and
   can take a few days.
2. Once approved, copy your **Production** `secret` from the same Keys page.
3. In Vercel, update `PLAID_SECRET` to the production secret and set
   `PLAID_ENV=production`.
4. Redeploy, then click **Connect bank** again and log in with your real
   Capital One credentials through Plaid's secure Link flow (Spend Radar
   itself never sees or stores your bank password — Plaid handles that
   handshake directly).

## Cost note

Plaid's Sandbox/Development use is free. Production has a per-connected-item
cost once you're outside their free tier allotment — check
[plaid.com/pricing](https://plaid.com/pricing) before connecting a real
account long-term, since pricing/tiers change over time.
