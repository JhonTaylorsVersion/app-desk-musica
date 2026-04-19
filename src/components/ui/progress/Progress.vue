<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  value?: number;
}>(), {
  value: 0
});

const percent = computed(() => Math.max(0, Math.min(100, props.value)));
</script>

<template>
  <div class="relative h-4 w-full overflow-hidden rounded-full bg-secondary">
    <div
      class="h-full w-full flex-1 bg-primary transition-all duration-300 ease-in-out"
      :style="{ transform: `translateX(-${100 - percent}%)` }"
    ></div>
  </div>
</template>
