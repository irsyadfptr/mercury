import type { ScoreLog } from '@/market/scoreLog'
import type { Row } from '@/types'

export interface HoldingRowsProps {
  rows: readonly Row[]
  onEdit: (holdingId: string) => void
  /** Long-term scores, shown on Investing IDX stocks. */
  scores: ScoreLog
}

export interface HoldingRowProps {
  row: Row
  onEdit: () => void
  scores: ScoreLog
}

export interface SizeInputs {
  capital: string
  riskPct: string
  entry: string
  stop: string
  useLots: boolean
}
