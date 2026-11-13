import type { CashType } from '@/types'

/** Everything the quick-add screen holds before saving. */
export interface QuickAddDraft {
  type: CashType
  /** Digits typed on the pad, no separators ('' = nothing yet). */
  digits: string
  category?: string
  /** yyyy-mm-dd */
  date: string
  note: string
}

export type PadKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '000' | '0' | 'back'
