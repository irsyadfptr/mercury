import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardTitle, Label, fieldClass } from '@/components/ui-bits'
import { IDX_LOT, positionSize } from '@/domain/portfolio'
import { useI18n } from '@/i18n'
import { backtest } from '@/market/backtest'
import { fetchHistory, IDX_AVAILABLE, IdxFetchError, type IdxError } from '@/market/idx'
import { checkSetup, CROSS_LOOKBACK, MIN_VALUE, type Bar, type Check, type Rule } from '@/market/indicators'
import { LQ45 } from '@/market/lq45'
import { idxMood, type IdxMood, type MoodLight } from '@/market/mood'
import { loadScanLog, recordScan, saveScanLog, scanChanges } from '@/market/scanLog'
import { href } from '@/routes'
import { useSettings } from '@/settings'
import { useStore } from '@/store'
import type { Key } from '@/types'
import { useSummary } from '@/useSummary'
import { PriceChart } from './PriceChart'

const TIME_STOP_DAYS = 56 // ~8 weeks (NOTES.md)
const SCAN_CONCURRENCY = 4
/** Fewer backtest trades than this is too small a sample to lean on. */
const MIN_TRADES = 10
const primary = 'font-label text-xs uppercase shadow-[0_3px_0_var(--accent-deep)] active:translate-y-0.5 active:shadow-none'
const LIGHT_CLASS: Record<MoodLight, string> = { red: 'text-down', yellow: 'text-warn-text', green: 'text-up' }

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
  ihsg?: Bar[]
}

const errorOf = (e: unknown): IdxError => (e instanceof IdxFetchError ? e.code : 'idx-failed')
const isResult = (r: ScanRow): r is Result => 'check' in r

async function load(symbol: string): Promise<Result> {
  const { name, bars } = await fetchHistory(symbol)
  const check = checkSetup(bars)
  if (!check) throw new IdxFetchError('not-found')
  return { symbol, name, bars, check }
}

// Kept outside React so the last check and scan survive page switches.
let lastCheck: Load = { status: 'idle' }
let lastScan: Scan | undefined

export function Scanner() {
  const { t } = useI18n()
  const [check, setCheckState] = useState(lastCheck)
  const setCheck = (l: Load) => setCheckState((lastCheck = l))
  const run = async (symbol: string) => {
    setCheck({ status: 'loading' })
    try {
      setCheck({ status: 'done', ...(await load(symbol)) })
    } catch (e) {
      setCheck({ status: 'error', error: errorOf(e) })
    }
  }

  const [scan, setScanState] = useState(lastScan)
  const publish = (s: Scan) => setScanState((lastScan = s))
  const startScan = async () => {
    const rows: ScanRow[] = []
    let ihsg: Bar[] | undefined
    publish({ rows, running: true })
    try {
      ihsg = (await fetchHistory('^JKSE')).bars
    } catch {
      // Mood falls back to breadth only.
    }
    let next = 0
    // A few CLI calls at a time; the dev server caches each ticker until the close.
    const worker = async () => {
      while (next < LQ45.length) {
        const symbol = LQ45[next++]
        try {
          rows.push(await load(symbol))
        } catch (e) {
          rows.push({ symbol, error: errorOf(e) })
        }
        publish({ rows: [...rows], running: true, ihsg })
      }
    }
    await Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker))
    publish({ rows: [...rows], running: false, ihsg })
    const ok = rows.filter(isResult)
    if (ok.length) {
      const date = ok.map((r) => r.bars[r.bars.length - 1].time).sort().at(-1)!
      const pick = (f: (c: Check) => boolean) => ok.filter((r) => f(r.check)).map((r) => r.symbol).sort()
      saveScanLog(recordScan(loadScanLog(), { date, passing: pick((c) => c.score === c.rules.length), inZone: pick((c) => c.zone === 'in') }))
    }
  }

  // Opening the Scanner runs the LQ45 scan once per visit; after 16:30 WIB the dev server fetches the day's final bars.
  useEffect(() => {
    if (IDX_AVAILABLE && !lastScan) void startScan()
  }, [])

  const mood = useMemo(() => (scan && !scan.running ? idxMood(scan.ihsg ?? [], scan.rows.filter(isResult).map((r) => r.bars)) : undefined), [scan])

  return (
    <>
      <Card>
        <h1 className="font-display text-5xl leading-none uppercase">{t('scan.title')}</h1>
        <p className="mt-2 text-sm text-text-muted">{t('scan.intro')}</p>
      </Card>
      {IDX_AVAILABLE ? (
        <>
          <MoodCard mood={mood} running={!!scan?.running} />
          <TickerCheck load={check} onCheck={run} mood={mood} />
          <Lq45Scan scan={scan} onStart={() => void startScan()} onPick={(s) => void run(s)} />
        </>
      ) : (
        <Card>
          <p className="text-sm">{t('scan.localOnly')}</p>
        </Card>
      )}
    </>
  )
}

function MoodCard({ mood, running }: { mood?: IdxMood; running: boolean }) {
  const { t, num } = useI18n()
  const part = (v: number | undefined) => (v === undefined ? '—' : `${num(v)}/100`)
  return (
    <Card>
      <CardTitle icon="heart" aside={t('mood.idx.source')}>
        {t('mood.idx.title')}
      </CardTitle>
      {!mood ? (
        <p className="text-sm text-text-muted">{running ? t('mood.idx.waiting') : '—'}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <div className={`font-display text-5xl leading-none ${LIGHT_CLASS[mood.light]}`}>{mood.score}</div>
            <div className={`font-label text-[11px] uppercase ${LIGHT_CLASS[mood.light]}`}>● {t(`mood.idx.${mood.light}`)}</div>
          </div>
          <dl className="grid flex-1 grid-cols-1 gap-1 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-text-muted">{t('mood.idx.breadth')}</dt>
              <dd className="font-mono">
                {part(mood.breadth)} · {t('mood.idx.breadthNote', { n: mood.above, total: mood.counted })}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{t('mood.idx.trend')}</dt>
              <dd className="font-mono">{part(mood.trend)}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">{t('mood.idx.calm')}</dt>
              <dd className="font-mono">{part(mood.calm)}</dd>
            </div>
          </dl>
          <p className="w-full text-sm">{t(`mood.idx.advice.${mood.light}`)}</p>
        </div>
      )}
    </Card>
  )
}

function ErrorText({ error }: { error: IdxError }) {
  const { t } = useI18n()
  return (
    <p role="alert" className="text-sm text-down">
      {t(`scan.err.${error}` as Key)}
      {error === 'idx-missing' && <code className="ml-1 rounded bg-surface-2 px-1 font-mono text-text">npm install -g ihsg-cli</code>}
    </p>
  )
}

function TickerCheck({ load, onCheck, mood }: { load: Load; onCheck: (s: string) => Promise<void>; mood?: IdxMood }) {
  const { t } = useI18n()
  const [symbol, setSymbol] = useState(load.status === 'done' ? load.symbol : 'BBCA')
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
          maxLength={4}
          pattern="[A-Za-z]{4}"
          required
          className={`${fieldClass} max-w-32 font-mono uppercase`}
        />
        <Button type="submit" disabled={load.status === 'loading'} className={primary}>
          {load.status === 'loading' ? t('scan.loading') : t('scan.run')}
        </Button>
      </form>
      {load.status === 'error' && <ErrorText error={load.error} />}
      {load.status === 'done' && <CheckResult r={load} mood={mood} />}
    </Card>
  )
}

function CheckResult({ r, mood }: { r: Result; mood?: IdxMood }) {
  const { t, num, money, day } = useI18n()
  const c = r.check
  const last = r.bars[r.bars.length - 1].time
  const timeStop = new Date(`${last}T00:00:00Z`)
  timeStop.setUTCDate(timeStop.getUTCDate() + TIME_STOP_DAYS)
  const bt = useMemo(() => backtest(r.bars), [r.bars])
  const detail: Record<Rule['id'], string> = {
    weeklyTrend: t('rule.weeklyTrend.d'),
    ma50over200: c.ma50 !== undefined && c.ma200 !== undefined ? `MA50 ${num(c.ma50)} · MA200 ${num(c.ma200)}` : t('rule.short'),
    closeOverMa50: c.ma50 !== undefined ? `${num(c.close)} vs ${num(c.ma50)}` : t('rule.short'),
    macdCross: c.crossAgo !== undefined ? t('rule.macdCross.ago', { n: c.crossAgo }) : t('rule.macdCross.none', { n: CROSS_LOOKBACK }),
    liquidity: t('rule.liquidity.d', { v: money(c.avgValue / 1e9) + ' bn', min: money(MIN_VALUE / 1e9) + ' bn' }),
  }
  const years = Math.round((Date.parse(last) - Date.parse(r.bars[0].time)) / (365.25 * 864e5))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-display text-4xl leading-none">{r.symbol}</div>
          <div className="text-sm text-text-muted">
            {r.name} · {money(c.close)} · {day(last)}
          </div>
        </div>
        <div className="text-right">
          <Label>{t('scan.score')}</Label>
          <div className="font-display text-5xl leading-none">
            {c.score}/{c.rules.length}
          </div>
        </div>
      </div>

      {mood?.light === 'red' && c.zone !== 'none' && (
        <p role="status" className="rounded-md border border-down px-3 py-2 text-sm text-down">
          {t('mood.idx.redWarning')}
        </p>
      )}

      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {c.rules.map((rule) => (
          <li key={rule.id} className="flex flex-wrap items-center gap-x-3 px-3 py-2 text-sm">
            <span className={`w-14 shrink-0 font-label text-[11px] uppercase ${rule.pass ? 'text-up' : rule.pass === false ? 'text-down' : 'text-text-muted'}`}>
              {rule.pass ? `✓ ${t('rule.pass')}` : rule.pass === false ? `✗ ${t('rule.fail')}` : `? ${t('rule.unknown')}`}
            </span>
            <span className="flex-1">{t(`rule.${rule.id}` as Key)}</span>
            <span className="w-full pl-[4.25rem] font-mono text-xs text-text-muted sm:w-auto sm:pl-0">{detail[rule.id]}</span>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          label={t('scan.buyZone')}
          value={c.buyZone ? `${money(c.buyZone.low)}–${num(c.buyZone.high)}` : '—'}
          note={c.zone === 'extended' ? t('scan.zone.extended', { p: money(c.entry) }) : t(`scan.zone.${c.zone}`)}
        />
        <Stat label={t('scan.stop')} value={c.stop !== undefined ? money(c.stop) : '—'} note={c.risk !== undefined ? `−${num((c.risk / c.entry) * 100, 1)}% · ${t('scan.stopRule')}` : undefined} />
        <Stat label={t('scan.target2')} value={c.target2 !== undefined ? money(c.target2) : '—'} note={c.target2 !== undefined ? t('scan.fromEntry', { p: money(c.entry) }) : undefined} />
        <Stat label={t('scan.target3')} value={c.target3 !== undefined ? money(c.target3) : '—'} />
        <Stat label={t('scan.timeStop')} value={day(timeStop.toISOString().slice(0, 10))} note={t('scan.timeStopNote')} />
      </div>

      <div className="flex flex-wrap items-start gap-4 rounded-md bg-surface-2 px-3 py-2">
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
            {t('bt.rules')}
          </p>
        </div>
        <PaperTrade r={r} />
      </div>

      <PriceChart bars={r.bars} check={c} label={t('scan.chartLabel', { s: r.symbol })} />
      <p className="text-xs text-text-muted">{t('scan.backtestLater')}</p>
    </div>
  )
}

/** Adds the setup to Portfolio → Trading as a paper trade, sized so a stop-out loses the per-trade risk limit. */
function PaperTrade({ r }: { r: Result }) {
  const { t, money, num } = useI18n()
  const { netWorth } = useSummary()
  const tradeLimit = useSettings((s) => s.tradeLimit)
  const addHolding = useStore((s) => s.addHolding)
  const addTransaction = useStore((s) => s.addTransaction)
  const c = r.check
  const units = c.stop !== undefined ? positionSize({ capital: netWorth, riskPct: tradeLimit, entry: c.entry, stop: c.stop, lot: IDX_LOT }) : 0
  const why = c.zone !== 'in' ? t('paper.notInZone') : units === 0 ? t('paper.tooSmall') : undefined

  const add = () => {
    const now = new Date().toISOString()
    const id = addHolding({
      assetClass: 'idx_stock',
      group: 'trading',
      symbol: r.symbol,
      name: r.name,
      platform: 'Paper',
      currency: 'IDR',
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
    <div className="flex max-w-64 flex-col gap-1">
      <Button onClick={add} disabled={!!why} className={primary}>
        {t('paper.button')}
      </Button>
      <span className="text-xs text-text-muted">{why ?? t('paper.size', { lots: num(units / IDX_LOT), p: money(c.entry), risk: tradeLimit })}</span>
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

function Lq45Scan({ scan, onStart, onPick }: { scan?: Scan; onStart: () => void; onPick: (s: string) => void }) {
  const { t, money, num, day } = useI18n()
  const ok = (scan?.rows.filter(isResult) ?? []).sort((a, b) => b.check.score - a.check.score || a.symbol.localeCompare(b.symbol))
  const failed = scan?.rows.filter((r) => !isResult(r)) ?? []
  const passing = ok.filter((r) => r.check.score === r.check.rules.length).length
  const missing = failed.find((r) => 'error' in r && r.error === 'idx-missing')
  const changes = scan && !scan.running ? scanChanges(loadScanLog()) : undefined
  const list = (xs: string[]) => (xs.length ? xs.join(', ') : '—')

  return (
    <Card>
      <CardTitle icon="star" aside={scan && t('scan.progress', { n: scan.rows.length, total: LQ45.length })}>
        {t('scan.lq45')}
      </CardTitle>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button onClick={onStart} disabled={scan?.running} className={primary}>
          {scan?.running ? t('scan.loading') : t('scan.runAll')}
        </Button>
        {scan && <span className="text-sm">{t('scan.passing', { n: passing })}</span>}
      </div>
      {missing && 'error' in missing && <ErrorText error={missing.error} />}
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
                {['scan.ticker', 'scan.score', 'scan.close', 'scan.buyZone', 'scan.stop', 'scan.target2'].map((k) => (
                  <th key={k} className="px-2 py-1.5 font-label text-[11px] font-normal text-text-muted uppercase">
                    {t(k as Key)}
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
                  </td>
                  <td className="px-2 py-1.5 font-mono">
                    {r.check.score}/{r.check.rules.length} {r.check.score === r.check.rules.length && <Badge tone="paper">{t('scan.pass')}</Badge>}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{money(r.check.close)}</td>
                  <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                    {r.check.buyZone ? `${money(r.check.buyZone.low)}–${num(r.check.buyZone.high)} ` : '—'}
                    {r.check.zone !== 'none' && <Badge tone={r.check.zone === 'in' ? 'paper' : 'warn'}>{t(`scan.badge.${r.check.zone}`)}</Badge>}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{r.check.stop !== undefined ? money(r.check.stop) : '—'}</td>
                  <td className="px-2 py-1.5 font-mono">{r.check.target2 !== undefined ? money(r.check.target2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!missing && failed.length > 0 && <p className="mt-2 text-xs text-text-muted">{t('scan.failed', { list: failed.map((r) => r.symbol).join(', ') })}</p>}
      <p className="mt-3 text-xs text-text-muted">{t('scan.listSource')}</p>
    </Card>
  )
}
