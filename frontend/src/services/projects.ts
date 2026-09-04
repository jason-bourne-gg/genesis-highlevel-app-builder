import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Message, Project, ProjectFile, Snapshot } from '@/types'

// Must match fileId() in functions/src/generate/store.ts.
export const fileId = (path: string) => path.replace(/[^a-zA-Z0-9._-]/g, '_')

// Firestore has no inherent order, so the file tree's order is imposed here.
const ORDER = ['index.html', 'app.js', 'styles.css', 'hl.js']

export function sortFiles(files: ProjectFile[]): ProjectFile[] {
  const rank = (p: string) => {
    const i = ORDER.indexOf(p)
    return i === -1 ? ORDER.length : i
  }
  return [...files].sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path))
}

const projects = collection(db, 'projects')
const sub = (projectId: string, name: string) => collection(db, 'projects', projectId, name)

// The deletedAt filter and the sort stay in the browser to avoid a composite index the
// dashboard would have to wait on before it could render at all.
export function watchProjects(uid: string, onChange: (list: Project[]) => void): () => void {
  return onSnapshot(query(projects, where('ownerUid', '==', uid)), (snap) => {
    onChange(
      snap.docs
        .filter((d) => !d.data().deletedAt)
        .map((d) => {
          const data = d.data()
          return {
            id: d.id,
            name: String(data.name ?? 'Untitled'),
            description: String(data.description ?? ''),
            locationId: String(data.locationId ?? ''),
            createdAt: Number(data.createdAt ?? 0),
            updatedAt: Number(data.updatedAt ?? 0),
          }
        })
        .sort((a, b) => b.updatedAt - a.updatedAt),
    )
  })
}

export async function getProject(id: string): Promise<Project | null> {
  const snap = await getDoc(doc(projects, id))
  if (!snap.exists()) return null
  const data = snap.data()
  if (data.deletedAt) return null
  return {
    id: snap.id,
    name: String(data.name ?? 'Untitled'),
    description: String(data.description ?? ''),
    locationId: String(data.locationId ?? ''),
    createdAt: Number(data.createdAt ?? 0),
    updatedAt: Number(data.updatedAt ?? 0),
  }
}

export async function createProject(
  uid: string,
  name: string,
  description: string,
  locationId: string,
): Promise<Project> {
  const now = Date.now()
  const ref = await addDoc(projects, {
    ownerUid: uid,
    name,
    description,
    locationId,
    createdAt: now,
    updatedAt: now,
    // Explicit null rather than absent: the dashboard query filters on this field.
    deletedAt: null,
  })
  return { id: ref.id, name, description, locationId, createdAt: now, updatedAt: now }
}

// Soft delete: a hard delete would have to walk subcollections, and a mis-click costs history.
export function deleteProject(id: string): Promise<void> {
  return updateDoc(doc(projects, id), { deletedAt: Date.now() })
}

export function touchProject(id: string): Promise<void> {
  return updateDoc(doc(projects, id), { updatedAt: Date.now() })
}

export function watchFiles(projectId: string, onChange: (files: ProjectFile[]) => void) {
  return onSnapshot(sub(projectId, 'files'), (snap) => {
    onChange(
      sortFiles(
        snap.docs.map((d) => ({
          path: String(d.data().path ?? d.id),
          content: String(d.data().content ?? ''),
        })),
      ),
    )
  })
}

export function watchMessages(projectId: string, onChange: (messages: Message[]) => void) {
  return onSnapshot(query(sub(projectId, 'messages'), orderBy('createdAt', 'asc')), (snap) => {
    onChange(
      snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          role: data.role === 'user' ? 'user' : 'assistant',
          content: String(data.content ?? ''),
          createdAt: Number(data.createdAt ?? 0),
          status: (data.status ?? 'complete') as Message['status'],
          error: data.error ? String(data.error) : undefined,
        }
      }),
    )
  })
}

export function watchSnapshots(projectId: string, onChange: (snapshots: Snapshot[]) => void) {
  return onSnapshot(query(sub(projectId, 'snapshots'), orderBy('createdAt', 'desc')), (snap) => {
    onChange(
      snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          prompt: String(data.prompt ?? ''),
          createdAt: Number(data.createdAt ?? 0),
          files: sortFiles((data.files ?? []) as ProjectFile[]),
        }
      }),
    )
  })
}

export async function saveFile(projectId: string, file: ProjectFile): Promise<void> {
  const batch = writeBatch(db)
  batch.set(doc(sub(projectId, 'files'), fileId(file.path)), { ...file, updatedAt: Date.now() })
  batch.update(doc(projects, projectId), { updatedAt: Date.now() })
  await batch.commit()
}

// One commit, so the preview can never render a half-restored app.
export async function restoreFiles(projectId: string, files: ProjectFile[]): Promise<void> {
  const batch = writeBatch(db)
  const now = Date.now()
  for (const file of files) {
    batch.set(doc(sub(projectId, 'files'), fileId(file.path)), { ...file, updatedAt: now })
  }
  batch.update(doc(projects, projectId), { updatedAt: now })
  await batch.commit()
}
