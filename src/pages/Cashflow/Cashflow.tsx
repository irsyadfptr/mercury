import { useEffect, useRef, useState } from 'react'
import { useCashflow } from '@/cashflowStore'
import { PixelIcon } from '@/components/PixelIcon'
import { SyncBar } from '@/components/SyncBar'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardTitle, Field, fieldClass, Label, Segments } from '@/components/ui-bits'
import { accountBalances, accountsTotal, balanceAdjustment, filterEntries, resolveAccount, runningBalances, validateAccountName } from '@/domain/accounts'
import { addMonths, isCashflow, lastMonths, localDate, monthOf, monthSummary } from '@/domain/cashflow'
import { ADJUSTMENT, DEFAULT_ACCOUNT_ID, EXPENSE_CATEGORIES, MAX_ACCOUNT_NAME, TRANSFER } from '@/domain/schema'
import { useI18n } from '@/i18n'
import { href } from '@/routes'
import { useSettings } from '@/settings'
import type { AccountNameError, CashEntry, EntryFilter, Key } from '@/types'
import { useCashEntries } from '@/useCashEntries'
import { useSheetSync } from '@/useSheetSync'
import { useNow } from '@/useNow'
import { budgetBar } from '@/view/bars'
import { categoryColor, categoryIcon, COLOR, signColor } from '@/view/tokens'
import { Bills } from './Bills'
import { Goals, MonthQuest } from './CashGame'
import { Invest } from './Invest'
import type { AccountsProps, CategoryBarsProps, DayGroup, EntryListProps, MonthHeroProps, SixMonthsProps } from './Cashflow.types'

const MONTHS_SHOWN = 6

const UNDO_MS = 6000

export function Cashflow() {
  const { t, money, month: monthName, category } = useI18n()
  const sync = useSheetSync()
  const { entries: all, pendingIds } = useCashEntries()
  const removeEntry = useCashflow((s) => s.removeEntry)
  const accounts = useCashflow((s) => s.accounts)
  const budget = useSettings((s) => s.monthlyBudget)
  const categoryBudgets = useSettings((s) => s.categoryBudgets)
  const today = localDate(useNow())
  const [month, setMonth] = useState(() => monthOf(today))
  const [filter, setFilter] = useState<EntryFilter>({ text: '' })
  // Undo: a deleted entry is only hidden for a few seconds, then really deleted (also when leaving the page).
  const [hidden, setHidden] = useState<CashEntry>()
  const hiddenRef = useRef<CashEntry>(undefined)
  useEffect(() => {
    hiddenRef.current = hidden
    if (!hidden) return
    const timer = setTimeout(() => {
      removeEntry(hidden.id)
      setHidden(undefined)
    }, UNDO_MS)
    return () => clearTimeout(timer)
  }, [hidden, removeEntry])
  // Leaving the page commits a delete still waiting for its undo.
  useEffect(() => () => hiddenRef.current && removeEntry(hiddenRef.current.id), [removeEntry])
  function remove(e: CashEntry) {
    if (hidden) removeEntry(hidden.id) // a second delete commits the first
    setHidden(e)
  }

  const entries = hidden ? all.filter((e) => e.id !== hidden.id) : all
  const summary = monthSummary(entries, month, today)
  const filtering = !!(filter.account || filter.category || filter.text.trim())
  const shown = filtering ? filterEntries(entries, filter, accounts, (c) => category(c)) : entries.filter((e) => monthOf(e.date) === month)
  const isCurrent = month >= monthOf(today)

  return (
    <>
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label={t('cf.prevMonth')} onClick={() => setMonth(addMonths(month, -1))}>
              ‹
            </Button>
            <h1 className="min-w-[10ch] text-center font-display text-4xl leading-none uppercase">{monthName(month)}</h1>
            <Button variant="outline" size="icon" aria-label={t('cf.nextMonth')} disabled={isCurrent} onClick={() => setMonth(addMonths(month, 1))}>
              ›
            </Button>
          </div>
          <Button asChild className="font-label text-xs uppercase shadow-[0_3px_0_var(--accent-deep)] active:translate-y-0.5 active:shadow-none">
            <a href={href('add')}>{t('cf.add')}</a>
          </Button>
        </div>
        <SyncBar sync={sync} />
      </Card>

      <MonthHero summary={summary} budget={budget} />
      <MonthQuest entries={entries} />

      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-4">
          <EntryList entries={shown} all={entries} accounts={accounts} pendingIds={pendingIds} onRemove={remove} filter={filter} onFilter={setFilter} filtering={filtering} />
        </div>
        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
          <Accounts entries={entries} onPick={(account) => setFilter({ text: '', account })} />
          <Goals entries={entries} />
          <Invest />
          <Bills />
          <CategoryBars title={t('cf.where')} totals={summary.expenseByCategory} budgets={categoryBudgets ?? {}} />
          {summary.incomeByCategory.length > 0 && <CategoryBars title={t('cf.incomeFrom')} totals={summary.incomeByCategory} />}
          <SixMonths months={lastMonths(entries, month, MONTHS_SHOWN)} current={month} />
        </div>
      </div>

      {hidden && (
        <div role="status" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-lg">
          <span className="min-w-0 truncate text-sm">{t('cf.deleted', { label: hidden.note || category(hidden.category), amount: money(hidden.amount) })}</span>
          <Button size="sm" variant="outline" onClick={() => setHidden(undefined)}>
            {t('cf.undo')}
          </Button>
        </div>
      )}
    </>
  )
}

function MonthHero({ summary: s, budget }: MonthHeroProps) {
  const { t, money, compact, num, amount, month } = useI18n()
  const daysLeft = s.daysInMonth - s.daysElapsed
  const over = budget ? s.expense - budget : 0
  const savings = s.savingsRate
  const tiles = [
    { label: t('cf.income'), value: compact(s.income), color: COLOR.text },
    { label: t('cf.spentLegend'), value: compact(s.expense), color: COLOR.text },
    { label: t('cf.savingsRate'), value: savings === null ? '—' : `${savings < 0 ? '−' : ''}${num(Math.abs(savings), 0)}%`, color: savings === null ? COLOR.muted : signColor(savings) },
  ]

  return (
    <Card aria-label={t('cf.netOf', { month: month(s.month) })} className="flex flex-wrap gap-4">
      <div className="flex min-w-0 flex-[3_1_440px] flex-col gap-2">
        <Label>{t('cf.netOf', { month: month(s.month) })}</Label>
        {/* Net = income − spent: green and + when income covers spending, red and − when spending is higher. */}
        <div className="flex items-baseline gap-1.5 leading-[0.8]" style={{ color: s.net >= 0 ? COLOR.up : COLOR.down }}>
          <span className="font-display text-4xl">{s.net >= 0 ? '+' : '−'}Rp</span>
          <span className="font-display text-[clamp(52px,8vw,96px)]">{amount(Math.abs(s.net))}</span>
        </div>
        {budget ? (
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex flex-wrap justify-between gap-2">
              <Label className="text-text">{t('cf.budgetOf', { amount: money(budget) })}</Label>
              <Label className={over > 0 ? 'text-down' : undefined}>
                {over > 0 ? t('cf.over', { amount: money(over) }) : t('cf.left', { amount: money(budget - s.expense), d: daysLeft })}
              </Label>
            </div>
            <Segments items={budgetBar(s.expense, budget)} height={14} label={`${money(s.expense)} / ${money(budget)}`} />
          </div>
        ) : (
          <p className="text-xs text-text-muted">{t('cf.noBudget')}</p>
        )}
        {daysLeft > 0 && s.daysElapsed > 0 && <p className="text-xs text-text-muted">{t('cf.pace', { amount: money(s.projectedExpense) })}</p>}
      </div>
      <div className="grid flex-[2_1_300px] grid-cols-3 gap-2 self-start">
        {tiles.map((x) => (
          <div key={x.label} className="flex flex-col gap-0.5 rounded-lg bg-surface-2 px-3 py-2.5">
            <Label>{x.label}</Label>
            <span className="font-display text-[30px] leading-none" style={{ color: x.color }}>
              {x.value}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

/**
 * Spending (or income) per category. With budgets (the spending card): a category with a budget shows "spent / budget"
 * and its bar fills against the budget, red once over; "Budgets" edits the limits.
 */
function CategoryBars({ title, totals, budgets }: CategoryBarsProps) {
  const { t, money, num, category } = useI18n()
  const setSettings = useSettings((s) => s.set)
  const [editing, setEditing] = useState(false)
  const limits = budgets ?? {}
  // Budgeted categories with no spending yet still show, so the limit is visible.
  const rows = [...totals, ...Object.keys(limits).filter((c) => !totals.some((x) => x.category === c)).map((c) => ({ category: c, amount: 0, pct: 0 }))]
  const editable = [...new Set([...EXPENSE_CATEGORIES, ...rows.map((r) => r.category)])].filter((c) => c !== ADJUSTMENT)

  return (
    <Card aria-label={title}>
      <CardTitle
        icon="chest"
        aside={
          budgets && (
            <button type="button" onClick={() => setEditing(!editing)} className="underline underline-offset-4">
              {t(editing ? 'cf.done' : 'cf.budgets')}
            </button>
          )
        }
      >
        {title}
      </CardTitle>
      {editing ? (
        <ul className="flex flex-col gap-1.5">
          {editable.map((c) => (
            <li key={c} className="flex items-center gap-2 text-sm">
              <PixelIcon name={categoryIcon(c)} color={categoryColor(c)} size={14} />
              <span className="flex-1 truncate">{category(c)}</span>
              <input
                className={`${fieldClass} w-36 font-mono`}
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                placeholder="—"
                aria-label={t('cf.budgetFor', { s: category(c) })}
                value={limits[c] ?? ''}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value))
                  const next = { ...limits }
                  if (n > 0) next[c] = n
                  else delete next[c]
                  setSettings({ categoryBudgets: next })
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <>
          {!rows.length && <p className="text-sm text-text-muted">{t('cf.noEntries')}</p>}
          <ul className="flex flex-col gap-2.5">
            {rows.map((c) => {
              const limit = limits[c.category]
              const over = limit !== undefined && c.amount > limit
              return (
                <li key={c.category} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <PixelIcon name={categoryIcon(c.category)} color={categoryColor(c.category)} size={14} />
                      {category(c.category)}
                    </span>
                    <span className="font-mono" style={{ color: over ? COLOR.down : undefined }}>
                      {money(c.amount)}{' '}
                      <span className="text-text-muted">{limit !== undefined ? `/ ${money(limit)}` : `· ${num(c.pct, 0)}%`}</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-empty">
                    <div
                      className="h-full rounded"
                      style={{ width: `${limit !== undefined ? Math.min(100, (c.amount / limit) * 100) : c.pct}%`, background: over ? COLOR.down : categoryColor(c.category) }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Card>
  )
}

function SixMonths({ months, current }: SixMonthsProps) {
  const { t, compact, month } = useI18n()
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]))
  const height = (v: number) => `${Math.round((v / max) * 100)}%`
  const description = months.map((m) => `${month(m.month, true)}: ${t('cf.spentLegend')} ${compact(m.expense)}, ${t('cf.incomeLegend')} ${compact(m.income)}`).join('; ')

  return (
    <Card aria-label={t('cf.sixMonths')}>
      <CardTitle
        aside={
          <span className="flex gap-3">
            <span>■ {t('cf.spentLegend')}</span>
            <span className="text-accent-text">□ {t('cf.incomeLegend')}</span>
          </span>
        }
      >
        {t('cf.sixMonths')}
      </CardTitle>
      <div role="img" aria-label={description} className="flex h-[140px] items-end gap-2">
        {months.map((m) => (
          <div key={m.month} className="flex h-full flex-1 flex-col items-center gap-1">
            <div className="flex w-full flex-1 items-end justify-center gap-0.5">
              <div className="w-1/2 rounded-t-[3px]" style={{ height: height(m.expense), background: m.month === current ? COLOR.accent : 'var(--accent-soft)' }} />
              <div className="w-1/2 rounded-t-[3px] border-2 border-b-0 border-primary" style={{ height: height(m.income) }} />
            </div>
            <span className={`font-label text-[11px] uppercase ${m.month === current ? 'text-text' : 'text-text-muted'}`}>{month(m.month, true)}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

/** Pure: entries grouped by day, newest day first (entries arrive sorted). */
function groupByDay(entries: readonly CashEntry[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const e of entries) {
    let g = groups.at(-1)
    if (g?.date !== e.date) groups.push((g = { date: e.date, entries: [], net: 0 }))
    g.entries.push(e)
    // Transfers and balance adjustments only move account balances.
    if (isCashflow(e)) g.net += e.type === 'income' ? e.amount : -e.amount
  }
  return groups
}

function EntryList({ entries, all, accounts, pendingIds, onRemove, filter, onFilter, filtering }: EntryListProps) {
  const { t, money, day, category } = useI18n()
  const accountName = (ref: string | undefined) => accounts.find((a) => a.id === resolveAccount(ref, accounts))?.name ?? ''
  // Filtered by one account: show its balance after each entry (per-account view).
  const running = filter.account ? runningBalances(filter.account, accounts, all) : undefined
  const label = (c: string) => (c === TRANSFER ? t('cf.transfer') : category(c))
  const categories = [...new Set(all.map((e) => e.category))].sort((a, b) => label(a).localeCompare(label(b)))
  const set = (patch: Partial<EntryFilter>) => onFilter({ ...filter, ...patch })
  return (
    <Card aria-label={t('cf.entries')}>
      <CardTitle icon="coin" aside={filtering ? t('cf.found', { n: entries.length }) : undefined}>
        {t('cf.entries')}
      </CardTitle>
      <div className="mb-2 flex flex-wrap gap-1.5">
        <input className={`${fieldClass} min-w-[12ch] flex-[2_1_0]`} type="search" value={filter.text} onChange={(e) => set({ text: e.target.value })} placeholder={t('cf.search')} aria-label={t('cf.search')} />
        <select className={`${fieldClass} w-auto flex-1`} value={filter.account ?? ''} onChange={(e) => set({ account: e.target.value || undefined })} aria-label={t('add.account')}>
          <option value="">{t('cf.allAccounts')}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select className={`${fieldClass} w-auto flex-1`} value={filter.category ?? ''} onChange={(e) => set({ category: e.target.value || undefined })} aria-label={t('add.category')}>
          <option value="">{t('cf.allCategories')}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {label(c)}
            </option>
          ))}
        </select>
        {filtering && (
          <Button size="sm" variant="ghost" onClick={() => onFilter({ text: '' })}>
            {t('cf.clearFilter')}
          </Button>
        )}
      </div>
      {!entries.length && <p className="text-sm text-text-muted">{t(filtering ? 'cf.noMatch' : 'cf.noEntries')}</p>}
      {groupByDay(entries).map((g) => (
        <div key={g.date}>
          <div className="flex justify-between border-b-2 border-text pt-3 pb-1 font-label text-[11px] uppercase">
            <span>{day(g.date)}</span>
            <span style={{ color: signColor(g.net) }}>
              {g.net >= 0 ? '+' : '−'}
              {money(Math.abs(g.net))}
            </span>
          </div>
          <ul>
            {g.entries.map((e) => {
              const transfer = e.type === TRANSFER
              const label = transfer ? `${accountName(e.account)} → ${accountName(e.toAccount)}` : category(e.category)
              return (
                <li key={e.id} className="flex items-center gap-3 border-b border-border py-2">
                  <PixelIcon name={transfer ? 'coin' : categoryIcon(e.category)} color={transfer ? undefined : categoryColor(e.category)} size={18} className="shrink-0" />
                  <a href={href('add', { edit: e.id })} aria-label={t('cf.edit', { label: e.note || label })} className="flex min-w-0 flex-col rounded hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                    <span className="truncate">{e.note || label}</span>
                    <span className="flex flex-wrap gap-1.5 font-label text-[11px] text-text-muted uppercase">
                      {/* The label is already the title when there is no note. */}
                      {e.note ? `${label} · ` : ''}
                      {transfer ? t('cf.transfer') : accountName(e.account)}
                      {pendingIds.has(e.id) && <span className="text-warn-text">· {t('cf.notSynced')}</span>}
                    </span>
                  </a>
                  <span aria-hidden="true" className="flex-grow -translate-y-1 border-b-[1.5px] border-dotted border-border" />
                  <span className="font-mono font-medium" style={{ color: transfer ? COLOR.muted : e.type === 'income' ? COLOR.up : COLOR.text }}>
                    {transfer ? '' : e.type === 'income' ? '+' : '−'}
                    {money(e.amount)}
                    {running?.has(e.id) && <span className="block text-right text-[11px] font-normal text-text-muted">= {money(running.get(e.id)!)}</span>}
                  </span>
                  <button
                    type="button"
                    aria-label={t('cf.remove')}
                    onClick={() => onRemove(e)}
                    className="rounded px-1.5 text-text-muted hover:text-down focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </Card>
  )
}

/** Money accounts with live balances (all time, not just this month), plus add / edit / archive. */
function Accounts({ entries, onPick }: AccountsProps) {
  const { t, money } = useI18n()
  const accounts = useCashflow((s) => s.accounts)
  const addAccount = useCashflow((s) => s.addAccount)
  const updateAccount = useCashflow((s) => s.updateAccount)
  // undefined = no form; 'new' = adding; otherwise the id being edited.
  const [editing, setEditing] = useState<string>()
  // Monthly balance check: the account being matched to the bank, and the real balance typed.
  const [matching, setMatching] = useState<string>()
  const [real, setReal] = useState('')
  const today = localDate(useNow())
  const addEntry = useCashflow((s) => s.addEntry)
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [since, setSince] = useState('')
  const [error, setError] = useState<AccountNameError>()
  const balances = accountBalances(accounts, entries)
  const shown = [...accounts].sort((a, b) => Number(a.archived) - Number(b.archived))
  const total = accountsTotal(accounts, entries)
  const signed = (v: number) => `${v < 0 ? '−' : ''}${money(Math.abs(v))}`

  function open(id: string) {
    const a = accounts.find((x) => x.id === id)
    setEditing(id)
    setName(a?.name ?? '')
    setStart(a ? String(a.startingBalance) : '')
    // New accounts: "what I hold today". Existing ones without a date keep counting every entry until one is set.
    setSince(a ? (a.balanceDate ?? '') : today)
    setError(undefined)
  }

  function match(id: string) {
    if (real.trim() !== '') {
      const entry = balanceAdjustment(id, balances[id], Number(real), today)
      if (entry) addEntry(entry)
      updateAccount(id, { matchedAt: today }) // counts as matched this month even when nothing differed
    }
    setMatching(undefined)
  }

  function submit() {
    const result = validateAccountName(name, accounts.filter((a) => a.id !== editing))
    if (!result.ok) return setError(result.error)
    const startingBalance = Math.round(Number(start)) || 0
    const balanceDate = since || undefined
    if (editing === 'new') addAccount(result.name, startingBalance, balanceDate)
    else if (editing) updateAccount(editing, { name: result.name, startingBalance, balanceDate })
    setEditing(undefined)
  }

  const form = (
    <form
      className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Field label={t('cf.accountName')} error={error && t((error === 'duplicate' ? 'acctErr.duplicate' : `catErr.${error}`) as Key)} className="min-w-[10ch] flex-[2_1_0]">
          <input
            className={fieldClass}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(undefined)
            }}
            maxLength={MAX_ACCOUNT_NAME + 10}
            aria-invalid={!!error}
            autoFocus
          />
        </Field>
        <Field label={t('cf.startingBalance')} className="min-w-[10ch] flex-[1_1_0]">
          <input className={`${fieldClass} font-mono`} type="number" inputMode="numeric" step={1} value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label={t('cf.balanceDate')} hint={t('cf.balanceDateHint')} className="min-w-[14ch] flex-[1_1_100%]">
          <input className={`${fieldClass} font-mono`} type="date" value={since} onChange={(e) => setSince(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-1.5">
        <Button type="submit" variant="outline">
          {t('cf.saveAccount')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(undefined)}>
          {t('add.cancel')}
        </Button>
      </div>
    </form>
  )

  return (
    <Card aria-label={t('cf.accounts')}>
      <CardTitle icon="chest" aside={<span className="font-mono normal-case">{t('cf.accountsTotal', { amount: signed(total) })}</span>}>
        {t('cf.accounts')}
      </CardTitle>
      <ul className="flex flex-col">
        {shown.map((a) =>
          editing === a.id ? (
            <li key={a.id}>{form}</li>
          ) : (
            <li key={a.id} className={`flex flex-wrap items-center gap-2 border-b border-border py-1.5 ${a.archived ? 'text-text-muted' : ''}`}>
              <button type="button" onClick={() => onPick(a.id)} title={t('cf.showEntries')} className="truncate rounded text-left underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {a.name}
              </button>
              {a.archived && <Badge tone="neutral">{t('cf.archived')}</Badge>}
              <span aria-hidden="true" className="flex-grow -translate-y-1 border-b-[1.5px] border-dotted border-border" />
              <span className="font-mono font-medium" style={{ color: balances[a.id] < 0 ? COLOR.down : undefined }}>
                {signed(balances[a.id])}
              </span>
              <span className="flex">
                {!a.archived && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setMatching(a.id)
                      setReal('')
                    }}
                  >
                    {t('cf.match')}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => open(a.id)}>
                  {t('cf.editAccount')}
                </Button>
                {a.id !== DEFAULT_ACCOUNT_ID && (
                  <Button size="sm" variant="ghost" onClick={() => updateAccount(a.id, { archived: !a.archived })}>
                    {t(a.archived ? 'cf.restore' : 'cf.archive')}
                  </Button>
                )}
              </span>
              {matching === a.id && (
                <form
                  className="flex w-full flex-col gap-2 rounded-lg bg-surface-2 p-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    match(a.id)
                  }}
                >
                  <Field label={t('cf.realBalance', { s: a.name })} hint={t('cf.matchHint')}>
                    <input className={`${fieldClass} font-mono`} type="number" inputMode="numeric" step={1} value={real} onChange={(e) => setReal(e.target.value)} autoFocus />
                  </Field>
                  <div className="flex gap-1.5">
                    <Button type="submit" variant="outline">
                      {t('cf.saveAccount')}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setMatching(undefined)}>
                      {t('add.cancel')}
                    </Button>
                  </div>
                </form>
              )}
            </li>
          ),
        )}
      </ul>
      <div className="pt-3">
        {editing === 'new' ? (
          form
        ) : (
          <Button variant="outline" size="sm" onClick={() => open('new')} className="font-label text-[11px] uppercase">
            {t('cf.addAccount')}
          </Button>
        )}
      </div>
    </Card>
  )
}
