import { ref, watch } from 'vue'
import type { FailMode } from '@/mocks/generation'
import { read, write } from '@/mocks/storage'

// ?dev=1 turns the failure controls on and keeps them on until ?dev=0.
const flag = new URLSearchParams(window.location.search).get('dev')
const enabled = ref(flag === null ? read('dev', false) : flag !== '0')
const failMode = ref<FailMode>('none')

watch(enabled, (on) => write('dev', on), { immediate: true })

export function useDev() {
  return { enabled, failMode }
}
