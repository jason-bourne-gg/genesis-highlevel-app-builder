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

// Must match fileId() in functions/src/generate/store.ts — the same path has to
// resolve to the same document whether the browser or the generator writes it.
export const fileId = (path: string) => path.replace(/[^a-zA-Z0-9._-]/g, '_')

// The tree reads top-down: the shell, the app, its styles, then the client we
// inject. Firestore has no inherent order, so one is imposed here.
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

// Live subscriptions everywhere rather than one-shot reads: the generation function
// writes the canonical result server-side, and this is how the browser learns about
// it — including in a second tab, or after the tab that started it was closed.
//
// The query filters on ownerUid alone, then hides soft-deleted projects and orders
// by recency here rather than in Firestore. Adding `where(deletedAt)` and
// `orderBy(updatedAt)` to the query would need a composite index, which has to be
// deployed and finish building before the dashboard renders at all. This is one
// person's project list — tens of documents — so the sort is free in the browser
// and the app has one less piece of infrastructure it cannot start without. If the
// list ever needs paging, the index goes in and the ordering moves back to the query.
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
    // Explicitly null rather than absent: the dashboard query filters on it, and a
    // missing field would drop the project out of the list entirely.
    deletedAt: null,
  })
  return { id: ref.id, name, description, locationId, createdAt: now, updatedAt: now }
}

// Soft delete. Subcollections would have to be walked to hard-delete, and a
// mis-click costing someone their generation history is a worse outcome.
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

// Restoring rewrites the whole set in one commit, so the preview can never render
// a half-restored app.
export async function restoreFiles(projectId: string, files: ProjectFile[]): Promise<void> {
  const batch = writeBatch(db)
  const now = Date.now()
  for (const file of files) {
    batch.set(doc(sub(projectId, 'files'), fileId(file.path)), { ...file, updatedAt: now })
  }
  batch.update(doc(projects, projectId), { updatedAt: now })
  await batch.commit()
}
