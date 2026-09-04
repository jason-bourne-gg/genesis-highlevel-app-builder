import { getFirestore } from 'firebase-admin/firestore'
import { config } from '../config'
import { HlError } from '../errors'

export interface HlTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  locationId: string
  companyId?: string
  userId?: string
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000

const ref = (uid: string) => getFirestore().doc(`users/${uid}/private/highlevel`)

export async function readTokens(uid: string): Promise<HlTokens | null> {
  const snap = await ref(uid).get()
  return snap.exists ? (snap.data() as HlTokens) : null
}

export async function saveTokens(uid: string, tokens: HlTokens): Promise<void> {
  await ref(uid).set(tokens)
}

export async function clearTokens(uid: string): Promise<void> {
  await ref(uid).delete()
}

async function post(body: Record<string, string>): Promise<HlTokens> {
  const res = await fetch(`${config.apiBase}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      user_type: 'Location',
      ...body,
    }),
  })

  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !payload?.access_token) {
    throw new HlError('token_exchange_failed', `HighLevel returned ${res.status}`, 502)
  }

  return {
    accessToken: String(payload.access_token),
    refreshToken: String(payload.refresh_token),
    expiresAt: Date.now() + Number(payload.expires_in ?? 86400) * 1000,
    locationId: String(payload.locationId ?? ''),
    companyId: payload.companyId ? String(payload.companyId) : undefined,
    userId: payload.userId ? String(payload.userId) : undefined,
  }
}

export function exchangeCode(code: string): Promise<HlTokens> {
  return post({ grant_type: 'authorization_code', code, redirect_uri: config.redirectUri })
}

export function refreshTokens(refreshToken: string): Promise<HlTokens> {
  return post({ grant_type: 'refresh_token', refresh_token: refreshToken })
}

// HighLevel refresh tokens are single use, so the transaction serialises concurrent refreshes.
// A Firestore transaction gives optimistic concurrency at commit, but it does not
// stop two callers making the refresh POST at the same time — and a HighLevel
// refresh token dies on first use, so the loser breaks the connection for good.
// One resource request fans out over every calendar, so this is the common case,
// not a rare one. Sharing the in-flight promise collapses them into one refresh.
const inFlight = new Map<string, Promise<HlTokens>>()

const stripEmpty = (t: HlTokens): Partial<HlTokens> =>
  Object.fromEntries(Object.entries(t).filter(([, v]) => v !== '' && v !== undefined))

export async function accessTokenFor(uid: string): Promise<HlTokens> {
  const pending = inFlight.get(uid)
  if (pending) return pending

  const db = getFirestore()
  const doc = ref(uid)

  const run = db.runTransaction(async (tx) => {
    const snap = await tx.get(doc)
    if (!snap.exists) throw new HlError('not_connected', 'No HighLevel connection', 412)

    const tokens = snap.data() as HlTokens
    if (tokens.expiresAt - Date.now() > REFRESH_MARGIN_MS) return tokens

    // A refresh response can omit locationId. Replacing the document would blank it
    // and every later request would send locationId= empty.
    const fresh = { ...tokens, ...stripEmpty(await refreshTokens(tokens.refreshToken)) }
    tx.set(doc, fresh)
    return fresh
  })

  inFlight.set(uid, run)
  try {
    return await run
  } finally {
    inFlight.delete(uid)
  }
}
