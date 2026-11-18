import { factLine } from '@/ai/deepseek'
import { Explain } from '@/components/Explain'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardTitle, Label, fieldClass } from '@/components/ui-bits'
import { IDX_LOT, positionSize } from '@/domain/portfolio'
import { useI18n } from '@/i18n'
import { backtest, summarize, type Backtest, type BacktestOptions, type Trade } from '@/market/backtest'
import { COIN, fetchCryptoFrame, fetchCryptoHistory } from '@/market/binance'
import { cachedCoinList, FIXED_LIST, loadCoinList, type CoinList } from '@/market/cryptoList'
import { fetchHistory, fetchHourly, IDX_AVAILABLE, IdxFetchError, type IdxError } from '@/market/idx'
import { checkSetup, CROSS_LOOKBACK, CRYPTO_RULES, IDX_RULES, to4h, toMonthly, toWeekly, type Bar, type Check, type MarketRules, type Rule } from '@/market/indicators'
import { LQ45 } from '@/market/lq45'
import { idxMood, MOOD_DEFENSIVE, moodSeries, type IdxMood, type MoodLight } from '@/market/mood'
import { loadScanLog, recordScan, saveScanLog, scanChanges, type ScanMarket } from '@/market/scanLog'
import { href } from '@/routes'
import { useSettings } from '@/settings'
import { useStore } from '@/store'
import type { I18n, Key } from '@/types'
import { ENV_KEY } from '@/useCryptoMarket'
import { useSummary } from '@/useSummary'
import { ChartPanel, type Timeframe } from './ChartPanel'
import { ArbNote, ExpectedRange } from './RiskNotes'
import { ShortView } from './ShortView'
import { WatchButton } from '@/components/WatchButton'
import { useWatchlist, withWatched } from '@/watchlist'

const TIME_STOP_DAYS = 56 // ~8 weeks (NOTES.md)
const SCAN_CONCURRENCY = 4
/** Fewer backtest trades than this is too small a sample to lean on. */
const MIN_TRADES = 10
const primary = 'font-label text-xs uppercase shadow-[0_3px_0_var(--accent-deep)] active:translate-y-0.5 active:shadow-none'
const LIGHT_CLASS: Record<MoodLight, string> = { red: 'text-down', yellow: 'text-warn-text', green: 'text-up' }

/** Everything that differs between the stock and crypto scanners; the rules themselves live in indicators.ts. */
interface Market {
  id: ScanMarket
  rules: MarketRules
  available: boolean
  fetch: (symbol: string) => Promise<{ name?: string; bars: Bar[] }>
  /** Index for the mood's trend and calm parts. */
  index: string
  indexName: string
  list: readonly string[]
  listName: string
  /** Where the list comes from, shown under the scan. */
  listNote: Key
  /** Candles at another bar size for the chart; `daily` is the history already loaded. */
  frame: (symbol: string, tf: Exclude<Timeframe, '1d'>, daily: Bar[]) => Promise<Bar[]>
  symbol: RegExp
  example: string
  /** Price as text. */
  price: (f: I18n, n: number) => string
  /** Average daily traded value as text. */
  value: (f: I18n, n: number) => string
}

const usd = (f: I18n, n: number) => `$${n.toLocaleString(f.locale, n >= 1e4 ? { maximumFractionDigits: 0 } : { maximumSignificantDigits: 5 })}`
const MARKETS: Record<ScanMarket, Market> = {
  idx: {
    id: 'idx',
    rules: IDX_RULES,
    available: IDX_AVAILABLE,
    fetch: fetchHistory,
    index: '^JKSE',
    indexName: 'IHSG',
    list: LQ45,
    listName: 'LQ45',
    listNote: 'scan.listSource',
    // Hourly from the idx CLI (4-hour built from it); weekly and monthly from the 5 years of daily bars already loaded.
    frame: async (symbol, tf, daily) => (tf === '1h' ? fetchHourly(symbol) : tf === '4h' ? to4h(await fetchHourly(symbol)) : tf === '1w' ? toWeekly(daily) : toMonthly(daily)),
    symbol: /^[A-Z]{4}$/,
    example: 'BBCA',
    price: (f, n) => f.money(n),
    value: (f, n) => `${f.money(n / 1e9)} bn`,
  },
  crypto: {
    id: 'crypto',
    rules: CRYPTO_RULES,
    available: true,
    fetch: fetchCryptoHistory,
    index: 'BTC',
    indexName: 'BTC',
    // Replaced by the live top-by-market-cap list once MarketView loads it (see withCoins).
    list: FIXED_LIST.coins,
    listName: `Top ${FIXED_LIST.coins.length}`,
    listNote: 'scan.listSource.cryptoFixed',
    // Binance has every bar size natively, with more history than building weekly/monthly from 1,000 days.
    frame: (symbol, tf) => fetchCryptoFrame(symbol, tf),
    symbol: COIN,
    example: 'BTC',
    price: usd,
    value: (f, n) => `$${n.toLocaleString(f.locale, { notation: 'compact', maximumFractionDigits: 1 })}`,
  },
}

interface Result {
  symbol: string
  name?: string
  bars: Bar[]
  check: Check
}
type Load = { status: 'idle' } | { status: 'loading' } | { status: 'error'; error: IdxError } | ({ status: 'done' } & Result)
type ScanRow = Result | { symbol: string; error: IdxError }
interface Scan {
  rows: ScanRow[]
  running: boolean
  index?: Bar[]
}

const errorOf = (e: unknown): IdxError => (e instanceof IdxFetchError ? e.code : 'fetch-failed')
const isResult = (r: ScanRow): r is Result => 'check' in r

async function load(m: Market, symbol: string): Promise<Result> {
  const { name, bars } = await m.fetch(symbol)
  const check = checkSetup(bars, { rules: m.rules })
  if (!check) throw new IdxFetchError('not-found')
  return { symbol, name, bars, check }
}

// Kept outside React so the last check, scans and chosen market survive page switches.
const lastCheck: Record<ScanMarket, Load> = { idx: { status: 'idle' }, crypto: { status: 'idle' } }
const lastScan: Partial<Record<ScanMarket, Scan>> = {}
const TAB_KEY = 'mercury.scanner.market'
const MODE_KEY = 'mercury.scanner.mode'
/** Holding time: the 3–6 month swing rules, or the short-term rules (src/market/shortSwing.ts). */
type Mode = 'swing' | 'month' | 'week'
const MODES: readonly Mode[] = ['swing', 'month', 'week']
function initialMarket(): ScanMarket {
  try {
    if (localStorage.getItem(TAB_KEY) === 'crypto') return 'crypto'
  } catch {
    // Storage blocked: start on the default.
  }
  return IDX_AVAILABLE ? 'idx' : 'crypto'
}
function initialMode(): Mode {
  try {
    const v = localStorage.getItem(MODE_KEY) as Mode | null
    return v && MODES.includes(v) ? v : 'swing'
  } catch {
    return 'swing'
  }
}

export function Scanner() {
  const { t } = useI18n()
  const [marketId, setMarketId] = useState(initialMarket)
  const [mode, setMode] = useState(initialMode)
  const m = MARKETS[marketId]
  const save = (key: string, v: string) => {
    try {
      localStorage.setItem(key, v)
    } catch {
      // Storage blocked: the choice lasts this visit only.
    }
  }
  const pick = (id: ScanMarket) => {
    setMarketId(id)
    save(TAB_KEY, id)
  }
  const pickMode = (v: Mode) => {
    setMode(v)
    save(MODE_KEY, v)
  }
  const tab = (on: boolean) =>
    `rounded px-3 py-1.5 font-label text-xs uppercase focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${on ? 'bg-primary text-primary-foreground' : 'text-text-muted hover:bg-surface-2 hover:text-text'}`

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-5xl leading-none uppercase">{t('scan.title')}</h1>
          <div className="flex flex-wrap gap-2">
            <div role="group" aria-label={t('short.styleLabel')} className="flex gap-1 rounded-md border border-border p-1">
              {MODES.map((id) => (
                <button key={id} type="button" aria-pressed={id === mode} onClick={() => pickMode(id)} className={tab(id === mode)}>
                  {t(`scan.mode.${id}`)}
                </button>
              ))}
            </div>
            <div role="group" aria-label={t('scan.title')} className="flex gap-1 rounded-md border border-border p-1">
              {(['idx', 'crypto'] as const).map((id) => (
                <button key={id} type="button" aria-pressed={id === marketId} onClick={() => pick(id)} className={tab(id === marketId)}>
                  {t(`scan.market.${id}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-2 text-sm text-text-muted">{t(mode === 'swing' ? 'scan.intro' : `short.intro.${mode}`)}</p>
      </Card>
      {!m.available ? (
        <Card>
          <p className="text-sm">{t('scan.localOnly')}</p>
        </Card>
      ) : mode === 'swing' ? (
        <MarketView key={m.id} m={m} />
      ) : (
        <ShortView key={`${m.id}:${mode}`} mk={m.id} styleId={mode} />
      )}
    </>
  )
}

// The crypto coin list in use this visit (live top by market cap, or the fixed fallback).
let lastCoins: CoinList | undefined
/** The crypto market with its coin list swapped in. */
const withCoins = (m: Market, c: CoinList | undefined): Market =>
  !c ? m : { ...m, list: c.coins, listName: `Top ${c.coins.length}`, listNote: c.source === 'mcap' ? 'scan.listSource.crypto' : 'scan.listSource.cryptoFixed' }

/** One market's mood, ticker check and scan. Keyed by market, so switching starts from that market's saved state. */
function MarketView({ m: base }: { m: Market }) {
  const cgKey = useSettings((s) => s.coingeckoKey) || ENV_KEY
  const [coins, setCoins] = useState(() => (base.id === 'crypto' ? (lastCoins ?? cachedCoinList()) : undefined))
  const watch = useWatchlist(base.id).list
  const m = useMemo(() => {
    const mm = withCoins(base, coins)
    return { ...mm, list: withWatched(mm.list, watch) }
  }, [base, coins, watch])
  const [check, setCheckState] = useState(lastCheck[m.id])
  const setCheck = (l: Load) => setCheckState((lastCheck[m.id] = l))
  const run = async (symbol: string) => {
    setCheck({ status: 'loading' })
    try {
      setCheck({ status: 'done', ...(await load(m, symbol)) })
    } catch (e) {
      setCheck({ status: 'error', error: errorOf(e) })
    }
  }

  const [scan, setScanState] = useState(lastScan[m.id])
  const publish = (s: Scan) => setScanState((lastScan[m.id] = s))
  const startScan = async () => {
    const rows: ScanRow[] = []
    let index: Bar[] | undefined
    publish({ rows, running: true })
    let list = m.list
    if (m.id === 'crypto') {
      const c = await loadCoinList(cgKey)
      setCoins((lastCoins = c))
      list = withWatched(c.coins, watch)
    }
    try {
      index = (await m.fetch(m.index)).bars
    } catch {
      // Mood falls back to breadth only.
    }
    let next = 0
    // A few calls at a time; the dev server caches IDX tickers until the close.
    const worker = async () => {
      while (next < list.length) {
        const symbol = list[next++]
        try {
          rows.push(await load(m, symbol))
        } catch (e) {
          rows.push({ symbol, error: errorOf(e) })
        }
        publish({ rows: [...rows], running: true, index })
      }
    }
    await Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker))
    publish({ rows: [...rows], running: false, index })
    const ok = rows.filter(isResult)
    if (ok.length) {
      const date = ok.map((r) => r.bars[r.bars.length - 1].time).sort().at(-1)!
      const pick = (f: (c: Check) => boolean) => ok.filter((r) => f(r.check)).map((r) => r.symbol).sort()
      const defensive = idxMood(index ?? [], ok.map((r) => r.bars))?.light === 'red'
      const passing = defensive ? [] : pick((c) => c.score === c.rules.length)
      saveScanLog(recordScan(loadScanLog(m.id), { date, passing, inZone: pick((c) => c.zone === 'in') }), m.id)
    }
  }

  // Opening a market runs its scan once per visit; after 16:30 WIB the dev server fetches the IDX day's final bars.
  useEffect(() => {
    if (!lastScan[m.id]) void startScan()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount; the component is keyed by market
  }, [])

  const mood = useMemo(() => (scan && !scan.running ? idxMood(scan.index ?? [], scan.rows.filter(isResult).map((r) => r.bars)) : undefined), [scan])
  // Mood filter (live rule since 2026-11-14): no new buys while the market mood is Defensive, today and in the backtest.
  const filter = useMemo<MoodFilter>(() => {
    const series = scan && !scan.running ? moodSeries(scan.index ?? [], scan.rows.filter(isResult).map((r) => r.bars)) : undefined
    return { defensive: mood?.light === 'red', skip: series && ((d: string) => (series.get(d) ?? 100) < MOOD_DEFENSIVE) }
  }, [scan, mood])

  return (
    <>
      <MoodCard m={m} mood={mood} running={!!scan?.running} />
      <TickerCheck m={m} load={check} onCheck={run} filter={filter} />
      <ScanCard m={m} scan={scan} defensive={filter.defensive} onStart={() => void startScan()} onPick={(s) => void run(s)} />
      <RulesTest m={m} scan={scan} />
    </>
  )
}

const VARIANT_IDS = ['live', 'target3', 'stop2', 'noMacd', 'noMacd3', 'mood', 'trail', 'noMacdMood', 'noMacdTrail', 'noMacdMoodTrail'] as const
type VariantId = (typeof VARIANT_IDS)[number]
/** Trailing stop distance, in ATRs. */
const TRAIL_ATR = 3
/** Settings the rules test compares; 'mood' is what the scanner uses today. mood = skip signals while the market mood was Defensive. */
const VARIANTS: { id: VariantId; stop?: number; mood?: boolean; opts: BacktestOptions }[] = [
  { id: 'live', opts: {} },
  { id: 'target3', opts: { targetR: 3 } },
  { id: 'stop2', stop: 2, opts: {} },
  { id: 'noMacd', opts: { requireMacd: false } },
  { id: 'noMacd3', opts: { requireMacd: false, targetR: 3 } },
  { id: 'mood', mood: true, opts: {} },
  { id: 'trail', opts: { trailAtr: TRAIL_ATR } },
  { id: 'noMacdMood', mood: true, opts: { requireMacd: false } },
  { id: 'noMacdTrail', opts: { requireMacd: false, trailAtr: TRAIL_ATR } },
  { id: 'noMacdMoodTrail', mood: true, opts: { requireMacd: false, trailAtr: TRAIL_ATR } },
]
type RulesTestResult = { id: VariantId; bt: Backtest }[]
const lastRulesTest: Partial<Record<ScanMarket, RulesTestResult>> = {}

/** Every setting variant backtested over every scanned ticker, trades pooled into one result per variant. */
function RulesTest({ m, scan }: { m: Market; scan?: Scan }) {
  const { t, num } = useI18n()
  const [result, setResult] = useState(lastRulesTest[m.id])
  const [progress, setProgress] = useState<number>()
  const tickers = scan && !scan.running ? scan.rows.filter(isResult) : []
  const u = { u: m.listName }
  const signed = (x: number | undefined, d = 2) => (x === undefined ? '—' : `${x >= 0 ? '+' : '−'}${num(Math.abs(x), d)}`)

  const run = async () => {
    const trades = Object.fromEntries(VARIANT_IDS.map((id) => [id, [] as Trade[]])) as Record<VariantId, Trade[]>
    // The mood as it was on each day; a day with no score (early history) counts as not Defensive.
    const mood = moodSeries(scan?.index ?? [], tickers.map((r) => r.bars))
    const defensive = (d: string) => (mood.get(d) ?? 100) < 35
    for (let k = 0; k < tickers.length; k++) {
      setProgress(k)
      await new Promise((r) => setTimeout(r)) // let the page repaint between tickers
      for (const v of VARIANTS) {
        const rules = v.stop ? { ...m.rules, maxAtrStop: v.stop } : m.rules
        trades[v.id].push(...backtest(tickers[k].bars, rules, v.mood ? { ...v.opts, skip: defensive } : v.opts).trades)
      }
    }
    const r = VARIANTS.map((v) => ({ id: v.id, bt: summarize(trades[v.id]) }))
    setResult((lastRulesTest[m.id] = r))
    setProgress(undefined)
  }

  return (
    <Card>
      <CardTitle icon="chest" aside={t('rt.sub', { ...u, n: tickers.length })}>
        {t('rt.title')}
      </CardTitle>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button onClick={() => void run()} disabled={!tickers.length || progress !== undefined} className={primary}>
          {progress !== undefined ? t('rt.running', { n: progress, total: tickers.length }) : t('rt.run', u)}
        </Button>
        {!tickers.length && <span className="text-sm text-text-muted">{t('rt.needScan')}</span>}
      </div>
      {result && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left">
              <tr>
                {(['rt.col.settings', 'rt.col.trades', 'rt.col.win', 'rt.col.avgR', 'rt.col.totalR', 'rt.col.streak'] as const).map((k) => (
                  <th key={k} className="px-2 py-1.5 font-label text-[11px] font-normal text-text-muted uppercase">
                    {t(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.map(({ id, bt }) => (
                <tr key={id} className={id === 'mood' ? 'bg-accent-soft/40' : undefined}>
                  <td className="px-2 py-1.5">
                    {t(`rt.v.${id}`)} {id === 'mood' && <Badge tone="paper">{t('rt.current')}</Badge>}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{bt.trades.length}</td>
                  <td className="px-2 py-1.5 font-mono">{bt.winRate === undefined ? '—' : `${num(bt.winRate)}%`}</td>
                  <td className={`px-2 py-1.5 font-mono ${bt.avgR === undefined ? '' : bt.avgR > 0 ? 'text-up' : 'text-down'}`}>{signed(bt.avgR)}R</td>
                  <td className="px-2 py-1.5 font-mono">{signed(bt.totalR, 1)}R</td>
                  <td className="px-2 py-1.5 font-mono">{bt.worstStreak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-text-muted">{t('rt.note')}</p>
    </Card>
  )
}

/** defensive = today's mood is Defensive; skip = was a past day Defensive (undefined until the scan has run). */
interface MoodFilter {
  defensive: boolean
  skip?: (date: string) => boolean
}

/** Names used by the shared mood strings. */
const moodVars = (m: Market) => ({ m: m.id === 'idx' ? 'IDX' : 'Crypto', u: m.listName, i: m.indexName })

function MoodCard({ m, mood, running }: { m: Market; mood?: IdxMood; running: boolean }) {
  const { t, num } = useI18n()
  const v = moodVars(m)
  const part = (x: number | undefined) => (x === undefined ? '—' : `${num(x)}/100`)
  return (
    <Card>
      <CardTitle icon="heart" aside={t('mood.idx.source', v)}>
        {t('mood.idx.title', v)}
      </CardTitle>
      {!mood ? (
        <p className="text-sm text-text-muted">{running ? t('mood.idx.waiting', v) : '—'}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <div className={`font-display text-5xl leading-none ${LIGHT_CLASS[mood.light]}`}>{mood.score}</div>
            <div className={`font-label text-[11px] uppercase ${LIGHT_CLASS[mood.light]}`}>● {t(`mood.idx.${mood.light}`)}</div>
          </div>
          <dl className="grid flex-1 grid-cols-1 gap-1 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-text-muted">{t('mood.idx.breadth', v)}</dt>
              <dd className="font-mono">
                {part(mood.breadth)} · {t('mood.idx.breadthNote', { n: mood.above, total: mood.counted })}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{t('mood.idx.trend', v)}</dt>
              <dd className="font-mono">{part(mood.trend)}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{t('mood.idx.calm', v)}</dt>
              <dd className="font-mono">{part(mood.calm)}</dd>
            </div>
          </dl>
          <p className="w-full text-sm">{t(`mood.idx.advice.${mood.light}`)}</p>
        </div>
      )}
    </Card>
  )
}

function ErrorText({ m, error }: { m: Market; error: IdxError }) {
  const { t } = useI18n()
  return (
    <p role="alert" className="text-sm text-down">
      {error === 'bad-symbol' && m.id === 'crypto' ? t('scan.err.bad-coin') : t(`scan.err.${error}`)}
      {error === 'idx-missing' && <code className="ml-1 rounded bg-surface-2 px-1 font-mono text-text">npm install -g ihsg-cli</code>}
    </p>
  )
}

function TickerCheck({ m, load, onCheck, filter }: { m: Market; load: Load; onCheck: (s: string) => Promise<void>; filter: MoodFilter }) {
  const { t } = useI18n()
  const [symbol, setSymbol] = useState(load.status === 'done' ? load.symbol : m.example)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void onCheck(symbol.trim().toUpperCase())
  }
  return (
    <Card>
      <CardTitle icon="chartUp">{t('scan.check')}</CardTitle>
      <form onSubmit={submit} className="mb-4 flex gap-2">
        <input
          aria-label={t('scan.ticker')}
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          maxLength={m.id === 'idx' ? 4 : 10}
          pattern={m.symbol.source.slice(1, -1)}
          required
          className={`${fieldClass} max-w-32 font-mono uppercase`}
        />
        <Button type="submit" disabled={load.status === 'loading'} className={primary}>
          {load.status === 'loading' ? t('scan.loading') : t('scan.run')}
        </Button>
      </form>
      {load.status === 'error' && <ErrorText m={m} error={load.error} />}
      {load.status === 'done' && <CheckResult m={m} r={load} filter={filter} />}
    </Card>
  )
}

function CheckResult({ m, r, filter }: { m: Market; r: Result; filter: MoodFilter }) {
  const f = useI18n()
  const { t, num, day } = f
  const price = (n: number | undefined) => (n === undefined ? '—' : m.price(f, n))
  const c = r.check
  const last = r.bars[r.bars.length - 1].time
  const timeStop = new Date(`${last}T00:00:00Z`)
  timeStop.setUTCDate(timeStop.getUTCDate() + TIME_STOP_DAYS)
  const bt = useMemo(() => backtest(r.bars, m.rules, { skip: filter.skip }), [r.bars, m.rules, filter.skip])
  const detail: Record<Rule['id'], string> = {
    weeklyTrend: t('rule.weeklyTrend.d'),
    ma50over200: c.ma50 !== undefined && c.ma200 !== undefined ? `MA50 ${price(c.ma50)} · MA200 ${price(c.ma200)}` : t('rule.short'),
    closeOverMa50: c.ma50 !== undefined ? `${price(c.close)} vs ${price(c.ma50)}` : t('rule.short'),
    macdCross: c.crossAgo !== undefined ? t('rule.macdCross.ago', { n: c.crossAgo }) : t('rule.macdCross.none', { n: CROSS_LOOKBACK }),
    liquidity: t('rule.liquidity.d', { v: m.value(f, c.avgValue), min: m.value(f, m.rules.minValue) }),
  }
  const levels = useMemo(
    () => ({
      zone: c.buyZone,
      stop: c.stop,
      targets: [
        ...(c.target2 !== undefined ? [{ price: c.target2, title: '2R' }] : []),
        ...(c.target3 !== undefined ? [{ price: c.target3, title: '3R' }] : []),
      ],
    }),
    [c],
  )
  const years = Math.round((Date.parse(last) - Date.parse(r.bars[0].time)) / (365.25 * 864e5))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display text-4xl leading-none">{r.symbol}</span>
            <WatchButton market={m.id} symbol={r.symbol} />
          </div>
          <div className="text-sm text-text-muted">
            {r.name} · {price(c.close)} · {day(last)}
          </div>
        </div>
        <div className="text-right">
          <Label>{t('scan.score')}</Label>
          <div className="font-display text-5xl leading-none">
            {c.score}/{c.rules.length}
          </div>
        </div>
      </div>

      {filter.defensive && c.zone !== 'none' && (
        <p role="status" className="rounded-md border border-down px-3 py-2 text-sm text-down">
          {t('mood.idx.redWarning', moodVars(m))}
        </p>
      )}

      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {c.rules.map((rule) => (
          <li key={rule.id} className="flex flex-wrap items-center gap-x-3 px-3 py-2 text-sm">
            <span className={`w-14 shrink-0 font-label text-[11px] uppercase ${rule.pass ? 'text-up' : rule.pass === false ? 'text-down' : 'text-text-muted'}`}>
              {rule.pass ? `✓ ${t('rule.pass')}` : rule.pass === false ? `✗ ${t('rule.fail')}` : `? ${t('rule.unknown')}`}
            </span>
            <span className="flex-1">{t(`rule.${rule.id}`)}</span>
            <span className="w-full pl-[4.25rem] font-mono text-xs text-text-muted sm:w-auto sm:pl-0">{detail[rule.id]}</span>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          label={t('scan.buyZone')}
          value={c.refZone ? `${price(c.refZone.low)}–${price(c.refZone.high)}` : '—'}
          note={c.zone === 'extended' ? t('scan.zone.extended', { p: price(c.entry) }) : t(c.zone === 'none' && c.refZone ? 'scan.zone.notIdeal' : `scan.zone.${c.zone}`)}
        />
        <Stat label={t('scan.stop')} value={price(c.stop)} note={c.risk !== undefined ? `−${num((c.risk / c.entry) * 100, 1)}% · ${t('scan.stopRule')}` : undefined} />
        <Stat label={t('scan.target2')} value={price(c.target2)} note={c.target2 !== undefined ? t('scan.fromEntry', { p: price(c.entry) }) : undefined} />
        <Stat label={t('scan.target3')} value={price(c.target3)} />
        <Stat label={t('scan.timeStop')} value={day(timeStop.toISOString().slice(0, 10))} note={t('scan.timeStopNote')} />
      </div>

      {m.id === 'idx' && <ArbNote entry={c.entry} stop={c.stop} price={(n) => m.price(f, n)} />}
      <ExpectedRange daily={r.bars} horizons={m.id === 'idx' ? [5, 20, 60] : [7, 30, 90]} price={(n) => m.price(f, n)} entry={c.entry} stop={c.stop} />
      <div className="flex flex-col items-stretch gap-3 rounded-md bg-surface-2 px-3 py-2 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex-1">
          <Label>{t('bt.title', { y: years })}</Label>
          {bt.trades.length === 0 ? (
            <p className="text-sm">{t('bt.none')}</p>
          ) : (
            <p className="font-mono text-sm">
              {t('bt.summary', { n: bt.trades.length, win: num(bt.winRate!), r: `${bt.avgR! >= 0 ? '+' : '−'}${num(Math.abs(bt.avgR!), 2)}` })}
            </p>
          )}
          <p className="text-xs text-text-muted">
            {bt.trades.length > 0 && bt.trades.length < MIN_TRADES && `${t('bt.small')} `}
            {t('bt.rules')} {t(filter.skip ? 'bt.moodSkip' : 'bt.moodPending')}
          </p>
        </div>
        <PaperTrade m={m} r={r} defensive={filter.defensive} />
      </div>
      <Explain
        title={`${r.symbol} (${r.name}) ${m.id === 'idx' ? 'IDX stock' : 'crypto'} swing setup check (3–6 month hold), ${c.score}/${c.rules.length} rules pass, close ${price(c.close)} on ${last}`}
        facts={[
          ...c.rules.map((rule) => factLine(rule.pass, t(`rule.${rule.id}`), detail[rule.id])),
          ...(filter.defensive ? [t('mood.idx.redWarning', moodVars(m))] : []),
          `${t('scan.buyZone')}: ${c.refZone ? `${price(c.refZone.low)}–${price(c.refZone.high)}` : '—'} (${c.zone})`,
          `${t('scan.stop')}: ${price(c.stop)}${c.risk !== undefined ? ` (−${num((c.risk / c.entry) * 100, 1)}% from entry ${price(c.entry)})` : ''}`,
          `${t('scan.target2')}: ${price(c.target2)} · ${t('scan.target3')}: ${price(c.target3)}`,
          `${t('scan.timeStop')}: ${day(timeStop.toISOString().slice(0, 10))}`,
          `${t('bt.title', { y: years })}: ${
            bt.trades.length === 0
              ? t('bt.none')
              : `${t('bt.summary', { n: bt.trades.length, win: num(bt.winRate!), r: `${bt.avgR! >= 0 ? '+' : '−'}${num(Math.abs(bt.avgR!), 2)}` })}${bt.trades.length < MIN_TRADES ? ` ${t('bt.small')}` : ''}`
          }`,
        ]}
      />

      <ChartPanel
        symbol={r.symbol}
        daily={r.bars}
        levels={levels}
        step={m.rules.step(c.close)}
        price={price}
        loadFrame={(tf) => m.frame(r.symbol, tf, r.bars)}
        cacheKey={`${m.id}:${r.symbol}:${last}`}
      />
      {m.id === 'idx' && <p className="text-xs text-text-muted">{t('scan.backtestLater')}</p>}
    </div>
  )
}

/** Adds the setup to Portfolio → Trading as a paper trade, sized so a stop-out loses the per-trade risk limit. */
function PaperTrade({ m, r, defensive }: { m: Market; r: Result; defensive: boolean }) {
  const f = useI18n()
  const { t, num, qty } = f
  const { netWorth } = useSummary()
  const tradeLimit = useSettings((s) => s.tradeLimit)
  const usdIdr = useSettings((s) => s.usdIdr)
  const addHolding = useStore((s) => s.addHolding)
  const addTransaction = useStore((s) => s.addTransaction)
  const c = r.check
  const crypto = m.id === 'crypto'
  // Net worth is in rupiah; crypto prices are in USDT (≈ USD), so convert the capital first.
  const capital = crypto ? (usdIdr ? netWorth / usdIdr : 0) : netWorth
  const units = c.stop !== undefined ? positionSize({ capital, riskPct: tradeLimit, entry: c.entry, stop: c.stop, lot: crypto ? undefined : IDX_LOT }) : 0
  const why = c.zone !== 'in' ? t('paper.notInZone') : defensive ? t('paper.defensive') : crypto && !usdIdr ? t('paper.needFx') : units === 0 ? t('paper.tooSmall') : undefined
  const p = m.price(f, c.entry)

  const add = () => {
    const now = new Date().toISOString()
    const id = addHolding({
      assetClass: crypto ? 'crypto' : 'idx_stock',
      group: 'trading',
      symbol: r.symbol,
      name: r.name,
      platform: 'Paper',
      currency: crypto ? 'USD' : 'IDR',
      paper: true,
      stop: c.stop,
      target: c.target2,
      manualPrice: c.close,
      manualPriceAt: now,
      note: t('paper.note', { score: c.score, total: c.rules.length }),
    })
    addTransaction({ holdingId: id, type: 'buy', date: now, quantity: units, price: c.entry, fee: 0 })
    location.hash = href('portfolio')
  }

  return (
    <div className="flex flex-col gap-1 sm:max-w-64">
      <Button onClick={add} disabled={!!why} className={primary}>
        {t('paper.button')}
      </Button>
      <span className="text-xs text-text-muted">
        {why ?? (crypto ? t('paper.sizeCoin', { q: qty(units), s: r.symbol, p, risk: tradeLimit }) : t('paper.size', { lots: num(units / IDX_LOT), p, risk: tradeLimit }))}
      </span>
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <Label>{label}</Label>
      <div className="font-mono text-lg">{value}</div>
      {note && <div className="text-xs text-text-muted">{note}</div>}
    </div>
  )
}

function ScanCard({ m, scan, defensive, onStart, onPick }: { m: Market; scan?: Scan; defensive: boolean; onStart: () => void; onPick: (s: string) => void }) {
  const f = useI18n()
  const { t, day } = f
  const price = (n: number | undefined) => (n === undefined ? '—' : m.price(f, n))
  const ok = (scan?.rows.filter(isResult) ?? []).sort((a, b) => b.check.score - a.check.score || a.symbol.localeCompare(b.symbol))
  const failed = scan?.rows.filter((r) => !isResult(r)) ?? []
  const passing = ok.filter((r) => r.check.score === r.check.rules.length).length
  const missing = failed.find((r) => 'error' in r && r.error === 'idx-missing')
  const changes = scan && !scan.running ? scanChanges(loadScanLog(m.id)) : undefined
  const list = (xs: string[]) => (xs.length ? xs.join(', ') : '—')
  const u = { u: m.listName }
  const columns: Key[] = ['scan.ticker', 'scan.score', 'scan.close', 'scan.buyZone', 'scan.stop', 'scan.target2']
  const watched = useWatchlist(m.id).list

  return (
    <Card>
      <CardTitle icon="star" aside={scan && t('scan.progress', { n: scan.rows.length, total: m.list.length })}>
        {t('scan.lq45', u)}
      </CardTitle>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button onClick={onStart} disabled={scan?.running} className={primary}>
          {scan?.running ? t('scan.loading') : t('scan.runAll', u)}
        </Button>
        {scan && <span className="text-sm">{defensive ? t('scan.passingDefensive', { n: passing }) : t('scan.passing', { n: passing })}</span>}
      </div>
      {missing && 'error' in missing && <ErrorText m={m} error={missing.error} />}
      {changes && (
        <div className="mb-3 rounded-md bg-surface-2 px-3 py-2 text-sm">
          <Label>{t('scan.changes', { d: day(changes.since) })}</Label>
          <p>
            {t('scan.newPassing')}: <span className="font-mono">{list(changes.newPassing)}</span> · {t('scan.lostPassing')}:{' '}
            <span className="font-mono">{list(changes.lostPassing)}</span>
          </p>
          <p>
            {t('scan.newInZone')}: <span className="font-mono">{list(changes.newInZone)}</span> · {t('scan.leftZone')}:{' '}
            <span className="font-mono">{list(changes.leftZone)}</span>
          </p>
        </div>
      )}
      {ok.length > 0 && (
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
              {ok.map((r) => (
                <tr key={r.symbol}>
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => onPick(r.symbol)} className="font-mono underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      {r.symbol}
                    </button>
                    {watched.includes(r.symbol) && <span className="ml-1 text-warn-text" title={t('watch.on')}>★</span>}
                  </td>
                  <td className="px-2 py-1.5 font-mono">
                    {r.check.score}/{r.check.rules.length} {r.check.score === r.check.rules.length && !defensive && <Badge tone="paper">{t('scan.pass')}</Badge>}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{price(r.check.close)}</td>
                  <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                    {r.check.refZone ? `${price(r.check.refZone.low)}–${price(r.check.refZone.high)} ` : '—'}
                    {r.check.zone !== 'none' ? (
                      <Badge tone={r.check.zone === 'in' ? 'paper' : 'warn'}>{t(`scan.badge.${r.check.zone}`)}</Badge>
                    ) : (
                      r.check.refZone && <Badge tone="neutral">{t('scan.badge.notIdeal')}</Badge>
                    )}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{price(r.check.stop)}</td>
                  <td className="px-2 py-1.5 font-mono">{price(r.check.target2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!missing && failed.length > 0 && <p className="mt-2 text-xs text-text-muted">{t('scan.failed', { list: failed.map((r) => r.symbol).join(', ') })}</p>}
      <p className="mt-3 text-xs text-text-muted">
        {t(m.listNote)} {watched.length > 0 && t('watch.inScan', { s: watched.join(', ') })}
      </p>
    </Card>
  )
}
