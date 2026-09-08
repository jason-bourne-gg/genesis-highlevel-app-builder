import { describe, expect, it, vi } from 'vitest'

const onSnapshot = vi.fn()

vi.mock('@/lib/firebase', () => ({ functionsBase: 'https://f.test', auth: {}, db: {} }))
vi.mock('firebase/firestore', () => ({ doc: () => ({}), onSnapshot }))
vi.mock('@/services/api', () => ({ callFunction: vi.fn(), ApiError: class extends Error {} }))

const { watchConnection } = await import('@/services/highlevel')

const connected = {
  hlLocationId: 'loc_1',
  hlLocationName: 'New York',
  hlConnectedAt: 1700000000000,
}

const emit = (data: unknown, error?: Error) => {
  const [, onNext, onErr] = onSnapshot.mock.calls.at(-1)!
  if (error) onErr(error)
  else onNext({ data: () => data })
}

describe('watchConnection', () => {
  it('reports connected with the location it read back', () => {
    const seen: unknown[] = []
    watchConnection('uid', (c) => seen.push(c))
    emit(connected)
    expect(seen.at(-1)).toEqual({
      status: 'connected',
      locationId: 'loc_1',
      locationName: 'New York',
      connectedAt: 1700000000000,
    })
  })

  // hlDisconnect writes nulls over these fields rather than deleting them, so a null
  // locationId has to read as disconnected — not as a connection to a location named null.
  it('reports disconnected when the location is nulled out', () => {
    const seen: unknown[] = []
    watchConnection('uid', (c) => seen.push(c))
    emit({ hlLocationId: null, hlLocationName: null, hlConnectedAt: null })
    expect(seen.at(-1)).toEqual({ status: 'disconnected' })
  })

  it('reports disconnected before the document exists', () => {
    const seen: unknown[] = []
    watchConnection('uid', (c) => seen.push(c))
    emit(undefined)
    expect(seen.at(-1)).toEqual({ status: 'disconnected' })
  })

  // A listener that fails silently is what makes a working button look broken: the state
  // simply stops updating and nothing says so.
  it('surfaces a listener failure instead of swallowing it', () => {
    const seen: unknown[] = []
    const errors: Error[] = []
    watchConnection('uid', (c) => seen.push(c), (e) => errors.push(e))
    emit(null, new Error('permission-denied'))
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('permission-denied')
    expect(seen, 'must not claim disconnected on a transient failure').toHaveLength(0)
  })
})
