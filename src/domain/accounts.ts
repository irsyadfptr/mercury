// Pure money-account math: balances, name checks, and the Accounts tab of the Sheet. No clock, storage or network.
import type { Account, AccountNameError, CashEntry, ColumnSpec, EntryFilter, NewCashEntry } from '@/types'
import { mergeNewest, parseTable } from './portfolioSheet'
import { Account as AccountSchema, ADJUSTMENT, DEFAULT_ACCOUNT_ID, MAX_ACCOUNT_NAME, TRANSFER } from './schema'

/** The account every store starts with. The epoch timestamp lets any real edit (rename, balance) win a sync. */
export const DEFAULT_ACCOUNT: Account = { id: DEFAULT_ACCOUNT_ID, name: 'Cash', startingBalance: 0, archived: false, updatedAt: '1970-01-01T00:00:00.000Z' }

/**
 * Which account an entry's reference means: the id, else a name typed in the Sheet (any case), else the default.
 * Older entries have no account and count as the default one.
 */
export function resolveAccount(ref: string | undefined, accounts: readonly Account[]): string {
  if (!ref) return DEFAULT_ACCOUNT_ID
  if (accounts.some((a) => a.id === ref)) return ref
  return accounts.find((a) => a.name.toLowerCase() === ref.toLowerCase())?.id ?? DEFAULT_ACCOUNT_ID
}

/**
 * Current balance per account id: starting balance + income − expenses − transfers out + transfers in.
 * Entries dated before an account's balanceDate are already inside its starting balance, so they are skipped for that
 * account (each side of a transfer is checked against its own account). They still count in the monthly totals.
 */
export function accountBalances(accounts: readonly Account[], entries: readonly CashEntry[]): Record<string, number> {
  const out: Record<string, number> = { [DEFAULT_ACCOUNT_ID]: 0 }
  const since: Record<string, string> = {}
  for (const a of accounts) {
    out[a.id] = a.startingBalance
    if (a.balanceDate) since[a.id] = a.balanceDate
  }
  const add = (id: string, date: string, amount: number) => {
    if (!since[id] || date >= since[id]) out[id] += amount
  }
  for (const e of entries) {
    add(resolveAccount(e.account, accounts), e.date, e.type === 'income' ? e.amount : -e.amount)
    if (e.type === TRANSFER) add(resolveAccount(e.toAccount, accounts), e.date, e.amount)
  }
  return out
}

/**
 * One account's balance right after each of its entries (by id), oldest first, with the same rules as
 * accountBalances (entries before its balance date leave it unchanged). For the per-account view.
 */
export function runningBalances(accountId: string, accounts: readonly Account[], entries: readonly CashEntry[]): Map<string, number> {
  const account = accounts.find((a) => a.id === accountId)
  let balance = account?.startingBalance ?? 0
  const out = new Map<string, number>()
  const ordered = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  for (const e of ordered) {
    const from = resolveAccount(e.account, accounts) === accountId
    const to = e.type === TRANSFER && resolveAccount(e.toAccount, accounts) === accountId
    if (!from && !to) continue
    if (!account?.balanceDate || e.date >= account.balanceDate) {
      if (from) balance += e.type === 'income' ? e.amount : -e.amount
      if (to) balance += e.amount
    }
    out.set(e.id, balance)
  }
  return out
}

/**
 * Entries matching a filter, any month: account (either side of a transfer), category, and text in the note,
 * category label or account names. label = how the UI names a category (translated).
 */
export function filterEntries(entries: readonly CashEntry[], f: EntryFilter, accounts: readonly Account[], label: (c: string) => string): CashEntry[] {
  const text = f.text.trim().toLowerCase()
  const name = (ref?: string) => accounts.find((a) => a.id === resolveAccount(ref, accounts))?.name ?? ''
  return entries.filter(
    (e) =>
      (!f.account || resolveAccount(e.account, accounts) === f.account || (e.type === TRANSFER && resolveAccount(e.toAccount, accounts) === f.account)) &&
      (!f.category || e.category === f.category) &&
      (!text || [e.note ?? '', label(e.category), name(e.account), e.type === TRANSFER ? name(e.toAccount) : ''].some((s) => s.toLowerCase().includes(text))),
  )
}

/** Money in all active accounts (archived ones are left out). */
export function accountsTotal(accounts: readonly Account[], entries: readonly CashEntry[]): number {
  const balances = accountBalances(accounts, entries)
  return accounts.reduce((sum, a) => (a.archived ? sum : sum + balances[a.id]), 0)
}

/**
 * The monthly balance check: the entry that brings an account from what the app shows to what the bank shows.
 * Income when the real balance is higher, expense when lower, category "adjustment" (never counted as spending or
 * income). Undefined when they already match.
 */
export function balanceAdjustment(account: string, shown: number, real: number, today: string): NewCashEntry | undefined {
  const diff = Math.round(real) - shown
  if (!diff) return undefined
  return { type: diff > 0 ? 'income' : 'expense', amount: Math.abs(diff), category: ADJUSTMENT, date: today, account }
}

/** Checks a new or changed account name. others = the other accounts (archived included, so names stay unique). */
export function validateAccountName(raw: string, others: readonly Account[]): { ok: true; name: string } | { ok: false; error: AccountNameError } {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (!name) return { ok: false, error: 'required' }
  if (name.length > MAX_ACCOUNT_NAME) return { ok: false, error: 'tooLong' }
  if (others.some((a) => a.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: 'duplicate' }
  return { ok: true, name }
}

/** Union by id; the newer updatedAt wins (this device on a tie). The default account is always there. Active first, then by name. */
export function mergeAccounts(local: readonly Account[], remote: readonly Account[]): Account[] {
  return mergeNewest([DEFAULT_ACCOUNT, ...local], remote).sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name))
}

// ---- Google Sheet: Accounts tab ----

export const ACCOUNT_COLUMNS: readonly ColumnSpec[] = [
  ['id', 'string'],
  ['name', 'string'],
  ['startingBalance', 'number'],
  ['archived', 'boolean'],
  ['updatedAt', 'string'],
  ['balanceDate', 'date'],
  ['matchedAt', 'date'],
]

export const accountsFromSheet = (rows: readonly unknown[][]) => parseTable(ACCOUNT_COLUMNS, rows, AccountSchema)
