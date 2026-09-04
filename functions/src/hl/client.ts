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
