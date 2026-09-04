import { initializeApp } from 'firebase-admin/app'
import { setGlobalOptions } from 'firebase-functions/v2'

initializeApp()
setGlobalOptions({ region: 'us-central1', maxInstances: 10 })

export { oauthStart, oauthCallback } from './oauth/routes'
export { hlProxy, hlDisconnect } from './hl/proxy'
export { previewToken, hlPreview } from './preview/routes'
export { generate } from './generate/routes'
