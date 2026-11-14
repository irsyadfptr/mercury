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

const KEY = 'mercury.scanLog'
export function loadScanLog(): ScanLog {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as ScanLog
  } catch {
    return {}
  }
}
export function saveScanLog(log: ScanLog) {
  try {
    localStorage.setItem(KEY, JSON.stringify(log))
  } catch {
    // Storage blocked: changes just won't show next time.
  }
}
