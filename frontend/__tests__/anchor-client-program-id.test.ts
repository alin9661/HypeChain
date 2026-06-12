/**
 * T8 — frontend program-id startup guard.
 *
 * Outside dev/test the client must throw if NEXT_PUBLIC_HYPECHAIN_PROGRAM_ID is
 * unset or still the Anchor scaffold placeholder, so a half-configured build
 * fails loud instead of silently targeting the wrong program. Dev/test keeps
 * the placeholder fallback so local work + tests run without a real deploy.
 */

import {
  resolveProgramId,
  PLACEHOLDER_PROGRAM_ID,
} from '@/lib/anchor-client'

const REAL_ID = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'

describe('resolveProgramId (T8 guard)', () => {
  const origEnv = process.env.NODE_ENV
  const origId = process.env.NEXT_PUBLIC_HYPECHAIN_PROGRAM_ID

  const setNodeEnv = (v: string) =>
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: v,
      configurable: true,
    })

  afterEach(() => {
    setNodeEnv(origEnv as string)
    if (origId === undefined) delete process.env.NEXT_PUBLIC_HYPECHAIN_PROGRAM_ID
    else process.env.NEXT_PUBLIC_HYPECHAIN_PROGRAM_ID = origId
  })

  it('throws in production when the program id is unset', () => {
    setNodeEnv('production')
    delete process.env.NEXT_PUBLIC_HYPECHAIN_PROGRAM_ID
    expect(() => resolveProgramId()).toThrow(/unset or the Anchor scaffold/)
  })

  it('throws in production when left at the placeholder', () => {
    setNodeEnv('production')
    process.env.NEXT_PUBLIC_HYPECHAIN_PROGRAM_ID = PLACEHOLDER_PROGRAM_ID
    expect(() => resolveProgramId()).toThrow(/placeholder/)
  })

  it('returns the real id in production when set', () => {
    setNodeEnv('production')
    process.env.NEXT_PUBLIC_HYPECHAIN_PROGRAM_ID = REAL_ID
    expect(resolveProgramId().toBase58()).toBe(REAL_ID)
  })

  it('allows the placeholder fallback in dev/test when unset', () => {
    setNodeEnv('test')
    delete process.env.NEXT_PUBLIC_HYPECHAIN_PROGRAM_ID
    expect(resolveProgramId().toBase58()).toBe(PLACEHOLDER_PROGRAM_ID)
  })
})
