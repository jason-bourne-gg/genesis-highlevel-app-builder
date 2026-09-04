import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { CalendarEvent, Connection, Contact, Conversation } from '@/types'
import { callFunction } from './api'

interface UserDoc {
  hlLocationId?: string
  hlLocationName?: string
  hlConnectedAt?: number
}

// The dashboard never polls. The OAuth callback writes this document from the
// Cloud Function, and the browser is already listening, so the status flips to
// Connected the moment the round trip finishes.
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
  // Tells the callback where to send the browser back to, so the same deployed
  // functions serve localhost, web.app and any custom domain without reconfiguring.
  // The server checks it against an allowlist and ignores anything it does not know.
  const returnTo = encodeURIComponent(window.location.origin)
  const { url } = await callFunction<{ url: string }>(`/oauthStart?returnTo=${returnTo}`)
  window.location.href = url
}

// HighLevel's field names differ from ours and vary by endpoint, but the proxy
// normalises before responding — so both this dashboard and every generated app
// see one shape, defined in one place (functions/src/hl/resources.ts).
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
