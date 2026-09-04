<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { PlusIcon, SparklesIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import type { Project } from '@/types'
import ConnectionCard from '@/components/ConnectionCard.vue'
import DevMenu from '@/components/DevMenu.vue'
import NewProjectDialog from '@/components/NewProjectDialog.vue'
import ProjectCard from '@/components/ProjectCard.vue'
import UserMenu from '@/components/UserMenu.vue'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useDev } from '@/composables/useDev'
import { useProjects } from '@/composables/useProjects'

const router = useRouter()
const { projects, loading, create, remove } = useProjects()
const { enabled: devMode } = useDev()

const dialogOpen = ref(false)
const creating = ref(false)
const pendingDelete = ref<Project | null>(null)

const deleteOpen = computed({
  get: () => pendingDelete.value !== null,
  set: (value: boolean) => {
    if (!value) pendingDelete.value = null
  },
})

async function onCreate(name: string, description: string) {
  creating.value = true
  try {
    const project = await create(name, description)
    dialogOpen.value = false
    router.push(`/project/${project.id}`)
  } finally {
    creating.value = false
  }
}

function askDelete(id: string) {
  pendingDelete.value = projects.value.find((p) => p.id === id) ?? null
}

async function confirmDelete() {
  const project = pendingDelete.value
  if (!project) return
  pendingDelete.value = null
  await remove(project.id)
  toast.success(`Deleted ${project.name}`)
}
</script>

<template>
  <div class="min-h-full">
    <header class="bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
      <div class="mx-auto flex h-14 max-w-5xl items-center gap-3 px-6">
        <SparklesIcon class="size-5 text-violet-400" />
        <span class="font-semibold tracking-tight">Genesis</span>
        <div class="flex-1" />
        <DevMenu v-if="devMode" />
        <UserMenu />
      </div>
    </header>

    <main class="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <ConnectionCard />

      <section class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold tracking-tight">Projects</h2>
          <Button @click="dialogOpen = true">
            <PlusIcon />
            New project
          </Button>
        </div>

        <p v-if="loading" class="text-muted-foreground text-sm">Loading projects&hellip;</p>

        <div
          v-else-if="!projects.length"
          class="rounded-xl border border-dashed px-6 py-16 text-center"
        >
          <p class="font-medium">No projects yet</p>
          <p class="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
            Start one and describe the tool you want. Genesis writes it against your HighLevel
            location.
          </p>
          <Button class="mt-6" @click="dialogOpen = true">
            <PlusIcon />
            New project
          </Button>
        </div>

        <div v-else class="grid gap-4 sm:grid-cols-2">
          <ProjectCard
            v-for="project in projects"
            :key="project.id"
            :project="project"
            @remove="askDelete"
          />
        </div>
      </section>
    </main>

    <NewProjectDialog v-model:open="dialogOpen" :pending="creating" @create="onCreate" />

    <AlertDialog v-model:open="deleteOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {{ pendingDelete?.name }}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its files, chat history and snapshots go with it. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-white hover:bg-destructive/90"
            @click="confirmDelete"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
