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

export function holdingToForm(h: Holding | undefined, today: string): HoldingFormValues {
  const assetClass = h?.assetClass ?? 'idx_stock'
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
    price: h?.manualPrice?.toString() ?? '',
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
  if (isNew) {
    if (!isPositive(parseOptional(v.qty))) errors.qty = 'positive'
    if (!isNonNegative(parseOptional(v.buyPrice))) errors.buyPrice = 'required'
    const fee = parseOptional(v.fee)
    if (fee !== undefined && !isNonNegative(fee)) errors.fee = 'positive'
  }
  return errors
}

/** Holding fields from valid form values. The price timestamp moves only when the price changes. */
export function formToHolding(v: HoldingFormValues, existing: Holding | undefined, nowIso: string): NewHolding {
  const manualPrice = parseOptional(v.price)
  const priceChanged = manualPrice !== existing?.manualPrice
  return {
    assetClass: v.assetClass,
    group: v.group,
    symbol: v.symbol.trim().toUpperCase(),
    name: v.name.trim() || undefined,
    platform: v.platform.trim() || undefined,
    currency: v.currency,
    paper: v.paper,
    // Stop and target only mean something for trades.
    stop: v.group === 'trading' ? parseOptional(v.stop) : undefined,
    target: v.group === 'trading' ? parseOptional(v.target) : undefined,
    manualPrice,
    manualPriceAt: manualPrice == null ? undefined : priceChanged ? nowIso : existing?.manualPriceAt,
  }
}

/** The first buy recorded with a new holding (call only after validation passed). */
export function formToFirstBuy(v: HoldingFormValues, holdingId: string): NewTransaction {
  return {
    holdingId,
    type: 'buy',
    date: dateToIso(v.date),
    quantity: unitsFromInput(Number(v.qty), v.assetClass),
    price: Number(v.buyPrice),
    fee: parseOptional(v.fee) ?? 0,
  }
}

/** Validates the row and rejects a sell larger than what is held on that date order. */
export function parseTransaction(v: TransactionFormValues, holding: Holding, existing: readonly Transaction[]): TransactionResult {
  const qty = parseOptional(v.qty)
  const price = parseOptional(v.price)
  const fee = parseOptional(v.fee)
  if (!isPositive(qty) || !isNonNegative(price) || (fee !== undefined && !isNonNegative(fee))) return { ok: false, error: 'positive' }
  const tx: NewTransaction = {
    holdingId: holding.id,
    type: v.type,
    date: dateToIso(v.date),
    quantity: unitsFromInput(qty, holding.assetClass),
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
