import { useEffect, useRef } from 'react';
import { mapGlobalRef } from '@/utils/mapRef';

/** Redraw the live map in step with either panel's width transition. */
export function useRailMapResize() {
  const observer = useRef<ResizeObserver | null>(null);

  const stop = () => {
    observer.current?.disconnect();
    observer.current = null;
  };

  const start = () => {
    if (observer.current) return;
    const map = mapGlobalRef.current;
    if (!map) return;
    observer.current = new ResizeObserver(() => {
      if (mapGlobalRef.current !== map) return;
      map.resize();
      map.redraw();
    });
    observer.current.observe(map.getContainer());
  };

  useEffect(() => () => observer.current?.disconnect(), []);
  return { start, stop };
}
