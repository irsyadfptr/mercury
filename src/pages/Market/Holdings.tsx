import { type ReactNode, useMemo, useState } from 'react'
import { holdingChecks } from '@/ai/holdingChecks'
import { portfolioFacts } from '@/ai/portfolioFacts'
import { Explain } from '@/components/Explain'
import { HeatMeter } from '@/components/HeatMeter'
import { HoldingDialog } from '@/components/HoldingDialog'
import { PixelFab } from '@/components/PixelFab'
import { PixelIcon } from '@/components/PixelIcon'
import { describeQuest } from '@/components/questText'
import { SyncBar } from '@/components/SyncBar'
import { TradeList } from '@/components/TradeList'
import { Badge, Card, CardTitle, Field, Label, Segments, TonePanel, fieldClass } from '@/components/ui-bits'
import { DEFAULT_CLASS, isTradeMarket, MARKET_CLASSES, scopeSummary, type MarketPage } from '@/domain/markets'
import { byType, holdingQuests, IDX_LOT, openGroup, quests, RARITIES, RARITY_MIN_DAYS, rarity, sizeQuote } from '@/domain/portfolio'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { scoreAlert } from '@/market/scoreLog'
import { useSettings } from '@/settings'
import type { AssetClass, GroupTotals, HoldingDialogTarget, HoldingQuest, PixelIconName, Summary, TypeGroup } from '@/types'
import { useCountUp } from '@/useCountUp'
import { useNow } from '@/useNow'
import { longTermSymbols, useScoreLog } from '@/useScoreLog'
import { useSheetSync } from '@/useSheetSync'
import { useSummary } from '@/useSummary'
import { shareBar } from '@/view/bars'
import { COLOR, RARITY_COLOR, signColor } from '@/view/tokens'
import type { HoldingRowProps, HoldingRowsProps, SizeInputs } from './Holdings.types'

/**
 * One market's holdings (Crypto, Stocks or Funds), most-needed first. The hero: what this market is worth, how it's
 * doing, and what to fix now (a missing stop, a trade over its risk, a stale price), each one tap from its holding.
 * Trade markets: Trading (daily attention: heat, stops, targets) before Investing (checked now and then), then the
 * position-size calculator. Funds: the holdings by type.
 * Phone: one column in that order. Wide: Trading on the left (its rows are tall), Investing and size on the right.
 */
/** classes: narrow further (Stocks: IDX or US only); a new holding then starts on the first of them. */
export function Holdings({ market, classes = MARKET_CLASSES[market] }: { market: MarketPage; classes?: readonly AssetClass[] }) {
  const { t } = useI18n()
  const all = useSummary()
  const summary = useMemo(() => scopeSummary(all, classes), [all, classes])
  const [dialog, setDialog] = useState<HoldingDialogTarget>({ mode: 'closed' })
  const sync = useSheetSync()
  const scores = useScoreLog(longTermSymbols(summary.rows))
  const edit = (holdingId: string) => setDialog({ mode: 'edit', holdingId })
  const trade = isTradeMarket(market)
  const hasTrades = summary.rows.some((r) => r.holding.group === 'trading')

  return (
    <>
      <Hero summary={summary} onEdit={edit} groups={trade || hasTrades} sync={<SyncBar sync={sync} compact />} />

      {trade || hasTrades ? (
        // One DOM per column; on phones the columns dissolve (contents) and `order` interleaves the cards.
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
            <TradingCard summary={summary} onEdit={edit} className="order-1 lg:order-none" />
          </div>
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
            <InvestingCard summary={summary} onEdit={edit} scores={scores} className="order-2 lg:order-none" />
            {trade && <SizeCalculator netWorth={all.netWorth} lots={classes.includes('idx_stock')} className="order-3 lg:order-none" />}
          </div>
        </div>
      ) : (
        <InvestingCard summary={summary} onEdit={edit} scores={scores} />
      )}

      {/* Room under the last card so the add button never covers it. */}
      <div aria-hidden="true" className="h-16" />
      <PixelFab label={t('pf.addShort')} onClick={() => setDialog({ mode: 'create', assetClass: classes.length === 1 ? classes[0] : DEFAULT_CLASS[market] })} />
      <HoldingDialog target={dialog} onClose={() => setDialog({ mode: 'closed' })} />
    </>
  )
}

const signed = (n: number, compact: (n: number) => string) => `${n >= 0 ? '+' : '−'}${compact(Math.abs(n))}`

function scrollToCard(id: string) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

// ---- Hero ----

function Hero({ summary, onEdit, groups, sync }: { summary: Summary; onEdit: (holdingId: string) => void; groups: boolean; sync: ReactNode }) {
  const f = useI18n()
  const { t, compact, num } = f
  const shown = useCountUp(summary.netWorth)
  const inv = openGroup(summary.rows, 'investing')
  const tr = openGroup(summary.rows, 'trading')
  const pnl = inv.pnl + tr.pnl
  const cost = inv.cost + tr.cost
  const pct = cost ? (pnl / cost) * 100 : 0
  const realized = summary.realized + summary.dividends

  return (
    // Phone: number, then what to fix, then the jump buttons. Wide: number and jump buttons left, the fix list right.
    <Card aria-label={t('pf.total')} data-tone="gold" className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <div className="flex min-w-0 flex-col gap-2 lg:col-start-1 lg:row-start-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <Label>{t('pf.total')}</Label>
          <span className="rounded-md bg-primary px-2 py-0.5 font-label text-[11px] font-bold text-primary-foreground shadow-[0_2px_0_var(--accent-deep)]">
            {t('dash.holdings', { n: inv.rows.length + tr.rows.length })}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5 leading-[0.8]">
          <span className="font-display text-3xl text-text-muted">Rp</span>
          <span className="font-display text-[clamp(52px,12vw,92px)] tabular-nums" aria-live="off">
            {f.amount(shown)}
          </span>
        </div>
        {cost > 0 && (
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-display text-2xl leading-none" style={{ color: signColor(pnl) }}>
              {pnl >= 0 ? '▲' : '▼'} {signed(pnl, compact)}
            </span>
            <span className="font-mono font-medium" style={{ color: signColor(pnl) }}>
              {pnl >= 0 ? '+' : '−'}
              {num(Math.abs(pct), 2)}%
            </span>
            <span className="text-text-muted">{t('dash.vsInvested', { amount: compact(cost) })}</span>
          </p>
        )}
        {realized !== 0 && (
          <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-text-muted">
            <Label className="text-text">{t('dash.realized')}</Label>
            <span className="font-mono font-medium" style={{ color: signColor(realized) }}>
              {signed(realized, compact)}
            </span>
            <span>{summary.dividends ? t('dash.withDividends', { amount: compact(summary.dividends) }) : t('dash.fromSells')}</span>
          </p>
        )}
        {summary.missingFx.length > 0 && <p className="text-xs text-warn-text">{t('quest.fxRate')}</p>}
      </div>
      <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <FixList summary={summary} onEdit={onEdit} />
      </div>
      {/* Jump buttons to the two group cards (their amounts are in the cards' headers). */}
      {groups && (
        <div className="grid grid-cols-2 gap-2 lg:col-start-1 lg:row-start-2">
          <GroupJump tone="purple" icon="sword" label={t('pf.trading')} g={tr} card="pf-trading" />
          <GroupJump tone="blue" icon="chest" label={t('pf.investing')} g={inv} card="pf-investing" />
        </div>
      )}
      <div className="min-w-0 empty:hidden lg:col-span-2">{sync}</div>
    </Card>
  )
}

/** A small button in the group's colour: icon, name and gain since bought; tapping it scrolls to the group's card. */
function GroupJump({ tone, icon, label, g, card }: { tone: string; icon: PixelIconName; label: string; g: GroupTotals; card: string }) {
  const { num } = useI18n()
  return (
    <TonePanel tone={tone} className="p-0">
      <button type="button" onClick={() => scrollToCard(card)} className="flex min-w-0 items-center gap-1.5 rounded-xl px-2 py-2 text-left sm:gap-2 sm:px-2.5 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <span className="grid size-6 shrink-0 place-items-center rounded-md border-2 border-text" style={{ background: 'var(--tone)' }}>
          <PixelIcon name={icon} size={12} color="oklch(0.24 0.03 275)" />
        </span>
        <span className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-2">
          <Label className="truncate text-text">{label}</Label>
          <span className="font-mono text-[11px] font-medium sm:text-xs" style={{ color: signColor(g.pnl) }}>
            {g.cost ? `${g.pnl >= 0 ? '▲' : '▼'}${num(Math.abs(g.pnlPct), 1)}%` : '—'}
          </span>
        </span>
        <span aria-hidden="true" className="ml-auto shrink-0 font-label text-[11px]">↓</span>
      </button>
    </TonePanel>
  )
}

/** What a fix is about, as an icon: risk over the limit, no stop, review date, old price. */
const FIX_ICON: Record<HoldingQuest['kind'], { name: PixelIconName; color?: string }> = {
  overRisk: { name: 'flame' },
  setStop: { name: 'shield', color: COLOR.down },
  review: { name: 'calendar' },
  stalePrice: { name: 'tag' },
}

const FIXES_SHOWN = 5

/** To-dos about single holdings (from the same rule checks as the Dashboard quests); tapping one opens the holding. */
function FixList({ summary, onEdit }: { summary: Summary; onEdit: (holdingId: string) => void }) {
  const f = useI18n()
  const { t } = f
  const tradeLimit = useSettings((x) => x.tradeLimit)
  const lastExportAt = useSettings((x) => x.lastExportAt)
  const now = useNow()
  const [all, setAll] = useState(false)
  const list = holdingQuests(quests(summary, { tradeLimit, lastExportAt, now }))
  const shown = all ? list : list.slice(0, FIXES_SHOWN)

  return (
    <TonePanel tone="orange" aria-label={t('pf.fix')}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md border-2 border-text" style={{ background: 'var(--tone)' }}>
            <PixelIcon name="star" size={14} color="oklch(0.24 0.03 275)" />
          </span>
          <Label className="text-text">{t('pf.fix')}</Label>
        </span>
        {list.length > 0 && <span className="rounded-md bg-fire-red px-2 py-0.5 font-label text-[11px] font-bold text-white">{list.length}</span>}
      </div>
      {!list.length && <p className="text-sm">{t('pf.fixNone')}</p>}
      <ul className="flex flex-col gap-1.5">
        {shown.map((q) => {
          const view = describeQuest(q, f)
          const icon = FIX_ICON[q.kind]
          return (
            <li key={`${q.kind}:${q.holding.id}`}>
              <button
                type="button"
                onClick={() => onEdit(q.holding.id)}
                className="flex w-full items-center gap-2.5 rounded-lg bg-surface-2 px-2.5 py-2 text-left text-sm hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <PixelIcon name={icon.name} size={16} color={icon.color} className="shrink-0" />
                <span className="min-w-0 flex-grow">{view.label}</span>
                {view.tag && <Label className="shrink-0">{view.tag}</Label>}
              </button>
            </li>
          )
        })}
      </ul>
      {list.length > FIXES_SHOWN && (
        <button type="button" onClick={() => setAll(!all)} className="self-start font-label text-[11px] uppercase underline underline-offset-4">
          {all ? t('invest.showLess') : t('invest.showAll', { n: list.length })}
        </button>
      )}
    </TonePanel>
  )
}

// ---- Groups ----

/** Card title aside: the group's value and its gain since bought. */
function GroupAside({ g }: { g: GroupTotals }) {
  const { money, change } = useI18n()
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 font-mono text-[13px] normal-case">
      <span className="font-medium text-text">{money(g.value)}</span>
      {g.cost > 0 && <span style={{ color: signColor(g.pnl) }}>{change(g.pnlPct)}</span>}
    </span>
  )
}

/** An asset type inside a group: its share of the group as a pixel bar in the card's colour, value and P/L. */
function TypeHeader({ g }: { g: TypeGroup }) {
  const { t, money, change, num } = useI18n()
  const share = t('pf.share', { n: num(g.share, 0) })
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b-2 border-dashed pb-1.5" style={{ borderColor: 'color-mix(in srgb, var(--tone) 60%, var(--surface))' }}>
      <span className="flex items-center gap-2">
        <span className="font-label text-[11px] font-bold uppercase">{t(`class.${g.assetClass}`)}</span>
        <span className="w-16">
          <Segments items={shareBar(g.share, 'var(--tone)')} height={8} label={share} />
        </span>
        <Label>{share}</Label>
      </span>
      <span className="flex flex-wrap items-baseline gap-x-2 font-mono text-[13px]">
        <span className="font-medium">{money(g.value)}</span>
        <span style={{ color: signColor(g.pnl) }}>{change(g.pnlPct)}</span>
      </span>
    </div>
  )
}

/** Trading: the heat of all open stops, then each trade by type with its stop-to-target line and risk HP. */
function TradingCard({ summary, onEdit, className }: { summary: Summary; onEdit: (holdingId: string) => void; className?: string }) {
  const { t } = useI18n()
  const g = openGroup(summary.rows, 'trading')
  return (
    <Card id="pf-trading" aria-label={t('pf.trading')} data-tone="purple" className={cn('flex min-w-0 scroll-mt-4 flex-col gap-3', className)}>
      <CardTitle icon="sword" aside={<GroupAside g={g} />}>
        {t('pf.trading')}
      </CardTitle>
      {!g.rows.length && <p className="text-sm text-text-muted">{t('pf.noHoldings')}</p>}
      {g.rows.length > 0 && (
        <TonePanel tone="red">
          <HeatMeter heat={summary.heat} big={false} title={<Label className="text-text">{t('heat.title')}</Label>} />
        </TonePanel>
      )}
      {byType(g.rows).map((x) => (
        <section key={x.assetClass} aria-label={t(`class.${x.assetClass}`)} className="flex flex-col gap-2">
          <TypeHeader g={x} />
          <TradeList rows={x.rows} onPick={onEdit} detail />
        </section>
      ))}
    </Card>
  )
}

/** Investing: holdings by type, each with its rarity (days held), value and gain. */
function InvestingCard({ summary, onEdit, scores, className }: Omit<HoldingRowsProps, 'rows'> & { summary: Summary; className?: string }) {
  const { t } = useI18n()
  const g = openGroup(summary.rows, 'investing')
  return (
    <Card id="pf-investing" aria-label={t('pf.investing')} data-tone="blue" className={cn('flex min-w-0 scroll-mt-4 flex-col gap-3', className)}>
      <CardTitle icon="chest" aside={<GroupAside g={g} />}>
        {t('pf.investing')}
      </CardTitle>
      <HoldingRows rows={g.rows} onEdit={onEdit} scores={scores} />
      <RarityKey />
    </Card>
  )
}

function RarityKey() {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t-2 border-dashed pt-2" style={{ borderColor: 'color-mix(in srgb, var(--tone) 60%, var(--surface))' }}>
      <Label>{t('rarity.key')}:</Label>
      {RARITIES.map((r, i) => (
        <span key={r} className="flex items-center gap-1 font-label text-[11px] uppercase" style={{ color: RARITY_COLOR[r] }}>
          <span aria-hidden="true" className="inline-block size-2.5 border border-text" style={{ background: RARITY_COLOR[r] }} />
          {t(`rarity.${r}`)} {i === 0 ? `<${RARITY_MIN_DAYS[RARITIES[1]]}` : `${RARITY_MIN_DAYS[r]}+`}
        </span>
      ))}
    </div>
  )
}

/** A group's holdings under one header per asset type: type total, P/L and share of the group. */
function HoldingRows({ rows, onEdit, scores }: HoldingRowsProps) {
  const { t } = useI18n()
  if (!rows.length) return <p className="py-3 text-sm text-text-muted">{t('pf.noHoldings')}</p>
  return (
    <div className="flex flex-col gap-3">
      {byType(rows).map((g) => (
        <section key={g.assetClass} aria-label={t(`class.${g.assetClass}`)} className="flex flex-col gap-2">
          <TypeHeader g={g} />
          <ul className="flex flex-col gap-1.5">
            {g.rows.map((row) => (
              <li key={row.holding.id}>
                <HoldingRow row={row} onEdit={() => onEdit(row.holding.id)} scores={scores} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function HoldingRow({ row, onEdit, scores }: HoldingRowProps) {
  const { t, money, compact, num, change, qty } = useI18n()
  const { holding: h, v, risk, daysHeld } = row
  const lt = h.group === 'investing' && h.assetClass === 'idx_stock' ? scores[h.symbol.toUpperCase()] : undefined
  const r = rarity(daysHeld)
  // USD holding without a rate: show its own-currency value instead of a wrong IDR number.
  const value = Number.isFinite(v.valueIdr) ? money(v.valueIdr) : `$${qty(Math.round(v.marketValue * 100) / 100)}`

  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={t('pf.open', { s: h.symbol })}
      className="flex w-full items-center gap-3 rounded-lg bg-surface-2 py-2 pr-3 pl-2.5 text-left hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      style={{ borderLeft: `4px solid ${RARITY_COLOR[r]}` }}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-semibold">
          {h.symbol} {h.name && <span className="font-normal text-text-muted">{h.name}</span>}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 font-label text-[11px] text-text-muted uppercase">
          <span style={{ color: RARITY_COLOR[r] }}>{t(`rarity.${r}`)}</span>· {t('pf.days', { d: daysHeld })}
          {h.platform && <>· {h.platform}</>}
          {h.stop != null && <>· stop {h.currency === 'USD' ? `$${qty(h.stop)}` : money(h.stop)}</>}
          {h.paper && <Badge tone="paper">{t('badge.paper')}</Badge>}
          {!!lt?.length && <Badge tone={scoreAlert(lt) ? 'warn' : 'neutral'}>{t('pf.ltScore', { n: lt.at(-1)!.total })}</Badge>}
          {row.dividends > 0 && (
            <Badge tone="neutral">
              {t('pf.dividends', { amount: compact(row.dividends) })}
              {row.yieldOnCost !== null && row.yieldOnCost > 0 && ` · ${t('pf.yoc', { n: num(row.yieldOnCost, 1) })}`}
            </Badge>
          )}
          {risk.kind === 'noStop' && <Badge tone="warn">{t('badge.noStop')}</Badge>}
          {v.priceSource === 'cost' && <Badge tone="neutral">{t('pf.atCost')}</Badge>}
        </span>
      </span>
      {/* Value over change, right-aligned, so the row never overflows at phone width. */}
      <span className="ml-auto flex shrink-0 flex-col items-end">
        <span className="text-right font-mono font-medium">{value}</span>
        <span className="text-right font-mono text-[13px] font-medium" style={{ color: signColor(v.unrealized) }}>
          <span className="sr-only">{t('pf.pl')} </span>
          {v.priceSource === 'cost' ? '—' : change(v.unrealizedPct)}
        </span>
      </span>
    </button>
  )
}

// ---- Position size ----

const optional = (s: string) => (s.trim() === '' ? undefined : Number(s))

/** lots: IDX stocks trade in lots of 100, so the result counts lots (the box stays, for odd cases). Crypto: units only. */
function SizeCalculator({ netWorth, lots, className }: { netWorth: number; lots: boolean; className?: string }) {
  const f = useI18n()
  const { t, money, num, qty } = f
  const tradeLimit = useSettings((s) => s.tradeLimit)
  const [inputs, setInputs] = useState<SizeInputs>({ capital: '', riskPct: '', entry: '', stop: '', useLots: lots })
  const set = <K extends keyof SizeInputs>(key: K, value: SizeInputs[K]) => setInputs((s) => ({ ...s, [key]: value }))

  // Empty capital / risk fall back to net worth and the per-trade limit.
  const quote = sizeQuote({
    capital: optional(inputs.capital) ?? netWorth,
    riskPct: optional(inputs.riskPct) ?? tradeLimit,
    entry: optional(inputs.entry),
    stop: optional(inputs.stop),
    lot: inputs.useLots ? IDX_LOT : undefined,
  })
  const amount = (units: number) => (inputs.useLots ? t('size.lots', { n: num(units / IDX_LOT) }) : qty(units))

  return (
    <Card aria-label={t('size.title')} data-tone="teal" className={cn('min-w-0', className)}>
      <CardTitle icon="star">{t('size.title')}</CardTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('size.capital')} className="col-span-2">
          <input className={fieldClass} type="number" min="0" placeholder={f.amount(netWorth)} value={inputs.capital} onChange={(e) => set('capital', e.target.value)} />
        </Field>
        <Field label={t('size.risk')}>
          <input className={fieldClass} type="number" min="0" step="0.1" placeholder={String(tradeLimit)} value={inputs.riskPct} onChange={(e) => set('riskPct', e.target.value)} />
        </Field>
        {lots ? (
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={inputs.useLots} onChange={(e) => set('useLots', e.target.checked)} className="size-4 accent-[var(--accent)]" />
            IDX lots
          </label>
        ) : (
          <span />
        )}
        <Field label={t('size.entry')}>
          <input className={fieldClass} type="number" min="0" step="any" value={inputs.entry} onChange={(e) => set('entry', e.target.value)} />
        </Field>
        <Field label={t('size.stop')}>
          <input className={fieldClass} type="number" min="0" step="any" value={inputs.stop} onChange={(e) => set('stop', e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 rounded-lg border-2 border-dashed bg-surface-2 p-3" style={{ borderColor: 'color-mix(in srgb, var(--tone) 70%, var(--surface))' }} aria-live="polite">
        {quote.status === 'incomplete' && <span className="text-sm text-text-muted">—</span>}
        {quote.status === 'stopAboveEntry' && <span className="text-sm text-down">{t('size.invalid')}</span>}
        {quote.status === 'ok' && (
          <>
            <div className="font-display text-4xl leading-none">{t('size.result', { q: amount(quote.units) })}</div>
            <div className="mt-1 text-xs text-text-muted">
              {qty(quote.units)} = {money(quote.cost)} · {t('size.loss', { amount: money(quote.lossAtStop) })}
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

// ---- AI review ----

/** AI review of the whole portfolio. Sends percentages only (see portfolioFacts); hidden in privacy mode. */
export function PortfolioReview({ className }: { className?: string }) {
  const { t } = useI18n()
  const summary = useSummary()
  const { heatLimit, tradeLimit, privacy } = useSettings()
  const facts = portfolioFacts(summary, heatLimit, tradeLimit)
  if (privacy || !facts.length) return null
  return (
    <Card data-tone="pink" className={cn('min-w-0', className)}>
      <CardTitle icon="bulb">{t('ai.review')}</CardTitle>
      <p className="mb-3 text-xs text-text-muted">{t('ai.reviewSends')}</p>
      <Explain
        title="Personal portfolio review (all numbers are % of net worth or % profit/loss; amounts in rupiah are not shared)"
        facts={facts}
        extra={() => holdingChecks(summary.rows)}
      />
    </Card>
  )
}
