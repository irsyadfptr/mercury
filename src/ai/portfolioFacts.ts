import { LT_LOW_SCORE } from '@/market/scoreLog'
import type { Summary } from '@/types'

const pct = (n: number) => `${n.toFixed(1)}%`
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`

/**
 * Pure: the portfolio as text lines for the AI. Percentages only: no rupiah amounts, quantities or prices leave the app.
 * Sold-out holdings and ones without an IDR value (USD with no rate) are left out.
 */
export function portfolioFacts(s: Summary, heatLimit: number, tradeLimit: number): string[] {
  if (s.netWorth <= 0) return []
  const share = (v: number) => pct((v / s.netWorth) * 100)
  const held = s.rows.filter((r) => r.v.quantity > 0 && Number.isFinite(r.v.valueIdr)).sort((a, b) => b.v.valueIdr - a.v.valueIdr)
  const classes = Object.entries(s.byClass)
    .sort(([, a], [, b]) => b - a)
    .map(([c, v]) => `${c} ${share(v)}`)
  return [
    `Total profit/loss on what is held: ${signed(s.invested > 0 ? (s.unrealized / s.invested) * 100 : 0)}`,
    `Investing (long-term) ${share(s.byGroup.investing)} · Trading (3–6 month swings) ${share(s.byGroup.trading)}`,
    `By asset class: ${classes.join(' · ')}`,
    `Portfolio heat (loss if every trade's stop hits, % of net worth): ${pct(s.heat)} against a ${pct(heatLimit)} limit; limit per trade ${pct(tradeLimit)}`,
    `The user's written rules: trading = 3–6 month swings that exit at the stop, or after ~8 weeks (56 days) with no progress, risking at most the per-trade limit; investing = long-term holds of businesses with a long-term score of at least ${LT_LOW_SCORE}/15 (below that is weak).`,
    `Holdings (${held.length}), largest first:`,
    ...held.map((r) => {
      const h = r.holding
      const risk = r.risk.kind === 'ok' ? `stop risk ${pct(r.risk.pct)} of net worth` : r.risk.kind === 'noStop' ? 'trade with NO stop set' : null
      return [
        `- ${h.symbol}${h.name ? ` (${h.name})` : ''}`,
        `${h.assetClass}, ${h.group}${h.paper ? ', PAPER (simulated)' : ''}`,
        `${share(r.v.valueIdr)} of portfolio`,
        `P/L ${signed(r.v.unrealizedPct)}${r.v.priceSource === 'cost' ? ' (no price entered, valued at cost)' : ''}`,
        `held ${r.daysHeld} days`,
        risk,
      ]
        .filter(Boolean)
        .join(' · ')
    }),
    ...(s.missingFx.length ? [`Left out (no USD/IDR rate set): ${s.missingFx.map((h) => h.symbol).join(', ')}`] : []),
  ]
}
