<script setup lang="ts">
import { useRouter } from 'vue-router'
import { LogOutIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/composables/useAuth'

const router = useRouter()
const { user, signOut } = useAuth()

async function leave() {
  await signOut()
  router.push({ name: 'signin' })
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" class="rounded-full" aria-label="Account">
        <span class="bg-muted grid size-7 place-items-center rounded-full text-xs font-medium">
          {{ user?.email.slice(0, 2).toUpperCase() }}
        </span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-56">
      <DropdownMenuLabel class="truncate font-normal">{{ user?.email }}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem @select="leave">
        <LogOutIcon />
        Sign out
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
