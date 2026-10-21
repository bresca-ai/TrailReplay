import * as maplibregl from 'maplibre-gl';
import { PAINTED_TRAIL_TIP_KIND, PAINTED_TRAIL_TIP_LAYER } from '@/utils/paintedTrailTip';

export function setupTrackSources(map: maplibregl.Map, trailColor: string) {
  if (!map.getSource('trail-line')) {
    map.addSource('trail-line', {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
    });
  }

  if (!map.getSource('trail-completed')) {
    map.addSource('trail-completed', {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
    });
  }

  if (!map.getSource('transport-line')) {
    map.addSource('transport-line', {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: [] } },
    });
  }

  if (!map.getSource('main-track-label')) {
    map.addSource('main-track-label', {
      type: 'geojson',
      data: { type: 'Feature', properties: { label: '' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    });
  }

  if (!map.getLayer('trail-line')) {
    map.addLayer({
      id: 'trail-line',
      type: 'line',
      source: 'trail-line',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#C1652F', 'line-width': 4, 'line-opacity': 0.5 },
    });
  }

  if (!map.getLayer('transport-line')) {
    map.addLayer({
      id: 'transport-line',
      type: 'line',
      source: 'transport-line',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#888888',
        'line-width': 3,
        'line-opacity': 0.6,
        'line-dasharray': [2, 2],
      },
    });
  }

  if (!map.getLayer('trail-completed')) {
    map.addLayer({
      id: 'trail-completed',
      type: 'line',
      source: 'trail-completed',
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#C1652F', 'line-width': 6 },
    });
  }

  if (!map.getLayer(PAINTED_TRAIL_TIP_LAYER)) {
    map.addLayer({
      id: PAINTED_TRAIL_TIP_LAYER,
      type: 'circle',
      source: 'trail-completed',
      filter: ['==', ['get', 'kind'], PAINTED_TRAIL_TIP_KIND],
      // Queryable even though transparent. Rendering this point with the line
      // lets the DOM adornment follow the tiles actually painted this frame.
      paint: { 'circle-radius': 1, 'circle-opacity': 0, 'circle-stroke-width': 0 },
    });
  }

  if (!map.getLayer('main-track-label')) {
    map.addLayer({
      id: 'main-track-label',
      type: 'symbol',
      source: 'main-track-label',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 12,
        'text-offset': [0, -2.5],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'text-anchor': 'center',
        visibility: 'none',
      },
      paint: {
        'text-color': trailColor,
        'text-halo-color': '#FFFFFF',
        'text-halo-width': 2,
      },
    });
  }
}
