import { describe, expect, it } from 'vitest'
import type { JournalEntry } from '@/types'
import { parseBackup, toBackup } from './backup'
import { byDay, journalStreak } from './journal'

const e = (date: string, createdAt = `${date}T01:00:00.000Z`): JournalEntry => ({ id: createdAt, date, tag: 'note', text: 'x', createdAt })

describe('journal', () => {
  it('counts the streak through today, or through yesterday while today is empty', () => {
    const days = [e('2026-11-11'), e('2026-11-12'), e('2026-11-13')]
    expect(journalStreak(days, '2026-11-13')).toBe(3)
    expect(journalStreak(days, '2026-11-14')).toBe(3)
    expect(journalStreak(days, '2026-11-15')).toBe(0)
    expect(journalStreak([e('2026-02-28'), e('2026-03-01')], '2026-03-01')).toBe(2)
    expect(journalStreak([], '2026-11-14')).toBe(0)
  })

  it('groups newest day first, newest entry first', () => {
    const g = byDay([e('2026-11-12'), e('2026-11-13', '2026-11-13T01:00:00.000Z'), e('2026-11-13', '2026-11-13T05:00:00.000Z')])
    expect(g.map(([d, xs]) => [d, xs.map((x) => x.createdAt.slice(11, 13))])).toEqual([
      ['2026-11-13', ['05', '01']],
      ['2026-11-12', ['01']],
    ])
  })

  it('round-trips through the backup; old backups without a journal still import', () => {
    const b = toBackup([], [], '2026-11-14T00:00:00.000Z', [e('2026-11-14')])
    const r = parseBackup(JSON.stringify(b))
    expect(r.ok && r.data.journal).toHaveLength(1)
    const { journal: _omit, ...old } = b
    const r2 = parseBackup(JSON.stringify(old))
    expect(r2.ok && r2.data.journal).toEqual([])
    expect(parseBackup(JSON.stringify(toBackup([], [], b.exportedAt, [{ ...e('2026-11-14'), holdingId: 'gone' }]))).ok).toBe(false)
  })
})
