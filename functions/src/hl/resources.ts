import { HlError } from '../errors'
import { hlGet } from './client'
import { accessTokenFor } from './tokens'

// HighLevel's field names vary by endpoint, so responses are normalised here into one shape.
const str = (v: unknown, fallback = '') => (v == null ? fallback : String(v))

const EVENT_WINDOW_DAYS = 30

export type Query = Record<string, string | undefined>

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

const toContact = (c: Record<string, unknown>): Contact => ({
  id: str(c.id),
  firstName: str(c.firstName),
  lastName: str(c.lastName),
  email: str(c.email),
  phone: str(c.phone),
  tags: Array.isArray(c.tags) ? c.tags.map((t) => str(t)) : [],
})

export async function contacts(uid: string): Promise<{ contacts: Contact[] }> {
  const res = await hlGet<{ contacts?: Record<string, unknown>[] }>(uid, '/contacts/', {
    limit: '100',
  })
  return { contacts: (res.contacts ?? []).map(toContact) }
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

export interface Calendar {
  id: string
  name: string
}

export interface Message {
  id: string
  direction: string
  body: string
  createdAt: string
}

export interface Slot {
  startTime: string
  endTime: string
}

// Exposed so a booking UI can pick a calendar. Previously resolved only internally
// by events(), which meant a generated app could read appointments but not create one.
export async function calendars(uid: string): Promise<{ calendars: Calendar[] }> {
  const res = await hlGet<{ calendars?: Record<string, unknown>[] }>(uid, '/calendars/')
  return {
    calendars: (res.calendars ?? []).map((c) => ({
      id: str(c.id),
      name: str(c.name, 'Calendar'),
    })),
  }
}

// Server-side contact search. The generated apps used to filter the 100-row page in the
// browser, which silently misses anyone past the cap.
export async function search(
  uid: string,
  query: Query = {},
): Promise<{ contacts: Contact[] }> {
  const term = (query.q ?? '').trim()
  if (!term) return { contacts: [] }
  const res = await hlGet<{ contacts?: Record<string, unknown>[] }>(uid, '/contacts/', {
    limit: '100',
    query: term,
  })
  return { contacts: (res.contacts ?? []).map(toContact) }
}

// The message thread inside one conversation. conversations.list() only ever returned
// the last message body, so "show me the last five messages" was unbuildable.
export async function messages(
  uid: string,
  query: Query = {},
): Promise<{ messages: Message[] }> {
  const id = (query.conversationId ?? '').trim()
  if (!id) throw new HlError('invalid_request', 'conversationId is required', 400)

  const res = await hlGet<{ messages?: { messages?: Record<string, unknown>[] } | Record<string, unknown>[] }>(
    uid,
    `/conversations/${encodeURIComponent(id)}/messages`,
  )
  // HighLevel has returned this both as an array and as { messages: [...] }.
  const raw = Array.isArray(res.messages) ? res.messages : (res.messages?.messages ?? [])
  return {
    messages: raw.map((m) => ({
      id: str(m.id),
      direction: str(m.direction, 'inbound'),
      body: str(m.body),
      createdAt: str(m.dateAdded, new Date().toISOString()),
    })),
  }
}

// Availability, so a booking UI can offer times that are actually free rather than
// letting someone pick a slot HighLevel will reject.
const DEFAULT_SLOT_MINUTES = 30

export async function slots(uid: string, query: Query = {}): Promise<{ slots: Slot[] }> {
  const calendarId = (query.calendarId ?? '').trim()
  if (!calendarId) throw new HlError('invalid_request', 'calendarId is required', 400)

  const days = Math.min(Math.max(Number(query.days ?? 14) || 14, 1), EVENT_WINDOW_DAYS)

  // HighLevel returns start times only, and the length comes from the calendar's own
  // configuration. Assuming 30 minutes books the wrong duration on any calendar set to
  // something else — real overlapping or gapped appointments, with no error anywhere.
  const [detail, res] = await Promise.all([
    hlGet<{ calendar?: { slotDuration?: number; slotDurationUnit?: string } }>(
      uid,
      `/calendars/${encodeURIComponent(calendarId)}`,
    ).catch(() => null),
    hlGet<Record<string, unknown>>(
      uid,
      `/calendars/${encodeURIComponent(calendarId)}/free-slots`,
      {
        startDate: String(Date.now()),
        endDate: String(Date.now() + days * 86400_000),
      },
    ),
  ])

  const raw = Number(detail?.calendar?.slotDuration ?? 0)
  const unit = String(detail?.calendar?.slotDurationUnit ?? 'mins').toLowerCase()
  const minutes =
    raw > 0 ? (unit.startsWith('hour') ? raw * 60 : raw) : DEFAULT_SLOT_MINUTES

  // The response is keyed by date, each day holding a slots array of ISO strings.
  const out: Slot[] = []
  for (const value of Object.values(res)) {
    const day = value as { slots?: unknown }
    if (!Array.isArray(day?.slots)) continue
    for (const start of day.slots) {
      const startTime = str(start)
      if (!startTime || Number.isNaN(Date.parse(startTime))) continue
      out.push({
        startTime,
        endTime: new Date(Date.parse(startTime) + minutes * 60_000).toISOString(),
      })
    }
  }
  return { slots: out.slice(0, 200) }
}

export const resources: Record<string, (uid: string, query?: Query) => Promise<unknown>> = {
  location,
  contacts,
  conversations,
  events,
  calendars,
  search,
  messages,
  slots,
}

