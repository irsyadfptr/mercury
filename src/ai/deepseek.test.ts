import { describe, expect, it } from 'vitest'
import { buildMessages, errorKind, factLine, replyText } from './deepseek'

describe('deepseek prompt', () => {
  it('formats a fact line for pass, fail and unknown', () => {
    expect(factLine(true, 'ROE', '18% (≥ 15%)')).toBe('✓ pass · ROE · 18% (≥ 15%)')
    expect(factLine(false, 'P/E', '22 (≤ 15)')).toMatch(/^✗ fail/)
    expect(factLine(null, 'Beta', 'no data')).toMatch(/^\? unknown/)
  })

  it('sends the facts verbatim, allows an opinion but forbids new numbers', () => {
    const [system, user] = buildMessages('BBCA long-term score 9/15', ['a', 'b'], 'en')
    expect(system.role).toBe('system')
    expect(system.content).toMatch(/never compute new figures/)
    expect(system.content).toMatch(/clear recommendation/)
    expect(system.content).toMatch(/not licensed advice/)
    expect(system.content).toMatch(/Reply in English/)
    expect(user).toEqual({ role: 'user', content: 'BBCA long-term score 9/15\na\nb' })
  })

  it('answers a question from the same facts, trimmed and capped', () => {
    const [system, user] = buildMessages('PTBA 14/15', ['a'], 'en', `  why is the current ratio failing?  ${'x'.repeat(400)}`)
    expect(system.content).toMatch(/Answer the user's question/)
    expect(system.content).toMatch(/say what is missing/)
    expect(user.content.startsWith('PTBA 14/15\na\n\nQuestion: why is the current ratio failing?')).toBe(true)
    expect(user.content.length).toBe('PTBA 14/15\na\n\nQuestion: '.length + 300)
    expect(buildMessages('x', ['a'], 'en', '   ')[1].content).toBe('x\na')
  })

  it('asks for Indonesian when the app is in Indonesian', () => {
    expect(buildMessages('x', [], 'id')[0].content).toMatch(/Reply in Indonesian/)
  })
})

describe('deepseek response', () => {
  it('reads the reply text', () => {
    expect(replyText({ choices: [{ message: { content: '  hi \n' } }] })).toBe('hi')
    expect(replyText({ choices: [] })).toBeNull()
    expect(replyText({ choices: [{ message: { content: ' ' } }] })).toBeNull()
    expect(replyText(null)).toBeNull()
  })

  it('maps HTTP errors', () => {
    expect(errorKind(401)).toBe('badKey')
    expect(errorKind(402)).toBe('noBalance')
    expect(errorKind(429)).toBe('rateLimit')
    expect(errorKind(500)).toBe('failed')
  })
})
