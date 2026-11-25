import { Badge, Label, Segments } from '@/components/ui-bits'
import { marketOfClass } from '@/domain/markets'
import { idrPnl, openGroup, rarity } from '@/domain/portfolio'
import { useI18n } from '@/i18n'
import { href } from '@/routes'
import { useSettings } from '@/settings'
import type { I18n, RiskStatus, Row } from '@/types'
import { riskBar, tradeTrack } from '@/view/bars'
import { COLOR, RARITY_COLOR } from '@/view/tokens'

/** Pure: the short note on a trade's risk (share of net worth lost at the stop, against the per-trade limit). */
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

const rowClass =
  'flex w-full flex-col gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-left hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'

/**
 * Open trades (Trading group), one row each: gain or loss so far, a line from stop to target with the entry and
 * today's price on it, days held, and the trade's risk against the per-trade limit.
 * Dashboard: rows link to the Portfolio. Portfolio (`onPick`): rows open the holding, and `detail` adds the name,
 * platform, value, rarity and the risk as an HP bar.
 */
export function TradeList({ rows, onPick, detail = false }: { rows: readonly Row[]; onPick?: (holdingId: string) => void; detail?: boolean }) {
  const f = useI18n()
  const { t, num, compact, money, qty } = f
  const limit = useSettings((x) => x.tradeLimit)
  const trades = openGroup(rows, 'trading').rows
  const price = (n: number) => num(n, n < 10 ? 4 : 0)
  if (!trades.length) return <p className="text-sm text-text-muted">{t('risk.empty')}</p>
  return (
    <ul className="flex flex-col gap-2">
      {trades.map((r) => {
        const { holding: h, v } = r
        const priced = v.priceSource !== 'cost'
        const up = v.unrealized >= 0
        const track = tradeTrack(v.avgCost, v.price, h.stop, h.target)
        const bar = riskBar(r.risk, limit)
        // Without a stop the left label already says so; the risk note would repeat it.
        const note = bar && bar.status.kind !== 'noStop' ? riskNote(bar.status, limit, f) : undefined
        const from = Math.min(track.entry, track.now)
        const rare = rarity(r.daysHeld)
        const value = Number.isFinite(v.valueIdr) ? money(v.valueIdr) : `$${qty(Math.round(v.marketValue * 100) / 100)}`
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate font-semibold">
                {h.symbol} {detail && h.name && <span className="font-normal text-text-muted">{h.name}</span>}{' '}
                {h.paper && <span className="font-label text-[11px] text-accent-text uppercase">· {t('badge.paper')}</span>}
                {!detail && <span className="ml-1.5 font-label text-[11px] text-text-muted uppercase">{t('run.days', { d: r.daysHeld })}</span>}
              </span>
              {priced ? (
                <span className="flex shrink-0 items-baseline gap-1.5" style={{ color: up ? COLOR.up : COLOR.down }}>
                  <span className="font-display text-xl leading-none">
                    {up ? '▲' : '▼'}
                    {num(Math.abs(v.unrealizedPct), 1)}%
                  </span>
                  <span className="font-mono text-xs">
                    {up ? '+' : '−'}
                    {compact(Math.abs(idrPnl(r)))}
                  </span>
                </span>
              ) : (
                <Label className="shrink-0">{t('run.noPrice')}</Label>
              )}
            </span>
            {detail && (
              <span className="-mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="flex flex-wrap items-center gap-1.5 font-label text-[11px] text-text-muted uppercase">
                  <span style={{ color: RARITY_COLOR[rare] }}>{t(`rarity.${rare}`)}</span>· {t('pf.days', { d: r.daysHeld })}
                  {h.platform && <>· {h.platform}</>}
                  {r.dividends > 0 && <Badge tone="neutral">{t('pf.dividends', { amount: compact(r.dividends) })}</Badge>}
                </span>
                <span className="font-mono text-[13px] font-medium">{value}</span>
              </span>
            )}
            {/* Stop ──── entry ▓▓▓ now ──── target */}
            <span
              role="img"
              aria-label={t('run.trackLabel', { stop: h.stop ? price(h.stop) : '—', entry: price(v.avgCost), now: price(v.price), target: h.target ? price(h.target) : '—' })}
              className="relative mx-1.5 block h-3"
            >
              <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded bg-empty" />
              <span className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded" style={{ left: `${from}%`, width: `${Math.abs(track.now - track.entry)}%`, background: up ? COLOR.up : COLOR.down }} />
              {track.stop !== undefined && <span className="absolute top-0 h-3 w-1 -translate-x-1/2 rounded-sm" style={{ left: `${track.stop}%`, background: COLOR.down }} />}
              {track.target !== undefined && <span className="absolute top-0 h-3 w-1 -translate-x-1/2 rounded-sm" style={{ left: `${track.target}%`, background: COLOR.up }} />}
              <span className="absolute top-0 h-3 w-0.5 -translate-x-1/2 bg-text-muted" style={{ left: `${track.entry}%` }} />
              <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface" style={{ left: `${track.now}%`, background: up ? COLOR.up : COLOR.down }} />
            </span>
            <span className="flex justify-between gap-2 font-label text-[10px] uppercase">
              <span style={{ color: h.stop ? COLOR.down : COLOR.muted }}>{h.stop ? t('run.stop', { p: price(h.stop) }) : t('run.noStop')}</span>
              {!detail && note && <span style={{ color: bar && isAlarming(bar.status) ? COLOR.down : COLOR.muted }}>{note}</span>}
              <span style={{ color: h.target ? COLOR.up : COLOR.muted }}>{h.target ? t('run.target', { p: price(h.target) }) : t('run.noTarget')}</span>
            </span>
            {/* Portfolio: the trade's risk as an HP bar, the per-trade limit being a full bar. */}
            {detail && bar && (
              <span className="flex items-center gap-2">
                <span className="font-label text-[11px] font-bold uppercase">HP</span>
                <span className="min-w-0 flex-1">
                  <Segments items={bar.segments.slice(0, 30)} height={8} label={`${t('risk.title')}: ${riskNote(bar.status, limit, f)}`} />
                </span>
                <span className="shrink-0 font-label text-[11px] uppercase" style={{ color: isAlarming(bar.status) ? COLOR.down : bar.status.kind === 'close' ? COLOR.fireOrange : COLOR.muted }}>
                  {riskNote(bar.status, limit, f)}
                </span>
              </span>
            )}
          </>
        )
        return (
          <li key={h.id}>
            {onPick ? (
              <button
                type="button"
                onClick={() => onPick(h.id)}
                className={rowClass}
                style={detail ? { borderLeft: `4px solid ${RARITY_COLOR[rare]}` } : undefined}
              >
                {body}
              </button>
            ) : (
              <a href={href(marketOfClass(h.assetClass), { view: 'holdings' })} className={rowClass}>
                {body}
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )
}
