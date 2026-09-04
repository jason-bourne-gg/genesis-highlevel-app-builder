<script setup lang="ts">
import { computed } from 'vue'
import { TriangleAlertIcon } from '@lucide/vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { Message } from '@/types'

const props = defineProps<{ message: Message }>()

const parts = computed(() =>
  props.message.content
    .split(/(`[^`\n]+`)/)
    .filter(Boolean)
    .map((text) =>
      text.startsWith('`') && text.endsWith('`')
        ? { code: true, text: text.slice(1, -1) }
        : { code: false, text },
    ),
)
</script>

<template>
  <div :class="message.role === 'user' ? 'flex justify-end' : ''">
    <div
      :class="[
        'max-w-[92%] text-sm leading-relaxed whitespace-pre-wrap',
        message.role === 'user'
          ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3.5 py-2'
          : 'text-foreground/90',
      ]"
    >
      <template v-for="(part, i) in parts" :key="i">
        <code
          v-if="part.code"
          class="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]"
        >{{ part.text }}</code>
        <template v-else>{{ part.text }}</template>
      </template>
      <span
        v-if="message.status === 'streaming'"
        class="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-current align-baseline"
      />
    </div>
  </div>

  <p v-if="message.status === 'stopped'" class="text-muted-foreground text-xs italic">
    Stopped by you. Whatever was written has been kept.
  </p>

  <Alert v-if="message.error" variant="destructive" class="border-destructive/30">
    <TriangleAlertIcon />
    <AlertDescription>{{ message.error }}</AlertDescription>
  </Alert>
</template>
