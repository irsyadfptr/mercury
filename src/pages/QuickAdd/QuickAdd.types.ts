import type { CashEntry } from '@/types'

export type EntryType = CashEntry['type']

/** Everything the quick-add screen holds before saving. */
export interface QuickAddDraft {
  type: EntryType
  /** Digits typed on the pad, no separators ('' = nothing yet). */
  digits: string
  category?: string
  /** yyyy-mm-dd */
  date: string
  note: string
  /** Account id; for a transfer, the source. */
  account: string
  /** Transfers only. */
  toAccount?: string
}

/** The part of the Web Speech API's SpeechRecognition that Quick add uses (not in TypeScript's DOM types). */
export interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
}

export type PadKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '000' | '0' | 'back'
