import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { timingSafeEqual } from 'node:crypto'
import { logger } from 'firebase-functions/v2'
import { onRequest } from 'firebase-functions/v2/https'
import { config } from '../config'

// A stable uid derived from the username, so the root account is one Firebase user
// across deploys rather than a new one per sign-in.
export const rootUid = (username: string) => `root_${username.toLowerCase()}`

// .invalid is reserved by IANA and can never resolve, so this address cannot receive
// mail and cannot be verified. It exists only to give the Firebase user a login handle.
export const rootEmail = (username: string) => `${username.toLowerCase()}@genesis.invalid`

// Constant time, and length-safe: comparing Buffers of different lengths throws.
function matches(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 10

// The only password endpoint in the project, so it gets the only rate limit. Keyed on
// the caller's IP in Firestore rather than in memory, because Cloud Run runs several
// instances and an in-memory counter would give an attacker one bucket per container.
async function throttle(ip: string): Promise<boolean> {
  const doc = getFirestore().doc(`rootLoginAttempts/${encodeURIComponent(ip)}`)
  return getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(doc)
    const now = Date.now()
    const data = snap.exists ? (snap.data() as { count: number; startedAt: number }) : null

    if (!data || now - data.startedAt > WINDOW_MS) {
      tx.set(doc, { count: 1, startedAt: now })
      return true
    }
    if (data.count >= MAX_ATTEMPTS) return false

    tx.update(doc, { count: data.count + 1 })
    return true
  })
}

// Brings a Firebase user into line with the root credential in functions/.env, then hands
// the client the address to sign in with. Only ever touches the one fixed uid, and the
// `root: true` claim is only ever set on that uid — so if someone else has squatted the
// address on a different account, root sign-in breaks rather than being handed over.
async function ensureRootUser(username: string, password: string): Promise<string> {
  const uid = rootUid(username)
  const email = rootEmail(username)
  const auth = getAuth()

  try {
    await auth.getUser(uid)
    // Re-synced every time, so rotating the credential in .env rotates the real account.
    await auth.updateUser(uid, { email, password, emailVerified: false })
  } catch (e) {
    if ((e as { code?: string }).code !== 'auth/user-not-found') throw e
    try {
      await auth.createUser({ uid, email, password, emailVerified: false })
    } catch (inner) {
      if ((inner as { code?: string }).code === 'auth/email-already-exists') {
        throw new Error(
          `${email} is already registered to another account, so root sign-in cannot use it. Change ROOT_USERNAME.`,
        )
      }
      throw inner
    }
  }

  // Set before the client signs in, so the ID token it receives already carries it.
  await auth.setCustomUserClaims(uid, { root: true })
  return email
}

// Checks the root credential from functions/.env and returns the address to sign in with.
// The credential never reaches the browser bundle.
//
// A signed claim rather than an email allowlist, because an allowlisted address nobody has
// registered yet is an account anyone could claim. Deliberately not a custom token: signing
// one needs iam.serviceAccounts.signBlob on the runtime service account, which is an extra
// IAM grant this deployment would otherwise not need.
export const rootLogin = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') return void res.status(405).json({ error: 'Use POST' })

  const { rootUsername, rootPassword } = config
  if (!rootUsername || !rootPassword) {
    return void res.status(404).json({
      error: 'Root sign-in is not configured on this deployment.',
      code: 'root_not_configured',
    })
  }

  const ip = String(req.get('x-forwarded-for') ?? req.ip ?? 'unknown').split(',')[0].trim()
  if (!(await throttle(ip))) {
    return void res.status(429).json({
      error: 'Too many attempts. Wait fifteen minutes.',
      code: 'throttled',
    })
  }

  const body = (req.body ?? {}) as { username?: string; password?: string }
  const username = String(body.username ?? '').trim()
  const password = String(body.password ?? '')

  if (!matches(username.toLowerCase(), rootUsername.toLowerCase()) || !matches(password, rootPassword)) {
    logger.warn('root.login.rejected', { ip, username })
    // Same message either way: which half was wrong is not the caller's business.
    return void res.status(401).json({ error: 'Wrong username or password.', code: 'bad_root_credential' })
  }

  try {
    const email = await ensureRootUser(rootUsername, rootPassword)
    logger.info('root.login.granted', { ip, uid: rootUid(rootUsername) })
    res.json({ email })
  } catch (e) {
    logger.error('root.login.failed', { ip, message: (e as Error).message })
    res.status(500).json({ error: (e as Error).message, code: 'root_setup_failed' })
  }
})
