<script setup lang="ts">
import { BugIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import type { FailMode } from '@/mocks/generation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDev } from '@/composables/useDev'
import { useHighLevel } from '@/composables/useHighLevel'

const { failMode } = useDev()
const { connected, dropConnection } = useHighLevel()

const modes: { value: FailMode; label: string }[] = [
  { value: 'none', label: 'Generate normally' },
  { value: 'midstream', label: 'Die mid-stream' },
  { value: 'immediate', label: 'Fail before writing' },
]

function breakConnection() {
  dropConnection()
  toast.warning('HighLevel connection dropped')
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline" size="sm" class="text-amber-400">
        <BugIcon />
        Dev
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-56">
      <DropdownMenuLabel>Next generation</DropdownMenuLabel>
      <DropdownMenuRadioGroup v-model="failMode">
        <DropdownMenuRadioItem v-for="mode in modes" :key="mode.value" :value="mode.value">
          {{ mode.label }}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem :disabled="!connected" @select="breakConnection">
        Drop HighLevel connection
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
