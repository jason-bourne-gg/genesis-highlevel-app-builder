import type { StreamEvent } from '@/types'
import { idToken } from './auth'

// Firebase Hosting buffers the whole response at its CDN, so this is the direct Cloud Run URL.
const GENERATE_URL = import.meta.env.VITE_GENERATE_URL

export class GenerationError extends Error {}

// fetch + ReadableStream rather than EventSource, which cannot send an Authorization header.
export async function* streamGeneration(
  projectId: string,
  prompt: string,
  model: string,
  signal: AbortSignal,
): AsyncGenerator<StreamEvent> {
  if (!GENERATE_URL) {
    throw new GenerationError('VITE_GENERATE_URL is not set. See .env.example.')
  }

  const res = await fetch(GENERATE_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await idToken()}`,
    },
    body: JSON.stringify({ projectId, prompt, model }),
  })

  // Pre-stream failures arrive as a status code, not as an error event inside a 200.
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new GenerationError(body.error ?? `Generation failed (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE frames are separated by a blank line, and one can arrive in pieces.
      let split = buffer.indexOf('\n\n')
      while (split !== -1) {
        const frame = buffer.slice(0, split)
        buffer = buffer.slice(split + 2)
        split = buffer.indexOf('\n\n')

        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('')
        if (!data) continue

        try {
          yield JSON.parse(data) as StreamEvent
        } catch {
          // A frame we cannot read is not worth killing a live generation over.
        }
      }
    }
  } finally {
    // Releasing the reader closes the connection, which tells the function to abort.
    await reader.cancel().catch(() => {})
  }
}
