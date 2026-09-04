<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ArrowLeftIcon, HistoryIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import ConnectionBadge from '@/components/ConnectionBadge.vue'
import DevMenu from '@/components/DevMenu.vue'
import UserMenu from '@/components/UserMenu.vue'
import ChatPanel from '@/components/workspace/ChatPanel.vue'
import EditorPanel from '@/components/workspace/EditorPanel.vue'
import HistorySheet from '@/components/workspace/HistorySheet.vue'
import PreviewPanel from '@/components/workspace/PreviewPanel.vue'
import { Button } from '@/components/ui/button'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { useDev } from '@/composables/useDev'
import { useWorkspace } from '@/composables/useWorkspace'

const props = defineProps<{ id: string }>()

const router = useRouter()
const { project, ready } = useWorkspace(props.id)
const { enabled: devMode } = useDev()

const historyOpen = ref(false)

ready.then(() => {
  if (project.value) return
  toast.error('That project no longer exists')
  router.replace('/')
})
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="bg-background/70 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-md">
      <Button variant="ghost" size="icon" as-child aria-label="Back to projects">
        <RouterLink to="/"><ArrowLeftIcon /></RouterLink>
      </Button>
      <span class="truncate font-medium tracking-tight">{{ project?.name ?? 'Loading…' }}</span>
      <ConnectionBadge />
      <div class="flex-1" />
      <DevMenu v-if="devMode" />
      <Button variant="outline" size="sm" @click="historyOpen = true">
        <HistoryIcon />
        History
      </Button>
      <UserMenu />
    </header>

    <ResizablePanelGroup direction="horizontal" class="min-h-0 flex-1">
      <ResizablePanel :default-size="26" :min-size="18">
        <ChatPanel :project-id="id" />
      </ResizablePanel>
      <ResizableHandle with-handle />
      <ResizablePanel :default-size="42" :min-size="24">
        <EditorPanel :project-id="id" />
      </ResizablePanel>
      <ResizableHandle with-handle />
      <ResizablePanel :default-size="32" :min-size="20">
        <PreviewPanel :project-id="id" />
      </ResizablePanel>
    </ResizablePanelGroup>

    <HistorySheet v-model:open="historyOpen" :project-id="id" />
  </div>
</template>
