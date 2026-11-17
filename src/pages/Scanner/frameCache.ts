import type { Bar } from '@/market/indicators'

/** Chart bars per `${cacheKey}:${timeframe}`, kept for the visit so switching back doesn't refetch. */
export const frameCache = new Map<string, Bar[]>()
