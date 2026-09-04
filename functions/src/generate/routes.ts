import Anthropic from '@anthropic-ai/sdk'
import { onRequest } from 'firebase-functions/v2/https'
import { uidFrom } from '../auth'
import { config } from '../config'
import { isHlError } from '../errors'
import { HL_CLIENT_SOURCE } from './hlClient'
import { resolveModel, supportsAdaptiveThinking } from './models'
import { FileStreamParser } from './parser'
import { SYSTEM_PROMPT } from './prompt'
import { loadContext, persist, type ProjectFile, type StoredMessage } from './store'

// hl.js is ours and index.html is load-bearing for the preview, so the model is
// only ever allowed to write these three.
const WRITABLE = new Set(['index.html', 'app.js', 'styles.css'])
const HL_PATH = 'hl.js'

function userTurn(files: ProjectFile[], prompt: string): string {
  if (!files.length) return prompt

  const listing = files
    .filter((f) => f.path !== HL_PATH)
    .map((f) => `<file path="${f.path}">\n${f.content}\n</file>`)
    .join('\n')

  return (
    'Here are the project\'s current files. Re-emit only the ones your change ' +
    'actually touches.\n\n' +
    listing +
    '\n\n' +
    prompt
  )
}

export const generate = onRequest(
  { cors: true, timeoutSeconds: 540, memory: '512MiB' },
  async (req, res) => {
    if (req.method !== 'POST') return void res.status(405).json({ error: 'Use POST' })

    // Everything that can fail cleanly fails before the stream opens, so the client
    // gets a real status code instead of an error event on a 200.
    let uid: string
    let projectId: string
    let prompt: string
    let model: string
    try {
      uid = await uidFrom(req)
      const body = (req.body ?? {}) as { projectId?: string; prompt?: string; model?: string }
      projectId = String(body.projectId ?? '')
      prompt = String(body.prompt ?? '').trim()
      // Falls back to the configured default rather than rejecting, so an old tab
      // with a stale model id still works instead of failing the generation.
      model = resolveModel(body.model, config.anthropicModel)
      if (!projectId || !prompt) throw new Error('projectId and prompt are required')
    } catch (e) {
      const status = isHlError(e) ? e.status : 400
      return void res.status(status).json({ error: (e as Error).message })
    }

    let context
    try {
      context = await loadContext(uid, projectId)
    } catch (e) {
      const status = isHlError(e) ? e.status : 500
      return void res.status(status).json({ error: (e as Error).message })
    }

    res.set('Content-Type', 'text/event-stream')
    res.set('Cache-Control', 'no-cache, no-transform')
    // Belt and braces against an intermediary that buffers. The real fix is calling
    // this function at its direct Cloud Run URL — Firebase Hosting buffers the whole
    // response at the CDN and SSE never arrives through a rewrite.
    res.set('X-Accel-Buffering', 'no')
    res.flushHeaders()

    const send = (event: unknown) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    // Thinking happens before any text arrives, and that silence can outlast an
    // idle-connection timeout somewhere in the middle. A comment frame is valid SSE
    // and carries no event, so the client parser ignores it.
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n')
    }, 15_000)

    const controller = new AbortController()
    let aborted = false
    req.on('close', () => {
      if (res.writableEnded) return
      aborted = true
      controller.abort()
    })

    const parser = new FileStreamParser()
    const open = new Map<string, string>()
    const completed = new Map<string, string>()
    let prose = ''
    let failure: string | null = null

    try {
      const client = new Anthropic({ apiKey: config.anthropicKey })
      const adaptive = supportsAdaptiveThinking(model)

      const stream = client.messages.stream(
        {
          model,
          // Comfortably more than three small files need, and under Haiku's cap.
          max_tokens: 32000,
          system: SYSTEM_PROMPT,
          // Summarised thinking gives the chat something honest to show during the
          // pause before the first file, instead of dead air. Models without it
          // simply start writing sooner, and the status line stays empty.
          ...(adaptive
            ? {
                thinking: { type: 'adaptive' as const, display: 'summarized' as const },
                output_config: { effort: 'high' as const },
              }
            : {}),
          messages: [
            ...context.history.map((m) => ({ role: m.role, content: m.content })),
            { role: 'user' as const, content: userTurn(context.files, prompt) },
          ],
        },
        { signal: controller.signal },
      )

      for await (const chunk of stream) {
        if (chunk.type !== 'content_block_delta') continue

        if (chunk.delta.type === 'thinking_delta') {
          if (chunk.delta.thinking) send({ type: 'status', text: chunk.delta.thinking })
          continue
        }
        if (chunk.delta.type !== 'text_delta') continue

        for (const event of parser.push(chunk.delta.text)) {
          switch (event.type) {
            case 'text':
              prose += event.text
              send(event)
              break
            case 'file':
              open.set(event.path, '')
              send(event)
              break
            case 'token':
              open.set(event.path, (open.get(event.path) ?? '') + event.text)
              send(event)
              break
            case 'close':
              completed.set(event.path, open.get(event.path) ?? '')
              open.delete(event.path)
              break
          }
        }
      }

      for (const event of parser.end()) {
        if (event.type === 'text') {
          prose += event.text
          send(event)
        }
        // A file still open when the stream ends never got its closing tag, so it
        // is not a file — it is a truncation. It is deliberately not committed.
      }
    } catch (e) {
      if (!aborted) failure = (e as Error).message || 'The model request failed'
    }

    // Whatever happened, decide what is safe to keep and write it. This runs even
    // when the browser walked away — the work is already paid for.
    const status: StoredMessage['status'] = aborted ? 'stopped' : failure ? 'failed' : 'complete'

    const written: ProjectFile[] = [...completed.entries()]
      .filter(([path]) => WRITABLE.has(path))
      .map(([path, content]) => ({ path, content: content.replace(/^\n+/, '') }))

    const merged = new Map(context.files.map((f) => [f.path, f.content]))
    for (const file of written) merged.set(file.path, file.content)
    merged.set(HL_PATH, HL_CLIENT_SOURCE)

    // Without index.html there is nothing for the preview to stitch together, so a
    // "successful" generation that lost it is a failed one.
    if (status === 'complete' && !merged.has('index.html')) {
      failure = 'The model did not produce an index.html. Nothing was written.'
    }

    try {
      if (failure) {
        await persist({
          projectId,
          prompt,
          reply: { role: 'assistant', content: prose, createdAt: 0, status: 'failed', error: failure },
          written: [],
          snapshot: null,
        })
        send({ type: 'error', message: failure })
      } else if (written.length) {
        const files = [...merged.entries()].map(([path, content]) => ({ path, content }))
        await persist({
          projectId,
          prompt,
          reply: { role: 'assistant', content: prose, createdAt: 0, status },
          written: [...written, { path: HL_PATH, content: HL_CLIENT_SOURCE }],
          snapshot: status === 'complete' ? files : null,
        })
      } else {
        await persist({
          projectId,
          prompt,
          reply: { role: 'assistant', content: prose, createdAt: 0, status },
          written: [],
          snapshot: null,
        })
      }
    } catch (e) {
      send({ type: 'error', message: `Could not save the generation: ${(e as Error).message}` })
    }

    clearInterval(heartbeat)
    if (!failure) send({ type: 'done' })
    if (!res.writableEnded) res.end()
  },
)
