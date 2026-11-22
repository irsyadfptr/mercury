import { useState } from 'react'
import { useCashflow } from '@/cashflowStore'
import { HoldingDialog } from '@/components/HoldingDialog'
import { Button } from '@/components/ui/button'
import { Card, CardTitle, Field, fieldClass } from '@/components/ui-bits'
import { useI18n } from '@/i18n'
import type { HoldingDialogTarget } from '@/types'
import { useSummary } from '@/useSummary'

/**
 * Invest from an account: top up a holding or start a new one. Opens the holding dialog with "Paid from" set to the
 * account picked here, so the buy moves money out of the account as Investing (not spending).
 */
const SHOWN = 4

export function Invest() {
  const { t, compact } = useI18n()
  // Biggest first; only the first few unless "show all", so the card stays short as the portfolio grows.
  const rows = useSummary()
    .rows.filter((r) => r.v.quantity > 0)
    .sort((a, b) => (Number.isFinite(b.v.valueIdr) ? b.v.valueIdr : 0) - (Number.isFinite(a.v.valueIdr) ? a.v.valueIdr : 0))
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? rows : rows.slice(0, SHOWN)
  const accounts = useCashflow((s) => s.accounts).filter((a) => !a.archived)
  const [account, setAccount] = useState('')
  const [dialog, setDialog] = useState<HoldingDialogTarget>({ mode: 'closed' })
  const from = account || accounts[0]?.id

  return (
    <Card aria-label={t('invest.title')} data-tone="purple">
      <CardTitle icon="chartUp" aside={t('invest.sub')}>
        {t('invest.title')}
      </CardTitle>
      <Field label={t('form.paidFrom')} className="mb-2">
        <select className={fieldClass} value={from} onChange={(e) => setAccount(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      {!rows.length && <p className="text-sm text-text-muted">{t('invest.none')}</p>}
      <ul className="flex flex-col">
        {shown.map((r) => (
          <li key={r.holding.id} className="flex items-center gap-2 border-b border-border py-1.5 text-sm">
            <span className="font-semibold">{r.holding.symbol}</span>
            <span className="font-label text-[11px] text-text-muted uppercase">{t(`pf.${r.holding.group}`)}</span>
            <span aria-hidden="true" className="flex-grow -translate-y-1 border-b-[1.5px] border-dotted border-border" />
            {Number.isFinite(r.v.valueIdr) && <span className="font-mono">{compact(r.v.valueIdr)}</span>}
            <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: 'edit', holdingId: r.holding.id, account: from })}>
              {t('invest.topUp')}
            </Button>
          </li>
        ))}
      </ul>
      {rows.length > SHOWN && (
        <div>
          <button type="button" onClick={() => setShowAll(!showAll)} className="mt-2 font-label text-[11px] uppercase underline underline-offset-4">
            {showAll ? t('invest.showLess') : t('invest.showAll', { n: rows.length })}
          </button>
        </div>
      )}
      <Button variant="outline" size="sm" className="mt-3 font-label text-[11px] uppercase" onClick={() => setDialog({ mode: 'create', account: from })}>
        {t('invest.new')}
      </Button>
      <HoldingDialog target={dialog} onClose={() => setDialog({ mode: 'closed' })} />
    </Card>
  )
}
