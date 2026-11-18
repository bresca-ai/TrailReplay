import { describe, expect, it } from 'vitest';
import { createAppStore } from './createAppStore';
import { createEditHistory, historyShortcut, isTextEditingTarget } from './editHistory';
import { createUserLandmark } from '@/utils/createUserLandmark';
import type { GPXTrack } from '@/types';

describe('project edit history', () => {
  it('records route, timeline, map and landmark edits and restores them in order', () => {
    const store = createAppStore();
    const track = { id: 'track-1', name: 'Route', activityIcon: 'walk', points: [], color: '#123456', visible: true,
      totalDistance: 0, totalTime: 0, movingTime: 0, elevationGain: 0, elevationLoss: 0, maxElevation: 0, minElevation: 0,
      maxSpeed: 0, avgSpeed: 0, avgMovingSpeed: 0, bounds: { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 } } satisfies GPXTrack;
    store.getState().addTrack(track);
    const segmentId = store.getState().journeySegments[0].id;
    const history = createEditHistory(store);
    const landmark = createUserLandmark({ lat: 42, lon: 1, progress: 0.2 });
    store.getState().updateTrackColor(track.id, '#abcdef');
    store.getState().updateJourneySegmentDuration(segmentId, 30000);
    store.getState().setSettings({ show3DBuildings: true });
    store.getState().addLandmark(landmark);
    expect(history.canUndo()).toBe(true);
    history.undo();
    expect(store.getState().userLandmarks).toHaveLength(0);
    history.undo();
    expect(store.getState().settings.show3DBuildings).toBe(false);
    history.undo();
    expect(store.getState().journeySegments[0].duration).toBe(60000);
    history.undo();
    expect(store.getState().tracks[0].color).toBe('#123456');
    expect(history.canRedo()).toBe(true);
    history.redo();
    expect(store.getState().tracks[0].color).toBe('#abcdef');
    history.dispose();
  });
  it('undoes and redoes edits without rewinding playback or unrelated settings', () => {
    const store = createAppStore();
    const history = createEditHistory(store);
    const original = store.getState().settings.elevationProfileHeight;
    store.getState().setSettings({ elevationProfileHeight: 2 });
    store.getState().setPlayback({ currentTime: 5000 });
    const resume = history.pause();
    store.getState().setSettings({ elevationProfileFilled: false });
    resume();
    expect(history.undo()).toBe(true);
    expect(store.getState().settings.elevationProfileHeight).toBe(original);
    expect(store.getState().settings.elevationProfileFilled).toBe(false);
    expect(store.getState().playback.currentTime).toBe(5000);
    expect(history.redo()).toBe(true);
    expect(store.getState().settings.elevationProfileHeight).toBe(2);
    history.dispose();
  });

  it('clears redo on a new edit and ignores export activity', () => {
    const store = createAppStore();
    const history = createEditHistory(store);
    store.getState().setSettings({ elevationProfileHeight: 2 });
    history.undo();
    store.getState().setSettings({ elevationProfileHeight: 3 });
    expect(history.redo()).toBe(false);
    store.getState().setIsExporting(true);
    store.getState().setSettings({ elevationProfileFilled: false });
    expect(history.undo()).toBe(false);
    store.getState().setIsExporting(false);
    expect(history.undo()).toBe(true);
    expect(store.getState().settings.elevationProfileFilled).toBe(false);
    history.dispose();
  });

  it('recognizes both requested and conventional redo shortcuts', () => {
    expect(historyShortcut(new KeyboardEvent('keydown', { key: 'z', metaKey: true }))).toBe('undo');
    expect(historyShortcut(new KeyboardEvent('keydown', { key: 'r', ctrlKey: true }))).toBe('redo');
    expect(historyShortcut(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true }))).toBe('redo');
    expect(isTextEditingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTextEditingTarget(document.createElement('button'))).toBe(false);
  });
});
