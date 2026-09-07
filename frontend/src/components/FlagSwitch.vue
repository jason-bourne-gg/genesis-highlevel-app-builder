<script setup lang="ts">
// shadcn-vue's switch is not installed, and this is smaller than adding it.
const props = defineProps<{
  modelValue: boolean
  disabled?: boolean
  busy?: boolean
  label: string
}>()

const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label"
    :disabled="disabled || busy"
    class="focus-visible:ring-ring relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    :class="modelValue ? 'bg-primary' : 'bg-input'"
    @click="emit('update:modelValue', !props.modelValue)"
  >
    <span
      class="bg-background pointer-events-none block size-4 rounded-full shadow-sm transition-transform"
      :class="modelValue ? 'translate-x-4.5' : 'translate-x-0.5'"
    />
  </button>
</template>
