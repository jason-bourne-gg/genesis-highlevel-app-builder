import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { HlError } from '../errors'
import type { GenerationUsage } from './usage'

export interface ProjectFile {
  path: string
  content: string
}

export interface StoredMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  status: 'complete' | 'stopped' | 'failed'
  error?: string
  usage?: GenerationUsage
}

export interface ProjectContext {
  name: string
  description: string
  files: ProjectFile[]
  history: { role: 'user' | 'assistant'; content: string }[]
}

// Firestore ids cannot contain "/", and deriving one from the path keeps writes idempotent.
export const fileId = (path: string) => path.replace(/[^a-zA-Z0-9._-]/g, '_')

const HISTORY_TURNS = 12

const db = (): Firestore => getFirestore()

export async function loadContext(uid: string, projectId: string): Promise<ProjectContext> {
  const project = await db().doc(`projects/${projectId}`).get()
  if (!project.exists) throw new HlError('not_found', 'Project not found', 404)

  const data = project.data() as { ownerUid?: string; name?: string; description?: string }
  // The client sends a project id; nothing stops it sending someone else's.
  if (data.ownerUid !== uid) throw new HlError('forbidden', 'Not your project', 403)

  const [files, messages] = await Promise.all([
    db().collection(`projects/${projectId}/files`).get(),
    db()
      .collection(`projects/${projectId}/messages`)
      .orderBy('createdAt', 'desc')
      .limit(HISTORY_TURNS)
      .get(),
  ])

  return {
    name: data.name ?? 'Untitled',
    description: data.description ?? '',
    files: files.docs.map((d) => d.data() as ProjectFile),
    history: messages.docs
      .map((d) => d.data() as StoredMessage)
      .filter((m) => m.content.trim().length > 0)
      .reverse()
      .map((m) => ({ role: m.role, content: m.content })),
  }
}

interface PersistInput {
  projectId: string
  prompt: string
  reply: StoredMessage
  written: ProjectFile[]
  // Only a generation that ran to completion is worth being able to return to.
  snapshot: ProjectFile[] | null
}

export async function persist({
  projectId,
  prompt,
  reply,
  written,
  snapshot,
}: PersistInput): Promise<void> {
  const batch = db().batch()
  const root = db().doc(`projects/${projectId}`)
  const now = Date.now()

  batch.set(root.collection('messages').doc(), {
    role: 'user',
    content: prompt,
    createdAt: now - 1,
    status: 'complete',
  })
  batch.set(root.collection('messages').doc(), { ...reply, createdAt: now })

  for (const file of written) {
    batch.set(root.collection('files').doc(fileId(file.path)), { ...file, updatedAt: now })
  }

  if (snapshot) {
    batch.set(root.collection('snapshots').doc(), { prompt, createdAt: now, files: snapshot })
  }

  batch.update(root, { updatedAt: now })
  await batch.commit()
}
