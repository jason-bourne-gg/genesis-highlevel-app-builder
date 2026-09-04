import { functionsBase } from '@/lib/firebase'
import { idToken } from './auth'

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message)
  }
}

export async function callFunction<T>(path: string): Promise<T> {
  const res = await fetch(`${functionsBase}${path}`, {
    headers: { Authorization: `Bearer ${await idToken()}` },
  })

  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
  if (!res.ok) {
    throw new ApiError(body.code ?? 'unknown', body.error ?? `Request failed (${res.status})`, res.status)
  }
  return body as T
}
