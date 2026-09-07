import { randomBytes, timingSafeEqual } from 'node:crypto'
import {
  getFirestore,
  type DocumentReference,
  type DocumentSnapshot,
} from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { onRequest } from 'firebase-functions/v2/https'
import { uidFrom } from '../auth'
import { config } from '../config'

// Opaque and looked up server-side, like the preview badge, so it stays revocable.
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

// Minted per unlock, so without this the collection grows without bound.
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
const PER_CALLER = 10
// Bounds creating accounts to farm fresh per-account budgets.
const GLOBAL = 60

export function credentialMatches(username: string, password: string): boolean {
  const { rootUsername, rootPassword } = config
  if (!rootUsername || !rootPassword) return false
  return (
    matches(username.trim().toLowerCase(), rootUsername.toLowerCase()) &&
    matches(password, rootPassword)
  )
}

export function clientIp(xff: string | undefined, fallback: string | undefined): string {
  const hops = (xff ?? '').split(',').map((h) => h.trim()).filter(Boolean)
  return hops.length ? hops[hops.length - 1] : (fallback ?? 'unknown')
}

interface Bucket {
  count: number
  startedAt: number
}

// In Firestore, not in memory: Cloud Run would give an attacker one bucket per instance.
export async function throttle(uid: string): Promise<boolean> {
  const db = getFirestore()
  const perCaller = db.doc(`adminUnlockAttempts/${encodeURIComponent(uid)}`)
  // Not "__all__": Firestore reserves __.*__ ids, and only rejects them at write time.
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

    // Both spend before either answer is returned, so a refused attempt still counts.
    const callerOk = spend(callerSnap, perCaller, PER_CALLER)
    const allOk = spend(allSnap, global, GLOBAL)
    return callerOk && allOk
  })
}

// Sudo, not a second login: the caller keeps their session and the unlock is attributable.
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
    // Fail closed: a gate that opens when its rate limit is down is not a gate.
    logger.error('admin.unlock.throttle_failed', { ip, message: (e as Error).message })
    return void res.status(503).json({
      error: 'Could not check the rate limit. Try again shortly.',
      code: 'throttle_unavailable',
    })
  }

  const body = (req.body ?? {}) as { username?: string; password?: string }
  const username = String(body.username ?? '').trim()
  const password = String(body.password ?? '')

  if (!credentialMatches(username, password)) {
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
