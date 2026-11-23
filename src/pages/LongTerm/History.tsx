import { useState } from 'react'
import { Badge, Card, CardTitle, fieldClass, Label } from '@/components/ui-bits'
import { useI18n } from '@/i18n'
import { betterScored, scoreAlert, type ScoreEntry, type ScoreLog } from '@/market/scoreLog'
import { ltScoreColor } from '@/view/bars'
import { COLOR } from '@/view/tokens'
import { ScorePips } from './ScorePips'

const SHOWN = 60
const W = 600
const H = 140

/** Score history per ticker from the local score log: bars = total (0–15), line = price at each check. */
export function ScoreHistory({ log, initial, onPick }: { log: ScoreLog; initial?: string; onPick: (s: string) => void }) {
  const { t, num, day } = useI18n()
  const symbols = Object.keys(log)
    .filter((s) => log[s].length)
    .sort()
  const [chosen, setChosen] = useState<string>()
  const symbol = chosen && log[chosen] ? chosen : initial && log[initial] ? initial : symbols[0]
  if (!symbol) return null
  const entries = log[symbol].slice(-SHOWN)
  const first = entries[0]
  const last = entries.at(-1)!
  const priceChange = first.price && last.price ? ((last.price - first.price) / first.price) * 100 : null

  return (
    <Card aria-label={t('lt.history')} data-tone="teal">
      <CardTitle
        icon="chartUp"
        aside={
          <select className={`${fieldClass} h-8 w-auto normal-case`} value={symbol} onChange={(e) => setChosen(e.target.value)} aria-label={t('lt.historyTicker')}>
            {symbols.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        }
      >
        {t('lt.history')}
      </CardTitle>
      <Chart entries={entries} label={`${symbol}: ${entries.map((e) => `${e.date} ${e.total}/15`).join(', ')}`} />
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
        <span className="text-text-muted">
          {day(first.date)} → {day(last.date)} · {t('lt.checks', { n: entries.length })}
        </span>
        <span className="font-mono">
          {first.total} → {last.total}/15
          {priceChange !== null && (
            <span style={{ color: priceChange >= 0 ? COLOR.up : COLOR.down }}>
              {' '}
              · {t('lt.priceSince', { n: `${priceChange >= 0 ? '+' : '−'}${num(Math.abs(priceChange), 1)}` })}
            </span>
          )}
        </span>
      </div>
      <button type="button" onClick={() => onPick(symbol)} className="mt-2 font-label text-[11px] text-accent-text uppercase underline underline-offset-4">
        {t('lt.recheck', { s: symbol })}
      </button>
    </Card>
  )
}

function Chart({ entries, label }: { entries: readonly ScoreEntry[]; label: string }) {
  const bw = W / Math.max(entries.length, 1)
  const prices = entries.map((e) => e.price).filter((p): p is number => p !== null)
  const lo = Math.min(...prices)
  const hi = Math.max(...prices)
  const y = (p: number) => (hi === lo ? H / 2 : H - 8 - ((p - lo) / (hi - lo)) * (H - 16))
  const line = entries.flatMap((e, i) => (e.price === null ? [] : [`${i * bw + bw / 2},${y(e.price)}`])).join(' ')
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} className="h-[140px] w-full" preserveAspectRatio="none">
      {entries.map((e, i) => {
        const h = (e.total / 15) * H
        return <rect key={e.date} x={i * bw + bw * 0.15} y={H - h} width={bw * 0.7} height={h} rx={1} fill={ltScoreColor(e.total)} fillOpacity={0.55} />
      })}
      {prices.length > 1 && <polyline points={line} fill="none" stroke={COLOR.text} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}

/**
 * Your long-term holdings first: each one's latest score as pips, a warning when it dropped or is low, and logged
 * tickers that score higher (from recent checks and screens). Tapping one checks it.
 */
export function BetterScored({ log, held, onPick }: { log: ScoreLog; held: readonly string[]; onPick: (s: string) => void }) {
  const { t, day } = useI18n()
  const rows = [...new Set(held)].filter((s) => log[s]?.length)
  return (
    <Card aria-label={t('lt.better')} data-tone="green">
      <CardTitle icon="chest" aside={t('lt.betterSub')}>
        {t('lt.better')}
      </CardTitle>
      {!rows.length && <p className="text-sm text-text-muted">{t('lt.betterNone')}</p>}
      <ul className="flex flex-col gap-1.5">
        {rows.map((s) => {
          const alts = betterScored(log, s)
          const last = log[s].at(-1)!
          const alert = scoreAlert(log[s])
          return (
            <li key={s} className="flex flex-col gap-1.5 rounded-lg bg-surface-2 px-3 py-2">
              <button type="button" onClick={() => onPick(s)} className="flex items-center gap-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <span className="w-14 shrink-0 font-semibold">{s}</span>
                <span className="min-w-0 flex-1">
                  <ScorePips total={last.total} label={`${s} ${last.total}/15`} />
                </span>
                <span className="shrink-0 font-display text-2xl leading-none" style={{ color: ltScoreColor(last.total) }}>
                  {last.total}
                  <span className="text-sm text-text-muted">/15</span>
                </span>
              </button>
              <span className="flex flex-wrap items-center gap-1.5 text-xs">
                <Label>{day(last.date)}</Label>
                {alert && (
                  <Badge tone="warn">{alert.kind === 'drop' ? t('lt.dropFrom', { n: alert.from }) : t('lt.lowScore')}</Badge>
                )}
                <span className="ml-auto flex flex-wrap items-center gap-1">
                  {alts.length ? (
                    <>
                      <Label>{t('lt.betterAlts')}</Label>
                      {alts.map((a) => (
                        <button key={a.symbol} type="button" onClick={() => onPick(a.symbol)} className="rounded-md bg-surface px-2 py-0.5 font-mono text-xs hover:ring-1 hover:ring-primary">
                          {a.symbol} {a.entry.total}
                        </button>
                      ))}
                    </>
                  ) : (
                    <Label>{t('lt.bestYet')}</Label>
                  )}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
