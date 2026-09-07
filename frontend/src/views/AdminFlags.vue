<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  LoaderCircleIcon,
  LockIcon,
  ShieldIcon,
} from '@lucide/vue'
import { toast } from 'vue-sonner'
import FlagSwitch from '@/components/FlagSwitch.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import UserMenu from '@/components/UserMenu.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { loadAdminFlags, lock, patchFlag, unlock, unlocked, type AdminUser } from '@/services/flags'
import type { FlagState } from '@/types'

const flags = ref<FlagState[]>([])
const users = ref<AdminUser[]>([])
const truncated = ref(false)
const open = ref(false)
const loading = ref(true)
const selectedKey = ref('')
const filter = ref('')
// Keyed per row, so one pending toggle does not freeze the whole list.
const busy = ref<string | null>(null)

const username = ref('')
const password = ref('')
const unlocking = ref(false)
const unlockError = ref('')

const selected = computed(() => flags.value.find((f) => f.key === selectedKey.value) ?? null)

const shown = computed(() => {
  const term = filter.value.trim().toLowerCase()
  if (!term) return users.value
  return users.value.filter((u) => u.email.toLowerCase().includes(term))
})

// A flag is on for someone if it is on for everyone, or if their account is on its list.
const onFor = (flag: FlagState, uid: string) => flag.enabled || flag.actors.includes(uid)

async function load() {
  loading.value = true
  try {
    const view = await loadAdminFlags()
    open.value = view.root
    flags.value = view.flags
    users.value = view.users ?? []
    truncated.value = view.truncated === true
    if (!selectedKey.value && flags.value.length) selectedKey.value = flags.value[0].key
  } catch (e) {
    // A signed-in account with no pass is the normal case, not an error worth a toast.
    open.value = false
    if (unlocked()) toast.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (unlocked()) void load()
  else loading.value = false
})

async function submit() {
  unlockError.value = ''
  if (!username.value.trim() || !password.value) {
    unlockError.value = 'Enter the root username and password'
    return
  }
  unlocking.value = true
  try {
    await unlock(username.value.trim(), password.value)
    password.value = ''
    await load()
  } catch (e) {
    unlockError.value = (e as Error).message
  } finally {
    unlocking.value = false
  }
}

function relock() {
  lock()
  open.value = false
  flags.value = []
  users.value = []
}

// One call site for every change, so the server's copy of the flag replaces the row
// rather than a locally guessed one.
async function change(rowKey: string, patch: Record<string, unknown>) {
  if (!selected.value) return
  const key = selected.value.key
  busy.value = rowKey
  try {
    const { flag } = await patchFlag(key, patch)
    flags.value = flags.value.map((f) => (f.key === key ? flag : f))
  } catch (e) {
    toast.error((e as Error).message)
  } finally {
    busy.value = null
  }
}

const setGlobal = (value: boolean) => change('__global__', { enabled: value })
const setActor = (uid: string, value: boolean) => change(uid, { actorUid: uid, on: value })

const stateOf = (flag: FlagState) =>
  flag.enabled ? 'On for everyone' : flag.actors.length ? `${flag.actors.length} on` : 'Off'
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="bg-background/70 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-md">
      <Button variant="ghost" size="icon" as-child aria-label="Back to projects">
        <RouterLink to="/"><ArrowLeftIcon /></RouterLink>
      </Button>
      <ShieldIcon class="text-muted-foreground size-4" />
      <span class="font-medium tracking-tight">Feature flags</span>
      <div class="flex-1" />
      <Button v-if="open" variant="outline" size="sm" @click="relock">
        <LockIcon />
        Lock
      </Button>
      <ThemeToggle />
      <UserMenu />
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto max-w-2xl px-6 py-10">
        <div v-if="loading" class="text-muted-foreground flex items-center gap-2 text-sm">
          <LoaderCircleIcon class="size-4 animate-spin" />
          Loading…
        </div>

        <!-- Locked. Any signed-in account sees this; the credential is what opens it. -->
        <div v-else-if="!open" class="max-w-sm space-y-6">
          <div class="space-y-1.5">
            <h1 class="text-2xl font-semibold tracking-tight">Feature flags</h1>
            <p class="text-muted-foreground text-sm">
              Enter the root credential to see and change flags. You stay signed in as
              yourself — this only unlocks this page, for thirty minutes.
            </p>
          </div>

          <form class="space-y-4" novalidate @submit.prevent="submit">
            <div class="space-y-2">
              <Label for="root-user">Username</Label>
              <Input id="root-user" v-model="username" autocomplete="off" spellcheck="false" />
            </div>
            <div class="space-y-2">
              <Label for="root-pass">Password</Label>
              <Input id="root-pass" v-model="password" type="password" autocomplete="off" />
            </div>
            <p v-if="unlockError" class="text-destructive text-sm">{{ unlockError }}</p>
            <Button type="submit" class="w-full" :disabled="unlocking">
              <LoaderCircleIcon v-if="unlocking" class="animate-spin" />
              Unlock
            </Button>
          </form>
        </div>

        <template v-else>
          <h1 class="text-2xl font-semibold tracking-tight">Feature flags</h1>

          <!-- Pick a flag -->
          <div class="mt-6 space-y-2">
            <Label>Flag</Label>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="outline" class="w-full justify-between font-normal">
                  <span class="truncate">{{ selected?.label ?? 'Select a flag' }}</span>
                  <ChevronDownIcon class="opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" class="w-[--reka-dropdown-menu-trigger-width]">
                <DropdownMenuRadioGroup v-model="selectedKey">
                  <DropdownMenuRadioItem v-for="flag in flags" :key="flag.key" :value="flag.key">
                    <span class="truncate">{{ flag.label }}</span>
                    <span class="text-muted-foreground ml-auto pl-3 text-xs">
                      {{ stateOf(flag) }}
                    </span>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <template v-if="selected">
            <p class="text-muted-foreground mt-3 text-sm">{{ selected.description }}</p>
            <code class="text-muted-foreground mt-1 block text-[11px]">{{ selected.key }}</code>

            <!-- The global gate -->
            <div class="mt-6 flex items-start gap-4 rounded-xl border p-4">
              <div class="min-w-0 flex-1">
                <p class="font-medium">On for everyone</p>
                <p class="text-muted-foreground text-sm">
                  Overrides the list below — every account has it while this is on.
                </p>
              </div>
              <FlagSwitch
                :model-value="selected.enabled"
                :busy="busy === '__global__'"
                label="On for everyone"
                @update:model-value="setGlobal"
              />
            </div>

            <!-- Per account -->
            <div v-if="selected.globalOnly" class="text-muted-foreground mt-6 rounded-xl border border-dashed p-4 text-sm">
              This flag is read on the sign-in page, before anyone is signed in, so there is no
              account to target. Everyone or nobody.
            </div>

            <template v-else>
              <div class="mt-8 flex flex-wrap items-center gap-3">
                <h2 class="text-sm font-semibold tracking-tight">
                  Accounts
                  <span class="text-muted-foreground font-normal">({{ users.length }})</span>
                </h2>
                <Badge v-if="selected.enabled" variant="secondary">
                  On for everyone — these toggles are the list, not the outcome
                </Badge>
                <div class="flex-1" />
                <Input
                  v-model="filter"
                  type="search"
                  placeholder="Filter by email"
                  class="h-8 max-w-52"
                  aria-label="Filter accounts"
                />
              </div>

              <div class="mt-3 overflow-hidden rounded-xl border">
                <div
                  v-for="(user, i) in shown"
                  :key="user.uid"
                  class="flex items-center gap-3 px-4 py-2.5"
                  :class="i ? 'border-t' : ''"
                >
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm">{{ user.email }}</p>
                    <p class="text-muted-foreground truncate text-xs">
                      {{ user.provider === 'google.com' ? 'Google' : 'Password' }}
                    </p>
                  </div>
                  <span
                    class="text-xs"
                    :class="onFor(selected, user.uid) ? 'text-primary' : 'text-muted-foreground'"
                  >
                    {{ onFor(selected, user.uid) ? 'On' : 'Off' }}
                  </span>
                  <FlagSwitch
                    :model-value="selected.actors.includes(user.uid)"
                    :busy="busy === user.uid"
                    :label="`${selected.label} for ${user.email}`"
                    @update:model-value="(v) => setActor(user.uid, v)"
                  />
                </div>

                <p v-if="!shown.length" class="text-muted-foreground px-4 py-6 text-center text-sm">
                  {{ users.length ? 'No account matches that.' : 'No accounts yet.' }}
                </p>
              </div>

              <p v-if="truncated" class="text-muted-foreground mt-2 text-xs">
                Showing the first 1000 accounts. Paging is not built.
              </p>
            </template>
          </template>

          <p class="text-muted-foreground mt-8 text-xs">
            The root credential lives in the functions environment, not in the database — a row
            that granted access would be a row worth attacking. Every change here is checked
            again on the server before it is written.
          </p>
        </template>
      </div>
    </div>
  </div>
</template>
