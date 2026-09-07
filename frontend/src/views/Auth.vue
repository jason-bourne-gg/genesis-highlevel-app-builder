<script setup lang="ts">
import { h, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ChevronRightIcon, LoaderCircleIcon, SparklesIcon } from '@lucide/vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/composables/useAuth'
import { useFlags } from '@/composables/useFlags'

const props = defineProps<{ mode: 'signin' | 'signup' }>()

// Inlined rather than pulled from an icon set: Google's mark is four fixed colours and
// must not be recoloured to match the theme.
const GoogleMark = () =>
  h('svg', { viewBox: '0 0 18 18', class: 'size-4', 'aria-hidden': 'true' }, [
    h('path', { fill: '#4285F4', d: 'M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z' }),
    h('path', { fill: '#34A853', d: 'M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z' }),
    h('path', { fill: '#FBBC05', d: 'M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z' }),
    h('path', { fill: '#EA4335', d: 'M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z' }),
  ])

const router = useRouter()
const { pending, signIn, signUp, signInWithGoogle } = useAuth()
const { googleLogin } = useFlags()

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

async function google() {
  errors.value = {}
  try {
    await signInWithGoogle()
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

        <template v-if="googleLogin">
          <Button type="button" variant="outline" class="w-full" :disabled="pending" @click="google">
            <GoogleMark />
            Continue with Google
          </Button>
          <div class="flex items-center gap-3">
            <span class="bg-border h-px flex-1" />
            <span class="text-muted-foreground text-xs">or</span>
            <span class="bg-border h-px flex-1" />
          </div>
        </template>

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
