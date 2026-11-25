import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardTitle, Label, PixelTabs } from '@/components/ui-bits'
import { useI18n } from '@/i18n'
import { fetchCryptoHistory } from '@/market/binance'
import { fetchHistory, IDX_AVAILABLE } from '@/market/idx'
import { fetchUsHistory, usAvailable } from '@/market/us'
import type { Bar } from '@/market/indicators'
import { loadShort } from '@/market/shortData'
import { STYLES } from '@/market/shortSwing'
import {
  loadSignals,
  saveSignals,
  SIGNAL_STYLES,
  SIGNALS_EVENT,
  signalStats,
  takenSignals,
  unfinished,
  updateOutcomes,
  verdict,
  type SignalMarket,
  type SignalRecord,
  type SignalStats,
  type SignalStyle,
  type Verdict,
} from '@/market/signalLog'
import { evalOptions } from '@/market/signalTrack'
import { useStore } from '@/store'
import type { I18n } from '@/types'

const primary = 'font-label text-xs uppercase shadow-[0_3px_0_var(--accent-deep)] active:translate-y-0.5 active:shadow-none'
const CONCURRENCY = 4
/** Closed signals needed before the comparison lines say anything. */
const MIN_COMPARE = 5
/** Below this many closed signals the sample is too small to lean on (backtest-expert: 30 minimum). */
const MIN_SAMPLE = 30
const SHOW = 60
type MarketFilter = SignalMarket | 'all'
type StyleFilter = SignalStyle | 'all'
const VERDICT_TONE: Record<Verdict, string> = { won: 'text-up', lost: 'text-down', open: 'text-text', pending: 'text-text-muted', skipped: 'text-text-muted' }

const signed = (f: I18n, x: number | undefined, d = 2) => (x === undefined ? '—' : `${x >= 0 ? '+' : '−'}${f.num(Math.abs(x), d)}`)
const priceText = (f: I18n, s: SignalRecord, n: number) => (s.market === 'idx' ? f.money(n) : `$${n.toLocaleString(f.locale, { maximumSignificantDigits: 5 })}`)

/** Bars the signal's rules trade on: 4-hour for ≤ 1 week, daily otherwise. */
async function barsFor(market: SignalMarket, style: SignalStyle, symbol: string): Promise<Bar[]> {
  if (style === 'week') return (await loadShort(market, STYLES.week, symbol)).entry
  return (market === 'idx' ? await fetchHistory(symbol) : market === 'us' ? await fetchUsHistory(symbol) : await fetchCryptoHistory(symbol)).bars
}

/** Signal postmortem: how the scanner's buy signals turned out, live vs paused by the mood, taken vs missed. */
/** fixed: the market page it sits on (its signals only); without it, a market filter. */
export function SignalsView({ market: fixed }: { market?: SignalMarket }) {
  const f = useI18n()
  const { t } = f
  const [log, setLog] = useState(loadSignals)
  const [chosen, setMarket] = useState<MarketFilter>('all')
  const market: MarketFilter = fixed ?? chosen
  const [style, setStyle] = useState<StyleFilter>('all')
  const [progress, setProgress] = useState<{ n: number; total: number }>()
  const holdings = useStore((s) => s.holdings)
  const txns = useStore((s) => s.transactions)

  // A scan finishing in another view saves the log; pick it up.
  useEffect(() => {
    const reload = () => setLog(loadSignals())
    window.addEventListener(SIGNALS_EVENT, reload)
    return () => window.removeEventListener(SIGNALS_EVENT, reload)
  }, [])

  const shown = useMemo(() => log.filter((s) => (market === 'all' || s.market === market) && (style === 'all' || s.style === style)), [log, market, style])
  const taken = useMemo(() => {
    const candidates = holdings
      .filter((h) => h.group === 'trading' && (h.assetClass === 'idx_stock' || h.assetClass === 'crypto' || h.assetClass === 'us_stock'))
      .map((h) => ({
        id: h.id,
        symbol: h.symbol,
        market: (h.assetClass === 'idx_stock' ? 'idx' : h.assetClass === 'us_stock' ? 'us' : 'crypto') as SignalMarket,
        signalId: h.signalId,
        firstBuy: txns.filter((x) => x.holdingId === h.id && x.type === 'buy').map((x) => x.date).sort()[0],
      }))
    return takenSignals(shown, candidates)
  }, [shown, holdings, txns])

  const live = signalStats(shown.filter((s) => !s.paused))
  const paused = signalStats(shown.filter((s) => s.paused))
  const yours = signalStats(shown.filter((s) => taken.has(s.id)))
  const missed = shown.filter((s) => !s.paused && !taken.has(s.id) && verdict(s) === 'won').length

  const check = async () => {
    const todo = unfinished(log).filter((g) => g.market === 'crypto' || (g.market === 'us' ? usAvailable() : IDX_AVAILABLE))
    let next = 0
    let done = 0
    let current = log
    setProgress({ n: 0, total: todo.length })
    const worker = async () => {
      while (next < todo.length) {
        const g = todo[next++]
        try {
          // Await first, then read `current`, so parallel workers never overwrite each other's updates.
          const bars = await barsFor(g.market, g.style, g.symbol)
          current = updateOutcomes(current, g.market, g.style, g.symbol, bars, evalOptions(g.market, g.style))
        } catch {
          // No bars right now: that ticker's signals wait for the next check.
        }
        setProgress({ n: ++done, total: todo.length })
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    // Merge into the latest saved log, in case a scan saved new signals meanwhile.
    const fresh = new Map(current.map((s) => [s.id, s]))
    const merged = loadSignals().map((s) => fresh.get(s.id)?.outcome ? { ...s, outcome: fresh.get(s.id)!.outcome } : s)
    saveSignals(merged)
    setLog(merged)
    setProgress(undefined)
  }

  const moodLine =
    live.closed >= MIN_COMPARE && paused.closed >= MIN_COMPARE
      ? t((paused.avgR ?? 0) < (live.avgR ?? 0) ? 'sg.moodHelps' : 'sg.moodHurts', { p: signed(f, paused.avgR), l: signed(f, live.avgR) })
      : t('sg.moodWait', { n: MIN_COMPARE })

  return (
    <Card data-tone="purple">
      <CardTitle icon="star" aside={t('sg.count', { n: shown.length })}>
        {t('sg.title')}
      </CardTitle>
      <p className="mb-3 text-sm text-text-muted">{t('sg.intro')}</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!fixed && <PixelTabs label={t('sg.market')} options={(['all', 'idx', 'us', 'crypto'] as const).map((m) => ({ id: m, label: t(m === 'all' ? 'sg.all' : `scan.market.${m}`) }))} value={market} onChange={setMarket} />}
        <PixelTabs label={t('sg.style')} options={(['all', ...SIGNAL_STYLES] as const).map((x) => ({ id: x, label: t(x === 'all' ? 'sg.all' : `scan.mode.${x}`) }))} value={style} onChange={setStyle} />
        <Button onClick={() => void check()} disabled={!!progress || !log.length} className={primary}>
          {progress ? t('sg.checking', { n: progress.n, total: progress.total }) : t('sg.check')}
        </Button>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-text-muted">{t('sg.empty')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <StatsBox title={t('sg.live')} s={live} />
            <StatsBox title={t('sg.paused')} s={paused} />
            <StatsBox title={t('sg.yours')} s={yours} />
          </div>
          <ul className="flex flex-col gap-1 rounded-md bg-surface-2 px-3 py-2 text-sm">
            <li>{moodLine}</li>
            <li>{t('sg.missed', { n: missed })}</li>
            {live.closed < MIN_SAMPLE && <li className="text-text-muted">{t('sg.small', { n: live.closed, min: MIN_SAMPLE })}</li>}
          </ul>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left">
                <tr>
                  {(['sg.col.date', 'sg.col.ticker', 'sg.col.rules', 'sg.col.levels', 'sg.col.result', 'sg.col.r', 'sg.col.mfeMae', 'sg.col.ret'] as const).map((k) => (
                    <th key={k} className="px-2 py-1.5 font-label text-[11px] font-normal text-text-muted uppercase">
                      {t(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...shown]
                  .sort((a, b) => b.time.localeCompare(a.time))
                  .slice(0, SHOW)
                  .map((s) => {
                    const v = verdict(s)
                    const o = s.outcome
                    return (
                      <tr key={s.id}>
                        <td className="px-2 py-1.5 whitespace-nowrap">{f.day(s.time.slice(0, 10))}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          <span className="font-mono">{s.symbol}</span> {s.paused && <Badge tone="warn">{t('sg.pausedBadge')}</Badge>} {taken.has(s.id) && <Badge tone="paper">{t('sg.takenBadge')}</Badge>}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-text-muted">
                          {t(`scan.market.${s.market}`)} · {t(`scan.mode.${s.style}`)}
                        </td>
                        <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                          {priceText(f, s, s.entry)} / {priceText(f, s, s.stop)}
                        </td>
                        <td className={`px-2 py-1.5 ${VERDICT_TONE[v]}`}>{t(v === 'won' || v === 'lost' ? `sg.status.${o!.status}` : `sg.v.${v}`)}</td>
                        <td className={`px-2 py-1.5 font-mono ${VERDICT_TONE[v]}`}>{o?.r === undefined ? '—' : `${signed(f, o.r)}R`}</td>
                        <td className="px-2 py-1.5 font-mono whitespace-nowrap">{o?.mfeR === undefined ? '—' : `${signed(f, o.mfeR, 1)} / ${signed(f, o.maeR, 1)}`}</td>
                        <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                          {signed(f, o?.ret5, 1)}% · {signed(f, o?.ret20, 1)}%
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-text-muted">{t(IDX_AVAILABLE ? 'sg.note' : 'sg.noteDeployed')}</p>
        </div>
      )}
    </Card>
  )
}

function StatsBox({ title, s }: { title: string; s: SignalStats }) {
  const f = useI18n()
  const { t, num } = f
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <Label>{title}</Label>
      <div className={`font-mono text-lg ${s.avgR === undefined ? '' : s.avgR > 0 ? 'text-up' : 'text-down'}`}>{s.avgR === undefined ? '—' : `${signed(f, s.avgR)}R`}</div>
      <div className="text-xs text-text-muted">
        {t('sg.box', { closed: s.closed, open: s.open, win: s.winRate === undefined ? '—' : num(s.winRate), mfe: signed(f, s.avgMfe, 1), mae: signed(f, s.avgMae, 1) })}
      </div>
    </div>
  )
}
