import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { CalendarEvent, Connection, Contact, Conversation } from '@/types'
import { callFunction } from './api'

interface UserDoc {
  hlLocationId?: string
  hlLocationName?: string
  hlConnectedAt?: number
}

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
  const { url } = await callFunction<{ url: string }>('/oauthStart')
  window.location.href = url
}

// HighLevel's field names differ from ours and vary by endpoint, so every response
// is normalised here rather than leaking their shape into the UI.
const str = (v: unknown, fallback = '') => (v == null ? fallback : String(v))

export async function listContacts(): Promise<Contact[]> {
  const { contacts = [] } = await callFunction<{ contacts?: Record<string, unknown>[] }>(
    '/hlProxy/contacts',
  )
  return contacts.map((c) => ({
    id: str(c.id),
    firstName: str(c.firstName),
    lastName: str(c.lastName),
    email: str(c.email),
    phone: str(c.phone),
    tags: Array.isArray(c.tags) ? c.tags.map((t) => str(t)) : [],
  }))
}

export async function listConversations(): Promise<Conversation[]> {
  const { conversations = [] } = await callFunction<{
    conversations?: Record<string, unknown>[]
  }>('/hlProxy/conversations')
  return conversations.map((c) => ({
    id: str(c.id),
    contactId: str(c.contactId),
    lastMessage: str(c.lastMessageBody),
    unread: Number(c.unreadCount ?? 0),
    updatedAt: str(c.lastMessageDate, new Date().toISOString()),
  }))
}

export async function listEvents(): Promise<CalendarEvent[]> {
  const { events = [] } = await callFunction<{ events?: Record<string, unknown>[] }>(
    '/hlProxy/events',
  )
  return events.map((e) => ({
    id: str(e.id),
    title: str(e.title),
    contactId: str(e.contactId),
    startTime: str(e.startTime),
    endTime: str(e.endTime),
    status: (str(e.appointmentStatus, 'confirmed') as CalendarEvent['status']) ?? 'confirmed',
  }))
}

export function disconnect(): Promise<{ ok: boolean }> {
  return callFunction<{ ok: boolean }>('/hlDisconnect')
}
