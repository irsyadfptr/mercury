// Long-term score history per ticker, one entry per day checked. Feeds the Portfolio badge and Dashboard quests,
// and builds the record needed to test later whether high scores actually did better (NOTES.md "Long-term check").

export interface ScoreEntry {
  /** Local date of the check, 'yyyy-mm-dd'. */
  date: string
  /** 0–15. */
  total: number
  /** Inputs with data, 0–15. */
  known: number
  price: number | null
}
/** Oldest first. */
export type ScoreLog = Record<string, ScoreEntry[]>

/** A total below this is a weak business, price or risk for a long-term hold. */
export const LT_LOW_SCORE = 8
/** A fall of at least this many points since the previous check is worth a look. */
export const LT_SCORE_DROP = 3
// shortcut: entries per ticker capped at ~3 years of daily checks; move to a file/Sheet if the log grows past localStorage.
const MAX_ENTRIES = 1000

/** Pure: a check on the same date replaces that day's entry. */
export function recordScore(log: ScoreLog, symbol: string, e: ScoreEntry): ScoreLog {
  const prev = (log[symbol] ?? []).filter((x) => x.date !== e.date)
  return { ...log, [symbol]: [...prev, e].slice(-MAX_ENTRIES) }
}

export type ScoreAlert = { kind: 'drop'; total: number; from: number; since: string } | { kind: 'low'; total: number }

/** Pure: a drop beats low, so one ticker gives at most one alert. */
export function scoreAlert(entries: ScoreEntry[] | undefined): ScoreAlert | undefined {
  const last = entries?.at(-1)
  if (!last) return undefined
  const prev = entries!.at(-2)
  if (prev && prev.total - last.total >= LT_SCORE_DROP) return { kind: 'drop', total: last.total, from: prev.total, since: prev.date }
  if (last.total < LT_LOW_SCORE) return { kind: 'low', total: last.total }
  return undefined
}

/**
 * Pure: tickers in the log whose latest total beats `symbol`'s latest, best first (then more data known).
 * Only tickers checked within `maxAgeDays` of the newest check count, so a stale score can't look better.
 */
export function betterScored(log: ScoreLog, symbol: string, limit = 3, maxAgeDays = 30): { symbol: string; entry: ScoreEntry }[] {
  const mine = log[symbol]?.at(-1)
  if (!mine) return []
  const latest = Object.entries(log).flatMap(([s, entries]) => (entries.length ? [{ symbol: s, entry: entries.at(-1)! }] : []))
  const newest = latest.reduce((max, x) => (x.entry.date > max ? x.entry.date : max), '')
  const cutoff = new Date(Date.parse(`${newest}T00:00:00Z`) - maxAgeDays * 86_400_000).toISOString().slice(0, 10)
  return latest
    .filter((x) => x.symbol !== symbol && x.entry.total > mine.total && x.entry.date >= cutoff)
    .sort((a, b) => b.entry.total - a.entry.total || b.entry.known - a.entry.known)
    .slice(0, limit)
}

const KEY = 'mercury.ltScores'
export function loadScoreLog(): ScoreLog {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as ScoreLog
  } catch {
    return {}
  }
}
export function saveScoreLog(log: ScoreLog) {
  try {
    localStorage.setItem(KEY, JSON.stringify(log))
  } catch {
    // Storage blocked: scores show this visit only.
  }
}
