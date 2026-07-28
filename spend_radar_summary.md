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

Three ways to get transactions in, since manual entry alone would be too much upkeep:

1. **CSV upload** — standard bank export format (Date/Description/Debit-or-Amount columns, auto-detected)
2. **Paste transactions** — handles raw text copied straight from a bank's activity page. This took real iteration: the first version assumed line breaks between fields and failed silently when Capital One's actual copy-paste ran fields together with no separators. The fix uses a whitespace-agnostic approach — it finds date patterns (`Jul27`) and amount patterns (`...9044$18.31`) anywhere in the blob and pairs the nearest ones together, so it works regardless of how the browser formats the clipboard content.
3. **Paste a screenshot** — sends a pasted image to Claude's API directly from the browser (using the artifact's built-in ability to call `api.anthropic.com`), which reads the transaction rows out of the image and returns structured data. Useful when copy-paste isn't clean or available at all.

All three feed into the same review step before anything is added — new charges get added, anything already logged (matched on date + merchant + amount) is automatically skipped as a duplicate.

## Files delivered (ready to drop into the `JAPPS_AI/spend-radar/` folder)

- **`index.html`** — the full app
- **`privacy.html`** — filled-in privacy policy (accurate to what the app actually does: everything stored in-browser, only the screenshot feature calls out to Anthropic's API)
- **`portfolio_card_snippet.html`** — the card markup to paste into `japps.ai`'s portfolio section, near the existing `<!-- Grab It -->` comment

## Still outstanding

- **Deploy** — push to GitHub Pages the way other Japps.ai projects are set up
- **Live URL + GitHub link** — currently omitted from the portfolio card (no dead links); add both once the site is live and/or a public repo exists
- **Capital One outreach** — separate thread: reaching out to Capital One about the lack of a built-in feature like this for authorized-user spending visibility. Concluded that direct payment for the idea is unlikely (unsolicited feedback typically isn't compensated, and submission forms often include language that signs away any claim), but standing this up as your own product is the more durable path to credit/value regardless of what Capital One does with the suggestion.

## Notes on style/identity

Deliberately moved away from the initial dark-navy dashboard look (which fit "David's Card" specifically) toward a distinct clean/professional palette for the standalone product: `#F6F8FB` background, `#1F6F6B` teal primary, `#16233D` ink text — avoiding the generic AI-generated defaults (cream+terracotta, near-black+neon, broadsheet).
