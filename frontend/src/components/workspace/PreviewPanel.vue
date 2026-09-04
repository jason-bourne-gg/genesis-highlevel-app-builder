<script setup lang="ts">
import { ref, watch } from 'vue'
import { ExternalLinkIcon, LoaderCircleIcon, RefreshCwIcon, UnplugIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { buildPreview } from '@/lib/preview'
import { useHighLevel } from '@/composables/useHighLevel'
import { useWorkspace } from '@/composables/useWorkspace'

const props = defineProps<{ projectId: string }>()

const { files, previewRevision } = useWorkspace(props.projectId)
const { lost, connecting, connect } = useHighLevel()

const doc = ref('')
const frame = ref(0)

function refresh() {
  doc.value = buildPreview(files.value)
  frame.value++
}

watch(previewRevision, refresh, { immediate: true })

// A blob: URL would inherit this origin, letting generated code read the Firebase
// session out of IndexedDB. Open a bare shell instead and sandbox the app inside it,
// matching the in-page preview.
function openInTab() {
  const win = window.open('', '_blank')
  if (!win) return

  win.document.write(
    '<!doctype html><meta charset="utf-8"><title>Preview</title>' +
      '<style>html,body{margin:0;height:100%}iframe{display:block;border:0;width:100%;height:100%}</style>' +
      '<iframe sandbox="allow-scripts"></iframe>',
  )
  win.document.close()
  win.opener = null

  const frame = win.document.querySelector('iframe')
  if (frame) frame.srcdoc = doc.value
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex h-9 shrink-0 items-center gap-1 border-b px-2">
      <span class="text-muted-foreground px-1 text-[11px] font-medium tracking-wide uppercase">
        Preview
      </span>
      <div class="flex-1" />
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" aria-label="Reload preview" @click="refresh">
            <RefreshCwIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Reload</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open in new tab"
            :disabled="!doc"
            @click="openInTab"
          >
            <ExternalLinkIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open in a new tab</TooltipContent>
      </Tooltip>
    </div>

    <div class="relative min-h-0 flex-1 bg-white">
      <iframe
        v-if="doc"
        :key="frame"
        :srcdoc="doc"
        sandbox="allow-scripts"
        title="App preview"
        class="size-full border-0"
      />
      <div
        v-else
        class="text-muted-foreground grid h-full place-items-center bg-transparent px-6 text-center text-sm"
      >
        Your app shows up here once it has been generated.
      </div>

      <div
        v-if="lost"
        class="bg-background/95 absolute inset-0 grid place-items-center px-8 text-center backdrop-blur-sm"
      >
        <div class="max-w-xs space-y-3">
          <UnplugIcon class="mx-auto size-6 text-amber-400" />
          <p class="font-medium">HighLevel connection lost</p>
          <p class="text-muted-foreground text-sm">
            The preview can't reach your location's contacts or calendar until the token is
            refreshed.
          </p>
          <Button size="sm" :disabled="connecting" @click="connect">
            <LoaderCircleIcon v-if="connecting" class="animate-spin" />
            Reconnect
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
