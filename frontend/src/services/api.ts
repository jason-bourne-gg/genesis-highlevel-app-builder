import { functionsBase } from '@/lib/firebase'
import { idToken } from './auth'

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message)
  }
}

export async function callFunction<T>(path: string, payload?: unknown): Promise<T> {
  // A body implies a POST. Every read here is a GET, so the method follows the payload
  // rather than being passed separately at every call site.
  const res = await fetch(`${functionsBase}${path}`, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${await idToken()}`,
      ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })

  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
  if (!res.ok) {
    throw new ApiError(body.code ?? 'unknown', body.error ?? `Request failed (${res.status})`, res.status)
  }
  return body as T
}
