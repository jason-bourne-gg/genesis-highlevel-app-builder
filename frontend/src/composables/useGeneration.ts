import { ref, type Ref } from 'vue'
import type { Message } from '@/types'
import { streamGeneration } from '@/services/generation'
import { useModel } from './useModel'
import { useWorkspace } from './useWorkspace'

interface Session {
  generating: Ref<boolean>
  streamingPath: Ref<string | null>
  status: Ref<string>
  controller: AbortController | null
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
    await workspace.ready

    // Optimistic copies; the function writes the real message documents.
    workspace.messages.value = [
      ...workspace.messages.value,
      { id: localId(), role: 'user', content: text, createdAt: Date.now(), status: 'complete' },
    ]
    const reply: Message = {
      id: localId(),
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      status: 'streaming',
    }
    workspace.messages.value = [...workspace.messages.value, reply]

    const controller = new AbortController()
    session.controller = controller

    try {
      for await (const event of streamGeneration(projectId, text, model.value, controller.signal)) {
        switch (event.type) {
          case 'status':
            status.value = event.text
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
      if (!controller.signal.aborted) {
        reply.status = 'failed'
        reply.error = (e as Error).message
      }
    } finally {
      if (controller.signal.aborted) reply.status = 'stopped'
      streamingPath.value = null
      status.value = ''
      generating.value = false
      session.controller = null
      // Releasing this swaps the optimistic copies for what the function actually saved.
      workspace.streaming.value = false
    }
  }

  // Closing the connection is the signal: the function aborts but still saves finished files.
  function stop() {
    session.controller?.abort()
  }

  return { messages: workspace.messages, generating, streamingPath, status, send, stop }
}
