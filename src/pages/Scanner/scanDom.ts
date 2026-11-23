import type { MoodLight } from '@/market/mood'

/** Card colour for a mood light (play skin data-tone). */
export const MOOD_TONE: Record<MoodLight, string> = { red: 'red', yellow: 'gold', green: 'green' }

/** Scroll the ticker check (#scan-check, see ScanLayout) into view, unless its top is already on screen. */
export function showCheck() {
  requestAnimationFrame(() => {
    const el = document.getElementById('scan-check')
    if (!el) return
    const top = el.getBoundingClientRect().top
    if (top >= 0 && top < innerHeight * 0.6) return
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  })
}
