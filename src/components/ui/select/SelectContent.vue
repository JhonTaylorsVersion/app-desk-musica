<script setup lang="ts">
import { inject } from 'vue';

const context = inject<any>('selectContext');
</script>

<template>
  <div 
    v-if="context?.isOpen?.value"
    :class="[
      'absolute z-50 min-w-full w-max max-w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-80 zoom-in-95 top-full mt-1',
      $attrs.class
    ]"
  >
    <div class="max-h-[min(20rem,calc(100vh-8rem))] overflow-y-auto px-1 pt-1 pb-3">
      <slot />
    </div>
  </div>
</template>
