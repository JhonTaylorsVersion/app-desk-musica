<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { Loader2 } from 'lucide-vue-next';

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(defineProps<{
  size?: 'sm' | 'default' | 'lg';
  class?: string;
}>(), {
  size: 'default',
});

const attrs = useAttrs();

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'h-4 w-4';
    case 'lg':
      return 'h-8 w-8';
    case 'default':
    default:
      return 'h-4 w-4';
  }
});

const mergedClass = computed(() => [
  'animate-spin',
  sizeClasses.value,
  props.class,
  attrs.class,
]);

const forwardedAttrs = computed(() => {
  const { class: _class, size: _size, ...rest } = attrs;
  return rest;
});
</script>

<template>
  <Loader2
    role="status"
    aria-label="Loading"
    :class="mergedClass"
    v-bind="forwardedAttrs"
  />
</template>
