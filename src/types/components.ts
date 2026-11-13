import type { ReactNode } from 'react'
import type { ICONS } from '@/components/pixelIcons'
import type { Holding, Transaction } from './domain'
import type { Route } from './app'
import type { Segment } from './view'

// ---- PixelIcon ----

export type PixelIconName = keyof typeof ICONS

export interface PixelIconProps {
  name: PixelIconName
  /** Rendered size in CSS px (square). */
  size?: number
  className?: string
}

// ---- ui-bits ----

export interface CardTitleProps {
  icon?: PixelIconName
  aside?: ReactNode
  children: ReactNode
}

export interface LabelProps {
  className?: string
  children: ReactNode
}

export type BadgeTone = 'paper' | 'warn' | 'neutral'

export interface BadgeProps {
  tone: BadgeTone
  children: ReactNode
}

export interface SegmentsProps {
  items: readonly Segment[]
  /** Accessible description of what the bar shows. */
  label: string
  height?: number
}

export interface FieldProps {
  label: string
  hint?: string
  error?: string
  className?: string
  children: ReactNode
}

// ---- Shell ----

export interface ShellProps {
  route: Route
  children: ReactNode
}

// ---- HoldingDialog ----

/** What the dialog is doing: closed, creating a holding, or editing one by id. */
export type HoldingDialogTarget = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; holdingId: string }

export interface HoldingDialogProps {
  target: HoldingDialogTarget
  onClose: () => void
}

export interface HoldingFormProps {
  /** undefined = create a new holding. */
  holdingId?: string
  onDone: () => void
}

export interface TransactionsProps {
  holding: Holding
  txns: readonly Transaction[]
}
