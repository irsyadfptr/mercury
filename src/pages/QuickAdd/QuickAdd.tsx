import { useEffect, useState } from 'react'
import { useCashflow } from '@/cashflowStore'
import { PixelIcon } from '@/components/PixelIcon'
import { SyncBar } from '@/components/SyncBar'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui-bits'
import { categoriesFor, frequentEntries, isBuiltIn, localDate, MAX_CATEGORY_LENGTH, padInput, validateCategoryName } from '@/domain/cashflow'
import { DEFAULT_ACCOUNT_ID, TRANSFER } from '@/domain/schema'
import { parseVoice } from '@/domain/voice'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { href, routeParam } from '@/routes'
import type { CategoryNameError, CustomCategory, Key } from '@/types'
import { useCashEntries } from '@/useCashEntries'
import { useSheetSync } from '@/useSheetSync'
import { categoryColor, categoryIcon } from '@/view/tokens'
import type { EntryType, PadKey, QuickAddDraft, SpeechRecognitionLike } from './QuickAdd.types'

const PAD: readonly PadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'back']
const DAY_MS = 86_400_000
const focusRing = 'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'

const freshDraft = (type: EntryType, today: string, account = DEFAULT_ACCOUNT_ID): QuickAddDraft => ({ type, digits: '', category: undefined, date: today, note: '', account })

// Chrome and Safari still prefix it; Firefox has none, so the mic button is hidden there.
const Recognition = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition

/** Phone-first entry screen: type, amount on a number pad, category tile, day, save. Works offline. */
export function QuickAdd() {
  const { t, num, compact, category, lang } = useI18n()
  const sync = useSheetSync()
  const addEntry = useCashflow((s) => s.addEntry)
  const updateEntry = useCashflow((s) => s.updateEntry)
  const addCategory = useCashflow((s) => s.addCategory)
  const customCategories = useCashflow((s) => s.customCategories)
  const accounts = useCashflow((s) => s.accounts)
  const { entries } = useCashEntries()
  // undefined = form closed; '' or text = typing a new category name.
  const [newName, setNewName] = useState<string>()
  const [nameError, setNameError] = useState<CategoryNameError>()
  // Read once per visit to this screen; "today" does not need to tick while the pad is open.
  const [today] = useState(() => localDate(Date.now()))
  const [yesterday] = useState(() => localDate(Date.now() - DAY_MS))
  // '#/add?edit=<id>' opens an existing entry; saving replaces it and goes back to Cashflow.
  const [editing] = useState(() => entries.find((e) => e.id === routeParam('edit')))
  const [draft, setDraft] = useState<QuickAddDraft>(() =>
    editing
      ? {
          type: editing.type,
          digits: String(editing.amount),
          category: editing.type === TRANSFER ? undefined : editing.category,
          date: editing.date,
          note: editing.note ?? '',
          account: editing.account ?? DEFAULT_ACCOUNT_ID,
          toAccount: editing.toAccount,
        }
      : freshDraft('expense', today),
  )
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState<string>()
  const [voiceError, setVoiceError] = useState(false)

  const shortcuts = frequentEntries(entries, today)
  const amount = Number(draft.digits || 0)
  const transfer = draft.type === TRANSFER
  const categories = draft.type === TRANSFER ? [] : categoriesFor(draft.type, customCategories, entries)
  const active = accounts.filter((a) => !a.archived)
  const canSave = amount > 0 && (transfer ? !!draft.toAccount && draft.toAccount !== draft.account : draft.category !== undefined)
  const update = (patch: Partial<QuickAddDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const press = (key: PadKey) => setDraft((d) => ({ ...d, digits: padInput(d.digits, key) }))

  function save() {
    if (!canSave) return
    const note = draft.note.trim() || undefined
    if (editing) {
      const category = transfer ? TRANSFER : draft.category
      if (!category) return
      updateEntry({ ...editing, type: draft.type, amount, category, date: draft.date, note, account: draft.account, toAccount: transfer ? draft.toAccount : undefined })
      location.hash = href('cashflow')
      return
    }
    // Back to Cashflow, which shows what was saved with "Add another" and Undo.
    const id = transfer
      ? addEntry({ type: TRANSFER, amount, category: TRANSFER, date: draft.date, note, account: draft.account, toAccount: draft.toAccount })
      : draft.category && addEntry({ type: draft.type, amount, category: draft.category, date: draft.date, note, account: draft.account })
    if (id) location.hash = href('cashflow', { added: id })
  }

  /** Fills the form from what was heard; the user still checks it and taps Save. */
  function applyTranscript(text: string) {
    const custom: CustomCategory[] = (['expense', 'income'] as const).flatMap((type) =>
      categoriesFor(type, customCategories, entries)
        .filter((name) => !isBuiltIn(name))
        .map((name) => ({ type, name })),
    )
    const v = parseVoice(text, active, custom)
    setHeard(text)
    setDraft((d) => {
      const type = v.type ?? d.type
      return {
        ...d,
        type,
        digits: v.amount ? String(Math.min(v.amount, 99_999_999_999)) : d.digits,
        category: v.category ?? (type === d.type ? d.category : undefined),
        account: v.account ?? d.account,
        toAccount: v.toAccount ?? (type === d.type ? d.toAccount : undefined),
        note: v.note || d.note,
        date: v.daysAgo === undefined ? d.date : v.daysAgo ? yesterday : today,
      }
    })
  }

  function listen() {
    if (!Recognition) return
    const r = new Recognition()
    r.lang = lang === 'id' ? 'id-ID' : 'en-US'
    r.interimResults = false
    r.maxAlternatives = 1
    r.onresult = (e) => applyTranscript(e.results[0][0].transcript)
    r.onerror = () => setVoiceError(true)
    r.onend = () => setListening(false)
    setVoiceError(false)
    setListening(true)
    r.start()
  }

  function createCategory() {
    if (draft.type === TRANSFER) return
    const result = validateCategoryName(newName ?? '', categories.map(category))
    if (!result.ok) return setNameError(result.error)
    addCategory({ type: draft.type, name: result.name })
    update({ category: result.name })
    setNewName(undefined)
    setNameError(undefined)
  }

  // Desktop convenience: type digits, Backspace, Enter, unless a text field has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (/^\d$/.test(e.key)) press(e.key as PadKey)
      else if (e.key === 'Backspace') press('back')
      else if (e.key === 'Enter') document.getElementById('quick-add-save')?.click()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col gap-3 px-4 pt-3 pb-4">
      <header className="flex items-center justify-between gap-2">
        <a href={href('cashflow')} className={cn('rounded-md font-label text-xs uppercase underline underline-offset-4', focusRing)}>
          ← {t('add.back')}
        </a>
        <h1 className="font-display text-3xl leading-none uppercase">{t(editing ? 'add.editTitle' : 'add.title')}</h1>
      </header>
      <SyncBar sync={sync} compact />

      {!editing && shortcuts.length > 0 && (
        <div aria-label={t('add.frequent')} className="flex gap-1.5 overflow-x-auto pb-1">
          {shortcuts.map((s) => (
            <button
              key={JSON.stringify(s)}
              type="button"
              onClick={() => {
                setDraft((d) => ({ ...d, type: s.type, digits: String(s.amount), category: s.category, note: s.note ?? '', account: s.account ?? DEFAULT_ACCOUNT_ID, toAccount: undefined }))
                setHeard(undefined)
              }}
              className={cn('flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs', focusRing)}
            >
              <PixelIcon name={categoryIcon(s.category)} color={categoryColor(s.category)} size={12} />
              <span>{s.note || category(s.category)}</span>
              <span className="font-mono text-text-muted">{compact(s.amount)}</span>
            </button>
          ))}
        </div>
      )}

      {Recognition && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={listen} disabled={listening} aria-pressed={listening} className="font-label text-xs uppercase">
              <span aria-hidden="true" className={cn('size-2 rounded-full bg-down', listening && 'animate-pulse')} />
              {listening ? t('add.listening') : t('add.voice')}
            </Button>
            {heard && <span className="min-w-0 truncate text-xs text-text-muted">{t('add.heard', { text: heard })}</span>}
          </div>
          {voiceError && (
            <p role="alert" className="text-xs text-down">
              {t('add.voiceError')}
            </p>
          )}
          <p className="text-[11px] text-text-muted">{t('add.voiceHint')}</p>
        </div>
      )}

      <div role="radiogroup" aria-label={t('add.title')} className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1">
        {(['expense', 'income', TRANSFER] as const).map((type) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={draft.type === type}
            onClick={() => {
              update({ type, category: undefined, toAccount: undefined })
              setNewName(undefined)
            }}
            className={cn('h-10 rounded-md font-label text-xs uppercase', focusRing, draft.type === type ? 'bg-surface text-text shadow-sm' : 'text-text-muted')}
          >
            <span className="flex items-center justify-center gap-2">
              <PixelIcon name={type === 'expense' ? 'arrowDown' : type === 'income' ? 'arrowUp' : 'coin'} size={12} />
              {t(`add.${type}`)}
            </span>
          </button>
        ))}
      </div>

      <output aria-label={t('add.amount')} aria-live="polite" className="flex items-baseline justify-end gap-1.5 border-b-2 border-text pb-2 leading-[0.85]">
        <span className="font-display text-3xl text-text-muted">{transfer ? '' : draft.type === 'expense' ? '−' : '+'}Rp</span>
        <span className={cn('font-display text-[64px]', !amount && 'text-text-muted')}>{num(amount)}</span>
      </output>

      {(transfer ? (['account', 'toAccount'] as const) : (['account'] as const)).map((field) => (
        <div key={field} role="radiogroup" aria-label={t(transfer ? (field === 'account' ? 'add.from' : 'add.to') : 'add.account')} className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-12 pr-1 font-label text-[11px] text-text-muted uppercase">{t(transfer ? (field === 'account' ? 'add.from' : 'add.to') : 'add.account')}</span>
          {active.map((a) => {
            const on = (draft[field] ?? (field === 'account' ? DEFAULT_ACCOUNT_ID : undefined)) === a.id
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={field === 'toAccount' && a.id === draft.account}
                onClick={() => update({ [field]: a.id })}
                className={cn('h-9 rounded-md px-3 text-xs disabled:opacity-40', focusRing, on ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-text-muted')}
              >
                {a.name}
              </button>
            )
          })}
        </div>
      ))}

      {/* minmax(0,1fr): long names ("Investment") wrap inside the tile instead of pushing the screen wider. */}
      <div role="radiogroup" aria-label={t('add.category')} className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-1.5">
        {categories.map((c) => {
          const on = draft.category === c
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => update({ category: c })}
              className={cn('flex min-h-11 min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs', focusRing, on ? 'border-text bg-surface ring-2 ring-text' : 'border-border bg-surface')}
            >
              <PixelIcon name={categoryIcon(c)} color={categoryColor(c)} size={16} className="shrink-0" />
              <span className="min-w-0 leading-tight break-words">{category(c)}</span>
            </button>
          )
        })}
        {newName === undefined && !transfer && (
          <button
            type="button"
            onClick={() => setNewName('')}
            className={cn('flex min-h-11 items-center justify-center rounded-md border border-dashed border-border px-2 font-label text-[11px] text-text-muted uppercase', focusRing)}
          >
            {t('add.newCategory')}
          </button>
        )}
      </div>

      {newName !== undefined && (
        <form
          className="flex flex-col gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            createCategory()
          }}
        >
          <div className="flex gap-1.5">
            <input
              className={fieldClass}
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value)
                setNameError(undefined)
              }}
              placeholder={t('add.categoryName')}
              aria-label={t('add.categoryName')}
              aria-invalid={!!nameError}
              maxLength={MAX_CATEGORY_LENGTH + 10}
              autoFocus
            />
            <Button type="submit" variant="outline">
              {t('add.createCategory')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setNewName(undefined)}>
              {t('add.cancel')}
            </Button>
          </div>
          {nameError && (
            <p role="alert" className="text-xs text-down">
              {t(`catErr.${nameError}` as Key)}
            </p>
          )}
        </form>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { date: today, label: t('add.today') },
          { date: yesterday, label: t('add.yesterday') },
        ].map((d) => (
          <button
            key={d.date}
            type="button"
            aria-pressed={draft.date === d.date}
            onClick={() => update({ date: d.date })}
            className={cn('h-9 rounded-md px-3 font-label text-[11px] uppercase', focusRing, draft.date === d.date ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-text-muted')}
          >
            {d.label}
          </button>
        ))}
        <input type="date" value={draft.date} max={today} onChange={(e) => e.target.value && update({ date: e.target.value })} aria-label={t('form.date')} className={cn(fieldClass, 'w-auto flex-1')} />
      </div>

      <input className={fieldClass} value={draft.note} onChange={(e) => update({ note: e.target.value })} placeholder={t('add.note')} aria-label={t('add.note')} maxLength={120} />

      <div className="mt-auto grid grid-cols-3 gap-1.5">
        {PAD.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            aria-label={key === 'back' ? t('add.backspace') : key}
            className={cn('h-14 rounded-lg bg-surface-2 font-display text-3xl active:bg-empty', focusRing)}
          >
            {key === 'back' ? '⌫' : key}
          </button>
        ))}
      </div>

      <Button
        id="quick-add-save"
        disabled={!canSave}
        onClick={save}
        className="h-14 font-label text-sm uppercase shadow-[0_3px_0_var(--accent-deep)] active:translate-y-0.5 active:shadow-none"
      >
        {t('add.save')}
      </Button>
    </div>
  )
}
