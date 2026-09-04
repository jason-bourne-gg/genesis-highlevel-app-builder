<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { useHighLevel } from '@/composables/useHighLevel'

const { connection } = useHighLevel()

const label = computed(() => {
  switch (connection.value.status) {
    case 'connected':
      return connection.value.locationName ?? 'Connected'
    case 'connecting':
      return 'Connecting'
    case 'lost':
      return 'Connection lost'
    default:
      return 'Not connected'
  }
})

const tone = computed(() => {
  switch (connection.value.status) {
    case 'connected':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
    case 'lost':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-400'
    default:
      return 'text-muted-foreground'
  }
})
</script>

<template>
  <Badge variant="outline" :class="tone">
    <span class="size-1.5 rounded-full bg-current" />
    {{ label }}
  </Badge>
</template>
