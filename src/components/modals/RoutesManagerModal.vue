<script lang="ts">
import { defineComponent, inject } from "vue";

export default defineComponent({
  name: "RoutesManagerModal",
  setup() {
    const logic = inject<any>("appLogic");
    return { ...logic };
  },
});
</script>

<template>
  <div
    v-if="isRoutesManagerOpen"
    class="routes-modal-backdrop"
    @click.self="isRoutesManagerOpen = false"
  >
    <div class="routes-modal glass-panel">
      <div class="routes-modal-header">
        <div>
          <div class="panel-title">Rutas de m&uacute;sica</div>
          <div class="panel-subtitle">
            {{ musicDirectories.length }} ruta(s) configurada(s)
          </div>
        </div>

        <button
          class="glass-button secondary-button routes-close-btn"
          type="button"
          @click="isRoutesManagerOpen = false"
        >
          Cerrar
        </button>
      </div>

      <div class="routes-modal-actions">
        <button
          class="glass-button"
          type="button"
          @click="añadirRutaMusica"
        >
          Añadir ruta
        </button>

        <button
          class="glass-button secondary-button danger-soft"
          type="button"
          :disabled="musicDirectories.length === 0"
          @click="clearMusicDirectories"
        >
          Quitar todas
        </button>
      </div>

      <div v-if="musicDirectories.length > 0" class="routes-list">
        <div
          v-for="path in musicDirectories"
          :key="path"
          class="routes-list-item glass-panel-inner"
        >
          <div class="routes-list-copy">
            <div class="routes-list-label">Ruta guardada</div>
            <div class="routes-list-path">{{ path }}</div>
          </div>

          <button
            class="small-action-btn danger"
            type="button"
            @click="removeMusicDirectory(path)"
          >
            Quitar
          </button>
        </div>
      </div>

      <div v-else class="routes-empty glass-panel-inner">
        <div class="routes-empty-title">A&uacute;n no tienes rutas guardadas</div>
        <div class="routes-empty-copy">
          Usa "A&ntilde;adir ruta" para registrar una o varias carpetas de m&uacute;sica.
        </div>
      </div>

      <!-- SECCI&Oacute;N DE GESTI&Oacute;N DE ACTIVOS -->
      <div class="asset-manager-section">
        <div class="panel-divider"></div>
        <div class="asset-manager-header">
          <div class="panel-title">Almacenamiento de Activos</div>
          <div class="panel-subtitle">
            Elige d&oacute;nde buscar letras, canvas y car&aacute;tulas
          </div>
        </div>

        <div class="asset-mode-selector glass-panel-inner">
          <button
            class="mode-toggle-btn"
            :class="{ active: assetStorageMode === 'unified' }"
            type="button"
            @click="assetStorageMode = 'unified'"
          >
            Unificado
            <span class="mode-desc">Junto a la m&uacute;sica</span>
          </button>
          <button
            class="mode-toggle-btn"
            :class="{ active: assetStorageMode === 'custom' }"
            type="button"
            @click="assetStorageMode = 'custom'"
          >
            Personalizado
            <span class="mode-desc">Carpetas espec&iacute;ficas</span>
          </button>
        </div>

        <div v-if="assetStorageMode === 'custom'" class="custom-paths-list">
          <div class="custom-path-item glass-panel-inner">
            <div class="path-info">
              <div class="path-label">Carpeta de Canvas (.mp4)</div>
              <div class="path-value">
                {{ customCanvasPath || "Predeterminada" }}
              </div>
            </div>
            <button
              class="small-action-btn"
              type="button"
              @click="selectCustomCanvasPath"
            >
              Cambiar
            </button>
          </div>

          <div class="custom-path-item glass-panel-inner">
            <div class="path-info">
              <div class="path-label">Carpeta de Letras (.lrc)</div>
              <div class="path-value">
                {{ customLyricsPath || "Predeterminada" }}
              </div>
            </div>
            <button
              class="small-action-btn"
              type="button"
              @click="selectCustomLyricsPath"
            >
              Cambiar
            </button>
          </div>

          <div class="custom-path-item glass-panel-inner">
            <div class="path-info">
              <div class="path-label">Carpeta de Car&aacute;tulas</div>
              <div class="path-value">
                {{ customCoversPath || "Predeterminada" }}
              </div>
            </div>
            <button
              class="small-action-btn"
              type="button"
              @click="selectCustomCoversPath"
            >
              Cambiar
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
