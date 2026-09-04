<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { VueMonacoEditor, type MonacoEditor as Monaco } from '@guolao/vue-monaco-editor'
import type { editor } from 'monaco-editor'
import { XIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import FileTree from './FileTree.vue'
import { languageFor } from '@/lib/preview'
import { useGeneration } from '@/composables/useGeneration'
import { useTheme } from '@/composables/useTheme'
import { useWorkspace } from '@/composables/useWorkspace'

const props = defineProps<{ projectId: string }>()

const { files, revision, writeFile, saveFile } = useWorkspace(props.projectId)
const { generating, streamingPath } = useGeneration(props.projectId)
const { resolved } = useTheme()

// Monaco ships its own themes; follow whichever one the app resolved to.
const editorTheme = computed(() => (resolved.value === 'dark' ? 'vs-dark' : 'vs'))

const tabs = ref<string[]>([])
const active = ref<string | null>(null)
const drafts = ref<Record<string, string>>({})

const monacoReady = ref(false)
import('@/lib/monaco').then(() => (monacoReady.value = true))

let instance: editor.IStandaloneCodeEditor | null = null

const contentOf = (path: string) => files.value.find((f) => f.path === path)?.content ?? ''

const value = computed(() => {
  if (!active.value) return ''
  return drafts.value[active.value] ?? contentOf(active.value)
})

const language = computed(() => (active.value ? languageFor(active.value) : 'plaintext'))

const isDirty = (path: string) =>
  drafts.value[path] !== undefined && drafts.value[path] !== contentOf(path)

function forget(path: string) {
  if (!(path in drafts.value)) return
  const rest = { ...drafts.value }
  delete rest[path]
  drafts.value = rest
}

function open(path: string) {
  if (!tabs.value.includes(path)) tabs.value = [...tabs.value, path]
  active.value = path
}

function close(path: string) {
  const index = tabs.value.indexOf(path)
  tabs.value = tabs.value.filter((p) => p !== path)
  forget(path)
  if (active.value === path) active.value = tabs.value[Math.max(0, index - 1)] ?? null
}

function onChange(next: string | undefined) {
  if (!active.value || generating.value) return
  drafts.value = { ...drafts.value, [active.value]: next ?? '' }
}

async function save() {
  const path = active.value
  if (!path || generating.value || !isDirty(path)) return

  const edited = drafts.value[path]
  writeFile(path, edited)
  forget(path)
  try {
    await saveFile(path)
    toast.success(`Saved ${path}`)
  } catch (e) {
    // Put the edit back in the draft so a failed write never looks like a saved one.
    drafts.value = { ...drafts.value, [path]: edited }
    toast.error(`Could not save ${path}: ${(e as Error).message}`)
  }
}

function onMountEditor(ed: editor.IStandaloneCodeEditor, monaco: Monaco) {
  instance = ed
  ed.updateOptions({ readOnly: generating.value })
  ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, save)
}

function onWindowKeydown(event: KeyboardEvent) {
  if (event.key !== 's' || !(event.metaKey || event.ctrlKey)) return
  event.preventDefault()
  save()
}

watch(streamingPath, (path) => {
  if (!path) return
  forget(path)
  open(path)
})

watch(generating, (busy) => instance?.updateOptions({ readOnly: busy }))

// Runs after the editor component has pushed the new text, so the view follows the writer.
watch(
  value,
  () => {
    if (!generating.value || !instance) return
    instance.setScrollTop(instance.getScrollHeight())
  },
  { flush: 'post' },
)

watch(revision, () => {
  tabs.value = tabs.value.filter((path) => files.value.some((f) => f.path === path))
  if (active.value && !tabs.value.includes(active.value)) active.value = tabs.value[0] ?? null
  if (!active.value && files.value.length) open(files.value[0].path)
})

onMounted(() => window.addEventListener('keydown', onWindowKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown))
</script>

<template>
  <div class="flex h-full">
    <FileTree :files="files" :active="active" :streaming="streamingPath" @pick="open" />

    <div class="flex min-w-0 flex-1 flex-col">
      <div class="bg-muted/40 flex h-9 shrink-0 items-stretch overflow-x-auto border-b">
        <div
          v-for="tab in tabs"
          :key="tab"
          class="relative flex shrink-0 items-center gap-1.5 border-r pr-1 pl-3 text-[13px] transition-colors"
          :class="
            active === tab
              ? 'bg-accent/60 text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
        >
          <!-- The active tab is the one accent that stays lit in the editor. -->
          <span
            v-if="active === tab"
            class="from-primary to-highlight absolute inset-x-0 top-0 h-0.5 bg-linear-to-r"
          />
          <button class="py-1 outline-none" @click="active = tab">
            {{ tab }}
            <span v-if="isDirty(tab)" class="text-primary ml-1">&bull;</span>
          </button>
          <span
            class="hover:bg-accent grid size-5 cursor-pointer place-items-center rounded"
            role="button"
            :aria-label="`Close ${tab}`"
            @click="close(tab)"
          >
            <XIcon class="size-3" />
          </span>
        </div>
      </div>

      <div class="min-h-0 flex-1">
        <VueMonacoEditor
          v-if="active && monacoReady"
          :value="value"
          :language="language"
          :theme="editorTheme"
          :options="{
            fontSize: 12.5,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            automaticLayout: true,
            tabSize: 2,
            renderLineHighlight: 'none',
            stickyScroll: { enabled: false },
            padding: { top: 12 },
          }"
          @change="onChange"
          @mount="onMountEditor"
        />
        <div
          v-else
          class="text-muted-foreground grid h-full place-items-center px-6 text-center text-sm"
        >
          {{ files.length ? 'Pick a file to open it.' : 'Files show up here as they are written.' }}
        </div>
      </div>
    </div>
  </div>
</template>
