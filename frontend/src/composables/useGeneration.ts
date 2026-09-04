import { ref, type Ref } from 'vue'
import type { Message } from '@/types'
import { streamGeneration } from '@/mocks/generation'
import { uid } from '@/mocks/storage'
import { useDev } from './useDev'
import { useWorkspace } from './useWorkspace'

interface Session {
  generating: Ref<boolean>
  streamingPath: Ref<string | null>
  controller: AbortController | null
}

const sessions = new Map<string, Session>()

function sessionFor(projectId: string): Session {
  let session = sessions.get(projectId)
  if (!session) {
    session = { generating: ref(false), streamingPath: ref<string | null>(null), controller: null }
    sessions.set(projectId, session)
  }
  return session
}

export function useGeneration(projectId: string) {
  const workspace = useWorkspace(projectId)
  const { failMode } = useDev()

  const session = sessionFor(projectId)
  const { generating, streamingPath } = session

  function push(message: Message) {
    workspace.messages.value.push(message)
    return workspace.messages.value[workspace.messages.value.length - 1]
  }

  async function send(prompt: string) {
    const text = prompt.trim()
    if (!text || generating.value) return

    generating.value = true
    await workspace.ready

    push({
      id: uid('msg'),
      role: 'user',
      content: text,
      createdAt: Date.now(),
      status: 'complete',
    })

    const reply = push({
      id: uid('msg'),
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      status: 'streaming',
    })

    const controller = new AbortController()
    session.controller = controller

    const touched = new Set<string>()
    let failed = false

    try {
      const stream = streamGeneration(
        { prompt: text, files: workspace.files.value, fail: failMode.value },
        controller.signal,
      )

      for await (const event of stream) {
        switch (event.type) {
          case 'text':
            reply.content += event.text
            break
          case 'file':
            streamingPath.value = event.path
            workspace.writeFile(event.path, '')
            touched.add(event.path)
            break
          case 'token':
            workspace.appendFile(event.path, event.text)
            break
          case 'error':
            reply.status = 'failed'
            reply.error = event.message
            failed = true
            break
          case 'done':
            reply.status = 'complete'
            break
        }
      }
    } finally {
      if (controller.signal.aborted) reply.status = 'stopped'
      streamingPath.value = null
      generating.value = false
      session.controller = null
    }

    if (touched.size) {
      workspace.commitFiles(reply.status === 'complete')
      if (!failed) workspace.recordSnapshot(text)
    }
    workspace.persistMessages()
  }

  function stop() {
    session.controller?.abort()
  }

  return { messages: workspace.messages, generating, streamingPath, send, stop }
}
