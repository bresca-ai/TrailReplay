import { create } from 'zustand';

export interface StoryPreviewState {
  isOpen: boolean;
  trigger: HTMLElement | null;
  open: (trigger: HTMLElement) => void;
  close: () => void;
}

export const useStoryPreview = create<StoryPreviewState>((set) => ({
  isOpen: false,
  trigger: null,
  open: (trigger) => set({ isOpen: true, trigger }),
  close: () => set({ isOpen: false }),
}));

export function storyScroller(root: ParentNode | null): HTMLElement | null {
  return root?.querySelector<HTMLElement>('[data-story-scroller]') ?? null;
}
