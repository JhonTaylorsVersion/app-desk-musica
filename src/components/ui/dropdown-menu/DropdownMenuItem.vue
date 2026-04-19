<script setup lang="ts">
import { inject } from 'vue';
import { cn } from '@/modules/spotiflac/utils/utils';

const props = defineProps<{
  class?: string;
}>();

const context = inject<any>('dropdownContext');

const handleClick = () => {
  context?.close();
};
</script>

<template>
  <div
    @click="handleClick"
    :class="cn(
      'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-accent hover:text-accent-foreground cursor-pointer',
      props.class
    )"
  >
    <slot />
  </div>
</template>
