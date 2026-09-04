import { ref, watch } from 'vue'
import type { Project } from '@/types'
import * as store from '@/services/projects'
import { useAuth } from './useAuth'
import { useHighLevel } from './useHighLevel'

const projects = ref<Project[]>([])
const loading = ref(true)
let stop: (() => void) | null = null

const { user } = useAuth()

// One subscription for the whole app, re-pointed when the signed-in user changes.
// Without the teardown a signed-out session keeps a listener open on rules that
// no longer permit it, which surfaces as permission-denied noise in the console.
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
    // Stamped at creation rather than read live, so the project keeps pointing at
    // the sub-account it was actually built for.
    return store.createProject(user.value.id, name, description, connection.value.locationId ?? '')
  }

  // No local splice: the subscription reports the removal. Doing both would make
  // the card flicker back in if the write failed.
  const remove = (id: string) => store.deleteProject(id)

  return { projects, loading, create, remove }
}
