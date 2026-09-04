import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { uidFrom } from '../auth'
import { isHlError } from '../errors'
import { hlGet } from './client'
import { clearTokens } from './tokens'

const WINDOW_DAYS = 30

const routes: Record<string, (uid: string) => Promise<unknown>> = {
  contacts: (uid) => hlGet(uid, '/contacts/', { limit: '50' }),
  conversations: (uid) => hlGet(uid, '/conversations/search', { limit: '50' }),
  events: async (uid) => {
    // Events are calendar-scoped, not location-scoped, so the calendars have to be
    // resolved first and the results merged.
    const { calendars = [] } = await hlGet<{ calendars?: { id: string }[] }>(uid, '/calendars/')
    const window = {
      startTime: String(Date.now()),
      endTime: String(Date.now() + WINDOW_DAYS * 86400_000),
    }

    const pages = await Promise.all(
      calendars.map((c) =>
        hlGet<{ events?: unknown[] }>(uid, '/calendars/events', { ...window, calendarId: c.id })
          .then((r) => r.events ?? [])
          .catch(() => []),
      ),
    )
    return { events: pages.flat() }
  },
}

export const hlProxy = onRequest({ cors: true }, async (req, res) => {
  const resource = req.path.replace(/^\/+|\/+$/g, '').split('/').pop() ?? ''
  const handler = routes[resource]
  if (!handler) return void res.status(404).json({ error: `Unknown resource ${resource}` })

  try {
    res.json(await handler(await uidFrom(req)))
  } catch (e) {
    const status = isHlError(e) ? e.status : 500
    res.status(status).json({ error: (e as Error).message, code: isHlError(e) ? e.code : 'internal' })
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
