<script setup lang="ts">
defineProps<{
  orientation?: 'horizontal' | 'vertical';
  class?: string;
}>();
</script>

<template>
  <div
    :class="[
      'shrink-0 bg-border',
      orientation === 'vertical' ? 'h-full w-[1px]' : 'h-[1px] w-full',
      $props.class
    ]"
  />
</template>
