import { useState } from 'react'
import { useCashflow } from '@/cashflowStore'
import { PixelIcon } from '@/components/PixelIcon'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardTitle, Field, fieldClass, Label, Segments } from '@/components/ui-bits'
import { accountBalances } from '@/domain/accounts'
import { ALL_CASH_BADGES, cashBadges, goalProgress, loggingStreak, monthScore, noSpendDays } from '@/domain/cashGame'
import { localDate, monthOf } from '@/domain/cashflow'
import { useI18n } from '@/i18n'
import { useSettings } from '@/settings'
import type { CashEntry, Goal, Key } from '@/types'
import { useNow } from '@/useNow'
import { xpBar } from '@/view/bars'
import { COLOR } from '@/view/tokens'

/** This month's score (four visible parts), the logging streak, no-spend days and badges. */
export function MonthQuest({ entries }: { entries: readonly CashEntry[] }) {
  const { t, num } = useI18n()
  const accounts = useCashflow((s) => s.accounts)
  const goals = useCashflow((s) => s.goals)
  const budget = useSettings((s) => s.monthlyBudget)
  const today = localDate(useNow())
  const month = monthOf(today)
  const score = monthScore(entries, accounts, month, today, budget)
  const streak = loggingStreak(entries, today)
  const earned = new Set(cashBadges(entries, accounts, goals, today, budget))
  const parts = [
    { key: 'budget', value: score.budget, hint: budget ? undefined : t('game.noBudget') },
    { key: 'savings', value: score.savings },
    { key: 'logging', value: score.logging },
    { key: 'matched', value: score.matched },
  ] as const

  return (
    <Card aria-label={t('game.title')} data-tone="gold" className="flex flex-col gap-3">
      <CardTitle icon="star" aside={t('game.sub')}>
        {t('game.title')}
      </CardTitle>
      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-0 flex-[2_1_260px] flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[56px] leading-none">{num(score.total)}</span>
            <span className="font-display text-2xl text-text-muted">/ 100</span>
          </div>
          <Segments items={xpBar(score.total / 100)} height={12} label={`${score.total} / 100`} />
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
            {parts.map((p) => (
              <li key={p.key} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-text-muted">{t(`game.${p.key}` as Key)}</span>
                <span className="font-mono">{'hint' in p && p.hint ? <span className="text-xs text-text-muted">{p.hint}</span> : `${p.value}/25`}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid flex-[1_1_200px] grid-cols-2 gap-2 self-start">
          <div className="flex flex-col gap-0.5 rounded-lg bg-surface-2 px-3 py-2.5">
            <Label>{t('game.streak')}</Label>
            <span className="flex items-center gap-1.5 font-display text-[30px] leading-none" style={{ color: streak ? COLOR.fireOrange : COLOR.muted }}>
              <PixelIcon name="flame" size={18} />
              {num(streak)}
            </span>
            <span className="text-[11px] text-text-muted">{t('game.days')}</span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg bg-surface-2 px-3 py-2.5">
            <Label>{t('game.noSpend')}</Label>
            <span className="font-display text-[30px] leading-none">{num(noSpendDays(entries, month, today))}</span>
            <span className="text-[11px] text-text-muted">{t('game.thisMonth')}</span>
          </div>
        </div>
      </div>
      <ul aria-label={t('game.badges')} className="flex flex-wrap gap-1.5">
        {ALL_CASH_BADGES.map((b) => (
          <li key={b} title={t(`badge.${b}.how` as Key)} className={earned.has(b) ? '' : 'opacity-40 grayscale'}>
            <Badge tone={earned.has(b) ? 'paper' : 'neutral'}>
              {earned.has(b) ? '★ ' : '☆ '}
              {t(`badge.${b}` as Key)}
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  )
}

interface GoalDraft {
  id?: string
  name: string
  target: string
  account: string
}

/** Savings goals: progress = the chosen account's balance against the target. */
export function Goals({ entries }: { entries: readonly CashEntry[] }) {
  const { t, money, num } = useI18n()
  const goals = useCashflow((s) => s.goals)
  const accounts = useCashflow((s) => s.accounts)
  const saveGoal = useCashflow((s) => s.saveGoal)
  const [draft, setDraft] = useState<GoalDraft>()
  const [error, setError] = useState(false)
  const balances = accountBalances(accounts, entries)
  const active = accounts.filter((a) => !a.archived)
  const shown = goals.filter((g) => !g.archived)

  function open(g?: Goal) {
    setError(false)
    setDraft(g ? { id: g.id, name: g.name, target: String(g.target), account: g.account } : { name: '', target: '', account: active[0]?.id ?? '' })
  }

  function submit() {
    if (!draft) return
    const target = Math.round(Number(draft.target))
    if (!draft.name.trim() || !(target > 0) || !draft.account) return setError(true)
    saveGoal({ id: draft.id, name: draft.name.trim(), target, account: draft.account })
    setDraft(undefined)
  }

  const form = draft && (
    <form
      className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Field label={t('goal.name')} error={error ? t('goal.err') : undefined} className="min-w-[12ch] flex-[2_1_0]">
          <input className={fieldClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={40} autoFocus />
        </Field>
        <Field label={t('goal.target')} className="min-w-[12ch] flex-[1_1_0]">
          <input className={`${fieldClass} font-mono`} type="number" inputMode="numeric" min={0} step={1000} value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
        </Field>
      </div>
      <Field label={t('goal.account')} hint={t('goal.accountHint')}>
        <select className={fieldClass} value={draft.account} onChange={(e) => setDraft({ ...draft, account: e.target.value })}>
          {active.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex gap-1.5">
        <Button type="submit" variant="outline">
          {t('cf.saveAccount')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setDraft(undefined)}>
          {t('add.cancel')}
        </Button>
      </div>
    </form>
  )

  return (
    <Card aria-label={t('goal.title')} data-tone="pink">
      <CardTitle icon="gift">{t('goal.title')}</CardTitle>
      {!shown.length && !draft && <p className="text-sm text-text-muted">{t('goal.none')}</p>}
      <ul className="flex flex-col gap-3">
        {shown.map((g) => {
          if (draft?.id === g.id) return <li key={g.id}>{form}</li>
          const p = goalProgress(g, balances)
          return (
            <li key={g.id} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  {p >= 1 && <span aria-hidden="true">★</span>}
                  {g.name}
                  <span className="font-label text-[11px] text-text-muted uppercase">{accounts.find((a) => a.id === g.account)?.name}</span>
                </span>
                <span className="font-mono">
                  {money(Math.max(0, balances[g.account] ?? 0))} <span className="text-text-muted">/ {money(g.target)} · {num(p * 100, 0)}%</span>
                </span>
              </div>
              <Segments items={xpBar(p)} height={10} label={`${g.name}: ${num(p * 100, 0)}%`} />
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => open(g)}>
                  {t('cf.editAccount')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => confirm(t('goal.deleteConfirm', { s: g.name })) && saveGoal({ ...g, archived: true })}>
                  {t('cf.deleteBill')}
                </Button>
              </span>
            </li>
          )
        })}
      </ul>
      <div className="pt-3">
        {draft && !draft.id ? (
          form
        ) : (
          <Button variant="outline" size="sm" onClick={() => open()} disabled={!active.length} className="font-label text-[11px] uppercase">
            {t('goal.add')}
          </Button>
        )}
      </div>
    </Card>
  )
}
