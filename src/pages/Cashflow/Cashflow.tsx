import { useState } from 'react'
import { useCashflow } from '@/cashflowStore'
import { PixelIcon } from '@/components/PixelIcon'
import { SyncBar } from '@/components/SyncBar'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardTitle, Field, fieldClass, Label, Segments } from '@/components/ui-bits'
import { accountBalances, resolveAccount, validateAccountName } from '@/domain/accounts'
import { addMonths, lastMonths, localDate, monthOf, monthSummary } from '@/domain/cashflow'
import { DEFAULT_ACCOUNT_ID, MAX_ACCOUNT_NAME, TRANSFER } from '@/domain/schema'
import { useI18n } from '@/i18n'
import { href } from '@/routes'
import { useSettings } from '@/settings'
import type { AccountNameError, CashEntry, Key } from '@/types'
import { useCashEntries } from '@/useCashEntries'
import { useSheetSync } from '@/useSheetSync'
import { useNow } from '@/useNow'
import { budgetBar } from '@/view/bars'
import { categoryColor, categoryIcon, COLOR, signColor } from '@/view/tokens'
import { Bills } from './Bills'
import type { AccountsProps, CategoryBarsProps, DayGroup, EntryListProps, MonthHeroProps, SixMonthsProps } from './Cashflow.types'

const MONTHS_SHOWN = 6

export function Cashflow() {
  const { t, month: monthName } = useI18n()
  const sync = useSheetSync()
  const { entries, pendingIds } = useCashEntries()
  const removeEntry = useCashflow((s) => s.removeEntry)
  const accounts = useCashflow((s) => s.accounts)
  const budget = useSettings((s) => s.monthlyBudget)
  const today = localDate(useNow())
  const [month, setMonth] = useState(() => monthOf(today))

  const summary = monthSummary(entries, month, today)
  const inMonth = entries.filter((e) => monthOf(e.date) === month)
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

      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-4">
          <EntryList entries={inMonth} accounts={accounts} pendingIds={pendingIds} onRemove={removeEntry} />
        </div>
        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
          <Accounts entries={entries} />
          <Bills />
          <CategoryBars title={t('cf.where')} totals={summary.expenseByCategory} />
          {summary.incomeByCategory.length > 0 && <CategoryBars title={t('cf.incomeFrom')} totals={summary.incomeByCategory} />}
          <SixMonths months={lastMonths(entries, month, MONTHS_SHOWN)} current={month} />
        </div>
      </div>
    </>
  )
}

function MonthHero({ summary: s, budget }: MonthHeroProps) {
  const { t, money, compact, num, month } = useI18n()
  const daysLeft = s.daysInMonth - s.daysElapsed
  const over = budget ? s.expense - budget : 0
  const savings = s.savingsRate
  const tiles = [
    { label: t('cf.income'), value: compact(s.income), color: COLOR.text },
    { label: t('cf.net'), value: `${s.net >= 0 ? '+' : '−'}${compact(Math.abs(s.net))}`, color: signColor(s.net) },
    { label: t('cf.savingsRate'), value: savings === null ? '—' : `${savings < 0 ? '−' : ''}${num(Math.abs(savings), 0)}%`, color: savings === null ? COLOR.muted : signColor(savings) },
  ]

  return (
    <Card aria-label={t('cf.spent', { month: month(s.month) })} className="flex flex-wrap gap-4">
      <div className="flex min-w-0 flex-[3_1_440px] flex-col gap-2">
        <Label>{t('cf.spent', { month: month(s.month) })}</Label>
        <div className="flex items-baseline gap-1.5 leading-[0.8]">
          <span className="font-display text-4xl text-text-muted">Rp</span>
          <span className="font-display text-[clamp(52px,8vw,96px)]">{num(s.expense)}</span>
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

function CategoryBars({ title, totals }: CategoryBarsProps) {
  const { t, money, num, category } = useI18n()
  return (
    <Card aria-label={title}>
      <CardTitle icon="chest">{title}</CardTitle>
      {!totals.length && <p className="text-sm text-text-muted">{t('cf.noEntries')}</p>}
      <ul className="flex flex-col gap-2.5">
        {totals.map((c) => (
          <li key={c.category} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <PixelIcon name={categoryIcon(c.category)} color={categoryColor(c.category)} size={14} />
                {category(c.category)}
              </span>
              <span className="font-mono">
                {money(c.amount)} <span className="text-text-muted">· {num(c.pct, 0)}%</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-empty">
              <div className="h-full rounded" style={{ width: `${c.pct}%`, background: categoryColor(c.category) }} />
            </div>
          </li>
        ))}
      </ul>
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
    // Transfers only move money between accounts.
    if (e.type !== TRANSFER) g.net += e.type === 'income' ? e.amount : -e.amount
  }
  return groups
}

function EntryList({ entries, accounts, pendingIds, onRemove }: EntryListProps) {
  const { t, money, day, category } = useI18n()
  const accountName = (ref: string | undefined) => accounts.find((a) => a.id === resolveAccount(ref, accounts))?.name ?? ''
  return (
    <Card aria-label={t('cf.entries')}>
      <CardTitle icon="coin">{t('cf.entries')}</CardTitle>
      {!entries.length && <p className="text-sm text-text-muted">{t('cf.noEntries')}</p>}
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
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{e.note || label}</span>
                    <span className="flex flex-wrap gap-1.5 font-label text-[11px] text-text-muted uppercase">
                      {/* The label is already the title when there is no note. */}
                      {e.note ? `${label} · ` : ''}
                      {transfer ? t('cf.transfer') : accountName(e.account)}
                      {pendingIds.has(e.id) && <span className="text-warn-text">· {t('cf.notSynced')}</span>}
                    </span>
                  </span>
                  <span aria-hidden="true" className="flex-grow -translate-y-1 border-b-[1.5px] border-dotted border-border" />
                  <span className="font-mono font-medium" style={{ color: transfer ? COLOR.muted : e.type === 'income' ? COLOR.up : COLOR.text }}>
                    {transfer ? '' : e.type === 'income' ? '+' : '−'}
                    {money(e.amount)}
                  </span>
                  <button
                    type="button"
                    aria-label={t('cf.remove')}
                    onClick={() => confirm(t('cf.deleteConfirm', { amount: money(e.amount), label: e.note || label })) && onRemove(e.id)}
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
function Accounts({ entries }: AccountsProps) {
  const { t, money } = useI18n()
  const accounts = useCashflow((s) => s.accounts)
  const addAccount = useCashflow((s) => s.addAccount)
  const updateAccount = useCashflow((s) => s.updateAccount)
  // undefined = no form; 'new' = adding; otherwise the id being edited.
  const [editing, setEditing] = useState<string>()
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [since, setSince] = useState('')
  const [error, setError] = useState<AccountNameError>()
  const balances = accountBalances(accounts, entries)
  const shown = [...accounts].sort((a, b) => Number(a.archived) - Number(b.archived))
  const total = accounts.reduce((sum, a) => (a.archived ? sum : sum + balances[a.id]), 0)
  const signed = (v: number) => `${v < 0 ? '−' : ''}${money(Math.abs(v))}`

  function open(id: string) {
    const a = accounts.find((x) => x.id === id)
    setEditing(id)
    setName(a?.name ?? '')
    setStart(a ? String(a.startingBalance) : '')
    // New accounts: "what I hold today". Existing ones without a date keep counting every entry until one is set.
    setSince(a ? (a.balanceDate ?? '') : localDate(Date.now()))
    setError(undefined)
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
              <span className="truncate">{a.name}</span>
              {a.archived && <Badge tone="neutral">{t('cf.archived')}</Badge>}
              <span aria-hidden="true" className="flex-grow -translate-y-1 border-b-[1.5px] border-dotted border-border" />
              <span className="font-mono font-medium" style={{ color: balances[a.id] < 0 ? COLOR.down : undefined }}>
                {signed(balances[a.id])}
              </span>
              <span className="flex">
                <Button size="sm" variant="ghost" onClick={() => open(a.id)}>
                  {t('cf.editAccount')}
                </Button>
                {a.id !== DEFAULT_ACCOUNT_ID && (
                  <Button size="sm" variant="ghost" onClick={() => updateAccount(a.id, { archived: !a.archived })}>
                    {t(a.archived ? 'cf.restore' : 'cf.archive')}
                  </Button>
                )}
              </span>
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
