<script setup lang="ts">
import { BugIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useHighLevel } from '@/composables/useHighLevel'

const { connected, dropConnection } = useHighLevel()

// Stream interruption and model failure are exercised on the real path, so only this is left.
function breakConnection() {
  dropConnection()
  toast.warning('HighLevel connection dropped')
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline" size="sm" class="text-warning border-warning/40">
        <BugIcon />
        Dev
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-56">
      <DropdownMenuLabel>Simulate</DropdownMenuLabel>
      <DropdownMenuItem :disabled="!connected" @select="breakConnection">
        Drop HighLevel connection
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
