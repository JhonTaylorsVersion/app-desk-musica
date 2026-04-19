<script setup lang="ts">
import { inject } from 'vue';

const context = inject<any>('dropdownContext');

const handleClick = () => {
  context?.toggle();
};
</script>

<template>
  <div @click="handleClick" class="inline-flex w-full cursor-pointer h-full items-center justify-center">
    <slot />
  </div>
</template>
