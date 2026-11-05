import { useEffect, type RefObject } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { locationChapterIntroProgressRef } from '@/utils/locationChapterCamera';

const SOURCE = 'location-start-cue';
const RING = 'location-start-cue-ring';
const HALO = 'location-start-cue-halo';
const DOT = 'location-start-cue-dot';

/** A screen-sized beacon anchored to the route's actual start during the opening. */
export function useLocationStartCue(mapRef: RefObject<MapLibreMap | null>, loaded: boolean, phase: string,
  coordinate: number[] | undefined, color: string, enabled: boolean) {
  const lon = coordinate?.[0], lat = coordinate?.[1];
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !enabled || phase !== 'intro' || !Number.isFinite(lon) || !Number.isFinite(lat)) return;

    let installing = false;
    const update = () => {
      if (!map.getLayer(DOT) || !map.getLayer(RING) || !map.getLayer(HALO)) return;
      const progress = Math.max(0, Math.min(1, locationChapterIntroProgressRef.current));
      // Progress comes from the camera clock, so this is identical in video
      // exports and paused/restarted intros instead of depending on wall time.
      const pulse = (progress * 4) % 1;
      const fade = Math.min(1, progress * 12, (1 - progress) * 8);
      map.setPaintProperty(RING, 'circle-radius', 11 + 29 * pulse);
      map.setPaintProperty(RING, 'circle-stroke-opacity', fade * (1 - pulse) * .85);
      map.setPaintProperty(HALO, 'circle-radius', 12 + 3 * Math.sin(progress * Math.PI * 8));
      map.setPaintProperty(HALO, 'circle-opacity', fade * .22);
      map.setPaintProperty(DOT, 'circle-opacity', fade);
      map.setPaintProperty(DOT, 'circle-stroke-opacity', fade);
    };
    const ensure = () => {
      if (installing || (map.getSource(SOURCE) && map.getLayer(RING) && map.getLayer(HALO) && map.getLayer(DOT))) return;
      installing = true;
      try {
        if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lon!, lat!] } } });
        if (!map.getLayer(HALO)) map.addLayer({ id: HALO, type: 'circle', source: SOURCE, paint: { 'circle-color': color, 'circle-opacity': 0, 'circle-blur': .6, 'circle-pitch-alignment': 'viewport' } });
        if (!map.getLayer(RING)) map.addLayer({ id: RING, type: 'circle', source: SOURCE, paint: { 'circle-color': color, 'circle-opacity': 0, 'circle-stroke-color': color, 'circle-stroke-width': 2, 'circle-stroke-opacity': 0, 'circle-pitch-alignment': 'viewport' } });
        if (!map.getLayer(DOT)) map.addLayer({ id: DOT, type: 'circle', source: SOURCE, paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-opacity': 0, 'circle-stroke-color': color, 'circle-stroke-width': 3, 'circle-stroke-opacity': 0, 'circle-pitch-alignment': 'viewport' } });
        update();
      } catch { /* Retry after a style replacement becomes ready. */ }
      finally { installing = false; }
    };
    map.on('styledata', ensure); map.on('sourcedata', ensure); map.on('move', update);
    ensure();
    return () => {
      map.off('styledata', ensure); map.off('sourcedata', ensure); map.off('move', update);
      for (const layer of [DOT, RING, HALO]) if (map.getLayer(layer)) map.removeLayer(layer);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    };
  }, [color, enabled, lat, loaded, lon, mapRef, phase]);
}
