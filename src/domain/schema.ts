import { z } from 'zod'
import type { AssetClass as AssetClassType, Liquidity } from '@/types'

// Zod schemas are the single source of truth: types are inferred (in src/types), and imports are validated against them.

export const ASSET_CLASSES = ['idx_stock', 'crypto', 'us_stock', 'money_market', 'bond_fund', 'gold'] as const
export const AssetClass = z.enum(ASSET_CLASSES)

/** Investing = funds, gold, long-term holds. Trading = swing positions with stops. */
export const Group = z.enum(['investing', 'trading'])

export const Currency = z.enum(['IDR', 'USD'])

const id = z.string().min(1)
const isoDate = z.iso.datetime()
// shortcut: plain JS numbers for money and quantities (fine to ~15 significant digits); switch to a decimal lib if rounding shows up in totals.
const amount = z.number().finite().nonnegative()

export const Holding = z.object({
  id,
  assetClass: AssetClass,
  group: Group,
  /** Ticker (BBCA, BTC) or product name (e.g. a fund name, "Antam 10g"). */
  symbol: z.string().trim().min(1),
  name: z.string().trim().optional(),
  /** Free text: Bibit, Stockbit, Binance, ... */
  platform: z.string().trim().optional(),
  currency: Currency,
  /** Simulated trade. Shown with a PAPER badge everywhere. */
  paper: z.boolean().default(false),
  /** Trading group only. Price levels in the holding's currency. */
  stop: amount.optional(),
  target: amount.optional(),
  /** Manually entered price per unit, for assets with no price feed (funds, gold) or until feeds exist. */
  manualPrice: amount.optional(),
  manualPriceAt: isoDate.optional(),
  createdAt: isoDate,
  note: z.string().optional(),
})

export const Transaction = z.object({
  id,
  holdingId: id,
  type: z.enum(['buy', 'sell']),
  date: isoDate,
  /** Units: shares (not lots), coins, fund units, grams. */
  quantity: amount.positive(),
  /** Price per unit in the holding's currency. */
  price: amount,
  fee: amount.default(0),
  note: z.string().optional(),
})

/** Trading journal: a dated note, optionally about one holding. */
export const JOURNAL_TAGS = ['note', 'plan', 'entry', 'exit', 'lesson'] as const
export const JournalEntry = z.object({
  id,
  /** Local calendar date the note is about, yyyy-mm-dd. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tag: z.enum(JOURNAL_TAGS).default('note'),
  text: z.string().trim().min(1),
  holdingId: id.optional(),
  createdAt: isoDate,
})

export const SCHEMA_VERSION = 1

export const Backup = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  exportedAt: isoDate,
  holdings: z.array(Holding),
  transactions: z.array(Transaction),
  /** Added after v1 shipped; older backups have none. */
  journal: z.array(JournalEntry).default([]),
})

// ---- Cashflow (stored in the user's Google Sheet, cached locally) ----

export const EXPENSE_CATEGORIES = ['housing', 'groceries', 'food', 'transport', 'bills', 'health', 'shopping', 'entertainment', 'family', 'other'] as const
export const INCOME_CATEGORIES = ['salary', 'bonus', 'freelance', 'investment', 'otherIncome'] as const
export const CashType = z.enum(['expense', 'income'])
const yyyyMmDd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Entries with no account belong here. It always exists and cannot be archived. */
export const DEFAULT_ACCOUNT_ID = 'cash'
export const MAX_ACCOUNT_NAME = 24

/** A transfer moves money between two accounts; it is never spending or income. */
export const TRANSFER = 'transfer'

export const CashEntry = z
  .object({
    id,
    /** Local calendar date the money moved, yyyy-mm-dd. */
    date: yyyyMmDd,
    type: z.enum(['expense', 'income', TRANSFER]),
    /** Whole rupiah, always positive; type says the direction. */
    amount: z.number().int().positive(),
    /** One of the category ids above; unknown ids (typed in the Sheet) show as "other". Transfers use "transfer". */
    category: z.string().min(1),
    note: z.string().optional(),
    createdAt: isoDate,
    /** Account id (or name, if typed in the Sheet). Missing = the default account; older entries have none. For a transfer: from. */
    account: z.string().trim().min(1).optional(),
    /** Transfers only: the account the money goes to. */
    toAccount: z.string().trim().min(1).optional(),
  })
  .refine((e) => e.type !== TRANSFER || (e.toAccount !== undefined && e.toAccount !== (e.account ?? DEFAULT_ACCOUNT_ID)), {
    message: 'A transfer needs two different accounts.',
    path: ['toAccount'],
  })

/** A money account (BCA, Cash, GoPay). Kept, never deleted, so old entries always resolve. */
export const Account = z.object({
  id,
  name: z.string().trim().min(1).max(MAX_ACCOUNT_NAME),
  /** Whole rupiah when tracking started; may be negative (e.g. a card). */
  startingBalance: z.number().int().default(0),
  /** yyyy-mm-dd the starting balance is from. Entries dated before it already happened in that balance, so they don't move it. None = every entry counts. */
  balanceDate: yyyyMmDd.optional(),
  archived: z.boolean().default(false),
  /** Last edit, ISO; the newer copy wins in a sync. */
  updatedAt: isoDate,
})

/** How fast an asset turns into cash. Derived, never stored. */
export const LIQUIDITY: Record<AssetClassType, Liquidity> = {
  crypto: 'instant',
  idx_stock: '1-2 days',
  us_stock: '1-2 days',
  money_market: '1-2 days',
  bond_fund: 'days',
  gold: 'slow',
}
