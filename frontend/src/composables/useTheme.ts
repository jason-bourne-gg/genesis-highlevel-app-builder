import { computed, ref, watch } from 'vue'
import { read, write } from '@/lib/local'

export type ThemeSetting = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

// Kept in sync, byte for byte, with the pre-paint script in index.html. If the
// key or the encoding changes here it has to change there too, or the first
// frame will disagree with the app.
const KEY = 'theme'

const settings: ThemeSetting[] = ['light', 'dark', 'system']

function sanitise(value: unknown): ThemeSetting {
  return settings.includes(value as ThemeSetting) ? (value as ThemeSetting) : 'system'
}

const query =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

// Module level, so every component that reads the theme reads the same ref.
const theme = ref<ThemeSetting>(sanitise(read<ThemeSetting>(KEY, 'system')))
const systemDark = ref(query?.matches ?? false)

// The OS can flip while the app is open — follow it live rather than only at boot.
query?.addEventListener('change', (event) => {
  systemDark.value = event.matches
})

const resolved = computed<ResolvedTheme>(() =>
  theme.value === 'system' ? (systemDark.value ? 'dark' : 'light') : theme.value,
)

watch(
  resolved,
  (mode) => {
    const root = document.documentElement
    root.classList.toggle('dark', mode === 'dark')
    // The pre-paint script in index.html sets this inline too; keep the two in
    // step so form controls and scrollbars follow a live toggle.
    root.style.colorScheme = mode
  },
  { immediate: true },
)

watch(theme, (value) => write(KEY, value))

export function useTheme() {
  return { theme, resolved, settings }
}
