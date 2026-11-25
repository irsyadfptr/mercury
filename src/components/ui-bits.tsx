import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import type { BadgeProps, BadgeTone, CardTitleProps, FieldProps, LabelProps, SegmentsProps } from '@/types'
import { PixelIcon } from './PixelIcon'

/** Snug card (DESIGN.md: 1px border, 10px radius, solid surface). */
export function Card({ className, children, ...rest }: ComponentProps<'section'>) {
  return (
    <section className={cn('rounded-[10px] border border-border bg-surface p-4 sm:p-5', className)} {...rest}>
      {children}
    </section>
  )
}

export function CardTitle({ icon, aside, children }: CardTitleProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 font-display text-3xl leading-none uppercase">
        {icon && <PixelIcon name={icon} />}
        {children}
      </h2>
      {aside && <span className="font-label text-[11px] text-text-muted uppercase">{aside}</span>}
    </div>
  )
}

/** Small pixel-caps label (DESIGN.md: Silkscreen, 11px minimum). */
export function Label({ className, children }: LabelProps) {
  return <span className={cn('font-label text-[11px] text-text-muted uppercase', className)}>{children}</span>
}

const BADGE_TONE: Record<BadgeTone, string> = {
  paper: 'bg-accent-soft text-accent-text',
  warn: 'bg-warn-soft text-warn-text',
  neutral: 'bg-surface-2 text-text-muted',
}

export function Badge({ tone, children }: BadgeProps) {
  return <span className={cn('rounded px-1.5 py-px font-label text-[11px] uppercase', BADGE_TONE[tone])}>{children}</span>
}

export function Segments({ items, label, height = 10 }: SegmentsProps) {
  return (
    <div role="img" aria-label={label} className="flex gap-0.5">
      {items.map((s, i) => (
        <span key={i} className="flex-1 rounded-[2px]" style={{ height, background: s.bg, border: s.edge ? `1px solid ${s.edge}` : undefined }} />
      ))}
    </div>
  )
}

/** Label + control + error/hint, stacked. The error replaces the hint. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs font-medium text-text-muted">{label}</span>
      {children}
      {error ? <span className="text-xs text-down">{error}</span> : hint && <span className="text-xs text-text-muted">{hint}</span>}
    </label>
  )
}

/** Shared class for text inputs and selects. */
export const fieldClass =
  'h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-down'

/**
 * A tinted panel inside a play-skin card, in its own colour (data-tone): e.g. the parts of total money on the
 * Dashboard, the heat inside Portfolio's Trading card. Its .bg-surface-2 tiles take its colour (index.css).
 */
export function TonePanel({ tone, className, children, ...rest }: ComponentProps<'div'> & { tone: string }) {
  return (
    <div
      data-tone={tone}
      data-part
      className={cn('flex min-w-0 flex-col gap-2 rounded-xl border-2 p-3', className)}
      style={{ background: 'color-mix(in srgb, var(--tone) 16%, var(--surface))', borderColor: 'color-mix(in srgb, var(--tone) 60%, var(--surface))' }}
      {...rest}
    >
      {children}
    </div>
  )
}

/**
 * Chunky pixel tabs (play skin): the chosen one is a block in the card's colour (var(--tone)) with an ink outline
 * and hard shadow. Each option is a toggle button (aria-pressed).
 */
export function PixelTabs<T extends string>({ options, value, onChange, label, className }: { options: readonly { id: T; label: string }[]; value: T; onChange: (id: T) => void; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-1 rounded-lg border-2 border-border bg-surface p-1', className)}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
          className={cn(
            'rounded-md border-2 px-3 py-1.5 font-label text-xs uppercase focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            o.id === value
              ? 'border-text bg-[var(--tone,var(--accent))] text-[oklch(0.24_0.03_275)] shadow-[2px_2px_0_var(--text)]'
              : 'border-transparent text-text-muted hover:bg-surface-2 hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
