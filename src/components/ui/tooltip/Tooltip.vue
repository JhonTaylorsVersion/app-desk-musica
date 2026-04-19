<script setup lang="ts">
import { provide, ref, onBeforeUnmount } from 'vue';

export type TooltipSide = 'top' | 'right' | 'bottom' | 'left';

const props = withDefaults(defineProps<{
  delayDuration?: number;
}>(), {
  delayDuration: 0,
});

const visible = ref(false);
const side = ref<TooltipSide>('top');
let timer: ReturnType<typeof setTimeout> | null = null;

const clearTimer = () => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
};

const show = () => {
  clearTimer();
  timer = setTimeout(() => {
    visible.value = true;
  }, props.delayDuration);
};

const hide = () => {
  clearTimer();
  visible.value = false;
};

const setSide = (value: TooltipSide) => {
  side.value = value;
};

provide('tooltipContext', {
  visible,
  side,
  show,
  hide,
  setSide,
});

onBeforeUnmount(() => {
  clearTimer();
});
</script>

<template>
  <div class="relative inline-flex">
    <slot />
  </div>
</template>
