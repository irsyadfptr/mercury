// Pure form logic for holdings and transactions: raw input strings in, validated domain objects out.
// Components only hold the strings and render errors; nothing here touches React, the store or the clock.
import type {
  AssetClass,
  Holding,
  HoldingFormErrors,
  HoldingFormValues,
  NewHolding,
  NewTransaction,
  Transaction,
  TransactionFormValues,
  TransactionResult,
} from '@/types'
import { IDX_LOT } from './portfolio'
import { position } from './positions'

/** Sensible group and currency for a newly chosen asset class. */
export const CLASS_DEFAULTS: Record<AssetClass, Pick<HoldingFormValues, 'group' | 'currency'>> = {
  idx_stock: { group: 'trading', currency: 'IDR' },
  crypto: { group: 'trading', currency: 'IDR' },
  us_stock: { group: 'investing', currency: 'USD' },
  money_market: { group: 'investing', currency: 'IDR' },
  bond_fund: { group: 'investing', currency: 'IDR' },
  gold: { group: 'investing', currency: 'IDR' },
}

/**
 * Funds bought by amount (Bibit-style money market and bond funds): the form asks for rupiah, not units.
 * Stored with 1 unit = Rp1 of cost, so cost = amount invested, and the current value sets the price per unit.
 */
export const entersAmount = (c: AssetClass): boolean => c === 'money_market' || c === 'bond_fund'

/** Whether the form works in rupiah: an existing holding by its flag (older funds stay in units), a new one by its class. */
export const formByAmount = (h: Holding | undefined, c: AssetClass): boolean => (h ? !!h.byAmount : entersAmount(c))

/** IDX stocks are typed in lots and stored as shares. */
export const entersLots = (c: AssetClass): boolean => c === 'idx_stock'
export const unitsFromInput = (amount: number, c: AssetClass): number => (entersLots(c) ? amount * IDX_LOT : amount)
export const inputFromUnits = (units: number, c: AssetClass): number => (entersLots(c) ? units / IDX_LOT : units)

/** '' → undefined; otherwise Number (may be NaN, which validation rejects). */
export const parseOptional = (s: string): number | undefined => (s.trim() === '' ? undefined : Number(s))
const isNonNegative = (n: number | undefined): n is number => n != null && Number.isFinite(n) && n >= 0
const isPositive = (n: number | undefined): n is number => isNonNegative(n) && n > 0
/** yyyy-mm-dd → ISO at UTC midnight. */
export const dateToIso = (yyyyMmDd: string): string => new Date(`${yyyyMmDd}T00:00:00.000Z`).toISOString()

/** txns: the holding's transactions, so a fund handled by amount shows its current value in the price field. */
export function holdingToForm(h: Holding | undefined, today: string, txns: readonly Transaction[] = []): HoldingFormValues {
  const assetClass = h?.assetClass ?? 'idx_stock'
  const price = h?.manualPrice == null ? '' : h.byAmount ? String(Math.round(h.manualPrice * position(txns).quantity)) : h.manualPrice.toString()
  return {
    assetClass,
    group: h?.group ?? CLASS_DEFAULTS[assetClass].group,
    symbol: h?.symbol ?? '',
    name: h?.name ?? '',
    platform: h?.platform ?? '',
    currency: h?.currency ?? CLASS_DEFAULTS[assetClass].currency,
    paper: h?.paper ?? false,
    stop: h?.stop?.toString() ?? '',
    target: h?.target?.toString() ?? '',
    setup: h?.setup ?? '',
    thesis: h?.thesis ?? '',
    invalidation: h?.invalidation ?? '',
    reviewBy: h?.reviewBy ?? '',
    exitReason: h?.exitReason ?? '',
    price,
    qty: '',
    buyPrice: '',
    fee: '',
    date: today,
  }
}

export function validateHoldingForm(v: HoldingFormValues, isNew: boolean): HoldingFormErrors {
  const errors: HoldingFormErrors = {}
  if (!v.symbol.trim()) errors.symbol = 'required'
  for (const key of ['stop', 'target', 'price'] as const) {
    const n = parseOptional(v[key])
    if (n !== undefined && !isNonNegative(n)) errors[key] = 'positive'
  }
  if (isNew && entersAmount(v.assetClass)) {
    if (!isPositive(parseOptional(v.buyPrice))) errors.buyPrice = 'positive'
  } else if (isNew) {
    if (!isPositive(parseOptional(v.qty))) errors.qty = 'positive'
    if (!isNonNegative(parseOptional(v.buyPrice))) errors.buyPrice = 'required'
    const fee = parseOptional(v.fee)
    if (fee !== undefined && !isNonNegative(fee)) errors.fee = 'positive'
  }
  return errors
}

/**
 * Holding fields from valid form values. The price timestamp moves only when the price changes.
 * txns: the holding's transactions; for a fund handled by amount, current value ÷ units held = price per unit.
 */
export function formToHolding(v: HoldingFormValues, existing: Holding | undefined, nowIso: string, txns: readonly Transaction[] = []): NewHolding {
  const typed = parseOptional(v.price)
  const amount = formByAmount(existing, v.assetClass)
  const units = existing ? position(txns).quantity : Number(v.buyPrice)
  const manualPrice = typed !== undefined && amount ? (units > 0 ? typed / units : undefined) : typed
  const priceChanged = manualPrice !== existing?.manualPrice
  return {
    assetClass: v.assetClass,
    group: v.group,
    symbol: v.symbol.trim().toUpperCase(),
    name: v.name.trim() || undefined,
    platform: v.platform.trim() || undefined,
    currency: v.currency,
    paper: v.paper,
    byAmount: amount || undefined,
    // Stop and target only mean something for trades.
    stop: v.group === 'trading' ? parseOptional(v.stop) : undefined,
    target: v.group === 'trading' ? parseOptional(v.target) : undefined,
    // Trade memory: only for trades; initialStop and signalId are kept as they were (set by the store and the scanner).
    ...(v.group === 'trading'
      ? {
          setup: v.setup || undefined,
          thesis: v.thesis.trim() || undefined,
          invalidation: v.invalidation.trim() || undefined,
          reviewBy: v.reviewBy || undefined,
          exitReason: v.exitReason || undefined,
          initialStop: existing?.initialStop,
          signalId: existing?.signalId,
          gate: existing?.gate,
        }
      : {}),
    manualPrice,
    manualPriceAt: manualPrice == null ? undefined : priceChanged ? nowIso : existing?.manualPriceAt,
  }
}

/** The first buy recorded with a new holding (call only after validation passed). */
export function formToFirstBuy(v: HoldingFormValues, holdingId: string): NewTransaction {
  const amount = entersAmount(v.assetClass)
  return {
    holdingId,
    type: 'buy',
    date: dateToIso(v.date),
    quantity: amount ? Number(v.buyPrice) : unitsFromInput(Number(v.qty), v.assetClass),
    price: amount ? 1 : Number(v.buyPrice),
    fee: parseOptional(v.fee) ?? 0,
  }
}

/** Rupiah moved by a transaction: what a buy cost, or what a sell brought back, fees included. */
export const cashOf = (t: Pick<NewTransaction, 'type' | 'quantity' | 'price' | 'fee'>): number => Math.round(t.quantity * t.price + (t.type === 'buy' ? t.fee : -t.fee))

/** Validates the row and rejects a sell larger than what is held on that date order. */
export function parseTransaction(v: TransactionFormValues, holding: Holding, existing: readonly Transaction[]): TransactionResult {
  const qty = parseOptional(v.qty)
  const fee = parseOptional(v.fee)
  // A fund tracked by amount: qty is rupiah, converted to units at today's price per unit (buy or sell), so a top-up
  // adds exactly its amount to both cost and value.
  const amount = holding.byAmount
  const unitPrice = holding.manualPrice ?? 1
  const price = amount ? unitPrice : parseOptional(v.price)
  if (!isPositive(qty) || !isNonNegative(price) || (fee !== undefined && !isNonNegative(fee))) return { ok: false, error: 'positive' }
  const tx: NewTransaction = {
    holdingId: holding.id,
    type: v.type,
    date: dateToIso(v.date),
    quantity: amount ? qty / unitPrice : unitsFromInput(qty, holding.assetClass),
    price,
    fee: fee ?? 0,
  }
  try {
    position([...existing, { ...tx, id: 'pending' }])
  } catch {
    return { ok: false, error: 'oversell' }
  }
  return { ok: true, tx }
}

/** A sell row for everything still held, at the holding's current price (if set) and today's date; the user still presses Add. */
export function sellAllRow(holding: Holding, txns: readonly Transaction[], today: string): TransactionFormValues {
  const held = position(txns).quantity
  const qty = holding.byAmount ? held * (holding.manualPrice ?? 1) : inputFromUnits(held, holding.assetClass)
  return { type: 'sell', qty: String(qty), price: holding.byAmount || holding.manualPrice == null ? '' : String(holding.manualPrice), fee: '', date: today }
}
