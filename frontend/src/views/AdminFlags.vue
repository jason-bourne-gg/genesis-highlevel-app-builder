<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ArrowLeftIcon,
  LoaderCircleIcon,
  LockIcon,
  ShieldIcon,
  UserPlusIcon,
  XIcon,
} from '@lucide/vue'
import { toast } from 'vue-sonner'
import ThemeToggle from '@/components/ThemeToggle.vue'
import UserMenu from '@/components/UserMenu.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { loadAdminFlags, lock, patchFlag, unlock, unlocked } from '@/services/flags'
import { relative } from '@/lib/time'
import type { FlagState } from '@/types'

const flags = ref<FlagState[]>([])
const labels = ref<Record<string, string>>({})
const open = ref(false)
const loading = ref(true)
const busy = ref<string | null>(null)
const drafts = ref<Record<string, string>>({})

// The unlock form
const username = ref('')
const password = ref('')
const unlocking = ref(false)
const unlockError = ref('')

async function load() {
  loading.value = true
  try {
    const view = await loadAdminFlags()
    open.value = view.root
    flags.value = view.flags
    labels.value = view.labels ?? {}
  } catch (e) {
    // A signed-in account with no pass is the normal case, not an error worth a toast.
    open.value = false
    if (unlocked()) toast.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

// Anyone signed in can open this page; the flags stay hidden until the credential lands.
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
  labels.value = {}
}

// One call site for every change, so the server's copy of the flag is what replaces the
// row rather than a locally guessed one.
async function change(key: string, patch: Record<string, unknown>) {
  busy.value = key
  try {
    const { flag, labels: fresh } = await patchFlag(key, patch)
    flags.value = flags.value.map((f) => (f.key === key ? flag : f))
    labels.value = { ...labels.value, ...fresh }
    return true
  } catch (e) {
    toast.error((e as Error).message)
    return false
  } finally {
    busy.value = null
  }
}

async function addActor(flag: FlagState) {
  const email = (drafts.value[flag.key] ?? '').trim()
  if (!email) return
  if (await change(flag.key, { addActor: email })) {
    drafts.value[flag.key] = ''
    toast.success(`${flag.label} is on for ${email}`)
  }
}

const stateOf = (flag: FlagState) =>
  flag.enabled
    ? 'On for everyone'
    : flag.actors.length
      ? `${flag.actors.length} account${flag.actors.length > 1 ? 's' : ''}`
      : 'Off'
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
      <div class="mx-auto max-w-3xl px-6 py-10">
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
          <div class="space-y-1.5">
            <h1 class="text-2xl font-semibold tracking-tight">Feature flags</h1>
            <p class="text-muted-foreground max-w-xl text-sm">
              A flag is on for someone if it is on for everyone, or if their account is on its
              list. Changes take effect immediately, in every open tab.
            </p>
          </div>

          <div class="mt-8 space-y-4">
            <div v-for="flag in flags" :key="flag.key" class="rounded-xl border p-5">
              <div class="flex items-start gap-4">
                <div class="min-w-0 flex-1 space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="font-medium tracking-tight">{{ flag.label }}</h2>
                    <Badge :variant="flag.enabled ? 'default' : 'secondary'">
                      {{ stateOf(flag) }}
                    </Badge>
                    <code class="text-muted-foreground text-[11px]">{{ flag.key }}</code>
                  </div>
                  <p class="text-muted-foreground text-sm">{{ flag.description }}</p>
                </div>

                <Button
                  size="sm"
                  :variant="flag.enabled ? 'outline' : 'default'"
                  :disabled="busy === flag.key"
                  @click="change(flag.key, { enabled: !flag.enabled })"
                >
                  <LoaderCircleIcon v-if="busy === flag.key" class="animate-spin" />
                  {{ flag.enabled ? 'Turn off for everyone' : 'Turn on for everyone' }}
                </Button>
              </div>

              <div v-if="flag.globalOnly" class="text-muted-foreground mt-4 border-t pt-4 text-xs">
                This one is read on the sign-in page, before anyone is signed in, so there is no
                account to target. Everyone or nobody.
              </div>

              <div v-else class="mt-4 space-y-3 border-t pt-4">
                <p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  On for these accounts
                </p>

                <div v-if="flag.actors.length" class="flex flex-wrap gap-2">
                  <span
                    v-for="uid in flag.actors"
                    :key="uid"
                    class="bg-muted flex items-center gap-1.5 rounded-full py-1 pr-1 pl-3 text-xs"
                  >
                    {{ labels[uid] ?? uid }}
                    <button
                      class="hover:bg-background rounded-full p-0.5"
                      :aria-label="`Remove ${labels[uid] ?? uid}`"
                      :disabled="busy === flag.key"
                      @click="change(flag.key, { removeActor: uid })"
                    >
                      <XIcon class="size-3" />
                    </button>
                  </span>
                </div>
                <p v-else class="text-muted-foreground text-sm">
                  Nobody yet. Add an email to turn this on for one account without turning it on
                  for everyone.
                </p>

                <form class="flex gap-2" @submit.prevent="addActor(flag)">
                  <Input
                    v-model="drafts[flag.key]"
                    type="email"
                    placeholder="someone@example.com"
                    class="max-w-xs"
                    :aria-label="`Add an account to ${flag.label}`"
                  />
                  <Button type="submit" variant="outline" size="sm" :disabled="busy === flag.key">
                    <UserPlusIcon />
                    Add
                  </Button>
                </form>
              </div>

              <p v-if="flag.updatedAt" class="text-muted-foreground mt-4 text-xs">
                Changed {{ relative(flag.updatedAt) }}<template v-if="flag.updatedBy"> by {{ flag.updatedBy }}</template>
              </p>
            </div>
          </div>

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
