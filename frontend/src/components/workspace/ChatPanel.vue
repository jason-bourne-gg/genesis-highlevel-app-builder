<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ArrowUpIcon, ChevronDownIcon, PlugZapIcon, SquareIcon } from '@lucide/vue'
import ChatMessage from './ChatMessage.vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useGeneration } from '@/composables/useGeneration'
import { useModel } from '@/composables/useModel'
import { formatCost } from '@/lib/cost'
import { useHighLevel } from '@/composables/useHighLevel'

const props = defineProps<{ projectId: string }>()

const { messages, generating, status, send, stop } = useGeneration(props.projectId)
const { model, selected, models } = useModel()
const { connected, connecting, connect } = useHighLevel()

const draft = ref('')
const shell = ref<HTMLElement | null>(null)

const suggestions = [
  'Build a front desk view with our contacts and upcoming appointments.',
  'Add a search box over the contacts and status filters on the appointments.',
]

const spent = computed(() =>
  messages.value.reduce((total, m) => total + (m.usage?.costUsd ?? 0), 0),
)

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

const chosen = computed({
  get: () => model.value,
  set: (id: string) => {
    model.value = id
  },
})

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  submit()
}
</script>

<template>
  <div class="flex h-full flex-col">
    <p
      class="text-muted-foreground bg-muted/40 flex h-9 shrink-0 items-center border-b px-3 text-[11px] font-medium tracking-wide uppercase"
    >
      Chat
    </p>

    <div ref="shell" class="min-h-0 flex-1">
      <ScrollArea class="h-full">
        <div v-if="messages.length" class="space-y-5 p-4">
          <ChatMessage v-for="message in messages" :key="message.id" :message="message" />
          <!-- Summarised model reasoning during the pause before the first file. -->
          <p v-if="generating && status" class="text-primary flex items-center gap-2 text-xs italic">
            <span class="bg-primary size-1.5 shrink-0 animate-pulse rounded-full" />
            {{ status }}
          </p>
        </div>

        <div v-else class="space-y-4 p-4">
          <p class="text-muted-foreground text-sm">
            Describe what you want and Genesis writes it against your HighLevel location.
          </p>
          <div class="space-y-2">
            <button
              v-for="suggestion in suggestions"
              :key="suggestion"
              class="hover:border-primary/40 hover:bg-primary/[0.06] focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-[3px]"
              @click="draft = suggestion"
            >
              {{ suggestion }}
            </button>
          </div>
        </div>
      </ScrollArea>
    </div>

    <div class="border-t p-3">
      <div
        v-if="!connected"
        class="border-warning/35 bg-warning/[0.06] mb-2.5 flex items-start gap-2.5 rounded-lg border p-2.5"
      >
        <PlugZapIcon class="text-warning mt-0.5 size-3.5 shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="text-[13px] leading-snug font-medium">No HighLevel account connected</p>
          <p class="text-muted-foreground mt-0.5 text-xs leading-snug">
            Genesis will still write the app, but the preview has no contacts or appointments
            to show until you connect.
          </p>
          <Button
            variant="outline"
            size="sm"
            class="mt-2 h-7 text-xs"
            :disabled="connecting"
            @click="connect"
          >
            Connect HighLevel
          </Button>
        </div>
      </div>

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
      <div class="mt-2 flex items-center justify-between gap-2">
        <p class="text-muted-foreground text-[11px]">
          Enter to send &middot; Shift + Enter for a new line
          <span v-if="spent > 0" class="ml-1.5 font-mono opacity-70">
            &middot; {{ formatCost(spent) }} this project
          </span>
        </p>

        <!-- The server re-checks the model id, so this is a preference, not a privilege. -->
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              size="sm"
              class="text-muted-foreground -mr-1 h-6 gap-1 px-1.5 text-[11px]"
              :disabled="generating"
              aria-label="Choose model"
            >
              {{ selected.label }}
              <ChevronDownIcon class="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-72">
            <DropdownMenuLabel>Model</DropdownMenuLabel>
            <DropdownMenuRadioGroup v-model="chosen">
              <DropdownMenuRadioItem
                v-for="option in models"
                :key="option.id"
                :value="option.id"
                class="items-start"
              >
                <span class="flex-1">
                  <span class="flex items-baseline gap-2">
                    <span class="font-medium">{{ option.label }}</span>
                    <span class="text-muted-foreground text-[10px] tracking-wide">
                      {{ option.cost }}
                    </span>
                  </span>
                  <span class="text-muted-foreground block text-xs">{{ option.blurb }}</span>
                </span>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  </div>
</template>
