import type { ProjectFile, StreamEvent } from '@/types'
import { refine, scaffold } from './fixtures'
import { sleep } from './storage'

// TODO: replace with Firebase — fetch the Cloud Run SSE endpoint and parse the ReadableStream
export type FailMode = 'none' | 'midstream' | 'immediate'

export interface GenerateRequest {
  prompt: string
  files: ProjectFile[]
  fail?: FailMode
}

const TICKS_PER_FILE = 180

function jitter(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function words(text: string) {
  return text.match(/\s*\S+|\s+$/g) ?? []
}

function slice(text: string, size: number) {
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}

export async function* streamGeneration(
  req: GenerateRequest,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  // A run that was stopped or died leaves no app.js — start over rather than refine a stub.
  const fixture = req.files.some((f) => f.path === 'app.js') ? refine() : scaffold()

  if (req.fail === 'immediate') {
    await sleep(700)
    yield { type: 'error', message: 'Model request failed (503). No changes were written.' }
    return
  }

  for (const word of words(fixture.intro)) {
    if (signal?.aborted) return
    await sleep(jitter(15, 40))
    yield { type: 'text', text: word }
  }

  const dieAt = req.fail === 'midstream' ? Math.min(1, fixture.files.length - 1) : -1

  for (const [index, file] of fixture.files.entries()) {
    if (signal?.aborted) return
    yield { type: 'file', path: file.path }

    const size = Math.max(2, Math.ceil(file.content.length / TICKS_PER_FILE))
    const parts = slice(file.content, size)
    const cutoff = index === dieAt ? Math.floor(parts.length * 0.45) : parts.length

    for (let i = 0; i < cutoff; i++) {
      if (signal?.aborted) return
      await sleep(12)
      yield { type: 'token', path: file.path, text: parts[i] }
    }

    if (index === dieAt) {
      yield { type: 'error', message: 'Stream closed unexpectedly. Partial output was kept.' }
      return
    }
  }

  for (const word of words(fixture.outro)) {
    if (signal?.aborted) return
    await sleep(jitter(15, 40))
    yield { type: 'text', text: word }
  }

  yield { type: 'done' }
}
