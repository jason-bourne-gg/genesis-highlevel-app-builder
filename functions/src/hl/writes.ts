import { logger } from 'firebase-functions/v2'
import { HlError } from '../errors'
import { hlSend, locationIdFor } from './client'
import { contactFields, iso, required, text, type Body } from './fields'

async function createContact(uid: string, body: Body): Promise<unknown> {
  const fields = contactFields(body)
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
  const fields = contactFields(body)
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
