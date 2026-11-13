import { describe, expect, it } from 'vitest'
import type { Holding } from '@/types'
import { pricesFor } from './coingecko'

const h = (p: Partial<Holding>) => ({ id: p.symbol, assetClass: 'crypto', currency: 'IDR', ...p }) as Holding

describe('pricesFor', () => {
  it('picks the price in the holding currency and skips unknown tickers and non-crypto', () => {
    const prices = { btc: { idr: 1_247_246_577, usd: 68_487 }, eth: { usd: 1927.06 } }
    const holdings = [h({ symbol: 'BTC' }), h({ symbol: 'ETH', currency: 'USD' }), h({ symbol: 'ETH2' }), h({ symbol: 'ETH', id: 'x', currency: 'IDR' }), h({ symbol: 'btc', id: 'gold', assetClass: 'gold' })]
    expect(pricesFor(holdings, prices)).toEqual({ BTC: 1_247_246_577, ETH: 1927.06 })
  })
})
