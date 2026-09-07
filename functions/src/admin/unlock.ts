import { randomBytes } from 'node:crypto'
import {
  getFirestore,
  type DocumentReference,
  type DocumentSnapshot,
} from 'firebase-admin/firestore'
import { timingSafeEqual } from 'node:crypto'
import { logger } from 'firebase-functions/v2'
import { onRequest } from 'firebase-functions/v2/https'
import { uidFrom } from '../auth'
import { config } from '../config'

// Unlocking is not signing in. The caller keeps their own session; the credential only
// buys a short-lived pass for the flag admin, held in memory by the page that asked for
// it. Same shape as the preview badge: an opaque random string looked up server-side, so
// it is revocable and there is no signing key to manage.
const TTL_MS = 30 * 60 * 1000

export interface AdminGrant {
  uid: string
  expiresAt: number
}

const grantRef = (token: string) => getFirestore().doc(`adminTokens/${token}`)

async function mintAdminToken(uid: string): Promise<{ token: string; expiresAt: number }> {
  const token = randomBytes(32).toString('base64url')
  const grant: AdminGrant = { uid, expiresAt: Date.now() + TTL_MS }
  await grantRef(token).set(grant)
  return { token, expiresAt: grant.expiresAt }
}

export async function claimAdminToken(token: string): Promise<AdminGrant | null> {
  if (!token) return null
  const snap = await grantRef(token).get()
  if (!snap.exists) return null

  const grant = snap.data() as AdminGrant
  if (Date.now() > grant.expiresAt) {
    await grantRef(token).delete().catch(() => {})
    return null
  }
  return grant
}

// Minted per unlock and only removed when claimed after expiry, so the collection would
// otherwise grow without bound. Single-field range query, no index needed.
export async function sweepAdminTokens(): Promise<void> {
  const stale = await getFirestore()
    .collection('adminTokens')
    .where('expiresAt', '<', Date.now())
    .limit(50)
    .get()
  await Promise.all(stale.docs.map((d) => d.ref.delete()))
}

// Constant time, and length-safe: comparing Buffers of different lengths throws.
function matches(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

const WINDOW_MS = 15 * 60 * 1000
// Per signed-in account. Unlocking requires authentication, so this is keyed on something
// the caller cannot change without creating a new account.
const PER_CALLER = 10
// Shared backstop, so creating accounts to farm fresh buckets is bounded too. The cost is
// that a determined attacker can lock the flag admin for a window, which is the cheaper
// failure of the two.
const GLOBAL = 60

// For the log line only. X-Forwarded-For is a list the caller can prepend to, and how many
// hops the infrastructure appends depends on the ingress path — so it is not something to
// key a rate limit on. The limit uses the authenticated uid instead, which cannot be forged.
// The last entry is the closest thing to a real address here.
export function clientIp(xff: string | undefined, fallback: string | undefined): string {
  const hops = (xff ?? '').split(',').map((h) => h.trim()).filter(Boolean)
  return hops.length ? hops[hops.length - 1] : (fallback ?? 'unknown')
}

// The only password endpoint in the project, so it gets the only rate limit. Counted in
// Firestore rather than in memory, because Cloud Run runs several instances and an
// in-memory counter would hand an attacker one bucket per container.
interface Bucket {
  count: number
  startedAt: number
}

// The only password endpoint in the project, so it gets the only rate limit. Counted in
// Firestore rather than in memory, because Cloud Run runs several instances and an
// in-memory counter would hand an attacker one bucket per container.
//
// getAll rather than two awaited gets: a Firestore transaction reads every document it
// needs in one call, and issuing concurrent tx.get() calls throws.
async function throttle(uid: string): Promise<boolean> {
  const db = getFirestore()
  const perCaller = db.doc(`adminUnlockAttempts/${encodeURIComponent(uid)}`)
  // Not "__all__": Firestore reserves document ids matching __.*__ and rejects them at
  // write time, which the client-side path validation does not catch.
  const global = db.doc('adminUnlockAttempts/_global')

  return db.runTransaction(async (tx) => {
    const now = Date.now()
    const [callerSnap, allSnap] = await tx.getAll(perCaller, global)

    const spend = (
      snap: DocumentSnapshot,
      ref: DocumentReference,
      limit: number,
    ): boolean => {
      const data = snap.exists ? (snap.data() as Bucket) : null
      if (!data || now - data.startedAt > WINDOW_MS) {
        tx.set(ref, { count: 1, startedAt: now })
        return true
      }
      if (data.count >= limit) return false
      tx.update(ref, { count: data.count + 1 })
      return true
    }

    // Both are spent before either result is returned, so a rejected attempt still counts
    // against each bucket rather than being free once one limit is already hit.
    const callerOk = spend(callerSnap, perCaller, PER_CALLER)
    const allOk = spend(allSnap, global, GLOBAL)
    return callerOk && allOk
  })
}

// Exchanges the root credential in functions/.env for a short-lived pass to the flag
// admin. The caller must already be signed in, so an unlock is always attributable, and
// their own session is untouched — this is closer to sudo than to a second login.
//
// The credential is compared here rather than anywhere in the browser bundle.
export const adminUnlock = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') return void res.status(405).json({ error: 'Use POST' })

  const { rootUsername, rootPassword } = config
  if (!rootUsername || !rootPassword) {
    return void res.status(404).json({
      error: 'Flag administration is not configured on this deployment.',
      code: 'root_not_configured',
    })
  }

  let uid: string
  try {
    uid = await uidFrom(req)
  } catch (e) {
    return void res.status(401).json({ error: (e as Error).message, code: 'unauthenticated' })
  }

  const ip = clientIp(req.get('x-forwarded-for'), req.ip)
  try {
    if (!(await throttle(uid))) {
      return void res.status(429).json({
        error: 'Too many attempts. Wait fifteen minutes.',
        code: 'throttled',
      })
    }
  } catch (e) {
    // Fail closed. A credential gate that opens when its rate limit is unavailable is not
    // a gate, and the flag admin being briefly unreachable is the cheaper failure.
    logger.error('admin.unlock.throttle_failed', { ip, message: (e as Error).message })
    return void res.status(503).json({
      error: 'Could not check the rate limit. Try again shortly.',
      code: 'throttle_unavailable',
    })
  }

  const body = (req.body ?? {}) as { username?: string; password?: string }
  const username = String(body.username ?? '').trim()
  const password = String(body.password ?? '')

  if (
    !matches(username.toLowerCase(), rootUsername.toLowerCase()) ||
    !matches(password, rootPassword)
  ) {
    logger.warn('admin.unlock.rejected', { ip, uid, username })
    // Same message either way: which half was wrong is not the caller's business.
    return void res.status(401).json({
      error: 'Wrong username or password.',
      code: 'bad_root_credential',
    })
  }

  const grant = await mintAdminToken(uid)
  void sweepAdminTokens().catch(() => {})
  logger.info('admin.unlock.granted', { ip, uid })
  res.json(grant)
})
