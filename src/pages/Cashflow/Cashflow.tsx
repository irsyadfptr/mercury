import { useState } from 'react'
import { useCashflow } from '@/cashflowStore'
import { PixelIcon } from '@/components/PixelIcon'
import { SyncBar } from '@/components/SyncBar'
import { Button } from '@/components/ui/button'
import { Card, CardTitle, Label, Segments } from '@/components/ui-bits'
import { addMonths, lastMonths, localDate, monthOf, monthSummary } from '@/domain/cashflow'
import { useI18n } from '@/i18n'
import { href } from '@/routes'
import { useSettings } from '@/settings'
import type { CashEntry } from '@/types'
import { useCashEntries } from '@/useCashEntries'
import { useSheetSync } from '@/useSheetSync'
import { useNow } from '@/useNow'
import { budgetBar } from '@/view/bars'
import { categoryColor, categoryIcon, COLOR, signColor } from '@/view/tokens'
import type { CategoryBarsProps, DayGroup, EntryListProps, MonthHeroProps, SixMonthsProps } from './Cashflow.types'

const MONTHS_SHOWN = 6

export function Cashflow() {
  const { t, month: monthName } = useI18n()
  const sync = useSheetSync()
  const { entries, pendingIds } = useCashEntries()
  const removePending = useCashflow((s) => s.removePending)
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
          <EntryList entries={inMonth} pendingIds={pendingIds} onRemovePending={removePending} />
        </div>
        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
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
    g.net += e.type === 'income' ? e.amount : -e.amount
  }
  return groups
}

function EntryList({ entries, pendingIds, onRemovePending }: EntryListProps) {
  const { t, money, day, category } = useI18n()
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
            {g.entries.map((e) => (
              <li key={e.id} className="flex items-center gap-3 border-b border-border py-2">
                <PixelIcon name={categoryIcon(e.category)} color={categoryColor(e.category)} size={18} className="shrink-0" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{e.note || category(e.category)}</span>
                  <span className="flex gap-1.5 font-label text-[11px] text-text-muted uppercase">
                    {/* The category is already the title when there is no note. */}
                    {e.note && category(e.category)}
                    {pendingIds.has(e.id) && <span className="text-warn-text">{e.note && '· '}{t('cf.notSynced')}</span>}
                  </span>
                </span>
                <span aria-hidden="true" className="flex-grow -translate-y-1 border-b-[1.5px] border-dotted border-border" />
                <span className="font-mono font-medium" style={{ color: e.type === 'income' ? COLOR.up : COLOR.text }}>
                  {e.type === 'income' ? '+' : '−'}
                  {money(e.amount)}
                </span>
                {pendingIds.has(e.id) && (
                  <button
                    type="button"
                    aria-label={t('cf.remove')}
                    onClick={() => onRemovePending(e.id)}
                    className="rounded px-1.5 text-text-muted hover:text-down focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  )
}
