import { useCallback } from 'react';
import { useDropzone, type DropEvent } from 'react-dropzone';
import { useAppStore } from '@/store/useAppStore';
import { useGPX } from '@/hooks/useGPX';
import { useI18n } from '@/i18n/useI18n';
import { Upload } from 'lucide-react';
import { TrackItem } from '@/components/sidebar/tracks/TrackItem';
import { RecipeReportCard } from '@/components/sidebar/tracks/RecipeReportCard';
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
  const settings = useAppStore((state) => state.settings);
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen);
  const setExploreMode = useAppStore((state) => state.setExploreMode);
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
          </div>
          <div className="space-y-3">
            {tracks.map((track) => (
              <TrackItem
                key={track.id}
                track={track}
                isActive={activeTrackId === track.id}
                onActivate={() => setActiveTrack(track.id)}
                onRemove={() => removeTrack(track.id)}
                onToggleVisibility={() => toggleTrackVisibility(track.id)}
                onColorChange={(color) => updateTrackColor(track.id, color)}
                onNameChange={(name) => updateTrackName(track.id, name)}
                settings={settings}
              />
            ))}
          </div>
        </section>
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
