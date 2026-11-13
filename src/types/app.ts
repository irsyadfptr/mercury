import type { en } from '@/i18n'
import type { ROUTES } from '@/routes'
import type { Backup, CashEntry, CustomCategory, Holding, NewCashEntry, NewHolding, NewTransaction, Transaction } from './domain'

// ---- Routes ----

export type Route = (typeof ROUTES)[number]

// ---- Settings ----

export type Lang = 'en' | 'id'
export type ThemePref = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export interface SettingsValues {
  lang: Lang
  theme: ThemePref
  /** Max open risk across all trades, % of net worth. */
  heatLimit: number
  /** Max risk per trade, % of net worth. */
  tradeLimit: number
  /** Manual USD → IDR rate for USD holdings. */
  usdIdr?: number
  lastExportAt?: string
  /** Monthly spending budget in rupiah; unset = no budget bar. */
  monthlyBudget?: number
}

export interface SettingsState extends SettingsValues {
  set: (patch: Partial<SettingsValues>) => void
}

// ---- Store ----

export interface PortfolioData {
  holdings: Holding[]
  transactions: Transaction[]
}

export interface PortfolioActions {
  /** Returns the new holding's id. */
  addHolding: (h: NewHolding) => string
  updateHolding: (id: string, patch: Partial<NewHolding>) => void
  /** Also removes the holding's transactions. */
  removeHolding: (id: string) => void
  addTransaction: (t: NewTransaction) => void
  removeTransaction: (id: string) => void
  /** Replaces all data. Callers must validate with parseBackup first. */
  replaceAll: (b: Backup) => void
  /** Sheet sync pulled newer data; at = when that sync started. */
  applyPortfolioPull: (data: PortfolioData, at: string) => void
  /** Sheet sync pushed this device's data; at = when that sync started. */
  markPortfolioSynced: (at: string) => void
}

export interface PortfolioSyncMeta {
  /** Last user edit on this device, ISO. */
  changedAt?: string
  /** Start of the last successful portfolio sync on this device, ISO. */
  syncedAt?: string
}

// ---- Cashflow store and sync ----

export interface CashflowData {
  /** The Google Sheet this browser syncs with; unset until the first sync creates it. */
  spreadsheetId?: string
  /** Last copy read from the Sheet. */
  synced: CashEntry[]
  /** Added on this device and not yet in the Sheet (the offline queue). */
  pending: CashEntry[]
  lastSyncAt?: string
  /** Rows in the Sheet that failed validation at the last sync. */
  skippedRows: number
  /** Categories created on this device; ones used in entries also arrive from the Sheet. */
  customCategories: CustomCategory[]
}

export interface CashflowActions {
  /** Queues an entry locally; returns its id. */
  addEntry: (e: NewCashEntry) => string
  /** Only unsynced entries can be removed in the app; synced ones are edited in the Sheet. */
  removePending: (id: string) => void
  applySync: (r: SyncApplied) => void
  /** Forget the linked sheet (data stays in Google Drive). */
  unlinkSheet: () => void
  /** Call with a name already checked by validateCategoryName. */
  addCategory: (c: CustomCategory) => void
}

export interface SyncApplied {
  spreadsheetId: string
  synced: CashEntry[]
  /** Pending ids now stored in the Sheet; entries added during the sync stay queued. */
  sentIds: string[]
  skippedRows: number
  at: string
}

export interface AccessToken {
  value: string
  /** ms since epoch */
  expiresAt: number
}

export type SyncStatus = 'unconfigured' | 'signedOut' | 'idle' | 'syncing' | 'error'

export interface SheetSync {
  status: SyncStatus
  error?: string
  /** Opens Google sign-in; call from a click. Syncs right after. */
  connect: () => void
  /** Syncs if a token is available; otherwise does nothing (status shows signedOut). */
  sync: () => void
  disconnect: () => void
}

// ---- PWA ----

/** installed = opened from the home screen; available = Chrome can show its install dialog; manual = follow browser menu steps. */
export type InstallState = 'installed' | 'available' | 'manual'

// ---- i18n ----

export type Key = keyof typeof en
export type Vars = Record<string, string | number>

export interface I18n {
  lang: Lang
  locale: string
  t: (key: Key, vars?: Vars) => string
  /** Fixed decimals. */
  num: (n: number, digits?: number) => string
  /** Units: up to 8 decimals, trailing zeros trimmed. */
  qty: (n: number) => string
  /** Whole rupiah: Rp1,234,567. */
  money: (n: number) => string
  /** Rp1.2M / Rp1,2 jt. */
  compact: (n: number) => string
  /** Signed percent with ▲/▼ so direction never relies on colour. */
  change: (pct: number, digits?: number) => string
  /** 'yyyy-mm' → "November 2026" / "November 2026" (id). */
  month: (key: string, short?: boolean) => string
  /** 'yyyy-mm-dd' → "Fri 13 Nov". */
  day: (date: string) => string
  /** Display name: built-in ids are translated, custom names shown as typed. */
  category: (c: string) => string
}
