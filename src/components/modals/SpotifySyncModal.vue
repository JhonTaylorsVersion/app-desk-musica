<script lang="ts">
import { defineComponent, inject } from "vue";

export default defineComponent({
  name: "SpotifySyncModal",
  setup() {
    const logic = inject<any>("appLogic");
    return { ...logic };
  },
});
</script>

<template>
  <transition name="spotify-sync-modal">
    <div
      v-if="pendingSpotifySyncs.length > 0"
      class="spotify-sync-modal-backdrop"
      @click.self="closeSyncModalSoft(pendingSpotifySyncs[0].playlistId)"
    >
      <div class="spotify-sync-modal glass-panel">
        <div class="spotify-sync-modal-header">
          <div class="spotify-sync-icon-badge">
            <svg viewBox="0 0 496 512" width="60" height="60">
              <path
                fill="#1ed760"
                d="M248 8C111.1 8 0 119.1 0 256s111.1 248 248 248 248-111.1 248-248S384.9 8 248 8Z"
              />
              <path
                d="M406.6 231.1c-5.2 0-8.4-1.3-12.9-3.9-71.2-42.5-198.5-52.7-280.9-29.7-3.6 1-8.1 2.6-12.9 2.6-13.2 0-23.3-10.3-23.3-23.6 0-13.6 8.4-21.3 17.4-23.9 35.2-10.3 74.6-15.2 117.5-15.2 73 0 149.5 15.2 205.4 47.8 7.8 4.5 12.9 10.7 12.9 22.6 0 13.6-11 23.3-23.3 23.3zm-31 76.2c-5.2 0-8.7-2.3-12.3-4.2-62.5-37-155.7-51.9-238.6-29.4-4.8 1.3-7.4 2.6-11.9 2.6-10.7 0-19.4-8.7-19.4-19.4s5.2-17.8 15.5-20.7c27.8-7.8 56.2-13.6 97.8-13.6 64.9 0 127.6 16.1 177 45.5 8.1 4.8 11.3 11 11.3 19.7-.1 10.8-8.5 19.5-19.4 19.5zm-26.9 65.6c-4.2 0-6.8-1.3-10.7-3.6-62.4-37.6-135-39.2-206.7-24.5-3.9 1-9 2.6-11.9 2.6-9.7 0-15.8-7.7-15.8-15.8 0-10.3 6.1-15.2 13.6-16.8 81.9-18.1 165.6-16.5 237 26.2 6.1 3.9 9.7 7.4 9.7 16.5s-7.1 15.4-15.2 15.4z"
              />
            </svg>
          </div>
          <h2 v-if="!isSyncSuccess">
            {{
              pendingSpotifySyncs[0].isScanning
                ? "Sincronizando..."
                : "Sincronizaci&oacute;n de Spotify"
            }}
          </h2>
          <h2 v-else>¡Todo listo!</h2>
        </div>

        <div v-if="isSyncSuccess" class="spotify-sync-success-view">
          <div class="spotify-sync-success-icon">
            <svg viewBox="0 0 24 24" width="80" height="80" fill="#1db954">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
              />
            </svg>
          </div>
          <p>Sincronizaci&oacute;n completada con &eacute;xito</p>
        </div>

        <div v-else class="spotify-sync-sections">
          <!-- Columna Izquierda: NUEVAS -->
          <div
            v-if="
              pendingSpotifySyncs[0].newTracks.length > 0 &&
              sessionDismissedNuevas[pendingSpotifySyncs[0].playlistId] !==
                pendingSpotifySyncs[0].newTracks
                  .map((t: any) => t.id)
                  .sort()
                  .join(',')
            "
            class="spotify-sync-column"
          >
            <div class="spotify-sync-column-header">
              <h3 class="spotify-sync-section-title">
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="currentColor"
                  style="vertical-align: middle; margin-right: 6px"
                >
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
                Nuevas canciones
              </h3>
              <p class="spotify-sync-column-subtitle">
                Detectamos
                <strong>{{ pendingSpotifySyncs[0].newTracks.length }}</strong>
                novedades.
                <button
                  v-if="
                    (!isManualSyncing ||
                      pendingSpotifySyncs[0].isDeepMode !== undefined) &&
                    !pendingSpotifySyncs[0].isForcedFromUpToDate
                  "
                  class="spotify-sync-deep-scan-link"
                  type="button"
                  :disabled="pendingSpotifySyncs[0].isScanning"
                  @click="
                    manualForceSync(
                      pendingSpotifySyncs[0].playlistId,
                      !pendingSpotifySyncs[0].isDeepMode,
                    )
                  "
                >
                  {{
                    pendingSpotifySyncs[0].isDeepMode
                      ? "(Ver solo las nuevas)"
                      : "(Ver todas las faltantes)"
                  }}
                </button>
              </p>
              <div
                v-if="activePendingSpotifySync?.newTracks.length > 1"
                class="spotify-sync-bulk-actions"
              >
                <button
                  v-if="!areAllNewTracksSelected(activePendingNewTrackIds)"
                  type="button"
                  class="spotify-sync-bulk-link"
                  :disabled="isBulkSelectingNewTracks"
                  @click="
                    setAllNewTracksSelection(activePendingNewTrackIds, true)
                  "
                >
                  {{
                    isBulkSelectingNewTracks ? "Procesando..." : "Marcar todas"
                  }}
                </button>
                <button
                  v-else
                  type="button"
                  class="spotify-sync-bulk-link"
                  :disabled="isBulkSelectingNewTracks"
                  @click="
                    setAllNewTracksSelection(activePendingNewTrackIds, false)
                  "
                >
                  {{
                    isBulkSelectingNewTracks
                      ? "Procesando..."
                      : "Desmarcar todas"
                  }}
                </button>
              </div>
            </div>

            <div
              ref="syncNewTracksListRef"
              class="spotify-sync-track-list"
              @scroll="onSyncNewTracksScroll"
            >
              <div
                v-if="virtualNewTracksWindow.topPadding > 0"
                class="spotify-sync-virtual-spacer"
                :style="{ height: `${virtualNewTracksWindow.topPadding}px` }"
              ></div>
              <div
                v-for="item in virtualNewTracksWindow.items"
                :key="item.track.id"
                class="spotify-sync-track-item selectable"
                :class="{
                  selected: isNewTrackSelected(item.track.id),
                }"
                @click="toggleNewTrackSelection(item.track.id)"
              >
                <div
                  v-if="pendingSpotifySyncs[0].newTracks.length > 1"
                  class="spotify-sync-checkbox"
                >
                  <div
                    class="checkbox-inner"
                    :class="{
                      active: isNewTrackSelected(item.track.id),
                      success: true,
                    }"
                  >
                    <svg
                      v-if="isNewTrackSelected(item.track.id)"
                      viewBox="0 0 24 24"
                      width="10"
                      height="10"
                      fill="currentColor"
                    >
                      <path
                        d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z"
                      />
                    </svg>
                  </div>
                </div>
                <div class="spotify-sync-track-cover-mini">
                  <img v-if="item.track.cover" :src="item.track.cover" alt="" />
                  <div v-else class="spotify-sync-track-placeholder">
                    &#9835;
                  </div>
                </div>
                <div
                  class="spotify-sync-track-info"
                  style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    width: 100%;
                  "
                >
                  <div style="flex: 1; min-width: 0">
                    <div class="spotify-sync-track-title">
                      {{ item.track.title }}
                    </div>
                    <div class="spotify-sync-track-artist">
                      {{ item.track.artists }}
                    </div>
                  </div>
                  <!-- Estado de la descarga en la fila -->
                  <div
                    v-if="
                      item.track.status === 'downloading' ||
                      item.track.status === 'finishing' ||
                      item.track.status === 'waiting'
                    "
                    class="spotify-sync-track-status downloading"
                  >
                    <div class="spotify-sync-spinner-mini"></div>
                    <span>{{
                      item.track.status === "waiting"
                        ? "En cola..."
                        : "Bajando..."
                    }}</span>
                  </div>
                  <div
                    v-else-if="item.track.status"
                    class="spotify-sync-track-status"
                    :class="item.track.status"
                  >
                    <span v-if="item.track.status === 'done'">Listo</span>
                    <span v-if="item.track.status === 'error'">Error</span>
                  </div>
                </div>
              </div>
              <div
                v-if="virtualNewTracksWindow.bottomPadding > 0"
                class="spotify-sync-virtual-spacer"
                :style="{ height: `${virtualNewTracksWindow.bottomPadding}px` }"
              ></div>
            </div>

            <div class="spotify-sync-column-footer">
              <div class="sync-actions-group">
                <button
                  class="spotify-sync-btn ghost mini"
                  type="button"
                  @click="
                    sessionDismissedNuevas[pendingSpotifySyncs[0].playlistId] =
                      pendingSpotifySyncs[0].newTracks
                        .map((t: any) => t.id)
                        .sort()
                        .join(',')
                  "
                  title="Recordar luego"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="currentColor"
                  >
                    <path
                      d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h2v5.2l4.5 2.7-.7.3z"
                    />
                  </svg>
                </button>
                <button
                  class="spotify-sync-btn ghost mini"
                  type="button"
                  @click="
                    ignoreNewTracksSync(
                      pendingSpotifySyncs[0].playlistId,
                      pendingSpotifySyncs[0].newTracks,
                    )
                  "
                  title="Ignorar permanentemente"
                >
                  No mostrar
                </button>
              </div>
              <button
                class="spotify-sync-btn primary mini"
                type="button"
                :disabled="
                  isSyncDownloading || pendingSpotifySyncs[0].isScanning
                "
                @click="
                  applyNewTracksSync(
                    pendingSpotifySyncs[0].playlistId,
                    pendingSpotifySyncs[0].newTracks,
                    pendingSpotifySyncs[0].remoteIds || [],
                  )
                "
              >
                <template v-if="isSyncDownloading">
                  <div
                    class="spotify-sync-spinner-mini white"
                    style="margin-right: 10px"
                  ></div>
                  Descargando ({{ selectedNewTracks.length }})
                </template>
                <template v-else-if="pendingSpotifySyncs[0].isScanning">
                  <div
                    class="spotify-sync-spinner-mini white"
                    style="margin-right: 10px"
                  ></div>
                  Escaneando...
                </template>
                <template v-else>
                  Descargar ({{ selectedNewTracks.length }})
                </template>
              </button>
            </div>
          </div>

          <!-- Columna Derecha: ELIMINADAS -->
          <div
            v-if="
              pendingSpotifySyncs[0].removedTracks.length > 0 &&
              sessionDismissedBajas[pendingSpotifySyncs[0].playlistId] !==
                pendingSpotifySyncs[0].removedTracks
                  .map((t: any) => t.path)
                  .sort()
                  .join(',')
            "
            class="spotify-sync-column"
          >
            <div class="spotify-sync-column-header">
              <h3 class="spotify-sync-section-title danger">
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="currentColor"
                  style="vertical-align: middle; margin-right: 6px"
                >
                  <path
                    d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                  />
                </svg>
                Eliminadas en Spotify
              </h3>
              <p class="spotify-sync-column-subtitle">
                Hay
                <strong>{{
                  pendingSpotifySyncs[0].removedTracks.length
                }}</strong>
                bajas en el origen.
              </p>
              <div
                v-if="activePendingSpotifySync?.removedTracks.length > 1"
                class="spotify-sync-bulk-actions"
              >
                <button
                  v-if="
                    !areAllRemovedTracksSelected(activePendingRemovedTrackPaths)
                  "
                  type="button"
                  class="spotify-sync-bulk-link"
                  :disabled="isBulkSelectingRemovedTracks"
                  @click="
                    setAllRemovedTracksSelection(
                      activePendingRemovedTrackPaths,
                      true,
                    )
                  "
                >
                  {{
                    isBulkSelectingRemovedTracks
                      ? "Procesando..."
                      : "Marcar todas"
                  }}
                </button>
                <button
                  v-else
                  type="button"
                  class="spotify-sync-bulk-link"
                  :disabled="isBulkSelectingRemovedTracks"
                  @click="
                    setAllRemovedTracksSelection(
                      activePendingRemovedTrackPaths,
                      false,
                    )
                  "
                >
                  {{
                    isBulkSelectingRemovedTracks
                      ? "Procesando..."
                      : "Desmarcar todas"
                  }}
                </button>
              </div>
            </div>

            <div
              ref="syncRemovedTracksListRef"
              class="spotify-sync-track-list"
              @scroll="onSyncRemovedTracksScroll"
            >
              <div
                v-if="virtualRemovedTracksWindow.topPadding > 0"
                class="spotify-sync-virtual-spacer"
                :style="{
                  height: `${virtualRemovedTracksWindow.topPadding}px`,
                }"
              ></div>
              <div
                v-for="item in virtualRemovedTracksWindow.items"
                :key="item.track.id"
                class="spotify-sync-track-item selectable"
                :class="{
                  selected: isRemovedTrackSelected(item.track.path),
                }"
                @click="toggleRemovedTrackSelection(item.track.path)"
              >
                <div
                  v-if="pendingSpotifySyncs[0].removedTracks.length > 1"
                  class="spotify-sync-checkbox"
                >
                  <div
                    class="checkbox-inner"
                    :class="{
                      active: isRemovedTrackSelected(item.track.path),
                    }"
                  >
                    <svg
                      v-if="isRemovedTrackSelected(item.track.path)"
                      viewBox="0 0 24 24"
                      width="10"
                      height="10"
                      fill="currentColor"
                    >
                      <path
                        d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z"
                      />
                    </svg>
                  </div>
                </div>
                <div class="spotify-sync-track-cover-mini">
                  <img v-if="item.track.cover" :src="item.track.cover" alt="" />
                  <div v-else class="spotify-sync-track-placeholder">
                    &#9835;
                  </div>
                </div>
                <div class="spotify-sync-track-info">
                  <div class="spotify-sync-track-title">
                    {{ item.track.title }}
                  </div>
                  <div class="spotify-sync-track-artist">
                    {{ item.track.artists }}
                  </div>
                </div>
              </div>
              <div
                v-if="virtualRemovedTracksWindow.bottomPadding > 0"
                class="spotify-sync-virtual-spacer"
                :style="{
                  height: `${virtualRemovedTracksWindow.bottomPadding}px`,
                }"
              ></div>
            </div>

            <div
              class="spotify-sync-column-footer"
              style="flex-direction: column; align-items: stretch; gap: 12px"
            >
              <!-- Nueva opci&oacute;n de borrado inteligente -->
              <div
                v-if="selectedRemovedTracks.length > 0"
                class="delete-files-option sync-mini"
                style="
                  margin: 0;
                  padding: 10px;
                  background: rgba(255, 77, 77, 0.05);
                  border-radius: 12px;
                  border: 1px solid rgba(255, 77, 77, 0.1);
                "
              >
                <label
                  class="delete-files-checkbox"
                  style="gap: 10px; cursor: pointer"
                >
                  <input type="checkbox" v-model="deleteSyncTracksWithFiles" />
                  <span class="checkbox-custom"></span>
                  <span
                    class="checkbox-label"
                    style="
                      font-size: 13px;
                      color: rgba(255, 255, 255, 0.7);
                      line-height: 1.4;
                    "
                  >
                    Eliminar tambi&eacute;n archivos f&iacute;sicos si pertenecen a esta
                    carpeta
                  </span>
                </label>
              </div>

              <div
                style="
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  width: 100%;
                "
              >
                <div class="sync-actions-group">
                  <button
                    class="spotify-sync-btn ghost mini"
                    type="button"
                    @click="
                      sessionDismissedBajas[pendingSpotifySyncs[0].playlistId] =
                        pendingSpotifySyncs[0].removedTracks
                          .map((t: any) => t.path)
                          .sort()
                          .join(',')
                    "
                    title="Recordar luego"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="currentColor"
                    >
                      <path
                        d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h2v5.2l4.5 2.7-.7.3z"
                      />
                    </svg>
                  </button>
                  <button
                    class="spotify-sync-btn ghost mini"
                    type="button"
                    @click="
                      ignoreRemovedTracksSync(
                        pendingSpotifySyncs[0].playlistId,
                        selectedRemovedTracks,
                      )
                    "
                    title="Ignorar permanentemente"
                  >
                    Mantener
                  </button>
                </div>
                <button
                  class="spotify-sync-btn danger mini"
                  type="button"
                  :disabled="selectedRemovedTracks.length === 0"
                  @click="
                    applyRemovedTracksSync(
                      pendingSpotifySyncs[0].playlistId,
                      selectedRemovedTracks,
                      pendingSpotifySyncs[0].remoteIds || [],
                    )
                  "
                >
                  Quitar ({{ selectedRemovedTracks.length }})
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Cierre autom&aacute;tico si ambos estados coinciden con los descartados -->
        <div
          v-if="
            (pendingSpotifySyncs[0].newTracks.length === 0 ||
              sessionDismissedNuevas[pendingSpotifySyncs[0].playlistId] ===
                pendingSpotifySyncs[0].newTracks
                  .map((t: any) => t.id)
                  .sort()
                  .join(',')) &&
            (pendingSpotifySyncs[0].removedTracks.length === 0 ||
              sessionDismissedBajas[pendingSpotifySyncs[0].playlistId] ===
                pendingSpotifySyncs[0].removedTracks
                  .map((t: any) => t.path)
                  .sort()
                  .join(','))
          "
          v-show="false"
        >
          {{
            discardSpotifySync(
              pendingSpotifySyncs[0].playlistId,
              pendingSpotifySyncs[0],
            )
          }}
        </div>
      </div>
    </div>
  </transition>
</template>
