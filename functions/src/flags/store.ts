import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { config } from '../config'
import { HlError } from '../errors'
import { FLAG_DEFS, findDef, type FlagDef } from './defs'

export interface FlagDoc {
  enabled: boolean
  // Uids only. This document is world-readable so the sign-in page can resolve a flag
  // before anyone is signed in, and an email address is a real identifier — the admin UI
  // resolves labels through flagsAdmin instead.
  actors: string[]
  updatedAt: number
  updatedBy: string
}

export type FlagState = FlagDef & FlagDoc

const col = () => getFirestore().collection('flags')

export async function readFlags(): Promise<FlagState[]> {
  const snap = await col().get()
  const stored = new Map(snap.docs.map((d) => [d.id, d.data() as Partial<FlagDoc>]))

  // Driven by the registry, not by what happens to be in the collection, so a flag
  // with no document yet still resolves to its default instead of vanishing.
  return FLAG_DEFS.map((def) => {
    const doc = stored.get(def.key) ?? {}
    return {
      ...def,
      enabled: typeof doc.enabled === 'boolean' ? doc.enabled : def.default,
      actors: Array.isArray(doc.actors) ? doc.actors.filter((a): a is string => typeof a === 'string') : [],
      updatedAt: Number(doc.updatedAt ?? 0),
      updatedBy: String(doc.updatedBy ?? ''),
    }
  })
}

// Flipper's two gates: the boolean gate opens it for everyone, the actor gate for a
// named list. Either is enough, which is what makes "off for all but these three"
// expressible without a second flag.
export function gate(flag: FlagState, uid: string | null): boolean {
  if (flag.enabled) return true
  if (!uid || flag.globalOnly) return false
  return flag.actors.includes(uid)
}

export async function resolveFlags(uid: string | null): Promise<Record<string, boolean>> {
  const flags = await readFlags()
  return Object.fromEntries(flags.map((f) => [f.key, gate(f, uid)]))
}

export async function flagOn(key: string, uid: string | null): Promise<boolean> {
  const flags = await readFlags()
  const flag = flags.find((f) => f.key === key)
  return flag ? gate(flag, uid) : false
}

// Standing root, from configuration rather than data: a row in Firestore that granted
// root would be a row worth attacking. An unverified email is refused because it is
// self-asserted at signup, so an allowlisted address nobody has registered yet is an
// account anyone could claim. The other way in is an unlock pass — see admin/unlock.ts.
export function isRoot(uid: string, email?: string, emailVerified = false): boolean {
  if (config.rootUids.includes(uid)) return true
  if (!email || !emailVerified) return false
  return config.rootEmails.includes(email.toLowerCase())
}

export interface FlagPatch {
  // The global gate.
  enabled?: boolean
  // The actor gate, set explicitly rather than added/removed, so the request says what
  // the toggle should end up as instead of what to do to it.
  actorUid?: string
  on?: boolean
}

// Written as field-level updates rather than a read-modify-write of the whole document.
// Two roots adding actors at the same moment would otherwise both read the same array and
// the second write would silently drop the first addition.
export async function setFlag(
  key: string,
  patch: FlagPatch,
  actorLabel: string,
): Promise<FlagState> {
  const def = findDef(key)
  if (!def) throw new HlError('unknown_flag', `Unknown flag ${key}`, 400)

  const update: Record<string, unknown> = { updatedAt: Date.now(), updatedBy: actorLabel }

  if (typeof patch.enabled === 'boolean') update.enabled = patch.enabled

  if (patch.actorUid) {
    if (def.globalOnly) {
      throw new HlError(
        'global_only',
        `${def.label} is read before sign-in, so it cannot be targeted at a user`,
        400,
      )
    }
    update.actors = patch.on
      ? FieldValue.arrayUnion(patch.actorUid)
      : FieldValue.arrayRemove(patch.actorUid)
  }

  // set/merge rather than update, so a flag whose document does not exist yet still works.
  await col().doc(key).set(update, { merge: true })

  const flags = await readFlags()
  return flags.find((f) => f.key === key) as FlagState
}

export interface AdminUser {
  uid: string
  email: string
  provider: string
  createdAt: number
}

// One page is the admin SDK's maximum. Beyond that the page would need paging, and the
// truncated flag is there so the UI can say so rather than quietly showing a subset.
const USER_PAGE = 1000

// Every account, so the admin can toggle a flag per user without knowing an address in
// advance. Resolved live from Firebase Auth: emails are deliberately not mirrored into
// the world-readable flag documents.
export async function listAllUsers(): Promise<{ users: AdminUser[]; truncated: boolean }> {
  const page = await getAuth().listUsers(USER_PAGE)
  const users = page.users
    .map((u) => ({
      uid: u.uid,
      email: u.email ?? u.uid,
      provider: u.providerData[0]?.providerId ?? 'password',
      createdAt: Date.parse(u.metadata.creationTime) || 0,
    }))
    .sort((a, b) => b.createdAt - a.createdAt)

  return { users, truncated: Boolean(page.pageToken) }
}

// So the admin UI lists every registered flag even before one has been touched.
export async function seedFlags(): Promise<void> {
  const snap = await col().get()
  const have = new Set(snap.docs.map((d) => d.id))
  const missing = FLAG_DEFS.filter((d) => !have.has(d.key))
  if (!missing.length) return

  const batch = getFirestore().batch()
  for (const def of missing) {
    batch.set(col().doc(def.key), {
      enabled: def.default,
      actors: [],
      updatedAt: 0,
      updatedBy: 'default',
    })
  }
  await batch.commit()
}
