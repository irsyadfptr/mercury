import { useMemo, useState } from 'react'
import { Explain } from '@/components/Explain'
import { HoldingDialog } from '@/components/HoldingDialog'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardTitle, Label } from '@/components/ui-bits'
import { localDate } from '@/domain/cashflow'
import { tradeStatus } from '@/domain/tradeMemory'
import { closedTrades, excursion, filterTrades, KELLY_MIN, reviewStats, type ClosedTrade, type GroupStats, type ReviewKind, type ReviewPeriod } from '@/domain/tradeReview'
import { useI18n } from '@/i18n'
import { fetchCryptoHistory } from '@/market/binance'
import { fetchHistory, IDX_AVAILABLE } from '@/market/idx'
import { href } from '@/routes'
import { useSettings } from '@/settings'
import { useStore } from '@/store'
import type { HoldingDialogTarget, Holding, I18n, Key, Transaction } from '@/types'
import { useNow } from '@/useNow'

const primary = 'font-label text-xs uppercase shadow-[0_3px_0_var(--accent-deep)] active:translate-y-0.5 active:shadow-none'
const PERIODS: readonly ReviewPeriod[] = ['week', 'month', 'all']
const KINDS: readonly ReviewKind[] = ['all', 'real', 'paper']
/** Fetch MAE/MFE bars for at most this many trades per click. */
const MAX_EXCURSIONS = 40
type Excursion = { maeR: number; mfeR: number }
// Kept outside React: bars are only fetched once per visit.
const excursions = new Map<string, Excursion>()

const signed = (f: I18n, x: number | undefined, d = 2) => (x === undefined || !Number.isFinite(x) ? '—' : `${x >= 0 ? '+' : '−'}${f.num(Math.abs(x), d)}`)
const rText = (f: I18n, t: Pick<ClosedTrade, 'r' | 'rApprox'>) => (t.r === undefined ? '—' : `${t.rApprox ? '~' : ''}${signed(f, t.r)}R`)

/** Trade memory (open trades with their thesis and review date) and the trade review (closed trades, stats, AI coach). */
export function TradesView() {
  const f = useI18n()
  const { t } = f
  const holdings = useStore((s) => s.holdings)
  const txns = useStore((s) => s.transactions)
  const usdIdr = useSettings((s) => s.usdIdr)
  const today = localDate(useNow())
  const [dialog, setDialog] = useState<HoldingDialogTarget>({ mode: 'closed' })
  const edit = (h: Holding) => setDialog({ mode: 'edit', holdingId: h.id })

  const all = useMemo(() => closedTrades(holdings, txns, usdIdr), [holdings, txns, usdIdr])
  const open = holdings.filter((h) => h.group === 'trading' && tradeStatus(txns.filter((x) => x.holdingId === h.id)) === 'active')

  return (
    <>
      <Card>
        <CardTitle icon="chest" aside={t('tm.openCount', { n: open.length })}>
          {t('tm.openTitle')}
        </CardTitle>
        {open.length === 0 ? (
          <p className="text-sm text-text-muted">{t('tm.noOpen')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((h) => (
              <OpenTrade key={h.id} h={h} txns={txns.filter((x) => x.holdingId === h.id)} today={today} onEdit={() => edit(h)} />
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-text-muted">{t('tm.openNote')}</p>
      </Card>
      <Review all={all} today={today} onEdit={edit} />
      <HoldingDialog target={dialog} onClose={() => setDialog({ mode: 'closed' })} />
    </>
  )
}

function OpenTrade({ h, txns, today, onEdit }: { h: Holding; txns: Transaction[]; today: string; onEdit: () => void }) {
  const f = useI18n()
  const { t } = f
  const journal = useStore((s) => s.journal)
  const firstBuy = txns.filter((x) => x.type === 'buy').map((x) => x.date.slice(0, 10)).sort()[0]
  const days = firstBuy ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${firstBuy}T00:00:00Z`)) / 864e5) : 0
  const due = !!h.reviewBy && h.reviewBy <= today
  const notes = journal.filter((j) => j.holdingId === h.id).length
  const moved = h.initialStop !== undefined && h.stop !== undefined && h.stop !== h.initialStop
  const price = (n: number) => (h.currency === 'USD' ? `$${f.num(n, n < 1 ? 6 : 2)}` : f.money(n))
  return (
    <li className="flex flex-col gap-1 rounded-md border border-border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-medium">{h.symbol}</span>
        {h.paper && <Badge tone="paper">{t('badge.paper')}</Badge>}
        <Badge tone="neutral">{t(`tm.setup.${h.setup ?? 'other'}`)}</Badge>
        <span className="text-text-muted">{t('tm.daysHeld', { n: days })}</span>
        {h.reviewBy && <Badge tone={due ? 'warn' : 'neutral'}>{t(due ? 'tm.reviewDue' : 'tm.reviewOn', { d: f.day(h.reviewBy) })}</Badge>}
        <Button variant="outline" size="sm" className="ml-auto" onClick={onEdit}>
          {t('tm.edit')}
        </Button>
      </div>
      {h.thesis ? <p>{h.thesis}</p> : <p className="text-warn-text">{t('tm.noThesis')}</p>}
      {h.invalidation && (
        <p className="text-text-muted">
          {t('tm.invalidation')}: {h.invalidation}
        </p>
      )}
      <p className="text-xs text-text-muted">
        {h.stop !== undefined ? t('tm.stopNow', { p: price(h.stop) }) : t('tm.noStop')}
        {moved && ` · ${t('tm.stopMoved', { p: price(h.initialStop!) })}`} · {t('tm.notes', { n: notes })} ·{' '}
        <a className="underline" href={href('journal', { holding: h.id, tag: 'note' })}>
          {t('tm.addNote')}
        </a>
      </p>
    </li>
  )
}

function Review({ all, today, onEdit }: { all: ClosedTrade[]; today: string; onEdit: (h: Holding) => void }) {
  const f = useI18n()
  const { t, num } = f
  const tradeLimit = useSettings((s) => s.tradeLimit)
  const journal = useStore((s) => s.journal)
  const [period, setPeriod] = useState<ReviewPeriod>('all')
  const [kind, setKind] = useState<ReviewKind>('all')
  const [, setTick] = useState(0)
  const [loading, setLoading] = useState(false)
  const trades = filterTrades(all, period, kind, today)
  const s = reviewStats(trades)
  const exc = trades.flatMap((x) => (excursions.has(x.key) ? [excursions.get(x.key)!] : []))
  const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)
  const avgMae = avgOf(exc.map((e) => e.maeR))
  const avgMfe = avgOf(exc.map((e) => e.mfeR))

  const loadExcursions = async () => {
    setLoading(true)
    const todo = trades.filter((x) => !excursions.has(x.key) && (x.holding.assetClass === 'crypto' || (x.holding.assetClass === 'idx_stock' && IDX_AVAILABLE))).slice(0, MAX_EXCURSIONS)
    const bars = new Map<string, Promise<Awaited<ReturnType<typeof fetchCryptoHistory>>['bars']>>()
    for (const x of todo) {
      const h = x.holding
      const key = `${h.assetClass}:${h.symbol}`
      if (!bars.has(key)) bars.set(key, (h.assetClass === 'crypto' ? fetchCryptoHistory(h.symbol) : fetchHistory(h.symbol)).then((r) => r.bars))
      try {
        const stop = h.initialStop ?? h.stop
        if (stop === undefined) continue
        // Bars are rupiah for IDX and USDT for crypto: compare against the average entry only when the trade is in that currency.
        const sameCurrency = h.assetClass === 'idx_stock' ? h.currency === 'IDR' : h.currency === 'USD'
        const e = excursion(await bars.get(key)!, x.entryDate, x.exitDate, (x.avgEntry - stop) / x.avgEntry, sameCurrency ? x.avgEntry : undefined)
        if (e) excursions.set(x.key, e)
      } catch {
        // No bars for this ticker: it just shows no MAE/MFE.
      }
    }
    setLoading(false)
    setTick((n) => n + 1)
  }

  const tab = (on: boolean) =>
    `rounded px-2.5 py-1 font-label text-[11px] uppercase focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${on ? 'bg-primary text-primary-foreground' : 'text-text-muted hover:bg-surface-2 hover:text-text'}`
  const facts = [
    t('tr.f.filter', { p: t(`tr.period.${period}`), k: t(`tr.kind.${kind}`) }),
    `Closed trades: ${s.n} (${s.wins} won, ${s.losses} lost); trades with an R: ${s.rCount}`,
    `Win rate: ${s.winRate === undefined ? '—' : `${num(s.winRate)}%`}; expectancy ${signed(f, s.expectancy)}R per trade; average win ${signed(f, s.avgWinR)}R; average loss ${signed(f, s.avgLossR)}R`,
    `Profit factor: ${s.profitFactor === undefined ? '—' : num(s.profitFactor, 2)}; worst losing streak: ${s.worstStreak}; average days held: ${s.avgDays === undefined ? '—' : num(s.avgDays)}`,
    ...(avgMae !== undefined ? [`Average MAE ${signed(f, avgMae)}R, average MFE ${signed(f, avgMfe)}R (${exc.length} trades with prices)`] : []),
    `Risk limit per trade: ${tradeLimit}% of net worth${s.halfKelly !== undefined ? `; half-Kelly from these trades: ${num(s.halfKelly, 2)}%` : ''}`,
    ...s.bySetup.map((g) => `Setup ${g.key}: ${g.n} trades, win ${num(g.winRate)}%, avg ${signed(f, g.avgR)}R`),
    ...s.byExit.map((g) => `Exit reason ${g.key}: ${g.n} trades, win ${num(g.winRate)}%, avg ${signed(f, g.avgR)}R`),
    ...trades.slice(0, 15).map((x) => {
      const e = excursions.get(x.key)
      const lesson = journal.some((j) => j.holdingId === x.holding.id && (j.tag === 'lesson' || j.tag === 'exit') && j.date >= x.exitDate)
      return `${x.exitDate} ${x.holding.symbol}${x.paper ? ' (paper)' : ''}: ${rText(f, x)}, ${signed(f, x.pnlPct, 1)}%, ${x.days} days, setup ${x.setup}, exit ${x.exitReason ?? 'not recorded'}, stop ${x.holding.initialStop !== undefined && x.holding.stop !== x.holding.initialStop ? 'moved' : 'kept'}, thesis ${x.holding.thesis ? 'written' : 'none'}, lesson ${lesson ? 'written' : 'none'}${e ? `, MAE ${signed(f, e.maeR)}R, MFE ${signed(f, e.mfeR)}R` : ''}`
    }),
  ]

  return (
    <Card>
      <CardTitle icon="chartUp" aside={t('tr.count', { n: trades.length })}>
        {t('tr.title')}
      </CardTitle>
      <div className="mb-3 flex flex-wrap gap-2">
        <div role="group" aria-label={t('tr.periodLabel')} className="flex gap-1 rounded-md border border-border p-1">
          {PERIODS.map((p) => (
            <button key={p} type="button" aria-pressed={p === period} onClick={() => setPeriod(p)} className={tab(p === period)}>
              {t(`tr.period.${p}`)}
            </button>
          ))}
        </div>
        <div role="group" aria-label={t('tr.kindLabel')} className="flex gap-1 rounded-md border border-border p-1">
          {KINDS.map((k) => (
            <button key={k} type="button" aria-pressed={k === kind} onClick={() => setKind(k)} className={tab(k === kind)}>
              {t(`tr.kind.${k}`)}
            </button>
          ))}
        </div>
      </div>

      {trades.length === 0 ? (
        <p className="text-sm text-text-muted">{t('tr.empty')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label={t('tr.trades')} value={String(s.n)} note={t('tr.wl', { w: s.wins, l: s.losses })} />
            <Tile label={t('tr.winRate')} value={s.winRate === undefined ? '—' : `${num(s.winRate)}%`} />
            <Tile label={t('tr.expectancy')} value={`${signed(f, s.expectancy)}R`} note={t('tr.expectancyNote', { n: s.rCount })} tone={s.expectancy} />
            <Tile label={t('tr.profitFactor')} value={s.profitFactor === undefined ? '—' : num(s.profitFactor, 2)} note={t('tr.profitFactorNote')} tone={s.profitFactor === undefined ? undefined : s.profitFactor - 1} />
            <Tile label={t('tr.pnl')} value={`${s.totalPnlIdr < 0 ? '−' : ''}${f.money(Math.abs(s.totalPnlIdr))}`} tone={s.totalPnlIdr} />
            <Tile label={t('tr.avgWinLoss')} value={`${signed(f, s.avgWinR)} / ${signed(f, s.avgLossR)}R`} />
            <Tile label={t('tr.streak')} value={String(s.worstStreak)} note={t('tr.avgDays', { n: s.avgDays === undefined ? '—' : num(s.avgDays) })} />
            <Tile label={t('tr.maeMfe')} value={avgMae === undefined ? '—' : `${signed(f, avgMae)} / ${signed(f, avgMfe)}R`} note={t('tr.maeMfeNote', { n: exc.length })} />
          </div>

          <p className="rounded-md bg-surface-2 px-3 py-2 text-sm">
            {s.halfKelly !== undefined ? t('tr.kelly', { k: num(s.halfKelly, 2), n: s.rCount, limit: tradeLimit }) : t('tr.kellyWait', { n: s.rCount, min: KELLY_MIN })}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Breakdown title={t('tr.bySetup')} rows={s.bySetup} name={(k) => t(`tm.setup.${k}` as Key)} />
            <Breakdown title={t('tr.byExit')} rows={s.byExit} name={(k) => t(k === 'unknown' ? 'tr.exitUnknown' : (`tm.exit.${k}` as Key))} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void loadExcursions()} disabled={loading} className={primary}>
              {loading ? t('tr.loadingPrices') : t('tr.loadPrices')}
            </Button>
            <span className="text-xs text-text-muted">{t(IDX_AVAILABLE ? 'tr.loadPricesNote' : 'tr.loadPricesNoteDeployed')}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left">
                <tr>
                  {(['tr.col.closed', 'tr.col.ticker', 'tr.col.r', 'tr.col.pnl', 'tr.col.days', 'tr.col.exit', 'tr.col.maeMfe', 'tr.col.lesson'] as const).map((k) => (
                    <th key={k} className="px-2 py-1.5 font-label text-[11px] font-normal text-text-muted uppercase">
                      {t(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {trades.map((x) => {
                  const e = excursions.get(x.key)
                  const lesson = journal.some((j) => j.holdingId === x.holding.id && (j.tag === 'lesson' || j.tag === 'exit') && j.date >= x.exitDate)
                  return (
                    <tr key={x.key}>
                      <td className="px-2 py-1.5 whitespace-nowrap">{f.day(x.exitDate)}</td>
                      <td className="px-2 py-1.5">
                        <button type="button" onClick={() => onEdit(x.holding)} className="font-mono underline-offset-2 hover:underline">
                          {x.holding.symbol}
                        </button>{' '}
                        {x.paper && <Badge tone="paper">{t('badge.paper')}</Badge>}
                      </td>
                      <td className={`px-2 py-1.5 font-mono ${x.r === undefined ? '' : x.r > 0 ? 'text-up' : 'text-down'}`}>{rText(f, x)}</td>
                      <td className="px-2 py-1.5 font-mono">{f.change(x.pnlPct, 1)}</td>
                      <td className="px-2 py-1.5 font-mono">{x.days}</td>
                      <td className="px-2 py-1.5">{x.exitReason ? t(`tm.exit.${x.exitReason}`) : <span className="text-text-muted">—</span>}</td>
                      <td className="px-2 py-1.5 font-mono whitespace-nowrap">{e ? `${signed(f, e.maeR, 1)} / ${signed(f, e.mfeR, 1)}` : '—'}</td>
                      <td className="px-2 py-1.5">
                        {lesson ? (
                          '✓'
                        ) : (
                          <a className="text-xs underline" href={href('journal', { holding: x.holding.id, tag: 'lesson' })}>
                            {t('tr.writeLesson')}
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-text-muted">{t('tr.note')}</p>
          <Explain mode="coach" title={t('tr.aiTitle')} facts={facts} />
        </div>
      )}
    </Card>
  )
}

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: number }) {
  const color = tone === undefined || !Number.isFinite(tone) || tone === 0 ? '' : tone > 0 ? 'text-up' : 'text-down'
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <Label>{label}</Label>
      <div className={`font-mono text-lg ${color}`}>{value}</div>
      {note && <div className="text-xs text-text-muted">{note}</div>}
    </div>
  )
}

function Breakdown({ title, rows, name }: { title: string; rows: GroupStats[]; name: (key: string) => string }) {
  const f = useI18n()
  const { t, num } = f
  return (
    <div>
      <Label>{title}</Label>
      <table className="mt-1 w-full text-sm">
        <tbody className="divide-y divide-border">
          {rows.map((g) => (
            <tr key={g.key}>
              <td className="py-1">{name(g.key)}</td>
              <td className="py-1 text-right font-mono">{g.n}</td>
              <td className="py-1 text-right font-mono">{num(g.winRate)}%</td>
              <td className={`py-1 text-right font-mono ${g.avgR === undefined ? '' : g.avgR > 0 ? 'text-up' : 'text-down'}`}>{signed(f, g.avgR)}R</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-text-muted">{t('tr.breakdownCols')}</p>
    </div>
  )
}
