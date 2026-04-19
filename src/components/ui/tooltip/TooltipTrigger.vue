<script setup lang="ts">
import { inject } from 'vue';

defineProps<{
  asChild?: boolean;
}>();

const context = inject<any>('tooltipContext');
</script>

<template>
  <span
    class="inline-flex"
    @mouseenter="context?.show?.()"
    @mouseleave="context?.hide?.()"
    @focusin="context?.show?.()"
    @focusout="context?.hide?.()"
  >
    <slot />
  </span>
</template>
