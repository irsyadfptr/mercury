import { Explain } from '@/components/Explain'
import { Badge, Label } from '@/components/ui-bits'
import { useI18n } from '@/i18n'
import { GUIDELINE_COUNT, W2_RETRACE, W3_MIN, W4_RETRACE, W5_OF_W1, type Guideline, type WaveAnalysis, type WaveCount, type WaveLevel } from '@/market/waves'
import type { Key } from '@/types'

type Price = (n: number | undefined) => string

const range = ([lo, hi]: readonly [number, number]) => `${lo}–${hi}`
const GUIDE_RANGE: Record<Guideline['id'], string> = {
  w2Retrace: range(W2_RETRACE),
  w3Extended: `≥ ${W3_MIN}`,
  w4Retrace: range(W4_RETRACE),
  alternation: '',
  w5Equality: range(W5_OF_W1),
}
const confLevel = (c: number) => (c >= 0.8 ? 'high' : c >= 0.4 ? 'medium' : 'low')
const arrow = (d: 'up' | 'down') => (d === 'up' ? '▲' : '▼')
/** Waves 3, 5 and C run to targets; 4, A and B pull back into a zone. */
const isTarget = (c: WaveCount) => /[35C]/.test(c.current)

/**
 * The Elliott wave count in words and numbers: where price is in the count and what that wave usually does, the levels for the
 * running wave, what breaks the count, a with-trend trade sketch, every wave measured, the guidelines met, the alternate count,
 * a short guide to the theory, and an AI explanation of the same numbers.
 */
export function WavePanel({ analysis, price, close, symbol, tf }: { analysis: WaveAnalysis; price: Price; close: number; symbol: string; tf: string }) {
  const f = useI18n()
  const { t, num, change } = f
  const wave = analysis.primary
  const pctFrom = (p: number) => change(((p - close) / close) * 100, 1)
  const levelText = (l: WaveLevel) => `${l.k} × ${l.of}`

  return (
    <div className="flex flex-col gap-3">
      <Label>{t('wave.title')}</Label>
      {!wave ? (
        <p className="text-sm text-text-muted">{t('wave.none')}</p>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={`font-label text-[11px] uppercase ${wave.dir === 'up' ? 'text-up' : 'text-down'}`}>
              {arrow(wave.dir)} {t(wave.dir === 'up' ? 'wave.dirUp' : 'wave.dirDown')}
            </span>
            <span className="font-display text-2xl leading-none">{t('wave.inWave', { w: wave.current })}</span>
            <span className="text-text-muted">
              {arrow(wave.currentDir)} {t(`wave.phase.${wave.current}` as Key)}
            </span>
            <Badge tone={confLevel(wave.confidence) === 'low' ? 'warn' : 'neutral'}>
              {t('wave.confidence', { l: t(`wave.conf.${confLevel(wave.confidence)}` as Key), m: Math.round(wave.confidence * GUIDELINE_COUNT), n: GUIDELINE_COUNT })}
            </Badge>
          </div>

          <p>{t(`wave.explain.${wave.current}` as Key)}</p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Tile label={t('wave.invalidLabel')} value={price(wave.invalidation)} note={`${pctFrom(wave.invalidation)} · ${t('wave.invalidNote')}`} warn />
            <Tile
              label={t(isTarget(wave) ? 'wave.nextTarget' : 'wave.nextZone')}
              value={nextLevel(wave) ? price(nextLevel(wave)!.price) : '—'}
              note={nextLevel(wave) ? `${pctFrom(nextLevel(wave)!.price)} · ${levelText(nextLevel(wave)!)}` : t('wave.allHit')}
            />
            <Tile
              label={t('wave.rr')}
              value={wave.plan ? num(wave.plan.rr, 2) : '—'}
              note={wave.plan ? t(wave.plan.kind === 'now' ? 'wave.plan.fromNow' : 'wave.plan.fromZone') : t('wave.plan.none')}
            />
          </div>

          {wave.plan && (
            <p className="rounded-md bg-surface-2 px-3 py-2 font-mono text-xs">
              {t(wave.dir === 'up' ? 'wave.plan.long' : 'wave.plan.short')}: {t('wave.plan.entry')} {price(wave.plan.entry)} · {t('wave.plan.stop')}{' '}
              {price(wave.plan.stop)} (−{num(wave.plan.risk * 100, 1)}%) · {t('wave.plan.target')} {price(wave.plan.target)} (+{num(wave.plan.reward * 100, 1)}%) ·{' '}
              {t('wave.rr')} {num(wave.plan.rr, 2)}
              <span className="mt-1 block font-sans text-text-muted">{t('wave.plan.note')}</span>
            </p>
          )}

          <div className="flex flex-col gap-1">
            <Label>{t(isTarget(wave) ? 'wave.targets' : 'wave.zone')}</Label>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
              {wave.levels.map((l) => (
                <li key={`${l.k}${l.of}`} className={l.hit ? 'text-text-muted' : ''}>
                  {levelText(l)} = {price(l.price)} {l.hit ? `✓ ${t('wave.hit')}` : `(${pctFrom(l.price)})`}
                </li>
              ))}
              {wave.cap !== undefined && (
                <li className="text-warn-text">
                  {t('wave.cap')} {price(wave.cap)}
                </li>
              )}
            </ul>
          </div>

          <WaveTable wave={wave} price={price} />

          {wave.guidelines.length > 0 && (
            <div className="flex flex-col gap-1">
              <Label>{t('wave.guidelines')}</Label>
              <ul className="flex flex-col gap-0.5 text-xs">
                {wave.guidelines.map((g) => (
                  <li key={g.id} className={g.met ? '' : 'text-text-muted'}>
                    {g.met ? `✓ ${t('rule.pass')}` : `✗ ${t('rule.fail')}`} · {t(`wave.g.${g.id}`)}
                    {g.id !== 'alternation' && (
                      <span className="font-mono">
                        {' '}
                        · {num(g.ratio, 2)} ({GUIDE_RANGE[g.id]})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.alternate && (
            <p className="text-xs">
              <span className="font-label text-[11px] text-text-muted uppercase">{t('wave.alternate')}</span>{' '}
              {t('wave.altText', {
                d: t(analysis.alternate.dir === 'up' ? 'wave.dirUp' : 'wave.dirDown'),
                w: analysis.alternate.current,
                p: price(analysis.alternate.invalidation),
                m: Math.round(analysis.alternate.confidence * GUIDELINE_COUNT),
                n: GUIDELINE_COUNT,
              })}
            </p>
          )}
          <p className="text-xs text-text-muted">{t('wave.degree', { n: wave.degree })}</p>

          <Explain title={t('wave.aiTitle', { s: symbol, tf })} facts={waveFacts(analysis, close, f, price)} />
        </div>
      )}

      <details className="rounded-md border border-border px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">{t('wave.guide.title')}</summary>
        <div className="mt-2 flex flex-col gap-2 text-text-muted">
          {(['what', 'legs', 'rules', 'fib', 'app', 'use'] as const).map((k) => (
            <p key={k}>{t(`wave.guide.${k}`)}</p>
          ))}
        </div>
      </details>
      <p className="text-xs text-text-muted">{t('wave.note')}</p>
    </div>
  )
}

/** The first level the running wave hasn't reached yet. */
const nextLevel = (w: WaveCount) => w.levels.find((l) => !l.hit)

function Tile({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <Label>{label}</Label>
      <div className={`font-mono text-lg ${warn ? 'text-warn-text' : ''}`}>{value}</div>
      {note && <div className="text-xs text-text-muted">{note}</div>}
    </div>
  )
}

/** Every wave measured: where it started and ended, the move, its length in bars and its Fibonacci ratio. */
function WaveTable({ wave, price }: { wave: WaveCount; price: Price }) {
  const { t, num, change } = useI18n()
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left font-mono text-xs">
        <caption className="sr-only">{t('wave.table.caption')}</caption>
        <thead className="text-text-muted">
          <tr className="border-b border-border">
            <th scope="col" className="py-1 pr-3 font-normal">{t('wave.table.wave')}</th>
            <th scope="col" className="py-1 pr-3 font-normal">{t('wave.table.move')}</th>
            <th scope="col" className="py-1 pr-3 text-right font-normal">{t('wave.table.change')}</th>
            <th scope="col" className="py-1 pr-3 text-right font-normal">{t('wave.table.bars')}</th>
            <th scope="col" className="py-1 text-right font-normal">{t('wave.table.ratio')}</th>
          </tr>
        </thead>
        <tbody>
          {wave.waves.map((w) => (
            <tr key={w.label} className={`border-b border-border last:border-0 ${w.running ? 'bg-accent-soft' : ''}`}>
              <th scope="row" className="py-1 pr-3 font-medium">
                {w.running ? `(${w.label})` : w.label}
              </th>
              <td className="py-1 pr-3 whitespace-nowrap">
                {price(w.from.price)} → {price(w.to.price)}
              </td>
              <td className={`py-1 pr-3 text-right whitespace-nowrap ${w.change >= 0 ? 'text-up' : 'text-down'}`}>{change(w.change * 100, 1)}</td>
              <td className="py-1 pr-3 text-right">{num(w.bars)}</td>
              <td className="py-1 text-right whitespace-nowrap">{w.ratio ? `${num(w.ratio.value, 2)} × ${w.ratio.of}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-text-muted">{t('wave.table.note')}</p>
    </div>
  )
}

/** The count as plain-text facts for the AI. Every number here comes from the code above. */
function waveFacts({ primary: w, alternate: alt }: WaveAnalysis, close: number, { t, num }: ReturnType<typeof useI18n>, price: Price): string[] {
  if (!w) return []
  const pct = (x: number) => `${x >= 0 ? '+' : '−'}${num(Math.abs(x) * 100, 1)}%`
  const out = [
    `Elliott wave count (display only, code rules, zigzag ${w.degree}× ATR(14)): ${w.dir} impulse, now in wave ${w.current} (${w.currentDir}), confidence ${Math.round(w.confidence * GUIDELINE_COUNT)}/${GUIDELINE_COUNT} guidelines`,
    `Last close ${price(close)}`,
    ...w.waves.map(
      (x) =>
        `Wave ${x.label}${x.running ? ' (running)' : ''}: ${price(x.from.price)} → ${price(x.to.price)} (${pct(x.change)}, ${x.bars} bars${x.ratio ? `, ${num(x.ratio.value, 2)} × ${x.ratio.of}` : ''})`,
    ),
    `Invalidation (hard rule breaks): ${price(w.invalidation)} (${pct((w.invalidation - close) / close)} from close)`,
    `Fibonacci ${isTarget(w) ? 'targets' : 'zone'}: ${w.levels.map((l) => `${l.k} × ${l.of} = ${price(l.price)}${l.hit ? ' (reached)' : ''}`).join('; ')}`,
    ...(w.cap !== undefined ? [`Wave 5 cap (wave 3 shorter than wave 1): ${price(w.cap)}`] : []),
    ...w.guidelines.map((g) => `${g.met ? '✓' : '✗'} guideline · ${t(`wave.g.${g.id}`)} · ${num(g.ratio, 2)}${GUIDE_RANGE[g.id] ? ` (${GUIDE_RANGE[g.id]})` : ''}`),
  ]
  if (w.plan)
    out.push(
      `With-trend sketch (${w.dir === 'up' ? 'long' : 'short'}, ${w.plan.kind === 'now' ? 'from last close' : 'at wave-4 zone'}): entry ${price(w.plan.entry)}, stop ${price(w.plan.stop)} (−${num(w.plan.risk * 100, 1)}%), target ${price(w.plan.target)} (+${num(w.plan.reward * 100, 1)}%), reward/risk ${num(w.plan.rr, 2)}`,
    )
  if (alt) out.push(`Alternate count: ${alt.dir} impulse, wave ${alt.current}, invalid beyond ${price(alt.invalidation)}, confidence ${Math.round(alt.confidence * GUIDELINE_COUNT)}/${GUIDELINE_COUNT}`)
  return out
}
