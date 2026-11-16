import type { JournalEntry } from '@/types'

const prevDay = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** Pure: days in a row with an entry, ending today, or yesterday while today has none yet (the streak is still alive). */
export function journalStreak(entries: readonly Pick<JournalEntry, 'date'>[], today: string): number {
  const days = new Set(entries.map((e) => e.date))
  let d = days.has(today) ? today : prevDay(today)
  let n = 0
  while (days.has(d)) {
    n++
    d = prevDay(d)
  }
  return n
}

/** Pure: newest day first, and newest entry first within a day. */
export function byDay(entries: readonly JournalEntry[]): [string, JournalEntry[]][] {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  const groups = new Map<string, JournalEntry[]>()
  for (const e of sorted) groups.set(e.date, [...(groups.get(e.date) ?? []), e])
  return [...groups]
}
