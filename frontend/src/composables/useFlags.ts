import { computed, ref } from 'vue'
import * as flags from '@/services/flags'
import { useAuth } from './useAuth'

// One subscription for the whole app, started before sign-in: that page is flagged too.
const gates = ref<Record<string, flags.FlagGates>>({})
const loaded = ref(false)

flags.watchFlagGates((next) => {
  gates.value = next
  loaded.value = true
})

const { user } = useAuth()

export function useFlags() {
  const uid = computed(() => user.value?.id ?? null)

  const on = (key: string) => computed(() => flags.gate(gates.value, key, uid.value))

  return {
    loaded,
    on,
    // Named, so a typo is a compile error rather than a flag that reads false forever.
    writes: on('hl_writes'),
    extendedReads: on('hl_extended_reads'),
    googleLogin: on('google_login'),
  }
}

// The admin UI needs the raw gates as well as the resolved answer.
export function useFlagGates() {
  return { gates, loaded }
}
