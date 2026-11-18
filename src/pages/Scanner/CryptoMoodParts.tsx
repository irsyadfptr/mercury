import { Label } from '@/components/ui-bits'
import { useI18n } from '@/i18n'
import type { CryptoMood, RegimePart } from '@/market/cryptoRegime'
import { dominanceSeries, loadDominanceLog } from '@/market/cryptoRegimeData'
import type { MoodLight } from '@/market/mood'
import type { I18n, Key } from '@/types'

const LIGHT_CLASS: Record<MoodLight, string> = { red: 'text-down', yellow: 'text-warn-text', green: 'text-up' }

/** The numbers behind one part, as a short line. */
function detail(p: RegimePart, f: I18n): string {
  const { t, num } = f
  const v = p.values ?? {}
  const signed = (x: number, d = 1) => `${x >= 0 ? '+' : '−'}${num(Math.abs(x), d)}`
  switch (p.id) {
    case 'btcTrend':
      return t('regime.d.btcTrend', { a: signed(v.vsMa50), b: signed(v.vsMa200), s: t(`regime.slope.${v.slope > 0 ? 'up' : v.slope < 0 ? 'down' : 'flat'}`) })
    case 'altBreadth':
      return t('regime.d.altBreadth', { a: num(v.above200), b: num(v.above50), n: v.counted })
    case 'dominance':
      return t('regime.d.dominance', { d: num(v.dominance, 1), c: signed(v.change, 2) })
    case 'funding':
      return t('regime.d.funding', { a: signed(v.avgPct, 4), n: v.count })
    case 'drawdown':
      return t('regime.d.drawdown', { d: num(v.drawdown), p: num(v.volPctile) })
    case 'momentum':
      return t('regime.d.momentum', { u: num(v.up), n: v.counted })
  }
}

/** Why a part has no score. */
function missing(p: RegimePart, f: I18n): string {
  if (p.id === 'dominance') return f.t('regime.no.dominance', { n: dominanceSeries(loadDominanceLog()).length })
  if (p.id === 'funding') return f.t('regime.no.funding')
  return f.t('regime.no.history')
}

/** Crypto mood v2: score, light and the six weighted parts. */
export function CryptoMoodParts({ mood }: { mood: CryptoMood }) {
  const f = useI18n()
  const { t, num } = f
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <div className={`font-display text-5xl leading-none ${LIGHT_CLASS[mood.light]}`}>{mood.score}</div>
          <div className={`font-label text-[11px] uppercase ${LIGHT_CLASS[mood.light]}`}>● {t(`mood.idx.${mood.light}`)}</div>
        </div>
        <p className="flex-1 text-sm">{t(`mood.idx.advice.${mood.light}`)}</p>
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {mood.parts.map((p) => (
          <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2 text-sm">
            <span className="w-12 shrink-0 font-mono">{p.score === undefined ? '—' : p.score}</span>
            <span className="flex-1">
              {t(`regime.part.${p.id}`)} <span className="text-xs text-text-muted">· {num(p.weight * 100)}%</span>
            </span>
            <span className="w-full pl-[3.75rem] text-xs text-text-muted sm:w-auto sm:pl-0">
              {p.score === undefined ? missing(p, f) : `${t(`regime.${p.id}.${p.label}` as Key)} · ${detail(p, f)}`}
            </span>
          </li>
        ))}
      </ul>
      <Label>{mood.coverage < 0.999 ? t('regime.coverage', { p: num(mood.coverage * 100) }) : t('regime.full')}</Label>
    </div>
  )
}
