import { onRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { claimAdminToken } from '../admin/unlock'
import { callerFrom } from '../auth'
import { isHlError } from '../errors'
import {
  isRoot,
  labelActors,
  readFlags,
  seedFlags,
  setFlag,
  type FlagPatch,
} from './store'

// GET lists every registered flag with its raw gates. POST changes one.
// Root only, checked here rather than in rules, so the flag collection stays
// client-write-false and there is exactly one way in.
export const flagsAdmin = onRequest({ cors: true }, async (req, res) => {
  try {
    const caller = await callerFrom(req)

    // Two ways in: configured as root, or holding an unlock pass minted for this account
    // by adminUnlock. The pass is scoped to one uid, so it cannot be handed to someone else.
    const pass = await claimAdminToken(String(req.get('X-Admin-Token') ?? ''))
    const root =
      isRoot(caller.uid, caller.email, caller.emailVerified) || pass?.uid === caller.uid

    if (!root) {
      // 200 with root:false rather than 403, so the UI can render an honest
      // "not for you" state instead of an error toast.
      return void res.json({ root: false, flags: [] })
    }

    if (req.method === 'GET') {
      await seedFlags()
      const flags = await readFlags()
      const labels = await labelActors([...new Set(flags.flatMap((f) => f.actors))])
      return void res.json({ root: true, flags, labels })
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
      return void res.json({
        root: true,
        flag: updated,
        labels: await labelActors(updated.actors),
      })
    }

    res.status(405).json({ error: 'Use GET or POST' })
  } catch (e) {
    // 500 by default, as every other route here does: a Firestore outage is not a
    // client error, and reporting it as one sends the admin UI chasing its own input.
    const status = isHlError(e) ? e.status : 500
    res.status(status).json({
      error: (e as Error).message,
      code: isHlError(e) ? e.code : 'internal',
    })
  }
})
