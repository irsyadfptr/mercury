import { describe, expect, it } from 'vitest'
import type { Holding, JournalEntry, Transaction } from '@/types'
import { parseBackup, toBackup } from './backup'
import { byDay, exitLessonsDue, journalStreak, journalCalendar } from './journal'

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

describe('exit lessons', () => {
  const h = (id: string): Holding => ({ id, assetClass: 'idx_stock', group: 'trading', symbol: id, currency: 'IDR', paper: false, createdAt: '2026-10-01T00:00:00.000Z' })
  const sell = (holdingId: string, date: string): Transaction => ({ id: `${holdingId}${date}`, holdingId, type: 'sell', date: `${date}T03:00:00.000Z`, quantity: 1, price: 1, fee: 0 })
  it('asks once per recent sell until an exit or lesson note is written', () => {
    const holdings = [h('BBCA'), h('ADRO'), h('PTBA')]
    const txns = [sell('BBCA', '2026-11-10'), sell('ADRO', '2026-11-15'), sell('PTBA', '2026-10-01')]
    expect(exitLessonsDue(holdings, txns, [], '2026-11-16').map((x) => x.symbol)).toEqual(['ADRO', 'BBCA'])
    const note: JournalEntry = { ...e('2026-11-11'), tag: 'lesson', holdingId: 'BBCA' }
    const before: JournalEntry = { ...e('2026-11-09'), tag: 'exit', holdingId: 'ADRO' } // older than the sell
    expect(exitLessonsDue(holdings, txns, [note, before], '2026-11-16').map((x) => x.symbol)).toEqual(['ADRO'])
  })
})

describe('backup with dividends and cashflow', () => {
  it('round-trips, and older backups import with none', () => {
    const account = { id: 'bca', name: 'BCA', startingBalance: 0, archived: false, updatedAt: '2026-11-01T00:00:00.000Z' }
    const entry = { id: 'x', date: '2026-11-01', type: 'expense' as const, amount: 1, category: 'food', createdAt: '2026-11-01T00:00:00.000Z', account: 'bca' }
    const b = toBackup([], [], '2026-11-16T00:00:00.000Z', [], { cashflow: { entries: [entry], accounts: [account], bills: [], goals: [] } })
    const back = parseBackup(JSON.stringify(b))
    expect(back.ok && back.data.cashflow?.entries).toEqual([entry])
    const old = parseBackup(JSON.stringify({ schemaVersion: 1, exportedAt: '2026-11-01T00:00:00.000Z', holdings: [], transactions: [] }))
    expect(old.ok && [old.data.dividends, old.data.cashflow]).toEqual([[], undefined])
    const stray = toBackup([], [], '2026-11-16T00:00:00.000Z', [], { dividends: [{ id: 'd', holdingId: 'gone', date: '2026-11-01', amount: 1 }] })
    expect(parseBackup(JSON.stringify(stray)).ok).toBe(false)
  })
})

describe('journalCalendar', () => {
  it('covers whole weeks from Monday, counts entries per day and marks future days', () => {
    // 2026-11-25 is a Wednesday.
    const cells = journalCalendar([{ date: '2026-11-25' }, { date: '2026-11-25' }, { date: '2026-11-17' }, { date: '2026-01-01' }], '2026-11-25', 2)
    expect(cells).toHaveLength(14)
    expect(cells[0].date).toBe('2026-11-16')
    expect(cells.at(-1)!.date).toBe('2026-11-29')
    expect(cells.find((c) => c.date === '2026-11-25')).toEqual({ date: '2026-11-25', count: 2, future: false })
    expect(cells.find((c) => c.date === '2026-11-17')!.count).toBe(1)
    expect(cells.filter((c) => c.future).map((c) => c.date)).toEqual(['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'])
  })
  it('starts on the same Monday when today is a Monday or a Sunday', () => {
    expect(journalCalendar([], '2026-11-23', 1)[0].date).toBe('2026-11-23')
    expect(journalCalendar([], '2026-11-29', 1)[0].date).toBe('2026-11-23')
  })
})
