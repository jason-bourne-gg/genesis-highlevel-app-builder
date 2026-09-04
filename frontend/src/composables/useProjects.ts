import { ref } from 'vue'
import type { Project } from '@/types'
import * as store from '@/mocks/projects'

const projects = ref<Project[]>([])
const loading = ref(false)
let started = false

async function refresh() {
  loading.value = true
  try {
    projects.value = await store.listProjects()
  } finally {
    loading.value = false
  }
}

export function useProjects() {
  if (!started) {
    started = true
    refresh()
  }

  async function create(name: string, description: string) {
    const project = await store.createProject(name, description)
    projects.value = [project, ...projects.value]
    return project
  }

  async function remove(id: string) {
    projects.value = projects.value.filter((p) => p.id !== id)
    await store.deleteProject(id)
  }

  return { projects, loading, refresh, create, remove }
}
