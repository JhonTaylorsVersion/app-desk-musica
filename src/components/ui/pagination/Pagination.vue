<script setup lang="ts">
import { computed } from 'vue';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-vue-next';

const props = defineProps<{
  total: number;
  perPage: number;
  current: number;
}>();

const emit = defineEmits<{
  (e: 'change', page: number): void;
}>();

const totalPages = computed(() => Math.ceil(props.total / props.perPage));

const pages = computed(() => {
  const current = props.current;
  const total = totalPages.value;
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  
  if (current <= 3) return [1, 2, 3, 4, '...', total];
  if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
  
  return [1, '...', current - 1, current, current + 1, '...', total];
});
</script>

<template>
  <nav v-if="totalPages > 1" class="flex items-center justify-center space-x-2">
    <button
      @click="emit('change', current - 1)"
      :disabled="current === 1"
      class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 w-9"
    >
      <ChevronLeft class="h-4 w-4" />
    </button>
    
    <template v-for="(p, i) in pages" :key="i">
      <span v-if="p === '...'" class="flex h-9 w-9 items-center justify-center">
        <MoreHorizontal class="h-4 w-4" />
      </span>
      <button
        v-else
        @click="emit('change', p as number)"
        :class="[
          'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-9 w-9',
          current === p ? 'bg-primary text-primary-foreground shadow' : 'hover:bg-accent hover:text-accent-foreground'
        ]"
      >
        {{ p }}
      </button>
    </template>

    <button
      @click="emit('change', current + 1)"
      :disabled="current === totalPages"
      class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 w-9"
    >
      <ChevronRight class="h-4 w-4" />
    </button>
  </nav>
</template>
