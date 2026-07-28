# Spend Radar — Project Summary

## Background

This started as a way to track spending on the Capital One card David (away at university, not working) uses. His parents fund it via gas/expense money, and Capital One lets them set a monthly spending limit on his card but has no built-in reporting for it. The original ask: a daily/running report the parents could share with David so he can see what he's spent and what's left before the cycle resets on the 19th.

That grew into a full tool, and along the way it became clear this solves a problem beyond just this one card — so it's being spun out as **Spend Radar**, a standalone product on the Japps.ai portfolio, styled in a clean corporate/professional teal-and-navy palette (Space Grotesk headers, Inter body, IBM Plex Mono for numbers).

## What the app does

- Tracks transactions against a configurable **monthly spending limit** and **cycle reset day** (not hardcoded to the 19th — adjustable in settings)
- **Cardholder name** field makes it usable for anyone's authorized-user card, not just David's
- A circular "radar" gauge shows remaining balance, color-coded green → amber → red as the limit approaches
- Category breakdown (Gas, Food, Shopping, Entertainment, Other) with automatic category guessing
- **Copy report** button generates a plain-text spending summary ready to paste into a text or email

## Import methods (the hard part)

Four ways to get transactions in, since manual entry alone would be too much upkeep:

1. **Connect bank** — links directly to Capital One (or any Plaid-supported bank) via [Plaid](https://plaid.com). Click "Connect bank," authenticate through Plaid's own secure Link flow (Spend Radar never sees the bank password), and transactions sync automatically via Plaid's `/transactions/sync` endpoint. This is the only import method that needs the backend — see "Architecture" below.
2. **CSV upload** — standard bank export format (Date/Description/Debit-or-Amount columns, auto-detected)
3. **Paste transactions** — handles raw text copied straight from a bank's activity page. This took real iteration: the first version assumed line breaks between fields and failed silently when Capital One's actual copy-paste ran fields together with no separators. The fix uses a whitespace-agnostic approach — it finds date patterns (`Jul27`) and amount patterns (`...9044$18.31`) anywhere in the blob and pairs the nearest ones together, so it works regardless of how the browser formats the clipboard content.
4. **Paste a screenshot** — sends a pasted image to Claude's API directly from the browser (using the artifact's built-in ability to call `api.anthropic.com`), which reads the transaction rows out of the image and returns structured data. Useful when copy-paste isn't clean or available at all.

All four feed into the same review step before anything is added — new charges get added, anything already logged (matched on date + merchant + amount) is automatically skipped as a duplicate.

## Architecture

What started as a single static HTML file is now a static frontend plus a
minimal backend, since Plaid's secret keys and the bank access token can't
live in browser JS:

- **`index.html`** — the app UI, unchanged in spirit; still uses localStorage for settings/transactions
- **`api/`** — Vercel serverless functions: `create-link-token`, `exchange-public-token`, `sync-transactions`, `bank-status`, plus a shared `_auth.js` helper
- **Vercel KV (Upstash Redis)** — holds the Plaid access token + sync cursor server-side (never in the browser)
- **App password** — a shared secret (`APP_SECRET` env var, entered in Settings) gates the `/api` routes, since this now runs at a public URL that could otherwise let anyone trigger a sync of the family's real bank data
- Deploys as a single Vercel project (static + functions from one domain, avoiding CORS) — see **`BANK_SETUP.md`** for the full setup walkthrough (Plaid signup, Vercel KV, env vars, sandbox → production)

CSV/paste/screenshot import still work exactly as before and don't touch the backend at all.

## Files delivered (ready to drop into the `JAPPS_AI/spend-radar/` folder)

- **`index.html`** — the full app
- **`api/`** — backend functions for the bank-connect feature
- **`privacy.html`** — updated to cover the Plaid bank-connect flow and the app-password model, alongside the original in-browser-storage / Anthropic-screenshot disclosures
- **`portfolio_card_snippet.html`** — the card markup to paste into `japps.ai`'s portfolio section, near the existing `<!-- Grab It -->` comment
- **`BANK_SETUP.md`** — step-by-step Plaid + Vercel KV + env var setup
- **`.env.example`** — documents the required environment variables
- **`package.json`** — the one dependency (`@vercel/kv`) needed by the backend

## Still outstanding

- **Deploy to Vercel** (not GitHub Pages anymore — needs to run the `/api` functions); Plaid dashboard signup, Vercel KV attach, and env vars are all manual steps only the account owner can do — see `BANK_SETUP.md`
- **Plaid Production access** — currently wired for Sandbox (fake test data); real Capital One data needs Plaid's one-time production approval, requested separately by the user
- **Live URL + GitHub link** — currently omitted from the portfolio card (no dead links); add both once the site is live and/or a public repo exists
- **Capital One outreach** — separate thread: reaching out to Capital One about the lack of a built-in feature like this for authorized-user spending visibility. Concluded that direct payment for the idea is unlikely (unsolicited feedback typically isn't compensated, and submission forms often include language that signs away any claim), but standing this up as your own product is the more durable path to credit/value regardless of what Capital One does with the suggestion.

## Notes on style/identity

Deliberately moved away from the initial dark-navy dashboard look (which fit "David's Card" specifically) toward a distinct clean/professional palette for the standalone product: `#F6F8FB` background, `#1F6F6B` teal primary, `#16233D` ink text — avoiding the generic AI-generated defaults (cream+terracotta, near-black+neon, broadsheet).
