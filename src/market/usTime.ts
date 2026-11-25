// New York session time for US bars. Pure (no settings or network), so the rule modules can import it.
import { aggregate, type Bar } from './indicators'

const NY = 'America/New_York'
/** 'yyyy-mm-dd hh:mm' in New York time for a UTC instant. */
function nyClock(ms: number): { date: string; time: string } {
  const [date, time] = new Date(ms).toLocaleString('sv-SE', { timeZone: NY }).split(' ')
  return { date, time: time.slice(0, 5) }
}
/** New York's offset from UTC at that instant, in ms (−4 h in summer, −5 h in winter). */
function nyOffset(ms: number): number {
  const { date, time } = nyClock(ms)
  return Date.parse(`${date}T${time}:00Z`) - (ms - (ms % 60_000))
}
/** The exchange (New York) date of an intraday bar time; a daily bar's date is returned as it is. */
export const usDayOf = (t: string): string => (t.length <= 10 ? t : nyClock(Date.parse(t)).date)

/**
 * Pure: hourly bars → two session blocks a day, 09:30–13:30 and 13:30–16:00 New York time, each timed at its start
 * (UTC ISO). Like IDX's two blocks, so the short-term rules see the same shape whatever the source's own 4H alignment.
 */
export const toUs4h = (bars: readonly Bar[]): Bar[] =>
  aggregate(bars, (t) => {
    const ms = Date.parse(t)
    const { date, time } = nyClock(ms)
    const start = time < '13:30' ? '09:30' : '13:30'
    return new Date(Date.parse(`${date}T${start}:00Z`) - nyOffset(ms)).toISOString()
  })
