<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LoaderCircleIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Project } from '@/types'

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ submit: [name: string, description: string] }>()

// One dialog for both, so the name rules cannot drift between creating and editing.
const props = defineProps<{ pending: boolean; project?: Project | null }>()

const name = ref('')
const description = ref('')
const error = ref('')

const editing = computed(() => Boolean(props.project))

watch(open, (isOpen) => {
  error.value = ''
  name.value = isOpen ? (props.project?.name ?? '') : ''
  description.value = isOpen ? (props.project?.description ?? '') : ''
})

const MAX_NAME = 60

function submit() {
  const trimmed = name.value.trim()
  if (!trimmed) {
    error.value = 'Give the project a name'
    return
  }
  if (trimmed.length > MAX_NAME) {
    error.value = `Keep the name under ${MAX_NAME} characters`
    return
  }
  error.value = ''
  emit('submit', trimmed, description.value.trim())
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <form class="space-y-6" novalidate @submit.prevent="submit">
        <DialogHeader>
          <DialogTitle>{{ editing ? 'Edit project' : 'New project' }}</DialogTitle>
          <DialogDescription>
            {{
              editing
                ? 'Renaming changes nothing the model has already written.'
                : 'Name it and say roughly what it should do. You can refine it in chat afterwards.'
            }}
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="project-name">Name</Label>
            <Input id="project-name" v-model="name" placeholder="Recall Chaser" autofocus />
            <p v-if="error" class="text-destructive text-xs">{{ error }}</p>
          </div>
          <div class="space-y-2">
            <Label for="project-description">Description</Label>
            <Textarea
              id="project-description"
              v-model="description"
              rows="3"
              placeholder="Lists patients due for a recall and lets the front desk text them."
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="props.pending">
            <LoaderCircleIcon v-if="props.pending" class="animate-spin" />
            {{ editing ? 'Save changes' : 'Create project' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
