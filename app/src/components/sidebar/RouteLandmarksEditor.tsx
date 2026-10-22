import { useMemo } from 'react';
import { Flag } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { LandmarkType } from '@/types/landmarks';
import { trackEvent } from '@/utils/analytics';
import { useI18n } from '@/i18n/useI18n';
import { RouteLandmarkList } from './RouteLandmarkList';
import {
  MAX_LANDMARK_SCALE,
  MIN_LANDMARK_SCALE,
  clampLandmarkScale,
} from '@/components/map/landmarkSymbolStyle';

export function RouteLandmarksEditor() {
  const { t } = useI18n();
  const showAutomaticLandmarks = useAppStore((state) => state.showAutomaticLandmarks);
  const nearbyPlacesEnabled = useAppStore((state) => state.nearbyPlacesEnabled);
  const nearbyPlacesLoading = useAppStore((state) => state.nearbyPlacesLoading);
  const nearbyPlacesError = useAppStore((state) => state.nearbyPlacesError);
  const nearbyPlacesCoverage = useAppStore((state) => state.nearbyPlacesCoverage);
  const enrichedLandmarks = useAppStore((state) => state.enrichedLandmarks);
  const nearbyPlaceTypes = useAppStore((state) => state.nearbyPlaceTypes);
  const setShowAutomaticLandmarks = useAppStore((state) => state.setShowAutomaticLandmarks);
  const setNearbyPlacesEnabled = useAppStore((state) => state.setNearbyPlacesEnabled);
  const setNearbyPlaceTypes = useAppStore((state) => state.setNearbyPlaceTypes);
  const landmarkScale = useAppStore((state) => state.settings.landmarkScale);
  const labelFade = useAppStore((state) => state.settings.landmarkLabelFade);
  const setSettings = useAppStore((state) => state.setSettings);

  const placeTypes = useMemo(() => {
    const counts = new Map<LandmarkType, number>();
    enrichedLandmarks.forEach((landmark) => counts.set(landmark.type, (counts.get(landmark.type) ?? 0) + 1));
    return [...counts.entries()].sort(([a], [b]) =>
      t(`routeLandmarks.types.${a}`).localeCompare(t(`routeLandmarks.types.${b}`)),
    );
  }, [enrichedLandmarks, t]);

  const togglePlaceType = (type: LandmarkType) => {
    const currentlyVisible = nearbyPlaceTypes === null || nearbyPlaceTypes.includes(type);
    const current = nearbyPlaceTypes ?? placeTypes.map(([entry]) => entry);
    setNearbyPlaceTypes(currentlyVisible ? current.filter((entry) => entry !== type) : [...current, type]);
  };

  return <div className="space-y-3 rounded-lg border border-[var(--evergreen)]/15 bg-[var(--evergreen)]/3 p-3">
    <div className="flex items-center gap-2"><Flag className="h-4 w-4 text-[var(--trail-orange)]" /><p className="text-sm font-medium text-[var(--evergreen)]">{t('routeLandmarks.title')}</p></div>
    <p className="text-xs text-[var(--evergreen-60)]">{t('routeLandmarks.description')}</p>
    <label className="flex items-start justify-between gap-3 rounded-lg bg-[var(--canvas)]/60 px-2.5 py-2"><span><span className="block text-xs font-medium text-[var(--evergreen)]">{t('routeLandmarks.routeMoments')}</span><span className="block pt-0.5 text-[11px] text-[var(--evergreen-60)]">{t('routeLandmarks.routeMomentsDescription')}</span></span><input type="checkbox" checked={showAutomaticLandmarks} onChange={(event) => { const enabled = event.target.checked; setShowAutomaticLandmarks(enabled); trackEvent('feature_enabled', { feature_name: 'route_moments', feature_state: enabled ? 'enabled' : 'disabled', feature_context: 'landmarks' }); }} /></label>
    <label className="flex items-start justify-between gap-3 rounded-lg bg-[var(--canvas)]/60 px-2.5 py-2"><span><span className="block text-xs font-medium text-[var(--evergreen)]">{t('routeLandmarks.nearbyPlaces')}</span><span className="block pt-0.5 text-[11px] text-[var(--evergreen-60)]">{t('routeLandmarks.nearbyPlacesDescription')}</span></span><input type="checkbox" checked={nearbyPlacesEnabled} onChange={(event) => { const enabled = event.target.checked; setNearbyPlacesEnabled(enabled); trackEvent('feature_enabled', { feature_name: 'nearby_named_places', feature_state: enabled ? 'enabled' : 'disabled', feature_context: 'landmarks' }); }} /></label>
    {nearbyPlacesLoading && <p className="text-xs text-[var(--evergreen-60)]">{t('routeLandmarks.findingNearbyPlaces')}</p>}
    {nearbyPlacesError && <p className="text-xs text-red-600">{nearbyPlacesError}</p>}
    {nearbyPlacesEnabled && !nearbyPlacesLoading && !nearbyPlacesError && placeTypes.length > 0 && <div className="space-y-2 rounded-lg bg-[var(--canvas)]/60 p-2.5"><p className="text-xs font-medium text-[var(--evergreen)]">{t('routeLandmarks.showPlaceTypes')}</p>{placeTypes.map(([type, count]) => <label key={type} className="flex items-center justify-between gap-3 text-xs text-[var(--evergreen)]"><span className="flex items-center gap-2"><input type="checkbox" checked={nearbyPlaceTypes === null || nearbyPlaceTypes.includes(type)} onChange={() => togglePlaceType(type)} />{t(`routeLandmarks.types.${type}`)}</span><span className="text-[var(--evergreen-60)]">{count}</span></label>)}</div>}
    {nearbyPlacesEnabled && !nearbyPlacesLoading && !nearbyPlacesError && <p className="text-xs text-[var(--evergreen-60)]">{enrichedLandmarks.length > 0 ? t(enrichedLandmarks.length === 1 ? 'routeLandmarks.namedPlaceLoaded' : 'routeLandmarks.namedPlacesLoaded', { count: enrichedLandmarks.length }) : t('routeLandmarks.nearbyPlacesLoadHint')}</p>}
    {nearbyPlacesCoverage?.complete && <p className="text-[11px] text-[var(--evergreen-60)]">{t('routeLandmarks.completeCoverage')} · {nearbyPlacesCoverage.source === 'landmark-database' ? t('routeLandmarks.landmarkDatabase') : nearbyPlacesCoverage.cacheHits === nearbyPlacesCoverage.tiles ? t('routeLandmarks.sharedCache') : t(nearbyPlacesCoverage.fetchedTiles === 1 ? 'routeLandmarks.areaAdded' : 'routeLandmarks.areasAdded', { count: nearbyPlacesCoverage.fetchedTiles })}</p>}
    <RouteLandmarkList />
    <div className="space-y-2 rounded-lg bg-[var(--canvas)]/60 p-2.5">
      <div className="flex items-baseline justify-between"><span className="text-xs font-medium text-[var(--evergreen)]">{t('routeLandmarks.landmarkSize')}</span><span className="text-[11px] text-[var(--evergreen-60)]">{Math.round(clampLandmarkScale(landmarkScale) * 100)}%</span></div>
      <input type="range" min={MIN_LANDMARK_SCALE} max={MAX_LANDMARK_SCALE} step={0.1} value={clampLandmarkScale(landmarkScale)} onChange={(event) => { const scale = Number(event.target.value); setSettings({ landmarkScale: scale }); trackEvent('settings_changed', { setting_name: 'landmark_scale', setting_value: scale }); }} className="w-full accent-[var(--trail-orange)]" />
      <label className="flex items-start justify-between gap-3"><span><span className="block text-xs font-medium text-[var(--evergreen)]">{t('routeLandmarks.fadeLabels')}</span><span className="block pt-0.5 text-[11px] text-[var(--evergreen-60)]">{t('routeLandmarks.fadeLabelsDescription')}</span></span><input type="checkbox" checked={labelFade} onChange={(event) => { const enabled = event.target.checked; setSettings({ landmarkLabelFade: enabled }); trackEvent('feature_enabled', { feature_name: 'landmark_label_fade', feature_state: enabled ? 'enabled' : 'disabled', feature_context: 'landmarks' }); }} /></label>
    </div>
    {nearbyPlacesEnabled && <p className="text-[11px] text-[var(--evergreen-60)]">{t('routeLandmarks.osmAttributionPrefix')} © <a className="underline hover:text-[var(--trail-orange)]" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>, {t('routeLandmarks.osmAttributionSuffix')}</p>}
  </div>;
}
