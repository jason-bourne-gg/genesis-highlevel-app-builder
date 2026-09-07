import { logger } from 'firebase-functions/v2'
import { HlError } from '../errors'
import { hlSend, locationIdFor } from './client'

// Every write is field-allowlisted here rather than forwarded. The body arrives from
// code an LLM wrote, so "pass it through and let HighLevel validate" is not a position
// worth defending — an unexpected field on a CRM record is a silent data change.
type Body = Record<string, unknown>

const text = (v: unknown, max = 500): string | undefined => {
  if (v == null) return undefined
  const s = String(v).trim()
  if (!s) return undefined
  if (s.length > max) throw new HlError('invalid_write', `Value longer than ${max} characters`, 400)
  return s
}

const required = (v: unknown, name: string, max = 500): string => {
  const s = text(v, max)
  if (!s) throw new HlError('invalid_write', `${name} is required`, 400)
  return s
}

const iso = (v: unknown, name: string): string => {
  const s = required(v, name, 40)
  if (Number.isNaN(Date.parse(s))) {
    throw new HlError('invalid_write', `${name} must be an ISO date-time`, 400)
  }
  return s
}

const tags = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined
  const out = v.map((t) => String(t).trim()).filter(Boolean).slice(0, 20)
  return out.length ? out : undefined
}

// Drops keys whose value came back undefined, so a partial body never sends nulls
// that would blank a field on the HighLevel record.
const compact = (o: Body): Body => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

const CONTACT_FIELDS = (body: Body): Body =>
  compact({
    firstName: text(body.firstName, 100),
    lastName: text(body.lastName, 100),
    email: text(body.email, 200),
    phone: text(body.phone, 40),
    tags: tags(body.tags),
  })

async function createContact(uid: string, body: Body): Promise<unknown> {
  const fields = CONTACT_FIELDS(body)
  if (!fields.email && !fields.phone) {
    throw new HlError('invalid_write', 'A contact needs at least an email or a phone number', 400)
  }
  const locationId = await locationIdFor(uid)
  const res = await hlSend<{ contact?: { id?: string } }>(uid, 'POST', '/contacts/', {
    locationId,
    ...fields,
  })
  return { contact: { id: String(res.contact?.id ?? ''), ...fields } }
}

async function updateContact(uid: string, body: Body): Promise<unknown> {
  const id = required(body.id, 'id', 100)
  const fields = CONTACT_FIELDS(body)
  if (!Object.keys(fields).length) {
    throw new HlError('invalid_write', 'Nothing to update', 400)
  }
  // locationId is deliberately not sent on update — the contact already belongs to one,
  // and including it is how you accidentally move a record between sub-accounts.
  await hlSend(uid, 'PUT', `/contacts/${encodeURIComponent(id)}`, fields)
  return { contact: { id, ...fields } }
}

async function sendMessage(uid: string, body: Body): Promise<unknown> {
  const contactId = required(body.contactId, 'contactId', 100)
  const message = required(body.message, 'message', 1600)
  const res = await hlSend<{ messageId?: string }>(uid, 'POST', '/conversations/messages', {
    type: 'SMS',
    contactId,
    message,
  })
  return { messageId: String(res.messageId ?? ''), contactId }
}

async function bookAppointment(uid: string, body: Body): Promise<unknown> {
  const calendarId = required(body.calendarId, 'calendarId', 100)
  const contactId = required(body.contactId, 'contactId', 100)
  const startTime = iso(body.startTime, 'startTime')
  const endTime = iso(body.endTime, 'endTime')

  if (Date.parse(endTime) <= Date.parse(startTime)) {
    throw new HlError('invalid_write', 'endTime must be after startTime', 400)
  }

  const locationId = await locationIdFor(uid)
  const res = await hlSend<{ id?: string }>(uid, 'POST', '/calendars/events/appointments', {
    calendarId,
    locationId,
    contactId,
    startTime,
    endTime,
    title: text(body.title, 200) ?? 'Appointment',
    appointmentStatus: 'confirmed',
  })
  return {
    event: { id: String(res.id ?? ''), calendarId, contactId, startTime, endTime },
  }
}

export const writers: Record<string, (uid: string, body: Body) => Promise<unknown>> = {
  createContact,
  updateContact,
  sendMessage,
  bookAppointment,
}

// Human-readable, because it goes in the log line next to the uid. Writes are the one
// thing here worth being able to reconstruct after the fact.
export function auditWrite(action: string, uid: string, body: Body, via: string): void {
  logger.info('hl.write', {
    action,
    uid,
    via,
    contactId: body.contactId ?? body.id ?? null,
    calendarId: body.calendarId ?? null,
  })
}
