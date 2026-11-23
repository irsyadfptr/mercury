import type { Holding, JournalEntry, Transaction } from '@/types'

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

/** A sell older than this no longer asks for an exit lesson. */
export const EXIT_LESSON_DAYS = 14

/**
 * Pure: holdings sold in the last EXIT_LESSON_DAYS with no Exit or Lesson note about them dated on or after that sell.
 * One per holding (its latest sell), newest sell first.
 */
export function exitLessonsDue(holdings: readonly Holding[], txns: readonly Transaction[], journal: readonly JournalEntry[], today: string): Holding[] {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - EXIT_LESSON_DAYS * 86_400_000).toISOString().slice(0, 10)
  const lastSell = new Map<string, string>()
  for (const t of txns) {
    const d = t.date.slice(0, 10)
    if (t.type === 'sell' && d >= since && d > (lastSell.get(t.holdingId) ?? '')) lastSell.set(t.holdingId, d)
  }
  const written = (holdingId: string, from: string) => journal.some((j) => j.holdingId === holdingId && (j.tag === 'exit' || j.tag === 'lesson') && j.date >= from)
  return [...lastSell]
    .filter(([id, d]) => !written(id, d))
    .sort((a, b) => b[1].localeCompare(a[1]))
    .flatMap(([id]) => holdings.filter((h) => h.id === id))
}

/** Pure: newest day first, and newest entry first within a day. */
export function byDay(entries: readonly JournalEntry[]): [string, JournalEntry[]][] {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  const groups = new Map<string, JournalEntry[]>()
  for (const e of sorted) groups.set(e.date, [...(groups.get(e.date) ?? []), e])
  return [...groups]
}

/**
 * Pure: the last `weeks` weeks as calendar cells, Monday first, ending with the week of `today`: each day's number of
 * journal entries, and whether it is after today (drawn empty).
 */
export function journalCalendar(entries: readonly Pick<JournalEntry, 'date'>[], today: string, weeks = 5): { date: string; count: number; future: boolean }[] {
  const counts = new Map<string, number>()
  for (const e of entries) counts.set(e.date, (counts.get(e.date) ?? 0) + 1)
  const t = new Date(`${today}T00:00:00Z`)
  const monday = new Date(t)
  monday.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) - (weeks - 1) * 7)
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    const date = d.toISOString().slice(0, 10)
    return { date, count: counts.get(date) ?? 0, future: date > today }
  })
}
