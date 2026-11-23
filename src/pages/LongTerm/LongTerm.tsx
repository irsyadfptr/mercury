import { factLine } from '@/ai/deepseek'
import { Explain } from '@/components/Explain'
import { useReducer, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardTitle, Label, PixelTabs, fieldClass } from '@/components/ui-bits'
import { ltScoreColor } from '@/view/bars'
import { ScorePips } from './ScorePips'
import { useI18n } from '@/i18n'
import { scoreFundamentals, type FundamentalScore, type Metric, type MetricId } from '@/market/fundamentals'
import { fetchFundamentals, fetchScreen, IDX_AVAILABLE, IdxFetchError, SCREENS, type FundamentalRow, type IdxError, type ScreenId } from '@/market/idx'
import type { I18n } from '@/types'
import { loadScoreLog } from '@/market/scoreLog'
import { longTermSymbols, saveCheck, useScoreLog } from '@/useScoreLog'
import { useSummary } from '@/useSummary'
import { CryptoCheck } from './CryptoCheck'
import { BetterScored, ScoreHistory } from './History'

const primary = 'font-label text-xs uppercase shadow-[0_3px_0_var(--accent-deep)] active:translate-y-0.5 active:shadow-none'
const errorOf = (e: unknown): IdxError => (e instanceof IdxFetchError ? e.code : 'fetch-failed')

type Scored = FundamentalRow & { score: FundamentalScore }
const scored = (r: FundamentalRow): Scored => ({ ...r, score: scoreFundamentals(r.input) })

// How each metric's value and threshold read.
const PCT: MetricId[] = ['roe', 'netMargin', 'earningsGrowth', 'dividendYield', 'targetUpside', 'swing52w']
const OP: Partial<Record<MetricId, string>> = { debtToEquity: '≤', beta: '≤', swing52w: '≤', earningsGrowth: '>', pe: '0 <', pb: '0 <', peg: '0 <' }
function show(f: I18n, id: MetricId, v: number): string {
  if (PCT.includes(id)) return `${f.num(v, 1)}%`
  if (id === 'dividendYears') return f.t('lt.years', { n: v })
  if (id === 'marketCap') return f.compact(v)
  // Cash minus debt is in the statements' currency (USD for some coal miners), so no Rp.
  if (id === 'netCash') return v.toLocaleString(f.locale, { notation: 'compact', maximumFractionDigits: 1 })
  return id === 'beta' || id === 'currentRatio' ? f.num(v, 2) : `${f.num(v, 2)}×`
}
const limitText = (f: I18n, m: Metric) => {
  const op = OP[m.id]
  return op?.startsWith('0') ? `0 < x ≤ ${show(f, m.id, m.limit)}` : `${op ?? '≥'} ${show(f, m.id, m.limit)}`
}

// Kept outside React so the last check and screen survive page switches.
type Check = { status: 'idle' } | { status: 'loading' } | { status: 'error'; error: IdxError } | { status: 'done'; row: Scored }
let lastCheck: Check = { status: 'idle' }
type Screen = { status: 'idle' } | { status: 'loading'; id: ScreenId } | { status: 'error'; id: ScreenId; error: IdxError } | { status: 'done'; id: ScreenId; universe: number; rows: Scored[] }
let lastScreen: Screen = { status: 'idle' }

const LT_MARKET_KEY = 'mercury.longterm.market'
function initialMarket(): 'idx' | 'crypto' {
  try {
    if (localStorage.getItem(LT_MARKET_KEY) === 'crypto') return 'crypto'
  } catch {
    // Storage blocked: start on the default.
  }
  return IDX_AVAILABLE ? 'idx' : 'crypto'
}

export function LongTerm() {
  const { t } = useI18n()
  const [market, setMarket] = useState(initialMarket)
  const pickMarket = (v: 'idx' | 'crypto') => {
    setMarket(v)
    try {
      localStorage.setItem(LT_MARKET_KEY, v)
    } catch {
      // Storage blocked: the choice lasts this visit only.
    }
  }
  const [check, setCheckState] = useState(lastCheck)
  const setCheck = (c: Check) => setCheckState((lastCheck = c))
  const held = longTermSymbols(useSummary().rows)
  const auto = useScoreLog(held)
  // The stored log: re-read on each render (small), so a ticker checked here shows at once; rerender() triggers that.
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const log = { ...auto, ...loadScoreLog() }
  const run = async (symbol: string) => {
    setCheck({ status: 'loading' })
    try {
      const row = await fetchFundamentals(symbol)
      saveCheck(row)
      rerender()
      setCheck({ status: 'done', row: scored(row) })
    } catch (e) {
      setCheck({ status: 'error', error: errorOf(e) })
    }
  }

  const pick = (s: string) => {
    void run(s)
    requestAnimationFrame(() => {
      const el = document.getElementById('lt-check')
      if (el && (el.getBoundingClientRect().top < 0 || el.getBoundingClientRect().top > innerHeight * 0.6)) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    })
  }

  // IDX order, most-needed first: how your holdings score (and what scores better), the check, the screen for new
  // ideas, then score history. Wide: holdings + screen on the left, check + history on the right.
  return (
    <div className="play-skin contents">
      <div aria-hidden="true" className="play-confetti" />
      <Card data-tone="gold">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-5xl leading-none uppercase [text-shadow:2px_2px_0_color-mix(in_srgb,var(--tone)_80%,transparent)]">{t('lt.title')}</h1>
          <PixelTabs label={t('scan.title')} options={(['idx', 'crypto'] as const).map((id) => ({ id, label: t(`scan.market.${id}`) }))} value={market} onChange={pickMarket} />
        </div>
        <p className="mt-2 text-sm text-text-muted">{t(market === 'idx' ? 'lt.intro' : 'cryf.intro')}</p>
      </Card>
      {market === 'crypto' ? (
        <CryptoCheck />
      ) : (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
            <div className="order-1 min-w-0 lg:order-none">
              <BetterScored log={log} held={held} onPick={pick} />
            </div>
            {IDX_AVAILABLE && (
              <div className="order-3 min-w-0 lg:order-none">
                <ScreenCard onPick={pick} />
              </div>
            )}
          </div>
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
            <div id="lt-check" className="order-2 min-w-0 scroll-mt-4 lg:order-none">
              {IDX_AVAILABLE ? (
                <TickerCheck check={check} onCheck={run} />
              ) : (
                <Card data-tone="red">
                  <p className="text-sm">{t('scan.localOnly')}</p>
                </Card>
              )}
            </div>
            <div className="order-4 min-w-0 lg:order-none">
              <ScoreHistory log={log} initial={check.status === 'done' ? check.row.symbol : held[0]} onPick={pick} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ErrorText({ error }: { error: IdxError }) {
  const { t } = useI18n()
  return (
    <p role="alert" className="text-sm text-down">
      {t(`scan.err.${error}`)}
      {error === 'idx-missing' && <code className="ml-1 rounded bg-surface-2 px-1 font-mono text-text">npm install -g ihsg-cli</code>}
    </p>
  )
}

function TickerCheck({ check, onCheck }: { check: Check; onCheck: (s: string) => Promise<void> }) {
  const { t } = useI18n()
  const [symbol, setSymbol] = useState(check.status === 'done' ? check.row.symbol : 'PTBA')
  // Follow a ticker picked from the screen.
  const [shown, setShown] = useState(check)
  if (shown !== check) {
    setShown(check)
    if (check.status === 'done') setSymbol(check.row.symbol)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void onCheck(symbol.trim().toUpperCase())
  }
  return (
    <Card data-tone="blue">
      <CardTitle icon="chartUp">{t('lt.check')}</CardTitle>
      <form onSubmit={submit} className="mb-4 flex gap-2">
        <input
          aria-label={t('scan.ticker')}
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          maxLength={4}
          pattern="[A-Z]{4}"
          required
          className={`${fieldClass} max-w-32 font-mono uppercase`}
        />
        <Button type="submit" disabled={check.status === 'loading'} className={primary}>
          {check.status === 'loading' ? t('scan.loading') : t('scan.run')}
        </Button>
      </form>
      {check.status === 'idle' && <p className="text-sm text-text-muted">{t('scan.pickHint')}</p>}
      {check.status === 'error' && <ErrorText error={check.error} />}
      {check.status === 'done' && <CheckResult row={check.row} />}
    </Card>
  )
}

function CheckResult({ row }: { row: Scored }) {
  const f = useI18n()
  const { t } = f
  const s = row.score
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-display text-4xl leading-none">{row.symbol}</div>
          <div className="text-sm text-text-muted">
            {[row.name, row.sector, row.input.price !== null && f.money(row.input.price)].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="text-right">
          <Label>{t('lt.total')}</Label>
          <div className="font-display text-5xl leading-none" style={{ color: ltScoreColor(s.total) }}>
            {s.total}
            <span className="text-2xl text-text-muted">/15</span>
          </div>
          {s.known < 15 && <div className="text-xs text-text-muted">{t('lt.known', { n: s.known })}</div>}
        </div>
      </div>
      <ScorePips total={s.total} height={12} label={`${row.symbol} ${s.total}/15`} />
      <div className="flex flex-col gap-3">
        {s.parts.map((p) => (
          <div key={p.id} className="overflow-hidden rounded-lg border-2" style={{ borderColor: 'color-mix(in srgb, var(--tone) 55%, var(--surface))' }}>
            <div className="flex items-center justify-between gap-3 bg-surface-2 px-3 py-2">
              <div className="min-w-0">
                <Label className="text-text">{t(`lt.part.${p.id}`)}</Label>
                <div className="text-xs text-text-muted">{t(`lt.part.${p.id}.d`)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="w-16">
                  <ScorePips total={p.score} max={5} label={`${p.score}/5`} />
                </span>
                <span className="font-display text-3xl leading-none">{p.score}/5</span>
              </div>
            </div>
            <ul className="flex flex-col divide-y divide-border">
              {p.metrics.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 px-3 py-2 text-sm">
                  <span className={`w-14 shrink-0 font-label text-[11px] uppercase ${m.pass ? 'text-up' : m.pass === false ? 'text-down' : 'text-text-muted'}`}>
                    {m.pass ? `✓ ${t('rule.pass')}` : m.pass === false ? `✗ ${t('rule.fail')}` : `? ${t('rule.unknown')}`}
                  </span>
                  <span className="flex-1">{t(`lt.m.${m.id}`)}</span>
                  <span className="w-full pl-[4.25rem] font-mono text-xs text-text-muted">
                    {m.value === null ? t('lt.noData') : show(f, m.id, m.value)} · {limitText(f, m)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Explain
        title={`${row.symbol} (${row.name}) IDX stock long-term score ${s.total}/15, ${s.known} of 15 metrics have data`}
        facts={s.parts.flatMap((p) => [
          `${t(`lt.part.${p.id}`)} ${p.score}/5`,
          ...p.metrics.map((m) => factLine(m.pass, t(`lt.m.${m.id}`), `${m.value === null ? t('lt.noData') : show(f, m.id, m.value)} (${limitText(f, m)})`)),
        ])}
      />
      <p className="text-xs text-text-muted">{t('lt.note')}</p>
    </div>
  )
}

function ScreenCard({ onPick }: { onPick: (s: string) => void }) {
  const f = useI18n()
  const { t, num } = f
  const [screen, setScreenState] = useState(lastScreen)
  const setScreen = (s: Screen) => setScreenState((lastScreen = s))
  const [id, setId] = useState<ScreenId>(screen.status === 'idle' ? 'large' : screen.id)
  const run = async () => {
    setScreen({ status: 'loading', id })
    try {
      const r = await fetchScreen(id)
      const rows = r.rows.map(scored).sort((a, b) => b.score.total - a.score.total || b.score.known - a.score.known || a.symbol.localeCompare(b.symbol))
      setScreen({ status: 'done', id, universe: r.universe, rows })
    } catch (e) {
      setScreen({ status: 'error', id, error: errorOf(e) })
    }
  }
  const v = (x: number | null, d: number, unit = '') => (x === null ? '—' : `${num(x, d)}${unit}`)

  return (
    <Card data-tone="purple">
      <CardTitle icon="star" aside={screen.status === 'done' && t('lt.screen.count', { n: screen.rows.length, total: screen.universe })}>
        {t('lt.screen')}
      </CardTitle>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <PixelTabs label={t('lt.screen')} options={SCREENS.map((x) => ({ id: x, label: t(`lt.screen.${x}`) }))} value={id} onChange={setId} />
        <Button onClick={() => void run()} disabled={screen.status === 'loading'} className={primary}>
          {screen.status === 'loading' ? t('scan.loading') : t('lt.screen.run')}
        </Button>
      </div>
      <p className="mb-3 text-sm text-text-muted">{t(`lt.screen.${id}.d`)}</p>
      {screen.status === 'error' && <ErrorText error={screen.error} />}
      {screen.status === 'done' && (
        <ul className="flex flex-col gap-1.5">
          {screen.rows.map((r) => (
            <li key={r.symbol}>
              <button
                type="button"
                onClick={() => onPick(r.symbol)}
                title={r.name ?? undefined}
                className="flex w-full items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-left hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline gap-2">
                    <span className="font-semibold">{r.symbol}</span>
                    <span className="truncate text-xs text-text-muted">{r.name}</span>
                  </span>
                  <ScorePips total={r.score.total} height={7} label={`${r.symbol} ${r.score.total}/15`} />
                  <span className="font-label text-[10px] text-text-muted uppercase">
                    {r.score.parts.map((p) => `${t(`lt.part.${p.id}`)} ${p.score}`).join(' · ')} · {t('lt.col.pe')} {v(r.input.pe, 1)} · {t('lt.col.roe')} {v(r.input.roePct, 1, '%')} ·{' '}
                    {t('lt.col.yield')} {v(r.input.dividendYieldPct, 1, '%')}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-display text-3xl leading-none" style={{ color: ltScoreColor(r.score.total) }}>
                    {r.score.total}
                  </span>
                  <span className="font-label text-[10px] text-text-muted uppercase">{t('lt.known', { n: r.score.known })}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-text-muted">
        <Badge tone="neutral">{t('lt.screen.partial')}</Badge> {t('lt.screen.note')}
      </p>
    </Card>
  )
}
