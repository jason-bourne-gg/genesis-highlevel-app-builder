import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { uidFrom } from '../auth'
import { isHlError } from '../errors'
import { flagOn } from '../flags/store'
import { resources, type Query } from './resources'
import { clearTokens } from './tokens'
import { auditWrite, writers } from './writes'

// Reads added after the flags existed. Ungated reads stay ungated, so a deployment with
// every flag off exposes exactly the four resources it always did.
export const READ_GATES: Record<string, string[]> = {
  search: ['hl_extended_reads'],
  messages: ['hl_extended_reads'],
  // Booking cannot work without these, so either flag is enough.
  calendars: ['hl_writes', 'hl_extended_reads'],
  slots: ['hl_writes', 'hl_extended_reads'],
}

export async function readAllowed(name: string, uid: string): Promise<boolean> {
  const gates = READ_GATES[name]
  if (!gates) return true
  for (const key of gates) {
    if (await flagOn(key, uid)) return true
  }
  return false
}

const nameOf = (path: string) => path.replace(/^\/+|\/+$/g, '').split('/').pop() ?? ''

// Only the string parameters the read handlers actually understand. Forwarding the
// whole query string would let a caller append arbitrary parameters to a HighLevel URL.
const ALLOWED_QUERY = ['q', 'conversationId', 'calendarId', 'days'] as const

export function queryFrom(raw: Record<string, unknown>): Query {
  const out: Query = {}
  for (const key of ALLOWED_QUERY) {
    const value = raw[key]
    if (typeof value === 'string' && value) out[key] = value.slice(0, 200)
  }
  return out
}

export const hlProxy = onRequest({ cors: true }, async (req, res) => {
  const name = nameOf(req.path)

  try {
    const uid = await uidFrom(req)

    if (Object.hasOwn(writers, name)) {
      if (req.method !== 'POST') return void res.status(405).json({ error: 'Writes use POST' })
      // Checked per request, not cached: turning the flag off has to take effect now,
      // not whenever a container happens to recycle.
      if (!(await flagOn('hl_writes', uid))) {
        return void res.status(403).json({
          error: 'HighLevel writes are turned off for this account.',
          code: 'writes_disabled',
        })
      }
      const body = (req.body ?? {}) as Record<string, unknown>
      const result = await writers[name](uid, body)
      auditWrite(name, uid, body, 'hlProxy')
      return void res.json(result)
    }

    if (Object.hasOwn(resources, name)) {
      if (!(await readAllowed(name, uid))) {
        return void res.status(403).json({
          error: `The ${name} resource is not enabled for this account.`,
          code: 'resource_disabled',
        })
      }
      return void res.json(await resources[name](uid, queryFrom(req.query as Record<string, unknown>)))
    }

    res.status(404).json({ error: `Unknown resource ${req.path}` })
  } catch (e) {
    const status = isHlError(e) ? e.status : 500
    res.status(status).json({
      error: (e as Error).message,
      code: isHlError(e) ? e.code : 'internal',
    })
  }
})

export const hlDisconnect = onRequest({ cors: true }, async (req, res) => {
  try {
    const uid = await uidFrom(req)
    await clearTokens(uid)
    await getFirestore().doc(`users/${uid}`).set(
      { hlLocationId: null, hlLocationName: null, hlConnectedAt: null },
      { merge: true },
    )
    res.json({ ok: true })
  } catch (e) {
    res.status(isHlError(e) ? e.status : 500).json({ error: (e as Error).message })
  }
})
