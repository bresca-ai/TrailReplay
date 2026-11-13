import { describe, expect, it } from 'vitest';
import { createAppStore } from './createAppStore';
import { createEditHistory, historyShortcut, isTextEditingTarget } from './editHistory';

describe('project edit history', () => {
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
