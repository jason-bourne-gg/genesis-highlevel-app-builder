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
import { readOAuthResult } from '@/composables/useOAuthResult'

const router = useRouter()
const { projects, loading, create, remove } = useProjects()
const { enabled: devMode } = useDev()

readOAuthResult()

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
    <header class="bg-background/70 sticky top-0 z-10 border-b backdrop-blur-md">
      <div class="mx-auto flex h-14 max-w-5xl items-center gap-2.5 px-6">
        <span
          class="from-primary to-highlight text-primary-foreground grid size-7 place-items-center rounded-lg bg-linear-to-br shadow-sm"
        >
          <SparklesIcon class="size-4" />
        </span>
        <span class="font-semibold tracking-tight">Genesis</span>
        <div class="flex-1" />
        <DevMenu v-if="devMode" />
        <UserMenu />
      </div>
    </header>

    <main class="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <section
        class="brand-wash-soft border-border/70 relative overflow-hidden rounded-2xl border px-6 py-8 sm:px-8"
      >
        <span class="from-primary to-highlight absolute inset-x-0 top-0 h-px bg-linear-to-r" />
        <h1 class="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          Describe the tool.
          <span class="brand-text">Genesis writes it.</span>
        </h1>
        <p class="text-muted-foreground mt-2 max-w-xl text-sm">
          Small internal apps built straight onto your HighLevel location — contacts,
          conversations and calendars, no glue code.
        </p>
        <Button class="mt-6" @click="dialogOpen = true">
          <PlusIcon />
          New project
        </Button>
      </section>

      <ConnectionCard />

      <section class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold tracking-tight">Projects</h2>
          <Button variant="outline" @click="dialogOpen = true">
            <PlusIcon />
            New project
          </Button>
        </div>

        <p v-if="loading" class="text-muted-foreground text-sm">Loading projects&hellip;</p>

        <div
          v-else-if="!projects.length"
          class="border-primary/25 bg-primary/[0.035] rounded-xl border border-dashed px-6 py-16 text-center"
        >
          <span
            class="bg-primary/10 text-primary ring-primary/20 mx-auto grid size-11 place-items-center rounded-xl ring-1"
          >
            <SparklesIcon class="size-5" />
          </span>
          <p class="mt-4 font-medium">No projects yet</p>
          <p class="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
            Start one and describe the tool you want. Genesis writes it against your HighLevel
            location.
          </p>
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
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="confirmDelete"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
