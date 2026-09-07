import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ functionsBase: 'https://f.test', auth: {}, db: {} }))
vi.mock('firebase/firestore', () => ({ collection: () => ({}), onSnapshot: () => () => {} }))

const { gate } = await import('@/services/flags')

const ALICE = 'uid_alice'
const BOB = 'uid_bob'
const gates = (over = {}) => ({ hl_writes: { enabled: false, actors: [], ...over } })

// This mirrors gate() in functions/src/flags/store.ts. The server stays the authority on
// every call; this copy only decides what the browser renders, so the two must agree or
// the UI promises something the proxy refuses.
describe('gate', () => {
  it('is off when neither gate is open', () => {
    expect(gate(gates(), 'hl_writes', ALICE)).toBe(false)
  })

  it('is on for anyone when the boolean gate is open', () => {
    expect(gate(gates({ enabled: true }), 'hl_writes', ALICE)).toBe(true)
  })

  it('is on for a listed actor only', () => {
    const g = gates({ actors: [ALICE] })
    expect(gate(g, 'hl_writes', ALICE)).toBe(true)
    expect(gate(g, 'hl_writes', BOB)).toBe(false)
  })

  // The sign-in page resolves google_login with no uid, before anyone is signed in.
  it('needs a uid for the actor gate but not the boolean one', () => {
    expect(gate(gates({ actors: [ALICE] }), 'hl_writes', null)).toBe(false)
    expect(gate(gates({ enabled: true }), 'hl_writes', null)).toBe(true)
  })

  // A flag we cannot read is a flag that is off — never a blocking failure, and never
  // an accidental grant.
  it('is off for a flag that is not there', () => {
    expect(gate(gates(), 'not_a_flag', ALICE)).toBe(false)
    expect(gate({}, 'hl_writes', ALICE)).toBe(false)
  })

  it('is off when the document is malformed', () => {
    expect(gate({ hl_writes: { enabled: false, actors: [] } }, 'hl_writes', ALICE)).toBe(false)
  })
})
