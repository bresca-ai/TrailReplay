import { useContext, useSyncExternalStore } from 'react';
import { MenuDesignContext } from './menuDesign';

const query = '(min-width: 1024px)';

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function getSnapshot() {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches;
}

/** Keep the existing combined map/camera workflow on smaller screens. */
export function useDesktopViewport() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useDesktopSidebar() {
  const desktop = useDesktopViewport();
  const design = useContext(MenuDesignContext);
  return desktop && design === 'new';
}
