import { getFirestore } from 'firebase-admin/firestore'
import { randomBytes } from 'node:crypto'
import { HlError } from '../errors'

// Minted per render, so the lifetime only has to outlive one page load.
const TTL_MS = 15 * 60 * 1000

export interface PreviewGrant {
  uid: string
  projectId: string
  expiresAt: number
}

const ref = (token: string) => getFirestore().doc(`previewTokens/${token}`)

// Opaque random string looked up server-side, not a signed blob: revocable and simpler.
export async function mintPreviewToken(
  uid: string,
  projectId: string,
): Promise<{ token: string; expiresAt: number }> {
  const token = randomBytes(32).toString('base64url')
  const grant: PreviewGrant = { uid, projectId, expiresAt: Date.now() + TTL_MS }
  await ref(token).set(grant)
  return { token, expiresAt: grant.expiresAt }
}

export async function claimPreviewToken(token: string): Promise<PreviewGrant> {
  if (!token) throw new HlError('no_preview_token', 'Missing preview token', 401)

  const snap = await ref(token).get()
  if (!snap.exists) throw new HlError('bad_preview_token', 'Unknown preview token', 401)

  const grant = snap.data() as PreviewGrant
  if (Date.now() > grant.expiresAt) {
    await ref(token).delete()
    throw new HlError('bad_preview_token', 'Preview token expired', 401)
  }
  return grant
}

export async function assertOwns(uid: string, projectId: string): Promise<void> {
  const snap = await getFirestore().doc(`projects/${projectId}`).get()
  if (!snap.exists || snap.data()?.ownerUid !== uid) {
    throw new HlError('forbidden', 'Not your project', 403)
  }
}

// Tokens are minted per render and only deleted when claimed after expiry, so the
// collection would grow without bound. Single-field range query, no index needed.
export async function sweepExpired(): Promise<void> {
  const stale = await getFirestore()
    .collection('previewTokens')
    .where('expiresAt', '<', Date.now())
    .limit(50)
    .get()
  await Promise.all(stale.docs.map((d) => d.ref.delete()))
}
