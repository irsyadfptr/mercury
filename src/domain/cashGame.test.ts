import { describe, expect, it } from 'vitest'
import type { Account, CashEntry, Goal } from '@/types'
import { DEFAULT_ACCOUNT, filterEntries, runningBalances } from './accounts'
import { frequentEntries } from './cashflow'
import { bestStreak, cashBadges, goalProgress, loggingStreak, monthScore, noSpendDays } from './cashGame'
import { parseVoice } from './voice'

const bca: Account = { id: 'bca', name: 'BCA', startingBalance: 1_000_000, archived: false, updatedAt: '2026-11-01T00:00:00.000Z' }
const accounts = [DEFAULT_ACCOUNT, bca]
let n = 0
// createdAt at local noon of `logged` (default: the entry date), so local-day logic is the same in any time zone.
const e = (date: string, type: CashEntry['type'], amount: number, category: string, extra: Partial<CashEntry> & { logged?: string } = {}): CashEntry => {
  const { logged, ...rest } = extra
  return { id: `e${++n}`, date, type, amount, category, createdAt: new Date(`${logged ?? date}T12:00:00`).toISOString(), ...rest }
}

describe('streaks and no-spend days', () => {
  const entries = [e('2026-11-14', 'expense', 1, 'food'), e('2026-11-15', 'expense', 1, 'food'), e('2026-11-01', 'expense', 1, 'food', { logged: '2026-11-16' })]
  it('counts logging days by when they were entered', () => {
    expect(loggingStreak(entries, '2026-11-16')).toBe(3)
    expect(loggingStreak(entries, '2026-11-18')).toBe(0)
    expect(bestStreak(entries)).toBe(3)
  })
  it('no-spend days so far this month (backdated spending counts on its date)', () => {
    expect(noSpendDays(entries, '2026-11', '2026-11-16')).toBe(16 - 3)
    expect(noSpendDays([e('2026-11-02', 'transfer', 5, 'transfer', { account: 'bca', toAccount: 'cash' })], '2026-11', '2026-11-03')).toBe(3)
  })
})

describe('month score', () => {
  it('four parts of 25', () => {
    const entries = [e('2026-11-01', 'income', 10_000, 'salary'), e('2026-11-02', 'expense', 9_000, 'food')]
    const matched = [{ ...DEFAULT_ACCOUNT, matchedAt: '2026-11-02' }, bca]
    const s = monthScore(entries, matched, '2026-11', '2026-11-04', 6_000)
    // budget 9k vs 6k → 50% over → 13; savings 10% of 20% → 13; logged 2 of 4 days → 13; 1 of 2 accounts → 13
    expect(s).toEqual({ budget: 13, savings: 13, logging: 13, matched: 13, total: 52 })
    expect(monthScore(entries, accounts, '2026-11', '2026-11-04').budget).toBe(0)
  })
})

describe('badges and goals', () => {
  it('earns from finished months, streaks, matches and goals', () => {
    const entries = [e('2026-10-01', 'income', 10_000, 'salary', { account: 'bca' }), e('2026-10-02', 'expense', 5_000, 'food', { account: 'bca' })]
    const goal: Goal = { id: 'g', name: 'Fund', target: 1_000_000, account: 'bca', archived: false, updatedAt: bca.updatedAt }
    expect(cashBadges(entries, accounts, [goal], '2026-11-16', 6_000)).toEqual(['firstEntry', 'underBudget', 'saver20', 'goalReached'])
    expect(goalProgress({ ...goal, target: 2_010_000 }, { bca: 1_005_000 })).toBe(0.5)
  })
})

describe('entry list helpers', () => {
  const entries = [
    e('2026-11-01', 'income', 100, 'salary', { account: 'bca', note: 'Gaji' }),
    e('2026-11-02', 'expense', 30, 'food', { account: 'bca', note: 'Kopi' }),
    e('2026-11-03', 'transfer', 50, 'transfer', { account: 'bca', toAccount: 'cash' }),
    e('2026-11-04', 'expense', 10, 'food', { note: 'Kopi' }),
  ]
  it('filters by account (either side of a transfer), category and text', () => {
    expect(filterEntries(entries, { account: 'cash', text: '' }, accounts, (c) => c).map((x) => x.amount)).toEqual([50, 10])
    expect(filterEntries(entries, { category: 'food', text: 'kopi' }, accounts, (c) => c).length).toBe(2)
    expect(filterEntries(entries, { text: 'bca' }, accounts, (c) => c).length).toBe(3)
  })
  it('running balance per account', () => {
    expect([...runningBalances('bca', accounts, entries).values()]).toEqual([1_000_100, 1_000_070, 1_000_020])
    expect([...runningBalances('cash', accounts, entries).values()]).toEqual([50, 40])
  })
  it('frequent entries need two uses in 90 days', () => {
    const more = [...entries, e('2026-11-05', 'expense', 30, 'food', { account: 'bca', note: 'Kopi' }), e('2026-07-01', 'expense', 30, 'food', { account: 'bca', note: 'Kopi' })]
    expect(frequentEntries(more, '2026-11-16')).toEqual([{ type: 'expense', category: 'food', amount: 30, note: 'Kopi', account: 'bca' }])
  })
})

describe('voice dates', () => {
  it.each([
    ['kemarin makan 25 ribu', 1, 'food'],
    ['tadi pagi bensin 20rb', 0, 'transport'],
    ['hari ini kopi 15rb', 0, 'food'],
    ['lunch yesterday 25k', 1, 'food'],
  ])('%s', (text, daysAgo, category) => {
    const v = parseVoice(text, accounts)
    expect(v).toMatchObject({ daysAgo, category, note: '' })
  })
  it('keeps "siang" in "makan siang" as a note word', () => expect(parseVoice('makan siang 25 ribu', accounts)).toMatchObject({ note: 'siang' }))
})
