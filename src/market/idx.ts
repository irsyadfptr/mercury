// Client for the dev-server idx endpoints (idxPlugin.ts). Local only: the static build has no /api.
import { z } from 'zod'
import type { Bar } from './indicators'

/** False in the deployed static build, where the idx CLI can't run. */
export const IDX_AVAILABLE = import.meta.env.DEV

const candle = z.object({
  time: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
})
const history = z.object({ data: z.object({ symbol: z.string(), name: z.string().nullish(), candles: z.array(candle) }) })

export type IdxError = 'idx-missing' | 'not-found' | 'bad-symbol' | 'idx-failed'
export class IdxFetchError extends Error {
  code: IdxError
  constructor(code: IdxError) {
    super(code)
    this.code = code
  }
}

/** Pure: idx.history.v1 JSON → bars. Candle time is ISO with the WIB offset, so its first 10 chars are the exchange date. */
export function parseHistory(json: unknown): { name?: string; bars: Bar[] } {
  const d = history.parse(json).data
  return { name: d.name ?? undefined, bars: d.candles.map((c) => ({ ...c, time: c.time.slice(0, 10) })) }
}

export async function fetchHistory(symbol: string) {
  const res = await fetch(`/api/idx/history?symbol=${encodeURIComponent(symbol)}`)
  const body: unknown = await res.json().catch(() => ({}))
  if (!res.ok) {
    const code = (body as { error?: IdxError }).error
    throw new IdxFetchError(code ?? 'idx-failed')
  }
  return parseHistory(body)
}
