import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { FlagState } from '@/types'
import { functionsBase } from '@/lib/firebase'
import { idToken } from './auth'

export interface FlagGates {
  enabled: boolean
  actors: string[]
}

// Straight from Firestore, so a flip lands in every open tab and works before sign-in.
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

// Mirrors gate() in functions/src/flags/store.ts. The server stays the authority.
export function gate(gates: Record<string, FlagGates>, key: string, uid: string | null): boolean {
  const flag = gates[key]
  if (!flag) return false
  if (flag.enabled) return true
  return uid ? flag.actors.includes(uid) : false
}

// Memory only: it is a bearer credential, so a reload should re-lock.
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
