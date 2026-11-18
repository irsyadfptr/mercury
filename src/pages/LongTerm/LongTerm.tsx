import { factLine } from '@/ai/deepseek'
import { Explain } from '@/components/Explain'
import { useReducer, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardTitle, Label, fieldClass } from '@/components/ui-bits'
import { useI18n } from '@/i18n'
import { scoreFundamentals, type FundamentalScore, type Metric, type MetricId } from '@/market/fundamentals'
import { fetchFundamentals, fetchScreen, IDX_AVAILABLE, IdxFetchError, SCREENS, type FundamentalRow, type IdxError, type ScreenId } from '@/market/idx'
import type { I18n, Key } from '@/types'
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

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-5xl leading-none uppercase">{t('lt.title')}</h1>
          <div role="group" aria-label={t('scan.title')} className="flex gap-1 rounded-md border border-border p-1">
            {(['idx', 'crypto'] as const).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={id === market}
                onClick={() => pickMarket(id)}
                className={`rounded px-3 py-1.5 font-label text-xs uppercase focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${id === market ? 'bg-primary text-primary-foreground' : 'text-text-muted hover:bg-surface-2 hover:text-text'}`}
              >
                {t(`scan.market.${id}`)}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-sm text-text-muted">{t(market === 'idx' ? 'lt.intro' : 'cryf.intro')}</p>
      </Card>
      {market === 'crypto' ? (
        <CryptoCheck />
      ) : IDX_AVAILABLE ? (
        <>
          <TickerCheck check={check} onCheck={run} />
          <ScreenCard
            onPick={(s) => {
              void run(s)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
        </>
      ) : (
        <Card>
          <p className="text-sm">{t('scan.localOnly')}</p>
        </Card>
      )}
      {market === 'idx' && <div className="flex flex-wrap gap-4">
        <div className="min-w-0 flex-[3_1_420px]">
          <ScoreHistory log={log} initial={check.status === 'done' ? check.row.symbol : held[0]} onPick={(s) => void run(s)} />
        </div>
        <div className="min-w-0 flex-[2_1_320px]">
          <BetterScored log={log} held={held} onPick={(s) => void run(s)} />
        </div>
      </div>}
    </>
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
    <Card>
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
          <div className="font-display text-5xl leading-none">{s.total}/15</div>
          {s.known < 15 && <div className="text-xs text-text-muted">{t('lt.known', { n: s.known })}</div>}
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {s.parts.map((p) => (
          <div key={p.id} className="rounded-md border border-border">
            <div className="flex items-baseline justify-between bg-surface-2 px-3 py-2">
              <div>
                <Label>{t(`lt.part.${p.id}`)}</Label>
                <div className="text-xs text-text-muted">{t(`lt.part.${p.id}.d`)}</div>
              </div>
              <div className="font-display text-3xl leading-none">{p.score}/5</div>
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
  const columns: Key[] = ['scan.ticker', 'lt.total', 'lt.part.quality', 'lt.part.value', 'lt.part.risk', 'lt.col.pe', 'lt.col.roe', 'lt.col.yield']
  const v = (x: number | null, d: number, unit = '') => (x === null ? '—' : `${num(x, d)}${unit}`)

  return (
    <Card>
      <CardTitle icon="star" aside={screen.status === 'done' && t('lt.screen.count', { n: screen.rows.length, total: screen.universe })}>
        {t('lt.screen')}
      </CardTitle>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div role="group" aria-label={t('lt.screen')} className="flex flex-wrap gap-1 rounded-md border border-border p-1">
          {SCREENS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={s === id}
              onClick={() => setId(s)}
              className={`rounded px-3 py-1.5 font-label text-xs uppercase focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${s === id ? 'bg-primary text-primary-foreground' : 'text-text-muted hover:bg-surface-2 hover:text-text'}`}
            >
              {t(`lt.screen.${s}`)}
            </button>
          ))}
        </div>
        <Button onClick={() => void run()} disabled={screen.status === 'loading'} className={primary}>
          {screen.status === 'loading' ? t('scan.loading') : t('lt.screen.run')}
        </Button>
      </div>
      <p className="mb-3 text-sm text-text-muted">{t(`lt.screen.${id}.d`)}</p>
      {screen.status === 'error' && <ErrorText error={screen.error} />}
      {screen.status === 'done' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left">
              <tr>
                {columns.map((k) => (
                  <th key={k} className="px-2 py-1.5 font-label text-[11px] font-normal text-text-muted uppercase">
                    {t(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {screen.rows.map((r) => (
                <tr key={r.symbol}>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => onPick(r.symbol)}
                      title={r.name}
                      className="font-mono underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {r.symbol}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 font-mono">
                    {r.score.total}/15 <span className="text-xs text-text-muted">({t('lt.known', { n: r.score.known })})</span>
                  </td>
                  {r.score.parts.map((p) => (
                    <td key={p.id} className="px-2 py-1.5 font-mono">
                      {p.score}/5
                    </td>
                  ))}
                  <td className="px-2 py-1.5 font-mono">{v(r.input.pe, 1)}</td>
                  <td className="px-2 py-1.5 font-mono">{v(r.input.roePct, 1, '%')}</td>
                  <td className="px-2 py-1.5 font-mono">{v(r.input.dividendYieldPct, 1, '%')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-text-muted">
        <Badge tone="neutral">{t('lt.screen.partial')}</Badge> {t('lt.screen.note')}
      </p>
    </Card>
  )
}
