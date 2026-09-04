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

// HighLevel refresh tokens are single use — a second concurrent refresh with the same
// token invalidates the connection permanently. The transaction serialises them.
export async function accessTokenFor(uid: string): Promise<HlTokens> {
  const db = getFirestore()
  const doc = ref(uid)

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(doc)
    if (!snap.exists) throw new HlError('not_connected', 'No HighLevel connection', 412)

    const tokens = snap.data() as HlTokens
    if (tokens.expiresAt - Date.now() > REFRESH_MARGIN_MS) return tokens

    const fresh = await refreshTokens(tokens.refreshToken)
    tx.set(doc, fresh)
    return fresh
  })
}
