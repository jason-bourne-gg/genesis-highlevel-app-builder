import { ref } from 'vue'
import type { Message, Project, ProjectFile, Snapshot } from '@/types'
import * as store from '@/mocks/projects'
import { uid } from '@/mocks/storage'

function create(projectId: string) {
  const project = ref<Project | null>(null)
  const files = ref<ProjectFile[]>([])
  const messages = ref<Message[]>([])
  const snapshots = ref<Snapshot[]>([])
  const loading = ref(true)

  // Bumped when files are committed; the preview tracks its own counter so an aborted
  // generation doesn't replace a working app with half a file.
  const revision = ref(0)
  const previewRevision = ref(0)

  const ready = Promise.all([
    store.getProject(projectId),
    store.loadFiles(projectId),
    store.loadMessages(projectId),
    store.loadSnapshots(projectId),
  ]).then(([p, f, m, s]) => {
    project.value = p
    files.value = f
    messages.value = m
    snapshots.value = s
    loading.value = false
    revision.value++
    previewRevision.value++
  })

  function writeFile(path: string, content: string) {
    const existing = files.value.find((f) => f.path === path)
    if (existing) existing.content = content
    else files.value.push({ path, content })
  }

  function appendFile(path: string, chunk: string) {
    const existing = files.value.find((f) => f.path === path)
    if (existing) existing.content += chunk
  }

  function commitFiles(render = true) {
    store.saveFiles(projectId, files.value)
    store.touchProject(projectId)
    revision.value++
    if (render) previewRevision.value++
  }

  function persistMessages() {
    store.saveMessages(projectId, messages.value)
  }

  function recordSnapshot(prompt: string) {
    const snapshot: Snapshot = {
      id: uid('snp'),
      prompt,
      createdAt: Date.now(),
      files: files.value.map((f) => ({ ...f })),
    }
    snapshots.value = [snapshot, ...snapshots.value]
    store.saveSnapshots(projectId, snapshots.value)
  }

  function restore(snapshotId: string) {
    const snapshot = snapshots.value.find((s) => s.id === snapshotId)
    if (!snapshot) return
    files.value = snapshot.files.map((f) => ({ ...f }))
    commitFiles()
  }

  return {
    project,
    files,
    messages,
    snapshots,
    loading,
    revision,
    previewRevision,
    ready,
    writeFile,
    appendFile,
    commitFiles,
    persistMessages,
    recordSnapshot,
    restore,
  }
}

export type Workspace = ReturnType<typeof create>

const open = new Map<string, Workspace>()

export function useWorkspace(projectId: string): Workspace {
  let workspace = open.get(projectId)
  if (!workspace) {
    workspace = create(projectId)
    open.set(projectId, workspace)
  }
  return workspace
}
