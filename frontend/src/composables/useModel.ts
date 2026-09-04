import { computed, ref, watch } from 'vue'
import { read, write } from '@/lib/local'

export interface ModelOption {
  id: string
  label: string
  blurb: string
  // Relative running cost, for the picker. Not a price quote.
  cost: string
}

// Labels only; ALLOWED_MODELS in functions/src/generate/models.ts is what actually decides.
export const MODELS: ModelOption[] = [
  {
    id: 'claude-opus-5',
    label: 'Opus 5',
    blurb: 'Best code. Slowest, and the most expensive to run.',
    cost: '$$$',
  },
  {
    id: 'claude-sonnet-5',
    label: 'Sonnet 5',
    blurb: 'The sensible default. Good code at a fifth of the cost.',
    cost: '$$',
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku 4.5',
    blurb: 'Fastest and cheapest. Simpler apps, less polish.',
    cost: '$',
  },
]

const DEFAULT = 'claude-sonnet-5'

// A preference of the person, not the project, so it lives in localStorage.
const stored = read('model', DEFAULT)
const model = ref(MODELS.some((m) => m.id === stored) ? stored : DEFAULT)

watch(model, (id) => write('model', id), { immediate: true })

export function useModel() {
  const selected = computed(() => MODELS.find((m) => m.id === model.value) ?? MODELS[1])
  return { model, selected, models: MODELS }
}
