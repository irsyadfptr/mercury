import type { ReactNode } from 'react'
import type { ICONS } from '@/components/pixelIcons'
import type { AssetClass, Holding, Transaction } from './domain'
import type { SheetSync, Route } from './app'
import type { Segment } from './view'

// ---- PixelIcon ----

export type PixelIconName = keyof typeof ICONS

export interface PixelIconProps {
  name: PixelIconName
  /** Rendered size in CSS px (square). */
  size?: number
  /** Overrides the icon's fixed colours (used for category icons). */
  color?: string
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

// ---- SyncBar ----

export interface SyncBarProps {
  sync: SheetSync
  /** Phone layout: one line, no explanation. */
  compact?: boolean
}

// ---- Shell ----

export interface ShellProps {
  route: Route
  children: ReactNode
}

// ---- HoldingDialog ----

/** What the dialog is doing: closed, creating a holding, or editing one by id. */
/** account: preselected "Paid from" account (opened from Cashflow → Invest). */
export type HoldingDialogTarget = { mode: 'closed' } | { mode: 'create'; account?: string; assetClass?: AssetClass } | { mode: 'edit'; holdingId: string; account?: string }

export interface HoldingDialogProps {
  target: HoldingDialogTarget
  onClose: () => void
}

export interface HoldingFormProps {
  /** undefined = create a new holding. */
  holdingId?: string
  onDone: () => void
  /** Preselected account for the money of a buy or sell. */
  account?: string
  /** A new holding's starting asset type (the market page it was added from). */
  assetClass?: AssetClass
}

export interface TransactionsProps {
  holding: Holding
  txns: readonly Transaction[]
  account?: string
}
