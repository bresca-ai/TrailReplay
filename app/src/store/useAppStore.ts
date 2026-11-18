import { createAppStore } from '@/store/createAppStore';

// Keep subscribers and project state attached to the same store when Vite
// replaces this module during local development.
export const useAppStore: ReturnType<typeof createAppStore> = import.meta.hot?.data.appStore ?? createAppStore();
if (import.meta.hot) import.meta.hot.data.appStore = useAppStore;
