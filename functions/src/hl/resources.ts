import { hlGet } from './client'
import { accessTokenFor } from './tokens'

// HighLevel's field names vary by endpoint, so responses are normalised here into one shape.
const str = (v: unknown, fallback = '') => (v == null ? fallback : String(v))

const EVENT_WINDOW_DAYS = 30

export interface Contact {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  tags: string[]
}

export interface Conversation {
  id: string
  contactId: string
  lastMessage: string
  unread: number
  updatedAt: string
}

export interface CalendarEvent {
  id: string
  title: string
  contactId: string
  startTime: string
  endTime: string
  status: string
}

export async function location(uid: string): Promise<{ location: { id: string; name: string } }> {
  const { locationId } = await accessTokenFor(uid)
  let name = locationId
  try {
    const res = await hlGet<{ location?: { name?: string } }>(uid, `/locations/${locationId}`)
    if (res.location?.name) name = res.location.name
  } catch {
    // Cosmetic only. A generated app should still render without the display name.
  }
  return { location: { id: locationId, name } }
}

export async function contacts(uid: string): Promise<{ contacts: Contact[] }> {
  const res = await hlGet<{ contacts?: Record<string, unknown>[] }>(uid, '/contacts/', {
    limit: '100',
  })
  return {
    contacts: (res.contacts ?? []).map((c) => ({
      id: str(c.id),
      firstName: str(c.firstName),
      lastName: str(c.lastName),
      email: str(c.email),
      phone: str(c.phone),
      tags: Array.isArray(c.tags) ? c.tags.map((t) => str(t)) : [],
    })),
  }
}

export async function conversations(uid: string): Promise<{ conversations: Conversation[] }> {
  const res = await hlGet<{ conversations?: Record<string, unknown>[] }>(
    uid,
    '/conversations/search',
    { limit: '50' },
  )
  return {
    conversations: (res.conversations ?? []).map((c) => ({
      id: str(c.id),
      contactId: str(c.contactId),
      lastMessage: str(c.lastMessageBody),
      unread: Number(c.unreadCount ?? 0),
      updatedAt: str(c.lastMessageDate, new Date().toISOString()),
    })),
  }
}

export async function events(uid: string): Promise<{ events: CalendarEvent[] }> {
  // Events are calendar-scoped, not location-scoped, so calendars are resolved first.
  const { calendars = [] } = await hlGet<{ calendars?: { id: string }[] }>(uid, '/calendars/')
  const window = {
    startTime: String(Date.now()),
    endTime: String(Date.now() + EVENT_WINDOW_DAYS * 86400_000),
  }

  const pages = await Promise.all(
    calendars.map((c) =>
      hlGet<{ events?: Record<string, unknown>[] }>(uid, '/calendars/events', {
        ...window,
        calendarId: c.id,
      })
        .then((r) => r.events ?? [])
        // One broken calendar must not empty the whole appointment book.
        .catch(() => []),
    ),
  )

  return {
    events: pages.flat().map((e) => ({
      id: str(e.id),
      title: str(e.title),
      contactId: str(e.contactId),
      startTime: str(e.startTime),
      endTime: str(e.endTime),
      status: str(e.appointmentStatus, 'confirmed'),
    })),
  }
}

export const resources: Record<string, (uid: string) => Promise<unknown>> = {
  location,
  contacts,
  conversations,
  events,
}
