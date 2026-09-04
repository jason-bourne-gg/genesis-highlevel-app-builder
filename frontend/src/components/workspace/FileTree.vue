<script setup lang="ts">
import { FileCodeIcon, FileTextIcon, FileTypeIcon } from '@lucide/vue'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ProjectFile } from '@/types'

defineProps<{ files: ProjectFile[]; active: string | null; streaming: string | null }>()
defineEmits<{ pick: [path: string] }>()

function icon(path: string) {
  if (path.endsWith('.html')) return FileTextIcon
  if (path.endsWith('.css')) return FileTypeIcon
  return FileCodeIcon
}
</script>

<template>
  <div class="flex h-full w-48 flex-col border-r">
    <p
      class="text-muted-foreground bg-muted/40 flex h-9 shrink-0 items-center border-b px-3 text-[11px] font-medium tracking-wide uppercase"
    >
      Files
    </p>
    <ScrollArea class="min-h-0 flex-1">
      <p v-if="!files.length" class="text-muted-foreground px-3 pt-3 pb-3 text-xs">
        Nothing here yet.
      </p>
      <ul v-else class="space-y-px px-1.5 pt-1.5 pb-3">
        <li v-for="file in files" :key="file.path">
          <button
            class="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors"
            :class="
              active === file.path
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground'
            "
            @click="$emit('pick', file.path)"
          >
            <component :is="icon(file.path)" class="size-3.5 shrink-0" />
            <span class="truncate">{{ file.path }}</span>
            <span
              v-if="streaming === file.path"
              class="bg-primary ml-auto size-1.5 shrink-0 animate-pulse rounded-full ring-3 ring-primary/25"
            />
          </button>
        </li>
      </ul>
    </ScrollArea>
  </div>
</template>
