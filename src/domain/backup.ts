import type { Backup as BackupData, Holding, ParseResult, Transaction } from '@/types'
import { Backup, SCHEMA_VERSION } from './schema'

export function toBackup(holdings: Holding[], transactions: Transaction[], exportedAt: string): BackupData {
  return { schemaVersion: SCHEMA_VERSION, exportedAt, holdings, transactions }
}

/** Parse an export file. Returns readable errors instead of throwing; never partially imports. */
export function parseBackup(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Not a valid JSON file.' }
  }
  const result = Backup.safeParse(raw)
  if (!result.success) {
    const first = result.error.issues[0]
    return { ok: false, error: `Invalid backup at ${first.path.join('.') || 'root'}: ${first.message}` }
  }
  const ids = new Set(result.data.holdings.map((h) => h.id))
  const orphan = result.data.transactions.find((t) => !ids.has(t.holdingId))
  if (orphan) return { ok: false, error: `Transaction ${orphan.id} points to a missing holding.` }
  return { ok: true, data: result.data }
}
