type MediaHoldClock = { kind: 'picture' | 'video'; id: string; elapsedMs: number } | null;
let current: MediaHoldClock = null;
const listeners = new Set<() => void>();
export function setMediaHoldClock(value: MediaHoldClock) {
  current = value;
  listeners.forEach((listener) => listener());
}
export function getMediaHoldClock() { return current; }
export function subscribeMediaHoldClock(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
