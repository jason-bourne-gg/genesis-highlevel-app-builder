import { getFirestore } from 'firebase-admin/firestore'
import { randomUUID } from 'node:crypto'
import { HlError } from '../errors'

const TTL_MS = 10 * 60 * 1000

export async function mintState(uid: string): Promise<string> {
  const nonce = randomUUID()
  await getFirestore().doc(`oauthStates/${nonce}`).set({ uid, createdAt: Date.now() })
  return nonce
}

export async function claimState(nonce: string): Promise<string> {
  const ref = getFirestore().doc(`oauthStates/${nonce}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HlError('bad_state', 'Unknown or already used state', 400)

  const { uid, createdAt } = snap.data() as { uid: string; createdAt: number }
  await ref.delete()

  if (Date.now() - createdAt > TTL_MS) {
    throw new HlError('bad_state', 'Authorization request expired', 400)
  }
  return uid
}
