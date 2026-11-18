// The circuit breaker and pre-trade gate with the app's live data: holdings, net worth, heat, limits and the last mood.
import { useMemo } from 'react'
import { circuitBreaker, DEFAULT_BREAKER, type Breaker } from './domain/circuitBreaker'
import { localDate } from './domain/cashflow'
import { preTradeGate, type Gate } from './domain/preTradeGate'
import { loadMood } from './market/marketMood'
import { useSettings } from './settings'
import { useStore } from './store'
import type { AssetClass, Currency } from './types'
import { useNow } from './useNow'
import { useSummary } from './useSummary'

/** Real and paper breakers for today. */
export function useBreakers(): Record<'real' | 'paper', Breaker> {
  const holdings = useStore((s) => s.holdings)
  const txns = useStore((s) => s.transactions)
  const usdIdr = useSettings((s) => s.usdIdr)
  const settings = useSettings((s) => s.breaker) ?? DEFAULT_BREAKER
  const { netWorth } = useSummary()
  const today = localDate(useNow())
  return useMemo(() => {
    const at = (paper: boolean) => circuitBreaker(holdings, txns, { paper, netWorth, usdIdr, today, settings })
    return { real: at(false), paper: at(true) }
  }, [holdings, txns, usdIdr, settings, netWorth, today])
}

export interface PlannedEntry {
  paper: boolean
  assetClass: AssetClass
  currency: Currency
  /** undefined = no written thesis asked for (a Scanner signal). */
  planWritten?: boolean
  entry?: number
  stop?: number
  /** Units bought (shares, not lots). */
  units: number
}

/** Returns a function that runs the gate on a planned entry. */
export function useGate(): (p: PlannedEntry) => Gate {
  const breakers = useBreakers()
  const { netWorth, heat } = useSummary()
  const tradeLimit = useSettings((s) => s.tradeLimit)
  const heatLimit = useSettings((s) => s.heatLimit)
  const usdIdr = useSettings((s) => s.usdIdr)
  const settings = useSettings((s) => s.breaker) ?? DEFAULT_BREAKER
  const today = localDate(useNow())
  return (p) => {
    const breaker = breakers[p.paper ? 'paper' : 'real']
    const market = p.assetClass === 'idx_stock' ? 'idx' : p.assetClass === 'crypto' ? 'crypto' : undefined
    return preTradeGate({
      planWritten: p.planWritten,
      entry: p.entry,
      stop: p.stop,
      units: p.units,
      fx: p.currency === 'IDR' ? 1 : usdIdr || NaN,
      netWorth,
      tradeLimit,
      heat,
      heatLimit,
      lastLoss: breaker.lastLoss,
      mood: market ? loadMood(market) : null,
      breaker,
      today,
      settings,
    })
  }
}
