import { useState } from 'react'
import { useCashflow } from '@/cashflowStore'
import { PixelIcon } from '@/components/PixelIcon'
import { Button } from '@/components/ui/button'
import { Card, fieldClass, Label } from '@/components/ui-bits'
import { safeToSpend } from '@/domain/safeToSpend'
import { useI18n } from '@/i18n'
import { useSettings } from '@/settings'
import type { CashEntry } from '@/types'
import { COLOR } from '@/view/tokens'

const HEARTS = 5

/** One heart: full, half (left half red over a grey one) or empty. */
function Heart({ fill, beat }: { fill: 0 | 0.5 | 1; beat?: boolean }) {
  return (
    <span className={`relative inline-block size-6 ${beat ? 'heart-beat' : ''}`}>
      <PixelIcon name="heart" size={24} color="var(--empty)" className="absolute inset-0" />
      {fill > 0 && (
        <span className="absolute inset-0 overflow-hidden" style={{ width: fill === 1 ? '100%' : '50%' }}>
          <PixelIcon name="heart" size={24} />
        </span>
      )}
    </span>
  )
}

/**
 * Safe to spend today: the month's budget (or income) left after bills, shared over the days left. Today's share
 * shows as five hearts that empty as today's spending uses it up. Without a budget or income, it asks for a budget.
 */
export function SafeSpend({ entries, today }: { entries: readonly CashEntry[]; today: string }) {
  const { t, money, compact } = useI18n()
  const bills = useCashflow((s) => s.bills)
  const budget = useSettings((s) => s.monthlyBudget)
  const setSettings = useSettings((s) => s.set)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const s = safeToSpend(entries, bills, today, budget)

  function saveBudget() {
    const n = Math.round(Number(draft))
    setSettings({ monthlyBudget: n > 0 ? n : undefined })
    setEditing(false)
  }

  const budgetForm = (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        saveBudget()
      }}
    >
      <label className="flex min-w-[14ch] flex-1 flex-col gap-1">
        <Label>{t('safe.budgetLabel')}</Label>
        <input className={`${fieldClass} font-mono`} type="number" inputMode="numeric" min={0} step={100000} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus={editing} />
      </label>
      <Button type="submit" variant="outline">
        {t('cf.saveAccount')}
      </Button>
    </form>
  )

  if (!s)
    return (
      <Card aria-label={t('safe.title')} data-tone="pink" className="flex flex-col gap-3">
        <Label>{t('safe.title')}</Label>
        <p className="text-sm">{t('safe.needBudget')}</p>
        {budgetForm}
      </Card>
    )

  const share = s.perDay > 0 ? Math.max(0, s.leftToday) / s.perDay : 0
  const halves = Math.round(share * HEARTS * 2)
  const hearts = Array.from({ length: HEARTS }, (_, i) => (halves >= (i + 1) * 2 ? 1 : halves === i * 2 + 1 ? 0.5 : 0) as 0 | 0.5 | 1)
  const lastFull = hearts.findLastIndex((h) => h > 0)
  const overMonth = s.pool < 0
  const overToday = s.leftToday < 0

  return (
    <Card aria-label={t('safe.title')} data-tone="pink" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{t('safe.title')}</Label>
        <span className="font-label text-[11px] text-text-muted uppercase">{t('safe.days', { d: s.daysLeft })}</span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-1.5 leading-[0.8]" style={{ color: s.perDay ? COLOR.text : COLOR.down }}>
          <span className="font-display text-2xl">Rp</span>
          <span className="font-display text-[clamp(40px,10vw,60px)]">{compact(s.perDay).replace(/^Rp/, '')}</span>
          <span className="font-label text-xs text-text-muted uppercase">{t('safe.perDay')}</span>
        </div>
        <div role="img" aria-label={t('safe.heartsLabel', { n: Math.round(share * 100) })} className="flex gap-1">
          {hearts.map((h, i) => (
            <Heart key={i} fill={h} beat={i === lastFull && share < 1} />
          ))}
        </div>
      </div>
      <p className="text-sm font-medium" style={{ color: overToday ? COLOR.down : share >= 0.5 ? COLOR.up : COLOR.fireOrange }}>
        {overMonth ? t('safe.overMonth', { amount: money(-s.pool) }) : overToday ? t('safe.overToday', { amount: money(-s.leftToday) }) : t('safe.leftToday', { amount: money(s.leftToday), spent: money(s.spentToday) })}
      </p>
      <p className="text-xs text-text-muted">
        {s.base === 'budget' ? t('safe.fromBudget', { amount: money(budget ?? 0) }) : t('safe.fromIncome')}
        {s.billsLeft > 0 && ` · ${t('safe.billsKept', { amount: compact(s.billsLeft) })}`}
        {' · '}
        <button
          type="button"
          className="underline underline-offset-4"
          onClick={() => {
            setDraft(budget ? String(budget) : '')
            setEditing(!editing)
          }}
        >
          {t(budget ? 'safe.editBudget' : 'safe.setBudget')}
        </button>
      </p>
      {editing && budgetForm}
    </Card>
  )
}
