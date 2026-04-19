<script setup lang="ts">
import { X } from 'lucide-vue-next';

const emit = defineEmits(['close']);
</script>

<template>
  <div class="relative z-50 w-full max-w-lg scale-100 border bg-background p-6 shadow-lg sm:rounded-lg animate-in zoom-in-95 duration-200">
    <slot />
    <button
      @click="emit('close')"
      class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      <X class="h-4 w-4" />
      <span class="sr-only">Close</span>
    </button>
  </div>
</template>
