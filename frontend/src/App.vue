<script setup lang="ts">
import { RouterView } from 'vue-router'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useTheme } from '@/composables/useTheme'

// Touching the singleton here guarantees the theme is applied and the
// prefers-color-scheme listener is attached on every route, including the auth
// screens, which have no UserMenu of their own.
const { resolved } = useTheme()
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <RouterView />
  </TooltipProvider>
  <Toaster position="bottom-right" :theme="resolved" />
</template>
