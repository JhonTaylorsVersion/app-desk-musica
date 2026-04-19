import { ref, onMounted, onUnmounted } from "vue";
import { API_SOURCES, checkAllApiStatuses, ensureApiStatusCheckStarted, getApiStatusState, subscribeApiStatus, } from "../utils/api-status";

export function useApiStatus() {
    const state = ref(getApiStatusState());
    
    let unsubscribe: () => void;

    onMounted(() => {
        ensureApiStatusCheckStarted();
        unsubscribe = subscribeApiStatus(() => {
            state.value = getApiStatusState();
        });
    });

    onUnmounted(() => {
        if (unsubscribe) unsubscribe();
    });

    return {
        state,
        sources: API_SOURCES,
        refreshAll: () => checkAllApiStatuses(true),
        ensureApiStatusCheckStarted
    };
}
