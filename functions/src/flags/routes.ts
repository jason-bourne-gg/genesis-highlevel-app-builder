import { onRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { claimAdminToken } from '../admin/unlock'
import { callerFrom } from '../auth'
import { isHlError } from '../errors'
import { isRoot, listAllUsers, readFlags, seedFlags, setFlag, type FlagPatch } from './store'

// Root checked here rather than in rules, so the collection stays client-write-false.
export const flagsAdmin = onRequest({ cors: true }, async (req, res) => {
  try {
    const caller = await callerFrom(req)

    // Configured as root, or holding a pass minted for this account. The pass is uid-scoped.
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
      const [flags, accounts] = await Promise.all([readFlags(), listAllUsers()])
      return void res.json({ root: true, flags, ...accounts })
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
    // 500 by default, as every other route here does: a Firestore outage is not a
    // client error, and reporting it as one sends the admin UI chasing its own input.
    const status = isHlError(e) ? e.status : 500
    res.status(status).json({
      error: (e as Error).message,
      code: isHlError(e) ? e.code : 'internal',
    })
  }
})
