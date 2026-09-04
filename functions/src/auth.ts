import type { Request } from 'firebase-functions/https'
import { getAuth } from 'firebase-admin/auth'
import { HlError } from './errors'

export async function uidFrom(req: Request): Promise<string> {
  const header = req.get('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) throw new HlError('unauthenticated', 'Missing ID token', 401)

  try {
    const decoded = await getAuth().verifyIdToken(token)
    return decoded.uid
  } catch {
    throw new HlError('unauthenticated', 'Invalid ID token', 401)
  }
}
