import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { FlagActor, FlagState } from '@/types'
import { callFunction } from './api'

export interface FlagGates {
  enabled: boolean
  actors: FlagActor[]
}

// Read straight from Firestore rather than through a function, so a flag flipped in the
// admin takes effect in every open tab without a reload. Rules allow reads and deny
// writes; the only way to change one is the root-checked function below.
export function watchFlagGates(onChange: (gates: Record<string, FlagGates>) => void): () => void {
  return onSnapshot(
    collection(db, 'flags'),
    (snap) => {
      const out: Record<string, FlagGates> = {}
      for (const doc of snap.docs) {
        const data = doc.data()
        out[doc.id] = {
          enabled: data.enabled === true,
          actors: Array.isArray(data.actors) ? (data.actors as FlagActor[]) : [],
        }
      }
      onChange(out)
    },
    // A flag we cannot read is a flag that is off. Never a blocking failure.
    () => onChange({}),
  )
}

// Both gates, the way Flipper does it: on for everyone, or on for this actor.
export function gate(gates: Record<string, FlagGates>, key: string, uid: string | null): boolean {
  const flag = gates[key]
  if (!flag) return false
  if (flag.enabled) return true
  return uid ? flag.actors.some((a) => a.uid === uid) : false
}

export interface AdminView {
  root: boolean
  flags: FlagState[]
}

export function loadAdminFlags(): Promise<AdminView> {
  return callFunction<AdminView>('/flagsAdmin')
}

export interface FlagPatch {
  enabled?: boolean
  addActor?: string
  removeActor?: string
}

export function patchFlag(key: string, patch: FlagPatch): Promise<{ flag: FlagState }> {
  return callFunction<{ flag: FlagState }>('/flagsAdmin', { key, patch })
}
