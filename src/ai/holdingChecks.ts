import { fetchCryptoHistory } from '@/market/binance'
import { scoreFundamentals, type FundamentalScore } from '@/market/fundamentals'
import { fetchFundamentals, fetchHistory, IDX_AVAILABLE } from '@/market/idx'
import { checkSetup, CRYPTO_RULES, IDX_RULES, type Check } from '@/market/indicators'
import { loadScoreLog, type ScoreEntry } from '@/market/scoreLog'
import type { Row } from '@/types'

const pctFrom = (a: number, b: number) => `${a >= b ? '+' : '−'}${Math.abs((a / b - 1) * 100).toFixed(1)}%`

/** Pure: the swing-rule result for a holding, as percentages (no prices). */
export function swingLine(symbol: string, c: Check, lastDate: string): string {
  const rules = c.rules.map((r) => `${r.id} ${r.pass ? '✓' : r.pass === false ? '✗' : '?'}`).join(', ')
  const mas = [c.ma50 !== undefined && `price vs MA50 ${pctFrom(c.close, c.ma50)}`, c.ma200 !== undefined && `vs MA200 ${pctFrom(c.close, c.ma200)}`].filter(Boolean).join(', ')
  return `${symbol} swing rules on ${lastDate}: ${c.score}/${c.rules.length} pass (${rules})${mas ? `; ${mas}` : ''}`
}

/** Pure: a fresh long-term score with its weak spots. */
export function freshScoreLine(symbol: string, s: FundamentalScore): string {
  const parts = s.parts.map((p) => `${p.id} ${p.score}/5`).join(', ')
  const fails = s.parts.flatMap((p) => p.metrics.filter((m) => m.pass === false).map((m) => m.id))
  return `${symbol} long-term score today: ${s.total}/15, ${s.known}/15 with data (${parts})${fails.length ? `; fails: ${fails.join(', ')}` : ''}`
}

/** Pure: the last logged long-term score, when no fresh one can be fetched (deployed site). */
export const loggedScoreLine = (symbol: string, e: ScoreEntry) => `${symbol} long-term score ${e.total}/15 (${e.known}/15 with data), last checked ${e.date}`

/**
 * Fresh checks for each held stock or coin, fetched when the user asks: swing rules on daily bars, and the long-term
 * score for IDX stocks. IDX data needs the idx CLI (dev server only); elsewhere the last logged score is used.
 */
export async function holdingChecks(rows: Row[]): Promise<string[]> {
  const log = loadScoreLog()
  const held = rows.filter((r) => r.v.quantity > 0 && (r.holding.assetClass === 'idx_stock' || r.holding.assetClass === 'crypto'))
  const lines = await Promise.all(
    held.map(async ({ holding: h }): Promise<string[]> => {
      const symbol = h.symbol.toUpperCase()
      const idx = h.assetClass === 'idx_stock'
      const out: string[] = []
      try {
        if (idx && !IDX_AVAILABLE) throw new Error('no idx')
        const { bars } = await (idx ? fetchHistory(symbol) : fetchCryptoHistory(symbol))
        const c = checkSetup(bars, { rules: idx ? IDX_RULES : CRYPTO_RULES })
        if (c) out.push(swingLine(symbol, c, bars[bars.length - 1].time))
      } catch {
        out.push(`${symbol} swing rules: no price data here`)
      }
      if (idx) {
        try {
          if (!IDX_AVAILABLE) throw new Error('no idx')
          out.push(freshScoreLine(symbol, scoreFundamentals((await fetchFundamentals(symbol)).input)))
        } catch {
          const last = log[symbol]?.at(-1)
          out.push(last ? loggedScoreLine(symbol, last) : `${symbol} long-term score: never checked`)
        }
      }
      return out
    }),
  )
  return lines.length ? ['Fresh checks per holding:', ...lines.flat()] : []
}
