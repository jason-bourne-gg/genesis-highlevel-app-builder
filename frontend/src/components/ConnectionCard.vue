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
  <Card
    class="relative overflow-hidden transition-colors"
    :class="
      connected
        ? 'border-success/35 bg-success/[0.05]'
        : lost
          ? 'border-warning/35 bg-warning/[0.05]'
          : ''
    "
  >
    <!-- Connected is the good state, so it gets the only solid rail on the page. -->
    <span
      v-if="connected"
      class="bg-success absolute inset-y-0 left-0 w-0.5"
    />
    <CardContent class="flex flex-wrap items-center gap-4">
      <div
        class="grid size-10 place-items-center rounded-lg border"
        :class="
          connected
            ? 'border-success/35 bg-success/12 text-success'
            : lost
              ? 'border-warning/35 bg-warning/12 text-warning'
              : 'text-muted-foreground'
        "
      >
        <TriangleAlertIcon v-if="lost" class="size-5" />
        <PlugZapIcon v-else class="size-5" />
      </div>

      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-2 font-medium">
          HighLevel
          <span
            v-if="connected"
            class="text-success bg-success/12 rounded-full px-2 py-0.5 text-[11px] font-medium"
          >
            Connected
          </span>
        </p>
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
