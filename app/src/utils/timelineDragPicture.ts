let pictureId: string | null = null;
const listeners = new Set<() => void>();
export function setTimelineDraggedPicture(id: string | null) {
  if (pictureId === id) return;
  pictureId = id;
  listeners.forEach((listener) => listener());
}
export function getTimelineDraggedPicture() { return pictureId; }
export function subscribeTimelineDraggedPicture(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
