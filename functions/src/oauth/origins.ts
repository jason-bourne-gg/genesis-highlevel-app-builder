import { config } from '../config'

// Compares scheme, host and port, not a string prefix. "https://evil.com/?x=
// https://genesysbe-cbd7e.web.app" must not pass, and startsWith would let it.
function normalise(value: string): string | null {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function defaultOrigin(): string {
  return config.appOrigins[0] ?? config.appOrigin
}

/**
 * The origin to return the browser to once HighLevel is done with it.
 *
 * Resolved when the flow starts, from where the request actually came, and
 * checked against the allowlist there — so by the time the public callback runs,
 * the destination has already been vetted and stored server side. An unrecognised
 * origin falls back to the default rather than failing: a working connection that
 * lands on the wrong tab beats a dead end.
 */
export function resolveReturnOrigin(candidate: string | undefined): string {
  const origin = normalise(candidate ?? '')
  if (!origin) return defaultOrigin()
  return config.appOrigins.includes(origin) ? origin : defaultOrigin()
}
