import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { TrackAvailability } from "../types/api";
import { logger } from "../utils/logger";
import { CHECK_TIMEOUT_MS, withTimeout } from "../utils/async-timeout";

export function useAvailability() {
    const checking = ref(false);
    const checkingTrackId = ref<string | null>(null);
    const availabilityMap = ref<Map<string, TrackAvailability>>(new Map());
    const error = ref<string | null>(null);

    const checkAvailability = async (spotifyId: string) => {
        if (!spotifyId) {
            error.value = "No Spotify ID provided";
            return null;
        }
        checking.value = true;
        checkingTrackId.value = spotifyId;
        error.value = null;

        try {
            logger.info(`Checking availability for track: ${spotifyId}`);
            const availability = await withTimeout<TrackAvailability>(
                invoke("check_track_availability", { url: spotifyId }), 
                CHECK_TIMEOUT_MS, 
                `Availability check timed out after 10 seconds for ${spotifyId}`
            );

            const newMap = new Map(availabilityMap.value);
            newMap.set(spotifyId, availability);
            availabilityMap.value = newMap;
            
            logger.success(`Availability check completed for ${spotifyId}`);
            return availability;
        } catch (err: any) {
            const errorMessage = err instanceof Error ? err.message : err.toString() || "Failed to check availability";
            logger.error(`Availability check error: ${errorMessage}`);
            error.value = errorMessage;
            return null;
        } finally {
            checking.value = false;
            checkingTrackId.value = null;
        }
    };

    const getAvailability = (spotifyId: string) => {
        return availabilityMap.value.get(spotifyId);
    };

    const clearAvailability = () => {
        availabilityMap.value = new Map();
        error.value = null;
    };

    return {
        checking,
        checkingTrackId,
        availabilityMap,
        error,
        checkAvailability,
        getAvailability,
        clearAvailability,
    };
}
