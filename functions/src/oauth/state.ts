import { getFirestore } from 'firebase-admin/firestore'
import { randomUUID } from 'node:crypto'
import { HlError } from '../errors'

const TTL_MS = 10 * 60 * 1000

export interface OAuthState {
  uid: string
  // Stored server-side rather than passed through HighLevel, so the round trip cannot move it.
  origin: string
  createdAt: number
}

// The nonce comes back to us on HighLevel's redirect, so it is caller-controlled. Firestore
// reads a "/" as another path segment, and a deeper path is a different document under
// different rules, so the shape is checked before it is used as one.
const NONCE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const ref = (nonce: string) => getFirestore().doc(`oauthStates/${nonce}`)

export async function mintState(uid: string, origin: string): Promise<string> {
  const nonce = randomUUID()
  await ref(nonce).set({ uid, origin, createdAt: Date.now() })
  return nonce
}

export async function claimState(nonce: string): Promise<OAuthState> {
  if (!NONCE.test(nonce)) throw new HlError('bad_state', 'Malformed state', 400)

  const doc = ref(nonce)
  const snap = await doc.get()
  if (!snap.exists) throw new HlError('bad_state', 'Unknown or already used state', 400)

  const state = snap.data() as OAuthState
  await doc.delete()

  if (Date.now() - state.createdAt > TTL_MS) {
    throw new HlError('bad_state', 'Authorization request expired', 400)
  }
  return state
}

// A claimed state deletes itself, but an abandoned one — the user closes the HighLevel tab —
// is never claimed and would sit here forever.
export async function sweepExpiredStates(): Promise<void> {
  const stale = await getFirestore()
    .collection('oauthStates')
    .where('createdAt', '<', Date.now() - TTL_MS)
    .limit(50)
    .get()
  await Promise.all(stale.docs.map((d) => d.ref.delete()))
}
