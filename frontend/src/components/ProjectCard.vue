<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { Project } from '@/types'
import { relative } from '@/lib/time'

defineProps<{ project: Project }>()
defineEmits<{ remove: [id: string] }>()
</script>

<template>
  <Card class="group hover:border-foreground/20 relative gap-0 py-5 transition-colors">
    <RouterLink :to="`/project/${project.id}`" class="space-y-1 px-5 outline-none">
      <span class="absolute inset-0 rounded-xl" />
      <p class="font-medium tracking-tight">{{ project.name }}</p>
      <p class="text-muted-foreground line-clamp-2 text-sm">{{ project.description }}</p>
    </RouterLink>
    <div class="mt-4 flex items-center justify-between px-5">
      <span class="text-muted-foreground text-xs">Edited {{ relative(project.updatedAt) }}</span>
      <Button
        variant="ghost"
        size="icon"
        class="text-muted-foreground hover:text-destructive relative opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        aria-label="Delete project"
        @click="$emit('remove', project.id)"
      >
        <Trash2Icon />
      </Button>
    </div>
  </Card>
</template>
