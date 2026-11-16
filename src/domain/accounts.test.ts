import { describe, expect, it } from 'vitest'
import type { Account, CashEntry } from '@/types'
import { accountBalances, accountsFromSheet, DEFAULT_ACCOUNT, mergeAccounts, resolveAccount, validateAccountName } from './accounts'
import { entryToRow, monthSummary, rowsToEntries } from './cashflow'
import { CashEntry as CashEntrySchema } from './schema'

const bca: Account = { id: 'bca', name: 'BCA', startingBalance: 1_000_000, archived: false, updatedAt: '2026-11-01T00:00:00.000Z' }
const cash: Account = { ...DEFAULT_ACCOUNT, startingBalance: 50_000 }
const accounts = [cash, bca]

let n = 0
const e = (type: CashEntry['type'], amount: number, extra: Partial<CashEntry> = {}): CashEntry => ({
  id: `e${++n}`,
  date: '2026-11-10',
  type,
  amount,
  category: type === 'transfer' ? 'transfer' : type === 'income' ? 'salary' : 'food',
  createdAt: '2026-11-10T10:00:00.000Z',
  ...extra,
})

describe('account balances', () => {
  it('starting balance + income − expense ± transfers; entries without an account count as Cash', () => {
    const entries = [
      e('income', 10_000_000, { account: 'bca' }),
      e('expense', 25_000), // older entry, no account → Cash
      e('expense', 100_000, { account: 'bca' }),
      e('transfer', 500_000, { account: 'bca', toAccount: 'cash' }),
    ]
    expect(accountBalances(accounts, entries)).toEqual({ cash: 50_000 - 25_000 + 500_000, bca: 1_000_000 + 10_000_000 - 100_000 - 500_000 })
  })

  it('entries dated before the balance date are already in the starting balance', () => {
    const dated = [{ ...bca, startingBalance: 1_000, balanceDate: '2026-11-16' }, cash]
    const entries = [
      e('expense', 200, { account: 'bca', date: '2026-11-10' }), // backdated: already in the 1,000
      e('income', 500, { account: 'bca', date: '2026-11-01' }), // backdated
      e('expense', 100, { account: 'bca', date: '2026-11-16' }), // on the day: counts
      e('transfer', 300, { account: 'bca', toAccount: 'cash', date: '2026-11-15' }), // BCA side skipped, Cash (no date) side counts
    ]
    expect(accountBalances(dated, entries)).toEqual({ bca: 900, cash: 50_300 })
    // Monthly totals still see every entry.
    expect(monthSummary(entries, '2026-11', '2026-11-16')).toMatchObject({ income: 500, expense: 300 })
  })

  it('transfers are never spending or income', () => {
    const s = monthSummary([e('expense', 25_000), e('transfer', 500_000, { account: 'bca', toAccount: 'cash' })], '2026-11', '2026-11-15')
    expect(s).toMatchObject({ income: 0, expense: 25_000 })
    expect(s.expenseByCategory.map((c) => c.category)).toEqual(['food'])
  })

  it('resolves ids, names typed in the Sheet, and unknowns to the default', () => {
    expect(resolveAccount('bca', accounts)).toBe('bca')
    expect(resolveAccount('Bca', accounts)).toBe('bca')
    expect(resolveAccount('Mandiri', accounts)).toBe('cash')
    expect(resolveAccount(undefined, accounts)).toBe('cash')
  })
})

describe('account names and merge', () => {
  it('validates names', () => {
    expect(validateAccountName('  Go  Pay ', accounts)).toEqual({ ok: true, name: 'Go Pay' })
    expect(validateAccountName('bca', accounts)).toEqual({ ok: false, error: 'duplicate' })
    expect(validateAccountName(' ', accounts)).toEqual({ ok: false, error: 'required' })
    expect(validateAccountName('x'.repeat(25), accounts)).toEqual({ ok: false, error: 'tooLong' })
  })

  it('newest edit wins, union by id, default always present', () => {
    const renamed = { ...bca, name: 'BCA Tahapan', updatedAt: '2026-11-05T00:00:00.000Z' }
    const gopay: Account = { id: 'gp', name: 'GoPay', startingBalance: 0, archived: true, updatedAt: '2026-11-02T00:00:00.000Z' }
    expect(mergeAccounts([bca], [renamed, gopay])).toEqual([renamed, DEFAULT_ACCOUNT, gopay])
    expect(mergeAccounts([renamed], [bca]).find((a) => a.id === 'bca')?.name).toBe('BCA Tahapan')
  })
})

describe('Sheet rows', () => {
  it('round-trips account and toAccount; old 7-column rows still parse', () => {
    const t = e('transfer', 500_000, { account: 'bca', toAccount: 'cash' })
    expect(rowsToEntries([entryToRow(t)]).entries).toEqual([t])
    const old = ['x1', '2026-11-01', 'expense', 25000, 'food', '', '2026-11-01T10:00:00.000Z']
    expect(rowsToEntries([old]).entries[0]).toMatchObject({ id: 'x1', amount: 25000 })
    expect(rowsToEntries([old]).entries[0].account).toBeUndefined()
  })

  it('rejects a transfer to the same account', () => {
    expect(CashEntrySchema.safeParse(e('transfer', 1, { account: 'cash', toAccount: 'cash' })).success).toBe(false)
    expect(CashEntrySchema.safeParse(e('transfer', 1, { toAccount: 'cash' })).success).toBe(false)
  })

  it('reads a balance date typed in the Sheet (a day number)', () => {
    expect(accountsFromSheet([['bca', 'BCA', 1000, false, '2026-11-01T00:00:00.000Z', 46342]]).items[0].balanceDate).toBe('2026-11-16')
  })

  it('reads the Accounts tab', () => {
    const r = accountsFromSheet([['bca', 'BCA', 1000000, false, '2026-11-01T00:00:00.000Z'], ['bad']])
    expect(r.items).toEqual([bca])
    expect(r.skipped).toBe(1)
  })
})
