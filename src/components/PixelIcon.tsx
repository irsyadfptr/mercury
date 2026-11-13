import type { PixelIconName, PixelIconProps } from '@/types'
import { ICONS } from './pixelIcons'

const FILLS: Record<PixelIconName, string[]> = {
  coin: ['var(--cat-gold)'],
  heart: ['var(--down)'],
  chest: ['var(--cat-gold)'],
  star: ['var(--cat-gold)'],
  flame: ['var(--fire-red)', 'var(--fire-orange)', 'var(--fire-yellow)'],
}

export function PixelIcon({ name, size = 18, className }: PixelIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true" className={className}>
      {ICONS[name].map((d, i) => (
        <path key={i} d={d} fill={FILLS[name][i]} />
      ))}
    </svg>
  )
}
