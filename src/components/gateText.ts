// Gate checks as sentences, shared by the gate panel and one-line reasons under buttons.
import type { Gate, GateCheck } from '@/domain/preTradeGate'
import type { I18n, Key } from '@/types'

/** One check as a sentence. */
export function checkText(c: GateCheck, f: I18n): string {
  const v = c.values ?? {}
  const n = (x: number | string | undefined) => (typeof x === 'number' ? f.num(x, 2) : '—')
  return f.t(`gate.c.${c.id}.${c.result}` as Key, {
    r: n(v.risk),
    l: n(v.limit),
    a: n(v.after),
    d: typeof v.last === 'string' ? f.day(v.last) : '',
    s: typeof v.status === 'string' ? f.t(`cb.status.${v.status}` as Key) : '',
  })
}

/** The first failing (else unknown) check, for a one-line reason under a button. */
export const firstProblem = (g: Gate, f: I18n): string | undefined => {
  const c = g.checks.find((x) => x.result === 'fail') ?? g.checks.find((x) => x.result === 'unknown')
  return c && checkText(c, f)
}

/** The journal line saved with each gated entry, so the decision stays on record next to the trade. */
export function gateNote(g: Gate, f: I18n): string {
  const problems = g.checks.filter((c) => c.result !== 'pass').map((c) => checkText(c, f))
  return f.t(`gate.journal.${g.decision}`, { list: problems.join('; ') })
}
