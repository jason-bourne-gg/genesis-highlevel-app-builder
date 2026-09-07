import { computed, ref } from 'vue'
import * as flags from '@/services/flags'
import { useAuth } from './useAuth'

// Module scope: one subscription for the whole app, started before sign-in because the
// sign-in page itself is gated on a flag.
const gates = ref<Record<string, flags.FlagGates>>({})
const loaded = ref(false)

flags.watchFlagGates((next) => {
  gates.value = next
  loaded.value = true
})

const { user } = useAuth()

export function useFlags() {
  // A computed off the auth ref, so signing in or out re-resolves every actor-targeted
  // flag with no extra wiring.
  const uid = computed(() => user.value?.id ?? null)

  const on = (key: string) => computed(() => flags.gate(gates.value, key, uid.value))

  return {
    loaded,
    on,
    // Named accessors for the two that exist, so a typo is a compile error rather than
    // a flag that quietly reads false forever.
    writes: on('hl_writes'),
    extendedReads: on('hl_extended_reads'),
    googleLogin: on('google_login'),
  }
}

// The admin UI needs the raw gates as well as the resolved answer.
export function useFlagGates() {
  return { gates, loaded }
}
