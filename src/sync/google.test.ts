import { describe, expect, it } from 'vitest'
import { parseStoredToken } from './google'

const NOW = 1_800_000_000_000

describe('stored Google token', () => {
  it('keeps a fresh token and drops expired, near-expiry or malformed ones', () => {
    const fresh = { value: 'abc', expiresAt: NOW + 30 * 60_000 }
    expect(parseStoredToken(JSON.stringify(fresh), NOW)).toEqual(fresh)
    expect(parseStoredToken(JSON.stringify({ value: 'abc', expiresAt: NOW + 30_000 }), NOW)).toBeUndefined()
    expect(parseStoredToken(JSON.stringify({ value: 'abc', expiresAt: NOW - 1 }), NOW)).toBeUndefined()
    expect(parseStoredToken('{"value":1}', NOW)).toBeUndefined()
    expect(parseStoredToken('not json', NOW)).toBeUndefined()
    expect(parseStoredToken(null, NOW)).toBeUndefined()
  })
})
