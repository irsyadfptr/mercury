import { useCashflow } from '@/cashflowStore'
import { PixelIcon } from '@/components/PixelIcon'
import { Card, Label } from '@/components/ui-bits'
import { accountBalances, accountsTotal } from '@/domain/accounts'
import { billsDue, dueTag } from '@/domain/bills'
import { useI18n } from '@/i18n'
import { href } from '@/routes'
import { useCountUp } from '@/useCountUp'
import { COLOR } from '@/view/tokens'
import type { MoneyNowProps } from './Cashflow.types'

/** Bills show on the money card a week ahead (the Dashboard quest waits until 3 days). */
const UPCOMING_DAYS = 7

/** What the active accounts hold right now (all time, any month). Tapping an account shows its entries. */
export function MoneyNow({ entries, today, sync, onPick }: MoneyNowProps) {
  const { t, money, amount, compact } = useI18n()
  const accounts = useCashflow((s) => s.accounts)
  // A week ahead here (the Dashboard quest waits until 3 days), so the money card shows what's coming out soon.
  const due = billsDue(useCashflow((s) => s.bills), today, UPCOMING_DAYS).slice(0, 3)
  const balances = accountBalances(accounts, entries)
  const total = accountsTotal(accounts, entries)
  const shownTotal = useCountUp(total)
  const active = accounts.filter((a) => !a.archived)

  return (
    <Card aria-label={t('cf.moneyNow')} data-tone="gold" className="flex flex-col gap-3">
      <span className="flex items-center gap-2">
        <PixelIcon name="coin" size={18} className="coin-spin" />
        <Label>{t('cf.moneyNow')}</Label>
      </span>
      <div className="flex items-baseline gap-1.5 leading-[0.8]" style={{ color: total < 0 ? COLOR.down : COLOR.text }}>
        <span className="font-display text-3xl">{total < 0 ? '−' : ''}Rp</span>
        <span className="font-display text-[clamp(48px,12vw,76px)]">{amount(Math.abs(shownTotal))}</span>
      </div>
      {active.length > 1 && (
        <ul aria-label={t('cf.accounts')} className="flex flex-wrap gap-1.5">
          {active.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => (onPick ? onPick(a.id) : (location.hash = href('cashflow')))}
                title={`${a.name}: ${money(balances[a.id])} · ${t('cf.showEntries')}`}
                className="flex items-baseline gap-1.5 rounded-md bg-surface-2 px-2.5 py-1 text-xs hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="font-label text-[11px] text-text-muted uppercase">{a.name}</span>
                <span className="font-mono" style={{ color: balances[a.id] < 0 ? COLOR.down : undefined }}>
                  {balances[a.id] < 0 ? '−' : ''}
                  {compact(Math.abs(balances[a.id]))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {due.length > 0 && (
        <ul aria-label={t('cf.bills')} className="flex flex-col gap-1">
          {due.map(({ bill, days }) => (
            <li key={bill.id}>
              <button
                type="button"
                onClick={() => {
                  const card = document.getElementById('cf-bills')
                  if (card) card.scrollIntoView({ behavior: 'smooth' })
                  else location.hash = href('cashflow')
                }}
                className="flex w-full items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-left text-sm hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <PixelIcon name={bill.income ? 'coin' : 'receipt'} size={14} className="shrink-0" />
                <span className="truncate">{bill.name}</span>
                {bill.amount && <span className="font-mono text-text-muted">{compact(bill.amount)}</span>}
                <span className="ml-auto shrink-0 font-label text-[11px] uppercase" style={{ color: days < 0 ? COLOR.down : days <= 1 ? COLOR.fireOrange : COLOR.muted }}>
                  {dueTag(days, t)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {sync}
    </Card>
  )
}
