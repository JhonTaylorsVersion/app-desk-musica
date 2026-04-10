<script setup lang="ts">
import { computed } from "vue";

type MobileTab = "home" | "search" | "library" | "create";

const props = defineProps<{
  activeTab: MobileTab;
  isCreateOpen?: boolean;
  createDragOffset?: number;
}>();

defineEmits<{
  change: [tab: MobileTab];
}>();

const tabs: { key: MobileTab; label: string; icon: string }[] = [
  { key: "home", label: "Inicio", icon: "home" },
  { key: "search", label: "Buscar", icon: "search" },
  { key: "library", label: "Tu biblioteca", icon: "library" },
  { key: "create", label: "Crear", icon: "create" },
];

const createTransformStyle = computed(() => {
  if (!props.isCreateOpen && (!props.createDragOffset || props.createDragOffset === 0)) {
    return "transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1); transform: rotate(0deg);";
  }
  
  let baseRotation = 45;
  if (props.createDragOffset && Math.abs(props.createDragOffset) > 0) {
    const progress = Math.min(Math.abs(props.createDragOffset) / 90, 1);
    baseRotation = 45 * (1 - progress);
  }

  const transitionString = (props.createDragOffset && Math.abs(props.createDragOffset) > 0) 
    ? "none" 
    : "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)";
  
  return `transform: rotate(${baseRotation}deg); transition: ${transitionString};`;
});
</script>

<template>
  <nav class="tabbar">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="tabbar__item"
      :class="{ 'is-active': tab.key === activeTab }"
      type="button"
      @click="$emit('change', tab.key)"
    >
      <span class="tabbar__icon" :class="{ 'tabbar__icon--create-active': tab.key === 'create' && isCreateOpen }">
        <svg v-if="tab.icon === 'home'" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 10.5 12 4l8 6.5V20h-5.5v-6h-5V20H4z"
            fill="currentColor"
          />
        </svg>
        <svg v-else-if="tab.icon === 'search'" viewBox="0 0 24 24" aria-hidden="true">
          <circle
            cx="11"
            cy="11"
            r="6.75"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
          />
          <path
            d="M16.2 16.2 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
          />
        </svg>
        <svg v-else-if="tab.icon === 'library'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 4h3v16H5zM10.5 4h3v16h-3zM16 4h3v16h-3z" fill="currentColor" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true" :style="createTransformStyle">
          <path
            d="M12 4v16M4 12h16"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
          />
        </svg>
      </span>
      <span class="tabbar__label" :style="tab.key === 'create' && isCreateOpen ? 'visibility: hidden;' : ''">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.tabbar {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: linear-gradient(to bottom, rgba(18, 18, 18, 0.6) 0%, rgba(18, 18, 18, 0.9) 40%, rgba(18, 18, 18, 1) 100%);
  padding: 20px 0 10px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  z-index: 100;
}

.tabbar__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: transparent;
  color: #b3b3b3;
  cursor: pointer;
  flex: 1;
  padding: 0 4px;
  transition: color 0.2s ease;
}

.tabbar__item:hover {
  color: #ffffff;
}

.tabbar__item.is-active {
  color: #ffffff;
}

.tabbar__icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.tabbar__icon--create-active {
  background-color: #ffffff;
  color: #000000;
  width: 44px;
  height: 44px;
  margin-top: -8px;
  margin-bottom: -8px;
  transform: translateY(-4px);
}

.tabbar__icon--create-active svg {
  width: 24px !important;
  height: 24px !important;
}

.tabbar__icon svg {
  width: 100%;
  height: 100%;
}

.tabbar__label {
  font-size: 10px;
  font-weight: 500;
}
</style>
