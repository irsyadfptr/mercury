import { Segments } from '@/components/ui-bits'
import { shareBar, ltScoreColor } from '@/view/bars'

/** A long-term score as one pixel per point, coloured by how good it is (like an HP bar). */
export function ScorePips({ total, max = 15, height = 8, label }: { total: number; max?: number; height?: number; label: string }) {
  return <Segments items={shareBar(max ? (total / max) * 100 : 0, ltScoreColor(total, max), max)} height={height} label={label} />
}
