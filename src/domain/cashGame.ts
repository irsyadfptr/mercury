// Pure cashflow game layer: logging streak, no-spend days, the month score and badges. Everything is worked out from
// the entries and accounts, so nothing extra is stored or synced.
import type { Account, CashBadge, CashEntry, ColumnSpec, Goal, MonthScore } from '@/types'
import { accountBalances } from './accounts'
import { isCashflow, localDate, monthOf, monthSummary } from './cashflow'
import { journalStreak } from './journal'
import { parseTable } from './portfolioSheet'
import { Goal as GoalSchema } from './schema'

const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

/** Local days on which something was logged (by when it was entered, so a backdated entry logged today counts today). */
const loggedDays = (entries: readonly CashEntry[]) => [...new Set(entries.map((e) => localDate(Date.parse(e.createdAt))))]

/** Days in a row with at least one entry logged, ending today (or yesterday while today has none yet). */
export const loggingStreak = (entries: readonly CashEntry[], today: string): number => journalStreak(loggedDays(entries).map((date) => ({ date })), today)

/** Longest run of days in a row with an entry logged, ever. */
export function bestStreak(entries: readonly CashEntry[]): number {
  const days = loggedDays(entries).sort()
  let best = 0
  let run = 0
  days.forEach((d, i) => {
    run = i > 0 && nextDay(days[i - 1]) === d ? run + 1 : 1
    best = Math.max(best, run)
  })
  return best
}

/** Days of the month so far (to today) without any spending. Transfers and adjustments don't count as spending. */
export function noSpendDays(entries: readonly CashEntry[], month: string, today: string): number {
  const spent = new Set(entries.filter((e) => isCashflow(e, 'expense') && monthOf(e.date) === month).map((e) => e.date))
  const { daysElapsed } = monthSummary([], month, today)
  let n = 0
  for (let d = 1; d <= daysElapsed; d++) if (!spent.has(`${month}-${String(d).padStart(2, '0')}`)) n++
  return n
}

const part = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 25)

/**
 * The month's score, four visible parts of 0–25:
 * budget (full when spending is within it, falling to 0 at twice the budget; 0 without a budget),
 * savings (savings rate against 20%), logging (share of days so far with something logged),
 * matched (share of active accounts matched to the bank this month).
 */
export function monthScore(entries: readonly CashEntry[], accounts: readonly Account[], month: string, today: string, budget?: number): MonthScore {
  const s = monthSummary(entries, month, today)
  const logged = loggedDays(entries).filter((d) => monthOf(d) === month).length
  const active = accounts.filter((a) => !a.archived)
  const score = {
    budget: budget ? part(1 - Math.max(0, s.expense - budget) / budget) : 0,
    savings: s.savingsRate === null ? 0 : part(s.savingsRate / 20),
    logging: s.daysElapsed ? part(logged / s.daysElapsed) : 0,
    matched: active.length ? part(active.filter((a) => a.matchedAt && monthOf(a.matchedAt) === month).length / active.length) : 0,
  }
  return { ...score, total: score.budget + score.savings + score.logging + score.matched }
}

/** Badges earned so far. "Under budget" and "Saver" count finished months only, so they can't flicker mid-month. */
export function cashBadges(entries: readonly CashEntry[], accounts: readonly Account[], goals: readonly Goal[], today: string, budget?: number): CashBadge[] {
  const current = monthOf(today)
  const past = [...new Set(entries.map((e) => monthOf(e.date)))].filter((m) => m < current).map((m) => monthSummary(entries, m, today))
  const best = bestStreak(entries)
  const balances = accountBalances(accounts, entries)
  const active = accounts.filter((a) => !a.archived)
  const earned: [CashBadge, boolean][] = [
    ['firstEntry', entries.length > 0],
    ['streak7', best >= 7],
    ['streak30', best >= 30],
    ['underBudget', !!budget && past.some((s) => s.expense > 0 && s.expense <= budget)],
    ['saver20', past.some((s) => s.savingsRate !== null && s.savingsRate >= 20)],
    ['allMatched', active.length > 0 && active.every((a) => a.matchedAt && monthOf(a.matchedAt) === current)],
    ['goalReached', goals.some((g) => !g.archived && (balances[g.account] ?? 0) >= g.target)],
  ]
  return earned.filter(([, ok]) => ok).map(([b]) => b)
}

export const ALL_CASH_BADGES: readonly CashBadge[] = ['firstEntry', 'streak7', 'streak30', 'underBudget', 'saver20', 'allMatched', 'goalReached']

/** Progress toward a goal, 0–1 (never above 1), from its account's balance. */
export const goalProgress = (g: Goal, balances: Record<string, number>): number => Math.max(0, Math.min(1, (balances[g.account] ?? 0) / g.target))

// ---- Google Sheet: Goals tab ----

export const GOAL_COLUMNS: readonly ColumnSpec[] = [
  ['id', 'string'],
  ['name', 'string'],
  ['target', 'number'],
  ['account', 'string'],
  ['archived', 'boolean'],
  ['updatedAt', 'string'],
]

export const goalsFromSheet = (rows: readonly unknown[][]) => parseTable(GOAL_COLUMNS, rows, GoalSchema)
