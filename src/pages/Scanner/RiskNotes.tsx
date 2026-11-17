import { Label } from '@/components/ui-bits'
import { useI18n } from '@/i18n'
import { dailyVol, expectedRange, stopInNoise } from '@/market/expectedRange'
import { arbCheck, LIMITS_VALID_UNTIL } from '@/market/idxLimits'
import type { Bar } from '@/market/indicators'

const WIB_MS = 7 * 3600_000
const todayWib = () => new Date(Date.now() + WIB_MS).toISOString().slice(0, 10)

/** IDX only: warns when the stop is more than one ARB (limit-down day) below the entry. */
export function ArbNote({ entry, stop, price }: { entry: number; stop?: number; price: (n: number) => string }) {
  const { t, num } = useI18n()
  if (stop === undefined) return null
  const a = arbCheck(entry, stop, todayWib())
  if (!a.beyond && !a.expired) return null
  return (
    <p role="status" className={`rounded-md border px-3 py-2 text-sm ${a.beyond ? 'border-warn text-warn-text' : 'border-border text-text-muted'}`}>
      {a.beyond && t('arb.beyond', { p: num(((entry - stop) / entry) * 100, 1), arb: num(a.arbPct * 100, 0), amt: price(a.arb), n: a.days })}
      {a.beyond && a.expired && ' '}
      {a.expired && t('arb.expired', { d: LIMITS_VALID_UNTIL })}
    </p>
  )
}

/**
 * How far the price usually moves over the given horizons (trading days for IDX, calendar days for crypto), from its last
 * 60 daily swings, plus a warning when the stop is inside one normal day's move.
 */
export function ExpectedRange({ daily, horizons, price, entry, stop }: { daily: Bar[]; horizons: number[]; price: (n: number) => string; entry?: number; stop?: number }) {
  const { t, num } = useI18n()
  const sigma = dailyVol(daily)
  const last = daily.at(-1)?.close
  if (sigma === undefined || last === undefined) return null
  const pct = (x: number) => `${num(x * 100, 1)}%`
  const noisy = entry !== undefined && stop !== undefined && stopInNoise(entry, stop, sigma)
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <Label>{t('range.title')}</Label>
      <ul className="mt-1 flex flex-col gap-1 text-sm">
        {horizons.map((d) => {
          const r = expectedRange(last, sigma, d)
          return (
            <li key={d} className="flex flex-wrap items-baseline gap-x-2">
              <span className="w-20 shrink-0 text-text-muted">{t('range.days', { n: d })}</span>
              <span className="font-mono">±{pct(r.move)}</span>
              <span className="font-mono text-xs text-text-muted">
                {t('range.band', { a: price(r.low1), b: price(r.high1), c: price(r.low2), d: price(r.high2) })}
              </span>
            </li>
          )
        })}
      </ul>
      {noisy && <p className="mt-1 text-xs text-warn-text">{t('range.noisy', { p: pct(Math.exp(sigma) - 1) })}</p>}
      <p className="mt-1 text-xs text-text-muted">{t('range.note', { v: pct(sigma) })}</p>
    </div>
  )
}
