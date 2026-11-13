# Mercury — Project Notes

Personal AI-assisted app for investing and swing trading. Started 2026-11-09.

## Decisions so far

- **Users:** personal use, laptop only, runs on localhost. Later: a public deploy without a backend, where each user brings their own API keys (BYOK).
- **Trading style:** swing / position trades held **3–6 months**. Not day trading.
- **AI:** built into the app through the API (BYOK), not as Claude skills.
- **Rule:** code calculates every number (prices, indicators, scores, risk). AI only reads, summarises and explains. No AI-made "buy %".
- **Storage:** browser localStorage, with JSON export/import from day one. Each deployed user's data stays in their own browser.
- **Current platforms:** Bibit (funds), Stockbit (IDX stocks), Binance (crypto). v1 = manual entry. Imports can come later.

## Asset classes

| Asset | Data | Used in |
|---|---|---|
| IDX stocks | idx CLI (github.com/fzn0x/idx), local only | Portfolio, scanner, ticker check |
| Crypto | CoinGecko Demo API (free, key required, 100 calls/min, 10k calls/month) | Portfolio, scanner, ticker check |
| US stocks / ETF | TBD (not idx) | Later |
| Money market funds (RDPU) | Manual input only | Portfolio, dashboard |
| Bond funds | Manual input only | Portfolio, dashboard |
| Physical gold | Manual input only (Antam price skipped for now) | Portfolio, dashboard |

## Pages

1. **Dashboard:** net worth (IDR), allocation, daily change, alerts, market mood.
2. **Portfolio:** two groups.
   - *Investing* (funds, gold, long-term holdings): allocation, return vs inflation/BI rate.
   - *Trading* (swing positions): stops, portfolio heat (only positions with a stop), position size.
   - Liquidity tiers: instant (crypto), 1–2 days (stocks, money market funds), days (bond funds), slow and costly (gold).
3. **Scanner, signals and market sentiment.**
4. **Ticker check** (stocks, crypto): technicals, fundamentals, sentiment, risk, checklist score (e.g. 4/5) + the setup's past win rate from a backtest. AI explains.
5. **Journal:** quick notes, linked to trades. Paper (simulated) trades flagged as such.

## Signal rules (from the Pine script, adjusted for 3–6 month holds)

- Trend: weekly trend up, daily MA50 > MA200, close > MA50.
- Trigger: MACD cross (consider weekly MACD for fewer, slower signals).
- Stop: below the 20-bar low or 2–3× ATR. Target: 2–3R (the reward as a multiple of the amount risked).
- Time stop: exit if no progress after ~8 weeks.
- Check before entering: ex-dividend dates, earnings, rights issues, IDX price limits (ARB/ARA), liquidity.

## Market mood (fear & greed)

- **Crypto:** CoinGecko `GET /global` returns `fear_and_greed_index` {value, sentiment}. Alternative: api.alternative.me/fng/ (Bitcoin only, attribution required).
- **US:** CNN's index has no official API. Build our own from VIX + S&P 500 vs its MA200.
- **IDX:** no index exists. Build our own 0–100 score with visible components:
  - % of LQ45 stocks above MA50
  - IHSG vs MA50/MA200
  - foreign net flow over 5 and 20 days
  - IHSG volatility vs its average

## Infrastructure (free)

- **Stack:** Vite + React + TypeScript (decided 2026-11-13; replaces Next.js, whose static export can't keep API routes). See PRODUCT.md and DESIGN.md.
- **Local:** the Vite dev server on the laptop is the backend; a small Vite plugin calls the idx CLI. Cost: free.
- **Deploy (no backend):** `vite build` static files to Vercel Hobby, Cloudflare Pages, Netlify or GitHub Pages (all free).
  - IDX and Yahoo features are local-only, because the deployed site can't run idx and Yahoo blocks browser calls. A free Cloudflare Worker could proxy them later.
  - Browser calls to CoinGecko work with the user's own Demo key (BYOK).
  - Browser calls to the Claude API need the header `anthropic-dangerous-direct-browser-access: true`.

## Build order

1. Portfolio + dashboard, manual entry for every asset, localStorage + export/import.
2. Crypto prices + crypto fear & greed (CoinGecko; works when deployed too).
3. IDX ticker check + scanner (idx, local).
4. Journal + paper trades.
5. AI layer (BYOK): sentiment summaries, signal explanations, portfolio review.
6. US stocks / ETFs.
7. Alerts + scheduled after-close run.

## Reference: jakeschincariol/day-trader-skill (MIT)

US-only **day trading** skill pack in plain Python (Yahoo, Nasdaq symbol lists, SEC). It isn't usable directly: it's built for US market hours, 5-minute bars and same-day exits, with no IDX or crypto support. Ideas worth borrowing:
- **"Time machine":** replays the stock's own past price moves 10,000 times to estimate how often the stop or target gets hit first. Adapt it to daily bars over 3–6 months.
- **Risk-check step:** a trade must pass a risk check before it's allowed.
- **Position sizing from a maximum loss per trade.**
- **Paper trading as the default.**

## IDX price limits (ARA/ARB), Oct 20 – Dec 31, 2026

Source: IDX press release 2734 (https://www.idx.co.id/en/news/press-release/2734), as provided by the user.

| Price | ARA (max rise/day) | ARB (max fall/day) |
|---|---|---|
| Rp1 – Rp10 | Rp1 | Rp1 |
| Rp11 – Rp14 | 35% | Rp1 |
| Rp15 – Rp200 | 35% | 7% |
| >Rp200 – Rp5,000 | 25% | 7% |
| >Rp5,000 | 20% | 7% |

- These rules are time-limited. Keep them in one config file with a valid-until date, not scattered through the code.
- **ARB check is deferred for now.** Later use: warn when a stop-loss sits more than one ARB below the price. A stock that hits ARB may not be sellable that day.

## Resolved

- **CoinGecko from the browser:** works with the user's own Demo key (confirmed by the user's earlier crypto portfolio project).
- **idx scope:** idx is used only for IDX stocks. US stocks/ETFs need another data source (TBD).

## Open questions

- Data source for US stocks/ETFs.
- Are idx's price histories adjusted for splits and dividends?
- UMA notices and tick sizes (fraksi harga): does idx have them, or do we hardcode them like ARA/ARB?
