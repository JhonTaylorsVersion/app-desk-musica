<script setup lang="ts">
import { inject } from 'vue';

const context = inject<any>('selectContext');
</script>

<template>
  <span class="truncate">
    <slot>{{ context?.modelValue?.modelValue }}</slot>
  </span>
</template>
