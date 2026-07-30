# Spend Radar — Vercel + Plaid setup

This folder is both the static app (`index.html`, `privacy.html`) and a small
serverless backend (`/api`) that handles the optional "Connect bank" feature.

## 1. Deploy to Vercel

1. Push this folder (with `package.json` and `/api`) to your GitHub repo.
2. In Vercel, "Import Project" and point it at this folder/repo.
3. Vercel auto-detects the `/api/*.js` files as serverless functions and
   serves `index.html` as a static page — no framework config needed.

## 2. Add a KV store (for storing the Plaid access token)

1. In your Vercel project → **Storage** tab → **Create Database** → choose the
   Redis/KV option (Upstash-backed).
2. Connect it to this project. Vercel will automatically add the
   `KV_REST_API_URL` and `KV_REST_API_TOKEN` environment variables for you —
   no manual copying needed.

## 3. Add your Plaid keys

In Vercel → Project Settings → Environment Variables, add:

- `PLAID_CLIENT_ID` — from the Plaid dashboard
- `PLAID_SECRET` — start with the **Sandbox** secret to test end-to-end with
  fake data first
- `PLAID_ENV` — set to `sandbox` while testing, and switch to `production`
  once you're on the Trial plan and ready to link the real Capital One account

Redeploy after adding/changing environment variables.

## 4. Test with Sandbox first

With `PLAID_ENV=sandbox`, clicking "Connect bank" in the app opens Plaid Link
in test mode. Use Plaid's test credentials (username `user_good`,
password `pass_good`) to simulate linking an account and pulling fake
transactions — this proves the whole flow works before any real bank data
is involved.

## 5. Switch to real data

Once Sandbox testing works:

1. Click **"Try for free"** in the Plaid dashboard to request Trial plan
   access (free, up to 10 linked accounts, works with real bank data).
2. Once approved, update `PLAID_SECRET` to your Trial/Production secret and
   set `PLAID_ENV=production` in Vercel.
3. Redeploy, then click "Connect bank" again and log in with the parents'
   real Capital One credentials on Plaid's screen.

## Notes

- The Plaid access token is stored server-side (in the KV store), never in
  the browser — this is required since it's a live credential.
- `/api/transactions.js` uses Plaid's `transactionsSync` endpoint with a
  stored cursor, so each sync only pulls what's new since last time.
- Since this links your parents' whole Capital One account, Plaid will
  return all transactions on that account, not just David's card. If
  Capital One exposes David's authorized-user card as a distinct
  `account_id`, you may want to filter `transactions.js` to that one
  account ID once you can see what Plaid returns for the real account.
