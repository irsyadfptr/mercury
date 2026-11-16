import { describe, expect, it } from 'vitest'
import type { Account } from '@/types'
import { DEFAULT_ACCOUNT } from './accounts'
import { parseVoice } from './voice'

const at = '2026-11-01T00:00:00.000Z'
const accounts: Account[] = [
  DEFAULT_ACCOUNT,
  { id: 'bca', name: 'BCA', startingBalance: 0, archived: false, updatedAt: at },
  { id: 'jago', name: 'Bank Jago', startingBalance: 0, archived: false, updatedAt: at },
]
const amount = (text: string) => parseVoice(text, accounts).amount

describe('voice amounts', () => {
  it.each([
    ['25 ribu', 25_000],
    ['25rb', 25_000],
    ['1,5 juta', 1_500_000],
    ['1.5jt', 1_500_000],
    ['dua puluh lima ribu', 25_000],
    ['seratus ribu', 100_000],
    ['seribu', 1_000],
    ['dua ratus lima puluh ribu', 250_000],
    ['lima belas ribu', 15_000],
    ['satu setengah juta', 1_500_000],
    ['dua juta lima ratus ribu', 2_500_000],
    ['Rp25.000', 25_000],
    ['25.000', 25_000],
    ['25 thousand', 25_000],
    ['1.5 million', 1_500_000],
    ['25k', 25_000],
    ['one hundred fifty thousand', 150_000],
    ['twenty five thousand', 25_000],
  ])('%s → %i', (text, value) => expect(amount(text)).toBe(value))

  it('no number → no amount', () => expect(amount('makan siang')).toBeUndefined())
})

describe('voice drafts', () => {
  it('Indonesian expense with an account', () => {
    expect(parseVoice('makan siang 25 ribu pakai BCA', accounts)).toEqual({ type: 'expense', amount: 25_000, category: 'food', account: 'bca', note: 'siang' })
  })

  it('bills, from an account', () => {
    expect(parseVoice('bayar listrik 300rb dari Bank Jago', accounts)).toMatchObject({ type: 'expense', amount: 300_000, category: 'bills', account: 'jago', note: '' })
  })

  it('salary is income', () => {
    expect(parseVoice('gaji 10 juta ke BCA', accounts)).toMatchObject({ type: 'income', amount: 10_000_000, category: 'salary', account: 'bca' })
    expect(parseVoice('salary 10 million', accounts)).toMatchObject({ type: 'income', category: 'salary' })
  })

  it('transfer between accounts, either order', () => {
    expect(parseVoice('transfer dari BCA ke Cash 500 ribu', accounts)).toEqual({ type: 'transfer', amount: 500_000, account: 'bca', toAccount: 'cash', note: '' })
    expect(parseVoice('ke cash dari bca 1 juta transfer', accounts)).toMatchObject({ type: 'transfer', account: 'bca', toAccount: 'cash' })
    expect(parseVoice('tarik tunai 1 juta dari BCA', accounts)).toEqual({ type: 'transfer', amount: 1_000_000, account: 'bca', toAccount: 'cash', note: '' })
  })

  it('English: lunch 25k with BCA', () => {
    expect(parseVoice('lunch 25k with BCA', accounts)).toEqual({ type: 'expense', amount: 25_000, category: 'food', account: 'bca', note: '' })
  })

  it('custom categories and unknown words', () => {
    expect(parseVoice('kucing 50 ribu', accounts, [{ type: 'expense', name: 'Kucing' }])).toMatchObject({ type: 'expense', category: 'Kucing', amount: 50_000 })
    expect(parseVoice('something odd', accounts)).toEqual({ note: 'something odd' })
  })
})
