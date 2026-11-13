import type { z } from 'zod'
import type * as schema from '@/domain/schema'

// ---- Schema (inferred from the Zod schemas in domain/schema.ts) ----

export type AssetClass = z.infer<typeof schema.AssetClass>
export type Group = z.infer<typeof schema.Group>
export type Currency = z.infer<typeof schema.Currency>
export type Holding = z.infer<typeof schema.Holding>
export type Transaction = z.infer<typeof schema.Transaction>
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
}

export interface Summary {
  rows: Row[]
  netWorth: number
  invested: number
  unrealized: number
  realized: number
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
