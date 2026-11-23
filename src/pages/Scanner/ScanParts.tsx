import { type ReactNode, useState } from 'react'
import { PixelIcon } from '@/components/PixelIcon'
import { Label, Segments, TonePanel } from '@/components/ui-bits'
import { useI18n } from '@/i18n'
import type { MoodLight } from '@/market/mood'
import type { Segment } from '@/types'
import { shareBar } from '@/view/bars'
import type { ScanGroup } from '@/view/scanGroups'
import { COLOR } from '@/view/tokens'

// Pieces shared by the swing scanner (Scanner.tsx) and the short-term one (ShortView.tsx).

const LIGHT_COLOR: Record<MoodLight, string> = { red: COLOR.down, yellow: COLOR.warn, green: COLOR.up }
const LIGHT_TEXT: Record<MoodLight, string> = { red: 'text-down', yellow: 'text-warn-text', green: 'text-up' }

/** The mood as a big score with its light and a 20-pixel meter in the light's colour. */
export function MoodMeter({ score, light, children }: { score: number; light: MoodLight; children?: ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <span className={`font-display text-6xl leading-[0.85] ${LIGHT_TEXT[light]}`}>{score}</span>
        <span className="mb-1 rounded-md px-2 py-0.5 font-label text-[11px] font-bold uppercase" style={{ background: LIGHT_COLOR[light], color: light === 'yellow' ? 'oklch(0.22 0.03 275)' : 'white' }}>
          {t(`mood.idx.${light}`)}
        </span>
        {children && <span className="mb-1 min-w-0 flex-1 text-sm">{children}</span>}
      </div>
      <Segments items={shareBar(score, LIGHT_COLOR[light], 20)} height={12} label={`${score} / 100: ${t(`mood.idx.${light}`)}`} />
    </div>
  )
}

/** One scanned ticker as it shows in the grouped list. */
export interface ScanItem {
  symbol: string
  score: number
  total: number
  pips: Segment[]
  /** Close or entry price, as text. */
  price: string
  /** Short status next to the price (zone or trigger). */
  badge?: ReactNode
  /** Second line: stop and target. */
  levels: string
  watched: boolean
}

const GROUP_TONE: Partial<Record<ScanGroup, string>> = { buy: 'green', paused: 'orange', wait: 'teal', close: 'purple' }
const GROUP_ICON: Partial<Record<ScanGroup, 'star' | 'flame' | 'calendar' | 'arrowUp'>> = { buy: 'star', paused: 'flame', wait: 'calendar', close: 'arrowUp' }

/**
 * The scan, grouped by what you can do with it: buy-zone first, then paused, waiting, one rule short, and the rest
 * folded. Tapping a row opens it in the ticker check.
 */
export function ScanGroups({ groups, title, empty, onPick }: { groups: { group: ScanGroup; rows: ScanItem[] }[]; title: (g: ScanGroup) => string; empty: string; onPick: (symbol: string) => void }) {
  const { t } = useI18n()
  const [restOpen, setRestOpen] = useState(false)
  const hasBuy = groups.some((g) => g.group === 'buy' || g.group === 'paused')
  return (
    <div className="flex flex-col gap-3">
      {!hasBuy && <p className="rounded-lg border-2 border-dashed border-border px-3 py-2 text-sm text-text-muted">{empty}</p>}
      {groups.map(({ group, rows }) => {
        const list = (
          <ul className="flex flex-col gap-1.5">
            {rows.map((r) => (
              <li key={r.symbol}>
                <ScanRow item={r} onPick={onPick} />
              </li>
            ))}
          </ul>
        )
        if (group === 'none')
          return (
            <div key={group} className="flex flex-col gap-2">
              <button type="button" aria-expanded={restOpen} onClick={() => setRestOpen(!restOpen)} className="flex items-center gap-2 self-start font-label text-[11px] uppercase underline underline-offset-4">
                {restOpen ? '▾' : '▸'} {title(group)} ({rows.length})
              </button>
              {restOpen && list}
            </div>
          )
        const icon = GROUP_ICON[group]
        return (
          <TonePanel key={group} tone={GROUP_TONE[group] ?? 'blue'} aria-label={title(group)}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md border-2 border-text" style={{ background: 'var(--tone)' }}>
                  {icon && <PixelIcon name={icon} size={12} color="oklch(0.24 0.03 275)" />}
                </span>
                <Label className="text-text">{title(group)}</Label>
              </span>
              <span className="rounded-md bg-surface px-2 py-0.5 font-label text-[11px] font-bold">{rows.length}</span>
            </div>
            {list}
          </TonePanel>
        )
      })}
      {groups.length > 0 && <p className="sr-only">{t('scan.pickHint')}</p>}
    </div>
  )
}

function ScanRow({ item: r, onPick }: { item: ScanItem; onPick: (symbol: string) => void }) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      onClick={() => onPick(r.symbol)}
      className="flex w-full items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-left hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-baseline gap-1.5">
          <span className="font-semibold">{r.symbol}</span>
          {r.watched && (
            <span className="text-warn-text" title={t('watch.on')}>
              ★
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-16">
            <Segments items={r.pips} height={7} label={`${r.score}/${r.total}`} />
          </span>
          <span className="font-mono text-[11px] text-text-muted">
            {r.score}/{r.total}
          </span>
        </span>
      </span>
      <span className="ml-auto flex min-w-0 flex-col items-end gap-0.5 text-right">
        <span className="flex flex-wrap items-baseline justify-end gap-1.5">
          {r.badge}
          <span className="font-mono text-sm font-medium">{r.price}</span>
        </span>
        <span className="font-label text-[10px] text-text-muted uppercase">{r.levels}</span>
      </span>
    </button>
  )
}

/** A level tile in the ticker check (entry, stop, targets, time stop). */
export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <Label>{label}</Label>
      <div className="font-mono text-lg">{value}</div>
      {note && <div className="text-xs text-text-muted">{note}</div>}
    </div>
  )
}

/**
 * One DOM for both layouts. Phone: mood, scan, check in one column. Wide: the scan on the left, mood and check on the
 * right, so a tapped ticker shows beside the list.
 */
export function ScanLayout({ mood, scan, check }: { mood: ReactNode; scan: ReactNode; check: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
        <div className="order-2 min-w-0 lg:order-none">{scan}</div>
      </div>
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
        <div className="order-1 min-w-0 lg:order-none">{mood}</div>
        <div id="scan-check" className="order-3 min-w-0 scroll-mt-4 lg:order-none">
          {check}
        </div>
      </div>
    </div>
  )
}
