import { ref, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import type { Message } from '@/types'
import { streamGeneration } from '@/services/generation'
import { cancelGeneration } from '@/services/projects'
import { useModel } from './useModel'
import { useWorkspace } from './useWorkspace'

interface Session {
  generating: Ref<boolean>
  streamingPath: Ref<string | null>
  status: Ref<string>
  controller: AbortController | null
  generationId: string | null
}

// Keyed by project so a generation survives navigation and two can run at once.
const sessions = new Map<string, Session>()

function sessionFor(projectId: string): Session {
  let session = sessions.get(projectId)
  if (!session) {
    session = {
      generating: ref(false),
      streamingPath: ref<string | null>(null),
      status: ref(''),
      controller: null,
      generationId: null,
    }
    sessions.set(projectId, session)
  }
  return session
}

const localId = () => `local_${Math.random().toString(36).slice(2, 10)}`

export function useGeneration(projectId: string) {
  const workspace = useWorkspace(projectId)
  const { model } = useModel()
  const session = sessionFor(projectId)
  const { generating, streamingPath, status } = session

  async function send(prompt: string) {
    const text = prompt.trim()
    if (!text || generating.value) return

    generating.value = true
    // Parks incoming Firestore updates until the stream ends.
    workspace.streaming.value = true
    status.value = ''

    const controller = new AbortController()
    session.controller = controller

    // Out here so the finally always settles it, even if the project never loaded.
    let reply: Message | null = null

    try {
      await workspace.ready

      // Optimistic copies; the function writes the real message documents.
      workspace.messages.value = [
        ...workspace.messages.value,
        { id: localId(), role: 'user', content: text, createdAt: Date.now(), status: 'complete' },
        {
          id: localId(),
          role: 'assistant',
          content: '',
          createdAt: Date.now(),
          status: 'streaming',
        },
      ]
      // Read the handle back out of the array. Mutating the object that was pushed in
      // bypasses the reactive proxy, so streamed text would never render.
      reply = workspace.messages.value[workspace.messages.value.length - 1]

      for await (const event of streamGeneration(projectId, text, model.value, controller.signal)) {
        switch (event.type) {
          case 'started':
            session.generationId = event.generationId
            break
          case 'status':
            // Deltas, not whole summaries. Replacing them showed the last few
            // characters flashing past instead of a readable thought.
            status.value += event.text
            break
          case 'text':
            reply.content += event.text
            break
          case 'file':
            streamingPath.value = event.path
            workspace.writeFile(event.path, '')
            break
          case 'token':
            workspace.appendFile(event.path, event.text)
            break
          case 'error':
            reply.status = 'failed'
            reply.error = event.message
            break
          case 'done':
            reply.status = 'complete'
            break
        }
      }
    } catch (e) {
      // An abort is the user pressing stop, not a failure.
      if (controller.signal.aborted) {
        // Settled in the finally.
      } else if (reply) {
        reply.status = 'failed'
        reply.error = (e as Error).message
      } else {
        toast.error((e as Error).message)
      }
    } finally {
      if (reply && controller.signal.aborted) reply.status = 'stopped'
      streamingPath.value = null
      status.value = ''
      generating.value = false
      session.controller = null
      session.generationId = null
      // Releasing this swaps the optimistic copies for what the function actually saved.
      workspace.streaming.value = false
    }
  }

  // Closing the connection is the signal: the function aborts but still saves finished files.
  // Closing the connection is not enough: a client disconnect does not reliably
  // reach the function through Cloud Run, and the generation would run to
  // completion, overwrite the files and still be billed. The flag is what stops it.
  function stop() {
    if (session.generationId) {
      void cancelGeneration(projectId, session.generationId).catch(() => {})
    }
    session.controller?.abort()
  }

  return { messages: workspace.messages, generating, streamingPath, status, send, stop }
}
