import { describe, expect, it, vi } from 'vitest';
import { createAppStore } from '@/store/createAppStore';
import { startProductAnalytics, trackProjectReady } from './productAnalytics';

describe('product analytics', () => {
  it('reports visible panel transitions, ignores frame updates, and unsubscribes', () => {
    const store = createAppStore();
    store.getState().setSidebarOpen(true);
    const emit = vi.fn();
    const stop = startProductAnalytics(store, emit);
    expect(emit).toHaveBeenLastCalledWith('editor_panel_viewed', expect.objectContaining({ panel_name: 'tracks' }));
    emit.mockClear();
    store.getState().setActivePanel('tracks');
    store.getState().setPlayback({ progress: 0.5 });
    expect(emit).not.toHaveBeenCalled();
    store.getState().setActivePanel('export');
    expect(emit).toHaveBeenLastCalledWith('editor_panel_viewed', { panel_name: 'export', previous_panel: 'tracks', has_route: false });
    store.getState().setSidebarOpen(false);
    store.getState().setActivePanel('settings');
    expect(emit).toHaveBeenCalledTimes(1);
    store.getState().setSidebarOpen(true);
    expect(emit).toHaveBeenLastCalledWith('editor_panel_viewed', expect.objectContaining({ panel_name: 'settings', previous_panel: 'closed' }));
    stop();
    store.getState().setActivePanel('tracks');
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('does not count an empty project as ready', () => {
    const emit = vi.fn();
    trackProjectReady(createAppStore().getState(), 'project', emit);
    expect(emit).not.toHaveBeenCalled();
  });
});
