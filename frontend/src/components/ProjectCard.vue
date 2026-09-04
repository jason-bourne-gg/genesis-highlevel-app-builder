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
  <Card
    class="group hover:border-primary/40 focus-within:border-primary/50 focus-within:ring-ring/40 relative gap-0 overflow-hidden py-5 transition-colors focus-within:ring-[3px]"
  >
    <!-- Accent rail: the card's only colour until it is hovered. -->
    <span
      class="from-primary to-highlight absolute inset-y-0 left-0 w-0.5 bg-linear-to-b opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
    />
    <RouterLink :to="`/project/${project.id}`" class="space-y-1 px-5 outline-none">
      <span class="absolute inset-0 rounded-xl" />
      <p class="group-hover:text-primary font-medium tracking-tight transition-colors">
        {{ project.name }}
      </p>
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
