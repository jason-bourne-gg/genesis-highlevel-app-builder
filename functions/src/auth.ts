import type { Request } from 'firebase-functions/https'
import { getAuth } from 'firebase-admin/auth'
import { HlError } from './errors'

export interface Caller {
  uid: string
  email?: string
  emailVerified: boolean
  // "google.com", "password", "custom" — used to explain a failed sign-in, never to grant.
  provider: string
  // Set by rootLogin as a custom claim on the token. Firebase signs the token, so this
  // cannot be forged by a client the way a self-asserted email can.
  root: boolean
}

const bearer = (req: Request): string => {
  const header = req.get('Authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

export async function callerFrom(req: Request): Promise<Caller> {
  const token = bearer(req)
  if (!token) throw new HlError('unauthenticated', 'Missing ID token', 401)

  try {
    const decoded = await getAuth().verifyIdToken(token)
    const firebase = decoded.firebase as { sign_in_provider?: string } | undefined
    return {
      uid: decoded.uid,
      email: typeof decoded.email === 'string' ? decoded.email : undefined,
      emailVerified: decoded.email_verified === true,
      provider: firebase?.sign_in_provider ?? 'unknown',
      root: decoded.root === true,
    }
  } catch {
    throw new HlError('unauthenticated', 'Invalid ID token', 401)
  }
}

export async function uidFrom(req: Request): Promise<string> {
  return (await callerFrom(req)).uid
}

// For endpoints that serve signed-out callers too. A bad token is the same as none
// here rather than an error, because the caller may legitimately not have one yet.
export async function optionalUid(req: Request): Promise<string | null> {
  if (!bearer(req)) return null
  try {
    return (await callerFrom(req)).uid
  } catch {
    return null
  }
}
