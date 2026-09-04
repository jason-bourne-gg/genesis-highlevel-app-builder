import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { uidFrom } from '../auth'
import { isHlError } from '../errors'
import { resources } from './resources'
import { clearTokens } from './tokens'

const resourceOf = (path: string) => path.replace(/^\/+|\/+$/g, '').split('/').pop() ?? ''

export const hlProxy = onRequest({ cors: true }, async (req, res) => {
  const handler = resources[resourceOf(req.path)]
  if (!handler) return void res.status(404).json({ error: `Unknown resource ${req.path}` })

  try {
    res.json(await handler(await uidFrom(req)))
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
