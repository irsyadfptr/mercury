// Pure mapping between the portfolio and its Sheet tabs, and the rule for which side wins a sync.
import type { z } from 'zod'
import type { ColumnSpec, Dividend, Holding, JournalEntry, ParsedTable, PortfolioData, PortfolioLocalState, PortfolioRemoteState, PortfolioSyncAction, Transaction } from '@/types'
import { sheetDate } from './cashflow'
import { Dividend as DividendSchema, Holding as HoldingSchema, JournalEntry as JournalSchema, Transaction as TransactionSchema } from './schema'

export const HOLDING_COLUMNS: readonly ColumnSpec[] = [
  ['id', 'string'],
  ['assetClass', 'string'],
  ['group', 'string'],
  ['symbol', 'string'],
  ['name', 'string'],
  ['platform', 'string'],
  ['currency', 'string'],
  ['paper', 'boolean'],
  ['stop', 'number'],
  ['target', 'number'],
  ['manualPrice', 'number'],
  ['manualPriceAt', 'string'],
  ['createdAt', 'string'],
  ['note', 'string'],
  ['byAmount', 'boolean'],
  ['setup', 'string'],
  ['thesis', 'string'],
  ['invalidation', 'string'],
  ['reviewBy', 'date'],
  ['initialStop', 'number'],
  ['exitReason', 'string'],
  ['signalId', 'string'],
  ['gate', 'string'],
]

export const TRANSACTION_COLUMNS: readonly ColumnSpec[] = [
  ['id', 'string'],
  ['holdingId', 'string'],
  ['type', 'string'],
  ['date', 'string'],
  ['quantity', 'number'],
  ['price', 'number'],
  ['fee', 'number'],
  ['note', 'string'],
  ['entryId', 'string'],
]

export const DIVIDEND_COLUMNS: readonly ColumnSpec[] = [
  ['id', 'string'],
  ['holdingId', 'string'],
  ['date', 'date'],
  ['amount', 'number'],
  ['entryId', 'string'],
]

export const JOURNAL_COLUMNS: readonly ColumnSpec[] = [
  ['id', 'string'],
  ['date', 'date'],
  ['tag', 'string'],
  ['text', 'string'],
  ['holdingId', 'string'],
  ['createdAt', 'string'],
]

export const headerRow = (cols: readonly ColumnSpec[]): string[] => cols.map(([name]) => name)

/** Object → row in column order; missing values become empty cells. */
export function toRow(cols: readonly ColumnSpec[], obj: object): (string | number | boolean)[] {
  const o = obj as Record<string, unknown>
  return cols.map(([name]) => {
    const v = o[name]
    return typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string' ? v : ''
  })
}

/** Row → plain object, cells read by kind; empty cells become undefined so optional fields stay optional. */
export function fromRow(cols: readonly ColumnSpec[], row: readonly unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  cols.forEach(([name, kind], i) => {
    const cell = row[i]
    const text = String(cell ?? '').trim()
    if (text === '') return
    if (kind === 'number') out[name] = typeof cell === 'number' ? cell : Number(text.replace(/[^\d.eE-]/g, ''))
    else if (kind === 'boolean') out[name] = cell === true || text.toLowerCase() === 'true'
    else if (kind === 'date') out[name] = sheetDate(text)
    else out[name] = text
  })
  return out
}

/** Validates each row with the domain schema; hand-edited rows that do not fit are skipped and counted. */
export function parseTable<S extends z.ZodType>(cols: readonly ColumnSpec[], rows: readonly unknown[][], schema: S): ParsedTable<z.infer<S>> {
  const items: z.infer<S>[] = []
  let skipped = 0
  for (const row of rows) {
    if (!row.some((c) => String(c ?? '').trim())) continue
    const parsed = schema.safeParse(fromRow(cols, row))
    if (parsed.success) items.push(parsed.data)
    else skipped++
  }
  return { items, skipped }
}

/** Union by id; the newer updatedAt wins (local on a tie). For small tables every device edits (accounts, bills). */
export function mergeNewest<T extends { id: string; updatedAt: string }>(local: readonly T[], remote: readonly T[]): T[] {
  const by = new Map<string, T>()
  for (const x of [...remote, ...local]) {
    const had = by.get(x.id)
    if (!had || x.updatedAt >= had.updatedAt) by.set(x.id, x)
  }
  return [...by.values()]
}

/**
 * The tabs → portfolio. Transactions and dividends whose holding is missing are dropped (counted as skipped);
 * journal notes about a missing holding keep the note and lose the link.
 */
export function portfolioFromSheet(
  holdingRows: readonly unknown[][],
  transactionRows: readonly unknown[][],
  dividendRows: readonly unknown[][] = [],
  journalRows: readonly unknown[][] = [],
): PortfolioData & { skipped: number } {
  const h = parseTable(HOLDING_COLUMNS, holdingRows, HoldingSchema)
  const t = parseTable(TRANSACTION_COLUMNS, transactionRows, TransactionSchema)
  const d = parseTable(DIVIDEND_COLUMNS, dividendRows, DividendSchema)
  const j = parseTable(JOURNAL_COLUMNS, journalRows, JournalSchema)
  const ids = new Set(h.items.map((x) => x.id))
  const transactions = t.items.filter((x) => ids.has(x.holdingId))
  const dividends = d.items.filter((x) => ids.has(x.holdingId))
  const journal = j.items.map((x) => (x.holdingId && !ids.has(x.holdingId) ? { ...x, holdingId: undefined } : x))
  const orphans = t.items.length - transactions.length + d.items.length - dividends.length
  return { holdings: h.items, transactions, dividends, journal, skipped: h.skipped + t.skipped + d.skipped + j.skipped + orphans }
}

/** Union by id; this device's version wins when both have the same id. Used once, on a device's first sync. */
export function mergePortfolios(local: PortfolioData, remote: PortfolioData): PortfolioData {
  const union = <T extends { id: string }>(mine: readonly T[], theirs: readonly T[]): T[] => {
    const ids = new Set(mine.map((x) => x.id))
    return [...mine, ...theirs.filter((x) => !ids.has(x.id))]
  }
  return {
    holdings: union<Holding>(local.holdings, remote.holdings),
    transactions: union<Transaction>(local.transactions, remote.transactions),
    dividends: union<Dividend>(local.dividends, remote.dividends),
    journal: union<JournalEntry>(local.journal, remote.journal),
  }
}

/**
 * Which way to sync. The rules, in order:
 * 1. An empty Sheet never wipes this device: push.
 * 2. First sync here: pull onto an empty device, merge when both sides have data.
 * 3. No local edits since the last sync: pull (also picks up edits made by hand in the Sheet).
 * 4. Local edits: push, unless another device wrote after them; then the newer side wins.
 */
export function portfolioSyncAction(local: PortfolioLocalState, remote: PortfolioRemoteState): PortfolioSyncAction {
  if (!local.hasData && !remote.hasData) return 'none'
  if (!remote.hasData) return local.hasData ? 'push' : 'none'
  if (!local.syncedAt) return local.hasData ? 'merge' : 'pull'
  const dirty = local.changedAt !== undefined && local.changedAt > local.syncedAt
  if (!dirty) return 'pull'
  const remoteMovedLater = remote.updatedAt !== undefined && remote.updatedAt > local.syncedAt && remote.updatedAt > (local.changedAt ?? '')
  return remoteMovedLater ? 'pull' : 'push'
}
