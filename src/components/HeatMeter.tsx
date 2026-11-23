import type { ReactNode } from 'react'
import { PixelIcon } from '@/components/PixelIcon'
import { Label, Segments } from '@/components/ui-bits'
import { heatTier } from '@/domain/portfolio'
import { useI18n } from '@/i18n'
import { useSettings } from '@/settings'
import { flameSizes, heatBar } from '@/view/bars'
import { COLOR } from '@/view/tokens'

/**
 * Portfolio heat (loss if every stop hits, % of net worth) against the limit: the title with the tier badge, the
 * number with its flames, and the fire bar. Dashboard shows it as its own card; Portfolio inside the Trading card.
 */
export function HeatMeter({ heat, title, big = true }: { heat: number; title: ReactNode; big?: boolean }) {
  const { t, num } = useI18n()
  const limit = useSettings((x) => x.heatLimit)
  const { tier, flames } = heatTier(heat, limit)
  const numberColor = tier === 'overheated' ? COLOR.fireRed : flames >= 2 ? COLOR.fireOrange : COLOR.text
  const tierLabel = t(`heat.${tier}`)
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        {title}
        <span className={`rounded-md px-2 py-0.5 font-label text-[11px] uppercase ${flames ? 'bg-fire-red text-white' : 'bg-surface-2 text-text-muted'}`}>{tierLabel}</span>
      </div>
      <div className={`flex items-end justify-between gap-3 ${big ? 'min-h-[88px]' : ''}`}>
        <div className="flex flex-col gap-1">
          <span className={`font-display leading-[0.85] ${big ? 'text-7xl' : 'text-5xl'}`} style={{ color: numberColor }}>
            {num(heat, 1)}%
          </span>
          <Label>{t('heat.explain', { n: limit })}</Label>
        </div>
        <div aria-hidden="true" className="flex items-end gap-0.5">
          {flameSizes(flames).map((size, i) => (
            <PixelIcon key={i} name="flame" size={big ? size : Math.round(size * 0.75)} className="flame" />
          ))}
        </div>
      </div>
      <Segments items={heatBar(heat, limit)} height={big ? 16 : 12} label={`${t('heat.title')} ${num(heat, 1)}% / ${limit}%: ${tierLabel}`} />
    </>
  )
}
