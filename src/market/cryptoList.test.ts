import { describe, expect, it } from 'vitest'
import { pickTopCoins } from './cryptoList'

const m = (symbol: string, name: string, current_price = 10) => ({ symbol, name, current_price })

describe('pickTopCoins', () => {
  const binance = new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'WBTCUSDT', 'STETHUSDT', 'FDUSDUSDT'])
  it('keeps market-cap order, drops stablecoins, wrapped/staked copies and coins without a Binance pair', () => {
    const markets = [m('btc', 'Bitcoin'), m('eth', 'Ethereum'), m('usdt', 'Tether', 1), m('steth', 'Lido Staked Ether'), m('wbtc', 'Wrapped Bitcoin'), m('hype', 'Hyperliquid'), m('fdusd', 'First Digital USD', 1), m('sol', 'Solana')]
    expect(pickTopCoins(markets, binance)).toEqual(['BTC', 'ETH', 'SOL'])
  })
  it('treats an unknown coin pegged near $1 as a stablecoin', () => {
    expect(pickTopCoins([m('sol', 'Solana', 1.005)], binance)).toEqual([])
  })
  it('stops at n', () => expect(pickTopCoins([m('btc', 'Bitcoin'), m('eth', 'Ethereum')], binance, 1)).toEqual(['BTC']))
})

describe('watchlist', () => {
  it('adds watched tickers missing from the list, at the end, without duplicates', async () => {
    const { withWatched } = await import('@/watchlist')
    expect(withWatched(['BTC', 'ETH'], ['HYPE', 'ETH'])).toEqual(['BTC', 'ETH', 'HYPE'])
  })
})
