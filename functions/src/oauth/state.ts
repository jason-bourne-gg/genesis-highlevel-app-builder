import { getFirestore } from 'firebase-admin/firestore'
import { randomUUID } from 'node:crypto'
import { HlError } from '../errors'

const TTL_MS = 10 * 60 * 1000

export interface OAuthState {
  uid: string
  // Vetted against the allowlist when the flow started, so the callback can use it
  // as-is. Storing it here rather than passing it through HighLevel means the round
  // trip cannot be talked into redirecting somewhere else.
  origin: string
  createdAt: number
}

export async function mintState(uid: string, origin: string): Promise<string> {
  const nonce = randomUUID()
  await getFirestore().doc(`oauthStates/${nonce}`).set({ uid, origin, createdAt: Date.now() })
  return nonce
}

export async function claimState(nonce: string): Promise<OAuthState> {
  const ref = getFirestore().doc(`oauthStates/${nonce}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HlError('bad_state', 'Unknown or already used state', 400)

  const state = snap.data() as OAuthState
  await ref.delete()

  if (Date.now() - state.createdAt > TTL_MS) {
    throw new HlError('bad_state', 'Authorization request expired', 400)
  }
  return state
}
