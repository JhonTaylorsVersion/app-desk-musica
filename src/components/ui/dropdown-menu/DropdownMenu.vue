<script setup lang="ts">
import { ref, provide, onMounted, onUnmounted } from 'vue';

const isOpen = ref(false);
const containerRef = ref<HTMLElement | null>(null);

const toggle = () => {
  isOpen.value = !isOpen.value;
};

const close = () => {
  isOpen.value = false;
};

provide('dropdownContext', {
  isOpen,
  toggle,
  close
});

const handleClickOutside = (event: MouseEvent) => {
  if (containerRef.value && !containerRef.value.contains(event.target as Node)) {
    close();
  }
};

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside);
});
</script>

<template>
  <div ref="containerRef" class="relative inline-block w-full">
    <slot />
  </div>
</template>
