import { Card, CardTitle, Label } from '@/components/ui-bits'
import { DEFAULT_BREAKER, type Breaker, type BreakerStatus } from '@/domain/circuitBreaker'
import { useI18n } from '@/i18n'
import { href } from '@/routes'
import { useSettings } from '@/settings'
import type { I18n } from '@/types'
import { useBreakers } from '@/useGate'

const STATUS_CLASS: Record<BreakerStatus, string> = { allowed: 'text-up', cooldown: 'text-warn-text', halted: 'text-down' }

const signed = (f: I18n, x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${f.num(Math.abs(x), 2)}%`

/** "May I open new risk today?" for real and paper trades, with the numbers behind it. */
export function BreakerCard() {
  const f = useI18n()
  const { t } = f
  const b = useBreakers()
  const s = useSettings((x) => x.breaker) ?? DEFAULT_BREAKER
  return (
    <Card>
      <CardTitle icon="heart" aside={<a className="hover:underline" href={href('settings')}>{t('cb.limits', { d: s.dailyPct, w: s.weeklyPct, m: s.monthlyPct, n: s.streak })}</a>}>
        {t('cb.title')}
      </CardTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Side title={t('tr.kind.real')} b={b.real} />
        <Side title={t('tr.kind.paper')} b={b.paper} />
      </div>
      <p className="mt-3 text-xs text-text-muted">{t('cb.note')}</p>
    </Card>
  )
}

function Side({ title, b }: { title: string; b: Breaker }) {
  const f = useI18n()
  const { t } = f
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <Label>{title}</Label>
      <div className={`font-display text-3xl leading-none uppercase ${STATUS_CLASS[b.status]}`}>{t(`cb.status.${b.status}`)}</div>
      <ul className="mt-1 text-sm">
        {b.rules.map((r) => (
          <li key={r.id} className={STATUS_CLASS[b.status]}>
            {t(`cb.rule.${r.id}`, { o: r.id === 'streak' ? f.num(r.observed) : f.num(r.observed, 2), l: f.num(r.limit, 2), d: r.resumes ? f.day(r.resumes) : '' })}
          </li>
        ))}
      </ul>
      <p className="mt-1 font-mono text-xs text-text-muted">
        {t('cb.metrics', { d: signed(f, b.todayPct), w: signed(f, b.weekPct), m: signed(f, b.monthPct), n: b.streak })}
      </p>
    </div>
  )
}
