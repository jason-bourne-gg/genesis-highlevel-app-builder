import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { AUTHORIZE_URL, config } from '../config'
import { uidFrom } from '../auth'
import { isHlError } from '../errors'
import { exchangeCode, saveTokens } from '../hl/tokens'
import { hlGetAs } from '../hl/client'
import { defaultOrigin, resolveReturnOrigin } from './origins'
import { claimHandoff, mintHandoff, sweepExpiredHandoffs } from './handoff'
import { claimState, mintState, sweepExpiredStates } from './state'

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
    // Opportunistic, and never allowed to fail the mint.
    void sweepExpiredStates().catch(() => {})
    res.json({ url: url.toString() })
  } catch (e) {
    const status = isHlError(e) ? e.status : 500
    res.status(status).json({ error: (e as Error).message })
  }
})

// HighLevel redirects the browser here, so failures redirect back instead of rendering JSON.
//
// This does not connect anything. The authorize URL oauthStart hands out is just a link,
// and a link can be forwarded — so whoever approves it at HighLevel is not necessarily the
// account the flow was started from. Committing here would let someone start a flow, send
// the link on, and collect the tokens of whoever followed it. Instead the exchanged tokens
// are parked against the uid from the state, and oauthFinish only commits them once a
// signed-in browser proves it is that account.
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
    origin = claimed.origin || origin
    const tokens = await exchangeCode(code)

    let locationName = tokens.locationId
    try {
      const { location } = await hlGetAs<{ location?: { name?: string } }>(
        tokens,
        `/locations/${tokens.locationId}`,
      )
      if (location?.name) locationName = location.name
    } catch {
      // Cosmetic only — a missing name must not fail an otherwise good connection.
    }

    back({ hl: 'pending', handoff: await mintHandoff({ uid: claimed.uid, tokens, locationName }) })
  } catch (e) {
    back({ hl: 'error', reason: isHlError(e) ? e.code : 'exchange_failed' })
  }
})

// The second half of the callback, called by the app with its Firebase ID token. Binding the
// flow to a signed-in session rather than to a cookie keeps it working in browsers that
// refuse third-party cookies, which is every Safari and, before long, everything else.
export const oauthFinish = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') return void res.status(405).json({ error: 'Use POST' })

    const uid = await uidFrom(req)
    const body = (req.body ?? {}) as { handoff?: string }
    const pending = await claimHandoff(String(body.handoff ?? ''), uid)

    await saveTokens(uid, pending.tokens)
    await getFirestore().doc(`users/${uid}`).set(
      {
        hlLocationId: pending.tokens.locationId,
        hlLocationName: pending.locationName,
        hlConnectedAt: Date.now(),
      },
      { merge: true },
    )

    // Opportunistic, and never allowed to fail a connection that did work.
    void sweepExpiredHandoffs().catch(() => {})
    res.json({ ok: true, locationName: pending.locationName })
  } catch (e) {
    const status = isHlError(e) ? e.status : 500
    res.status(status).json({
      error: (e as Error).message,
      code: isHlError(e) ? e.code : 'internal',
    })
  }
})
