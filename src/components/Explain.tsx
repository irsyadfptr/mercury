import { useEffect, useState, type FormEvent } from 'react'
import { AiError, buildMessages, explain, MAX_QUESTION, type ExplainError } from '@/ai/deepseek'
import { Button } from '@/components/ui/button'
import { Label, fieldClass } from '@/components/ui-bits'
import { useI18n } from '@/i18n'
import { useSettings } from '@/settings'

type State = { status: 'idle' } | { status: 'loading' } | { status: 'error'; error: ExplainError } | { status: 'done'; text: string; question?: string }

/**
 * "Explain" button and "Ask" field: send the page's already-computed facts (plus the user's question) to DeepSeek and show
 * its plain-language reply. Each answer stands alone; there is no chat memory.
 */
export function Explain({ title, facts }: { title: string; facts: string[] }) {
  const { t, lang } = useI18n()
  const key = useSettings((s) => s.deepseekKey)
  const [state, setState] = useState<State>({ status: 'idle' })
  const [question, setQuestion] = useState('')
  const factsKey = `${title}\n${facts.join('\n')}`
  // A new check (or language) makes the old reply stale.
  useEffect(() => setState({ status: 'idle' }), [factsKey, lang])

  if (!key) return <p className="text-xs text-text-muted">{t('ai.needKey')}</p>

  const run = async (q?: string) => {
    setState({ status: 'loading' })
    try {
      setState({ status: 'done', text: await explain(key, buildMessages(title, facts, lang, q)), question: q })
    } catch (e) {
      setState({ status: 'error', error: e instanceof AiError ? e.kind : 'failed' })
    }
  }
  const ask = (e: FormEvent) => {
    e.preventDefault()
    const q = question.trim()
    if (q) void run(q).then(() => setQuestion(''))
  }
  const loading = state.status === 'loading'

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{t('ai.title')}</Label>
        <Button variant="outline" size="sm" onClick={() => void run()} disabled={loading}>
          {t(loading ? 'ai.loading' : state.status === 'done' && !state.question ? 'ai.again' : 'ai.explain')}
        </Button>
      </div>
      {state.status === 'error' && <p className="text-sm text-down">{t(`ai.error.${state.error}`)}</p>}
      {state.status === 'done' && (
        <>
          {state.question && <p className="text-sm font-medium">“{state.question}”</p>}
          <p className="text-sm whitespace-pre-line">{state.text}</p>
        </>
      )}
      <form onSubmit={ask} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={MAX_QUESTION}
          placeholder={t('ai.askPlaceholder')}
          aria-label={t('ai.ask')}
          className={`${fieldClass} min-w-0 flex-1`}
        />
        <Button type="submit" variant="outline" size="sm" disabled={loading || !question.trim()}>
          {t('ai.ask')}
        </Button>
      </form>
      <p className="text-xs text-text-muted">{t('ai.note')}</p>
    </div>
  )
}
