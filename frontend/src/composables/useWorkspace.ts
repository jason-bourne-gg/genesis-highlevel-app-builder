import { ref, watch } from 'vue'
import type { Message, Project, ProjectFile, Snapshot } from '@/types'
import * as store from '@/services/projects'
import { useAuth } from './useAuth'

function create(projectId: string) {
  const project = ref<Project | null>(null)
  const files = ref<ProjectFile[]>([])
  const messages = ref<Message[]>([])
  const snapshots = ref<Snapshot[]>([])
  const loading = ref(true)

  // Bumped when files change; the preview tracks its own counter so an aborted
  // generation doesn't replace a working app with half a file.
  const revision = ref(0)
  const previewRevision = ref(0)

  // While a generation runs, the tokens arriving over SSE are the freshest view of
  // the files — the function only writes to Firestore once it has finished. So
  // remote updates are parked until the stream ends, then applied in one go. That
  // final apply is what reconciles the browser with what was actually saved.
  const streaming = ref(false)
  let parkedFiles: ProjectFile[] | null = null
  let parkedMessages: Message[] | null = null

  function applyFiles(list: ProjectFile[], render = true) {
    files.value = list
    revision.value++
    if (render) previewRevision.value++
  }

  const stops = [
    store.watchFiles(projectId, (list) => {
      if (streaming.value) parkedFiles = list
      else applyFiles(list)
    }),
    store.watchMessages(projectId, (list) => {
      if (streaming.value) parkedMessages = list
      else messages.value = list
    }),
    store.watchSnapshots(projectId, (list) => {
      snapshots.value = list
    }),
  ]

  watch(streaming, (busy) => {
    if (busy) return
    if (parkedFiles) applyFiles(parkedFiles)
    if (parkedMessages) messages.value = parkedMessages
    parkedFiles = null
    parkedMessages = null
  })

  const ready = store.getProject(projectId).then((p) => {
    project.value = p
    loading.value = false
    return p
  })

  // Local, in-memory edits used while streaming. Nothing here is persisted — the
  // generation function is the writer.
  function writeFile(path: string, content: string) {
    const existing = files.value.find((f) => f.path === path)
    if (existing) existing.content = content
    else files.value = store.sortFiles([...files.value, { path, content }])
  }

  function appendFile(path: string, chunk: string) {
    const existing = files.value.find((f) => f.path === path)
    if (existing) existing.content += chunk
  }

  // A manual edit from the editor. This one does persist.
  async function saveFile(path: string) {
    const file = files.value.find((f) => f.path === path)
    if (!file) return
    await store.saveFile(projectId, { path, content: file.content })
    previewRevision.value++
  }

  async function restore(snapshotId: string) {
    const snapshot = snapshots.value.find((s) => s.id === snapshotId)
    if (!snapshot) return
    await store.restoreFiles(projectId, snapshot.files)
  }

  function dispose() {
    for (const stop of stops) stop()
  }

  return {
    project,
    files,
    messages,
    snapshots,
    loading,
    revision,
    previewRevision,
    streaming,
    ready,
    writeFile,
    appendFile,
    saveFile,
    restore,
    dispose,
  }
}

export type Workspace = ReturnType<typeof create>

const open = new Map<string, Workspace>()

// Signing out revokes the rules that these listeners depend on, so they have to go
// with the session — otherwise every open subscription starts erroring.
const { user } = useAuth()
watch(user, (next) => {
  if (next) return
  for (const workspace of open.values()) workspace.dispose()
  open.clear()
})

export function useWorkspace(projectId: string): Workspace {
  let workspace = open.get(projectId)
  if (!workspace) {
    workspace = create(projectId)
    open.set(projectId, workspace)
  }
  return workspace
}
