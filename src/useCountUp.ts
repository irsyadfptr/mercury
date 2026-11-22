import { useEffect, useState } from 'react'

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A number that counts up from 0 to `target` once, when the component first shows (~0.9 s, ease-out), then follows
 * `target` directly. Shows the target straight away under reduced motion.
 */
export function useCountUp(target: number, ms = 900): number {
  const [done, setDone] = useState(reducedMotion)
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (done) return
    const start = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const p = Math.min(1, (now - start) / ms)
      setValue(Math.round(target * (1 - (1 - p) ** 3)))
      if (p < 1) frame = requestAnimationFrame(step)
      else setDone(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [done, target, ms])
  return done ? target : value
}
