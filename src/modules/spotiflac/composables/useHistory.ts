import { ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { toastWithSound as toast } from '../utils/toast-with-sound';

const MAX_HISTORY_ITEMS = 5;
const fetchHistory = ref<any[]>([]);

const normalizeHistoryItems = (items: any[]) => {
    const seen = new Set<string>();

    return [...items]
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .filter((item) => {
            const key = `${item.type || item.item_type || 'unknown'}:${item.url || item.id || ''}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        })
        .slice(0, MAX_HISTORY_ITEMS);
};

export function useHistory() {
    const loadHistory = async () => {
        try {
            const history = await invoke<any[]>('get_fetch_history');
            fetchHistory.value = normalizeHistoryItems(history);
        } catch (err) {
            // console.error("Failed to load fetch history:", err);
        }
    };

    const addFetchHistoryItem = (item: any) => {
        fetchHistory.value = normalizeHistoryItems([item, ...fetchHistory.value]);
    };

    const deleteFetchHistoryItem = async (id: string) => {
        try {
            await invoke('delete_fetch_history_item', { id });
            fetchHistory.value = fetchHistory.value.filter(item => item.id !== id);
            toast.success("History item removed");
        } catch (err) {
            toast.error("Failed to delete item");
        }
    };

    onMounted(loadHistory);

    return {
        fetchHistory,
        loadHistory,
        addFetchHistoryItem,
        deleteFetchHistoryItem
    };
}
