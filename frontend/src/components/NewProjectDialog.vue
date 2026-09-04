<script setup lang="ts">
import { ref, watch } from 'vue'
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

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ create: [name: string, description: string] }>()

const props = defineProps<{ pending: boolean }>()

const name = ref('')
const description = ref('')
const error = ref('')

watch(open, (isOpen) => {
  if (isOpen) return
  name.value = ''
  description.value = ''
  error.value = ''
})

function submit() {
  if (!name.value.trim()) {
    error.value = 'Give the project a name'
    return
  }
  error.value = ''
  emit('create', name.value.trim(), description.value.trim())
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <form class="space-y-6" novalidate @submit.prevent="submit">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Name it and say roughly what it should do. You can refine it in chat afterwards.
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
            Create project
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
