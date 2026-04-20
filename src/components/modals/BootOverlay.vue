<script lang="ts">
import { defineComponent, inject } from "vue";

export default defineComponent({
  name: "BootOverlay",
  setup() {
    const logic = inject<any>("appLogic");
    return { ...logic };
  },
});
</script>

<template>
  <transition name="boot-overlay-fade">
    <div v-if="isAppBooting" class="boot-overlay" aria-live="polite">
      <div class="boot-overlay-card glass-panel">
        <div class="boot-overlay-spinner" aria-hidden="true"></div>
        <div class="boot-overlay-copy">
          <p class="boot-overlay-eyebrow">Iniciando</p>
          <h2>Preparando tu m&uacute;sica</h2>
          <p>
            Cargando biblioteca, recuperando sesi&oacute;n y conectando la salida de
            audio.
          </p>
        </div>
      </div>
    </div>
  </transition>
</template>
