<script setup lang="ts">
import { inject } from 'vue';
import { cn } from '@/modules/spotiflac/utils/utils';

const props = defineProps<{
  class?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}>();

const context = inject<any>('dropdownContext');

const positionClasses = {
  right: 'left-full top-0 ml-2',
  left: 'right-full top-0 mr-2',
  top: 'bottom-full left-0 mb-2',
  bottom: 'top-full left-0 mt-2'
};
</script>

<template>
  <Transition
    enter-active-class="transition ease-out duration-100"
    enter-from-class="transform opacity-0 scale-95"
    enter-to-class="transform opacity-100 scale-100"
    leave-active-class="transition ease-in duration-75"
    leave-from-class="transform opacity-100 scale-100"
    leave-to-class="transform opacity-0 scale-95"
  >
    <div
      v-if="context?.isOpen.value"
      :class="cn(
        'absolute z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
        positionClasses[props.side || 'bottom'],
        props.class
      )"
    >
      <slot />
    </div>
  </Transition>
</template>
