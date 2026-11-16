// Pure money-account math: balances, name checks, and the Accounts tab of the Sheet. No clock, storage or network.
import type { Account, AccountNameError, CashEntry, ColumnSpec } from '@/types'
import { parseTable } from './portfolioSheet'
import { Account as AccountSchema, DEFAULT_ACCOUNT_ID, MAX_ACCOUNT_NAME, TRANSFER } from './schema'

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

/** Current balance per account id: starting balance + income − expenses − transfers out + transfers in. */
export function accountBalances(accounts: readonly Account[], entries: readonly CashEntry[]): Record<string, number> {
  const out: Record<string, number> = { [DEFAULT_ACCOUNT_ID]: 0 }
  for (const a of accounts) out[a.id] = a.startingBalance
  for (const e of entries) {
    const from = resolveAccount(e.account, accounts)
    if (e.type === 'income') out[from] += e.amount
    else out[from] -= e.amount
    if (e.type === TRANSFER) out[resolveAccount(e.toAccount, accounts)] += e.amount
  }
  return out
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
  const by = new Map<string, Account>([[DEFAULT_ACCOUNT_ID, DEFAULT_ACCOUNT]])
  for (const a of [...remote, ...local]) {
    const had = by.get(a.id)
    if (!had || a.updatedAt >= had.updatedAt) by.set(a.id, a)
  }
  return [...by.values()].sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name))
}

// ---- Google Sheet: Accounts tab ----

export const ACCOUNT_COLUMNS: readonly ColumnSpec[] = [
  ['id', 'string'],
  ['name', 'string'],
  ['startingBalance', 'number'],
  ['archived', 'boolean'],
  ['updatedAt', 'string'],
]

export const accountsFromSheet = (rows: readonly unknown[][]) => parseTable(ACCOUNT_COLUMNS, rows, AccountSchema)
