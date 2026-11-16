import { describe, expect, it } from 'vitest'
import type { CashEntry } from '@/types'
import { addMonths, categoriesFor, entryToRow, lastMonths, mergeEntries, missingFromRows, monthSummary, padInput, rowsToEntries, validateCategoryName } from './cashflow'

let n = 0
const e = (date: string, type: CashEntry['type'], amount: number, category: string): CashEntry => ({
  id: `e${++n}`,
  date,
  type,
  amount,
  category,
  createdAt: `${date}T10:00:00.000Z`,
})

const entries = [
  e('2026-11-01', 'income', 10_000_000, 'salary'),
  e('2026-11-02', 'expense', 3_000_000, 'housing'),
  e('2026-11-05', 'expense', 1_000_000, 'groceries'),
  e('2026-11-09', 'expense', 500_000, 'Coffee'), // custom category
  e('2026-10-15', 'expense', 2_000_000, 'housing'),
]

describe('month summary', () => {
  it('totals, savings rate, categories and pace', () => {
    const s = monthSummary(entries, '2026-11', '2026-11-15')
    expect(s).toMatchObject({ income: 10_000_000, expense: 4_500_000, net: 5_500_000, daysElapsed: 15, daysInMonth: 30 })
    expect(s.savingsRate).toBeCloseTo(55)
    expect(s.expenseByCategory.map((c) => c.category)).toEqual(['housing', 'groceries', 'Coffee'])
    expect(s.expenseByCategory[0].pct).toBeCloseTo(66.67, 1)
    expect(s.projectedExpense).toBe(9_000_000) // 4.5M over 15 days → 30 days
  })

  it('past months are complete; no income means no savings rate', () => {
    expect(monthSummary(entries, '2026-10', '2026-11-15')).toMatchObject({ expense: 2_000_000, savingsRate: null, daysElapsed: 31, projectedExpense: 2_000_000 })
  })

  it('last months, oldest first, across a year boundary', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(lastMonths(entries, '2026-11', 3)).toEqual([
      { month: '2026-09', income: 0, expense: 0 },
      { month: '2026-10', income: 0, expense: 2_000_000 },
      { month: '2026-11', income: 10_000_000, expense: 4_500_000 },
    ])
  })
})

describe('sync helpers', () => {
  it('merges pending over synced, newest first', () => {
    const merged = mergeEntries([entries[0], entries[1]], [{ ...entries[1], amount: 1 }, entries[2]])
    expect(merged.map((x) => x.id)).toEqual([entries[2].id, entries[1].id, entries[0].id])
    expect(merged.find((x) => x.id === entries[1].id)?.amount).toBe(1)
  })

  it('round-trips rows and skips bad hand-edited ones', () => {
    const { entries: parsed, skipped } = rowsToEntries([
      entryToRow(entries[1]),
      ['', '', ''],
      ['x', 'not a date', 'expense', '5', 'food', '', '2026-11-01T00:00:00.000Z'],
      ['y', '2026-11-03', 'expense', 'Rp25,000', 'food', 'lunch', '2026-11-03T05:00:00.000Z'],
    ])
    expect(skipped).toBe(1)
    expect(parsed[0]).toEqual(entries[1])
    expect(parsed[1]).toMatchObject({ amount: 25_000, note: 'lunch' })
  })
})

describe('rows typed by hand in the Sheet', () => {
  it('fills a missing id and createdAt, reads Sheets date numbers, any case', () => {
    const r = rowsToEntries(
      [
        ['', 46342, 'Expense', 25000, 'Food', 'lunch'], // 46342 = 2026-11-16 as Sheets stores a typed date
        ['', '16/11/2026', 'income', '1.000.000', 'salary', '', '', 'BCA'],
        ['keep', '2026-11-16', 'expense', 5000, 'otherincome', '', '2026-11-16T01:00:00.000Z'],
      ],
      { newId: () => 'new', now: '2026-11-16T10:00:00.000Z' },
    )
    expect(r.skipped).toBe(0)
    expect(r.entries[0]).toEqual({ id: 'new', date: '2026-11-16', type: 'expense', amount: 25000, category: 'food', note: 'lunch', createdAt: '2026-11-16T10:00:00.000Z' })
    expect(r.entries[1]).toMatchObject({ date: '2026-11-16', amount: 1_000_000, account: 'BCA' })
    expect(r.entries[2].category).toBe('otherIncome')
    expect(r.filled).toEqual([
      { row: 0, id: 'new', createdAt: '2026-11-16T10:00:00.000Z' },
      { row: 1, id: 'new', createdAt: '2026-11-16T10:00:00.000Z' },
    ])
  })

  it('finds the entries another sheet lacks (carried over when a device switches sheets)', () => {
    expect(missingFromRows(entries.slice(0, 3), [entryToRow(entries[1]), [], [` ${entries[2].id} `]])).toEqual([entries[0]])
  })

  it('without fill, rows missing an id are skipped as before', () => {
    expect(rowsToEntries([['', '2026-11-16', 'expense', 1, 'food']]).skipped).toBe(1)
  })
})

describe('custom categories', () => {
  it('lists built-ins, then custom from this device and from entries, deduped', () => {
    const custom = [
      { type: 'expense' as const, name: 'Pets' },
      { type: 'income' as const, name: 'Rent' },
      { type: 'expense' as const, name: 'coffee' }, // same as an entry's "Coffee"
    ]
    const list = categoriesFor('expense', custom, entries)
    expect(list.slice(0, 10)).toEqual(['housing', 'groceries', 'food', 'transport', 'bills', 'health', 'shopping', 'entertainment', 'family', 'other'])
    expect(list.slice(10)).toEqual(['coffee', 'Pets'])
    expect(categoriesFor('income', custom, entries)).toEqual(['salary', 'bonus', 'freelance', 'investment', 'otherIncome', 'Rent'])
  })

  it('validates new names', () => {
    const labels = ['Housing', 'Pets']
    expect(validateCategoryName('  Kids   school ', labels)).toEqual({ ok: true, name: 'Kids school' })
    expect(validateCategoryName('   ', labels)).toEqual({ ok: false, error: 'required' })
    expect(validateCategoryName('x'.repeat(25), labels)).toEqual({ ok: false, error: 'tooLong' })
    expect(validateCategoryName('housing', labels)).toEqual({ ok: false, error: 'duplicate' })
    expect(validateCategoryName('PETS', labels)).toEqual({ ok: false, error: 'duplicate' })
  })
})

describe('number pad', () => {
  it('builds amounts', () => {
    expect(['0', '4', '2', '000', 'back', '5', 'x'].reduce(padInput, '')).toBe('42005')
    expect(padInput('99999999999', '1')).toBe('99999999999')
  })
})
