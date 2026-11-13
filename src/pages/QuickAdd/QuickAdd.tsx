import { useEffect, useState } from 'react'
import { useCashflow } from '@/cashflowStore'
import { PixelIcon } from '@/components/PixelIcon'
import { SyncBar } from '@/components/SyncBar'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui-bits'
import { categoriesFor, localDate, MAX_CATEGORY_LENGTH, padInput, validateCategoryName } from '@/domain/cashflow'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { href } from '@/routes'
import type { CashType, CategoryNameError, Key } from '@/types'
import { useCashEntries } from '@/useCashEntries'
import { useSheetSync } from '@/useSheetSync'
import { categoryColor, categoryIcon } from '@/view/tokens'
import type { PadKey, QuickAddDraft } from './QuickAdd.types'

const PAD: readonly PadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'back']
const DAY_MS = 86_400_000
const focusRing = 'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'

const freshDraft = (type: CashType, today: string): QuickAddDraft => ({ type, digits: '', category: undefined, date: today, note: '' })

/** Phone-first entry screen: type, amount on a number pad, category tile, day, save. Works offline. */
export function QuickAdd() {
  const { t, num, money, category } = useI18n()
  const sync = useSheetSync()
  const addEntry = useCashflow((s) => s.addEntry)
  const addCategory = useCashflow((s) => s.addCategory)
  const customCategories = useCashflow((s) => s.customCategories)
  const { entries } = useCashEntries()
  // undefined = form closed; '' or text = typing a new category name.
  const [newName, setNewName] = useState<string>()
  const [nameError, setNameError] = useState<CategoryNameError>()
  // Read once per visit to this screen; "today" does not need to tick while the pad is open.
  const [today] = useState(() => localDate(Date.now()))
  const [yesterday] = useState(() => localDate(Date.now() - DAY_MS))
  const [draft, setDraft] = useState<QuickAddDraft>(() => freshDraft('expense', today))
  const [saved, setSaved] = useState<string>()

  const amount = Number(draft.digits || 0)
  const categories = categoriesFor(draft.type, customCategories, entries)
  const canSave = amount > 0 && draft.category !== undefined
  const update = (patch: Partial<QuickAddDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const press = (key: PadKey) => setDraft((d) => ({ ...d, digits: padInput(d.digits, key) }))

  function save() {
    if (!canSave || !draft.category) return
    addEntry({ type: draft.type, amount, category: draft.category, date: draft.date, note: draft.note.trim() || undefined })
    setSaved(t('add.saved', { amount: money(amount), category: category(draft.category) }))
    setDraft(freshDraft(draft.type, today))
  }

  function createCategory() {
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
        <h1 className="font-display text-3xl leading-none uppercase">{t('add.title')}</h1>
      </header>
      <SyncBar sync={sync} compact />

      <div role="radiogroup" aria-label={t('add.title')} className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
        {(['expense', 'income'] as const).map((type) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={draft.type === type}
            onClick={() => {
              update({ type, category: undefined })
              setNewName(undefined)
            }}
            className={cn('h-10 rounded-md font-label text-xs uppercase', focusRing, draft.type === type ? 'bg-surface text-text shadow-sm' : 'text-text-muted')}
          >
            <span className="flex items-center justify-center gap-2">
              <PixelIcon name={type === 'expense' ? 'arrowDown' : 'arrowUp'} size={12} />
              {t(type === 'expense' ? 'add.expense' : 'add.income')}
            </span>
          </button>
        ))}
      </div>

      <output aria-label={t('add.amount')} aria-live="polite" className="flex items-baseline justify-end gap-1.5 border-b-2 border-text pb-2 leading-[0.85]">
        <span className="font-display text-3xl text-text-muted">{draft.type === 'expense' ? '−' : '+'}Rp</span>
        <span className={cn('font-display text-[64px]', !amount && 'text-text-muted')}>{num(amount)}</span>
      </output>

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
        {newName === undefined && (
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
      {saved && (
        <p role="status" className="text-center text-sm text-text-muted">
          ✓ {saved}
        </p>
      )}
    </div>
  )
}
