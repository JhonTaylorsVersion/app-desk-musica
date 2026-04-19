<script setup lang="ts">
import { inject, computed } from 'vue';

const props = defineProps<{
  value: string | number;
}>();

const context = inject<any>('selectContext');

const isSelected = computed(() => context?.modelValue?.modelValue === props.value);

const handleSelect = () => {
  context?.select?.(props.value);
};
</script>

<template>
  <div 
    @click="handleSelect"
    :class="[
      'relative flex w-full cursor-default select-none items-center gap-1 rounded-sm py-1.5 pl-2 pr-8 text-sm whitespace-nowrap outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      isSelected ? 'bg-accent text-accent-foreground font-medium' : '',
      $attrs.class
    ]"
  >
    <span class="flex h-3.5 w-3.5 items-center justify-center absolute right-2" v-if="isSelected">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><polyline points="20 6 9 17 4 12"/></svg>
    </span>
    <slot />
  </div>
</template>
