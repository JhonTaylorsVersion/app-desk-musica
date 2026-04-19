<script setup lang="ts">
import { computed } from 'vue';
import { Check, Minus } from 'lucide-vue-next';

const props = defineProps<{
  checked?: boolean | 'indeterminate';
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:checked', value: boolean): void;
}>();

const handleClick = () => {
  if (props.disabled) return;
  emit('update:checked', props.checked === true ? false : true);
};
</script>

<template>
  <button
    type="button"
    role="checkbox"
    :aria-checked="checked === 'indeterminate' ? 'mixed' : checked"
    :disabled="disabled"
    @click="handleClick"
    :class="[
      'h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
      checked ? 'bg-primary text-primary-foreground' : 'bg-transparent'
    ]"
  >
    <div class="flex items-center justify-center text-current">
      <Check v-if="checked === true" class="h-3 w-3" stroke-width="3" />
      <Minus v-else-if="checked === 'indeterminate'" class="h-3 w-3" stroke-width="3" />
    </div>
  </button>
</template>
