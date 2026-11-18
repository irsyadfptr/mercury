# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + React + TypeScript, Tailwind + shadcn/ui, lightweight-charts (price charts), Recharts (allocation charts), Zustand `persist` (localStorage), Zod (import validation), Vitest (calculation tests). Chosen over Next.js because a static export can't keep API routes: locally the Vite dev server runs the idx CLI; the deployed build is plain static files.

## Users

One person for now: an Indonesian retail investor and swing trader, managing funds (Bibit), IDX stocks (Stockbit) and crypto (Binance) on a laptop. Later, public users who bring their own API keys (BYOK).

## Product Purpose

One place to see the whole portfolio in IDR, find and check swing setups held 3–6 months, size positions by risk, and keep a journal. Success: every entry and exit decision is checked against written rules and a risk limit before money moves.

## Positioning

Code calculates every number (prices, indicators, scores, risk). The AI reads those numbers and gives its opinion and recommendation, labelled as opinion, never new figures. Mixes IDX stocks, crypto and Indonesian funds/gold in one view, with IDX rules (ARA/ARB, lots) built in.

## Operating Context

- Used on a laptop, both daytime (market hours) and evenings (after IDX close, 16:00 WIB). Follows the OS light/dark setting.
- v1 is manual entry. Prices from idx CLI (local only) and CoinGecko Demo API (BYOK). AI summaries from the DeepSeek API (BYOK).
- Data lives in the browser (localStorage) with JSON export/import.

## Capabilities and Constraints

- Pages: Dashboard, Portfolio (Investing / Trading groups), Scanner, Ticker check, Journal. See NOTES.md for build order.
- UI text in English and Bahasa Indonesia, switchable, from day one.
- Undecided: US stocks/ETF data source.

## Evidence on Hand

No real portfolio data in the repo. Demo data must be labelled as sample data.

## Product Principles

1. Numbers come from code, never from AI. AI opinions are labelled as opinions.
2. Risk before reward: show stop, position size and portfolio heat before upside.
3. Paper trading is the default for anything new.
4. The user owns their data: local storage, export anytime, no account.

## Accessibility & Inclusion

Up/down is never shown by colour alone (sign and arrow too). Respect `prefers-reduced-motion` and `prefers-reduced-transparency`. Keyboard reachable throughout.
