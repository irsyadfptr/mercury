import type { z } from 'zod'
import type * as schema from '@/domain/schema'

// ---- Schema (inferred from the Zod schemas in domain/schema.ts) ----

export type AssetClass = z.infer<typeof schema.AssetClass>
export type Group = z.infer<typeof schema.Group>
export type Currency = z.infer<typeof schema.Currency>
export type Holding = z.infer<typeof schema.Holding>
export type Transaction = z.infer<typeof schema.Transaction>
export type JournalEntry = z.infer<typeof schema.JournalEntry>
export type Dividend = z.infer<typeof schema.Dividend>
export type JournalTag = JournalEntry['tag']
export type Setup = NonNullable<Holding['setup']>
export type ExitReason = NonNullable<Holding['exitReason']>
export type NewJournalEntry = Omit<JournalEntry, 'id' | 'createdAt'>
/** Input for creating a holding: id and createdAt are assigned by the store. */
export type NewHolding = Omit<Holding, 'id' | 'createdAt'>
/** Input for creating a transaction: id is assigned by the store. */
export type NewTransaction = Omit<Transaction, 'id'>
export type TransactionType = Transaction['type']
export type Backup = z.infer<typeof schema.Backup>
export type Liquidity = 'instant' | '1-2 days' | 'days' | 'slow'

// ---- Positions ----

export interface Position {
  quantity: number
  /** Average cost per unit, fees included. */
  avgCost: number
  /** Cost of the units still held. */
  costBasis: number
  /** Profit/loss locked in by sells, after fees. */
  realizedPnl: number
}

// ---- Portfolio ----

export type PriceSource = 'manual' | 'cost'

export interface Valuation extends Position {
  /** Price per unit used for valuation, in the holding's currency. */
  price: number
  /** manual = user-entered price; cost = no price yet, valued at average cost. */
  priceSource: PriceSource
  marketValue: number
  unrealized: number
  unrealizedPct: number
  /** Converted to IDR; NaN when a USD holding has no USD/IDR rate. */
  valueIdr: number
  costIdr: number
  realizedIdr: number
  /** IDR per unit of the holding's currency; NaN when unknown. */
  fx: number
}

export type TradeRisk =
  | { kind: 'none' }
  | { kind: 'noStop' }
  /** pct = loss if the stop hits, as % of net worth. */
  | { kind: 'ok'; amountIdr: number; pct: number }

export interface Row {
  holding: Holding
  txns: Transaction[]
  v: Valuation
  risk: TradeRisk
  daysHeld: number
  /** Dividends received, all time (rupiah). */
  dividends: number
  /** Dividends of the last 12 months ÷ cost of what is still held, %; null without cost. */
  yieldOnCost: number | null
}

/** One asset type inside a Portfolio group (Investing or Trading). */
export interface TypeGroup {
  assetClass: AssetClass
  rows: Row[]
  /** IDR value of the type's priced holdings. */
  value: number
  /** value − cost, IDR. */
  pnl: number
  pnlPct: number
  /** Share of the group's value, %. */
  share: number
}

export interface Summary {
  rows: Row[]
  netWorth: number
  invested: number
  unrealized: number
  realized: number
  /** Dividends received, all holdings, all time (rupiah). */
  dividends: number
  byGroup: Record<Group, number>
  byClass: Partial<Record<AssetClass, number>>
  /** Sum of per-trade risk % for trades that have a stop. */
  heat: number
  /** Holdings left out of totals because a USD/IDR rate is missing. */
  missingFx: Holding[]
}

export interface LevelInfo {
  level: number
  /** Progress to the next level, 0–1. */
  xp: number
  /** Net worth needed for the next level. */
  next: number
}

export type HeatTier = 'calm' | 'warm' | 'hot' | 'onFire' | 'overheated'

export interface HeatInfo {
  tier: HeatTier
  /** 0–4 flames to draw. */
  flames: number
}

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface PositionSizeInput {
  capital: number
  /** % of capital to lose if the stop hits. */
  riskPct: number
  entry: number
  stop: number
  /** Round down to whole lots; omit for fractional units (crypto). */
  lot?: number
}

export type SizeQuote =
  | { status: 'incomplete' }
  | { status: 'stopAboveEntry' }
  | { status: 'ok'; units: number; cost: number; lossAtStop: number }

export type Quest =
  | { kind: 'setStop'; holding: Holding }
  | { kind: 'overRisk'; holding: Holding; pct: number }
  /** days = age of the manual price; null = never priced. */
  | { kind: 'stalePrice'; holding: Holding; days: number | null }
  | { kind: 'backup'; days: number | null }
  /** An open trade whose review date (yyyy-mm-dd) has come. */
  | { kind: 'review'; holding: Holding; since: string }
  | { kind: 'fxRate' }

export interface QuestOptions {
  tradeLimit: number
  lastExportAt?: string
  now: number
}

// ---- Backup ----

export type ParseResult = { ok: true; data: Backup } | { ok: false; error: string }

// ---- Holding form ----

export type FormError = 'required' | 'positive' | 'oversell'

/** Everything the holding form edits, as the strings the inputs hold. */
export interface HoldingFormValues {
  assetClass: AssetClass
  group: Group
  symbol: string
  name: string
  platform: string
  currency: Currency
  paper: boolean
  stop: string
  target: string
  // Trade memory (trading group only).
  setup: Setup | ''
  thesis: string
  invalidation: string
  /** yyyy-mm-dd or '' */
  reviewBy: string
  exitReason: ExitReason | ''
  price: string
  // First buy, only used when creating.
  qty: string
  buyPrice: string
  fee: string
  /** yyyy-mm-dd */
  date: string
}

export type HoldingFormErrors = Partial<Record<keyof HoldingFormValues, FormError>>

/** The add-transaction row under an existing holding. */
export interface TransactionFormValues {
  type: TransactionType
  /** Lots for IDX stocks, units otherwise. */
  qty: string
  price: string
  fee: string
  date: string
}

export type TransactionResult = { ok: true; tx: NewTransaction } | { ok: false; error: FormError }

// ---- Portfolio in the Sheet ----

/** 'date' = yyyy-mm-dd, also read from a Sheets day number when typed by hand. */
export type ColumnKind = 'string' | 'number' | 'boolean' | 'date'
/** [field name, how to read the cell] */
export type ColumnSpec = readonly [string, ColumnKind]

export interface ParsedTable<T> {
  items: T[]
  /** Rows that failed validation (hand-edited) and were left out. */
  skipped: number
}

/** What the sync does with the portfolio this pass. merge = first sync on a device that already has data. */
export type PortfolioSyncAction = 'push' | 'pull' | 'merge' | 'none'

export interface PortfolioLocalState {
  hasData: boolean
  /** Last local edit, ISO. */
  changedAt?: string
  /** Last successful portfolio sync on this device, ISO. */
  syncedAt?: string
}

export interface PortfolioRemoteState {
  hasData: boolean
  /** When a device last wrote the portfolio tabs, ISO. */
  updatedAt?: string
}

// ---- Cashflow ----

export type CashType = z.infer<typeof schema.CashType>
export type CashEntry = z.infer<typeof schema.CashEntry>
export type NewCashEntry = Omit<CashEntry, 'id' | 'createdAt'>
export type Account = z.infer<typeof schema.Account>
export type Bill = z.infer<typeof schema.Bill>
export type Goal = z.infer<typeof schema.Goal>

/** Cashflow badges, worked out from the data (nothing stored). */
export type CashBadge = 'firstEntry' | 'streak7' | 'streak30' | 'underBudget' | 'saver20' | 'allMatched' | 'goalReached'

/** This month's cashflow score: four parts of 0–25 each. */
export interface MonthScore {
  total: number
  budget: number
  savings: number
  logging: number
  matched: number
}

/** A bill that needs paying soon; days until due (negative = overdue). */
export interface BillDue {
  bill: Bill
  days: number
}
export type ExpenseCategory = (typeof schema.EXPENSE_CATEGORIES)[number]
export type IncomeCategory = (typeof schema.INCOME_CATEGORIES)[number]
export type CashCategory = ExpenseCategory | IncomeCategory
/** yyyy-mm */
export type MonthKey = string

/** A category the user created. Entries store its name directly, so it syncs through the Sheet with them. */
export interface CustomCategory {
  type: CashType
  name: string
}

export type CategoryNameError = 'required' | 'tooLong' | 'duplicate'

export interface CategoryTotal {
  category: string
  amount: number
  /** Share of the month's spending (or income), 0–100. */
  pct: number
}

export interface MonthSummary {
  month: MonthKey
  income: number
  expense: number
  /** income − expense */
  net: number
  /** net ÷ income × 100; null without income. */
  savingsRate: number | null
  expenseByCategory: CategoryTotal[]
  incomeByCategory: CategoryTotal[]
  /** Days elapsed in the month (all of it for past months). */
  daysElapsed: number
  daysInMonth: number
  /** Straight-line month-end spending at today's pace; equals expense for past months. */
  projectedExpense: number
}

export interface MonthTotal {
  month: MonthKey
  income: number
  expense: number
}

export type AccountNameError = 'required' | 'tooLong' | 'duplicate'

/** Cashflow entry list filter; any field set = search all months. */
export interface EntryFilter {
  /** Account id. */
  account?: string
  category?: string
  text: string
}

/** A Quick add chip: an entry the user logs often. */
export interface Shortcut {
  type: CashType
  category: string
  amount: number
  note?: string
  account?: string
}

/** What the voice parser could read from a transcript; missing fields are left for the user. */
export interface VoiceDraft {
  type?: CashEntry['type']
  amount?: number
  category?: string
  /** Account id; for a transfer, the source. */
  account?: string
  toAccount?: string
  /** "kemarin" / "yesterday" = 1, "tadi" / "today" / "hari ini" = 0. */
  daysAgo?: number
  /** Words not understood, kept so nothing is lost. */
  note: string
}

/** Result of reading Sheet rows: valid entries plus how many rows were skipped. */
export interface ParsedRows {
  entries: CashEntry[]
  skipped: number
  /** Rows that were given a new id and/or createdAt; row = index in the rows passed in. */
  filled: { row: number; id: string; createdAt: string }[]
}

/** Safe to spend per day for the rest of the month (see safeToSpend). */
export interface SafeToSpend {
  /** What the pool starts from: the monthly budget, or this month's income when no budget is set. */
  base: 'budget' | 'income'
  /** Budget (or income) − spent before today − bills still to pay this month; negative = already over. */
  pool: number
  /** pool ÷ days left (today included), floored, never below 0. */
  perDay: number
  spentToday: number
  /** perDay − spentToday; negative = over today's share. */
  leftToday: number
  daysLeft: number
  billsLeft: number
}
