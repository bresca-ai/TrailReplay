import { create } from 'zustand';

// Its own store, like useWaypointImportQueue: never in AppState, so opening the preview is not an undo step.
export interface StoryPreviewState {
  isOpen: boolean;
  trigger: HTMLElement | null; // gets focus back on close while it is still in the page
  open: (trigger: HTMLElement) => void;
  close: () => void;
}

export const useStoryPreview = create<StoryPreviewState>((set) => ({
  isOpen: false,
  trigger: null,
  open: (trigger) => set({ isOpen: true, trigger }),
  close: () => set({ isOpen: false }),
}));

/** StoryView's scroll container: it takes focus on open and is what the probe scrolls. */
export function storyScroller(root: ParentNode | null | undefined): HTMLElement | null {
  return root?.querySelector<HTMLElement>('[data-story-scroller]') ?? null;
}
