// Pure mapping between the portfolio and its Sheet tabs, and the rule for which side wins a sync.
import type { z } from 'zod'
import type { ColumnSpec, Holding, ParsedTable, PortfolioData, PortfolioLocalState, PortfolioRemoteState, PortfolioSyncAction, Transaction } from '@/types'
import { Holding as HoldingSchema, Transaction as TransactionSchema } from './schema'

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

/** Both tabs → portfolio. Transactions whose holding is missing are dropped (counted as skipped). */
export function portfolioFromSheet(holdingRows: readonly unknown[][], transactionRows: readonly unknown[][]): PortfolioData & { skipped: number } {
  const h = parseTable(HOLDING_COLUMNS, holdingRows, HoldingSchema)
  const t = parseTable(TRANSACTION_COLUMNS, transactionRows, TransactionSchema)
  const ids = new Set(h.items.map((x) => x.id))
  const transactions = t.items.filter((x) => ids.has(x.holdingId))
  return { holdings: h.items, transactions, skipped: h.skipped + t.skipped + (t.items.length - transactions.length) }
}

/** Union by id; this device's version wins when both have the same id. Used once, on a device's first sync. */
export function mergePortfolios(local: PortfolioData, remote: PortfolioData): PortfolioData {
  const union = <T extends { id: string }>(mine: readonly T[], theirs: readonly T[]): T[] => {
    const ids = new Set(mine.map((x) => x.id))
    return [...mine, ...theirs.filter((x) => !ids.has(x.id))]
  }
  return { holdings: union<Holding>(local.holdings, remote.holdings), transactions: union<Transaction>(local.transactions, remote.transactions) }
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
