import { ref, watch } from 'vue'
import { read, write } from '@/lib/local'

// ?dev=1 turns the dev controls on and keeps them on until ?dev=0.
const flag = new URLSearchParams(window.location.search).get('dev')
const enabled = ref(flag === null ? read('dev', false) : flag !== '0')

watch(enabled, (on) => write('dev', on), { immediate: true })

export function useDev() {
  return { enabled }
}
