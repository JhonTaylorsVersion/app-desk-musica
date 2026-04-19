<script setup lang="ts">
const props = defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
}>();

const close = () => {
  emit('update:open', false);
};
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
    <div @click="close" class="absolute inset-0"></div>
    <slot />
  </div>
</template>
