<script setup lang="ts">
import { computed, inject, watchEffect } from 'vue';
import type { TooltipSide } from './Tooltip.vue';

const props = withDefaults(defineProps<{
  side?: TooltipSide;
  sideOffset?: number;
}>(), {
  side: 'top',
  sideOffset: 0,
});

const context = inject<any>('tooltipContext');

watchEffect(() => {
  context?.setSide?.(props.side);
});

const sideClasses = computed(() => {
  const offset = props.sideOffset ?? 0;
  switch (props.side) {
    case 'right':
      return {
        transform: `translate(calc(100% + ${offset}px), -50%)`,
        top: '50%',
        left: '0',
      };
    case 'bottom':
      return {
        transform: `translate(-50%, calc(100% + ${offset}px))`,
        left: '50%',
        top: '0',
      };
    case 'left':
      return {
        transform: `translate(calc(-100% - ${offset}px), -50%)`,
        top: '50%',
        left: '0',
      };
    case 'top':
    default:
      return {
        transform: `translate(-50%, calc(-100% - ${offset}px))`,
        left: '50%',
        top: '0',
      };
  }
});
</script>

<template>
  <Transition
    enter-active-class="transition ease-out duration-150"
    enter-from-class="opacity-0 scale-95"
    enter-to-class="opacity-100 scale-100"
    leave-active-class="transition ease-in duration-100"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-95"
  >
    <div
      v-if="context?.visible?.value"
      class="absolute z-50 w-fit rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md pointer-events-none whitespace-nowrap"
      :style="sideClasses"
    >
      <slot />
    </div>
  </Transition>
</template>
