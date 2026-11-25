import { type ReactNode, useEffect, useState } from 'react'
import { PixelIcon } from '@/components/PixelIcon'
import { Button } from '@/components/ui/button'
import { useCashflow } from '@/cashflowStore'
import { HeatMeter } from '@/components/HeatMeter'
import { describeQuest } from '@/components/questText'
import { TradeList } from '@/components/TradeList'
import { Card, CardTitle, Label, Segments, TonePanel } from '@/components/ui-bits'
import { accountsTotal } from '@/domain/accounts'
import { billsDue, dueTag } from '@/domain/bills'
import { localDate, monthOf, monthSummary } from '@/domain/cashflow'
import { exchangeParams, exchangeParamsOf, isTradeMarket, marketOfClass, MARKET_PAGES, tradeMarketOfScan, type TradeMarket } from '@/domain/markets'
import { heatTier, level, openGroup, quests, speedOf, winnersLosers } from '@/domain/portfolio'
import { freshSignals, loadScanLog, loadShortLog, scanChanges } from '@/market/scanLog'
import { scoreAlert, type ScoreLog } from '@/market/scoreLog'
import { useI18n } from '@/i18n'
import { AccountChips, DueBills } from '@/pages/Cashflow/MoneyNow'
import { SafeSpend } from '@/pages/Cashflow/SafeSpend'
import { PortfolioReview } from '@/pages/Market/Holdings'
import { href } from '@/routes'
import { useBreakers } from '@/useGate'
import type { Breaker } from '@/domain/circuitBreaker'
import { useSettings } from '@/settings'
import type { AllocationItem, Bill, CashEntry, Holding, I18n, JournalEntry, PixelIconName, QuestView, Row, Summary, Transaction } from '@/types'
import { WATCHLIST } from '@/market/coingecko'
import { exitLessonsDue, journalStreak } from '@/domain/journal'
import { useStore } from '@/store'
import { useCashEntries } from '@/useCashEntries'
import { useCryptoMarket } from '@/useCryptoMarket'
import { useNow } from '@/useNow'
import { longTermSymbols, useScoreLog } from '@/useScoreLog'
import { useSummary } from '@/useSummary'
import { allocation, tileFontSize, treemap } from '@/view/allocation'
import { budgetBar, moodBar, moodColor, xpBar } from '@/view/bars'
import { ASSET_CLASS_TILE, COLOR, signColor } from '@/view/tokens'
import type { StatTile } from './Dashboard.types'

/**
 * Home, the daily glance, most-needed first: what you're worth and where it is (accounts, investing, running trades),
 * what to do today (quests), what you can spend today and how the month is going, then where the money sits and the
 * heat, winners and losers, the market's mood, and the AI review of everything. Each market has its own page.
 * Money, the month and quests show even without holdings; only the holding cards wait for a first holding.
 */
export function Dashboard() {
  const summary = useSummary()
  const { entries } = useCashEntries()
  const today = localDate(useNow())
  const hasHoldings = summary.rows.length > 0
  return (
    <div className="play-skin contents">
      <div aria-hidden="true" className="play-confetti" />
      <Hero summary={summary} entries={entries} today={today} />
      <Quests summary={summary} />
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2">
        <SafeSpend entries={entries} today={today} />
        <MonthCard />
      </div>
      {!hasHoldings && <EmptyDashboard />}
      {hasHoldings && (
        <div className="flex flex-wrap gap-4">
          <Inventory summary={summary} />
          <HeatCard heat={summary.heat} />
        </div>
      )}
      <div className="flex flex-wrap gap-4">
        {hasHoldings && <WinnersLosers rows={summary.rows} />}
        <MoodCard />
      </div>
      <PortfolioReview />
    </div>
  )
}

// ---- Winners and losers ----

/** Best and worst open holdings by unrealized %, with a bar sized against the biggest move shown. */
function WinnersLosers({ rows }: { rows: readonly Row[] }) {
  const { t, compact, num } = useI18n()
  const { winners, losers } = winnersLosers(rows)
  const max = Math.max(1, ...[...winners, ...losers].map((r) => Math.abs(r.v.unrealizedPct)))
  const list = (title: string, items: Row[], up: boolean) => (
    <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5">
      <Label className="flex items-center gap-1.5">
        <PixelIcon name={up ? 'arrowUp' : 'arrowDown'} size={12} color={up ? COLOR.up : COLOR.down} />
        {title}
      </Label>
      {!items.length && <p className="text-sm text-text-muted">{t(up ? 'wl.noWinners' : 'wl.noLosers')}</p>}
      <ul className="flex flex-col gap-1.5">
        {items.map((r) => (
          <li key={r.holding.id}>
            <a href={href(marketOfClass(r.holding.assetClass), { view: 'holdings', ...exchangeParamsOf(r.holding.assetClass) })} className="flex flex-col gap-1 rounded-lg bg-surface-2 px-3 py-2 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{r.holding.symbol}</span>
                <span className="font-display text-xl leading-none" style={{ color: up ? COLOR.up : COLOR.down }}>
                  {up ? '▲' : '▼'}
                  {num(Math.abs(r.v.unrealizedPct), 1)}%
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2 flex-1 overflow-hidden rounded bg-empty">
                  <span className="block h-full rounded" style={{ width: `${(Math.abs(r.v.unrealizedPct) / max) * 100}%`, background: up ? COLOR.up : COLOR.down }} />
                </span>
                <span className="font-mono text-xs text-text-muted">
                  {up ? '+' : '−'}
                  {compact(Math.abs(r.v.unrealized * (Number.isFinite(r.v.fx) ? r.v.fx : 1)))}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
  return (
    <Card aria-label={t('wl.title')} data-tone="teal" className="min-w-0 flex-[3_1_460px]">
      <CardTitle icon="chartUp" aside={t('wl.sub')}>
        {t('wl.title')}
      </CardTitle>
      <div className="flex flex-wrap gap-4">
        {list(t('wl.winners'), winners, true)}
        {list(t('wl.losers'), losers, false)}
      </div>
    </Card>
  )
}

function EmptyDashboard() {
  const { t } = useI18n()
  return (
    <Card data-tone="gold" className="flex flex-col items-center gap-3 py-8 text-center">
      <PixelIcon name="chest" size={40} />
      <h2 className="font-display text-3xl leading-none uppercase">{t('empty.title')}</h2>
      <p className="text-text-muted">{t('empty.body')}</p>
      <p className="font-label text-xs uppercase">{t('pf.add')}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {MARKET_PAGES.map((m) => (
          <a key={m} href={href(m, { view: 'holdings' })} className="font-label text-xs text-accent-text uppercase underline underline-offset-4">
            {t(`nav.${m}`)}
          </a>
        ))}
      </div>
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
    {
      label: f.t('dash.realized'),
      value: signed(s.realized + s.dividends),
      sub: s.dividends ? f.t('dash.withDividends', { amount: f.compact(s.dividends) }) : f.t('dash.fromSells'),
      color: signColor(s.realized + s.dividends),
    },
    { label: f.t('dash.heat'), value: `${f.num(s.heat, 1)}%`, sub: f.t('dash.ofLimit', { n: heatLimit }), color: COLOR.text },
  ]
}

const LEVEL_UP_SOON = 0.9

/** One part of total money inside the hero: a tinted panel with its own colour, icon, label and amount. */
function Part({ tone, icon, label, value, aside, children }: { tone: string; icon: PixelIconName; label: string; value: number; aside?: ReactNode; children?: ReactNode }) {
  const { compact } = useI18n()
  return (
    <TonePanel tone={tone}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md border-2 border-text" style={{ background: 'var(--tone)' }}>
            <PixelIcon name={icon} size={14} color="oklch(0.24 0.03 275)" />
          </span>
          <Label className="text-text">{label}</Label>
        </span>
        {aside && <span className="font-label text-[11px] uppercase">{aside}</span>}
      </div>
      <span className="font-display text-[32px] leading-none" style={{ color: value < 0 ? COLOR.down : undefined }}>
        {value < 0 ? '−' : ''}
        {compact(Math.abs(value))}
      </span>
      {children}
    </TonePanel>
  )
}

function Hero({ summary, entries, today }: { summary: Summary; entries: readonly CashEntry[]; today: string }) {
  const f = useI18n()
  const { t, compact } = f
  const heatLimit = useSettings((x) => x.heatLimit)
  const accounts = useCashflow((s) => s.accounts)
  // Net worth = holdings + money in accounts. Heat and position sizing stay on holdings (trading capital).
  const cash = accountsTotal(accounts, entries)
  const total = summary.netWorth + cash
  const shown = useCountUp(total)
  const lv = level(total)
  const { rows: trades, pnl: tradePnl } = openGroup(summary.rows, 'trading')
  const { rows: investing, pnl: investingPnl } = openGroup(summary.rows, 'investing')
  const xpPct = Math.round(lv.xp * 100)

  return (
    // Phone: number, then the parts, then the stat tiles. Wide: number and tiles side by side, the parts below.
    <Card aria-label={t('dash.netWorth')} data-tone="gold" className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 flex-col gap-2">
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
            {f.amount(shown)}
          </span>
        </div>
        {summary.missingFx.length > 0 && <p className="text-xs text-warn-text">{t('quest.fxRate')}</p>}
        <div className="flex flex-col gap-1.5 pt-1.5">
          <div className="flex justify-between gap-2">
            <Label className="text-text">{t('dash.xpTo', { n: lv.level + 1 })}</Label>
            <Label>{t('dash.xpNote', { amount: compact(lv.next - total), pct: xpPct })}</Label>
          </div>
          <Segments items={xpBar(lv.xp)} height={14} label={`${t('dash.level')} ${lv.level}: ${xpPct}%`} />
        </div>
      </div>
      <div className="order-last grid grid-cols-2 gap-2 lg:order-none">
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
      {/* Total money = accounts (Cashflow) + investing holdings + running trades, each in its own panel. */}
      <div className="flex flex-col gap-3 lg:col-span-2 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          <Part tone="gold" icon="coin" label={t('dash.partAccounts')} value={cash}>
            <AccountChips entries={entries} />
            <DueBills today={today} />
          </Part>
          <Part
            tone="blue"
            icon="chest"
            label={t('dash.partInvesting')}
            value={summary.byGroup.investing}
            aside={
              investing.length > 0 && (
                <span style={{ color: signColor(investingPnl) }}>
                  {t('dash.holdings', { n: investing.length })} · {investingPnl >= 0 ? '+' : '−'}
                  {compact(Math.abs(investingPnl))}
                </span>
              )
            }
          />
        </div>
        <Part
          tone="purple"
          icon="chartUp"
          label={t('dash.partTrading')}
          value={summary.byGroup.trading}
          aside={
            trades.length > 0 && (
              <span style={{ color: signColor(tradePnl) }}>
                {t('run.count', { n: trades.length })} · {tradePnl >= 0 ? '+' : '−'}
                {compact(Math.abs(tradePnl))}
              </span>
            )
          }
        >
          <TradeList rows={summary.rows} />
        </Part>
      </div>
    </Card>
  )
}

// ---- This month's cashflow ----

/** Spending against the budget, income and net for the current month; the full picture is on the Cashflow page. */
function MonthCard() {
  const { t, money, compact, num, month } = useI18n()
  const { entries } = useCashEntries()
  const budget = useSettings((x) => x.monthlyBudget)
  const today = localDate(useNow())
  const s = monthSummary(entries, monthOf(today), today)
  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${compact(Math.abs(n))}`

  return (
    <Card aria-label={t('dash.month', { month: month(s.month) })} data-tone={s.net >= 0 ? 'green' : 'red'} className="flex flex-wrap items-center gap-4">
      <div className="flex min-w-0 flex-[3_1_320px] flex-col gap-1.5">
        <div className="flex flex-wrap justify-between gap-2">
          <Label>{t('dash.month', { month: month(s.month) })}</Label>
          <a href={href('cashflow')} className="font-label text-[11px] text-accent-text uppercase underline underline-offset-4">
            {t('dash.openCashflow')}
          </a>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-[40px] leading-none">{compact(s.expense)}</span>
          <span className="text-sm text-text-muted">{budget ? t('cf.budgetOf', { amount: money(budget) }) : t('cf.spentLegend')}</span>
        </div>
        {budget ? <Segments items={budgetBar(s.expense, budget)} height={10} label={`${money(s.expense)} / ${money(budget)}`} /> : null}
      </div>
      <div className="grid flex-[2_1_260px] grid-cols-3 gap-2">
        {[
          { label: t('cf.income'), value: compact(s.income), color: COLOR.text },
          { label: t('cf.net'), value: signed(s.net), color: signColor(s.net) },
          { label: t('cf.savingsRate'), value: s.savingsRate === null ? '—' : `${num(s.savingsRate, 0)}%`, color: s.savingsRate === null ? COLOR.muted : signColor(s.savingsRate) },
        ].map((x) => (
          <div key={x.label} className="flex flex-col gap-0.5 rounded-lg bg-surface-2 px-3 py-2">
            <Label>{x.label}</Label>
            <span className="font-display text-[26px] leading-none" style={{ color: x.color }}>
              {x.value}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ---- Heat ----

function HeatCard({ heat }: { heat: number }) {
  const { t } = useI18n()
  const limit = useSettings((x) => x.heatLimit)
  const hot = heatTier(heat, limit).flames >= 2
  return (
    <Card aria-label={t('heat.title')} data-tone="red" className="flex min-w-0 flex-[2_1_340px] flex-col gap-3" style={hot ? { background: COLOR.fireSoft, borderColor: COLOR.fireEdge } : undefined}>
      <HeatMeter heat={heat} title={<h2 className="font-display text-3xl leading-none uppercase">{t('heat.title')}</h2>} />
    </Card>
  )
}

// ---- Crypto mood ----

function MoodCard() {
  const { t, locale, num, change } = useI18n()
  const { mood, prices, at, status, hasKey, refresh } = useCryptoMarket()
  const watched = useSettings((x) => x.watchlist?.crypto)
  const tone = mood && moodColor(mood.value)
  const extreme = mood != null && (mood.value < 25 || mood.value > 75)
  return (
    <Card
      aria-label={t('mood.title')}
      data-tone="lime"
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
              {[...new Set([...WATCHLIST, ...(watched ?? []).map((x) => x.toLowerCase())])].map((sym) => {
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

// ---- Inventory ----

function Inventory({ summary }: { summary: Summary }) {
  const { t, num } = useI18n()
  const items = allocation(summary.byClass, summary.netWorth)
  const map = treemap(items)
  if (!map) return null
  const description = items.map((i) => `${t(`class.${i.assetClass}`)} ${num(i.pct, 0)}%`).join(', ')

  return (
    <Card aria-label={t('inv.title')} data-tone="blue" className="min-w-0 flex-[3_1_480px]">
      <CardTitle icon="chest" aside={t('inv.speed')}>
        {t('inv.title')}
      </CardTitle>
      <div role="img" aria-label={description} className="flex h-[250px] gap-2">
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
      {/* Never squeezed: on a short tile the amount gives way, not the name. */}
      <span className="shrink-0 truncate font-label text-[11px] uppercase">
        {t(`class.${item.assetClass}`)} {'★'.repeat(speedOf(item.assetClass))}
      </span>
      <div className="min-h-0">
        <div className="font-display leading-[0.85]" style={{ fontSize: tileFontSize(item.pct, largest) }}>
          {num(item.pct, 0)}%
        </div>
        {(largest || item.pct >= SHOW_AMOUNT_FROM_PCT) && <div className="pt-1 font-mono text-xs">{money(item.value)}</div>}
      </div>
    </div>
  )
}

// ---- Quests ----

/** The circuit breaker, when it stops new entries (real first). */
function breakerAlerts(f: I18n, b: Record<'real' | 'paper', Breaker>, market: TradeMarket): QuestView[] {
  return (['real', 'paper'] as const).flatMap((side) => {
    const x = b[side]
    if (x.status === 'allowed') return []
    const until = x.rules.map((r) => r.resumes).filter((d): d is string => !!d).sort().at(-1)
    return [
      {
        label: f.t(`quest.breaker.${side}`, { s: f.t(`cb.status.${x.status}`) }),
        tag: until ? f.t('quest.breakerUntil', { d: f.day(until) }) : f.t('quest.breakerFix'),
        route: market,
        params: { view: 'journal', jv: 'trades' },
      },
    ]
  })
}

/** New setups from each market's last scan vs the one before (the Scanner records them). */
function scanAlerts(f: I18n): QuestView[] {
  return (['idx', 'us', 'crypto'] as const).flatMap((m) => {
    const c = scanChanges(loadScanLog(m))
    if (!c) return []
    const tag = f.day(c.date)
    return [
      ...(c.newPassing.length ? [{ label: f.t('quest.newSetups', { s: c.newPassing.join(', ') }), tag, route: tradeMarketOfScan(m), params: { view: 'scan', ...exchangeParams(m) } }] : []),
      ...(c.newInZone.length ? [{ label: f.t('quest.newInZone', { s: c.newInZone.join(', ') }), tag, route: tradeMarketOfScan(m), params: { view: 'scan', ...exchangeParams(m) } }] : []),
    ]
  })
}

/** Fresh short-term buy signals from each market's last short-term scan (≤ 1 week and ≤ 1 month). */
function shortAlerts(f: I18n): QuestView[] {
  return (['idx', 'us', 'crypto'] as const).flatMap((m) =>
    (['week', 'month'] as const).flatMap((st) => {
      const fresh = freshSignals(loadShortLog(m, st), st)
      if (!fresh.length) return []
      const list = fresh.map((x) => x.symbol).join(', ')
      return [{ label: f.t('quest.shortSignals', { s: list, h: f.t(`short.style.${st}`), m: f.t(`scan.market.${m}`) }), tag: f.t('quest.shortTag'), route: tradeMarketOfScan(m), params: { view: 'scan', ...exchangeParams(m) } }]
    }),
  )
}

/** Long-term holdings whose fundamentals score dropped or is low (the score log is refreshed daily on the dev server). */
function scoreAlerts(f: I18n, symbols: string[], log: ScoreLog): QuestView[] {
  return [...new Set(symbols)].flatMap((s) => {
    const a = scoreAlert(log[s])
    if (!a) return []
    const label = a.kind === 'drop' ? f.t('quest.ltDrop', { s, from: a.from, n: a.total }) : f.t('quest.ltLow', { s, n: a.total })
    return [{ label, tag: a.kind === 'drop' ? f.day(a.since) : '', route: 'stocks' as const, params: { view: 'score', ex: 'idx' } }]
  })
}

/** Bills due within a few days or overdue (entered on the Cashflow page). */
function billAlerts(f: I18n, bills: readonly Bill[], today: string): QuestView[] {
  return billsDue(bills, today).map(({ bill, days }) => ({
    label: bill.income
      ? f.t('quest.incomeLate', { s: bill.name })
      : bill.amount
        ? f.t('quest.payBillAmount', { s: bill.name, amount: f.money(bill.amount) })
        : f.t('quest.payBill', { s: bill.name }),
    tag: dueTag(days, f.t),
    route: 'cashflow' as const,
  }))
}

/** The journal a holding's notes go in (a Funds holding has none: Stocks). */
function journalOf(h: Holding): TradeMarket {
  const m = marketOfClass(h.assetClass)
  return isTradeMarket(m) ? m : 'stocks'
}

/** Where the circuit breaker sends you: the market you trade most (its Trades view shows the breaker). */
function mainTradeMarket(holdings: readonly Holding[]): TradeMarket {
  const crypto = holdings.filter((h) => h.group === 'trading' && marketOfClass(h.assetClass) === 'crypto').length
  const stocks = holdings.filter((h) => h.group === 'trading' && marketOfClass(h.assetClass) === 'stocks').length
  return crypto > stocks ? 'crypto' : 'stocks'
}

/** Sells of the last two weeks without an exit or lesson note: write it while it's fresh. */
function exitLessonAlerts(f: I18n, holdings: readonly Holding[], txns: readonly Transaction[], journal: readonly JournalEntry[], today: string): QuestView[] {
  return exitLessonsDue(holdings, txns, journal, today).map((h) => ({
    label: f.t('quest.exitLesson', { s: h.symbol }),
    tag: '',
    route: journalOf(h),
    params: { view: 'journal', jv: 'notes', holding: h.id, tag: 'exit', ...exchangeParamsOf(h.assetClass) },
  }))
}

function Quests({ summary }: { summary: Summary }) {
  const f = useI18n()
  const tradeLimit = useSettings((x) => x.tradeLimit)
  const lastExportAt = useSettings((x) => x.lastExportAt)
  const now = useNow()
  const held = longTermSymbols(summary.rows)
  const scores = useScoreLog(held)
  const bills = useCashflow((s) => s.bills)
  const { holdings, transactions, journal } = useStore()
  const today = localDate(now)
  const streak = journalStreak(journal, today)
  const breakers = useBreakers()
  const main = mainTradeMarket(holdings)
  const list = [...breakerAlerts(f, breakers, main),...billAlerts(f, bills, today), ...exitLessonAlerts(f, holdings, transactions, journal, today), ...quests(summary, { tradeLimit, lastExportAt, now }).map((q) => describeQuest(q, f)), ...scanAlerts(f), ...shortAlerts(f), ...scoreAlerts(f, held, scores)]

  return (
    <Card aria-label={f.t('quests.title')} data-tone="orange">
      <CardTitle
        icon="star"
        aside={
          <a href={href(main, { view: 'journal' })} className="flex items-center gap-1 hover:underline">
            {streak > 0 && <PixelIcon name="flame" size={12} />}
            {f.t('quests.journalStreak', { n: streak })}
          </a>
        }
      >
        {f.t('quests.title')}
      </CardTitle>
      {!list.length && <p className="text-sm text-text-muted">{f.t('quests.none')}</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {list.map((q) => (
          <li key={`${q.route}:${q.label}`}>
            <a
              href={href(q.route, q.params)}
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
