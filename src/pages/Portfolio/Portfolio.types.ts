import type { Row } from '@/types'

export interface HoldingRowsProps {
  rows: readonly Row[]
  onEdit: (holdingId: string) => void
}

export interface HoldingRowProps {
  row: Row
  onEdit: () => void
}

export interface SizeInputs {
  capital: string
  riskPct: string
  entry: string
  stop: string
  useLots: boolean
}
