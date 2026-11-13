import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  CLASS_DEFAULTS,
  entersLots,
  formToFirstBuy,
  formToHolding,
  holdingToForm,
  inputFromUnits,
  parseTransaction,
  validateHoldingForm,
} from '@/domain/holdingForm'
import { ASSET_CLASSES } from '@/domain/schema'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'
import type {
  AssetClass,
  Currency,
  FormError,
  Group,
  HoldingDialogProps,
  HoldingFormErrors,
  HoldingFormProps,
  HoldingFormValues,
  Key,
  Transaction,
  TransactionFormValues,
  TransactionsProps,
  TransactionType,
} from '@/types'
import { Field, Label, fieldClass } from './ui-bits'

const ERROR_KEY: Record<FormError, Key> = { required: 'form.required', positive: 'form.positive', oversell: 'tx.oversell' }
const PLATFORMS = ['Stockbit', 'Bibit', 'Binance'] as const
const todayIso = () => new Date().toISOString().slice(0, 10)

/** Native <dialog>: escapes overflow containers and traps focus. */
export function HoldingDialog({ target, onClose }: HoldingDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const open = target.mode !== 'closed'
  useEffect(() => {
    if (open) ref.current?.showModal()
    else ref.current?.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      // Close through parent state (not the native close event) so the form always unmounts and resets.
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="m-auto w-[min(640px,calc(100vw-32px))] rounded-[10px] border border-border bg-surface p-0 text-text backdrop:bg-black/50"
    >
      {target.mode !== 'closed' && <HoldingForm key={target.mode === 'edit' ? target.holdingId : 'new'} holdingId={target.mode === 'edit' ? target.holdingId : undefined} onDone={onClose} />}
    </dialog>
  )
}

function HoldingForm({ holdingId, onDone }: HoldingFormProps) {
  const { t } = useI18n()
  const { holdings, transactions, addHolding, updateHolding, removeHolding, addTransaction } = useStore()
  const existing = holdingId ? holdings.find((h) => h.id === holdingId) : undefined
  const isNew = !existing

  const [today] = useState(todayIso)
  const [values, setValues] = useState<HoldingFormValues>(() => holdingToForm(existing, today))
  const [errors, setErrors] = useState<HoldingFormErrors>({})
  const set = <K extends keyof HoldingFormValues>(key: K, value: HoldingFormValues[K]) => setValues((v) => ({ ...v, [key]: value }))
  const errorText = (key: keyof HoldingFormValues) => (errors[key] ? t(ERROR_KEY[errors[key]]) : undefined)

  function changeClass(assetClass: AssetClass) {
    // Only a new holding gets the class defaults; editing keeps what the user set.
    setValues((v) => ({ ...v, assetClass, ...(isNew ? CLASS_DEFAULTS[assetClass] : {}) }))
  }

  function save(e: FormEvent) {
    e.preventDefault()
    const found = validateHoldingForm(values, isNew)
    setErrors(found)
    if (Object.keys(found).length) return
    const fields = formToHolding(values, existing, new Date().toISOString())
    if (existing) updateHolding(existing.id, fields)
    else addTransaction(formToFirstBuy(values, addHolding(fields)))
    onDone()
  }

  function remove() {
    if (existing && confirm(t('form.deleteConfirm', { s: existing.symbol }))) {
      removeHolding(existing.id)
      onDone()
    }
  }

  const numberInput = (key: 'stop' | 'target' | 'price' | 'qty' | 'buyPrice' | 'fee') => (
    <input className={fieldClass} type="number" step="any" min="0" value={values[key]} onChange={(e) => set(key, e.target.value)} aria-invalid={!!errors[key]} />
  )

  return (
    <form onSubmit={save} noValidate className="flex max-h-[85vh] flex-col">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-display text-3xl leading-none uppercase">{existing ? t('form.editHolding', { s: existing.symbol }) : t('form.newHolding')}</h2>
      </div>

      <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('form.assetClass')}>
            <select className={fieldClass} value={values.assetClass} onChange={(e) => changeClass(e.target.value as AssetClass)}>
              {ASSET_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {t(`class.${c}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('form.group')}>
            <select className={fieldClass} value={values.group} onChange={(e) => set('group', e.target.value as Group)}>
              <option value="investing">{t('pf.investing')}</option>
              <option value="trading">{t('pf.trading')}</option>
            </select>
          </Field>
          <Field label={t('form.symbol')} error={errorText('symbol')}>
            <input className={fieldClass} value={values.symbol} onChange={(e) => set('symbol', e.target.value)} aria-invalid={!!errors.symbol} autoFocus />
          </Field>
          <Field label={t('form.name')}>
            <input className={fieldClass} value={values.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label={t('form.platform')}>
            <input className={fieldClass} value={values.platform} onChange={(e) => set('platform', e.target.value)} placeholder={PLATFORMS.join(', ')} list="platforms" />
            <datalist id="platforms">
              {PLATFORMS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <Field label={t('form.currency')}>
            <select className={fieldClass} value={values.currency} onChange={(e) => set('currency', e.target.value as Currency)}>
              <option value="IDR">IDR</option>
              <option value="USD">USD</option>
            </select>
          </Field>
        </div>

        {values.group === 'trading' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('form.stop')} error={errorText('stop')}>
              {numberInput('stop')}
            </Field>
            <Field label={t('form.target')} error={errorText('target')}>
              {numberInput('target')}
            </Field>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={values.paper} onChange={(e) => set('paper', e.target.checked)} className="size-4 accent-[var(--accent)]" />
              {t('form.paper')}
            </label>
          </div>
        )}

        <Field label={t('form.price')} hint={t('form.priceHint')} error={errorText('price')}>
          {numberInput('price')}
        </Field>

        {isNew && (
          <fieldset className="grid grid-cols-2 gap-3 rounded-lg bg-surface-2 p-3">
            <legend className="sr-only">{t('form.firstBuy')}</legend>
            <Label className="col-span-2">{t('form.firstBuy')}</Label>
            <Field label={entersLots(values.assetClass) ? t('form.lots') : t('form.qty')} error={errorText('qty')}>
              {numberInput('qty')}
            </Field>
            <Field label={t('form.txPrice')} error={errorText('buyPrice')}>
              {numberInput('buyPrice')}
            </Field>
            <Field label={t('form.fee')} error={errorText('fee')}>
              {numberInput('fee')}
            </Field>
            <Field label={t('form.date')}>
              <input className={fieldClass} type="date" value={values.date} max={today} onChange={(e) => set('date', e.target.value)} />
            </Field>
          </fieldset>
        )}

        {existing && <Transactions holding={existing} txns={transactions.filter((x) => x.holdingId === existing.id)} />}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
        {existing ? (
          <Button type="button" variant="ghost" className="text-down hover:text-down" onClick={remove}>
            {t('form.delete')}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            {t('form.cancel')}
          </Button>
          <Button type="submit">{t('form.save')}</Button>
        </div>
      </div>
    </form>
  )
}

const emptyRow = (today: string): TransactionFormValues => ({ type: 'sell', qty: '', price: '', fee: '', date: today })

function Transactions({ holding, txns }: TransactionsProps) {
  const { t, money, num, qty } = useI18n()
  const { addTransaction, removeTransaction } = useStore()
  const [today] = useState(todayIso)
  const [row, setRow] = useState<TransactionFormValues>(() => emptyRow(today))
  const [error, setError] = useState<FormError>()
  const lots = entersLots(holding.assetClass)
  const newestFirst = [...txns].sort((a, b) => b.date.localeCompare(a.date))
  const setField = <K extends keyof TransactionFormValues>(key: K, value: TransactionFormValues[K]) => setRow((r) => ({ ...r, [key]: value }))

  function add() {
    const result = parseTransaction(row, holding, txns)
    if (!result.ok) return setError(result.error)
    addTransaction(result.tx)
    setRow((r) => ({ ...emptyRow(today), type: r.type, date: r.date }))
    setError(undefined)
  }

  const amount = (x: Transaction) => {
    const n = inputFromUnits(x.quantity, holding.assetClass)
    return lots ? `${num(n)} lot` : qty(n)
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{t('tx.title')}</Label>
      <ul className="flex flex-col">
        {newestFirst.map((x) => (
          <li key={x.id} className="flex items-center gap-3 border-b border-border py-1.5 text-sm">
            <span className={`w-10 font-label text-[11px] uppercase ${x.type === 'buy' ? 'text-up' : 'text-down'}`}>{t(x.type === 'buy' ? 'tx.buy' : 'tx.sell')}</span>
            <span className="text-text-muted">{x.date.slice(0, 10)}</span>
            <span className="ml-auto font-mono">
              {amount(x)} × {money(x.price)}
            </span>
            <button
              type="button"
              aria-label={t('tx.remove')}
              onClick={() => removeTransaction(x.id)}
              className="rounded px-1.5 text-text-muted hover:text-down focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-2 p-3 sm:grid-cols-[auto_1fr_1fr_1fr_auto]">
        <select className={fieldClass} value={row.type} onChange={(e) => setField('type', e.target.value as TransactionType)} aria-label={t('tx.title')}>
          <option value="buy">{t('tx.buy')}</option>
          <option value="sell">{t('tx.sell')}</option>
        </select>
        <input className={fieldClass} type="number" step="any" min="0" placeholder={lots ? 'Lot' : t('form.qty')} aria-label={lots ? t('form.lots') : t('form.qty')} value={row.qty} onChange={(e) => setField('qty', e.target.value)} />
        <input className={fieldClass} type="number" step="any" min="0" placeholder={t('form.txPrice')} aria-label={t('form.txPrice')} value={row.price} onChange={(e) => setField('price', e.target.value)} />
        <input className={fieldClass} type="date" value={row.date} max={today} aria-label={t('form.date')} onChange={(e) => setField('date', e.target.value)} />
        <Button type="button" variant="outline" onClick={add}>
          {t('tx.add')}
        </Button>
        <input className={`${fieldClass} col-span-2 sm:col-span-1`} type="number" step="any" min="0" placeholder={t('form.fee')} aria-label={t('form.fee')} value={row.fee} onChange={(e) => setField('fee', e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-down">
          {t(ERROR_KEY[error])}
        </p>
      )}
    </div>
  )
}
