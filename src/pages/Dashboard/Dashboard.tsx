import { useEffect, useState } from 'react'
import { PixelIcon } from '@/components/PixelIcon'
import { Button } from '@/components/ui/button'
import { Card, CardTitle, Label, Segments } from '@/components/ui-bits'
import { heatTier, level, quests, speedOf } from '@/domain/portfolio'
import { loadScanLog, scanChanges } from '@/market/scanLog'
import { useI18n } from '@/i18n'
import { href } from '@/routes'
import { useSettings } from '@/settings'
import type { AllocationItem, I18n, Quest, RiskStatus, Row, Summary } from '@/types'
import { WATCHLIST } from '@/market/coingecko'
import { useCryptoMarket } from '@/useCryptoMarket'
import { useNow } from '@/useNow'
import { useSummary } from '@/useSummary'
import { allocation, tileFontSize, treemap } from '@/view/allocation'
import { flameSizes, heatBar, moodBar, moodColor, riskBar, xpBar } from '@/view/bars'
import { ASSET_CLASS_TILE, COLOR, signColor } from '@/view/tokens'
import type { QuestView, StatTile } from './Dashboard.types'

export function Dashboard() {
  const summary = useSummary()
  if (!summary.rows.length) return <EmptyDashboard />
  return (
    <>
      <Hero summary={summary} />
      <div className="flex flex-wrap gap-4">
        <HeatCard heat={summary.heat} />
        <TradeRisk rows={summary.rows} />
        <MoodCard />
      </div>
      <Inventory summary={summary} />
      <Quests summary={summary} />
    </>
  )
}

function EmptyDashboard() {
  const { t } = useI18n()
  return (
    <Card className="flex flex-col items-center gap-3 py-16 text-center">
      <PixelIcon name="chest" size={48} />
      <h1 className="font-display text-4xl leading-none uppercase">{t('empty.title')}</h1>
      <p className="text-text-muted">{t('empty.body')}</p>
      <a href={href('portfolio')} className="font-label text-xs text-accent-text uppercase underline underline-offset-4">
        {t('pf.add')}
      </a>
    </Card>
  )
}

// ---- Net worth count-up ----

const COUNT_UP_MS = 1000
let countedThisVisit = false

/** Cash-counter roll-up on the first dashboard view of a visit; skipped when hidden or under reduced motion. */
function useCountUp(target: number): number {
  const [animate] = useState(() => {
    const yes = !countedThisVisit && !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches
    countedThisVisit = true
    return yes
  })
  // Progress 0–1 while rolling; null = show the live value.
  const [progress, setProgress] = useState<number | null>(animate ? 0 : null)
  useEffect(() => {
    if (!animate) return
    // A timer, not requestAnimationFrame: rAF can stall in hidden panes and leave the number at 0.
    const start = performance.now()
    const id = setInterval(() => {
      const p = Math.min(1, (performance.now() - start) / COUNT_UP_MS)
      setProgress(p < 1 ? p : null)
      if (p >= 1) clearInterval(id)
    }, 16)
    // Safe under StrictMode's double effect run: the second run restarts the roll.
    return () => clearInterval(id)
  }, [animate])
  return progress === null ? target : target * easeOutCubic(progress)
}

const easeOutCubic = (p: number) => 1 - (1 - p) ** 3

// ---- Hero ----

/** Pure: the four stat tiles under net worth. */
function statTiles(s: Summary, heatLimit: number, f: I18n): StatTile[] {
  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${f.compact(Math.abs(n))}`
  const unrealizedPct = s.invested ? (s.unrealized / s.invested) * 100 : 0
  return [
    { label: f.t('dash.invested'), value: f.compact(s.invested), sub: f.money(s.invested), color: COLOR.text },
    {
      label: f.t('dash.unrealized'),
      value: signed(s.unrealized),
      sub: `${unrealizedPct >= 0 ? '▲' : '▼'} ${f.num(Math.abs(unrealizedPct), 2)}% ${f.t('dash.vsInvested', { amount: f.compact(s.invested) })}`,
      color: signColor(s.unrealized),
    },
    { label: f.t('dash.realized'), value: signed(s.realized), sub: f.t('dash.fromSells'), color: signColor(s.realized) },
    { label: f.t('dash.heat'), value: `${f.num(s.heat, 1)}%`, sub: f.t('dash.ofLimit', { n: heatLimit }), color: COLOR.text },
  ]
}

const LEVEL_UP_SOON = 0.9

function Hero({ summary }: { summary: Summary }) {
  const f = useI18n()
  const { t, compact, num } = f
  const heatLimit = useSettings((x) => x.heatLimit)
  const shown = useCountUp(summary.netWorth)
  const lv = level(summary.netWorth)
  const xpPct = Math.round(lv.xp * 100)

  return (
    <Card aria-label={t('dash.netWorth')} className="flex flex-wrap gap-4">
      <div className="flex min-w-0 flex-[3_1_440px] flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <Label>{t('dash.netWorth')}</Label>
          <span className="rounded-md bg-primary px-2 py-0.5 font-label text-[11px] font-bold text-primary-foreground shadow-[0_2px_0_var(--accent-deep)]">
            {t('dash.level')} {lv.level}
          </span>
          {lv.xp >= LEVEL_UP_SOON && <span className="glow font-label text-[11px] text-accent-text uppercase">▲ {t('dash.levelUpSoon')}</span>}
        </div>
        <div className="flex items-baseline gap-1.5 leading-[0.8]">
          <span className="font-display text-4xl text-text-muted">Rp</span>
          <span className="font-display text-[clamp(56px,9vw,104px)] tabular-nums" aria-live="off">
            {num(Math.round(shown))}
          </span>
        </div>
        {summary.missingFx.length > 0 && <p className="text-xs text-warn-text">{t('quest.fxRate')}</p>}
        <div className="flex flex-col gap-1.5 pt-1.5">
          <div className="flex justify-between gap-2">
            <Label className="text-text">{t('dash.xpTo', { n: lv.level + 1 })}</Label>
            <Label>{t('dash.xpNote', { amount: compact(lv.next - summary.netWorth), pct: xpPct })}</Label>
          </div>
          <Segments items={xpBar(lv.xp)} height={14} label={`${t('dash.level')} ${lv.level}: ${xpPct}%`} />
        </div>
      </div>
      <div className="grid flex-[2_1_300px] grid-cols-2 gap-2">
        {statTiles(summary, heatLimit, f).map((x) => (
          <div key={x.label} className="flex flex-col gap-0.5 rounded-lg bg-surface-2 px-3 py-2.5">
            <Label>{x.label}</Label>
            <span className="font-display text-[34px] leading-none" style={{ color: x.color }}>
              {x.value}
            </span>
            <span className="text-[11px] text-text-muted">{x.sub}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ---- Heat ----

function HeatCard({ heat }: { heat: number }) {
  const { t, num } = useI18n()
  const limit = useSettings((x) => x.heatLimit)
  const { tier, flames } = heatTier(heat, limit)
  const hot = flames >= 2
  const numberColor = tier === 'overheated' ? COLOR.fireRed : hot ? COLOR.fireOrange : COLOR.text
  const tierLabel = t(`heat.${tier}`)

  return (
    <Card aria-label={t('heat.title')} className="flex min-w-0 flex-[2_1_340px] flex-col gap-3" style={hot ? { background: COLOR.fireSoft, borderColor: COLOR.fireEdge } : undefined}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-3xl leading-none uppercase">{t('heat.title')}</h2>
        <span className={`rounded-md px-2 py-0.5 font-label text-[11px] uppercase ${flames ? 'bg-fire-red text-white' : 'bg-surface-2 text-text-muted'}`}>{tierLabel}</span>
      </div>
      <div className="flex min-h-[88px] items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-display text-7xl leading-[0.85]" style={{ color: numberColor }}>
            {num(heat, 1)}%
          </span>
          <Label>{t('heat.explain', { n: limit })}</Label>
        </div>
        <div aria-hidden="true" className="flex items-end gap-0.5">
          {flameSizes(flames).map((size, i) => (
            <PixelIcon key={i} name="flame" size={size} className="flame" />
          ))}
        </div>
      </div>
      <Segments items={heatBar(heat, limit)} height={16} label={`${t('heat.title')} ${num(heat, 1)}% / ${limit}%: ${tierLabel}`} />
    </Card>
  )
}

// ---- Crypto mood ----

function MoodCard() {
  const { t, locale, num, change } = useI18n()
  const { mood, prices, at, status, hasKey, refresh } = useCryptoMarket()
  const tone = mood && moodColor(mood.value)
  const extreme = mood != null && (mood.value < 25 || mood.value > 75)
  return (
    <Card
      aria-label={t('mood.title')}
      className="flex min-w-0 flex-[1_1_240px] flex-col gap-3"
      // Pops off the page without tinting the surface: zone-coloured thick border, hard pixel drop shadow, soft halo.
      style={tone ? { border: `2px solid ${tone}`, boxShadow: `0 5px 0 ${tone}, 0 0 28px color-mix(in oklch, ${tone} 40%, transparent)` } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-3xl leading-none uppercase">{t('mood.title')}</h2>
        {mood && (
          <span className={`rounded-md px-2 py-0.5 font-label text-[11px] font-bold uppercase ${extreme ? 'glow' : ''}`}
            // Yellow (neutral) needs dark text to stay readable.
            style={{ background: tone, color: tone === COLOR.warn ? 'oklch(0.22 0.03 275)' : 'white' }}
          >
            {mood.sentiment}
          </span>
        )}
      </div>
      {!hasKey ? (
        <p className="text-sm text-text-muted">{t('mood.noKey')}</p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="font-display text-7xl leading-[0.85]" style={{ color: tone }}>
              {mood ? mood.value : '–'}
            </span>
            <Label>{t('mood.source')}</Label>
          </div>
          {mood && <Segments items={moodBar(mood.value)} height={14} label={`${t('mood.title')} ${mood.value} / 100: ${mood.sentiment}`} />}
          {prices && (
            <ul aria-label={t('mood.prices')} className="flex flex-col gap-1 border-t border-border pt-2">
              {WATCHLIST.map((sym) => {
                const p = prices[sym]
                if (p?.usd == null) return null
                const ch = p.usd_24h_change ?? 0
                return (
                  <li key={sym} className="flex items-baseline justify-between gap-2 text-sm tabular-nums">
                    <span className="font-label text-[11px] uppercase">{sym}</span>
                    <span className="ml-auto">${num(p.usd, p.usd < 10 ? 4 : 2)}</span>
                    <span className="w-16 text-right text-xs" style={{ color: signColor(ch) }}>
                      {change(ch, 1)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          {status === 'error' && <p className="text-xs text-down">{t('mood.error')}</p>}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
            <Label>{at ? t('mood.updated', { t: new Date(at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) }) : ''}</Label>
            <Button size="sm" variant="outline" disabled={status === 'loading'} onClick={() => void refresh()}>
              {t('mood.refresh')}
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}

// ---- Trade risk ----

/** Pure: the short note next to a trade's health bar. */
function riskNote(status: RiskStatus, limit: number, f: I18n): string {
  switch (status.kind) {
    case 'noStop':
      return f.t('risk.noStop')
    case 'over':
      return f.t('risk.over', { n: f.num(status.overBy, 2) })
    case 'close':
      return `${f.num(status.pct, 2)} / ${f.num(limit, 1)}% · ${f.t('risk.close')}`
    case 'safe':
      return `${f.num(status.pct, 2)} / ${f.num(limit, 1)}%`
  }
}

const isAlarming = (s: RiskStatus) => s.kind === 'noStop' || s.kind === 'over'

function TradeRisk({ rows }: { rows: readonly Row[] }) {
  const f = useI18n()
  const limit = useSettings((x) => x.tradeLimit)
  const bars = rows.flatMap(({ holding, risk }) => {
    const bar = riskBar(risk, limit)
    return bar ? [{ holding, ...bar, note: riskNote(bar.status, limit, f) }] : []
  })

  return (
    <Card aria-label={f.t('risk.title')} className="min-w-0 flex-[3_1_460px]">
      <CardTitle icon="heart" aside={f.t('risk.limit', { n: limit })}>
        {f.t('risk.title')}
      </CardTitle>
      {!bars.length && <p className="text-sm text-text-muted">{f.t('risk.empty')}</p>}
      {bars.map(({ holding, status, segments, note }) => (
        <div key={holding.id} className="flex flex-col gap-1.5 border-t border-border py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">
              {holding.symbol} {holding.paper && <span className="font-label text-[11px] text-accent-text uppercase">· {f.t('badge.paper')}</span>}
            </span>
            <span className="font-label text-[11px] uppercase" style={{ color: isAlarming(status) ? COLOR.down : COLOR.muted }}>
              {note}
            </span>
          </div>
          <Segments items={segments} label={`${holding.symbol}: ${note}`} />
        </div>
      ))}
    </Card>
  )
}

// ---- Inventory ----

function Inventory({ summary }: { summary: Summary }) {
  const { t, num } = useI18n()
  const items = allocation(summary.byClass, summary.netWorth)
  const map = treemap(items)
  if (!map) return null
  const description = items.map((i) => `${t(`class.${i.assetClass}`)} ${num(i.pct, 0)}%`).join(', ')

  return (
    <Card aria-label={t('inv.title')}>
      <CardTitle icon="chest" aside={t('inv.speed')}>
        {t('inv.title')}
      </CardTitle>
      <div role="img" aria-label={description} className="flex h-[230px] gap-2">
        <Tile item={map.first} largest />
        {map.second && (
          <div className="flex min-w-0 flex-col gap-2" style={{ flex: `${map.rightWeight} 1 0` }}>
            <div className="flex min-h-0" style={{ flex: `${map.second.value} 1 0` }}>
              <Tile item={map.second} />
            </div>
            {map.rest.length > 0 && (
              <div className="flex min-h-0 gap-2" style={{ flex: `${map.restWeight} 1 0` }}>
                {map.rest.map((item) => (
                  <Tile key={item.assetClass} item={item} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

/** Show the IDR amount only on blocks big enough to fit it. */
const SHOW_AMOUNT_FROM_PCT = 15

function Tile({ item, largest = false }: { item: AllocationItem; largest?: boolean }) {
  const { t, money, num } = useI18n()
  const colors = ASSET_CLASS_TILE[item.assetClass]
  return (
    <div
      className="flex min-w-0 flex-col justify-between overflow-hidden rounded-lg p-3 shadow-[inset_0_-4px_0_oklch(0_0_0/0.12)]"
      style={{ flex: `${item.value} 1 0`, background: colors.bg, color: colors.fg }}
    >
      <span className="truncate font-label text-[11px] uppercase">
        {t(`class.${item.assetClass}`)} {'★'.repeat(speedOf(item.assetClass))}
      </span>
      <div>
        <div className="font-display leading-[0.85]" style={{ fontSize: tileFontSize(item.pct, largest) }}>
          {num(item.pct, 0)}%
        </div>
        {(largest || item.pct >= SHOW_AMOUNT_FROM_PCT) && <div className="pt-1 font-mono text-xs">{money(item.value)}</div>}
      </div>
    </div>
  )
}

// ---- Quests ----

/** Pure: how a quest reads and where it sends you. */
function describeQuest(q: Quest, f: I18n): QuestView {
  switch (q.kind) {
    case 'setStop':
      return { label: f.t('quest.setStop', { s: q.holding.symbol }), tag: '', route: 'portfolio' }
    case 'overRisk':
      return { label: f.t('quest.overRisk', { s: q.holding.symbol, n: f.num(q.pct, 2) }), tag: '', route: 'portfolio' }
    case 'stalePrice':
      return {
        label: f.t('quest.stalePrice', { s: q.holding.symbol }),
        tag: q.days == null ? f.t('quest.stalePriceNever') : f.t('quest.stalePriceAge', { d: q.days }),
        route: 'portfolio',
      }
    case 'backup':
      return { label: f.t('quest.backup'), tag: q.days == null ? f.t('quest.backupNever') : f.t('quest.backupAge', { d: q.days }), route: 'settings' }
    case 'fxRate':
      return { label: f.t('quest.fxRate'), tag: '', route: 'settings' }
  }
}

/** New setups from each market's last scan vs the one before (the Scanner records them). */
function scanAlerts(f: I18n): QuestView[] {
  return (['idx', 'crypto'] as const).flatMap((m) => {
    const c = scanChanges(loadScanLog(m))
    if (!c) return []
    const tag = f.day(c.date)
    return [
      ...(c.newPassing.length ? [{ label: f.t('quest.newSetups', { s: c.newPassing.join(', ') }), tag, route: 'scanner' as const }] : []),
      ...(c.newInZone.length ? [{ label: f.t('quest.newInZone', { s: c.newInZone.join(', ') }), tag, route: 'scanner' as const }] : []),
    ]
  })
}

function Quests({ summary }: { summary: Summary }) {
  const f = useI18n()
  const tradeLimit = useSettings((x) => x.tradeLimit)
  const lastExportAt = useSettings((x) => x.lastExportAt)
  const now = useNow()
  const list = [...quests(summary, { tradeLimit, lastExportAt, now }).map((q) => describeQuest(q, f)), ...scanAlerts(f)]

  return (
    <Card aria-label={f.t('quests.title')}>
      <CardTitle icon="star" aside={f.t('quests.sub')}>
        {f.t('quests.title')}
      </CardTitle>
      {!list.length && <p className="text-sm text-text-muted">{f.t('quests.none')}</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {list.map((q) => (
          <li key={`${q.route}:${q.label}`}>
            <a
              href={href(q.route)}
              className="flex items-center gap-2.5 rounded-lg bg-surface-2 px-3 py-2 hover:ring-1 hover:ring-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span aria-hidden="true" className="size-4 shrink-0 rounded border-2 border-text-muted" />
              <span className="flex-grow">{q.label}</span>
              {q.tag && <Label>{q.tag}</Label>}
            </a>
          </li>
        ))}
      </ul>
    </Card>
  )
}
