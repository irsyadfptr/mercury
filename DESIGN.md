# Mercury — Design

Status: **direction locked 2026-11-13, pre-build.** Chosen from the mocks in the "Mercury Color Samples" canvas (artboard "Game stats", Ocean palette). After the first pages ship, regenerate this file from the real code (`/impeccable document`).

Mode: **Operate.** A daily tool for reading numbers and making decisions. The game layer makes it fun to check; it never makes numbers harder to read.

## Direction: Game Stats

A ledger-style layout (big numbers, small caps labels, ruled lists, blocks sized by share) in soft, snug cards, with a light RPG layer: level and XP, health bars for risk, fire for portfolio heat, inventory, quests, achievements, rarity.

**Rules for the game layer**

1. **Every game element is a real number calculated in code.** No AI, no made-up scores.
2. **Rewards are for habits, never for profit or risk-taking.** Achievements reward discipline (stops hit, paper trades first, heat kept low, holding 3–6 months). Nothing celebrates a big win or a big bet.
3. **Data stays plain.** Pixel fonts are for titles, labels and big hero numbers only. Tables, prices and form inputs use Geist / Geist Mono.
4. Glass and parallax from the earlier direction are **dropped**.

| Element | What it is | Rule |
|---|---|---|
| **Level + XP bar** | Net worth milestones | Level = number of times net worth has doubled from Rp10M (`floor(log2(nw / 10M)) + 1`). XP bar = progress to the next doubling, 24 segments. "LEVEL UP SOON" glows at ≥ 90%. |
| **Portfolio heat 🔥** | Open risk if every stop hits, vs limit (default 6%) | Fire tiers by heat ÷ limit: < 30% CALM (no flame), < 60% WARM (1), < 85% HOT (2, card turns warm), ≤ 100% ON FIRE (3), > 100% OVERHEATED (4, number turns red). |
| **Trade risk HP** | Risk per trade vs limit (default 1%) | 20 segments. Accent when < 80%, `--warn` at 80–100%, `--down` blocks spill past the bar when over. No stop = red outlined empty segments + "NO STOP · ???". |
| **Inventory** | Allocation by asset class | Blocks sized by share. Speed stars = liquidity tier: ★★★ instant (crypto), ★★ 1–2 days (stocks, money market), ★ days (bonds), none (gold). |
| **Rarity** | Days a holding has been held | Common < 30, Rare 30+, Epic 90+, Legendary 180+. Shown as a 3px left edge + label on the row. |
| **Quests** | To-dos generated from rule checks | e.g. missing stop, trade over risk limit, stale manual price (> 7 days), no backup this week. Ticked when the check passes. |
| **Achievements** | Habit milestones | Locked ones show progress (`7 / 10`). Examples: Discipline, Paper First, Cool Head, Patient, Diversified. |
| **Journal streak** | Consecutive days with a journal entry | Small flame icon next to the count. |
| **Seasons** | Month-end net worth, last 6 months | Current month in accent, others in accent-soft. |

## Theme

- **Day** (light) and **Night** (dark), both first-class. Default follows the OS (`prefers-color-scheme`); manual override saved per browser.
- Palette: **Ocean** (blue-teal accent). Colours are tokens in `src/index.css`; components never use raw values.

### Tokens (OKLCH)

| Token | Day | Night | Use |
|---|---|---|---|
| `--bg` | `0.965 0.006 270` | `0.17 0.020 280` | Page ground |
| `--surface` | `1 0 0` | `0.21 0.022 280` | Cards (solid) |
| `--surface-2` | `0.955 0.008 270` | `0.25 0.025 280` | Stat tiles, quest rows, table header |
| `--border` | `0.90 0.010 270` | `0.31 0.025 280` | 1px card borders, row rules |
| `--empty` | `0.92 0.010 270` | `0.29 0.022 280` | Unfilled bar segments |
| `--text` | `0.24 0.030 275` | `0.95 0.010 280` | Text and numbers |
| `--text-muted` | `0.48 0.025 275` | `0.72 0.020 280` | Labels |
| `--accent` (XP) | `0.55 0.14 232` | `0.75 0.12 222` | Level, XP, active nav, primary button, safe risk bars |
| `--accent-deep` | `0.42 0.12 232` | `0.56 0.12 228` | Button "press" shadow |
| `--accent-soft` | `0.93 0.035 228` | `0.31 0.06 228` | Chart area, PAPER badge, past seasons |
| `--accent-text` | `0.44 0.13 232` | `0.85 0.08 222` | Accent text on soft backgrounds |
| `--accent-fg` | `0.99 0 0` | `0.16 0.02 240` | Text on accent |
| `--up` | `0.50 0.13 150` | `0.76 0.15 150` | Gains |
| `--down` | `0.55 0.19 25` | `0.70 0.17 25` | Losses, over limit, no stop |
| `--warn` | `0.75 0.15 70` | `0.80 0.14 75` | Near a limit (80–100%) |
| `--fire-yellow` / `-orange` / `-red` | `0.90 0.16 95` / `0.76 0.18 55` / `0.60 0.21 30` | `0.92 0.15 95` / `0.78 0.17 55` / `0.64 0.21 30` | Heat bar and flames only |
| `--fire-soft` / `--fire-edge` | `0.97 0.03 60` / `0.86 0.09 50` | `0.25 0.05 45` / `0.45 0.12 45` | Heat card when HOT or above |
| `--cat-stocks` `--cat-cash` `--cat-crypto` `--cat-bonds` `--cat-gold` | blue `0.56 0.15 255`, yellow `0.86 0.14 92`, violet `0.56 0.17 310`, teal `0.76 0.09 195`, gold `0.80 0.14 75` | slightly lighter, see CSS | Asset-class blocks and swatches |
| `--rarity-common` … `-legendary` | gray, blue, violet, amber-gold | lighter in Night | Rarity edge + label |

Check AA contrast (4.5:1 text, 3:1 large) once the tokens are in real components.

### Colour meaning (never mix)

- **Green / red = gain / loss only**, always with ▲ / ▼ and a sign. Never colour alone.
- **Fire colours = portfolio heat only.**
- **Accent (ocean) = progress and "you are here"**: XP, active nav, primary action, safe risk.
- Asset-class colours avoid green and red so a block is never read as a gain or loss.

## Typography

| Role | Font | Use |
|---|---|---|
| Display | **Jersey 10** (pixel) | Hero numbers (net worth, heat %), section titles (`HOLDINGS`, `QUESTS`), stat tile values, block percentages |
| Labels | **Silkscreen** (pixel caps) | Small uppercase labels, nav, badges, legends. Minimum 11px (9–10px in the mock is too small; raise it). |
| UI / body | **Geist** | Names, quest text, descriptions, buttons' longer text |
| Data | **Geist Mono** | Prices, values, % changes in tables |

- All numbers use tabular figures.
- Fonts are self-hosted from npm (`@fontsource/*`), no Google Fonts requests.

## Number formatting

- `Intl.NumberFormat` with the active UI locale (`en-US` / `id-ID`). IDR without decimals. Compact (`Rp86.4M` / `Rp86,4 jt`) only in tiles and charts, full values in tables.
- Percent: 2 decimals for daily change, 1 for heat and risk.
- Every price shows its as-of time on hover/focus.

## Language

English and Bahasa Indonesia, switchable. Game words get translated too (LEVEL → LEVEL, QUESTS → MISI, ACHIEVEMENTS → PENCAPAIAN …); market terms stay as-is (ARA, ARB, lot, IHSG, LQ45, R).

## Layout

- Desktop-first (1280–1600px); works down to 768px.
- Content max width ~1180px, centred. 16px gap between cards, 16–20px card padding.
- Cards: `--surface`, 1px `--border`, 10px radius. Inner tiles 8px radius. Bar segments 2–3px radius.
- Order on the dashboard: header → net worth + level + stat tiles → heat + trade risk → achievements → inventory → holdings + quests/seasons/mood.
- Lists use a dotted leader between name and value (ledger style).

## Motion

- Net worth counts up once on first load (~1s, ease-out). Not on later price updates.
- Flames flicker in stepped frames (`steps(2)`), each at a slightly different speed.
- XP's last filled segment and "LEVEL UP SOON" pulse gently.
- Everything else: 150–250ms state transitions only.
- All of the above is off under `prefers-reduced-motion: reduce`.

## Components

Built from shadcn/ui, restyled with the tokens. Every interactive component has default, hover, focus, active, disabled, loading and error states.

- **Primary button:** accent fill, 8px radius, `0 3px 0 var(--accent-deep)` shadow; on press, translate 2px down and drop the shadow (game button).
- **Focus:** 2px accent ring, offset 2px.
- **Badges:** `PAPER` (accent-soft), `! NO STOP` (warn-soft), `SAMPLE DATA` (surface-2). Always text, never colour alone.
- **Icons:** 8×8 pixel icons (coin, heart, chest, star, bolt, trophy, shield, hourglass, flame) drawn as SVG paths with `shape-rendering: crispEdges`. Lucide only for plain UI controls (close, chevron, search).
- **Empty states:** game-flavoured but useful ("Inventory empty. Add your first holding or import a backup.").
- **AI text:** separate block labelled "AI summary", never styled like a calculated number.

## Charts

- Step lines for net worth, with a dashed "invested" line; today marked by a small gold block.
- Allocation as blocks sized by share (treemap), max ~6 blocks.
- Charts on solid surfaces. Every chart has a text alternative (`aria-label` or a table).
- Price charts (lightweight-charts): candles in `--up` / `--down`, stop and target as dashed labelled lines.

## Not doing

- Rewards for profit, leverage or trading more often.
- Pixel fonts in tables or inputs.
- Glass, blur, parallax.
- Colour as the only signal.
- Confetti or celebrations for gains.
