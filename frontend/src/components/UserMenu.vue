<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { LogOutIcon, MonitorIcon, MoonIcon, SunIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/composables/useAuth'
import { type ThemeSetting, useTheme } from '@/composables/useTheme'

const router = useRouter()
const { user, signOut } = useAuth()
const { theme, resolved, settings } = useTheme()

// The radio group hands back a plain string; narrow it back to the union.
const appearance = computed({
  get: () => theme.value as string,
  set: (value: string) => {
    if (settings.includes(value as ThemeSetting)) theme.value = value as ThemeSetting
  },
})

async function leave() {
  await signOut()
  router.push({ name: 'signin' })
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" class="rounded-full" aria-label="Account">
        <span
          class="from-primary to-highlight text-primary-foreground grid size-7 place-items-center rounded-full bg-linear-to-br text-xs font-semibold"
        >
          {{ user?.email.slice(0, 2).toUpperCase() }}
        </span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-56">
      <DropdownMenuLabel class="truncate font-normal">{{ user?.email }}</DropdownMenuLabel>
      <DropdownMenuSeparator />

      <DropdownMenuLabel class="text-muted-foreground text-xs font-normal">
        Appearance
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup v-model="appearance">
        <DropdownMenuRadioItem value="light">
          <SunIcon />
          Light
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark">
          <MoonIcon />
          Dark
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="system">
          <MonitorIcon />
          System
          <span v-if="theme === 'system'" class="text-muted-foreground ml-auto text-xs">
            {{ resolved }}
          </span>
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>

      <DropdownMenuSeparator />
      <DropdownMenuItem @select="leave">
        <LogOutIcon />
        Sign out
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
