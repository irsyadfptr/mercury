import type { en } from '@/i18n'
import type { ROUTES } from '@/routes'
import type { Backup, Holding, NewHolding, NewTransaction, Transaction } from './domain'

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
}

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
}
