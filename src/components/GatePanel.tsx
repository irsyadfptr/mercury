import { useI18n } from '@/i18n'
import type { Gate, GateDecision } from '@/domain/preTradeGate'
import { checkText } from './gateText'

const TONE: Record<GateDecision, string> = { go: 'border-up text-up', review: 'border-warn-text text-warn-text', noGo: 'border-down text-down' }
const MARK = { pass: '✓', fail: '✗', unknown: '?' } as const
const MARK_CLASS = { pass: 'text-up', fail: 'text-down', unknown: 'text-warn-text' } as const

/**
 * The pre-trade gate's checks and decision. With `ack`, a non-GO decision shows a checkbox the caller requires before saving
 * (the app records trades; it can't stop one already placed at the broker, but it makes the rule break explicit).
 */
export function GatePanel({ gate, ack }: { gate: Gate; ack?: { checked: boolean; onChange: (v: boolean) => void } }) {
  const f = useI18n()
  const { t } = f
  return (
    <div role="status" className={`flex flex-col gap-2 rounded-md border px-3 py-2 ${TONE[gate.decision].split(' ')[0]}`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={`font-label text-xs uppercase ${TONE[gate.decision].split(' ')[1]}`}>{t(`gate.${gate.decision}`)}</span>
        <span className="text-xs text-text-muted">{t(`gate.${gate.decision}.note`)}</span>
      </div>
      <ul className="flex flex-col gap-0.5 text-sm">
        {gate.checks.map((c) => (
          <li key={c.id} className="flex gap-2">
            <span aria-hidden className={`w-3 shrink-0 font-mono ${MARK_CLASS[c.result]}`}>
              {MARK[c.result]}
            </span>
            <span>
              <span className="sr-only">{t(`rule.${c.result === 'pass' ? 'pass' : c.result === 'fail' ? 'fail' : 'unknown'}`)}: </span>
              {checkText(c, f)}
            </span>
          </li>
        ))}
      </ul>
      {ack && gate.decision !== 'go' && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={ack.checked} onChange={(e) => ack.onChange(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
          {t(`gate.ack.${gate.decision}`)}
        </label>
      )}
    </div>
  )
}
