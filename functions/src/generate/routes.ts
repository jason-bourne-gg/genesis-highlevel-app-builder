import Anthropic from '@anthropic-ai/sdk'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { onRequest } from 'firebase-functions/v2/https'
import { uidFrom } from '../auth'
import { ANTHROPIC_API_KEY, config } from '../config'
import { isHlError } from '../errors'
import { HL_CLIENT_SOURCE } from './hlClient'
import { resolveModel, supportsAdaptiveThinking } from './models'
import { priceUsage, type GenerationUsage } from './usage'
import { FileStreamParser } from './parser'
import { SYSTEM_PROMPT } from './prompt'
import { asFiles, stripFence, validateShell } from './validate'
import { loadContext, persist, type ProjectFile, type StoredMessage } from './store'

// hl.js is ours, so the model may only ever write these three.
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
  { cors: true, timeoutSeconds: 540, memory: '512MiB', secrets: [ANTHROPIC_API_KEY] },
  async (req, res) => {
    if (req.method !== 'POST') return void res.status(405).json({ error: 'Use POST' })

    // Fail before the stream opens, so the client gets a status code, not an error in a 200.
    let uid: string
    let projectId: string
    let prompt: string
    let model: string
    try {
      uid = await uidFrom(req)
      const body = (req.body ?? {}) as { projectId?: string; prompt?: string; model?: string }
      projectId = String(body.projectId ?? '')
      prompt = String(body.prompt ?? '').trim()
      // Falls back to the default, so an old tab with a stale model id still works.
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
    // Firebase Hosting buffers responses at its CDN; SSE only works via the direct Cloud Run URL.
    res.set('X-Accel-Buffering', 'no')
    res.flushHeaders()

    const send = (event: unknown) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    // Silence before the first text can outlast an idle-connection timeout somewhere.
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n')
    }, 15_000)

    const controller = new AbortController()
    let aborted = false

    const cancel = () => {
      if (aborted || res.writableEnded) return
      aborted = true
      controller.abort()
    }

    // Kept as a fast path, but not relied on: a client disconnect does not
    // reliably reach the container through Cloud Run's proxy.
    res.on('close', cancel)

    // So Stop is an explicit signal instead. The client writes cancelled on this
    // document and the listener picks it up, which does not depend on the
    // transport noticing anything.
    const genRef = getFirestore().collection(`projects/${projectId}/generations`).doc()
    await genRef.set({ startedAt: Date.now(), cancelled: false, model })
    send({ type: 'started', generationId: genRef.id })

    const unwatch = genRef.onSnapshot(
      (snap) => {
        if (snap.data()?.cancelled) cancel()
      },
      () => {},
    )

    const parser = new FileStreamParser()
    const open = new Map<string, string>()
    const completed = new Map<string, string>()
    let prose = ''
    let failure: string | null = null
    // Read off the stream rather than the final message, so a run the user stops
    // still reports what it burned. Anthropic bills for what was generated.
    let usage: GenerationUsage | null = null
    let usageIn: Record<string, number> = {}
    let usageOut: Record<string, number> = {}

    try {
      const client = new Anthropic({ apiKey: config.anthropicKey })
      const adaptive = supportsAdaptiveThinking(model)

      const stream = client.messages.stream(
        {
          model,
          // Comfortably more than three small files need, and under Haiku's cap.
          max_tokens: 32000,
          system: SYSTEM_PROMPT,
          // Gives the chat something to show during the pause before the first file.
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
        if (chunk.type === 'message_start') {
          usageIn = chunk.message.usage as unknown as Record<string, number>
          continue
        }
        if (chunk.type === 'message_delta') {
          usageOut = chunk.usage as unknown as Record<string, number>
          continue
        }
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

      const final = await stream.finalMessage().catch(() => null)
      if (final?.stop_reason === 'max_tokens') {
        failure = 'The model ran out of room before finishing. Nothing was written — try a smaller change.'
      } else if (final?.stop_reason === 'refusal') {
        failure = 'The model declined to write this. Try rewording the request.'
      }

      for (const event of parser.end()) {
        if (event.type === 'text') {
          prose += event.text
          send(event)
        }
        // A file still open here was truncated, so it is deliberately not committed.
      }
    } catch (e) {
      if (!aborted) failure = (e as Error).message || 'The model request failed'
    }

    // Runs even when the browser walked away — the work is already paid for.
    unwatch()
    void genRef.delete().catch(() => {})

    usage = priceUsage(model, usageIn, usageOut)
    logger.info('generation.usage', {
      projectId,
      uid,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUsd,
      outcome: aborted ? 'stopped' : failure ? 'failed' : 'complete',
    })

    const status: StoredMessage['status'] = aborted ? 'stopped' : failure ? 'failed' : 'complete'

    const written: ProjectFile[] = [...completed.entries()]
      .filter(([path]) => WRITABLE.has(path))
      .map(([path, content]) => ({ path, content: stripFence(content) }))

    const merged = new Map(context.files.map((f) => [f.path, f.content]))
    for (const file of written) merged.set(file.path, file.content)
    merged.set(HL_PATH, HL_CLIENT_SOURCE)

    // Without index.html the preview has nothing to stitch together.
    if (status === 'complete') failure = validateShell(merged, new Set(written.map((f) => f.path)))

    try {
      if (failure) {
        await persist({
          projectId,
          prompt,
          reply: { role: 'assistant', content: prose, createdAt: 0, status: 'failed', error: failure, usage },
          written: [],
          snapshot: null,
        })
        send({ type: 'error', message: failure })
      } else if (written.length) {
        const files = asFiles(merged)
        await persist({
          projectId,
          prompt,
          reply: { role: 'assistant', content: prose, createdAt: 0, status, usage },
          written: [...written, { path: HL_PATH, content: HL_CLIENT_SOURCE }],
          snapshot: status === 'complete' ? files : null,
        })
      } else {
        await persist({
          projectId,
          prompt,
          reply: { role: 'assistant', content: prose, createdAt: 0, status, usage },
          written: [],
          snapshot: null,
        })
      }
    } catch (e) {
      send({ type: 'error', message: `Could not save the generation: ${(e as Error).message}` })
      failure = failure ?? 'Could not save the generation'
    }

    clearInterval(heartbeat)
    if (!failure) send({ type: 'done' })
    if (!res.writableEnded) res.end()
  },
)
