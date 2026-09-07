import { config } from '../config'
import { HlError } from '../errors'
import { accessTokenFor } from './tokens'

export async function hlGet<T>(
  uid: string,
  path: string,
  query: Record<string, string | undefined> = {},
): Promise<T> {
  const { accessToken, locationId } = await accessTokenFor(uid)

  const url = new URL(path, config.apiBase)
  for (const [key, value] of Object.entries({ locationId, ...query })) {
    if (value !== undefined) url.searchParams.set(key, value)
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Version: config.apiVersion,
      Accept: 'application/json',
    },
  })

  if (res.status === 401) throw new HlError('connection_lost', 'HighLevel rejected the token', 401)
  if (res.status === 429) throw new HlError('rate_limited', 'HighLevel rate limit hit', 429)
  if (!res.ok) throw new HlError('hl_error', `HighLevel returned ${res.status}`, 502)

  return (await res.json()) as T
}

// Writes. Separate from hlGet because the shapes differ per endpoint: some want
// locationId in the body, some in the path, and none want it appended to the query.
export async function hlSend<T>(
  uid: string,
  method: 'POST' | 'PUT',
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { accessToken } = await accessTokenFor(uid)

  const res = await fetch(new URL(path, config.apiBase), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Version: config.apiVersion,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (res.status === 401) throw new HlError('connection_lost', 'HighLevel rejected the token', 401)
  if (res.status === 403) {
    throw new HlError(
      'scope_missing',
      'HighLevel refused the write. The app is probably missing a write scope — re-install it after ticking them.',
      403,
    )
  }
  if (res.status === 422) {
    throw new HlError('invalid_write', 'HighLevel rejected the values sent', 422)
  }
  if (res.status === 429) throw new HlError('rate_limited', 'HighLevel rate limit hit', 429)
  if (!res.ok) throw new HlError('hl_error', `HighLevel returned ${res.status}`, 502)

  // A 204 is a legitimate success for some of these, and .json() would throw on it.
  return ((await res.json().catch(() => ({}))) ?? {}) as T
}

// Exposed so writers can put locationId where each endpoint expects it.
export async function locationIdFor(uid: string): Promise<string> {
  return (await accessTokenFor(uid)).locationId
}
