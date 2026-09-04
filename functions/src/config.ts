function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

// Read lazily. Throwing at module load would break function discovery on deploy.
export const config = {
  get clientId() { return required('HL_CLIENT_ID') },
  get clientSecret() { return required('HL_CLIENT_SECRET') },
  get redirectUri() { return required('HL_REDIRECT_URI') },
  get scopes() { return required('HL_SCOPES') },
  // A draft app has no published version, so the authorize URL must name one.
  get versionId() { return process.env.HL_VERSION_ID },
  get apiBase() { return process.env.HL_API_BASE ?? 'https://services.leadconnectorhq.com' },
  get apiVersion() { return process.env.HL_API_VERSION ?? '2021-07-28' },
  get appOrigin() { return process.env.APP_ORIGIN ?? 'http://localhost:6001' },

  get anthropicKey() { return required('ANTHROPIC_API_KEY') },
  get anthropicModel() { return process.env.ANTHROPIC_MODEL ?? 'claude-opus-5' },
}

export const AUTHORIZE_URL = 'https://marketplace.gohighlevel.com/v2/oauth/chooselocation'
