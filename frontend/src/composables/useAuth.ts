import { computed, ref } from 'vue'
import type { User } from '@/types'
import * as auth from '@/services/auth'

const user = ref<User | null>(null)
const pending = ref(false)

auth.watch((next) => {
  user.value = next
})

export const authReady = auth.ready

export function useAuth() {
  const signedIn = computed(() => user.value !== null)
  const isRoot = computed(() => user.value?.root === true)

  // One entry point for both: an identifier without an @ is a root username.
  async function signIn(identifier: string, password: string) {
    pending.value = true
    try {
      user.value = auth.looksLikeUsername(identifier)
        ? await auth.signInAsRoot(identifier, password)
        : await auth.signIn(identifier, password)
    } finally {
      pending.value = false
    }
  }

  async function signUp(email: string, password: string) {
    pending.value = true
    try {
      user.value = await auth.signUp(email, password)
    } finally {
      pending.value = false
    }
  }

  async function signInWithGoogle() {
    pending.value = true
    try {
      user.value = await auth.signInWithGoogle()
    } finally {
      pending.value = false
    }
  }

  async function signOut() {
    await auth.signOut()
    user.value = null
  }

  return { user, pending, signedIn, isRoot, signIn, signUp, signInWithGoogle, signOut }
}
