<script setup lang="ts">
const props = defineProps<{
  class?: string;
}>();
</script>

<template>
  <div :class="['flex items-center p-6 pt-0', props.class]">
    <slot />
  </div>
</template>
