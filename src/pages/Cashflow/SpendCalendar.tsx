import { useState } from 'react'
import { Card, CardTitle, Label } from '@/components/ui-bits'
import { addDays, dailySpend, daysInMonth, isCashflow } from '@/domain/cashflow'
import { TRANSFER } from '@/domain/schema'
import { useI18n } from '@/i18n'
import type { CashEntry } from '@/types'
import { spendLevel } from '@/view/bars'
import { COLOR } from '@/view/tokens'

/** How much of the accent each shade mixes in: 0 = no spending, 4 = the month's biggest quarter of days. */
const SHADE = [0, 28, 52, 76, 100]
const shade = (level: number) => (level ? `color-mix(in oklch, var(--accent) ${SHADE[level]}%, var(--empty))` : 'var(--surface-2)')
/** A Monday, to name the weekday columns in the reader's language. */
const A_MONDAY = '2026-01-05'

/**
 * The month as a calendar, Monday first: each day shaded by what was spent (by rank among the month's spending days),
 * ★ on days with nothing spent, today in a dashed outline, future days left blank. Tapping a day lists its entries.
 */
export function SpendCalendar({ entries, month, today }: { entries: readonly CashEntry[]; month: string; today: string }) {
  const { t, money, day, category, lang } = useI18n()
  const [picked, setPicked] = useState<string>()
  const spend = dailySpend(entries, month)
  const level = spendLevel(Object.values(spend))
  const total = daysInMonth(month)
  const first = `${month}-01`
  const offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7
  const dates = Array.from({ length: total }, (_, i) => addDays(first, i))
  const past = dates.filter((d) => d <= today)
  const noSpend = past.filter((d) => !spend[d]).length
  const locale = lang === 'id' ? 'id-ID' : 'en-US'
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(`${addDays(A_MONDAY, i)}T00:00:00Z`).toLocaleDateString(locale, { weekday: 'narrow', timeZone: 'UTC' }))
  const shown = picked && dates.includes(picked) ? picked : undefined
  const dayEntries = shown ? entries.filter((e) => e.date === shown && e.type !== TRANSFER) : []

  return (
    <Card aria-label={t('cal.title')} data-tone="teal">
      <CardTitle icon="calendar" aside={t('cal.noSpend', { n: noSpend })}>
        {t('cal.title')}
      </CardTitle>
      <div className="grid grid-cols-7 gap-1">
        {weekdays.map((w, i) => (
          <span key={i} aria-hidden="true" className="text-center font-label text-[10px] text-text-muted uppercase">
            {w}
          </span>
        ))}
        {offset > 0 && <span style={{ gridColumn: `span ${offset}` }} />}
        {dates.map((d) => {
          const future = d > today
          const amount = spend[d] ?? 0
          const l = level(amount)
          return (
            <button
              key={d}
              type="button"
              disabled={future}
              onClick={() => setPicked(shown === d ? undefined : d)}
              aria-pressed={shown === d}
              aria-label={`${day(d)}: ${future ? '' : amount ? money(amount) : t('cal.nothing')}`}
              title={future ? undefined : `${day(d)} · ${amount ? money(amount) : t('cal.nothing')}`}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-[4px] font-label text-[10px] leading-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                future ? 'border border-dashed border-border text-text-muted/50' : ''
              } ${d === today ? 'outline-2 outline-offset-1 outline-text outline-dashed' : ''} ${shown === d ? 'z-10 scale-110 shadow-[0_3px_0_var(--text)]' : ''}`}
              style={future ? undefined : { background: shade(l), color: l >= 3 ? 'var(--accent-fg)' : COLOR.text }}
            >
              <span>{Number(d.slice(8))}</span>
              {!future && !amount && (
                <span aria-hidden="true" className="text-[11px]" style={{ color: COLOR.fireOrange }}>
                  ★
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1" aria-hidden="true">
          <Label>{t('cal.less')}</Label>
          {[1, 2, 3, 4].map((l) => (
            <span key={l} className="size-3 rounded-[2px]" style={{ background: shade(l) }} />
          ))}
          <Label>{t('cal.more')}</Label>
        </span>
        <Label>
          <span style={{ color: COLOR.fireOrange }}>★</span> {t('cal.star')}
        </Label>
      </div>
      {shown && (
        <div className="mt-3 rounded-lg bg-surface-2 p-3">
          <div className="flex justify-between font-label text-[11px] uppercase">
            <span>{day(shown)}</span>
            <span>{spend[shown] ? `−${money(spend[shown])}` : t('cal.nothing')}</span>
          </div>
          <ul className="mt-1.5 flex flex-col gap-1 text-sm">
            {dayEntries.map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span className="truncate">{e.note || category(e.category)}</span>
                <span className="shrink-0 font-mono" style={{ color: e.type === 'income' ? COLOR.up : isCashflow(e) ? COLOR.text : COLOR.muted }}>
                  {e.type === 'income' ? '+' : '−'}
                  {money(e.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
