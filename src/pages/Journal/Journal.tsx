import { useEffect, useState, type FormEvent } from 'react'
import { PixelIcon } from '@/components/PixelIcon'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardTitle, Field, Label, PixelTabs, fieldClass } from '@/components/ui-bits'
import { localDate } from '@/domain/cashflow'
import { byDay, journalCalendar, journalStreak } from '@/domain/journal'
import { journalMarket, MARKET_CLASSES, SCAN_MARKET, type TradeMarket } from '@/domain/markets'
import { JOURNAL_TAGS } from '@/domain/schema'
import { useI18n } from '@/i18n'
import { routeParam } from '@/routes'
import { useStore } from '@/store'
import type { Holding, JournalEntry, JournalTag } from '@/types'
import { useNow } from '@/useNow'
import { SignalsView } from './Signals'
import { TradesView } from './Trades'

const primary = 'font-label text-xs uppercase shadow-[0_3px_0_var(--accent-deep)] active:translate-y-0.5 active:shadow-none'
const ALL = ''

/** Notes (the journal), Trades (trade memory + review) and Signals (scanner signal postmortem). */
const VIEWS = ['notes', 'trades', 'signals'] as const
type View = (typeof VIEWS)[number]
const VIEW_KEY = 'mercury.journal.view'
/** '#/stocks?view=journal&jv=trades' wins; a prefilled note ('?tag=…') opens Notes; else the last view used. */
function initialView(): View {
  const asked = routeParam('jv')
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

/**
 * One market's journal (Crypto or Stocks): its notes, trades and signals. A note belongs to the market it was written
 * in (or its holding's market); old notes with neither are general and show in both, marked "All markets".
 */
export function Journal({ market }: { market: TradeMarket }) {
  const { t } = useI18n()
  const [view, setView] = useState(initialView)
  // A link to '…?view=journal&jv=…' while the Journal is already open (e.g. a Home quest) still switches.
  useEffect(() => {
    const follow = () => {
      const asked = routeParam('jv')
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
  const byId = new Map(holdings.map((h) => [h.id, h]))
  const mine = journal.filter((j) => {
    const m = journalMarket(j, byId)
    return !m || m === market
  })
  const streak = journalStreak(mine, today)
  // This market's holdings; open holdings first would need positions, alphabetical is enough to find one.
  const sorted = holdings.filter((h) => MARKET_CLASSES[market].includes(h.assetClass)).sort((a, b) => a.symbol.localeCompare(b.symbol))

  return (
    <>
      <Card data-tone="purple" className="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-3xl leading-none uppercase">{t('jr.title')}</h2>
            <div className="flex items-center gap-2" aria-label={t('jr.streak', { n: streak })}>
              {streak > 0 && <PixelIcon name="flame" size={28} className="flame" />}
              <span className="font-display text-5xl leading-none">{streak}</span>
              <Label>{t('jr.streakLabel')}</Label>
            </div>
          </div>
          <p className="text-sm text-text-muted">{t(`jr.intro.${view}`)}</p>
          <PixelTabs label={t('jr.viewLabel')} options={VIEWS.map((v) => ({ id: v, label: t(`jr.view.${v}`) }))} value={view} onChange={pickView} />
        </div>
        <NoteCalendar journal={mine} today={today} />
      </Card>
      {view === 'trades' ? (
        <TradesView market={market} />
      ) : view === 'signals' ? (
        <SignalsView market={SCAN_MARKET[market]} />
      ) : (
        // Write first (the point of a journal), then what you wrote. Wide: side by side.
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
          <div className="min-w-0 lg:sticky lg:top-4">
            <NewEntry today={today} holdings={sorted} market={market} />
          </div>
          <Entries journal={mine} byId={byId} holdings={sorted} market={market} />
        </div>
      )}
    </>
  )
}

/** The last five weeks of notes as a pixel calendar: darker = more notes that day; today outlined. */
function NoteCalendar({ journal, today }: { journal: readonly JournalEntry[]; today: string }) {
  const { t, day } = useI18n()
  const cells = journalCalendar(journal, today)
  const written = cells.filter((c) => c.count > 0).length
  return (
    <div className="flex w-full max-w-[15rem] min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-text">{t('jr.calendar')}</Label>
        <Label>{t('jr.calendarDays', { n: written })}</Label>
      </div>
      <div role="img" aria-label={t('jr.calendarDays', { n: written })} className="grid grid-cols-7 gap-1">
        {cells.map((c) => (
          <span
            key={c.date}
            title={`${day(c.date)}: ${c.count}`}
            className="aspect-square rounded-[3px] border-2"
            style={{
              background: c.future ? 'transparent' : c.count ? `color-mix(in srgb, var(--tone) ${Math.min(100, 45 + c.count * 25)}%, var(--text) ${c.count > 2 ? 15 : 0}%)` : 'var(--empty)',
              borderColor: c.date === today ? 'var(--text)' : c.future ? 'var(--border)' : 'transparent',
              borderStyle: c.future ? 'dashed' : 'solid',
            }}
          />
        ))}
      </div>
    </div>
  )
}

/** One colour per tag, so a day's notes read at a glance. */
const TAG_TONE: Record<JournalTag, string> = { note: 'teal', plan: 'blue', entry: 'green', exit: 'orange', lesson: 'purple' }

const holdingLabel = (h: Holding, paper: string) => `${h.symbol}${h.name ? ` · ${h.name}` : ''}${h.paper ? ` · ${paper}` : ''}`

function NewEntry({ today, holdings, market }: { today: string; holdings: Holding[]; market: TradeMarket }) {
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
    addJournal({ date, tag, text: text.trim(), holdingId: holdingId || undefined, market })
    setText('')
    setSaved(true)
  }

  return (
    <Card data-tone="pink" className="min-w-0">
      <CardTitle icon="plus">{t('jr.new')}</CardTitle>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label={t('jr.date')} className="col-span-2">
          <input type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} className={`${fieldClass} font-mono`} />
        </Field>
        <div className="col-span-2 flex flex-col gap-1">
          <span className="text-xs font-medium text-text-muted">{t('jr.tag')}</span>
          <div role="group" aria-label={t('jr.tag')} className="flex flex-wrap gap-1.5">
            {JOURNAL_TAGS.map((x) => (
              <button
                key={x}
                type="button"
                data-tone={TAG_TONE[x]}
                aria-pressed={x === tag}
                onClick={() => setTag(x)}
                className={`rounded-md border-2 px-2.5 py-1 font-label text-[11px] uppercase focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                  x === tag ? 'border-text bg-[var(--tone)] text-[oklch(0.24_0.03_275)] shadow-[2px_2px_0_var(--text)]' : 'border-transparent bg-surface-2 text-text-muted hover:text-text'
                }`}
              >
                {t(`jr.tag.${x}`)}
              </button>
            ))}
          </div>
        </div>
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

function Entries({ journal, byId, holdings, market }: { journal: readonly JournalEntry[]; byId: Map<string, Holding>; holdings: Holding[]; market: TradeMarket }) {
  const { t, day } = useI18n()
  const removeJournal = useStore((s) => s.removeJournal)
  const [filter, setFilter] = useState(ALL)
  const [tagFilter, setTagFilter] = useState<JournalTag | typeof ALL>(ALL)
  const shown = journal.filter((j) => (!filter || j.holdingId === filter) && (!tagFilter || j.tag === tagFilter))
  const linked = holdings.filter((h) => journal.some((j) => j.holdingId === h.id))

  return (
    <Card data-tone="blue" className="min-w-0">
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
            <ul className="mt-1 flex flex-col gap-1.5">
              {entries.map((j) => {
                const h = j.holdingId ? byId.get(j.holdingId) : undefined
                return (
                  <li key={j.id} data-tone={TAG_TONE[j.tag]} className="flex items-start gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm" style={{ borderLeft: '4px solid var(--tone)' }}>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded px-1.5 py-px font-label text-[11px] text-[oklch(0.24_0.03_275)] uppercase" style={{ background: 'var(--tone)' }}>
                          {t(`jr.tag.${j.tag}`)}
                        </span>
                        {h && <span className="font-mono text-xs">{h.symbol}</span>}
                        {h?.paper && <Badge tone="paper">{t('badge.paper')}</Badge>}
                        {journalMarket(j, byId) !== market && (
                          <span title={t('jr.generalHint')}>
                            <Badge tone="neutral">{t('jr.general')}</Badge>
                          </span>
                        )}
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
