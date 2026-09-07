<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { useFlags } from '@/composables/useFlags'

const { writes, extendedReads } = useFlags()
</script>

<template>
  <div class="flex items-center gap-1.5">
    <Badge
      :variant="writes ? 'default' : 'secondary'"
      :title="
        writes
          ? 'Generated apps can create contacts, send messages and book appointments'
          : 'Generated apps can read HighLevel data but not change it'
      "
    >
      {{ writes ? 'Writes enabled' : 'Read only' }}
    </Badge>
    <Badge
      v-if="extendedReads"
      variant="outline"
      title="Contact search and conversation threads are available to generated apps"
    >
      Extended reads
    </Badge>
  </div>
</template>
