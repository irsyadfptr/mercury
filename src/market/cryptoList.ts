// Coins for the crypto scan, each traded against USDT on Binance.
// Source: Binance spot 24h volume (data-api.binance.vision /ticker/24hr) on 2026-11-14, keeping established coins with at least
// a year of history on Binance and leaving out stablecoins, tokenised stocks and new listings (HYPE: only 51 days on Binance). Update by hand now and then.
export const CRYPTO_COINS = [
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'TRX', 'AVAX', 'LINK',
  'SUI', 'XLM', 'BCH', 'LTC', 'NEAR', 'APT', 'UNI', 'HBAR', 'DOT', 'FIL',
  'AAVE', 'INJ', 'ARB', 'OP', 'RENDER', 'WLD', 'PEPE', 'TAO', 'ENA', 'ONDO',
] as const
