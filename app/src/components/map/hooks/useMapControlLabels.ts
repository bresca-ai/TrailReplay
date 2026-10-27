import { useEffect, type RefObject } from 'react';
import type { Map } from 'maplibre-gl';
import { useI18n } from '@/i18n/useI18n';

/** Refresh MapLibre's built-in button labels without recreating the map. */
export function useMapControlLabels(mapRef: RefObject<Map | null>, isMapLoaded: boolean) {
  const { t } = useI18n();
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;
    const update = () => {
      map.getCanvas().setAttribute('aria-label', t('interface.mapCanvas'));
      const labels = [
        ['.maplibregl-ctrl-zoom-in', 'imageExport.zoomIn'],
        ['.maplibregl-ctrl-zoom-out', 'imageExport.zoomOut'],
        ['.maplibregl-ctrl-compass', 'interface.resetBearing'],
        ['.maplibregl-ctrl-fullscreen, .maplibregl-ctrl-shrink', 'app.fullscreen'],
      ];
      labels.forEach(([selector, key]) => {
        map.getContainer().querySelectorAll(selector).forEach((button) => {
          button.setAttribute('title', t(key));
          button.setAttribute('aria-label', t(key));
        });
      });
    };
    update();
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update);
    };
  }, [mapRef, isMapLoaded, t]);
}
