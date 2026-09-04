<script setup lang="ts">
import { computed } from 'vue'
import { MonitorIcon, MoonIcon, SunIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTheme } from '@/composables/useTheme'

// The auth screens have no UserMenu, so this is the only pre-sign-in theme control.
const { theme, settings } = useTheme()

const icon = computed(() =>
  theme.value === 'light' ? SunIcon : theme.value === 'dark' ? MoonIcon : MonitorIcon,
)

const label = computed(() => `Appearance: ${theme.value}`)

function cycle() {
  theme.value = settings[(settings.indexOf(theme.value) + 1) % settings.length]
}
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <Button variant="ghost" size="icon-sm" :aria-label="label" @click="cycle">
        <component :is="icon" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>{{ label }}</TooltipContent>
  </Tooltip>
</template>
