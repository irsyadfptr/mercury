import { useState } from 'react'
import { holdingChecks } from '@/ai/holdingChecks'
import { portfolioFacts } from '@/ai/portfolioFacts'
import { Explain } from '@/components/Explain'
import { Button } from '@/components/ui/button'
import { HoldingDialog } from '@/components/HoldingDialog'
import { SyncBar } from '@/components/SyncBar'
import { Badge, Card, CardTitle, Field, Label, fieldClass } from '@/components/ui-bits'
import { byType, IDX_LOT, RARITIES, RARITY_MIN_DAYS, rarity, sizeQuote } from '@/domain/portfolio'
import { useI18n } from '@/i18n'
import { scoreAlert } from '@/market/scoreLog'
import { useSettings } from '@/settings'
import type { Group, HoldingDialogTarget } from '@/types'
import { longTermSymbols, useScoreLog } from '@/useScoreLog'
import { useSheetSync } from '@/useSheetSync'
import { useSummary } from '@/useSummary'
import { RARITY_COLOR, signColor } from '@/view/tokens'
import type { HoldingRowProps, HoldingRowsProps, SizeInputs } from './Portfolio.types'

const GROUPS: readonly Group[] = ['investing', 'trading']

export function Portfolio() {
  const { t, money } = useI18n()
  const summary = useSummary()
  const [dialog, setDialog] = useState<HoldingDialogTarget>({ mode: 'closed' })
  const sync = useSheetSync()
  const scores = useScoreLog(longTermSymbols(summary.rows))

  return (
    <>
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-5xl leading-none uppercase">{t('pf.title')}</h1>
          <Button onClick={() => setDialog({ mode: 'create' })} className="font-label text-xs uppercase shadow-[0_3px_0_var(--accent-deep)] active:translate-y-0.5 active:shadow-none">
            {t('pf.add')}
          </Button>
        </div>
        <SyncBar sync={sync} compact />
      </Card>

      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-4">
          {GROUPS.map((g) => (
            <Card key={g} aria-label={t(`pf.${g}`)}>
              <CardTitle aside={money(summary.byGroup[g])}>{t(`pf.${g}`)}</CardTitle>
              <RarityKey />
              <HoldingRows rows={summary.rows.filter((r) => r.holding.group === g)} onEdit={(holdingId) => setDialog({ mode: 'edit', holdingId })} scores={scores} />
            </Card>
          ))}
        </div>
        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
          <SizeCalculator netWorth={summary.netWorth} />
          <PortfolioReview />
        </div>
      </div>

      <HoldingDialog target={dialog} onClose={() => setDialog({ mode: 'closed' })} />
    </>
  )
}

/** AI review of the whole portfolio. Sends percentages only (see portfolioFacts); hidden in privacy mode. */
function PortfolioReview() {
  const { t } = useI18n()
  const summary = useSummary()
  const { heatLimit, tradeLimit, privacy } = useSettings()
  const facts = portfolioFacts(summary, heatLimit, tradeLimit)
  if (privacy || !facts.length) return null
  return (
    <Card>
      <CardTitle icon="chest">{t('ai.review')}</CardTitle>
      <p className="mb-3 text-xs text-text-muted">{t('ai.reviewSends')}</p>
      <Explain
        title="Personal portfolio review (all numbers are % of net worth or % profit/loss; amounts in rupiah are not shared)"
        facts={facts}
        extra={() => holdingChecks(summary.rows)}
      />
    </Card>
  )
}

function RarityKey() {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap gap-3 pb-1">
      <Label>{t('rarity.key')}:</Label>
      {RARITIES.map((r, i) => (
        <span key={r} className="font-label text-[11px] uppercase" style={{ color: RARITY_COLOR[r] }}>
          ■ {t(`rarity.${r}`)} {i === 0 ? `<${RARITY_MIN_DAYS[RARITIES[1]]}` : `${RARITY_MIN_DAYS[r]}+`}
        </span>
      ))}
    </div>
  )
}

/** A group's holdings under one header per asset type: type total, P/L and share of the group. */
function HoldingRows({ rows, onEdit, scores }: HoldingRowsProps) {
  const { t, money, change, num } = useI18n()
  if (!rows.length) return <p className="py-3 text-sm text-text-muted">{t('pf.noHoldings')}</p>
  return (
    <div className="flex flex-col gap-3">
      {byType(rows).map((g) => (
        <section key={g.assetClass} aria-label={t(`class.${g.assetClass}`)}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b-2 border-text pt-1 pb-1">
            <span className="font-label text-[11px] uppercase">{t(`class.${g.assetClass}`)}</span>
            <span className="flex flex-wrap items-baseline gap-x-2 font-mono text-[13px]">
              <span className="font-medium">{money(g.value)}</span>
              <span style={{ color: signColor(g.pnl) }}>{change(g.pnlPct)}</span>
              <span className="text-text-muted">{t('pf.share', { n: num(g.share, 0) })}</span>
            </span>
          </div>
          <ul>
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
  const closed = v.quantity === 0
  // USD holding without a rate: show its own-currency value instead of a wrong IDR number.
  const value = Number.isFinite(v.valueIdr) ? money(v.valueIdr) : `$${qty(Math.round(v.marketValue * 100) / 100)}`

  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center gap-3 border-b border-border py-2 pr-1 pl-2.5 text-left hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      style={{ borderLeft: `3px solid ${RARITY_COLOR[r]}` }}
    >
      <span className="flex min-w-0 flex-col gap-0.5 sm:min-w-[150px]">
        <span className="font-semibold">
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
          {v.priceSource === 'cost' && !closed && <Badge tone="neutral">{t('pf.atCost')}</Badge>}
          {closed && <Badge tone="neutral">{t('pf.closed')}</Badge>}
        </span>
      </span>
      <span aria-hidden="true" className="flex-grow -translate-y-1 border-b-[1.5px] border-dotted border-border" />
      {/* Phone width: value over change, so the row never overflows. */}
      <span className="flex shrink-0 flex-col items-end sm:flex-row sm:items-baseline sm:gap-3">
        <span className="text-right font-mono font-medium sm:min-w-[116px]">{value}</span>
        <span className="text-right font-mono text-[13px] font-medium sm:min-w-[80px]" style={{ color: signColor(v.unrealized) }}>
          <span className="sr-only">{t('pf.pl')} </span>
          {change(v.unrealizedPct)}
        </span>
      </span>
    </button>
  )
}

const optional = (s: string) => (s.trim() === '' ? undefined : Number(s))

function SizeCalculator({ netWorth }: { netWorth: number }) {
  const f = useI18n()
  const { t, money, num, qty } = f
  const tradeLimit = useSettings((s) => s.tradeLimit)
  const [inputs, setInputs] = useState<SizeInputs>({ capital: '', riskPct: '', entry: '', stop: '', useLots: true })
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
    <Card aria-label={t('size.title')}>
      <CardTitle icon="star">{t('size.title')}</CardTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('size.capital')} className="col-span-2">
          <input className={fieldClass} type="number" min="0" placeholder={f.amount(netWorth)} value={inputs.capital} onChange={(e) => set('capital', e.target.value)} />
        </Field>
        <Field label={t('size.risk')}>
          <input className={fieldClass} type="number" min="0" step="0.1" placeholder={String(tradeLimit)} value={inputs.riskPct} onChange={(e) => set('riskPct', e.target.value)} />
        </Field>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={inputs.useLots} onChange={(e) => set('useLots', e.target.checked)} className="size-4 accent-[var(--accent)]" />
          IDX lots
        </label>
        <Field label={t('size.entry')}>
          <input className={fieldClass} type="number" min="0" step="any" value={inputs.entry} onChange={(e) => set('entry', e.target.value)} />
        </Field>
        <Field label={t('size.stop')}>
          <input className={fieldClass} type="number" min="0" step="any" value={inputs.stop} onChange={(e) => set('stop', e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 rounded-lg bg-surface-2 p-3" aria-live="polite">
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
