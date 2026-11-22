// Pure cashflow math and Sheet row mapping. No clock, storage or network: every input is a parameter.
import type { CashEntry, CashType, CategoryNameError, CategoryTotal, CustomCategory, MonthKey, MonthSummary, MonthTotal, ParsedRows, Shortcut } from '@/types'
import { ADJUSTMENT, CashEntry as CashEntrySchema, INVEST, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from './schema'

export const monthOf = (yyyyMmDd: string): MonthKey => yyyyMmDd.slice(0, 7)

/** Local calendar date, not UTC: an expense at 01:00 WIB belongs to that local day. */
export function localDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addMonths(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

const BUILT_IN = new Set<string>([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, ADJUSTMENT, INVEST])
/** "Food" typed in the Sheet means the built-in "food", not a new category. */
const BUILT_IN_BY_LOWER = new Map([...BUILT_IN].map((c) => [c.toLowerCase(), c]))

/** Built-in categories are stored as ids (translated in the UI); custom ones are stored as the name the user typed. */
export const isBuiltIn = (c: string): boolean => BUILT_IN.has(c)

export const MAX_CATEGORY_LENGTH = 24

/**
 * Categories offered for a type: built-ins first, then custom names created on this device or found in
 * entries (so a category made on the phone appears on the laptop after a sync). Deduped case-insensitively.
 */
export function categoriesFor(type: CashType, custom: readonly CustomCategory[], entries: readonly CashEntry[]): string[] {
  const builtIns: readonly string[] = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES
  const seen = new Set(builtIns.map((c) => c.toLowerCase()))
  const extra: string[] = []
  const names = [...custom.filter((c) => c.type === type).map((c) => c.name), ...entries.filter((e) => e.type === type).map((e) => e.category)]
  for (const name of names) {
    const key = name.toLowerCase()
    if (isBuiltIn(name) || seen.has(key)) continue
    seen.add(key)
    extra.push(name)
  }
  return [...builtIns, ...extra.sort((a, b) => a.localeCompare(b))]
}

/** Checks a new category name against what exists. labels = names shown for existing categories (translated built-ins + custom). */
export function validateCategoryName(raw: string, labels: readonly string[]): { ok: true; name: string } | { ok: false; error: CategoryNameError } {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (!name) return { ok: false, error: 'required' }
  if (name.length > MAX_CATEGORY_LENGTH) return { ok: false, error: 'tooLong' }
  if (isBuiltIn(name) || labels.some((l) => l.toLowerCase() === name.toLowerCase())) return { ok: false, error: 'duplicate' }
  return { ok: true, name }
}

/** Real spending or income: transfers, balance adjustments and money moved to / from holdings only move account balances. */
export const isCashflow = (e: CashEntry, type?: CashType): boolean => (type ? e.type === type : e.type !== 'transfer') && e.category !== ADJUSTMENT && e.category !== INVEST

const sumOf = (entries: readonly CashEntry[], type: CashType) => entries.reduce((a, e) => (isCashflow(e, type) ? a + e.amount : a), 0)

function totals(entries: readonly CashEntry[], type: CashType): CategoryTotal[] {
  const by = new Map<string, number>()
  for (const e of entries) if (isCashflow(e, type)) by.set(e.category, (by.get(e.category) ?? 0) + e.amount)
  const total = sumOf(entries, type)
  return [...by].map(([category, amount]) => ({ category, amount, pct: total ? (amount / total) * 100 : 0 })).sort((a, b) => b.amount - a.amount)
}

/** One month's totals. today (yyyy-mm-dd) decides how far into the month we are, for the pace projection. */
export function monthSummary(entries: readonly CashEntry[], month: MonthKey, today: string): MonthSummary {
  const inMonth = entries.filter((e) => monthOf(e.date) === month)
  const income = sumOf(inMonth, 'income')
  const expense = sumOf(inMonth, 'expense')
  const total = daysInMonth(month)
  const current = monthOf(today)
  const daysElapsed = month < current ? total : month > current ? 0 : Number(today.slice(8, 10))
  return {
    month,
    income,
    expense,
    net: income - expense,
    savingsRate: income ? ((income - expense) / income) * 100 : null,
    expenseByCategory: totals(inMonth, 'expense'),
    incomeByCategory: totals(inMonth, 'income'),
    daysElapsed,
    daysInMonth: total,
    projectedExpense: daysElapsed ? Math.round((expense / daysElapsed) * total) : 0,
  }
}

/** Income and expense for `count` months ending at `month`, oldest first. */
export function lastMonths(entries: readonly CashEntry[], month: MonthKey, count: number): MonthTotal[] {
  return Array.from({ length: count }, (_, i) => {
    const m = addMonths(month, i - count + 1)
    const inMonth = entries.filter((e) => monthOf(e.date) === m)
    return { month: m, income: sumOf(inMonth, 'income'), expense: sumOf(inMonth, 'expense') }
  })
}

const SHORTCUT_WINDOW_DAYS = 90

/**
 * Quick add chips: the same type + category + amount + note + account logged at least twice in the last 90 days,
 * most used first (then most recent). Transfers and adjustments are left out.
 */
export function frequentEntries(entries: readonly CashEntry[], today: string, limit = 6): Shortcut[] {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - SHORTCUT_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
  const by = new Map<string, { s: Shortcut; count: number; last: string }>()
  for (const e of entries) {
    if (e.type === 'transfer' || !isCashflow(e) || e.date < since) continue
    const s: Shortcut = { type: e.type, category: e.category, amount: e.amount, note: e.note, account: e.account }
    const key = JSON.stringify(s)
    const had = by.get(key)
    by.set(key, { s, count: (had?.count ?? 0) + 1, last: had && had.last > e.date ? had.last : e.date })
  }
  return [...by.values()]
    .filter((x) => x.count >= 2)
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, limit)
    .map((x) => x.s)
}

/** Synced entries plus local pending ones; pending wins on id clash; newest date first. */
export function mergeEntries(synced: readonly CashEntry[], pending: readonly CashEntry[]): CashEntry[] {
  const pendingIds = new Set(pending.map((e) => e.id))
  return [...pending, ...synced.filter((e) => !pendingIds.has(e.id))].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  )
}

// ---- Number pad ----

/** Max digits the pad accepts (Rp99,999,999,999). */
export const PAD_MAX_DIGITS = 11

/** Applies a pad key to the digit string: a digit, '000', or 'back'. Leading zeros are dropped. */
export function padInput(digits: string, key: string): string {
  if (key === 'back') return digits.slice(0, -1)
  if (!/^\d+$/.test(key)) return digits
  const next = (digits + key).replace(/^0+/, '')
  return next.length > PAD_MAX_DIGITS ? digits : next
}

// ---- Google Sheet rows ----

/** Column order of the Entries tab. New columns go at the end, so older sheets and rows keep working (blank = none). */
export const SHEET_COLUMNS = ['id', 'date', 'type', 'amount', 'category', 'note', 'createdAt', 'account', 'toAccount'] as const

export const entryToRow = (e: CashEntry): (string | number)[] => [e.id, e.date, e.type, e.amount, e.category, e.note ?? '', e.createdAt, e.account ?? '', e.toAccount ?? '']

/** This device's synced entries that a sheet's rows lack: carried over when the device moves to another sheet. */
export function missingFromRows(entries: readonly CashEntry[], rows: readonly unknown[][]): CashEntry[] {
  const there = new Set(rows.map((r) => String(r[0] ?? '').trim()))
  return entries.filter((e) => !there.has(e.id))
}

const SHEETS_EPOCH_MS = Date.UTC(1899, 11, 30)
const DAY_MS = 86_400_000

/** A date typed in the Sheet: Sheets turns "2026-11-16" or "16/11/2026" into a day number; text "16/11/2026" is read day-first. */
export function sheetDate(cell: string): string {
  if (/^\d{5}(\.\d+)?$/.test(cell)) return new Date(SHEETS_EPOCH_MS + Math.floor(Number(cell)) * DAY_MS).toISOString().slice(0, 10)
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(cell)
  return dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : cell
}

/** createdAt typed or reformatted as a Sheets date-time number. */
const sheetDateTime = (cell: string): string => (/^\d{5}(\.\d+)?$/.test(cell) ? new Date(SHEETS_EPOCH_MS + Number(cell) * DAY_MS).toISOString() : cell)

/**
 * Rows come from a sheet the user can edit by hand: validate each one and skip what does not fit.
 * Typed rows may leave id and createdAt blank: with `fill`, they get new ones, listed in `filled` (row = index in rows)
 * so the sync can write them back and the id stays the same next time.
 */
export function rowsToEntries(rows: readonly unknown[][], fill?: { newId: () => string; now: string }): ParsedRows {
  const entries: CashEntry[] = []
  const filled: ParsedRows['filled'] = []
  let skipped = 0
  rows.forEach((row, index) => {
    const cells = SHEET_COLUMNS.map((_, i) => String(row[i] ?? '').trim())
    if (!cells.some(Boolean)) return // blank line
    const [id, date, type, amount, category, note, createdAt, account, toAccount] = cells
    const builtIn = BUILT_IN_BY_LOWER.get(category.toLowerCase())
    const parsed = CashEntrySchema.safeParse({
      id: id || fill?.newId(),
      date: sheetDate(date),
      type: type.toLowerCase(),
      // A number cell as is; typed text like "Rp25,000" or "1.000.000" keeps its digits (amounts are whole rupiah).
      amount: Number(/^\d+(\.\d+)?$/.test(amount) ? amount : amount.replace(/\D/g, '')),
      category: builtIn ?? category,
      note: note || undefined,
      createdAt: createdAt ? sheetDateTime(createdAt) : fill?.now,
      account: account || undefined,
      toAccount: toAccount || undefined,
    })
    if (!parsed.success) return void skipped++
    entries.push(parsed.data)
    if (!id || !createdAt) filled.push({ row: index, id: parsed.data.id, createdAt: parsed.data.createdAt })
  })
  return { entries, skipped, filled }
}

/** yyyy-mm-dd plus (or minus) whole days. */
export function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}
