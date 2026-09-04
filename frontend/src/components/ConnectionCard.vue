<script setup lang="ts">
import { LoaderCircleIcon, PlugZapIcon, TriangleAlertIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useHighLevel } from '@/composables/useHighLevel'

const { connection, connected, connecting, lost, connect, disconnect } = useHighLevel()

async function link() {
  await connect()
  toast.success(`Connected to ${connection.value.locationName}`)
}
</script>

<template>
  <Card>
    <CardContent class="flex flex-wrap items-center gap-4">
      <div
        class="grid size-10 place-items-center rounded-lg border"
        :class="connected ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'text-muted-foreground'"
      >
        <TriangleAlertIcon v-if="lost" class="size-5 text-amber-400" />
        <PlugZapIcon v-else class="size-5" />
      </div>

      <div class="min-w-0 flex-1">
        <p class="font-medium">HighLevel</p>
        <p class="text-muted-foreground truncate text-sm">
          <template v-if="connected">
            {{ connection.locationName }} &middot; {{ connection.locationId }}
          </template>
          <template v-else-if="connecting">Redirecting to HighLevel&hellip;</template>
          <template v-else-if="lost">Connection lost — the token needs refreshing</template>
          <template v-else>Not connected. Link a location to give your apps real data.</template>
        </p>
      </div>

      <Button v-if="connected" variant="outline" @click="disconnect">Disconnect</Button>
      <Button v-else :disabled="connecting" @click="link">
        <LoaderCircleIcon v-if="connecting" class="animate-spin" />
        {{ lost ? 'Reconnect' : 'Connect HighLevel' }}
      </Button>
    </CardContent>
  </Card>
</template>
