import { ref } from "vue";

export function useDownloadQueueDialog() {
    const isOpen = ref(false);
    const openQueue = () => isOpen.value = true;
    const closeQueue = () => isOpen.value = false;
    const toggleQueue = () => isOpen.value = !isOpen.value;
    
    return {
        isOpen,
        openQueue,
        closeQueue,
        toggleQueue,
    };
}
