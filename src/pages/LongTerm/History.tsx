import { useState } from 'react'
import { Card, CardTitle, fieldClass, Label } from '@/components/ui-bits'
import { useI18n } from '@/i18n'
import { betterScored, LT_LOW_SCORE, type ScoreEntry, type ScoreLog } from '@/market/scoreLog'
import { COLOR } from '@/view/tokens'

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
    <Card aria-label={t('lt.history')}>
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
        return <rect key={e.date} x={i * bw + bw * 0.15} y={H - h} width={bw * 0.7} height={h} rx={1} fill={e.total < LT_LOW_SCORE ? COLOR.warn : 'var(--accent-soft)'} />
      })}
      {prices.length > 1 && <polyline points={line} fill="none" stroke={COLOR.text} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}

/** Each long-term holding next to logged tickers that score higher (from recent checks and screens). */
export function BetterScored({ log, held, onPick }: { log: ScoreLog; held: readonly string[]; onPick: (s: string) => void }) {
  const { t } = useI18n()
  const rows = [...new Set(held)].filter((s) => log[s]?.length)
  return (
    <Card aria-label={t('lt.better')}>
      <CardTitle icon="star" aside={t('lt.betterSub')}>
        {t('lt.better')}
      </CardTitle>
      {!rows.length && <p className="text-sm text-text-muted">{t('lt.betterNone')}</p>}
      <ul className="flex flex-col">
        {rows.map((s) => {
          const alts = betterScored(log, s)
          return (
            <li key={s} className="flex flex-wrap items-center gap-2 border-b border-border py-2 text-sm">
              <span className="font-semibold">{s}</span>
              <span className="font-mono text-text-muted">{log[s].at(-1)!.total}/15</span>
              <span aria-hidden="true" className="flex-grow -translate-y-1 border-b-[1.5px] border-dotted border-border" />
              {alts.length ? (
                alts.map((a) => (
                  <button key={a.symbol} type="button" onClick={() => onPick(a.symbol)} className="rounded-md bg-surface-2 px-2 py-1 font-mono text-xs hover:ring-1 hover:ring-primary">
                    {a.symbol} {a.entry.total}/15
                  </button>
                ))
              ) : (
                <Label>{t('lt.bestYet')}</Label>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
