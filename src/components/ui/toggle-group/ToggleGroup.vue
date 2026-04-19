<script setup lang="ts">
import { provide, computed } from 'vue';

const props = withDefaults(defineProps<{
  modelValue?: string | string[];
  type?: 'single' | 'multiple';
  variant?: 'default' | 'outline';
  disabled?: boolean;
}>(), {
  type: 'single',
  variant: 'default',
  disabled: false
});

const emit = defineEmits<{
  'update:modelValue': [value: string | string[]];
}>();

const selectItem = (value: string) => {
  if (props.disabled) return;
  
  if (props.type === 'single') {
    emit('update:modelValue', value);
  } else {
    const current = Array.isArray(props.modelValue) ? props.modelValue : [];
    if (current.includes(value)) {
      emit('update:modelValue', current.filter(v => v !== value));
    } else {
      emit('update:modelValue', [...current, value]);
    }
  }
};

const isSelected = (value: string) => {
  if (props.type === 'single') {
    return props.modelValue === value;
  }
  return Array.isArray(props.modelValue) && props.modelValue.includes(value);
};

provide('toggleGroup', {
  variant: props.variant,
  disabled: props.disabled,
  selectItem,
  isSelected
});

const classes = computed(() => [
  'flex items-center justify-center gap-1',
  props.disabled && 'opacity-50 pointer-events-none'
]);
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
