<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ArrowUpIcon, SquareIcon } from '@lucide/vue'
import ChatMessage from './ChatMessage.vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { useGeneration } from '@/composables/useGeneration'

const props = defineProps<{ projectId: string }>()

const { messages, generating, send, stop } = useGeneration(props.projectId)

const draft = ref('')
const shell = ref<HTMLElement | null>(null)

const suggestions = [
  'Build a front desk view with our contacts and upcoming appointments.',
  'Add a search box over the contacts and status filters on the appointments.',
]

const tail = computed(() => {
  const last = messages.value[messages.value.length - 1]
  return `${messages.value.length}:${last ? last.content.length : 0}`
})

watch(tail, async () => {
  await nextTick()
  const viewport = shell.value?.querySelector('[data-slot=scroll-area-viewport]')
  if (viewport) viewport.scrollTop = viewport.scrollHeight
})

function submit() {
  if (!draft.value.trim() || generating.value) return
  const text = draft.value
  draft.value = ''
  send(text)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  submit()
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div ref="shell" class="min-h-0 flex-1">
      <ScrollArea class="h-full">
        <div v-if="messages.length" class="space-y-5 p-4">
          <ChatMessage v-for="message in messages" :key="message.id" :message="message" />
        </div>

        <div v-else class="space-y-4 p-4">
          <p class="text-muted-foreground text-sm">
            Describe what you want and Genesis writes it against your HighLevel location.
          </p>
          <div class="space-y-2">
            <button
              v-for="suggestion in suggestions"
              :key="suggestion"
              class="hover:bg-accent w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors"
              @click="draft = suggestion"
            >
              {{ suggestion }}
            </button>
          </div>
        </div>
      </ScrollArea>
    </div>

    <div class="border-t p-3">
      <div class="relative">
        <Textarea
          v-model="draft"
          rows="3"
          placeholder="Ask for a change…"
          class="max-h-48 resize-none pr-12"
          :disabled="generating"
          @keydown="onKeydown"
        />
        <Button
          v-if="generating"
          size="icon"
          variant="secondary"
          class="absolute right-2 bottom-2"
          aria-label="Stop generating"
          @click="stop"
        >
          <SquareIcon class="fill-current" />
        </Button>
        <Button
          v-else
          size="icon"
          class="absolute right-2 bottom-2"
          :disabled="!draft.trim()"
          aria-label="Send"
          @click="submit"
        >
          <ArrowUpIcon />
        </Button>
      </div>
      <p class="text-muted-foreground mt-2 text-[11px]">
        Enter to send &middot; Shift + Enter for a new line
      </p>
    </div>
  </div>
</template>
