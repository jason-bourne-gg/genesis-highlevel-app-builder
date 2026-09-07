import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { FlagState } from '@/types'
import { functionsBase } from '@/lib/firebase'
import { idToken } from './auth'

export interface FlagGates {
  enabled: boolean
  actors: string[]
}

// Read straight from Firestore rather than through a function, so a flag flipped in the
// admin takes effect in every open tab without a reload, and so the sign-in page can
// resolve one before anyone is signed in. Rules allow reads and deny writes.
export function watchFlagGates(onChange: (gates: Record<string, FlagGates>) => void): () => void {
  return onSnapshot(
    collection(db, 'flags'),
    (snap) => {
      const out: Record<string, FlagGates> = {}
      for (const doc of snap.docs) {
        const data = doc.data()
        out[doc.id] = {
          enabled: data.enabled === true,
          actors: Array.isArray(data.actors) ? (data.actors as string[]) : [],
        }
      }
      onChange(out)
    },
    // A flag we cannot read is a flag that is off. Never a blocking failure.
    () => onChange({}),
  )
}

// Both gates, the way Flipper does it: on for everyone, or on for this actor. globalOnly
// is not consulted here because setFlag refuses to add an actor to such a flag, so its
// list is always empty — the server remains the authority either way.
export function gate(gates: Record<string, FlagGates>, key: string, uid: string | null): boolean {
  const flag = gates[key]
  if (!flag) return false
  if (flag.enabled) return true
  return uid ? flag.actors.includes(uid) : false
}

// The unlock pass, held in memory only. Not sessionStorage: it is a bearer credential for
// the flag admin, and re-entering the root credential after a reload is the cheaper cost.
let pass = ''

export const unlocked = () => pass !== ''
export const lock = () => {
  pass = ''
}

export interface AdminUser {
  uid: string
  email: string
  provider: string
  createdAt: number
}

export interface AdminView {
  root: boolean
  flags: FlagState[]
  users: AdminUser[]
  // True when there are more accounts than one page, so the UI can say so rather than
  // quietly showing a subset.
  truncated: boolean
}

async function adminCall<T>(payload?: unknown): Promise<T> {
  const res = await fetch(`${functionsBase}/flagsAdmin`, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${await idToken()}`,
      ...(pass ? { 'X-Admin-Token': pass } : {}),
      ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })

  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body as T
}

// Exchanges the root credential for a short-lived pass. The caller keeps their own
// session — this is closer to sudo than to a second sign-in.
export async function unlock(username: string, password: string): Promise<void> {
  const res = await fetch(`${functionsBase}/adminUnlock`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await idToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  })

  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string }
  if (!res.ok || !body.token) throw new Error(body.error ?? 'Could not unlock')
  pass = body.token
}

export const loadAdminFlags = () => adminCall<AdminView>()

export interface FlagPatch {
  enabled?: boolean
  actorUid?: string
  on?: boolean
}

export const patchFlag = (key: string, patch: FlagPatch) =>
  adminCall<{ flag: FlagState }>({ key, patch })
