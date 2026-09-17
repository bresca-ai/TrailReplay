import { useEffect, useRef, useState } from 'react';
import type * as maplibregl from 'maplibre-gl';
import {
  getMapLibreTileKey,
  NOOP_TILE_PRELOAD_OBSERVER,
  type TilePreloadObserver,
} from '@/utils/tilePreloadObserver';
import type {
  TileDiagnosticRecord,
  TilePreloadSummary,
} from '@/utils/tilePreloadDiagnostics';

type DevelopmentTilePreloadObserver = TilePreloadObserver & {
  snapshot(): { records: TileDiagnosticRecord[]; summary: TilePreloadSummary };
};

function isDevelopmentDiagnostics(
  observer: TilePreloadObserver,
): observer is DevelopmentTilePreloadObserver {
  return 'snapshot' in observer && typeof observer.snapshot === 'function';
}

export function useTilePreloadDiagnostics({
  isMapLoaded,
  isPlaying,
  mapRef,
}: {
  isMapLoaded: boolean;
  isPlaying: boolean;
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
}) {
  const [diagnostics, setDiagnostics] = useState<TilePreloadObserver>(NOOP_TILE_PRELOAD_OBSERVER);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    let disposed = false;
    void import('@/utils/tilePreloadDiagnostics').then(({ TilePreloadDiagnostics }) => {
      if (!disposed) setDiagnostics(new TilePreloadDiagnostics());
    });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (isPlaying && !isPlayingRef.current) diagnostics.reset();
    isPlayingRef.current = isPlaying;
  }, [diagnostics, isPlaying]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;
    const sourceId = (event: unknown) => (event as { sourceId?: string }).sourceId;
    const onLoading = (event: unknown) => {
      if (!isPlayingRef.current) return;
      const key = getMapLibreTileKey(event);
      const source = sourceId(event);
      if (key && source) diagnostics.requestVisibleTile(source, key);
    };
    const onData = (event: unknown) => {
      const key = getMapLibreTileKey(event);
      const source = sourceId(event);
      if (key && source) diagnostics.markTileReady(source, key);
    };
    const onAbort = (event: unknown) => {
      const key = getMapLibreTileKey(event);
      const source = sourceId(event);
      if (key && source) diagnostics.markTileAborted(source, key);
    };
    const onError = (event: unknown) => {
      const key = getMapLibreTileKey(event);
      const source = sourceId(event);
      if (key && source) diagnostics.markTileFailed(source, key);
    };

    map.on('sourcedataloading', onLoading);
    map.on('sourcedata', onData);
    map.on('sourcedataabort', onAbort);
    map.on('error', onError);
    return () => {
      map.off('sourcedataloading', onLoading);
      map.off('sourcedata', onData);
      map.off('sourcedataabort', onAbort);
      map.off('error', onError);
    };
  }, [diagnostics, isMapLoaded, mapRef]);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    if (!isDevelopmentDiagnostics(diagnostics)) return;
    window.__trailReplayTileDiagnostics = () => diagnostics.snapshot();
    const publishSnapshot = () => {
      document.documentElement.dataset.tilePreloadDiagnostics = JSON.stringify(diagnostics.snapshot().summary);
    };
    publishSnapshot();
    const intervalId = window.setInterval(publishSnapshot, 500);

    return () => {
      window.clearInterval(intervalId);
      delete window.__trailReplayTileDiagnostics;
      delete document.documentElement.dataset.tilePreloadDiagnostics;
    };
  }, [diagnostics]);

  return diagnostics;
}
