<script setup lang="ts">
import { RotateCcwIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { clockTime, relative } from '@/lib/time'
import { useWorkspace } from '@/composables/useWorkspace'

const props = defineProps<{ projectId: string }>()
const open = defineModel<boolean>('open', { required: true })

const { snapshots, restore } = useWorkspace(props.projectId)

function revert(id: string) {
  restore(id)
  open.value = false
  toast.success('Restored snapshot')
}
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent side="right" class="w-full gap-0 sm:max-w-md">
      <SheetHeader>
        <SheetTitle>History</SheetTitle>
        <SheetDescription>
          Every generation leaves a snapshot of the whole file set.
        </SheetDescription>
      </SheetHeader>

      <ScrollArea class="min-h-0 flex-1">
        <p v-if="!snapshots.length" class="text-muted-foreground px-4 pb-4 text-sm">
          Nothing yet — send a prompt and the first snapshot lands here.
        </p>
        <ul v-else class="space-y-3 px-4 pb-6">
          <li v-for="snapshot in snapshots" :key="snapshot.id" class="rounded-lg border p-3">
            <div class="flex items-baseline justify-between gap-3">
              <span class="text-sm font-medium">{{ clockTime(snapshot.createdAt) }}</span>
              <span class="text-muted-foreground text-xs">{{ relative(snapshot.createdAt) }}</span>
            </div>
            <p class="text-muted-foreground mt-1.5 line-clamp-3 text-sm">{{ snapshot.prompt }}</p>
            <div class="mt-3 flex items-center justify-between">
              <span class="text-muted-foreground text-xs">
                {{ snapshot.files.length }} file{{ snapshot.files.length === 1 ? '' : 's' }}
              </span>
              <Button variant="outline" size="sm" @click="revert(snapshot.id)">
                <RotateCcwIcon />
                Restore
              </Button>
            </div>
          </li>
        </ul>
      </ScrollArea>
    </SheetContent>
  </Sheet>
</template>
