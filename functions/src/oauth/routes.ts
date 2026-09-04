import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { AUTHORIZE_URL, config } from '../config'
import { uidFrom } from '../auth'
import { isHlError } from '../errors'
import { exchangeCode, saveTokens } from '../hl/tokens'
import { hlGet } from '../hl/client'
import { defaultOrigin, resolveReturnOrigin } from './origins'
import { claimState, mintState } from './state'

export const oauthStart = onRequest({ cors: true }, async (req, res) => {
  try {
    const uid = await uidFrom(req)
    // The Origin header is the fallback when the client does not say where to return to.
    const origin = resolveReturnOrigin(String(req.query.returnTo ?? '') || req.get('Origin'))
    const url = new URL(AUTHORIZE_URL)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', config.clientId)
    url.searchParams.set('redirect_uri', config.redirectUri)
    url.searchParams.set('scope', config.scopes)
    if (config.versionId) url.searchParams.set('version_id', config.versionId)
    url.searchParams.set('state', await mintState(uid, origin))
    res.json({ url: url.toString() })
  } catch (e) {
    const status = isHlError(e) ? e.status : 500
    res.status(status).json({ error: (e as Error).message })
  }
})

// HighLevel redirects the browser here, so failures redirect back instead of rendering JSON.
export const oauthCallback = onRequest(async (req, res) => {
  // Narrows to the state's origin once known; a failure before that still has somewhere to land.
  let origin = defaultOrigin()

  const back = (params: Record<string, string>) => {
    const url = new URL(origin)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    res.redirect(url.toString())
  }

  const code = String(req.query.code ?? '')
  const state = String(req.query.state ?? '')
  if (!code || !state) return back({ hl: 'error', reason: 'missing_code' })

  try {
    const claimed = await claimState(state)
    const uid = claimed.uid
    origin = claimed.origin || origin
    const tokens = await exchangeCode(code)
    await saveTokens(uid, tokens)

    let locationName = tokens.locationId
    try {
      const { location } = await hlGet<{ location?: { name?: string } }>(
        uid,
        `/locations/${tokens.locationId}`,
      )
      if (location?.name) locationName = location.name
    } catch {
      // Cosmetic only — a missing name must not fail an otherwise good connection.
    }

    await getFirestore().doc(`users/${uid}`).set(
      { hlLocationId: tokens.locationId, hlLocationName: locationName, hlConnectedAt: Date.now() },
      { merge: true },
    )

    back({ hl: 'connected' })
  } catch (e) {
    back({ hl: 'error', reason: isHlError(e) ? e.code : 'exchange_failed' })
  }
})
