import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { config } from '../config'
import { HlError } from '../errors'
import { FLAG_DEFS, findDef, type FlagDef } from './defs'

export interface FlagActor {
  uid: string
  // Stored alongside the uid purely so the admin UI can show something readable.
  email: string
}

export interface FlagDoc {
  enabled: boolean
  actors: FlagActor[]
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
      actors: Array.isArray(doc.actors) ? doc.actors : [],
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
  return flag.actors.some((a) => a.uid === uid)
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

// Root is configuration, never data: a row in Firestore that grants root would be a row
// worth attacking. Three sources, most trustworthy first — the signed claim from
// rootLogin, an explicit uid list, then a verified email. An unverified address is
// refused because it is self-asserted at signup, so an allowlisted address nobody has
// registered yet is an account anyone could claim.
export function isRoot(
  uid: string,
  email?: string,
  emailVerified = false,
  claim = false,
): boolean {
  // A signed custom claim, set by rootLogin against the credential in functions/.env.
  if (claim) return true
  if (config.rootUids.includes(uid)) return true
  if (!email || !emailVerified) return false
  return config.rootEmails.includes(email.toLowerCase())
}

export interface FlagPatch {
  enabled?: boolean
  addActor?: string
  removeActor?: string
}

export async function setFlag(
  key: string,
  patch: FlagPatch,
  actorLabel: string,
): Promise<FlagState> {
  const def = findDef(key)
  if (!def) throw new HlError('unknown_flag', `Unknown flag ${key}`, 400)

  const flags = await readFlags()
  const current = flags.find((f) => f.key === key) as FlagState

  let enabled = current.enabled
  let actors = [...current.actors]

  if (typeof patch.enabled === 'boolean') enabled = patch.enabled

  if (patch.addActor) {
    if (def.globalOnly) {
      throw new HlError(
        'global_only',
        `${def.label} is read before sign-in, so it cannot be targeted at a user`,
        400,
      )
    }
    const email = patch.addActor.trim().toLowerCase()
    let user
    try {
      user = await getAuth().getUserByEmail(email)
    } catch {
      throw new HlError('no_such_user', `No Genesis account for ${email}`, 404)
    }
    if (!actors.some((a) => a.uid === user.uid)) {
      actors.push({ uid: user.uid, email: user.email ?? email })
    }
  }

  if (patch.removeActor) {
    actors = actors.filter((a) => a.uid !== patch.removeActor)
  }

  const doc: FlagDoc = { enabled, actors, updatedAt: Date.now(), updatedBy: actorLabel }
  await col().doc(key).set(doc)
  return { ...def, ...doc }
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
