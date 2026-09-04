import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { CalendarEvent, Connection, Contact, Conversation } from '@/types'
import { callFunction } from './api'

interface UserDoc {
  hlLocationId?: string
  hlLocationName?: string
  hlConnectedAt?: number
}

// No polling: the OAuth callback writes this document and the browser is already listening.
export function watchConnection(uid: string, onChange: (c: Connection) => void): () => void {
  return onSnapshot(doc(db, 'users', uid), (snap) => {
    const data = (snap.data() ?? {}) as UserDoc
    onChange(
      data.hlLocationId
        ? {
            status: 'connected',
            locationId: data.hlLocationId,
            locationName: data.hlLocationName,
            connectedAt: data.hlConnectedAt,
          }
        : { status: 'disconnected' },
    )
  })
}

export async function startOAuth(): Promise<void> {
  // The server checks returnTo against an allowlist and ignores anything it does not know.
  const returnTo = encodeURIComponent(window.location.origin)
  const { url } = await callFunction<{ url: string }>(`/oauthStart?returnTo=${returnTo}`)
  window.location.href = url
}

// The proxy normalises HighLevel's per-endpoint field names (functions/src/hl/resources.ts).
export async function listContacts(): Promise<Contact[]> {
  const { contacts = [] } = await callFunction<{ contacts?: Contact[] }>('/hlProxy/contacts')
  return contacts
}

export async function listConversations(): Promise<Conversation[]> {
  const { conversations = [] } = await callFunction<{ conversations?: Conversation[] }>(
    '/hlProxy/conversations',
  )
  return conversations
}

export async function listEvents(): Promise<CalendarEvent[]> {
  const { events = [] } = await callFunction<{ events?: CalendarEvent[] }>('/hlProxy/events')
  return events
}

export function disconnect(): Promise<{ ok: boolean }> {
  return callFunction<{ ok: boolean }>('/hlDisconnect')
}
