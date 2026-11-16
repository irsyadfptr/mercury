import { useState } from 'react'
import { useCashflow } from '@/cashflowStore'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardTitle, Field, fieldClass } from '@/components/ui-bits'
import { billsDue, dueTag, payBill } from '@/domain/bills'
import { localDate } from '@/domain/cashflow'
import { DEFAULT_ACCOUNT_ID, MAX_BILL_NAME } from '@/domain/schema'
import { useI18n } from '@/i18n'
import type { Bill } from '@/types'
import { useNow } from '@/useNow'
import { COLOR } from '@/view/tokens'

interface Draft {
  id?: string
  name: string
  amount: string
  dueDate: string
  monthly: boolean
  income: boolean
  account: string
}

/**
 * Bills and expected income (e.g. salary), entered by hand. Due bills and late income show as Dashboard quests;
 * Pay / Received logs the entry and moves a monthly one on.
 */
export function Bills() {
  const { t, money, day } = useI18n()
  const bills = useCashflow((s) => s.bills)
  const accounts = useCashflow((s) => s.accounts)
  const saveBill = useCashflow((s) => s.saveBill)
  const addEntry = useCashflow((s) => s.addEntry)
  const today = localDate(useNow())
  const [draft, setDraft] = useState<Draft>()
  const [error, setError] = useState(false)

  const active = bills.filter((b) => !b.archived).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const due = new Map(billsDue(bills, today).map((d) => [d.bill.id, d.days]))
  const activeAccounts = accounts.filter((a) => !a.archived)
  const update = (patch: Partial<Draft>) => setDraft((d) => d && { ...d, ...patch })

  function open(b?: Bill) {
    setError(false)
    setDraft(
      b
        ? { id: b.id, name: b.name, amount: b.amount ? String(b.amount) : '', dueDate: b.dueDate, monthly: b.monthly, income: b.income, account: b.account ?? DEFAULT_ACCOUNT_ID }
        : { name: '', amount: '', dueDate: today, monthly: true, income: false, account: activeAccounts[0]?.id ?? DEFAULT_ACCOUNT_ID },
    )
  }

  function submit() {
    if (!draft) return
    const name = draft.name.trim()
    const amount = Math.round(Number(draft.amount))
    if (!name || !draft.dueDate) return setError(true)
    saveBill({ id: draft.id, name, amount: amount > 0 ? amount : undefined, dueDate: draft.dueDate, monthly: draft.monthly, income: draft.income, account: draft.account })
    setDraft(undefined)
  }

  function pay(b: Bill) {
    const r = payBill(b, today)
    if (r.expense) addEntry(r.expense)
    saveBill(r.bill)
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
        <Field label={t('cf.billName')} error={error ? t('cf.billErr') : undefined} className="min-w-[12ch] flex-[2_1_0]">
          <input
            className={fieldClass}
            value={draft.name}
            onChange={(e) => {
              update({ name: e.target.value })
              setError(false)
            }}
            maxLength={MAX_BILL_NAME}
            aria-invalid={error}
            autoFocus
          />
        </Field>
        <Field label={t('cf.billAmount')} hint={t(draft.income ? 'cf.incomeAmountHint' : 'cf.billAmountHint')} className="min-w-[12ch] flex-[1_1_0]">
          <input className={`${fieldClass} font-mono`} type="number" inputMode="numeric" min={0} step={1} value={draft.amount} onChange={(e) => update({ amount: e.target.value })} />
        </Field>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t('cf.billDue')} className="min-w-[14ch] flex-1">
          <input className={`${fieldClass} font-mono`} type="date" value={draft.dueDate} onChange={(e) => update({ dueDate: e.target.value })} />
        </Field>
        <Field label={t(draft.income ? 'cf.incomeAccount' : 'cf.billAccount')} className="min-w-[12ch] flex-1">
          <select className={fieldClass} value={draft.account} onChange={(e) => update({ account: e.target.value })}>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.monthly} onChange={(e) => update({ monthly: e.target.checked })} className="size-4 accent-[var(--accent)]" />
          {t('cf.billMonthly')}
        </label>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.income} onChange={(e) => update({ income: e.target.checked })} className="size-4 accent-[var(--accent)]" />
          {t('cf.billIncome')}
        </label>
      </div>
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
    <Card aria-label={t('cf.bills')}>
      <CardTitle icon="receipt">{t('cf.bills')}</CardTitle>
      {!active.length && !draft && <p className="text-sm text-text-muted">{t('cf.noBills')}</p>}
      <ul className="flex flex-col">
        {active.map((b) =>
          draft?.id === b.id ? (
            <li key={b.id}>{form}</li>
          ) : (
            <li key={b.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border py-1.5">
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{b.name}</span>
                <span className="font-label text-[11px] text-text-muted uppercase">
                  {day(b.dueDate)}
                  {b.monthly ? ` · ${t('cf.billMonthly')}` : ''}
                  {b.income ? ` · ${t('cf.billIncome')}` : ''}
                </span>
              </span>
              {due.has(b.id) && <Badge tone={due.get(b.id)! <= 0 ? 'warn' : 'neutral'}>{dueTag(due.get(b.id)!, t)}</Badge>}
              <span aria-hidden="true" className="flex-grow -translate-y-1 border-b-[1.5px] border-dotted border-border" />
              {b.amount && (
                <span className="font-mono font-medium" style={{ color: b.income ? COLOR.up : undefined }}>
                  {b.income ? '+' : ''}
                  {money(b.amount)}
                </span>
              )}
              <span className="flex">
                <Button size="sm" variant="outline" onClick={() => pay(b)}>
                  {t(b.income ? 'cf.received' : 'cf.pay')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => open(b)}>
                  {t('cf.editAccount')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => confirm(t('cf.deleteBillConfirm', { s: b.name })) && saveBill({ ...b, archived: true })}>
                  {t('cf.deleteBill')}
                </Button>
              </span>
            </li>
          ),
        )}
      </ul>
      <div className="pt-3">
        {draft && !draft.id ? (
          form
        ) : (
          <Button variant="outline" size="sm" onClick={() => open()} className="font-label text-[11px] uppercase">
            {t('cf.addBill')}
          </Button>
        )}
      </div>
    </Card>
  )
}
