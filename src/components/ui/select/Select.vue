<script setup lang="ts">
import { ref, provide, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps<{
  modelValue?: string | number;
}>();

const emit = defineEmits(['update:modelValue']);

const isOpen = ref(false);
const rootEl = ref<HTMLElement | null>(null);

const select = (value: string | number) => {
  emit('update:modelValue', value);
  isOpen.value = false;
};

provide('selectContext', {
  modelValue: props,
  select,
  isOpen
});

const toggle = () => {
  isOpen.value = !isOpen.value;
};

const handleDocumentPointerDown = (event: MouseEvent | PointerEvent) => {
  const target = event.target as Node | null;
  if (!rootEl.value || !target) return;
  if (!rootEl.value.contains(target)) {
    isOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
});
</script>

<template>
  <div ref="rootEl" class="relative w-full">
    <slot :toggle="toggle" :isOpen="isOpen" />
  </div>
</template>
