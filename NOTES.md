# Mercury — Project Notes

Personal AI-assisted app for investing and swing trading. Started 2026-11-09.

## Decisions so far

- **Users:** personal use, laptop only, runs on localhost. Later: a public deploy without a backend, where each user brings their own API keys (BYOK).
- **Trading style:** swing / position trades held **3–6 months**, plus **daily trades** (decided 2026-11-14, paper first), and long-term investing checked by fundamentals. Astrology is display only, never part of a score.
- **AI:** built into the app through the API (BYOK), not as Claude skills. Provider: **DeepSeek** (decided 2026-11-18; Claude Pro doesn't include API access).
- **Rule:** code calculates every number (prices, indicators, scores, risk); the AI never changes them. Since 2026-11-18 (user's decision) the AI acts as a master trader: it gives a call (buy, wait, hold, add, trim, cut, sell) and its own levels (buy zone, entry, stop, targets, size), with every number it works out marked "~", labelled as opinion and not licensed advice.
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
  - Browser calls to the DeepSeek API work (CORS preflight allows any origin with `authorization, content-type`, checked 2026-11-18).

## Build order

1. Portfolio + dashboard, manual entry for every asset, localStorage + export/import.
2. Crypto prices + crypto fear & greed (CoinGecko; works when deployed too).
3. IDX ticker check + scanner (idx, local).
4. Journal + paper trades.
5. AI layer (BYOK, DeepSeek): signal explanations and portfolio review (done 2026-11-18); sentiment summaries later.
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
- **idx price adjustment (2026-11-13, from the idx docs, not yet seen on a real run):** history comes from Yahoo Finance `v8/finance/chart`. Each candle has `open/high/low/close` plus `adj_close` ("when the source supplies split/dividend adjusted closes"). Yahoo's chart `close` is normally split-adjusted but not dividend-adjusted; `adj_close` is both. The scanner uses the plain OHLC, so it matches what Stockbit shows; dividend drops are not smoothed out.
- **UMA notices, tick sizes, ARA/ARB:** not in the idx docs. Hardcode them in config when needed.

## Rules test (pooled backtest), first results 2026-11-14

Scanner → Rules test replays every ticker in the list and pools all trades, for 5 setting variants. Buys at the next open, gaps sell at the open, no fees.

| Settings | LQ45 (5 y): trades · win · avg | Top 30 crypto (2.7 y): trades · win · avg |
|---|---|---|
| **Current:** stop ≤ 3× ATR, 2R, MACD cross | 193 · 33% · −0.13R | 77 · 23% · −0.35R |
| 3R target | 188 · 30% · −0.14R | 74 · 18% · −0.42R |
| Stop ≤ 2× ATR | 224 · 31% · −0.16R | 91 · 21% · −0.39R |
| No MACD rule | 446 · 37% · −0.06R | 159 · 23% · −0.34R |
| No MACD, 3R | 419 · 33% · −0.04R | 150 · 17% · −0.36R |

- **No variant made money in either market.** Treat scanner signals as watch / paper only until a variant tests above 0R.
- Caveats: LQ45 2021–2026 was mostly sideways to down; the LQ45 list is today's members (survivorship); crypto history is short; no fees.

Second round (same day): mood filter (skip signals on days the mood was Defensive, < 35, using the mood as it was that day) and a trailing stop (highest close − 3× ATR, no fixed target; 8-week time stop only without progress; max ~6 months).

| Settings | LQ45 | Top 30 crypto |
|---|---|---|
| Current, skip Defensive | 167 · 35% · −0.05R (worst run 7, was 12) | 74 · 23% · −0.35R |
| Current, trailing stop | 211 · 27% · −0.20R | 81 · 20% · −0.41R |
| No MACD, skip Defensive | 407 · 39% · −0.01R | 156 · 22% · −0.34R |
| No MACD, trailing stop | 449 · 29% · −0.05R | 171 · 19% · −0.08R |
| **No MACD, skip Defensive, trailing stop** | **385 · 30% · +0.01R** | **167 · 19% · −0.07R** |

- Best on both markets: no MACD + skip Defensive + trailing stop, but only break-even, and fees (~0.4% a round trip on IDX) would likely push it below zero.
- The mood filter is the clearest gain on IDX (−0.13R → −0.05R, worst losing run 12 → 7). On crypto it barely matters.
- The trailing stop only helps once the MACD rule is dropped (more trades in long trends).
- The "longer MA buy zone" idea was not tested: a zone below MA50 conflicts with the close-above-MA50 rule.
- **Live rule change (2026-11-14, user's decision): the mood filter is now part of the live rules**, for IDX and crypto. While a market's mood is Defensive (< 35, `MOOD_DEFENSIVE` in src/market/mood.ts): no "All pass" badges, the scan reports "No buys", paper trades are paused, the scan log records nobody as passing (so no Dashboard "new setup" alerts), and the per-ticker backtest skips Defensive days. The Rules test marks that row as Current.
- Still no setting with a clear edge after fees; keep the scanner for watchlists and paper trades.

## Crypto scanner (2026-11-14)

- Same rules, buy zone, stop, targets and backtest as IDX (src/market/indicators.ts); only `CRYPTO_RULES` differs: liquidity ≥ $10M a day, prices rounded to 5 significant digits, time stop 56 days (crypto trades every day).
- Data: Binance public market data (`data-api.binance.vision/api/v3/klines`, COIN/USDT, 1d, 1,000 days). No key, CORS open, so it **works on the deployed site** too. Today's candle is dropped until it closes (00:00 UTC = 07:00 WIB).
- CoinGecko is not used here: the free plan has only 365 days and its daily data has no daily high/low (needed for ATR).
- Coin list: src/market/cryptoList.ts (30 coins by Binance volume, ≥ 1 year of history). HYPE left out: only 51 days on Binance.
- Crypto mood: same formula as the IDX mood with BTC as the index. First reading, 2026-11-14: 20 Defensive (1 of 30 coins above MA50).
- Paper trades size from net worth ÷ the USD/IDR rate in Settings; holdings are saved in USD.
- First backtests (2.7 years) are weak: BTC 6 trades, 17% win, −0.50R; ETH 2 trades, 0%; BNB 5 trades, 40%, +0.20R. The swing rules may need different settings for crypto.

## idx CLI (step 3)

- Rust binary, package `ihsg-cli`, command `idx`. Install: `npm install -g ihsg-cli` (downloads the prebuilt binary on first run), or the Windows zip `idx-<version>-x86_64-pc-windows-msvc.zip` from the GitHub releases page, or `cargo install --locked ihsg-cli`. Not installed on this laptop as of 2026-11-13.
- The dev server runs `idx` from PATH; set `IDX_BIN` to a full path (e.g. a downloaded `idx.exe`) to use another one.
- Used command: `idx -q -o json stocks history BBCA --period 2y --interval 1d` → `idx.history.v1` JSON, `data.candles[]` oldest first, `time` like `2025-10-13T09:00:00+07:00`. Exit codes: 2 usage, 3 network, 4 not found, 5 offline cache miss.
- Other useful commands for later: `stocks quote BBCA,BBRI`, `market indices LQ45` (index constituents, shape not checked), `stocks dividends`, `stocks actions`.
- Endpoint: `GET /api/idx/history?symbol=BBCA` (idxPlugin.ts, dev server only). Cached in memory per WIB day.
- Weekly trend is computed from the daily bars (weeks from Monday), so one CLI call per ticker.
- Checklist (src/market/indicators.ts): weekly close above a rising 30-week MA; daily MA50 > MA200; close > MA50; MACD(12,26,9) bullish cross in the last 5 bars and still above signal; average traded value over 20 days ≥ Rp5 bn. Buy zone = MA50 to MA50 + 2× ATR, shown only when the three trend rules pass; above it the price is "extended" (wait for a pullback). Entry = the close, capped at the top of the buy zone. Stop = 20-bar low − Rp1 (only if below the entry), but never more than 3× ATR(14) below the entry. Targets 2R and 3R from the entry. Time stop 8 weeks.
- History is fetched for 5 years (`--period 5y`) so the backtest has enough signals. IHSG is `^JKSE`. The dev-server cache is per WIB day, split at 16:30, so a fetch during market hours is redone once the day's final bar exists.
- Backtest (src/market/backtest.ts): replays the checklist on every past day (signal = all 5 rules pass and the price is in the buy zone at the close; buy at the next day's open, skipped if that open is already at or below the stop). Exits at the first of stop, 2R target (from the actual fill) or 40 trading days. A gap through the stop or target sells at the open, so losses can be worse than −1R. One trade at a time, no fees; a bar touching both stop and target counts as a stop.
- IDX mood (src/market/mood.ts): average of % of LQ45 above MA50, IHSG vs MA50/MA200 (0/50/100) and IHSG calm (20-day vs 250-day volatility). < 35 Defensive, < 65 Careful, else Healthy. Foreign flow is left out because idx.co.id often blocks it (Cloudflare). First real reading, 2026-11-13: 23 Defensive.
- The Scanner runs the LQ45 scan by itself when opened, and remembers the last two price dates in localStorage to show what started or stopped passing. It only runs while the dev server and app are open; a run with the laptop idle would need Windows Task Scheduler.
- **LQ45 membership can't come from idx:** `market indices` returns only the number of constituents, not the tickers. Keep src/market/lq45.ts by hand and check it against idx.co.id after each February and August review.
- Not done yet: tick-size rounding, ARB warning, foreign flow in the mood, bandarmology (IPOT broker summary was down on 2026-11-14, a Saturday).

## Long-term check (2026-11-14)

Page **Long-term** (`#/longterm`, src/pages/LongTerm). Scoring is pure code in src/market/fundamentals.ts; thresholds are named constants there. Each metric passes or fails; **missing data is "unknown" and earns no point**. Each part = metrics passed (0–5); total 0–15, shown with how many of the 15 had data.

| Part | Metric (pass when) |
|---|---|
| Quality | ROE ≥ 15% · net margin ≥ 10% · debt/equity ≤ 1 · dividend paid ≥ 5 years in a row · earnings growth (y/y) > 0 |
| Value | 0 < trailing P/E ≤ 15 · 0 < P/B ≤ 2 · 0 < PEG ≤ 1 · dividend yield ≥ 3% · analyst mean target ≥ 15% above price |
| Risk (5 = low risk) | net cash (cash − debt) ≥ 0 · beta ≤ 1 · 52-week high ÷ low − 1 ≤ 60% · current ratio ≥ 1.5 · market cap ≥ Rp10T |

- First readings: PTBA 13/15 (5/4/4: analyst gap 11%, current ratio 1.25 fail); BBCA 11/15 (5/3/3, current ratio unknown).
- Data: `idx stocks fundamental` (Yahoo quoteSummary) + `idx stocks dividends` (`consecutive_years`), both through `GET /api/idx/fundamentals?symbol=PTBA` → `{fundamentals, dividends}`; dividends null when that call fails (streak unknown).
- Scanner: `GET /api/idx/screen?screen=large|quality|value|dividend` runs `idx stocks screen --fundamentals --max-fundamentals 100 -n 0` with a fixed filter per key (idxPlugin.ts `SCREENS`; no user text reaches the command). Only rows with fundamentals come back, ranked by total, then data known. Same per-WIB-day cache and error codes as history.
- **idx data limits:**
  - Screen rows have no dividend streak, analyst target, cash/debt, beta or current ratio, so a screen score has at most 10 of 15 known. The ranking is still fair across rows (the same fields are missing for all); open a ticker for the full check.
  - Fundamentals are fetched only for the 100 largest companies that pass a screen's quote-level filters (by market cap), so small caps are not scored.
  - Banks/financials: no current ratio, and Yahoo's debt/equity and debt figures don't mean the same as for other companies (BBCA D/E 0.0014).
  - Statements in USD with an IDR price (ITMG, BSSR): Yahoo's P/B is not a ratio (ITMG 14,494), so P/B is dropped (unknown). Net cash then compares USD amounts, which is fine for the sign.
  - Earnings growth is Yahoo's latest quarter y/y, which can swing wildly (PTBA +214%). No multi-year earnings history in the screen; `eps_growth_3y_pct` exists in fundamentals but is often null.
- **Score log and alerts (2026-11-14):** every full check is saved per ticker and day in localStorage `mercury.ltScores` (src/market/scoreLog.ts): date, total, data known, price. The Portfolio shows `LT 13/15` on Investing IDX stocks still held (warn badge when alerting), and the Dashboard adds a quest when one fell ≥ 3 points since its previous check (`LT_SCORE_DROP`) or is below 8/15 (`LT_LOW_SCORE`). Portfolio and Dashboard re-check held tickers once a day on the dev server; the static build only shows logged scores.
- **The score is not backtested:** idx gives only today's fundamentals. The score log (with price) is the start of a forward test: after 6–12 months, compare returns of high vs low scores.

## Journal (2026-11-14)

- Page **Journal** (`#/journal`): dated entries tagged Note / Plan / Entry / Exit / Lesson, optionally linked to a holding (paper trades keep their PAPER badge); filter by holding; delete asks first. Streak = days in a row with an entry, ending today, or yesterday until today's entry is written (src/domain/journal.ts).
- Stored with the portfolio (localStorage `mercury.data`) and in the JSON backup as `journal` (older backups import with none). Not in the Google Sheet sync yet. Deleting a holding keeps its notes, unlinked.
- Later (user, 2026-11-14): add the journal to the Google Sheet sync (a Journal tab), and show the journal streak on the Dashboard.

## Cashflow accounts and voice Quick add (2026-11-16)

**Accounts** (src/domain/accounts.ts, Cashflow → Accounts card):
- Create, rename, set a starting balance, archive / restore. Never deleted, so old entries always resolve. Every store starts with **Cash** (id `cash`), which can be renamed but not archived. Names are unique (any case, archived included), max 24 characters.
- Balance = starting balance + income − expenses − transfers out + transfers in, over all entries (all months). The card total adds active accounts only.
- **Balance date (2026-11-16):** each account can have a "Balance on" date (`balanceDate`, yyyy-mm-dd; new accounts default to today). The starting balance is what the account held on that day, so **entries dated before it don't change the balance** (they already happened inside it) but still count in the monthly totals and categories. Entries on or after the date count. Each side of a transfer is checked against its own account's date. Empty = every entry counts (accounts made before this change). Synced as a 6th Accounts column `balanceDate`.
  - Shortcut: same-day entries always count, so set the date to the day you read the bank balance and log that day's earlier spending only if it isn't in that balance yet.
- Each expense/income entry stores `account` (an id). **Entries with no account (everything before this change) count as Cash**; so does an id or name that matches no account. A name typed by hand in the Sheet (any case) is matched to that account.
- **Transfers** are entries with `type: transfer`, `category: transfer`, `account` = from, `toAccount` = to (must differ). They move balance only: never counted in spending, income, categories, the six-month chart, or the day's net.
- Sheet: Entries gets two new columns at the end, `account` and `toAccount` (blank = none), so old 7-column rows still parse. A new **Accounts** tab (id, name, startingBalance, archived, updatedAt). Each sync merges accounts by id, newest `updatedAt` wins (Cash's seed is dated 1970 so any edit wins), and rewrites the tab only when it differs. Every sync also rewrites the header rows so older sheets get the new column names. Cashflow is not in the JSON backup (unchanged).

**Entries typed or edited in the Sheet, and delete (2026-11-16):**
- A row typed in the Entries tab may leave `id` and `createdAt` blank: the next sync gives it a new id (and createdAt = the sync time) and writes both back into the row, so it keeps that id afterwards.
- Hand-typed cells are read leniently: Sheets turns a typed date into a day number, which is converted back; text `16/11/2026` is read day-first; `type` and built-in category ids in any case (`Expense`, `Food`); amounts like `Rp25,000` or `1.000.000` keep their digits.
- Why a hand edit seemed "not to sync": before this, a typed date (stored by Sheets as a number) or `Expense` with a capital failed validation, so the row was skipped (the "rows were skipped" warning) instead of updated. Also, the app only syncs by itself while it holds a Google token (~1 hour after Connect); after that the bar shows Connect and nothing syncs until it's tapped.
- Delete: every entry has × (asks first). An unsynced entry is dropped at once; a synced one is hidden at once and queued (`deleted` in `mercury.cashflow`), and the next sync deletes its row in the Sheet by id (row found in that sync's read). Deleting in the Sheet also works: the row is simply gone at the next sync.
- **One sheet per Google account (fix, 2026-11-16):** each device used to remember its own sheet id, and a device without one created a new "Mercury Cashflow", so PC and phone each had their own sheet. Now every sync asks Drive (`files.list`, `drive.file` scope = only files this app made) for "Mercury Cashflow" sheets and uses the **oldest**; a new sheet is made only when none exists. The device's remembered id is not used as a fallback (changed same day): a trashed or renamed sheet would keep one device on a sheet the others can't find. A device that moves to another sheet appends its own entries the new sheet lacks (by id) and merges its portfolio as on a first sync (union, this device wins a clash); accounts merge by id as always. The old sheet stays in Drive; trash it once the data is checked.
  - Needs the **Google Drive API enabled** in the same Cloud project as the Sheets API; without it the sync shows Google's "Drive API has not been used" error (with the enable link).
  - Both devices must use the same OAuth client id (`VITE_GOOGLE_CLIENT_ID`): `drive.file` only lists files made through that client. A localhost build with a different client id gets its own sheet.
  - Don't rename the sheet: devices find it by name. A renamed or trashed sheet means a new one is made, and each device copies its cached entries into it.
- There is still no edit in the app; edit in the Sheet, or delete and add again.

**Bills (2026-11-16)** (src/domain/bills.ts, Cashflow → Bills card):
- Entered by hand: name, next due date, optional amount, monthly or one-time, account to pay from. Stored in `mercury.cashflow` and synced through a **Bills** tab (id, name, amount, dueDate, monthly, account, archived, updatedAt), merged by id with the newest edit winning, like Accounts (`mergeNewest` in portfolioSheet.ts). A due date typed in the Sheet is read from Sheets' day number.
- **Quest:** a bill shows on the Dashboard quest list from 3 days before its due date (`BILL_REMIND_DAYS`) and stays while overdue ("Pay Wifi · Rp350,000 — 1 days late"); the quest links to Cashflow.
- **Pay:** a monthly bill's due date moves one month on from its due date (so a missed month is still due), a one-time bill is archived. With an amount, Pay also logs an expense (category Bills, note = bill name, today, from the bill's account). Without an amount nothing is logged: add the expense yourself (e.g. electricity that changes).
- Delete archives the bill (never removed, so another device's sync can't bring it back). Edit changes any field, including the next due date.
- Limits: a bill due on the 29th–31st drifts to the shorter month's last day and stays there. The Dashboard shows quests only once the portfolio has a holding (empty portfolio = the "Inventory empty" screen).

**Dashboard cashflow (2026-11-16):** net worth on the Dashboard = holdings + money in active accounts (`accountsTotal`), with a "Holdings · Accounts" line under it; the level/XP uses that total. **Heat, per-trade risk and position sizing still use holdings only** (`summary.netWorth`, trading capital). A "This month" card shows spending (against the budget when set), income, net and savings rate, linking to Cashflow.

**Keeping the Sheet readable (2026-11-16, user's decision):** raw entries are never deleted or rolled up (balances, backdating and delete all need them; ~1,200 rows a year is tiny). Instead:
- **Summary tab** (src/domain/summarySheet.ts): rewritten by the sync (only when it changed this session): one row per month, newest first — month, income, spent, net, savingsRate %, then spending per expense category (most spent overall first); then each active account's balance and the total. Transfers and adjustments are left out of the month figures. The app never reads it back, so don't edit it.
- **Balance adjustment** (category `adjustment`): "Match bank" on an account takes the real balance and logs the difference for today as income or expense with this category. It moves the account balance but is never counted as spending or income (`isCashflow` in cashflow.ts: not in month totals, categories, six-month chart, day net or Summary). Not offered in Quick add; typed `adjustment` in the Sheet works too.
- **Workflow:** daily = log in Quick add / voice. Monthly (~5 min, e.g. the 1st): Match bank on each account against the real BCA / GoPay / cash; pay or update due bills; read last month's row in the Summary tab and set the budget. Yearly: nothing, unless the Entries tab passes ~10,000 rows; then build the yearly archive (move a year's entries to an "Entries yyyy" tab and carry each account's year-end balance as its starting balance with Balance on = 1 Jan). Not built.

**Big batch (2026-11-16, user's request):**
- **Cashflow month card** shows **net** (income − spent): green "+" when income covers spending, red "−" when not. Spent moved to a tile.
- **Cashflow page (2026-11-22):** money now (active accounts + bills due within 7 days), month net, where it went (100-pixel strip, ▲▼ vs the same days of last month), entries (today + yesterday, rest folded), spending-days calendar (shaded by rank, ★ = no spend, tap a day for its entries). Add is a floating button. Safe to spend today: (budget, or this month's income without one) − spent before today − bills left this month (fixed amounts, overdue included) ÷ days left incl. today; today's share shown as 5 hearts (src/domain/safeToSpend.ts). Playful skin: `.play-skin` + `data-tone` per card (index.css), on Cashflow and Dashboard (the header follows on those pages: PLAY_ROUTES in Shell.tsx).
- **Dashboard order (2026-11-22):** net worth → quests (today's to-dos) → safe to spend + this month → heat + trade risk → allocation → winners & losers (by unrealized %, priced holdings only) + crypto mood.
- **Saving in Quick add** goes back to Cashflow, which shows "Saved … · + Another · Undo" for 6 s (`#/cashflow?added=<id>`). Undo removes the new entry at once.
- **Edit an entry:** tap its title → Quick add opens `#/add?edit=<id>` filled in; Save replaces it. A synced entry's Sheet row is rewritten by id at the next sync (`edited` queue in `mercury.cashflow`).
- **Undo delete:** × hides the entry and shows "Deleted · Undo" for 6 s; it is really deleted after that, on a second delete, or when leaving the page (no confirm box any more).
- **Filter / per-account view:** search text (note, category, account names), account and category filters search **all months**. Tapping an account name filters to it and shows its running balance after each entry (`runningBalances`, same balance-date rules).
- **Quick add chips:** the same type + category + amount + note + account logged ≥ 2 times in 90 days (top 6, `frequentEntries`).
- **Voice dates:** "kemarin" / "yesterday" = yesterday; "tadi" (+ pagi/siang/sore/malam), "hari ini", "today", "this morning" = today. "makan siang" keeps "siang" as a note word.
- **Category budgets:** "Budgets" on the Where-it-went card; stored in Settings (`categoryBudgets`, this device only, like the monthly budget). A budgeted category's bar fills against its limit and turns red when over.
- **Expected income:** a Bills entry with "Expected income" ticked (new `income` column in the Bills tab). Quest only once it is ≥ 2 days late (`INCOME_LATE_DAYS`); "Received" logs Salary income to its account and moves it a month on.
- **Savings goals** (Goals tab, merged like Accounts): name, target, account; progress = that account's balance ÷ target.
- **Game layer (src/domain/cashGame.ts, nothing stored):** month score 0–100 = four visible parts of 25 — budget (full within the monthly budget, 0 at twice it; 0 without a budget), savings rate vs 20%, share of days so far with something logged, share of active accounts matched to the bank this month (`matchedAt`, set by Match bank even when nothing differed; new Accounts column). Logging streak = days in a row with an entry *entered* (createdAt, so backdated entries logged today count today). No-spend days = days so far this month without spending. Badges: first entry, 7- and 30-day best streak, under budget (a finished month), saver 20% (a finished month), all accounts matched this month, a goal reached.
- **Dividends** (Portfolio → edit a holding → Dividends): date, amount actually received (after the 10% tax), account (required). Also logs Investment income "Dividend X" to that account; deleting the dividend deletes that entry. Holding shows "Div Rp… · yield x%" (last 12 months ÷ cost of what is held). Dashboard Realized = sells + dividends. Synced in a Dividends tab with the portfolio; in the JSON backup.
- **Dashboard "Total money"** = Accounts + Investing + Running trades, shown as three tiles; level/XP use it. Heat and sizing still use holdings only.
- **Privacy:** the "Rp" pill in the header switches to "•••": every money amount and unit count shows as •••••; percentages stay. Quick add's typed amount stays visible. Market prices on the Scanner are not masked (not your money).
- **Long-term:** Score history card (bars = total per check, line = price; from the local score log) and "Held vs better-scored" (logged tickers checked in the last 30 days scoring higher than each held long-term stock, `betterScored`).
- **Journal:** syncs with the portfolio (Journal tab, same push/pull/merge rules; adding or deleting a note now marks the portfolio changed). Exit-lesson quest for sells in the last 14 days without an Exit/Lesson note dated on/after the sell; it opens `#/journal?holding=…&tag=exit` prefilled. Journal streak on the Dashboard quest card; tag filter.
- **Settings:** the JSON backup now has dividends and cashflow (entries, accounts, bills, goals). Import replaces the portfolio and journal as before, but only **adds** cashflow (entries this device lacks are queued; accounts/bills/goals merge, newest edit wins). The sync now appends only entry ids the Sheet lacks, so a restored backup or a retry after a failed sync can't duplicate rows. "Test Google connection" checks the Sheets and Drive APIs separately and shows Google's message (which names the API to enable).

**Reference buy zone (2026-11-16):** the Scanner shows the MA50 to MA50 + 2× ATR range for every ticker (`refZone`), not only when the three trend rules pass. When they fail it is marked **Not ideal** (reference only, not a setup). The real `buyZone` / `zone` are unchanged, so entries, stops, "in zone" alerts, paper trades, All-pass and the backtests still require the trend rules.

**Portfolio by type (2026-11-16):** inside Investing and Trading, holdings are grouped by asset type (the 6 classes, in `ASSET_CLASSES` order, held types only). Each type header shows its IDR value, P/L % and share of the group (`byType` in portfolio.ts); USD holdings without a rate are listed but left out of the totals. Closed holdings stay in their type.

**Funds by amount and investing from Cashflow (2026-11-16):**
- A **new** money-market or bond fund is tracked by amount (`byAmount` on the holding; new Holdings column). The form asks for **amount invested** and **current value** (what Bibit shows), no units. Stored as 1 unit = Rp1 at the first buy, so cost = amount and price per unit = value ÷ units. Later top-ups and withdrawals are typed in rupiah and converted at today's price per unit (`parseTransaction`), so a top-up adds exactly its amount to both cost and value. Editing shows and saves the current value. Funds created before this keep their unit form (no flag).
- **Paid from / Money goes to:** a buy or sell (first buy or the transaction row) can name an account. It logs a Cashflow entry with category **Investing** (`invest`): an expense for a buy (amount + fee), income for a sell (amount − fee), linked by `entryId` on the transaction (new Transactions column), so deleting the trade deletes the entry. Like transfers and adjustments, Investing moves the account balance but is never spending or income (`isCashflow`).
- **Cashflow → Invest card:** pick the account, then **Top up** a holding (opens it with a buy row paid from that account) or **+ New holding** (first buy paid from that account).

**Voice Quick add** (src/domain/voice.ts, no AI):
- Mic button only where the browser has `SpeechRecognition` / `webkitSpeechRecognition`; `lang` = `id-ID` or `en-US` from the app language. The UI says Chrome sends the audio to Google. The transcript only fills the form; the user taps Save.
- Amounts: digits (`25`, `25.000` / `1,500` = thousands, `1,5` / `1.5` = decimal, `Rp25.000`), suffixes `rb`, `ribu`, `k`, `thousand`, `jt`, `juta`, `million`, `miliar`, `billion`; Indonesian words (`dua puluh lima ribu`, `seratus ribu`, `seribu`, `lima belas`, `dua ratus lima puluh`, `satu setengah juta`) and English words (`twenty five thousand`, `one hundred fifty`). The first number run wins.
- Categories (first match): makan, kopi, jajan, lunch, dinner, coffee → food; sayur, indomaret, alfamart, groceries → groceries; bensin, parkir, ojek, gojek, grab, tol, kereta, fuel, parking, taxi → transport; listrik, pln, pdam, internet, wifi, pulsa, tagihan, electricity, bill → bills; sewa, kos, kontrakan, rent → housing; obat, dokter, apotek → health; belanja, baju, shopee, tokopedia → shopping; nonton, film, netflix, movie → fun; keluarga, anak, ortu → family; gaji, salary → salary; bonus, thr → bonus; freelance, proyek → freelance; dividen, bunga, interest → investment. One-word custom category names match too. The category decides expense vs income; otherwise beli/bayar/spent/paid → expense, terima/dapat/masuk/received → income.
- Accounts by the user's account names (multi-word names too, e.g. "Bank Jago"). "ke" / "to" before a name = destination; pakai / pake / dari / lewat / via / with / from / using = source. "cash" / "tunai" = the Cash account. `transfer` / `tf` / `pindah` / `tarik` / `withdraw` make a transfer: "transfer dari BCA ke Cash 500 ribu"; "tarik tunai 1 juta dari BCA" = BCA → Cash.
- Words not understood go to the note ("makan siang 25 ribu pakai BCA" → food, 25,000, BCA, note "siang"); missing fields stay empty for the user.
- Limits: a number right after an amount joins it ("25 ribu 2 porsi" = 25,002); English "gas" means fuel.

## Backlog (recap 2026-11-14)

Suggested order: commit → tick sizes + ARB warning → achievements → scheduled after-close run → AI layer.

- **AI layer (step 5), first slice done 2026-11-18: DeepSeek.** Key in Settings → AI summaries (`deepseekKey`, stays in the browser). src/ai/deepseek.ts calls `https://api.deepseek.com/chat/completions` (model `deepseek-flash` = V4.1 Flash with `thinking: {type: 'disabled'}`, OpenAI-compatible) straight from the browser; URL and model are fixed (only the key is a setting). `deepseek-chat` was retired 2026-07-24. Price (2026-11-18): $0.30/M input, $1.20/M output at peak (01–04 and 06–10 UTC on weekdays = 08–11 and 13–17 WIB), half off-peak; one call ≈ 1,000 in + 300 out tokens ≈ $0.0007, so ~600 calls/month ≈ $0.40. An **Explain** button (src/components/Explain.tsx) on the Scanner ticker check, the IDX Long-term check and the Crypto check sends the lines the page already shows (pass/fail, values, thresholds, levels, backtest) and shows the reply in an "AI summary" block, with an **Ask** field for a free question answered from the same facts (≤ 300 chars, no chat memory) marked as DeepSeek's opinion, not licensed advice. The system prompt (master-trader mode since 2026-11-18) asks for a call with its own levels, each marked "~", built on the app's facts; it must not invent facts it wasn't given (news, earnings dates). Replies are cached per facts + language until the app reloads (module Map in Explain.tsx). On the check pages only the check's facts are sent. **Portfolio review** (Portfolio page, right column): src/ai/portfolioFacts.ts sends percentages only (share of net worth, P/L %, class/group split, heat vs limit, stop risk %, days held, holding names; no rupiah, quantities or prices) plus the user's written rules, and on click src/ai/holdingChecks.ts adds fresh swing rules (daily bars, % vs MA50/MA200) and the long-term score with failed metrics per IDX stock/coin; on the deployed site IDX falls back to the last logged score. Hidden in privacy mode. Not done: sentiment summaries.
- Risk: tick-size rounding, ARB warning on stops, fees in the backtest, pre-entry checks (ex-dividend, earnings, rights issues).
- Rules: no setting has an edge after fees yet; crypto may need its own settings; "longer MA buy zone" untested.
- Data: foreign flow in the IDX mood, bandarmology, LQ45 review each Feb/Aug, confirm idx `close` is split-adjusted, US stocks/ETF source (step 6), Antam gold price, imports from Bibit/Stockbit/Binance.
- Automation: alerts + scheduled after-close run (step 7).
- Long-term score: forward test from the score log after 6–12 months; screen scores are partial (10 of 15) and cover the 100 largest only.
- Journal: Sheet sync, streak on the Dashboard.
- Game layer: achievements not built; check the rest of DESIGN.md (e.g. Seasons) against the code; regenerate DESIGN.md from the code (`/impeccable document`).

## Open questions

- Data source for US stocks/ETFs.
- Tick sizes (fraksi harga): hardcode them in config like ARA/ARB (idx doesn't provide them), then round stops to them.
- Confirm on a real run that idx's `close` is split-adjusted (see "idx CLI" below).

## Chart patterns (2026-11-16)

- Scanner → ticker check → "Show chart patterns" (on by default). Code in src/market/patterns.ts, display only: **not in the score, not backtested**.
- Swing points: a high/low that beats 5 bars on each side (so it shows 5 bars late, never peeks ahead). Levels are "equal" within 3%.
- Chart patterns (last 120 bars, newest of each type): double top/bottom (≥ 10 bars apart, ≥ 5% deep), head and shoulders + inverse (sloped neckline), ascending/descending/symmetrical triangles (last 2 swing highs and lows). Status Forming until a close breaks the neckline/edge, then Confirmed, then Target hit once price touches the target (drawn faded, no label); a close beyond the tops/head first drops it. Target = measured move (pattern height from the break).
- Candle signals (last 20 bars, bare arrows on the chart, named in the list): bullish/bearish engulfing, hammer, shooting star, morning/evening star, each only after a matching 5-bar move.
- Tap a row in the pattern list to show only that pattern, zoomed in, with its trigger and target lines; tap again for all. With nothing picked, chart patterns are thin unlabelled outlines.
- Later: backtest pattern breaks before trusting them.

## Chart timeframes and the top-50 crypto list (2026-11-17)

- Ticker check chart has 1H / 4H / 1D / 1W / 1M. **The checklist, buy zone, stop and targets always come from the daily bars**; other sizes only change the candles, MA50/MA200 (of that bar size) and the patterns. Hourly times are shown in WIB.
  - Crypto: every size straight from Binance klines (latest 1,000 bars, forming candle kept since it's only a view).
  - IDX: 1H from `idx stocks history SYM --period 1y --interval 1h` (`GET /api/idx/history1h`, dev server only); 4H built from 1H in WIB 4-hour blocks (08–12, 12–16); 1W/1M built from the 5 years of daily bars. Not yet seen on a real idx run.
- Crypto scan list: top 50 by market cap from CoinGecko `/coins/markets` (needs the CoinGecko key in Settings), keeping coins with a Binance USDT pair and dropping stablecoins (list + anything within 2% of $1), gold tokens and wrapped/staked/bridged copies. Cached a day in localStorage `mercury.cryptoTop`. Without a key, or if a call fails, the old fixed 30 (src/market/cryptoList.ts) is used and the scan note says so.
  - Coins with under ~200 days on Binance can't pass the MA200 rule; they still show, with unknowns.

## Short-term scanner (2026-11-17)

Inside the **Scanner** as a holding-time switch: 3–6 months (the swing rules) | ≤ 1 month | ≤ 1 week (src/pages/Scanner/ShortView.tsx; rules in src/market/shortSwing.ts, data in src/market/shortData.ts). Briefly a separate page; moved into the Scanner on the user's request (2026-11-18).

| | ≤ 1 week | ≤ 1 month |
|---|---|---|
| Direction (daily) | close above a rising MA20 (vs 5 days ago), MA20 > MA50, close > MA200 | close above a rising MA50, MA50 > MA200, close > MA200 |
| Entry chart | 4H | Daily |
| Trigger | pullback (a low in the last 3 bars touched EMA20, bullish close above EMA20 and above the previous high) or breakout (close above the 10-bar high, volume above its 20-bar average) | same, on daily bars |
| Stop | 10-bar low − one step, max 2× ATR of the entry chart | same |
| Target / time stop | 2R; 5 trading days IDX, 7 days crypto | 2R; 20 trading days IDX, 28 days crypto |

- Also: liquidity (IDX ≥ Rp20 bn/day, crypto ≥ $10M) and a "normal move" check: the target must be within one standard deviation of the coin's 60-day daily swings scaled to the holding time.
- Mood filter as in the swing scanner: Defensive = signals show as Paused, no paper trades, backtests skip those days.
- A 4H bar reads the daily trend from the previous full day only (no peeking); signals use finished bars only (Binance close time; IDX 4H block end).
- Backtests and the rules test include fees: IDX 0.15% buy / 0.25% sell (assumed, Stockbit-style), Binance 0.1% each side. Rules test variants: both triggers (current), pullback only, breakout only, + MACD, 1.5R, no normal-move check, no mood, no fees.
- Data: crypto 4H = 3 × 1,000 finished bars from Binance (~16 months); IDX 4H = 1 year of 1H from idx, built into WIB 08–12 / 12–16 blocks, dev server refetches every 15 minutes while the market is open.
- Dashboard alerts: each short-term scan saves its buy signals (none while Defensive) in localStorage `mercury.shortLog.<market>.<week|month>`; the Dashboard lists them while fresh (12 h after the 4H bar closes for ≤ 1 week, 2 days after the daily bar for ≤ 1 month). Like the swing alerts, they only update when the Scanner runs.
- Not done yet: real-data check of IDX hourly bars.

## ARB warning and expected range (2026-11-18)

- **ARB** (src/market/idxLimits.ts, the only place with the limits; valid until 2026-12-31): IDX checks (swing and short-term) warn when the stop is more than one ARB (7%, Rp1 under Rp15) below the entry, with how many limit-down days it could take. After the valid-until date the note says the limits expired and to re-check idx.co.id.
- **Expected range** (src/market/expectedRange.ts): standard deviation of the last 60 daily log returns, scaled by √days. Shown on the swing check (IDX 5/20/60 trading days, crypto 7/30/90 days), the short-term check (its holding time) and the crypto fundamentals card. 2 in 3 = ±1σ, 19 in 20 = ±2σ, log-normal, no drift. Warns when the stop is inside one normal day's move. A risk measure, not a forecast.

## Crypto fundamentals (2026-11-18)

Long-term page → Crypto (src/market/cryptoFundamentals.ts scoring, src/market/cryptoFundamentalsData.ts fetching, src/pages/LongTerm/CryptoCheck.tsx). Needs the CoinGecko key; works on the deployed site. Score out of 14; unknown earns no point.

| Part | Metric (pass when) |
|---|---|
| Tokenomics (4) | circulating ≥ 70% of max (or total) · FDV ÷ market cap ≤ 1.5 · has a max supply · on Binance ≥ 3 years |
| Usage (5, DefiLlama) | TVL ≥ $1B · TVL up over 7 days · fees last 30 days > 0 · fee pace (7d × 30/7 ÷ 30d) ≥ 100% · revenue last year > 0 |
| Market & dev (5) | 24h volume ≥ 2% of market cap · market cap ≥ $1B · within 50% of the all-time high · 1-year high ÷ low ≤ 3 · GitHub commits (4 weeks) ≥ 20 |

- Sources: CoinGecko `/coins/markets` (top 250, symbol → largest coin) and `/coins/{id}` (developer_data); DefiLlama `/v2/chains` (matched by gecko_id), else `/protocols`, `/summary/fees/{slug}?dataType=dailyFees|dailyRevenue`, `/v2/historicalChainTvl/{chain}`; Binance first daily candle (listing age) and 365 daily candles.
- **Field names are from memory, not yet checked against live responses** (the docs weren't reachable from the build sandbox). Parsing is lenient: a wrong name shows as unknown, never an error. Check on a real run, especially DefiLlama fees for chains and CoinGecko developer data (often empty).
- Meme and payment coins have no DefiLlama entry: Usage shows unknown.

## Watchlist (2026-11-18)

- Settings `watchlist` {idx, crypto} (upper-case tickers, max 20 per market; src/watchlist.ts). Default crypto: HYPE (user's request).
- Watched tickers are added to every scan (swing and short-term) after the normal list, marked ★; the ☆/★ button on a ticker check adds or removes them. Crypto watchlist coins also show in the Dashboard price list.
- HYPE has only been on Binance since about late September 2026, so its MA200 rules (and the 60-day expected range until ~late November) show "not enough history" for now: it can't pass the trend rules until roughly April 2027.
- Crypto fundamentals first real run (ETH, 2026-11-18): 13 of 14 known; CoinGecko developer data (commits) empty, as expected. DefiLlama chain, fees, revenue and TVL history all parsed.

## Trade memory, trade review, signal postmortem, crypto mood v2 (2026-11-18)

Ported from github.com/tradermonty/claude-trading-skills (MIT) as TypeScript in the app, not as Claude skills: trader-memory-core, weekly-performance-digest + trade-performance-coach (+ position-sizer's Kelly mode), signal-postmortem, crypto-regime-analyzer.

- **Journal has three views:** Notes (as before), Trades, Signals (`#/journal?view=trades|signals`).
- **Trade memory** (src/domain/tradeMemory.ts): trading holdings gain `setup` (swing / month / week / other), `thesis`, `invalidation`, `reviewBy`, `initialStop`, `exitReason`, `signalId` (also Sheet columns). The store saves the first stop as `initialStop` (older trades take their stop on the next edit). Scanner paper trades fill setup, signal link and a review date = the rules' time stop (56 / 28 / 7 days). A Dashboard quest appears when an open trade's review date comes. Ideas = scanner signals; Active/Closed come from the transactions.
- **Trade review** (src/domain/tradeReview.ts): one trade per round trip (first buy until all sold). R = P/L after fees ÷ ((avg entry − initial stop) × units); "~" when only the current stop is known. Win rate, expectancy, profit factor, worst losing run, by setup, by exit reason; MAE/MFE from daily bars on request (falls back to the entry day's close when the entry price doesn't match the bars); half-Kelly only from 30 trades with an R. AI "coach" mode (src/ai/deepseek.ts): process review only, never a buy/sell call; sends R and %, no rupiah.
- **Signal postmortem** (src/market/signalLog.ts, signalTrack.ts): every buy signal a scan shows is saved (localStorage `mercury.signals`, newest 1,500), including ones paused by a Defensive mood. Signal = swing: all 5 rules + in the buy zone; short-term: `check.signal`. Outcomes use the backtest's rules (next open, stop / 2R from the fill / time stop, gaps at the open, both-touched = stop) with fees on all styles (IDX 0.15% + 0.25%, Binance 0.1% a side), on 4H bars for ≤ 1 week. Updated after each scan from the bars already loaded, and by "Check outcomes". Compares live vs paused (is the mood filter helping?), signals you took (paper-trade link, or a buy within 5 days) and missed winners.
- **Crypto mood v2** (src/market/cryptoRegime.ts, cryptoRegimeData.ts, marketMood.ts): six parts: BTC trend 25%, alt breadth (MA200) 20%, BTC dominance 15%, funding 15%, BTC drawdown + volatility 15%, 30-day momentum 10%; weight shared out while ≥ 4 parts and ≥ 65% remain. Same 0–100 scale and Defensive line (35) as before, so the live mood filter is unchanged in how it acts. Backtests and the rules test use the four price-only parts (no funding or dominance history). IDX mood unchanged.
  - Dominance: CoinGecko /global (needs the key), one reading saved per day (`mercury.btcDominance`); the part shows "needs 31 readings" until then.
  - Funding: `fapi.binance.com/fapi/v1/premiumIndex`. **Browser CORS not yet confirmed on a real run** (sandbox can't reach it); a failure only leaves that part out.
- Not done from the review: drawdown circuit breaker, pre-trade gate, IHSG distribution days / FTD, Rules-test robustness, new setups (VCP, momentum burst).
- Known: `binance.test.ts` "steps keep 5 significant digits" fails on float noise (0.000009999… vs 0.00001); it fails without these changes too.

## Circuit breaker and pre-trade gate (2026-11-18)

From the drawdown-circuit-breaker and pre-trade-discipline-gate skills (tradermonty/claude-trading-skills, MIT).

- **Circuit breaker** (src/domain/circuitBreaker.ts): realized P/L of the trading group (every sell, average cost, fees in) as % of net worth. Halted after −2% today (until tomorrow), −5% this week from Monday (until next Monday), −8% this month (until the 1st); Cooldown after 2 losing round trips in a row (loss day + 1). A USD sell this month without a USD/IDR rate halts (fails closed, as the skill does). **Real and paper are judged separately.** Limits in Settings → Circuit breaker (`breaker`, unset = defaults). Shown on Journal → Trades and as a Dashboard alert. It only stops new entries; it never closes anything.
- **Pre-trade gate** (src/domain/preTradeGate.ts, useGate.ts, components/GatePanel.tsx): checks thesis written, stop below entry, risk at stop ≤ per-trade limit, heat after the trade ≤ heat limit, no sell at a loss in the last `revengeDays` (1, partial sells count), market mood not Defensive (last scan's mood, saved per market in `mercury.mood.<market>`, unknown if older than 3 days), breaker allowed. Any fail = NO-GO; any unknown = REVIEW; else GO.
  - Where: new trading holdings and buys added to a trading holding (HoldingDialog), and the Scanner paper-trade buttons (swing and short-term).
  - **Decision (2026-11-18):** Scanner paper trades need GO. A real trade can still be recorded on REVIEW / NO-GO after ticking "checked myself" / "record anyway as a rule break", because the app records trades already placed at the broker; blocking would make the records wrong. Each gated entry writes an Entry journal note with the decision and the failed checks, and the holding keeps `gate` (Sheet column), so the trade review shows results by gate decision.
  - Not built from the skill: the approved-rules ledger and the two-week rule experiment.
