import type { Message, Project, ProjectFile, Snapshot } from '@/types'
import { scaffold } from './fixtures'
import { drop, read, sleep, uid, write } from './storage'

// TODO: replace with Firebase — Firestore projects/{projectId} plus its files, messages
// and snapshots subcollections
const LIST = 'projects'
const SEEDED = 'seeded'

const filesKey = (id: string) => `files:${id}`
const messagesKey = (id: string) => `messages:${id}`
const snapshotsKey = (id: string) => `snapshots:${id}`

const minutes = (n: number) => Date.now() - n * 60_000

function seed() {
  if (read(SEEDED, false)) return
  write(SEEDED, true)

  const intake: Project = {
    id: 'prj_intake',
    name: 'Patient Intake',
    description: 'Pre-visit form that writes answers back onto the HighLevel contact.',
    createdAt: minutes(60 * 26),
    updatedAt: minutes(60 * 26),
  }

  const frontDesk: Project = {
    id: 'prj_frontdesk',
    name: 'Front Desk Dashboard',
    description: 'Today at a glance — contacts, conversations and the appointment book.',
    createdAt: minutes(60 * 5),
    updatedAt: minutes(47),
  }

  write(LIST, [frontDesk, intake])

  const files = scaffold().files
  write(filesKey(frontDesk.id), files)
  write(messagesKey(frontDesk.id), [
    {
      id: uid('msg'),
      role: 'user',
      content: 'Build a front desk view showing our contacts and upcoming appointments.',
      createdAt: minutes(49),
      status: 'complete',
    },
    {
      id: uid('msg'),
      role: 'assistant',
      content: scaffold().intro + scaffold().outro,
      createdAt: minutes(48),
      status: 'complete',
    },
  ] satisfies Message[])
  write(snapshotsKey(frontDesk.id), [
    {
      id: uid('snp'),
      prompt: 'Build a front desk view showing our contacts and upcoming appointments.',
      createdAt: minutes(47),
      files,
    },
  ] satisfies Snapshot[])
}

export async function listProjects(): Promise<Project[]> {
  seed()
  await sleep(180)
  return read<Project[]>(LIST, []).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getProject(id: string): Promise<Project | null> {
  seed()
  await sleep(120)
  return read<Project[]>(LIST, []).find((p) => p.id === id) ?? null
}

export async function createProject(name: string, description: string): Promise<Project> {
  await sleep(280)
  const project: Project = {
    id: uid('prj'),
    name,
    description,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  write(LIST, [project, ...read<Project[]>(LIST, [])])
  return project
}

export async function deleteProject(id: string): Promise<void> {
  await sleep(200)
  write(
    LIST,
    read<Project[]>(LIST, []).filter((p) => p.id !== id),
  )
  drop(filesKey(id))
  drop(messagesKey(id))
  drop(snapshotsKey(id))
}

export function touchProject(id: string) {
  const projects = read<Project[]>(LIST, [])
  const project = projects.find((p) => p.id === id)
  if (!project) return
  project.updatedAt = Date.now()
  write(LIST, projects)
}

export async function loadFiles(projectId: string): Promise<ProjectFile[]> {
  await sleep(140)
  return read<ProjectFile[]>(filesKey(projectId), [])
}

export function saveFiles(projectId: string, files: ProjectFile[]) {
  write(filesKey(projectId), files)
}

export async function loadMessages(projectId: string): Promise<Message[]> {
  await sleep(140)
  return read<Message[]>(messagesKey(projectId), [])
}

export function saveMessages(projectId: string, messages: Message[]) {
  write(messagesKey(projectId), messages)
}

export async function loadSnapshots(projectId: string): Promise<Snapshot[]> {
  await sleep(140)
  return read<Snapshot[]>(snapshotsKey(projectId), [])
}

export function saveSnapshots(projectId: string, snapshots: Snapshot[]) {
  write(snapshotsKey(projectId), snapshots)
}
