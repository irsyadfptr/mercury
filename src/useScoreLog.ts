import { useEffect, useState } from 'react'
import { localDate } from './domain/cashflow'
import { scoreFundamentals } from './market/fundamentals'
import { fetchFundamentals, IDX_AVAILABLE, type FundamentalRow } from './market/idx'
import type { Row } from './types'
import { loadScoreLog, recordScore, saveScoreLog, type ScoreLog } from './market/scoreLog'

/** Pure: a scored check as a log entry for today. */
export function logCheck(log: ScoreLog, row: FundamentalRow): ScoreLog {
  const s = scoreFundamentals(row.input)
  return recordScore(log, row.symbol, { date: localDate(Date.now()), total: s.total, known: s.known, price: row.input.price })
}

/** IDX stocks still held in the Investing group: the ones the long-term score watches. */
export const longTermSymbols = (rows: Row[]) =>
  rows.filter((r) => r.holding.group === 'investing' && r.holding.assetClass === 'idx_stock' && r.v.quantity > 0).map((r) => r.holding.symbol.toUpperCase())

/** Records a check made elsewhere (the Long-term page). */
export const saveCheck = (row: FundamentalRow) => saveScoreLog(logCheck(loadScoreLog(), row))

/** The score log, after re-checking (dev server only) any of `symbols` not yet checked today. */
export function useScoreLog(symbols: string[]): ScoreLog {
  const [log, setLog] = useState(loadScoreLog)
  const key = [...new Set(symbols)].sort().join(',')
  useEffect(() => {
    if (!IDX_AVAILABLE || !key) return
    let live = true
    void (async () => {
      const today = localDate(Date.now())
      // One at a time: each is two idx calls, and the dev server caches them for the day.
      for (const symbol of key.split(',')) {
        if (loadScoreLog()[symbol]?.at(-1)?.date === today) continue
        try {
          const next = logCheck(loadScoreLog(), await fetchFundamentals(symbol))
          saveScoreLog(next)
          if (live) setLog(next)
        } catch {
          // Unknown ticker or idx down: keep the last logged score.
        }
      }
    })()
    return () => {
      live = false
    }
  }, [key])
  return log
}
