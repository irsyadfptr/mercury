// One entry point for "what is this market's mood": the IDX formula (mood.ts) or crypto mood v2 (cryptoRegime.ts).
// Both share the same 0–100 scale and the same Defensive line (MOOD_DEFENSIVE), so the live rules treat them alike.
import { cryptoMood, cryptoMoodSeries, type CryptoMood, type RegimeExtras } from './cryptoRegime'
import type { Bar } from './indicators'
import { idxMood, moodSeries, type IdxMood, type MoodLight } from './mood'

export type MoodMarket = 'idx' | 'crypto' | 'us'
export interface MarketMood {
  score: number
  light: MoodLight
  /** Set for IDX. */
  idx?: IdxMood
  /** Set for crypto. */
  crypto?: CryptoMood
}
/** A scanned ticker's daily bars. */
export interface MoodInput {
  symbol: string
  bars: readonly Bar[]
}

/** The crypto index (BTC) is scored on its own; the rest of the list is the alt universe. */
const CRYPTO_INDEX = 'BTC'
const alts = (rows: readonly MoodInput[]) => rows.filter((r) => r.symbol !== CRYPTO_INDEX).map((r) => r.bars)

export function marketMood(market: MoodMarket, index: readonly Bar[] | undefined, rows: readonly MoodInput[], extras?: RegimeExtras): MarketMood | undefined {
  // IDX and US share one formula (breadth, index trend, index calm): IHSG or SPY as the index.
  if (market !== 'crypto') {
    const m = idxMood(index ?? [], rows.map((r) => r.bars))
    return m && { score: m.score, light: m.light, idx: m }
  }
  const m = cryptoMood(index ?? [], alts(rows), extras)
  return m && { score: m.score, light: m.light, crypto: m }
}

/** Mood score as of each past date (crypto: the price-only parts; see cryptoMoodSeries). */
export const marketMoodSeries = (market: MoodMarket, index: readonly Bar[] | undefined, rows: readonly MoodInput[]): Map<string, number> =>
  market !== 'crypto' ? moodSeries(index ?? [], rows.map((r) => r.bars)) : cryptoMoodSeries(index ?? [], alts(rows))

// ---- Last mood per market, for the pre-trade gate (which runs outside the Scanner) ----

export interface SavedMood {
  score: number
  light: MoodLight
  /** Local date of the scan, yyyy-mm-dd. */
  date: string
}
const moodKey = (m: MoodMarket) => `mercury.mood.${m}`
export function saveMood(market: MoodMarket, mood: MarketMood | undefined, date: string) {
  if (!mood) return
  try {
    localStorage.setItem(moodKey(market), JSON.stringify({ score: mood.score, light: mood.light, date } satisfies SavedMood))
  } catch {
    // Storage blocked: the gate shows the mood as unknown.
  }
}
export function loadMood(market: MoodMarket): SavedMood | undefined {
  try {
    return (JSON.parse(localStorage.getItem(moodKey(market)) ?? 'null') as SavedMood | null) ?? undefined
  } catch {
    return undefined
  }
}
