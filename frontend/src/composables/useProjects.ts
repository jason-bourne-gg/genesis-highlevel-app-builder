import { ref, watch } from 'vue'
import type { Project } from '@/types'
import * as store from '@/services/projects'
import { useAuth } from './useAuth'
import { useHighLevel } from './useHighLevel'

const projects = ref<Project[]>([])
const loading = ref(true)
let stop: (() => void) | null = null

const { user } = useAuth()

// Without the teardown a signed-out session keeps a listener open on rules that now deny it.
watch(
  user,
  (next) => {
    stop?.()
    stop = null

    if (!next) {
      projects.value = []
      loading.value = false
      return
    }

    loading.value = true
    stop = store.watchProjects(next.id, (list) => {
      projects.value = list
      loading.value = false
    })
  },
  { immediate: true },
)

export function useProjects() {
  const { connection } = useHighLevel()

  async function create(name: string, description: string) {
    if (!user.value) throw new Error('Not signed in')
    // Stamped at creation, so the project keeps pointing at the sub-account it was built for.
    return store.createProject(user.value.id, name, description, connection.value.locationId ?? '')
  }

  // No local splice: the subscription reports the removal.
  const remove = (id: string) => store.deleteProject(id)

  return { projects, loading, create, remove }
}
