import { useEffect, useState, type FormEvent } from 'react'
import { PixelIcon } from '@/components/PixelIcon'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardTitle, Field, Label, fieldClass } from '@/components/ui-bits'
import { localDate } from '@/domain/cashflow'
import { byDay, journalStreak } from '@/domain/journal'
import { JOURNAL_TAGS } from '@/domain/schema'
import { useI18n } from '@/i18n'
import { routeParam } from '@/routes'
import { useStore } from '@/store'
import type { Holding, JournalTag } from '@/types'
import { useNow } from '@/useNow'
import { SignalsView } from './Signals'
import { TradesView } from './Trades'

const primary = 'font-label text-xs uppercase shadow-[0_3px_0_var(--accent-deep)] active:translate-y-0.5 active:shadow-none'
const ALL = ''

/** Notes (the journal), Trades (trade memory + review) and Signals (scanner signal postmortem). */
const VIEWS = ['notes', 'trades', 'signals'] as const
type View = (typeof VIEWS)[number]
const VIEW_KEY = 'mercury.journal.view'
/** '#/journal?view=trades' wins; a prefilled note ('?tag=…') opens Notes; else the last view used. */
function initialView(): View {
  const asked = routeParam('view')
  if (asked && (VIEWS as readonly string[]).includes(asked)) return asked as View
  if (routeParam('tag') || routeParam('holding')) return 'notes'
  try {
    const saved = localStorage.getItem(VIEW_KEY)
    if (saved && (VIEWS as readonly string[]).includes(saved)) return saved as View
  } catch {
    // Storage blocked: start on Notes.
  }
  return 'notes'
}

export function Journal() {
  const { t } = useI18n()
  const [view, setView] = useState(initialView)
  // A link to '#/journal?view=…' while the Journal is already open (e.g. a Dashboard quest in another tab) still switches.
  useEffect(() => {
    const follow = () => {
      const asked = routeParam('view')
      if (asked && (VIEWS as readonly string[]).includes(asked)) setView(asked as View)
      else if (routeParam('tag') || routeParam('holding')) setView('notes')
    }
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [])
  const pickView = (v: View) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // Storage blocked: the choice lasts this visit only.
    }
  }
  const journal = useStore((s) => s.journal)
  const holdings = useStore((s) => s.holdings)
  const today = localDate(useNow())
  const streak = journalStreak(journal, today)
  const byId = new Map(holdings.map((h) => [h.id, h]))
  // Open holdings first would need positions; alphabetical is enough to find one.
  const sorted = [...holdings].sort((a, b) => a.symbol.localeCompare(b.symbol))

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-5xl leading-none uppercase">{t('jr.title')}</h1>
          <div className="flex items-center gap-2" aria-label={t('jr.streak', { n: streak })}>
            {streak > 0 && <PixelIcon name="flame" />}
            <span className="font-display text-4xl leading-none">{streak}</span>
            <Label>{t('jr.streakLabel')}</Label>
          </div>
        </div>
        <p className="mt-2 text-sm text-text-muted">{t(`jr.intro.${view}`)}</p>
        <div role="group" aria-label={t('jr.viewLabel')} className="mt-3 flex w-fit gap-1 rounded-md border border-border p-1">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={v === view}
              onClick={() => pickView(v)}
              className={`rounded px-3 py-1.5 font-label text-xs uppercase focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${v === view ? 'bg-primary text-primary-foreground' : 'text-text-muted hover:bg-surface-2 hover:text-text'}`}
            >
              {t(`jr.view.${v}`)}
            </button>
          ))}
        </div>
      </Card>
      {view === 'trades' ? (
        <TradesView />
      ) : view === 'signals' ? (
        <SignalsView />
      ) : (
        <div className="flex flex-wrap gap-4">
          <div className="min-w-0 flex-[2_1_320px]">
            <NewEntry today={today} holdings={sorted} />
          </div>
          <div className="min-w-0 flex-[3_1_520px]">
            <Entries byId={byId} holdings={sorted} />
          </div>
        </div>
      )}
    </>
  )
}

const holdingLabel = (h: Holding, paper: string) => `${h.symbol}${h.name ? ` · ${h.name}` : ''}${h.paper ? ` · ${paper}` : ''}`

function NewEntry({ today, holdings }: { today: string; holdings: Holding[] }) {
  const { t } = useI18n()
  const addJournal = useStore((s) => s.addJournal)
  const [date, setDate] = useState(today)
  // '#/journal?holding=…&tag=exit' (from the exit-lesson quest) starts the note already filled in.
  const [tag, setTag] = useState<JournalTag>(() => JOURNAL_TAGS.find((x) => x === routeParam('tag')) ?? 'note')
  const [holdingId, setHoldingId] = useState(() => holdings.find((h) => h.id === routeParam('holding'))?.id ?? ALL)
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    addJournal({ date, tag, text: text.trim(), holdingId: holdingId || undefined })
    setText('')
    setSaved(true)
  }

  return (
    <Card>
      <CardTitle icon="plus">{t('jr.new')}</CardTitle>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label={t('jr.date')}>
          <input type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} className={`${fieldClass} font-mono`} />
        </Field>
        <Field label={t('jr.tag')}>
          <select value={tag} onChange={(e) => setTag(e.target.value as JournalTag)} className={fieldClass}>
            {JOURNAL_TAGS.map((x) => (
              <option key={x} value={x}>
                {t(`jr.tag.${x}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('jr.holding')} hint={t('jr.holdingHint')} className="col-span-2">
          <select value={holdingId} onChange={(e) => setHoldingId(e.target.value)} className={fieldClass}>
            <option value={ALL}>{t('jr.noHolding')}</option>
            {holdings.map((h) => (
              <option key={h.id} value={h.id}>
                {holdingLabel(h, t('badge.paper'))}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('jr.text')} hint={t(`jr.tag.${tag}.hint`)} className="col-span-2">
          <textarea
            required
            rows={5}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setSaved(false)
            }}
            className={`${fieldClass} h-auto py-2`}
          />
        </Field>
        <div className="col-span-2 flex items-center gap-3">
          <Button type="submit" className={primary}>
            {t('jr.save')}
          </Button>
          {saved && (
            <span role="status" className="text-sm text-text-muted">
              {t('jr.saved')}
            </span>
          )}
        </div>
      </form>
    </Card>
  )
}

function Entries({ byId, holdings }: { byId: Map<string, Holding>; holdings: Holding[] }) {
  const { t, day } = useI18n()
  const journal = useStore((s) => s.journal)
  const removeJournal = useStore((s) => s.removeJournal)
  const [filter, setFilter] = useState(ALL)
  const [tagFilter, setTagFilter] = useState<JournalTag | typeof ALL>(ALL)
  const shown = journal.filter((j) => (!filter || j.holdingId === filter) && (!tagFilter || j.tag === tagFilter))
  const linked = holdings.filter((h) => journal.some((j) => j.holdingId === h.id))

  return (
    <Card>
      <CardTitle icon="receipt" aside={t('jr.count', { n: shown.length })}>
        {t('jr.entries')}
      </CardTitle>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Label>{t('jr.filter')}</Label>
        {linked.length > 0 && (
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('jr.holding')} className={`${fieldClass} w-auto max-w-64`}>
            <option value={ALL}>{t('jr.all')}</option>
            {linked.map((h) => (
              <option key={h.id} value={h.id}>
                {holdingLabel(h, t('badge.paper'))}
              </option>
            ))}
          </select>
        )}
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value as JournalTag | typeof ALL)} aria-label={t('jr.tag')} className={`${fieldClass} w-auto`}>
          <option value={ALL}>{t('jr.allTags')}</option>
          {JOURNAL_TAGS.map((x) => (
            <option key={x} value={x}>
              {t(`jr.tag.${x}`)}
            </option>
          ))}
        </select>
      </div>
      {!shown.length && <p className="text-sm text-text-muted">{t('jr.empty')}</p>}
      <div className="flex flex-col gap-4">
        {byDay(shown).map(([date, entries]) => (
          <section key={date}>
            <Label>{day(date)}</Label>
            <ul className="mt-1 flex flex-col divide-y divide-border rounded-md border border-border">
              {entries.map((j) => {
                const h = j.holdingId ? byId.get(j.holdingId) : undefined
                return (
                  <li key={j.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone="neutral">{t(`jr.tag.${j.tag}`)}</Badge>
                        {h && <span className="font-mono text-xs">{h.symbol}</span>}
                        {h?.paper && <Badge tone="paper">{t('badge.paper')}</Badge>}
                      </div>
                      <p className="whitespace-pre-wrap">{j.text}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => confirm(t('jr.deleteConfirm')) && removeJournal(j.id)}
                      aria-label={t('jr.delete')}
                      className="rounded px-1.5 font-label text-[11px] text-text-muted uppercase hover:text-down focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      ✕
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  )
}
