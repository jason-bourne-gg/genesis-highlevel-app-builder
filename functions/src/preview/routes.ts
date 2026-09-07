import { onRequest } from 'firebase-functions/v2/https'
import { uidFrom } from '../auth'
import { isHlError } from '../errors'
import { flagOn } from '../flags/store'
import { queryFrom, readAllowed } from '../hl/proxy'
import { resources } from '../hl/resources'
import { auditWrite, writers } from '../hl/writes'
import {
  assertOwns,
  claimPreviewToken,
  claimPreviewWrite,
  mintPreviewToken,
  sweepExpired,
} from './tokens'

// Requires a real Firebase login, so a token is only ever issued for the caller's own project.
export const previewToken = onRequest({ cors: true }, async (req, res) => {
  try {
    const uid = await uidFrom(req)
    const projectId = String(req.query.projectId ?? '')
    if (!projectId) throw new Error('Missing projectId')
    await assertOwns(uid, projectId)
    const grant = await mintPreviewToken(uid, projectId)
    // Opportunistic, and never allowed to fail the mint.
    void sweepExpired().catch(() => {})
    // The frame needs to know whether to offer write controls at all.
    res.json({ ...grant, writes: await flagOn('hl_writes', uid) })
  } catch (e) {
    res.status(isHlError(e) ? e.status : 400).json({ error: (e as Error).message })
  }
})

// The sandboxed preview is on an opaque origin and sends `Origin: null`, so any origin is
// allowed — safe because the only credential is a header token and no cookies are involved.
export const hlPreview = onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'X-Preview-Token, Content-Type')
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.set('Access-Control-Max-Age', '3600')
  if (req.method === 'OPTIONS') return void res.status(204).send('')

  const name = req.path.replace(/^\/+|\/+$/g, '').split('/').pop() ?? ''
  const token = String(req.get('X-Preview-Token') ?? '')

  try {
    if (Object.hasOwn(writers, name)) {
      if (req.method !== 'POST') return void res.status(405).json({ error: 'Writes use POST' })

      // Resolve the badge first, then check the flag, and only spend from the budget once
      // the request is one we would actually perform. Spending first meant 25 rejected
      // calls — a disabled flag, or a generated app retrying a validation error — left the
      // render with no allowance for the writes that were permitted.
      const identify = await claimPreviewToken(token)
      if (!(await flagOn('hl_writes', identify.uid))) {
        return void res.status(403).json({
          error: 'HighLevel writes are turned off for this account.',
          code: 'writes_disabled',
        })
      }

      const grant = await claimPreviewWrite(token)
      const body = (req.body ?? {}) as Record<string, unknown>
      const result = await writers[name](grant.uid, body)
      auditWrite(name, grant.uid, body, `preview:${grant.projectId}`)
      return void res.json(result)
    }

    if (Object.hasOwn(resources, name)) {
      const grant = await claimPreviewToken(token)
      if (!(await readAllowed(name, grant.uid))) {
        return void res.status(403).json({
          error: `The ${name} resource is not enabled for this account.`,
          code: 'resource_disabled',
        })
      }
      return void res.json(
        await resources[name](grant.uid, queryFrom(req.query as Record<string, unknown>)),
      )
    }

    res.status(404).json({ error: `Unknown resource ${name}` })
  } catch (e) {
    const status = isHlError(e) ? e.status : 500
    res.status(status).json({
      error: (e as Error).message,
      code: isHlError(e) ? e.code : 'internal',
    })
  }
})
