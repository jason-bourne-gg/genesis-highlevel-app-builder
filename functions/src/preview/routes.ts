import { onRequest } from 'firebase-functions/v2/https'
import { uidFrom } from '../auth'
import { isHlError } from '../errors'
import { resources } from '../hl/resources'
import { claimPreviewToken, mintPreviewToken } from './tokens'

// Requires a real Firebase login, so a token is only ever issued for the caller's own project.
export const previewToken = onRequest({ cors: true }, async (req, res) => {
  try {
    const uid = await uidFrom(req)
    const projectId = String(req.query.projectId ?? '')
    if (!projectId) throw new Error('Missing projectId')
    res.json(await mintPreviewToken(uid, projectId))
  } catch (e) {
    res.status(isHlError(e) ? e.status : 400).json({ error: (e as Error).message })
  }
})

// The sandboxed preview is on an opaque origin and sends `Origin: null`, so any origin is
// allowed — safe because the only credential is a header token and no cookies are involved.
export const hlPreview = onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'X-Preview-Token, Content-Type')
  res.set('Access-Control-Max-Age', '3600')
  if (req.method === 'OPTIONS') return void res.status(204).send('')

  const resource = req.path.replace(/^\/+|\/+$/g, '').split('/').pop() ?? ''
  const handler = resources[resource]
  if (!handler) return void res.status(404).json({ error: `Unknown resource ${resource}` })

  try {
    const token = String(req.get('X-Preview-Token') ?? req.query.token ?? '')
    const grant = await claimPreviewToken(token)
    res.json(await handler(grant.uid))
  } catch (e) {
    const status = isHlError(e) ? e.status : 500
    res.status(status).json({
      error: (e as Error).message,
      code: isHlError(e) ? e.code : 'internal',
    })
  }
})
