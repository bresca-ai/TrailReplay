import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone, type DropEvent } from 'react-dropzone';
import { useAppStore } from '@/store/useAppStore';
import { useGPX } from '@/hooks/useGPX';
import { getSupportedRouteFileExtension, parseFIT, parseGPX, parseKML } from '@/utils/gpxParser';
import { useI18n } from '@/i18n/useI18n';
import {
  Upload,
  GitCompareArrows,
} from 'lucide-react';
import { ComparisonTrackItem } from '@/components/sidebar/tracks/ComparisonTrackItem';
import { TrackItem } from '@/components/sidebar/tracks/TrackItem';
import { RecipeReportCard } from '@/components/sidebar/tracks/RecipeReportCard';
import { COMPARISON_COLORS } from '@/components/sidebar/tracks/constants';
import { trackEvent } from '@/utils/analytics';

export function TracksPanel() {
  const { t } = useI18n();
  const { parseFiles, isParsing } = useGPX();
  const tracks = useAppStore((state) => state.tracks);
  const activeTrackId = useAppStore((state) => state.activeTrackId);
  const removeTrack = useAppStore((state) => state.removeTrack);
  const setActiveTrack = useAppStore((state) => state.setActiveTrack);
  const updateTrackColor = useAppStore((state) => state.updateTrackColor);
  const updateTrackName = useAppStore((state) => state.updateTrackName);
  const toggleTrackVisibility = useAppStore((state) => state.toggleTrackVisibility);
  const reorderTracks = useAppStore((state) => state.reorderTracks);
  const settings = useAppStore((state) => state.settings);
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen);
  const setExploreMode = useAppStore((state) => state.setExploreMode);
  const setError = useAppStore((state) => state.setError);

  // Comparison track state
  const comparisonTracks = useAppStore((state) => state.comparisonTracks);
  const addComparisonTrack = useAppStore((state) => state.addComparisonTrack);
  const removeComparisonTrack = useAppStore((state) => state.removeComparisonTrack);
  const ungroupComparisonTrack = useAppStore((state) => state.ungroupComparisonTrack);
  const updateComparisonTrackName = useAppStore((state) => state.updateComparisonTrackName);
  const [showComparison, setShowComparison] = useState(comparisonTracks.length > 0);
  const [isParsingComparison, setIsParsingComparison] = useState(false);
  const comparisonFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (comparisonTracks.length > 0) setShowComparison(true);
    // Only auto-open when a group first appears; the user can still collapse it afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisonTracks.length > 0]);

  const handleComparisonFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = getSupportedRouteFileExtension(file.name);
    if (!extension) {
      setError(t('errors.noValidGpx'));
      e.target.value = '';
      return;
    }

    setIsParsingComparison(true);
    try {
      let track;
      if (extension === 'fit') {
        track = parseFIT(await file.arrayBuffer(), file.name);
      } else if (extension === 'gpx') {
        track = parseGPX(await file.text(), file.name);
      } else {
        track = parseKML(await file.text(), file.name);
      }
      const colorIndex = comparisonTracks.length % COMPARISON_COLORS.length;
      addComparisonTrack({
        id: `comparison-${Date.now()}`,
        name: track.name,
        color: COMPARISON_COLORS[colorIndex],
        track,
        visible: true,
        offset: 0,
      });
      trackEvent('comparison_track_added', {
        comparison_track_count: comparisonTracks.length + 1,
      });
    } catch (err) {
      console.error('Failed to parse comparison GPX:', err);
      setError(t('errors.parseGpxFailed'));
    } finally {
      setIsParsingComparison(false);
      if (comparisonFileRef.current) comparisonFileRef.current.value = '';
    }
  }, [addComparisonTrack, comparisonTracks.length, setError, t]);
  
  const onDrop = useCallback(async (
    acceptedFiles: File[],
    _fileRejections: unknown[],
    event: DropEvent,
  ) => {
    const trailFiles = acceptedFiles.filter(
      (file) => {
        const extension = file.name.split('.').pop()?.toLowerCase();
        // `json` is a recipe, which arrives alongside the routes it names.
        return extension === 'gpx' || extension === 'kml' || extension === 'fit' ||
          extension === 'replay' || extension === 'json' ||
          file.type === 'application/gpx+xml' ||
          file.type === 'application/vnd.google-earth.kml+xml' ||
          file.type === 'application/json';
      }
    );
    if (trailFiles.length > 0) {
      try {
        await parseFiles(
          trailFiles,
          !Array.isArray(event) && event.type === 'drop' ? 'dropzone' : 'file_picker',
        );
      } catch {
        // `parseFiles` already reports the failure through the app store.
      }
    }
  }, [parseFiles]);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onFileDialogOpen: () => {
      trackEvent('file_picker_opened', { picker_location: 'tracks_panel' });
    },
    accept: {
      'application/gpx+xml': ['.gpx'],
      'application/vnd.google-earth.kml+xml': ['.kml'],
      // A watch's original recording, which keeps the timestamps a GPX
      // route export drops.
      'application/octet-stream': ['.fit'],
      'application/zip': ['.replay'],
      // A recipe is dropped together with the routes it names.
      'application/json': ['.json'],
    },
    multiple: true,
    disabled: isParsing,
  });

  const handleReorder = (fromIndex: number, toIndex: number) => {
    reorderTracks(fromIndex, toIndex);
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        {...getRootProps()}
        className={`
          tr-dropzone p-6
          ${isDragActive ? 'border-[var(--trail-orange)] bg-[var(--trail-orange-15)]' : ''}
        `}
      >
        <input {...getInputProps()} />
        <Upload className="w-10 h-10 mx-auto mb-3 text-[var(--evergreen-60)]" />
        <p className="text-sm font-medium text-[var(--evergreen)]">
          {isDragActive ? t('tracks.dropActive') : t('tracks.dropTitle')}
        </p>
        <p className="text-xs text-[var(--evergreen-60)] mt-1">
          {t('tracks.dropBrowse')}
        </p>
        <p className="text-[0.65rem] text-[var(--evergreen-40)] mt-2 leading-snug">
          {t('tracks.dropHint')}
        </p>
      </div>
      {/* Track List */}
      <RecipeReportCard />

      {tracks.length > 0 && (
        <section className="border-t border-[var(--evergreen)]/15 pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--evergreen)]">
              {t('tracks.loadedTracks', { count: tracks.length })}
            </h3>
            <span className="whitespace-nowrap text-[11px] text-[var(--evergreen-60)]">
              {t('tracks.dragReorder')}
            </span>
          </div>
          <div className="space-y-3">
            {tracks.map((track, index) => (
              <TrackItem
                key={track.id}
                track={track}
                index={index}
                isActive={activeTrackId === track.id}
                onActivate={() => setActiveTrack(track.id)}
                onRemove={() => removeTrack(track.id)}
                onToggleVisibility={() => toggleTrackVisibility(track.id)}
                onColorChange={(color) => updateTrackColor(track.id, color)}
                onNameChange={(name) => updateTrackName(track.id, name)}
                onReorder={handleReorder}
                settings={settings}
              />
            ))}
          </div>
        </section>
      )}
      
      {/* Comparison Mode */}
      {tracks.length > 0 && (
        <div>
          <button
            onClick={() => setShowComparison(!showComparison)}
            className="flex items-center gap-2 w-full text-left mb-3"
          >
            <GitCompareArrows className="w-4 h-4 text-[var(--evergreen-60)]" />
            <h3 className="text-sm font-bold text-[var(--evergreen)] uppercase tracking-wide">
              {t('tracks.comparisonTitle')}
            </h3>
            <span className="text-xs text-[var(--evergreen-60)] ml-auto">
              {showComparison ? t('tracks.comparisonToggleOpen') : t('tracks.comparisonToggleClosed')}
            </span>
          </button>

          {showComparison && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--evergreen-60)]">
                {t('tracks.comparisonHint')}
              </p>

              {/* Comparison track list */}
              {comparisonTracks.map((ct) => (
                <ComparisonTrackItem
                  key={ct.id}
                  track={ct}
                  settings={settings}
                  onNameChange={(name) => updateComparisonTrackName(ct.id, name)}
                  onRemove={() => removeComparisonTrack(ct.id)}
                  onUngroup={() => ungroupComparisonTrack(ct.id)}
                />
              ))}

              {/* Add comparison file */}
              <div>
                <input
                  ref={comparisonFileRef}
                  type="file"
                  accept=".gpx,.kml,.fit"
                  onChange={handleComparisonFile}
                  className="hidden"
                />
                <button
                  onClick={() => comparisonFileRef.current?.click()}
                  disabled={isParsingComparison}
                  className="tr-btn tr-btn-secondary w-full text-sm"
                >
                  {isParsingComparison ? t('tracks.parsingComparison') : t('tracks.addComparison')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {tracks.length === 0 && !isParsing && (
        <div className="text-center py-8 text-[var(--evergreen-60)]">
          <p className="text-sm">{t('tracks.emptyTitle')}</p>
          <p className="text-xs mt-1">{t('tracks.emptySubtitle')}</p>
          <button
            onClick={() => {
              setExploreMode(true);
              setSidebarOpen(false);
            }}
            className="tr-btn tr-btn-secondary w-full text-sm mt-4"
          >
            {t('tracks.explore')}
          </button>
        </div>
      )}
    </div>
  );
}
