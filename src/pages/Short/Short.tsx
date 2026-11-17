import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardTitle, Label, fieldClass } from '@/components/ui-bits'
import { IDX_LOT, positionSize } from '@/domain/portfolio'
import { useI18n } from '@/i18n'
import type { Backtest } from '@/market/backtest'
import { summarize } from '@/market/backtest'
import { COIN, fetchCryptoFrame, fetchCryptoHistory } from '@/market/binance'
import { loadCoinList } from '@/market/cryptoList'
import { fetchHistory, fetchHourly, IDX_AVAILABLE, IdxFetchError, type IdxError } from '@/market/idx'
import { to4h, toMonthly, toWeekly, type Bar } from '@/market/indicators'
import { LQ45 } from '@/market/lq45'
import { idxMood, MOOD_DEFENSIVE, moodSeries, type IdxMood } from '@/market/mood'
import { clearShortCache, loadShort, type ShortData } from '@/market/shortData'
import {
  MAX_ATR_STOP,
  SHORT_CRYPTO,
  SHORT_IDX,
  shortBacktest,
  shortCheck,
  STYLES,
  SWING_BARS,
  TARGET_R,
  type ShortBacktestOptions,
  type ShortCheck,
  type ShortMarket,
  type ShortMarketRules,
  type ShortRuleId,
  type StyleId,
} from '@/market/shortSwing'
import { href } from '@/routes'
import { useSettings } from '@/settings'
import { useStore } from '@/store'
import type { I18n, Key } from '@/types'
import { ENV_KEY } from '@/useCryptoMarket'
import { useSummary } from '@/useSummary'
import { ChartPanel } from '../Scanner/ChartPanel'
import { frameCache } from '../Scanner/frameCache'

const primary = 'font-label text-xs uppercase shadow-[0_3px_0_var(--accent-deep)] active:translate-y-0.5 active:shadow-none'
const SCAN_CONCURRENCY = 4
const MIN_TRADES = 10
const RULES: Record<ShortMarket, ShortMarketRules> = { idx: SHORT_IDX, crypto: SHORT_CRYPTO }
const INDEX: Record<ShortMarket, string> = { idx: '^JKSE', crypto: 'BTC' }
const MARKET_KEY = 'mercury.short.market'
const STYLE_KEY = 'mercury.short.style'

const usd = (f: I18n, n: number) => `$${n.toLocaleString(f.locale, n >= 1e4 ? { maximumFractionDigits: 0 } : { maximumSignificantDigits: 5 })}`
const priceOf = (mk: ShortMarket, f: I18n) => (n: number | undefined) => (n === undefined ? '—' : mk === 'idx' ? f.money(n) : usd(f, n))
const valueOf = (mk: ShortMarket, f: I18n, n: number) => (mk === 'idx' ? `${f.money(n / 1e9)} bn` : `$${n.toLocaleString(f.locale, { notation: 'compact', maximumFractionDigits: 1 })}`)
const errorOf = (e: unknown): IdxError => (e instanceof IdxFetchError ? e.code : 'fetch-failed')
const WIB_MS = 7 * 3600_000

function stored<T extends string>(key: string, ok: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null
    return v && ok.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}
function store(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    // Storage blocked: the choice lasts this visit only.
  }
}

interface Row {
  symbol: string
  data: ShortData
  check: ShortCheck
}
type ScanRow = Row | { symbol: string; error: IdxError }
const isRow = (r: ScanRow): r is Row => 'check' in r
interface Scan {
  rows: ScanRow[]
  running: boolean
  list: readonly string[]
  index?: Bar[]
}
// Kept outside React so scans survive page switches during a visit.
const lastScan: Partial<Record<string, Scan>> = {}

/** buy = every rule passes and the mood allows; paused = would buy but the mood is Defensive; wait = trend ok, no trigger yet. */
type Status = 'buy' | 'paused' | 'wait' | 'none'
const TREND_IDS: ShortRuleId[] = ['trend', 'stack', 'big']
function statusOf(c: ShortCheck, defensive: boolean): Status {
  if (c.signal) return defensive ? 'paused' : 'buy'
  return c.rules.filter((r) => TREND_IDS.includes(r.id)).every((r) => r.pass) ? 'wait' : 'none'
}
const STATUS_ORDER: Record<Status, number> = { buy: 0, paused: 1, wait: 2, none: 3 }

export function Short() {
  const { t } = useI18n()
  const [mk, setMk] = useState<ShortMarket>(() => stored(MARKET_KEY, ['idx', 'crypto'], IDX_AVAILABLE ? 'idx' : 'crypto'))
  const [styleId, setStyleId] = useState<StyleId>(() => stored(STYLE_KEY, ['week', 'month'], 'week'))
  const tabs = <T extends string>(ids: readonly T[], cur: T, pick: (v: T) => void, label: (v: T) => string, aria: string) => (
    <div role="group" aria-label={aria} className="flex gap-1 rounded-md border border-border p-1">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={id === cur}
          onClick={() => pick(id)}
          className={`rounded px-3 py-1.5 font-label text-xs uppercase focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${id === cur ? 'bg-primary text-primary-foreground' : 'text-text-muted hover:bg-surface-2 hover:text-text'}`}
        >
          {label(id)}
        </button>
      ))}
    </div>
  )

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-5xl leading-none uppercase">{t('short.title')}</h1>
          <div className="flex flex-wrap gap-2">
            {tabs(['week', 'month'] as const, styleId, (v) => (setStyleId(v), store(STYLE_KEY, v)), (v) => t(`short.style.${v}`), t('short.styleLabel'))}
            {tabs(['idx', 'crypto'] as const, mk, (v) => (setMk(v), store(MARKET_KEY, v)), (v) => t(`scan.market.${v}`), t('scan.title'))}
          </div>
        </div>
        <p className="mt-2 text-sm text-text-muted">{t(`short.intro.${styleId}`)}</p>
      </Card>
      {mk === 'idx' && !IDX_AVAILABLE ? (
        <Card>
          <p className="text-sm">{t('scan.localOnly')}</p>
        </Card>
      ) : (
        <ShortView key={`${mk}:${styleId}`} mk={mk} styleId={styleId} />
      )}
    </>
  )
}

function ShortView({ mk, styleId }: { mk: ShortMarket; styleId: StyleId }) {
  const { t } = useI18n()
  const style = STYLES[styleId]
  const rules = RULES[mk]
  const key = `${mk}:${styleId}`
  const cgKey = useSettings((s) => s.coingeckoKey) || ENV_KEY
  const [scan, setScanState] = useState(lastScan[key])
  const publish = (s: Scan) => setScanState((lastScan[key] = s))
  const [pick, setPick] = useState<string>()

  const start = async () => {
    clearShortCache()
    frameCache.clear()
    const list = mk === 'idx' ? LQ45 : (await loadCoinList(cgKey)).coins
    const rows: ScanRow[] = []
    let index: Bar[] | undefined
    publish({ rows, running: true, list })
    try {
      index = mk === 'idx' ? (await fetchHistory(INDEX.idx)).bars : (await fetchCryptoHistory(INDEX.crypto)).bars
    } catch {
      // Mood falls back to breadth only.
    }
    let next = 0
    const worker = async () => {
      while (next < list.length) {
        const symbol = list[next++]
        try {
          const data = await loadShort(mk, style, symbol)
          const check = shortCheck(data.daily, data.entry, style, rules)
          rows.push(check ? { symbol, data, check } : { symbol, error: 'not-found' })
        } catch (e) {
          rows.push({ symbol, error: errorOf(e) })
        }
        publish({ rows: [...rows], running: true, list, index })
      }
    }
    await Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker))
    publish({ rows: [...rows], running: false, list, index })
  }

  useEffect(() => {
    if (!lastScan[key]) void start()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount; keyed by market + style
  }, [])

  const done = scan && !scan.running
  const ok = useMemo(() => (scan?.rows.filter(isRow) ?? []), [scan])
  const mood = useMemo(() => (done ? idxMood(scan.index ?? [], ok.map((r) => r.data.daily)) : undefined), [done, scan, ok])
  const series = useMemo(() => (done ? moodSeries(scan.index ?? [], ok.map((r) => r.data.daily)) : undefined), [done, scan, ok])
  const defensive = mood?.light === 'red'
  const skip = useMemo(() => (series ? (d: string) => (series.get(d) ?? 100) < MOOD_DEFENSIVE : undefined), [series])

  return (
    <>
      <MoodLine mk={mk} mood={mood} running={!!scan?.running} />
      <Detail key={pick} mk={mk} styleId={styleId} symbol={pick} onPick={setPick} defensive={defensive} skip={skip} rows={ok} />
      <ScanTable mk={mk} styleId={styleId} scan={scan} defensive={defensive} onStart={() => void start()} onPick={setPick} />
      <RulesTest mk={mk} styleId={styleId} rows={done ? ok : []} skip={skip} />
      <p className="px-1 text-xs text-text-muted">{t('short.note')}</p>
    </>
  )
}

function MoodLine({ mk, mood, running }: { mk: ShortMarket; mood?: IdxMood; running: boolean }) {
  const { t, num } = useI18n()
  const cls = mood?.light === 'red' ? 'text-down' : mood?.light === 'yellow' ? 'text-warn-text' : 'text-up'
  return (
    <Card className="py-3 sm:py-3">
      <p className="text-sm">
        <Label>{t('short.mood')}</Label>{' '}
        {mood ? (
          <>
            <span className={`font-mono ${cls}`}>
              {num(mood.score)} · {t(`mood.idx.${mood.light}`)}
            </span>{' '}
            <span className="text-text-muted">{t(mood.light === 'red' ? 'short.moodRed' : 'short.moodOk', { m: mk === 'idx' ? 'IDX' : 'Crypto' })}</span>
          </>
        ) : (
          <span className="text-text-muted">{running ? t('short.moodWait') : '—'}</span>
        )}
      </p>
    </Card>
  )
}

function ScanTable({ mk, styleId, scan, defensive, onStart, onPick }: { mk: ShortMarket; styleId: StyleId; scan?: Scan; defensive: boolean; onStart: () => void; onPick: (s: string) => void }) {
  const f = useI18n()
  const { t } = f
  const price = priceOf(mk, f)
  const rows = (scan?.rows.filter(isRow) ?? [])
    .map((r) => ({ ...r, status: statusOf(r.check, defensive) }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.check.score - a.check.score || a.symbol.localeCompare(b.symbol))
  const failed = scan?.rows.filter((r) => !isRow(r)) ?? []
  const missing = failed.find((r) => 'error' in r && r.error === 'idx-missing')
  const buys = rows.filter((r) => r.status === 'buy').length
  const listName = mk === 'idx' ? 'LQ45' : `Top ${scan?.list.length ?? 50}`
  const columns: Key[] = ['scan.ticker', 'scan.score', 'short.col.status', 'short.col.entry', 'scan.stop', 'short.col.target']
  const badge: Record<Status, 'paper' | 'warn' | 'neutral'> = { buy: 'paper', paused: 'warn', wait: 'neutral', none: 'neutral' }

  return (
    <Card>
      <CardTitle icon="star" aside={scan && t('scan.progress', { n: scan.rows.length, total: scan.list.length })}>
        {t('short.scanTitle', { u: listName, s: t(`short.style.${styleId}`) })}
      </CardTitle>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button onClick={onStart} disabled={scan?.running} className={primary}>
          {scan?.running ? t('scan.loading') : t('short.rescan')}
        </Button>
        {scan && !scan.running && <span className="text-sm">{defensive ? t('short.buysDefensive', { n: rows.filter((r) => r.status === 'paused').length }) : t('short.buys', { n: buys })}</span>}
      </div>
      {missing && <p className="mb-2 text-sm text-down">{t('scan.err.idx-missing')}</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left">
              <tr>
                {columns.map((k) => (
                  <th key={k} className="px-2 py-1.5 font-label text-[11px] font-normal whitespace-nowrap text-text-muted uppercase">
                    {t(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.symbol}>
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => onPick(r.symbol)} className="font-mono underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      {r.symbol}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 font-mono">
                    {r.check.score}/{r.check.rules.length}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <Badge tone={badge[r.status]}>{t(`short.status.${r.status}`)}</Badge>
                    {r.check.trigger && <span className="ml-1 text-xs text-text-muted">{t(`short.trigger.${r.check.trigger}`)}</span>}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{price(r.check.entry)}</td>
                  <td className="px-2 py-1.5 font-mono">{price(r.check.stop)}</td>
                  <td className="px-2 py-1.5 font-mono">{price(r.check.target)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!missing && failed.length > 0 && <p className="mt-2 text-xs text-text-muted">{t('scan.failed', { list: failed.map((r) => r.symbol).join(', ') })}</p>}
      <p className="mt-3 text-xs text-text-muted">{t('short.tableNote')}</p>
    </Card>
  )
}

type Load = { status: 'idle' } | { status: 'loading' } | { status: 'error'; error: IdxError } | { status: 'done'; row: Row }

/** One ticker: the checklist, levels, its own backtest, the chart and a paper trade. Opened from the table or the input. */
function Detail({
  mk,
  styleId,
  symbol,
  onPick,
  defensive,
  skip,
  rows,
}: {
  mk: ShortMarket
  styleId: StyleId
  symbol?: string
  onPick: (s: string) => void
  defensive: boolean
  skip?: (d: string) => boolean
  rows: Row[]
}) {
  const f = useI18n()
  const { t } = f
  const style = STYLES[styleId]
  const rules = RULES[mk]
  const fromScan = rows.find((r) => r.symbol === symbol)
  const [load, setLoad] = useState<Load>(fromScan ? { status: 'done', row: fromScan } : { status: 'idle' })
  const [input, setInput] = useState(symbol ?? '')
  const pattern = mk === 'idx' ? /^[A-Z]{4}$/ : COIN

  useEffect(() => {
    if (!symbol || fromScan) return
    setLoad({ status: 'loading' })
    loadShort(mk, style, symbol)
      .then((data) => {
        const check = shortCheck(data.daily, data.entry, style, rules)
        setLoad(check ? { status: 'done', row: { symbol, data, check } } : { status: 'error', error: 'not-found' })
      })
      .catch((e: unknown) => setLoad({ status: 'error', error: errorOf(e) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by symbol
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const s = input.trim().toUpperCase()
    if (pattern.test(s)) onPick(s)
  }

  return (
    <Card>
      <CardTitle icon="heart">{t('short.check')}</CardTitle>
      <form onSubmit={submit} className="mb-4 flex flex-wrap gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder={mk === 'idx' ? 'BBCA' : 'BTC'}
          aria-label={t('scan.ticker')}
          className={`${fieldClass} max-w-32 font-mono uppercase`}
        />
        <Button type="submit" disabled={load.status === 'loading'} className={primary}>
          {load.status === 'loading' ? t('scan.loading') : t('scan.run')}
        </Button>
      </form>
      {load.status === 'idle' && <p className="text-sm text-text-muted">{t('short.pickHint')}</p>}
      {load.status === 'error' && <p className="text-sm text-down">{t(load.error === 'bad-symbol' && mk === 'crypto' ? 'scan.err.bad-coin' : `scan.err.${load.error}`)}</p>}
      {load.status === 'done' && <Result mk={mk} styleId={styleId} row={load.row} defensive={defensive} skip={skip} />}
    </Card>
  )
}

function Result({ mk, styleId, row, defensive, skip }: { mk: ShortMarket; styleId: StyleId; row: Row; defensive: boolean; skip?: (d: string) => boolean }) {
  const f = useI18n()
  const { t, num, day } = f
  const style = STYLES[styleId]
  const rules = RULES[mk]
  const c = row.check
  const price = priceOf(mk, f)
  const pct = (x: number) => `${num(x * 100, 1)}%`
  const when = (time: string) => {
    if (time.length <= 10) return day(time)
    const wib = new Date(Date.parse(time) + WIB_MS).toISOString()
    return `${day(wib.slice(0, 10))} ${wib.slice(11, 16)} WIB`
  }
  const bt = useMemo(() => shortBacktest(row.data.daily, row.data.entry, style, rules, { skip }), [row, style, rules, skip])
  const months = Math.max(1, Math.round((Date.parse(row.data.entry.at(-1)!.time) - Date.parse(row.data.entry[0].time)) / (30.44 * 864e5)))
  const frame = style.entryFrame === '4h' ? '4H' : '1D'
  const status = statusOf(c, defensive)

  const detail: Record<ShortRuleId, string> = {
    trend: c.trendMa !== undefined && c.dailyClose !== undefined ? `${price(c.dailyClose)} vs MA${style.trendMa} ${price(c.trendMa)}` : t('rule.short'),
    stack: c.fastMa !== undefined && c.slowMa !== undefined ? `MA${style.fastMa} ${price(c.fastMa)} · MA${style.slowMa} ${price(c.slowMa)}` : t('rule.short'),
    big: c.bigMa !== undefined && c.dailyClose !== undefined ? `${price(c.dailyClose)} vs MA200 ${price(c.bigMa)}` : t('rule.short'),
    trigger: c.trigger ? t(`short.trigger.${c.trigger}.d`, { f: frame, n: SWING_BARS }) : t('short.trigger.none', { f: frame }),
    liquidity: c.avgValue !== undefined ? t('rule.liquidity.d', { v: valueOf(mk, f, c.avgValue), min: valueOf(mk, f, rules.minValue) }) : t('rule.short'),
    reach:
      c.target !== undefined && c.expectedMove !== undefined
        ? t('short.rule.reach.d', { t: pct((c.target - c.entry) / c.entry), m: pct(c.expectedMove), d: style.holdDays[mk] })
        : t('rule.short'),
  }
  const timeStop = new Date(Date.parse(c.time.length <= 10 ? `${c.time}T00:00:00Z` : c.time))
  timeStop.setUTCDate(timeStop.getUTCDate() + (mk === 'idx' ? Math.round(style.holdDays.idx * 1.4) : style.holdDays.crypto))
  const levels = useMemo(() => ({ stop: c.stop, targets: c.target !== undefined ? [{ price: c.target, title: `${TARGET_R}R` }] : [] }), [c])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-display text-4xl leading-none">{row.symbol}</div>
          <div className="text-sm text-text-muted">
            {row.data.name ? `${row.data.name} · ` : ''}
            {price(c.close)} · {t('short.lastBar', { f: frame, d: when(c.time) })}
          </div>
        </div>
        <div className="text-right">
          <Label>{t('scan.score')}</Label>
          <div className="font-display text-5xl leading-none">
            {c.score}/{c.rules.length}
          </div>
          <Badge tone={status === 'buy' ? 'paper' : status === 'paused' ? 'warn' : 'neutral'}>{t(`short.status.${status}`)}</Badge>
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {c.rules.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 px-3 py-2 text-sm">
            <span className={`w-14 shrink-0 font-label text-[11px] uppercase ${r.pass ? 'text-up' : r.pass === false ? 'text-down' : 'text-text-muted'}`}>
              {r.pass ? `✓ ${t('rule.pass')}` : r.pass === false ? `✗ ${t('rule.fail')}` : `? ${t('rule.unknown')}`}
            </span>
            <span className="flex-1">{t(`short.rule.${r.id}`, { n: style.trendMa, a: style.fastMa, b: style.slowMa, f: frame })}</span>
            <span className="w-full pl-[4.25rem] font-mono text-xs text-text-muted sm:w-auto sm:pl-0">{detail[r.id]}</span>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label={t('short.col.entry')} value={price(c.entry)} note={t('short.entryNote', { f: frame })} />
        <Stat label={t('scan.stop')} value={price(c.stop)} note={c.risk !== undefined ? `−${pct(c.risk / c.entry)} · ${t('short.stopRule', { n: SWING_BARS, k: MAX_ATR_STOP, f: frame })}` : undefined} />
        <Stat label={t('short.col.target')} value={price(c.target)} note={c.target !== undefined ? `+${pct((c.target - c.entry) / c.entry)}` : undefined} />
        <Stat label={t('scan.timeStop')} value={day(timeStop.toISOString().slice(0, 10))} note={t(`short.hold.${mk}`, { n: style.holdDays[mk] })} />
        <Stat label={t('short.expected')} value={c.expectedMove !== undefined ? `±${pct(c.expectedMove)}` : '—'} note={t('short.expectedNote', { n: style.holdDays[mk] })} />
      </div>

      <div className="flex flex-col items-stretch gap-3 rounded-md bg-surface-2 px-3 py-2 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex-1">
          <Label>{t('short.bt.title', { m: months })}</Label>
          {bt.trades.length === 0 ? (
            <p className="text-sm">{t('bt.none')}</p>
          ) : (
            <p className="font-mono text-sm">{t('bt.summary', { n: bt.trades.length, win: num(bt.winRate!), r: `${bt.avgR! >= 0 ? '+' : '−'}${num(Math.abs(bt.avgR!), 2)}` })}</p>
          )}
          <p className="text-xs text-text-muted">
            {bt.trades.length > 0 && bt.trades.length < MIN_TRADES && `${t('bt.small')} `}
            {t('short.bt.rules', { b: pct(rules.fees.buy), s: pct(rules.fees.sell) })}
          </p>
        </div>
        <PaperTrade mk={mk} styleId={styleId} row={row} defensive={defensive} />
      </div>

      <ShortChart mk={mk} styleId={styleId} row={row} levels={levels} />
    </div>
  )
}

function ShortChart({ mk, styleId, row, levels }: { mk: ShortMarket; styleId: StyleId; row: Row; levels: { stop?: number; targets: { price: number; title: string }[] } }) {
  const style = STYLES[styleId]
  const f = useI18n()
  const last = row.data.daily.at(-1)?.time ?? ''
  const cacheKey = `short:${mk}:${row.symbol}:${last}`
  // The 4H bars are already loaded for the rules: hand them to the chart instead of fetching again.
  if (style.entryFrame === '4h' && !frameCache.has(`${cacheKey}:4h`)) frameCache.set(`${cacheKey}:4h`, row.data.entry)
  const loadFrame = (tf: '1h' | '4h' | '1w' | '1M') =>
    mk === 'crypto'
      ? fetchCryptoFrame(row.symbol, tf)
      : tf === '1h'
        ? fetchHourly(row.symbol)
        : tf === '4h'
          ? fetchHourly(row.symbol).then(to4h)
          : Promise.resolve(tf === '1w' ? toWeekly(row.data.daily) : toMonthly(row.data.daily))
  return (
    <ChartPanel
      symbol={row.symbol}
      daily={row.data.daily}
      levels={levels}
      step={RULES[mk].step(row.check.close)}
      price={priceOf(mk, f)}
      loadFrame={loadFrame}
      cacheKey={cacheKey}
      initialTf={style.entryFrame}
      levelsNote="short.levelsNote"
    />
  )
}

function PaperTrade({ mk, styleId, row, defensive }: { mk: ShortMarket; styleId: StyleId; row: Row; defensive: boolean }) {
  const f = useI18n()
  const { t, num, qty } = f
  const { netWorth } = useSummary()
  const tradeLimit = useSettings((s) => s.tradeLimit)
  const usdIdr = useSettings((s) => s.usdIdr)
  const addHolding = useStore((s) => s.addHolding)
  const addTransaction = useStore((s) => s.addTransaction)
  const c = row.check
  const crypto = mk === 'crypto'
  const capital = crypto ? (usdIdr ? netWorth / usdIdr : 0) : netWorth
  const units = c.stop !== undefined ? positionSize({ capital, riskPct: tradeLimit, entry: c.entry, stop: c.stop, lot: crypto ? undefined : IDX_LOT }) : 0
  const why = !c.signal ? t('short.paper.noSignal') : defensive ? t('paper.defensive') : crypto && !usdIdr ? t('paper.needFx') : units === 0 ? t('paper.tooSmall') : undefined
  const p = priceOf(mk, f)(c.entry)

  const add = () => {
    const now = new Date().toISOString()
    const id = addHolding({
      assetClass: crypto ? 'crypto' : 'idx_stock',
      group: 'trading',
      symbol: row.symbol,
      name: row.data.name,
      platform: 'Paper',
      currency: crypto ? 'USD' : 'IDR',
      paper: true,
      stop: c.stop,
      target: c.target,
      manualPrice: c.close,
      manualPriceAt: now,
      note: t('short.paperNote', { s: t(`short.style.${styleId}`), score: c.score, total: c.rules.length, n: STYLES[styleId].holdDays[mk] }),
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
        {why ?? (crypto ? t('paper.sizeCoin', { q: qty(units), s: row.symbol, p, risk: tradeLimit }) : t('paper.size', { lots: num(units / IDX_LOT), p, risk: tradeLimit }))}
      </span>
    </div>
  )
}

const VARIANT_IDS = ['live', 'pullback', 'breakout', 'macd', 'target15', 'noReach', 'noMood', 'noFees'] as const
type VariantId = (typeof VARIANT_IDS)[number]
const VARIANTS: Record<VariantId, (skip?: (d: string) => boolean) => ShortBacktestOptions> = {
  live: (skip) => ({ skip }),
  pullback: (skip) => ({ skip, triggers: ['pullback'] }),
  breakout: (skip) => ({ skip, triggers: ['breakout'] }),
  macd: (skip) => ({ skip, macd: true }),
  target15: (skip) => ({ skip, targetR: 1.5 }),
  noReach: (skip) => ({ skip, reach: false }),
  noMood: () => ({}),
  noFees: (skip) => ({ skip, fees: false }),
}
const lastTest: Partial<Record<string, { id: VariantId; bt: Backtest }[]>> = {}

/** Every variant replayed over every scanned ticker, trades pooled, after fees. */
function RulesTest({ mk, styleId, rows, skip }: { mk: ShortMarket; styleId: StyleId; rows: Row[]; skip?: (d: string) => boolean }) {
  const { t, num } = useI18n()
  const key = `${mk}:${styleId}`
  const [result, setResult] = useState(lastTest[key])
  const [progress, setProgress] = useState<number>()
  const signed = (x: number | undefined, d = 2) => (x === undefined ? '—' : `${x >= 0 ? '+' : '−'}${num(Math.abs(x), d)}`)

  const run = async () => {
    const trades = Object.fromEntries(VARIANT_IDS.map((id) => [id, [] as Backtest['trades']])) as Record<VariantId, Backtest['trades']>
    for (const [k, r] of rows.entries()) {
      setProgress(k)
      await new Promise((ok) => setTimeout(ok, 0)) // let the progress paint
      for (const id of VARIANT_IDS) trades[id].push(...shortBacktest(r.data.daily, r.data.entry, STYLES[styleId], RULES[mk], VARIANTS[id](skip)).trades)
    }
    const res = VARIANT_IDS.map((id) => ({ id, bt: summarize(trades[id]) }))
    setResult((lastTest[key] = res))
    setProgress(undefined)
  }

  return (
    <Card>
      <CardTitle icon="chest" aside={result && t('short.rt.sub', { n: rows.length })}>
        {t('rt.title')}
      </CardTitle>
      <Button onClick={() => void run()} disabled={!rows.length || progress !== undefined} className={primary}>
        {progress !== undefined ? t('rt.running', { n: progress, total: rows.length }) : t('short.rt.run')}
      </Button>
      {!rows.length && <p className="mt-2 text-xs text-text-muted">{t('rt.needScan')}</p>}
      {result && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left">
              <tr>
                {(['rt.col.settings', 'rt.col.trades', 'rt.col.win', 'rt.col.avgR', 'rt.col.totalR', 'rt.col.streak'] as const).map((k) => (
                  <th key={k} className="px-2 py-1.5 font-label text-[11px] font-normal whitespace-nowrap text-text-muted uppercase">
                    {t(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.map(({ id, bt }) => (
                <tr key={id} className={id === 'live' ? 'bg-accent-soft' : undefined}>
                  <td className="px-2 py-1.5">
                    {t(`short.rt.${id}`)} {id === 'live' && <Badge tone="paper">{t('rt.current')}</Badge>}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{bt.trades.length}</td>
                  <td className="px-2 py-1.5 font-mono">{bt.winRate === undefined ? '—' : `${num(bt.winRate)}%`}</td>
                  <td className={`px-2 py-1.5 font-mono ${bt.avgR !== undefined && bt.avgR > 0 ? 'text-up' : bt.avgR !== undefined && bt.avgR < 0 ? 'text-down' : ''}`}>{signed(bt.avgR)}R</td>
                  <td className="px-2 py-1.5 font-mono">{signed(bt.totalR, 1)}R</td>
                  <td className="px-2 py-1.5 font-mono">{bt.worstStreak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-text-muted">{t('short.rt.note')}</p>
    </Card>
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
