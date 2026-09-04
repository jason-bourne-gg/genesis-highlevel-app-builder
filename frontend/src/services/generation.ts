import type { StreamEvent } from '@/types'
import { idToken } from './auth'

// Not Firebase Hosting. Hosting buffers the entire response at its CDN before
// sending anything, so an event stream routed through a rewrite arrives all at
// once, at the end — which is to say, it does not stream at all. This is the
// function's direct Cloud Run URL.
const GENERATE_URL = import.meta.env.VITE_GENERATE_URL

export class GenerationError extends Error {}

/**
 * Streams one generation.
 *
 * Uses fetch + ReadableStream rather than EventSource, which cannot send an
 * Authorization header — and the endpoint has to know who is asking, because it
 * reads and writes that user's project.
 */
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

  // Anything that could be decided before the model was called comes back as a
  // normal status code, not as an error event inside a 200.
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

      // SSE frames are separated by a blank line. A frame can arrive in pieces,
      // so only whole frames are taken off the buffer.
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
    // Stopping means the user pressed stop. Releasing the reader closes the
    // connection, which is what tells the function to abort the model call.
    await reader.cancel().catch(() => {})
  }
}
