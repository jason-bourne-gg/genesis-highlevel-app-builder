import { getFirestore } from 'firebase-admin/firestore'
import { randomBytes } from 'node:crypto'
import { HlError } from '../errors'
import type { HlTokens } from '../hl/tokens'

const TTL_MS = 10 * 60 * 1000

// Opaque and looked up server-side, like the preview badge. 32 bytes of base64url is 43
// characters; anything else never reached a browser of ours.
const CODE = /^[A-Za-z0-9_-]{43}$/

export interface PendingConnection {
  // Whose flow this was, taken from the state the authorize URL was minted with — not from
  // whoever happens to arrive at the callback.
  uid: string
  tokens: HlTokens
  locationName: string
  createdAt: number
}

const ref = (code: string) => getFirestore().doc(`pendingConnections/${code}`)

export async function mintHandoff(
  pending: Omit<PendingConnection, 'createdAt'>,
): Promise<string> {
  const code = randomBytes(32).toString('base64url')
  await ref(code).set({ ...pending, createdAt: Date.now() })
  return code
}

// The whole point of the two-step: the tokens are only committed if the browser finishing
// the flow is signed in as the account that started it. An authorize URL is a link, and a
// link can be sent to someone else — so completing one must not be enough on its own to
// hand that someone's HighLevel location to whoever sent it.
export async function claimHandoff(code: string, uid: string): Promise<PendingConnection> {
  if (!CODE.test(code)) throw new HlError('bad_handoff', 'Malformed handoff code', 400)

  const doc = ref(code)
  const snap = await doc.get()
  if (!snap.exists) throw new HlError('bad_handoff', 'Unknown or already used handoff', 400)

  const pending = snap.data() as PendingConnection
  await doc.delete()

  // A mismatch is the attack, not a mistake: drop the tokens rather than leave them
  // sitting here for the sweep to find.
  if (pending.uid !== uid) {
    throw new HlError(
      'handoff_mismatch',
      'That HighLevel connection was started from a different account, so it was discarded.',
      403,
    )
  }
  if (Date.now() - pending.createdAt > TTL_MS) {
    throw new HlError('bad_handoff', 'The connection took too long to finish. Try again.', 400)
  }
  return pending
}

// A browser that never comes back — the tab is closed on the way — leaves live tokens here.
export async function sweepExpiredHandoffs(): Promise<void> {
  const stale = await getFirestore()
    .collection('pendingConnections')
    .where('createdAt', '<', Date.now() - TTL_MS)
    .limit(50)
    .get()
  await Promise.all(stale.docs.map((d) => d.ref.delete()))
}
