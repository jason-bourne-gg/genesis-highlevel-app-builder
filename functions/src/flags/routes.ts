import { onRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { callerFrom, optionalUid } from '../auth'
import { isHlError } from '../errors'
import { isRoot, readFlags, resolveFlags, seedFlags, setFlag, type FlagPatch } from './store'

// Public on purpose: the sign-in page has to know whether to show the Google button
// before anyone is signed in. A bearer token, when present, narrows the answer to that
// user so actor-targeted flags resolve correctly. Flag names are not secrets.
export const flags = onRequest({ cors: true }, async (req, res) => {
  try {
    const uid = await optionalUid(req)
    res.set('Cache-Control', 'no-store')
    res.json({ flags: await resolveFlags(uid) })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

// GET lists every registered flag with its raw gates. POST changes one.
// Root only, checked here rather than in rules, so the flag collection stays
// client-write-false and there is exactly one way in.
export const flagsAdmin = onRequest({ cors: true }, async (req, res) => {
  try {
    const caller = await callerFrom(req)
    const root = isRoot(caller.uid, caller.email, caller.emailVerified, caller.root)

    if (!root) {
      // 200 with root:false rather than 403, so the UI can render an honest
      // "not for you" state instead of an error toast.
      return void res.json({ root: false, flags: [] })
    }

    if (req.method === 'GET') {
      await seedFlags()
      return void res.json({ root: true, flags: await readFlags() })
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as { key?: string; patch?: FlagPatch }
      const key = String(body.key ?? '')
      if (!key) throw new Error('key is required')

      const label = caller.email ?? caller.uid
      const updated = await setFlag(key, body.patch ?? {}, label)

      logger.info('flag.changed', {
        key,
        enabled: updated.enabled,
        actors: updated.actors.length,
        by: label,
      })
      return void res.json({ root: true, flag: updated })
    }

    res.status(405).json({ error: 'Use GET or POST' })
  } catch (e) {
    const status = isHlError(e) ? e.status : 400
    res.status(status).json({
      error: (e as Error).message,
      code: isHlError(e) ? e.code : 'bad_request',
    })
  }
})
