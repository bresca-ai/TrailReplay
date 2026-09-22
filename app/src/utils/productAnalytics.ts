import { replayUsageAnalytics } from './replayUsageAnalytics';
import type { AppState } from '@/store/storeTypes';
import { trackEvent } from './analytics';

type Store = {
  getState: () => AppState;
  subscribe: (listener: (state: AppState, previous: AppState) => void) => () => void;
};

export function startProductAnalytics(store: Store, emit = trackEvent) {
  const initial = store.getState();
  if (initial.isSidebarOpen) emit('editor_panel_viewed', { panel_name: initial.activePanel, previous_panel: 'none', has_route: initial.tracks.length > 0 });
  return store.subscribe((state, previous) => {
    replayUsageAnalytics.observe(state, previous);
    if (state.isSidebarOpen && (!previous.isSidebarOpen || state.activePanel !== previous.activePanel)) {
      emit('editor_panel_viewed', { panel_name: state.activePanel, previous_panel: previous.isSidebarOpen ? previous.activePanel : 'closed', has_route: state.tracks.length > 0 });
    }
  });
}

export function trackProjectReady(state: AppState, source: 'route_files' | 'recipe' | 'project', emit = trackEvent) {
  if (!state.tracks.length) return;
  emit('project_ready', {
    import_source: source, track_count: state.tracks.length,
    picture_count: state.pictures.length, video_count: state.videos.length,
    annotation_count: state.textAnnotations.length,
  });
}
