<script setup lang="ts">
import { inject, computed } from 'vue';

const props = defineProps<{
  value: string;
  disabled?: boolean;
}>();

const context = inject<{
  variant: 'default' | 'outline';
  disabled: boolean;
  selectItem: (value: string) => void;
  isSelected: (value: string) => boolean;
}>('toggleGroup');

if (!context) {
  throw new Error('ToggleGroupItem must be used within a ToggleGroup');
}

const active = computed(() => context.isSelected(props.value));
const isDisabled = computed(() => props.disabled || context.disabled);

const variants = {
  default: 'hover:bg-muted hover:text-muted-foreground',
  outline: 'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground',
};

const activeVariants = {
  default: 'bg-accent text-accent-foreground',
  outline: 'bg-accent text-accent-foreground border-primary/50',
};

const classes = computed(() => [
  'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-9 px-3',
  active.value ? activeVariants[context.variant] : variants[context.variant],
  active.value && 'shadow-sm z-10'
]);
</script>

<template>
  <button
    type="button"
    :class="classes"
    :disabled="isDisabled"
    @click="context.selectItem(value)"
  >
    <slot />
  </button>
</template>
