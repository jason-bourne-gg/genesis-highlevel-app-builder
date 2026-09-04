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
      return 'border-success/35 bg-success/12 text-success'
    case 'lost':
      return 'border-warning/35 bg-warning/12 text-warning'
    default:
      return 'text-muted-foreground'
  }
})
</script>

<template>
  <Badge variant="outline" :class="tone">
    <span
      class="size-1.5 rounded-full bg-current"
      :class="connection.status === 'connected' ? 'animate-pulse' : ''"
    />
    {{ label }}
  </Badge>
</template>
