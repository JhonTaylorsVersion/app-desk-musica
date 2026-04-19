<template>
  <!-- Mirrors SearchAndSort.tsx 1:1 -->
  <div class="sf-search-sort">
    <div class="sf-search-wrap">
      <!-- Search icon -->
      <svg class="sf-search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        class="sf-input"
        type="text"
        placeholder="Search tracks..."
        :value="searchQuery"
        @input="$emit('searchChange', ($event.target as HTMLInputElement).value)"
      />
      <button v-if="searchQuery" class="sf-clear-btn" @click="$emit('searchChange', '')">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      </button>
    </div>

    <div class="sf-select-wrap">
      <select class="sf-select" :value="sortBy" @change="$emit('sortChange', ($event.target as HTMLSelectElement).value)">
        <option value="default">Default</option>
        <option value="title-asc">Title (A-Z)</option>
        <option value="title-desc">Title (Z-A)</option>
        <option value="artist-asc">Artist (A-Z)</option>
        <option value="artist-desc">Artist (Z-A)</option>
        <option value="duration-asc">Duration (Short)</option>
        <option value="duration-desc">Duration (Long)</option>
        <option value="plays-asc">Plays (Low)</option>
        <option value="plays-desc">Plays (High)</option>
        <option value="downloaded">Downloaded</option>
        <option value="not-downloaded">Not Downloaded</option>
        <option value="failed">Failed Downloads</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  searchQuery: string;
  sortBy: string;
}>();
defineEmits<{
  searchChange: [value: string];
  sortChange: [value: string];
}>();
</script>

<style scoped>
.sf-search-sort { display: flex; gap: 0.5rem; }
.sf-search-wrap { position: relative; flex: 1; }
.sf-search-icon {
  position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%);
  width: 1rem; height: 1rem; color: hsl(var(--muted-foreground));
}
.sf-input {
  width: 100%; padding: 0.5rem 2.25rem 0.5rem 2.5rem;
  border: 1px solid hsl(var(--border)); border-radius: 6px;
  background: hsl(var(--background)); color: hsl(var(--foreground));
  font-size: 0.875rem; outline: none; transition: border-color 0.15s;
}
.sf-input:focus { border-color: hsl(var(--primary)); }
.sf-clear-btn {
  position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%);
  background: none; border: none; cursor: pointer;
  color: hsl(var(--muted-foreground)); transition: color 0.15s;
}
.sf-clear-btn:hover { color: hsl(var(--foreground)); }
.sf-select-wrap { width: 200px; }
.sf-select {
  width: 100%; padding: 0.5rem 0.75rem; font-size: 0.875rem;
  border: 1px solid hsl(var(--border)); border-radius: 6px;
  background: hsl(var(--background)); color: hsl(var(--foreground));
  cursor: pointer; outline: none;
}
</style>
