import { config } from '../config'

// Compares scheme, host and port: startsWith would let "https://evil.com/?x=<ours>" pass.
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

// Vetted when the flow starts, so the public callback can use the stored origin as-is.
export function resolveReturnOrigin(candidate: string | undefined): string {
  const origin = normalise(candidate ?? '')
  if (!origin) return defaultOrigin()
  return config.appOrigins.includes(origin) ? origin : defaultOrigin()
}
