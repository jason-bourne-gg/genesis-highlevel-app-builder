<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ChevronRightIcon, LoaderCircleIcon, SparklesIcon } from '@lucide/vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/composables/useAuth'

const props = defineProps<{ mode: 'signin' | 'signup' }>()

const router = useRouter()
const { pending, signIn, signUp } = useAuth()

const email = ref('')
const password = ref('')
const confirm = ref('')
const errors = ref<Record<string, string>>({})

const steps = ['Sign in', 'Connect HighLevel', 'Describe your app']

watch(
  () => props.mode,
  () => {
    errors.value = {}
    confirm.value = ''
  },
)

// Firebase enforces both of these, but catching them here saves a round trip and
// a rate-limited attempt.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 6

async function submit() {
  const found: Record<string, string> = {}
  const address = email.value.trim()

  if (!address) found.email = 'Enter your email'
  else if (!LOOKS_LIKE_EMAIL.test(address)) found.email = "That email address doesn't look right"

  if (!password.value) found.password = 'Enter a password'
  else if (props.mode === 'signup' && password.value.length < MIN_PASSWORD) {
    found.password = `Use at least ${MIN_PASSWORD} characters`
  }

  if (props.mode === 'signup' && !confirm.value) found.confirm = 'Confirm your password'
  else if (props.mode === 'signup' && confirm.value !== password.value) {
    found.confirm = 'Passwords do not match'
  }

  errors.value = found
  if (Object.keys(found).length) return

  const run = props.mode === 'signin' ? signIn : signUp
  try {
    await run(address, password.value)
    router.push({ name: 'dashboard' })
  } catch (e) {
    errors.value = { form: (e as Error).message }
  }
}
</script>

<template>
  <div class="grid min-h-full lg:grid-cols-2">
    <div class="brand-wash relative hidden flex-col justify-between border-r p-12 lg:flex">
      <div class="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <span
          class="from-primary to-highlight text-primary-foreground grid size-8 place-items-center rounded-lg bg-linear-to-br shadow-sm"
        >
          <SparklesIcon class="size-4.5" />
        </span>
        Genesis
      </div>
      <div class="max-w-md space-y-4">
        <p class="text-3xl leading-tight font-medium tracking-tight text-balance">
          Describe the app.
          <span class="brand-text font-semibold">Watch it get written.</span>
        </p>
        <p class="text-muted-foreground text-sm">
          Genesis builds small internal tools straight onto your HighLevel location — contacts,
          conversations and calendars, no glue code.
        </p>
      </div>
      <ol class="text-muted-foreground flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
        <li v-for="(step, i) in steps" :key="step" class="flex items-center gap-2.5">
          <ChevronRightIcon v-if="i" class="size-3 opacity-40" />
          {{ step }}
        </li>
      </ol>
    </div>

    <div class="relative flex items-center justify-center p-6">
      <div class="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <form class="w-full max-w-sm space-y-6" novalidate @submit.prevent="submit">
        <div class="space-y-1.5">
          <span
            class="from-primary to-highlight text-primary-foreground mb-4 grid size-9 place-items-center rounded-xl bg-linear-to-br shadow-sm lg:hidden"
          >
            <SparklesIcon class="size-5" />
          </span>
          <h1 class="text-2xl font-semibold tracking-tight">
            {{ mode === 'signin' ? 'Sign in' : 'Create an account' }}
          </h1>
          <p class="text-muted-foreground text-sm">
            {{
              mode === 'signin'
                ? 'Welcome back.'
                : 'Six characters or more for the password.'
            }}
          </p>
        </div>

        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="email">Email</Label>
            <Input id="email" v-model="email" type="email" placeholder="you@clinic.com" autocomplete="email" />
            <p v-if="errors.email" class="text-destructive text-xs">{{ errors.email }}</p>
          </div>

          <div class="space-y-2">
            <Label for="password">Password</Label>
            <Input
              id="password"
              v-model="password"
              type="password"
              :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'"
            />
            <p v-if="errors.password" class="text-destructive text-xs">{{ errors.password }}</p>
          </div>

          <div v-if="mode === 'signup'" class="space-y-2">
            <Label for="confirm">Confirm password</Label>
            <Input id="confirm" v-model="confirm" type="password" autocomplete="new-password" />
            <p v-if="errors.confirm" class="text-destructive text-xs">{{ errors.confirm }}</p>
          </div>
        </div>

        <p v-if="errors.form" class="text-destructive text-sm">{{ errors.form }}</p>

        <Button type="submit" class="w-full" :disabled="pending">
          <LoaderCircleIcon v-if="pending" class="animate-spin" />
          {{ mode === 'signin' ? 'Sign in' : 'Create account' }}
        </Button>

        <p class="text-muted-foreground text-center text-sm">
          <template v-if="mode === 'signin'">
            No account?
            <RouterLink to="/signup" class="text-primary font-medium underline-offset-4 hover:underline">
              Sign up
            </RouterLink>
          </template>
          <template v-else>
            Already have one?
            <RouterLink to="/signin" class="text-primary font-medium underline-offset-4 hover:underline">
              Sign in
            </RouterLink>
          </template>
        </p>
      </form>
    </div>
  </div>
</template>
