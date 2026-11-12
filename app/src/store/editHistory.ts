import type { StoreApi } from 'zustand';
import { produce } from 'immer';
import type { AppState } from './storeTypes';

// Only persistent, editable project data belongs here: playback, network
// status, selections and export progress change independently of user edits.
const fields = [
  'tracks', 'trackTrimOriginals', 'activeTrackId', 'comparisonTracks', 'comparisonMode',
  'comparisonSlowdown', 'comparisonThresholdMeters', 'journey', 'journeySegments',
  'cinematicCameraKeyframes', 'pictures', 'pendingPicturePlacements', 'videos', 'iconChanges',
  'textAnnotations', 'userLandmarks', 'landmarkPriorityIds', 'hiddenLandmarkIds',
  'showAutomaticLandmarks', 'enabledLandmarkGroups', 'nearbyPlaceTypes', 'nearbyPlacesEnabled',
  'settings', 'cameraSettings', 'videoExportSettings', 'socialShareSettings', 'videoCoverImageUrl',
] as const satisfies readonly (keyof AppState)[];
type Field = typeof fields[number];
type Change = { path: string[]; before: unknown; after: unknown; hadBefore: boolean; hadAfter: boolean };
type Entry = { changes: Change[]; group: Element | null; time: number };
const nestedFields = new Set<Field>(['settings', 'cameraSettings', 'videoExportSettings', 'socialShareSettings']);
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}
function collectChanges(before: unknown, after: unknown, path: string[], changes: Change[]) {
  if (Object.is(before, after)) return;
  if (isPlainObject(before) && isPlainObject(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!(key in before) || !(key in after)) changes.push({ path: [...path, key], before: before[key], after: after[key], hadBefore: key in before, hadAfter: key in after });
      else collectChanges(before[key], after[key], [...path, key], changes);
    }
  } else changes.push({ path, before, after, hadBefore: true, hadAfter: true });
}

/** Bounded history of immutable store values; playback and transient UI are never restored. */
export function createEditHistory(store: StoreApi<AppState>, shouldRecord = () => true) {
  const past: Entry[] = [];
  const future: Entry[] = [];
  let applying = false;
  let paused = 0;
  const unsubscribe = store.subscribe((state, previous) => {
    if (applying || paused || !shouldRecord() || state.isExporting || previous.isExporting || state.isLoading || previous.isLoading) return;
    const changed = fields.filter(field => state[field] !== previous[field]);
    if (!changed.length) return;
    const changes: Change[] = [];
    for (const field of changed) {
      if (nestedFields.has(field)) collectChanges(previous[field], state[field], [field], changes);
      else changes.push({ path: [field], before: previous[field], after: state[field], hadBefore: true, hadAfter: true });
    }
    if (!changes.length) return;
    const active = typeof document === 'undefined' ? null : document.activeElement;
    const group = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
    const now = Date.now();
    const last = past.at(-1);
    if (group && last?.group === group && now - last.time < 600 && changes.every(change => last.changes.some(old => old.path.join('\0') === change.path.join('\0')))) {
      for (const change of changes) {
        const old = last.changes.find(item => item.path.join('\0') === change.path.join('\0'))!;
        old.after = change.after; old.hadAfter = change.hadAfter;
      }
      last.time = now;
    } else {
      past.push({ changes, group, time: now });
      if (past.length > 100) past.shift();
    }
    future.length = 0;
  });
  const apply = (from: Entry[], to: Entry[], direction: 'before' | 'after') => {
    if (store.getState().isExporting || store.getState().isLoading) return false;
    const entry = from.pop();
    if (!entry) return false;
    // Native text undo may have changed a field since its entry was recorded.
    // Redo must restore the value that was actually present before this undo.
    if (direction === 'before') {
      const current = store.getState() as unknown as Record<string, unknown>;
      for (const change of entry.changes) {
        let value: unknown = current;
        for (const key of change.path) value = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
        change.after = value;
      }
    }
    applying = true;
    try {
      store.setState(produce((draft: AppState) => {
        for (const change of entry.changes) {
          let target = draft as unknown as Record<string, unknown>;
          for (const key of change.path.slice(0, -1)) {
            if (!target[key] || typeof target[key] !== 'object') target[key] = {};
            target = target[key] as Record<string, unknown>;
          }
          const key = change.path[change.path.length - 1];
          if (direction === 'before' ? change.hadBefore : change.hadAfter) target[key] = change[direction];
          else delete target[key];
        }
      }));
    } finally { applying = false; }
    entry.group = null;
    to.push(entry);
    return true;
  };
  return {
    undo: () => apply(past, future, 'before'),
    redo: () => apply(future, past, 'after'),
    clear: () => { past.length = 0; future.length = 0; },
    pause: () => { paused += 1; return () => { paused = Math.max(0, paused - 1); }; },
    dispose: unsubscribe,
  };
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return !['button', 'checkbox', 'color', 'file', 'radio', 'range', 'submit', 'reset'].includes(target.type);
  return target instanceof HTMLElement && !!target.isContentEditable;
}

export function historyShortcut(event: KeyboardEvent): 'undo' | 'redo' | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if ((key === 'r' || key === 'y') && !event.shiftKey) return 'redo';
  return null;
}
