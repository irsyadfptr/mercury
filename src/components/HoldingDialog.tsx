import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useCashflow } from '@/cashflowStore'
import { Button } from '@/components/ui/button'
import {
  cashOf,
  formByAmount,
  CLASS_DEFAULTS,
  entersLots,
  formToFirstBuy,
  formToHolding,
  holdingToForm,
  inputFromUnits,
  parseOptional,
  parseTransaction,
  sellAllRow,
  unitsFromInput,
  validateHoldingForm,
} from '@/domain/holdingForm'
import { position } from '@/domain/positions'
import { useGate } from '@/useGate'
import { GatePanel } from './GatePanel'
import { gateNote } from './gateText'
import { ASSET_CLASSES, EXIT_REASONS, INVEST, SETUPS } from '@/domain/schema'
import { useI18n } from '@/i18n'
import { useStore } from '@/store'
import type {
  AssetClass,
  Currency,
  ExitReason,
  FormError,
  Group,
  Holding,
  HoldingDialogProps,
  HoldingFormErrors,
  HoldingFormProps,
  HoldingFormValues,
  Key,
  Setup,
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
      {target.mode !== 'closed' && (
        <HoldingForm key={target.mode === 'edit' ? target.holdingId : 'new'} holdingId={target.mode === 'edit' ? target.holdingId : undefined} account={target.account} onDone={onClose} />
      )}
    </dialog>
  )
}

function HoldingForm({ holdingId, onDone, account: initialAccount }: HoldingFormProps) {
  const f = useI18n()
  const { t } = f
  const { holdings, transactions, addHolding, updateHolding, removeHolding, addTransaction } = useStore()
  const addEntry = useCashflow((s) => s.addEntry)
  const existing = holdingId ? holdings.find((h) => h.id === holdingId) : undefined
  const isNew = !existing
  const own = existing ? transactions.filter((x) => x.holdingId === existing.id) : []

  const [today] = useState(todayIso)
  const [values, setValues] = useState<HoldingFormValues>(() => holdingToForm(existing, today, own))
  const [account, setAccount] = useState(initialAccount ?? '')
  const amountMode = formByAmount(existing, values.assetClass)
  const [errors, setErrors] = useState<HoldingFormErrors>({})
  const set = <K extends keyof HoldingFormValues>(key: K, value: HoldingFormValues[K]) => setValues((v) => ({ ...v, [key]: value }))
  const errorText = (key: keyof HoldingFormValues) => (errors[key] ? t(ERROR_KEY[errors[key]]) : undefined)

  function changeClass(assetClass: AssetClass) {
    // Only a new holding gets the class defaults; editing keeps what the user set.
    setValues((v) => ({ ...v, assetClass, ...(isNew ? CLASS_DEFAULTS[assetClass] : {}) }))
  }

  // Pre-trade gate for a new trade (trading group): every check visible; anything but GO needs an explicit tick.
  const runGate = useGate()
  const addJournal = useStore((s) => s.addJournal)
  const [gateAck, setGateAck] = useState(false)
  const gate =
    isNew && values.group === 'trading'
      ? runGate({
          paper: values.paper,
          assetClass: values.assetClass,
          currency: values.currency,
          planWritten: !!values.thesis.trim(),
          entry: parseOptional(values.buyPrice),
          stop: parseOptional(values.stop),
          units: unitsFromInput(Number(values.qty) || 0, values.assetClass),
        })
      : undefined
  const gateBlocks = !!gate && gate.decision !== 'go' && !gateAck

  function save(e: FormEvent) {
    e.preventDefault()
    const found = validateHoldingForm(values, isNew)
    setErrors(found)
    if (Object.keys(found).length || gateBlocks) return
    const fields = { ...formToHolding(values, existing, new Date().toISOString(), own), ...(gate ? { gate: gate.decision } : {}) }
    if (existing) updateHolding(existing.id, fields)
    else {
      const id = addHolding(fields)
      if (gate) addJournal({ date: values.date, tag: 'entry', text: gateNote(gate, f), holdingId: id })
      const tx = formToFirstBuy(values, id)
      // Paid from an account: that money leaves the account (category Investing, never counted as spending).
      const entryId = account
        ? addEntry({ type: 'expense', amount: cashOf(tx), category: INVEST, date: values.date, note: t('tx.note.buy', { s: fields.symbol }), account })
        : undefined
      addTransaction({ ...tx, entryId })
    }
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

        {values.group === 'trading' && (
          <fieldset className="grid grid-cols-2 gap-3 rounded-lg bg-surface-2 p-3">
            <legend className="sr-only">{t('tm.title')}</legend>
            <Label className="col-span-2">{t('tm.title')}</Label>
            <Field label={t('tm.setup')}>
              <select className={fieldClass} value={values.setup} onChange={(e) => set('setup', e.target.value as Setup | '')}>
                <option value="">{t('tm.setup.none')}</option>
                {SETUPS.map((s) => (
                  <option key={s} value={s}>
                    {t(`tm.setup.${s}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('tm.reviewBy')} hint={t('tm.reviewByHint')}>
              <input className={fieldClass} type="date" value={values.reviewBy} onChange={(e) => set('reviewBy', e.target.value)} />
            </Field>
            <Field label={t('tm.thesis')} hint={t('tm.thesisHint')} className="col-span-2">
              <textarea className={`${fieldClass} h-auto min-h-16 py-1.5`} value={values.thesis} onChange={(e) => set('thesis', e.target.value)} maxLength={500} />
            </Field>
            <Field label={t('tm.invalidation')} hint={t('tm.invalidationHint')} className="col-span-2">
              <input className={fieldClass} value={values.invalidation} onChange={(e) => set('invalidation', e.target.value)} maxLength={200} />
            </Field>
            {existing && own.some((x) => x.type === 'sell') && (
              <Field label={t('tm.exitReason')} hint={t('tm.exitReasonHint')}>
                <select className={fieldClass} value={values.exitReason} onChange={(e) => set('exitReason', e.target.value as ExitReason | '')}>
                  <option value="">{t('tm.setup.none')}</option>
                  {EXIT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {t(`tm.exit.${r}`)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {existing?.initialStop !== undefined && <p className="col-span-2 text-xs text-text-muted">{t('tm.initialStop', { p: String(existing.initialStop) })}</p>}
          </fieldset>
        )}

        <Field label={t(amountMode ? 'form.currentValue' : 'form.price')} hint={t(amountMode ? 'form.currentValueHint' : 'form.priceHint')} error={errorText('price')}>
          {numberInput('price')}
        </Field>

        {isNew && (
          <fieldset className="grid grid-cols-2 gap-3 rounded-lg bg-surface-2 p-3">
            <legend className="sr-only">{t('form.firstBuy')}</legend>
            <Label className="col-span-2">{t('form.firstBuy')}</Label>
            {!amountMode && (
              <Field label={entersLots(values.assetClass) ? t('form.lots') : t('form.qty')} error={errorText('qty')}>
                {numberInput('qty')}
              </Field>
            )}
            <Field label={t(amountMode ? 'form.amountInvested' : 'form.txPrice')} error={errorText('buyPrice')}>
              {numberInput('buyPrice')}
            </Field>
            <Field label={t('form.fee')} error={errorText('fee')}>
              {numberInput('fee')}
            </Field>
            <Field label={t('form.date')}>
              <input className={fieldClass} type="date" value={values.date} max={today} onChange={(e) => set('date', e.target.value)} />
            </Field>
            <AccountPicker label={t('form.paidFrom')} value={account} onChange={setAccount} />
          </fieldset>
        )}

        {gate && <GatePanel gate={gate} ack={{ checked: gateAck, onChange: setGateAck }} />}

        {existing && <Transactions holding={existing} txns={own} account={initialAccount} />}
        {existing && <Dividends holding={existing} />}
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
          <Button type="submit" disabled={gateBlocks}>
            {t('form.save')}
          </Button>
        </div>
      </div>
    </form>
  )
}

const emptyRow = (today: string): TransactionFormValues => ({ type: 'sell', qty: '', price: '', fee: '', date: today })

/** Which account the money of a buy came from (or a sell goes to); none = the trade only touches the portfolio. */
function AccountPicker({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  const { t } = useI18n()
  const accounts = useCashflow((s) => s.accounts).filter((a) => !a.archived)
  return (
    <Field label={label}>
      <select className={fieldClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('form.noAccount')}</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </Field>
  )
}

function Transactions({ holding, txns, account: initialAccount }: TransactionsProps) {
  const { t, money, num, qty } = useI18n()
  const { addTransaction, removeTransaction } = useStore()
  const addEntry = useCashflow((s) => s.addEntry)
  const removeEntry = useCashflow((s) => s.removeEntry)
  const [today] = useState(todayIso)
  // From Cashflow → Invest the row starts as a buy paid from that account.
  const [row, setRow] = useState<TransactionFormValues>(() => ({ ...emptyRow(today), type: initialAccount ? 'buy' : 'sell' }))
  const [account, setAccount] = useState(initialAccount ?? '')
  const [error, setError] = useState<FormError>()
  const lots = entersLots(holding.assetClass)
  const amountMode = !!holding.byAmount
  const newestFirst = [...txns].sort((a, b) => b.date.localeCompare(a.date))
  const setField = <K extends keyof TransactionFormValues>(key: K, value: TransactionFormValues[K]) => setRow((r) => ({ ...r, [key]: value }))

  // Adding to a trade is a new entry too: same gate as opening one.
  const f = useI18n()
  const runGate = useGate()
  const addJournal = useStore((s) => s.addJournal)
  const [gateAck, setGateAck] = useState(false)
  const gate =
    holding.group === 'trading' && row.type === 'buy' && row.qty.trim()
      ? runGate({
          paper: holding.paper,
          assetClass: holding.assetClass,
          currency: holding.currency,
          planWritten: !!holding.thesis,
          entry: parseOptional(row.price),
          stop: holding.stop,
          units: unitsFromInput(Number(row.qty) || 0, holding.assetClass),
        })
      : undefined
  const gateBlocks = !!gate && gate.decision !== 'go' && !gateAck

  function add() {
    const result = parseTransaction(row, holding, txns)
    if (!result.ok) return setError(result.error)
    if (gateBlocks) return
    const buy = result.tx.type === 'buy'
    if (gate) addJournal({ date: row.date, tag: 'entry', text: gateNote(gate, f), holdingId: holding.id })
    setGateAck(false)
    const entryId = account
      ? addEntry({ type: buy ? 'expense' : 'income', amount: cashOf(result.tx), category: INVEST, date: row.date, note: t(buy ? 'tx.note.buy' : 'tx.note.sell', { s: holding.symbol }), account })
      : undefined
    addTransaction({ ...result.tx, entryId })
    setRow((r) => ({ ...emptyRow(today), type: r.type, date: r.date }))
    setError(undefined)
  }

  const amount = (x: Transaction) => {
    if (amountMode) return money(cashOf(x))
    const n = inputFromUnits(x.quantity, holding.assetClass)
    return `${lots ? `${num(n)} lot` : qty(n)} × ${money(x.price)}`
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{t('tx.title')}</Label>
      <ul className="flex flex-col">
        {newestFirst.map((x) => (
          <li key={x.id} className="flex items-center gap-3 border-b border-border py-1.5 text-sm">
            <span className={`w-10 font-label text-[11px] uppercase ${x.type === 'buy' ? 'text-up' : 'text-down'}`}>{t(x.type === 'buy' ? 'tx.buy' : 'tx.sell')}</span>
            <span className="text-text-muted">{x.date.slice(0, 10)}</span>
            <span className="ml-auto font-mono">{amount(x)}</span>
            <button
              type="button"
              aria-label={t('tx.remove')}
              onClick={() => {
                removeTransaction(x.id)
                if (x.entryId) removeEntry(x.entryId)
              }}
              className="rounded px-1.5 text-text-muted hover:text-down focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {position(txns).quantity > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            setRow(sellAllRow(holding, txns, today))
            setError(undefined)
          }}
        >
          {t('tx.sellAll')}
        </Button>
      )}
      {/* Two columns at every width: five in a row squeezed Lot and Price to ~20px inside the dialog. */}
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-2 p-3">
        <select className={fieldClass} value={row.type} onChange={(e) => setField('type', e.target.value as TransactionType)} aria-label={t('tx.title')}>
          <option value="buy">{t('tx.buy')}</option>
          <option value="sell">{t('tx.sell')}</option>
        </select>
        {amountMode ? (
          <input className={fieldClass} type="number" step="any" min="0" placeholder={t('form.amount')} aria-label={t('form.amount')} value={row.qty} onChange={(e) => setField('qty', e.target.value)} />
        ) : (
          <>
            <input className={fieldClass} type="number" step="any" min="0" placeholder={lots ? 'Lot' : t('form.qty')} aria-label={lots ? t('form.lots') : t('form.qty')} value={row.qty} onChange={(e) => setField('qty', e.target.value)} />
            <input className={fieldClass} type="number" step="any" min="0" placeholder={t('form.txPrice')} aria-label={t('form.txPrice')} value={row.price} onChange={(e) => setField('price', e.target.value)} />
          </>
        )}
        <input className={fieldClass} type="date" value={row.date} max={today} aria-label={t('form.date')} onChange={(e) => setField('date', e.target.value)} />
        <input className={fieldClass} type="number" step="any" min="0" placeholder={t('form.fee')} aria-label={t('form.fee')} value={row.fee} onChange={(e) => setField('fee', e.target.value)} />
        <div className="col-span-2">
          <AccountPicker label={t(row.type === 'buy' ? 'form.paidFrom' : 'form.paidTo')} value={account} onChange={setAccount} />
        </div>
        {gate && (
          <div className="col-span-2">
            <GatePanel gate={gate} ack={{ checked: gateAck, onChange: setGateAck }} />
          </div>
        )}
        <Button type="button" variant="outline" className="col-span-2" onClick={add} disabled={gateBlocks}>
          {t('tx.add')}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-down">
          {t(ERROR_KEY[error])}
        </p>
      )}
    </div>
  )
}

/**
 * Dividends received for a holding. Each one is also logged as Investment income in Cashflow, to the account it
 * landed in (picked here), so account balances and the month's income include it. Deleting removes both.
 */
function Dividends({ holding }: { holding: Holding }) {
  const { t, money } = useI18n()
  const dividends = useStore((s) => s.dividends)
  const addDividend = useStore((s) => s.addDividend)
  const removeDividend = useStore((s) => s.removeDividend)
  const accounts = useCashflow((s) => s.accounts).filter((a) => !a.archived)
  const addEntry = useCashflow((s) => s.addEntry)
  const removeEntry = useCashflow((s) => s.removeEntry)
  const [today] = useState(todayIso)
  const [row, setRow] = useState({ amount: '', date: today, account: '' })
  const [error, setError] = useState(false)
  const own = dividends.filter((d) => d.holdingId === holding.id).sort((a, b) => b.date.localeCompare(a.date))
  const account = row.account || accounts[0]?.id || ''

  function add() {
    const amount = Math.round(Number(row.amount))
    if (!(amount > 0) || !row.date || !account) return setError(true)
    const entryId = addEntry({ type: 'income', amount, category: 'investment', date: row.date, note: t('div.note', { s: holding.symbol }), account })
    addDividend({ holdingId: holding.id, date: row.date, amount, entryId })
    setRow({ amount: '', date: row.date, account })
    setError(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{t('div.title')}</Label>
      <ul className="flex flex-col">
        {own.map((d) => (
          <li key={d.id} className="flex items-center gap-3 border-b border-border py-1.5 text-sm">
            <span className="text-text-muted">{d.date}</span>
            <span className="ml-auto font-mono text-up">+{money(d.amount)}</span>
            <button
              type="button"
              aria-label={t('div.remove')}
              onClick={() => {
                removeDividend(d.id)
                if (d.entryId) removeEntry(d.entryId)
              }}
              className="rounded px-1.5 text-text-muted hover:text-down focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-2 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <input className={`${fieldClass} font-mono`} type="number" min="0" step="1" placeholder={t('div.amount')} aria-label={t('div.amount')} aria-invalid={error} value={row.amount} onChange={(e) => setRow({ ...row, amount: e.target.value })} />
        <input className={fieldClass} type="date" value={row.date} max={today} aria-label={t('form.date')} onChange={(e) => setRow({ ...row, date: e.target.value })} />
        <select className={fieldClass} value={account} onChange={(e) => setRow({ ...row, account: e.target.value })} aria-label={t('div.account')}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" onClick={add}>
          {t('div.add')}
        </Button>
      </div>
      <p className={`text-xs ${error ? 'text-down' : 'text-text-muted'}`}>{t(error ? 'div.err' : 'div.hint')}</p>
    </div>
  )
}
