import { useEffect, useMemo, useState } from 'react';
import { MapPin, Pencil, Plus, Trash2, Undo2, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useAllRouteLandmarks } from '@/hooks/useAllRouteLandmarks';
import {
  colorForLandmark,
  LANDMARK_COLORS,
} from '@/components/map/landmarkGlyphs';
import { landmarkIconFromSymbol, landmarkSymbol } from '@/components/map/landmarkSymbols';
import { annotationSymbolPath, needsPinheadIcons } from '@/components/annotations/annotationSymbol';
import { usePinheadIcons } from '@/components/annotations/pinheadIcons';
import { AnnotationSymbolPicker } from './AnnotationSymbolPicker';
import { trackEvent } from '@/utils/analytics';
import type { RouteLandmark } from '@/types/landmarks';
import { sanitizeCoordinates } from '@/components/sidebar/landmarks/coordinates.ts';
import { mapGlobalRef } from '@/utils/mapRef.ts';
import { createUserLandmark } from '@/utils/createUserLandmark.ts';
import { useFindNearestRoutePoint } from '@/components/map/hooks/useFindNearestRoutePoint.ts';
import { useI18n } from '@/i18n/useI18n';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback.ts';

function GlyphIcon({ symbol, color, size = 16 }: { symbol: string; color: string; size?: number }) {
  const path = annotationSymbolPath(symbol);
  if (!path) return <span aria-hidden="true" className="flex-shrink-0" style={{ fontSize: size, lineHeight: 1 }}>{symbol}</span>;
  return (
    <svg viewBox="0 0 15 15" width={size} height={size} aria-hidden="true" className="flex-shrink-0">
      <path d={path} fill={color} />
    </svg>
  );
}

/**
 * The editor for one landmark. Derived landmarks (route moments, OSM places)
 * are adopted into the user's own list on first edit, so every landmark on the
 * map can be renamed, re-iconed, recolored or removed through the same form.
 */
function LandmarkEditor({ landmark }: { landmark: RouteLandmark }) {
  const { t } = useI18n();
  const userLandmarks = useAppStore((state) => state.userLandmarks);
  const updateLandmark = useAppStore((state) => state.updateLandmark);
  const removeLandmark = useAppStore((state) => state.removeLandmark);
  const hideLandmark = useAppStore((state) => state.hideLandmark);
  const adoptLandmark = useAppStore((state) => state.adoptLandmark);
  const selectLandmark = useAppStore((state) => state.selectLandmark);

  const isOwned = userLandmarks.some((entry) => entry.id === landmark.id);
  const symbol = landmarkSymbol(landmark);
  const color = landmark.color ?? colorForLandmark(landmark);

  const edit = (updates: Partial<RouteLandmark>) => {
    if (!isOwned) adoptLandmark(landmark);
    updateLandmark(landmark.id, updates);
  };

  return (
    <div className="space-y-3 rounded-lg border border-[var(--trail-orange)]/40 bg-[var(--trail-orange-15)] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--evergreen)]">{t('routeLandmarks.editLandmark')}</span>
        <button
          onClick={() => selectLandmark(null)}
          className="rounded p-1 text-[var(--evergreen-60)] hover:text-[var(--evergreen)]"
          aria-label={t('routeLandmarks.closeEditor')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <label className="block">
        <span className="block text-[11px] text-[var(--evergreen-60)]">{t('routeLandmarks.name')}</span>
        <input
          type="text"
          value={landmark.title}
          onChange={(event) => edit({ title: event.target.value })}
          className="mt-1 w-full rounded-lg border border-[var(--evergreen)]/30 bg-[var(--canvas)] px-2 py-1.5 text-sm text-[var(--evergreen)] focus:border-[var(--trail-orange)] focus:outline-none"
        />
      </label>

      <AnnotationSymbolPicker value={symbol} label={t('routeLandmarks.icon')} onChange={(value) => edit({ icon: landmarkIconFromSymbol(value) })} />

      <div>
        <span className="block text-[11px] text-[var(--evergreen-60)]">{t('routeLandmarks.color')}</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {LANDMARK_COLORS.map((swatch) => (
            <button
              key={swatch}
              onClick={() => edit({ color: swatch })}
              aria-label={t('routeLandmarks.useColor', { color: swatch })}
              aria-pressed={color.toLowerCase() === swatch.toLowerCase()}
              style={{ backgroundColor: swatch }}
              className={`h-6 w-6 rounded-full border-2 ${
                color.toLowerCase() === swatch.toLowerCase()
                  ? 'border-[var(--evergreen)]'
                  : 'border-[var(--evergreen)]/20'
              }`}
            />
          ))}
        </div>
      </div>

      <button
        onClick={() => {
          if (isOwned) removeLandmark(landmark.id); else hideLandmark(landmark.id);
          trackEvent('feature_enabled', {
            feature_name: 'landmark_removed',
            feature_state: 'enabled',
            feature_context: isOwned ? 'user' : 'derived',
          });
        }}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-500/40 px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {t('routeLandmarks.removeFromMap')}
      </button>
    </div>
  );
}

type Coordinates = [number, number];

export function RouteLandmarkList() {
  const { t } = useI18n();
  const landmarks = useAllRouteLandmarks();
  usePinheadIcons(needsPinheadIcons(landmarks.map((landmark) => landmark.icon)));
  const selectedLandmarkId = useAppStore((state) => state.selectedLandmarkId);
  const selectLandmark = useAppStore((state) => state.selectLandmark);
  const isPlacingLandmark = useAppStore((state) => state.isPlacingLandmark);
  const setIsPlacingLandmark = useAppStore((state) => state.setIsPlacingLandmark);
  const hiddenLandmarkIds = useAppStore((state) => state.hiddenLandmarkIds);
  const restoreHiddenLandmarks = useAppStore((state) => state.restoreHiddenLandmarks);
  const userLandmarks = useAppStore((state) => state.userLandmarks);
  const addLandmark = useAppStore((state) => state.addLandmark);
  const findNearestRoutePoint = useFindNearestRoutePoint();
  const [landmarkCoordinates, setLandmarkCoordinates] = useState<string>('');

  const [addLandmarkDelayed, cancelCoordinatesDelayed, hasDelay] = useDebouncedCallback((props: {
    coordinates: Coordinates
  }): void => {
    mapGlobalRef.current?.flyTo({
      center: { lng: props.coordinates[1], lat: props.coordinates[0] }
    });

    const nearest = findNearestRoutePoint(props.coordinates[0], props.coordinates[1])

    const landmark = createUserLandmark({
      lat: props.coordinates[0],
      lon: props.coordinates[1],
      progress: nearest?.progress ?? null,
    });

    addLandmark(landmark);
    setIsPlacingLandmark(false);
    selectLandmark(landmark.id);

    setLandmarkCoordinates('');
  }, 1);

  const setCoordinatesDelayed = (coordinates: Coordinates | undefined): void => {
    if (coordinates) {
      addLandmarkDelayed({ coordinates });
    } else {
      cancelCoordinatesDelayed();
    }
  }

  useEffect(() => {
    if (!isPlacingLandmark) {
      cancelCoordinatesDelayed();
    }
  }, [isPlacingLandmark, cancelCoordinatesDelayed]);

  const ordered = useMemo(
    () => [...landmarks].sort((left, right) => (left.progress ?? 1) - (right.progress ?? 1)),
    [landmarks],
  );
  const selected = ordered.find((landmark) => landmark.id === selectedLandmarkId) ?? null;
  // Only derived landmarks are hidden rather than deleted, so restoring brings
  // back exactly the automatic and OSM entries the user cleared.
  const restorableCount = hiddenLandmarkIds.filter(
    (id) => !userLandmarks.some((entry) => entry.id === id),
  ).length;

  return (
    <div className="space-y-2 rounded-lg bg-[var(--canvas)]/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-[var(--evergreen)]">{t('routeLandmarks.onMap')}</p>
        <span className="text-[11px] text-[var(--evergreen-60)]">{ordered.length}</span>
      </div>

      <button
        onClick={() => {
          const next = !isPlacingLandmark;
          setIsPlacingLandmark(next);
          if (next) {
            trackEvent('feature_enabled', {
              feature_name: 'landmark_placement',
              feature_state: 'enabled',
              feature_context: 'landmarks',
            });
          } else {
            setLandmarkCoordinates('');
          }
        }}
        className={`flex w-full items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-1.5 text-xs font-medium transition-colors ${
          isPlacingLandmark
            ? 'border-[var(--trail-orange)] bg-[var(--trail-orange-15)] text-[var(--evergreen)]'
            : 'border-[var(--evergreen)]/20 text-[var(--evergreen)] hover:border-[var(--trail-orange)]/50'
        }`}
      >
        {isPlacingLandmark ? <MapPin className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        {isPlacingLandmark ? t('routeLandmarks.clickMapToPlace') : t('routeLandmarks.addLandmark')}
      </button>

      {isPlacingLandmark && <label className="block">
        <div className="block text-[11px] text-[var(--evergreen-60)] flex items-center justify-start gap-2">
          <span>{t('routeLandmarks.pasteCoordinates')}</span>
          {hasDelay && <div
            className="mx-auto h-3 w-3 rounded-full border-1 border-[var(--trail-orange)] border-t-transparent animate-spin" />}

        </div>
        <input
          type="text"
          value={landmarkCoordinates}
          onChange={(event) => {
            setLandmarkCoordinates(event.target.value);
            setCoordinatesDelayed(sanitizeCoordinates(event.target.value));
          }}
          className="mt-1 w-full rounded-lg border border-[var(--evergreen)]/30 bg-[var(--canvas)] px-2 py-1.5 text-sm text-[var(--evergreen)] focus:border-[var(--trail-orange)] focus:outline-none"
        />
      </label>}

      {selected && <LandmarkEditor landmark={selected} />}

      {ordered.length === 0 ? (
        <p className="text-[11px] text-[var(--evergreen-60)]">
          {t('routeLandmarks.empty')}
        </p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {ordered.map((landmark) => {
            const isSelected = landmark.id === selectedLandmarkId;
            return (
              <li key={landmark.id}>
                <button
                  onClick={() => selectLandmark(isSelected ? null : landmark.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                    isSelected ? 'bg-[var(--trail-orange-15)]' : 'hover:bg-[var(--evergreen)]/5'
                  }`}
                >
                  <GlyphIcon
                    symbol={landmarkSymbol(landmark)}
                    color={landmark.color ?? colorForLandmark(landmark)}
                  />
                  <span className="flex-1 truncate text-xs text-[var(--evergreen)]">{landmark.title}</span>
                  <Pencil className="h-3 w-3 flex-shrink-0 text-[var(--evergreen-60)]" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {restorableCount > 0 && (
        <button
          onClick={restoreHiddenLandmarks}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-[var(--evergreen-60)] hover:text-[var(--evergreen)]"
        >
          <Undo2 className="h-3 w-3" />
          {t(restorableCount === 1 ? 'routeLandmarks.restoreRemovedLandmark' : 'routeLandmarks.restoreRemovedLandmarks', { count: restorableCount })}
        </button>
      )}
    </div>
  );
}
