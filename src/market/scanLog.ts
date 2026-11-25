// Remembers the last two scans (by price date) so the Scanner can show what changed since the previous session.

export interface ScanSnapshot {
  /** Date of the latest price bar, 'yyyy-mm-dd'. */
  date: string
  /** Every rule passes. */
  passing: string[]
  /** Price inside the buy zone. */
  inZone: string[]
}
export interface ScanLog {
  latest?: ScanSnapshot
  previous?: ScanSnapshot
}

/** Pure: a new scan replaces `latest`; the old latest becomes `previous` only when the price date moved on. */
export function recordScan(log: ScanLog, snap: ScanSnapshot): ScanLog {
  if (!log.latest || log.latest.date === snap.date) return { previous: log.previous, latest: snap }
  return { previous: log.latest, latest: snap }
}

const added = (now: string[], before: string[]) => now.filter((s) => !before.includes(s))

/** Pure: tickers that started or stopped passing / being in the zone since the previous scan. */
export function scanChanges(log: ScanLog) {
  const { latest: n, previous: p } = log
  if (!n || !p) return undefined
  return {
    since: p.date,
    date: n.date,
    newPassing: added(n.passing, p.passing),
    lostPassing: added(p.passing, n.passing),
    newInZone: added(n.inZone, p.inZone),
    leftZone: added(p.inZone, n.inZone),
  }
}

export type ScanMarket = 'idx' | 'crypto' | 'us'
const key = (m: ScanMarket) => (m === 'idx' ? 'mercury.scanLog' : `mercury.scanLog.${m}`)
export function loadScanLog(market: ScanMarket = 'idx'): ScanLog {
  try {
    return JSON.parse(localStorage.getItem(key(market)) ?? '{}') as ScanLog
  } catch {
    return {}
  }
}
export function saveScanLog(log: ScanLog, market: ScanMarket = 'idx') {
  try {
    localStorage.setItem(key(market), JSON.stringify(log))
  } catch {
    // Storage blocked: changes just won't show next time.
  }
}

/** A short-term buy signal as the last scan saw it (src/market/shortSwing.ts). */
export interface ShortSignal {
  symbol: string
  /** Start time of the signal bar: ISO for 4H bars, 'yyyy-mm-dd' for daily. */
  time: string
  entry: number
  stop: number
  target: number
}
export interface ShortLog {
  scannedAt: number
  signals: ShortSignal[]
}
export type ShortStyle = 'week' | 'month'
const shortKey = (m: ScanMarket, s: ShortStyle) => `mercury.shortLog.${m}.${s}`
export function loadShortLog(m: ScanMarket, s: ShortStyle): ShortLog | undefined {
  try {
    return (JSON.parse(localStorage.getItem(shortKey(m, s)) ?? 'null') as ShortLog | null) ?? undefined
  } catch {
    return undefined
  }
}
export function saveShortLog(m: ScanMarket, s: ShortStyle, log: ShortLog) {
  try {
    localStorage.setItem(shortKey(m, s), JSON.stringify(log))
  } catch {
    // Storage blocked: no Dashboard alert.
  }
}

/** How long after its bar closes a short-term signal still counts as fresh: half a day (≤ 1 week) or two days (≤ 1 month). */
export const SHORT_FRESH_MS: Record<ShortStyle, number> = { week: 12 * 3600_000, month: 2 * 864e5 }
const BAR_MS: Record<ShortStyle, number> = { week: 4 * 3600_000, month: 864e5 }

/** Pure: the signals whose bar closed within the freshness window. */
export function freshSignals(log: ShortLog | undefined, style: ShortStyle, now = Date.now()): ShortSignal[] {
  return (log?.signals ?? []).filter((x) => {
    const start = Date.parse(x.time.length <= 10 ? `${x.time}T00:00:00Z` : x.time)
    return now - (start + BAR_MS[style]) <= SHORT_FRESH_MS[style]
  })
}
