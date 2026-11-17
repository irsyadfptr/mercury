import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardTitle, Label, fieldClass } from '@/components/ui-bits'
import { useI18n } from '@/i18n'
import { COIN } from '@/market/binance'
import { scoreCrypto, type CryptoMetric, type CryptoMetricId, type CryptoScore } from '@/market/cryptoFundamentals'
import { CoinNotFound, fetchCryptoFundamentals, type CryptoFundamentals } from '@/market/cryptoFundamentalsData'
import { cachedCoinList, FIXED_LIST } from '@/market/cryptoList'
import { useSettings } from '@/settings'
import type { I18n } from '@/types'
import { ENV_KEY } from '@/useCryptoMarket'
import { ExpectedRange } from '../Scanner/RiskNotes'

const primary = 'font-label text-xs uppercase shadow-[0_3px_0_var(--accent-deep)] active:translate-y-0.5 active:shadow-none'

type Load = { status: 'idle' } | { status: 'loading' } | { status: 'error'; error: 'notFound' | 'failed' } | { status: 'done'; data: CryptoFundamentals; score: CryptoScore }
// Kept outside React so the last check survives page switches.
let last: Load = { status: 'idle' }

const usd = (f: I18n, n: number) => `$${n.toLocaleString(f.locale, n >= 1e4 ? { maximumFractionDigits: 0 } : { maximumSignificantDigits: 5 })}`
const money = (f: I18n, n: number) => `$${n.toLocaleString(f.locale, { notation: 'compact', maximumFractionDigits: 1 })}`

/** How each metric's value and threshold read. */
function show(f: I18n, id: CryptoMetricId, v: number): string {
  switch (id) {
    case 'circulating':
    case 'tvlTrend':
    case 'feesPace':
    case 'volumeShare':
    case 'athDistance':
      return `${f.num(v, 1)}%`
    case 'fdvRatio':
    case 'swing1y':
      return `${f.num(v, 2)}×`
    case 'hardCap':
      return f.t(v === 1 ? 'cryf.yes' : 'cryf.no')
    case 'age':
      return f.t('cryf.years', { n: f.num(v, 1) })
    case 'commits':
      return f.num(v)
    default:
      return money(f, v)
  }
}
const OP: Partial<Record<CryptoMetricId, string>> = { fdvRatio: '≤', swing1y: '≤', tvlTrend: '>', fees30d: '>', revenue1y: '>' }
const limitText = (f: I18n, m: CryptoMetric) => (m.id === 'hardCap' ? f.t('cryf.hasMax') : `${OP[m.id] ?? '≥'} ${show(f, m.id, m.limit)}`)

export function CryptoCheck() {
  const f = useI18n()
  const { t } = f
  const key = useSettings((s) => s.coingeckoKey) || ENV_KEY
  const [load, setLoadState] = useState(last)
  const setLoad = (l: Load) => setLoadState((last = l))
  const [input, setInput] = useState(load.status === 'done' ? load.data.symbol : '')
  const coins = (cachedCoinList() ?? FIXED_LIST).coins.slice(0, 12)

  const run = async (symbol: string) => {
    if (!key) return
    setInput(symbol)
    setLoad({ status: 'loading' })
    try {
      const data = await fetchCryptoFundamentals(symbol, key)
      setLoad({ status: 'done', data, score: scoreCrypto(data.input) })
    } catch (e) {
      setLoad({ status: 'error', error: e instanceof CoinNotFound ? 'notFound' : 'failed' })
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const s = input.trim().toUpperCase()
    if (COIN.test(s)) void run(s)
  }

  return (
    <Card>
      <CardTitle icon="chartUp">{t('cryf.title')}</CardTitle>
      {!key ? (
        <p className="text-sm">{t('cryf.needKey')}</p>
      ) : (
        <>
          <form onSubmit={submit} className="mb-2 flex flex-wrap gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="ETH" aria-label={t('scan.ticker')} className={`${fieldClass} max-w-32 font-mono uppercase`} />
            <Button type="submit" disabled={load.status === 'loading'} className={primary}>
              {load.status === 'loading' ? t('scan.loading') : t('scan.run')}
            </Button>
          </form>
          <div className="mb-4 flex flex-wrap gap-1">
            {coins.map((c) => (
              <button key={c} type="button" onClick={() => void run(c)} className="rounded border border-border px-2 py-0.5 font-mono text-xs text-text-muted hover:bg-surface-2 hover:text-text">
                {c}
              </button>
            ))}
          </div>
          {load.status === 'error' && <p className="text-sm text-down">{t(load.error === 'notFound' ? 'cryf.notFound' : 'cryf.failed')}</p>}
          {load.status === 'done' && <Result data={load.data} score={load.score} />}
        </>
      )}
    </Card>
  )
}

function Result({ data, score: s }: { data: CryptoFundamentals; score: CryptoScore }) {
  const f = useI18n()
  const { t } = f
  const price = (n: number) => usd(f, n)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-display text-4xl leading-none">{data.symbol}</div>
          <div className="text-sm text-text-muted">
            {[data.name, data.rank !== null && `#${data.rank}`, data.price !== null && price(data.price)].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="text-right">
          <Label>{t('lt.total')}</Label>
          <div className="font-display text-5xl leading-none">
            {s.total}/{s.max}
          </div>
          {s.known < s.max && <div className="text-xs text-text-muted">{t('cryf.known', { n: s.known, m: s.max })}</div>}
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {s.parts.map((p) => (
          <div key={p.id} className="rounded-md border border-border">
            <div className="flex items-baseline justify-between bg-surface-2 px-3 py-2">
              <div>
                <Label>{t(`cryf.part.${p.id}`)}</Label>
                <div className="text-xs text-text-muted">
                  {p.id === 'usage' ? (data.usageSource ? t(`cryf.usage.${data.usageSource.kind}`, { s: data.usageSource.name }) : t('cryf.usage.none')) : t(`cryf.part.${p.id}.d`)}
                </div>
              </div>
              <div className="font-display text-3xl leading-none">
                {p.score}/{p.metrics.length}
              </div>
            </div>
            <ul className="flex flex-col divide-y divide-border">
              {p.metrics.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 px-3 py-2 text-sm">
                  <span className={`w-14 shrink-0 font-label text-[11px] uppercase ${m.pass ? 'text-up' : m.pass === false ? 'text-down' : 'text-text-muted'}`}>
                    {m.pass ? `✓ ${t('rule.pass')}` : m.pass === false ? `✗ ${t('rule.fail')}` : `? ${t('rule.unknown')}`}
                  </span>
                  <span className="flex-1">{t(`cryf.m.${m.id}`)}</span>
                  <span className="w-full pl-[4.25rem] font-mono text-xs text-text-muted">
                    {m.value === null ? t('lt.noData') : show(f, m.id, m.value)} · {limitText(f, m)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <ExpectedRange daily={data.daily} horizons={[7, 30, 90]} price={price} />
      <p className="text-xs text-text-muted">{t('cryf.note')}</p>
    </div>
  )
}
