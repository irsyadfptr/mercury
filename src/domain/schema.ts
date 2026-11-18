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

/** Where a trade came from: the scanner's rules by holding time, or your own idea. */
export const SETUPS = ['swing', 'month', 'week', 'other'] as const
/** Why a trade was closed. */
export const EXIT_REASONS = ['stop', 'target', 'time', 'invalidated', 'manual'] as const

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
  /**
   * A fund tracked by amount (new money market / bond funds): the form asks for rupiah and the current value, not units.
   * Units start at Rp1 each; later buys and sells convert rupiah at the price per unit of that moment.
   */
  byAmount: z.boolean().optional(),
  /** Trading group only. Price levels in the holding's currency. */
  stop: amount.optional(),
  target: amount.optional(),
  // ---- Trade memory (trading group; idea from the trader-memory-core skill) ----
  /** Which rules found the trade: the scanner's swing (3–6 months), ≤ 1 month or ≤ 1 week rules, or your own idea. */
  setup: z.enum(SETUPS).optional(),
  /** Why you are in the trade. */
  thesis: z.string().trim().optional(),
  /** What would prove the thesis wrong (besides the stop). */
  invalidation: z.string().trim().optional(),
  /** Date to re-check the trade (by default the rules' time stop), yyyy-mm-dd. */
  reviewBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Stop when the trade was opened. Kept when the stop moves, so results can be measured in R. */
  initialStop: amount.optional(),
  /** Why the trade was closed. */
  exitReason: z.enum(EXIT_REASONS).optional(),
  /** Scanner signal the trade came from (src/market/signalLog.ts id). */
  signalId: z.string().optional(),
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
  /** The Cashflow entry that moved the money (account → holding, or back), so deleting the trade removes it too. */
  entryId: id.optional(),
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

/** A dividend received for a holding: rupiah actually received (after the 10% IDX final tax). */
export const Dividend = z.object({
  id,
  holdingId: id,
  /** yyyy-mm-dd it was paid. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().int().positive(),
  /** The Cashflow income entry logged with it, so deleting the dividend removes that entry too. */
  entryId: id.optional(),
})

export const SCHEMA_VERSION = 1

// ---- Cashflow (stored in the user's Google Sheet, cached locally) ----

export const EXPENSE_CATEGORIES = ['housing', 'groceries', 'food', 'transport', 'bills', 'health', 'shopping', 'entertainment', 'family', 'other'] as const
export const INCOME_CATEGORIES = ['salary', 'bonus', 'freelance', 'investment', 'otherIncome'] as const
export const CashType = z.enum(['expense', 'income'])
const yyyyMmDd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Entries with no account belong here. It always exists and cannot be archived. */
export const DEFAULT_ACCOUNT_ID = 'cash'
export const MAX_ACCOUNT_NAME = 24

/**
 * Category of a balance correction (from the monthly balance check): an expense or income entry that fixes an account's
 * balance but is never counted as spending or income. Not offered in Quick add.
 */
export const ADJUSTMENT = 'adjustment'

/**
 * Category of money moved between an account and a holding (a buy paid from, or a sell paid into, an account).
 * It moves the account balance but is never spending or income: the money is still yours, now in the portfolio.
 */
export const INVEST = 'invest'

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
  /** yyyy-mm-dd of the last "Match bank" (even when nothing differed): the monthly balance check. */
  matchedAt: yyyyMmDd.optional(),
})

/** A savings goal: progress = the account's balance against the target. Archived, never deleted. */
export const Goal = z.object({
  id,
  name: z.string().trim().min(1).max(40),
  target: z.number().int().positive(),
  account: z.string().trim().min(1),
  archived: z.boolean().default(false),
  updatedAt: isoDate,
})

export const MAX_BILL_NAME = 40

/** A bill to remember: entered by hand, shown as a Dashboard quest when due. Archived, never deleted, so a sync can't bring it back. */
export const Bill = z.object({
  id,
  name: z.string().trim().min(1).max(MAX_BILL_NAME),
  /** Whole rupiah; when set, paying logs it as a "bills" expense. Empty for bills that change (e.g. electricity). */
  amount: z.number().int().positive().optional(),
  /** Next due date, yyyy-mm-dd. */
  dueDate: yyyyMmDd,
  /** Monthly bills move to the next month when paid; one-time ones are archived. */
  monthly: z.boolean().default(true),
  /** Account the payment comes from (id); none = the default account. */
  account: z.string().trim().min(1).optional(),
  /** Expected income (e.g. salary) instead of a bill: a quest only once it is late, and "Received" logs income. */
  income: z.boolean().default(false),
  archived: z.boolean().default(false),
  /** Last edit, ISO; the newer copy wins in a sync. */
  updatedAt: isoDate,
})

/** The JSON export. Fields added after v1 shipped default to empty, so older backups still import. */
export const Backup = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  exportedAt: isoDate,
  holdings: z.array(Holding),
  transactions: z.array(Transaction),
  journal: z.array(JournalEntry).default([]),
  dividends: z.array(Dividend).default([]),
  /** Cashflow (also kept in the Google Sheet). Missing in older backups: then importing leaves cashflow as it is. */
  cashflow: z
    .object({
      entries: z.array(CashEntry),
      accounts: z.array(Account),
      bills: z.array(Bill).default([]),
      goals: z.array(Goal).default([]),
    })
    .optional(),
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
