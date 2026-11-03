import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { LOCATION_LEVELS, loadLocationAtPosition, type LocationLevel } from '@/utils/locationBoundaries';

export type StartLocationResult = { status: 'pending' | 'available' | 'unavailable' | 'error'; name?: string };
type Results = Record<LocationLevel, StartLocationResult>;
type Entry = { results: Results; listeners: Set<() => void>; running: boolean; started: boolean; point: [number, number] };
const entries = new Map<string, Entry>();
const emptyResults = Object.fromEntries(LOCATION_LEVELS.map(level => [level, { status: 'pending' }])) as Results;
const noop = () => {};

function entryFor(lon: number, lat: number): Entry {
  const key = `${lon},${lat}`;
  let entry = entries.get(key);
  if (!entry) {
    entry = { results: emptyResults, listeners: new Set(), running: false, started: false, point: [lon, lat] };
    entries.set(key, entry);
  }
  return entry;
}
function update(entry: Entry, level: LocationLevel, result: StartLocationResult) {
  entry.results = { ...entry.results, [level]: result };
  entry.listeners.forEach(listener => listener());
}
function start(entry: Entry) {
  if (entry.running) return;
  entry.started = true;
  const queue = LOCATION_LEVELS.filter(level => entry.results[level].status === 'pending');
  if (!queue.length) return;
  entry.running = true;
  let next = 0;
  void Promise.all(Array.from({ length: Math.min(2, queue.length) }, async () => {
    while (next < queue.length) {
      const level = queue[next++];
      try {
        const place = await loadLocationAtPosition(entry.point, level);
        update(entry, level, place ? { status: 'available', name: place.properties.name } : { status: 'unavailable' });
      } catch { update(entry, level, { status: 'error' }); }
    }
  })).finally(() => { entry.running = false; });
}

/** Shares a bounded lookup between the map and its controls, including while the panel is closed. */
export function useStartLocationLevels(coordinate: number[] | undefined) {
  const lon = coordinate?.[0], lat = coordinate?.[1];
  const entry = typeof lon === 'number' && Number.isFinite(lon) && typeof lat === 'number' && Number.isFinite(lat) ? entryFor(lon, lat) : undefined;
  const subscribe = useCallback((listener: () => void) => {
    if (!entry) return noop;
    entry.listeners.add(listener);
    return () => { entry.listeners.delete(listener); };
  }, [entry]);
  const snapshot = useCallback(() => entry?.results ?? emptyResults, [entry]);
  const results = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { if (entry && !entry.started) start(entry); }, [entry]);
  const retry = useCallback(() => {
    if (!entry || entry.running) return;
    for (const level of LOCATION_LEVELS) if (entry.results[level].status === 'error') update(entry, level, { status: 'pending' });
    start(entry);
  }, [entry]);
  return { results, hasStart: Boolean(entry), retry };
}
