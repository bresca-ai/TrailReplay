import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { useComputedJourney } from '@/hooks/useComputedJourney';
import { convertElevation } from '@/utils/units';
import { trackEvent } from '@/utils/analytics';
import { MapPinned, Play, Plus, Trash2 } from 'lucide-react';

const DEFAULT_ANNOTATION_DURATION = 4000;
const DEFAULT_ANNOTATION_COLOR = '#f3b133';
const ANNOTATION_COLORS = ['#f3b133', '#ff7a59', '#53c16d', '#3b82f6', '#8b5cf6', '#ec4899'];

export function RouteAnnotationsEditor() {
  const { t } = useI18n();
  const playback = useAppStore((state) => state.playback);
  const unitSystem = useAppStore((state) => state.settings.unitSystem);
  const textAnnotations = useAppStore((state) => state.textAnnotations);
  const addTextAnnotation = useAppStore((state) => state.addTextAnnotation);
  const updateTextAnnotation = useAppStore((state) => state.updateTextAnnotation);
  const removeTextAnnotation = useAppStore((state) => state.removeTextAnnotation);
  const seekToProgress = useAppStore((state) => state.seekToProgress);

  const [draftAnnotationTitle, setDraftAnnotationTitle] = useState('');
  const [draftAnnotationSubtitle, setDraftAnnotationSubtitle] = useState('');
  const [draftAnnotationColor, setDraftAnnotationColor] = useState(DEFAULT_ANNOTATION_COLOR);

  const { currentPosition } = useComputedJourney();
  const canAddAnnotation = Boolean(currentPosition);

  const handleAddAnnotation = () => {
    if (!currentPosition || !draftAnnotationTitle.trim()) return;

    const annotationId = crypto.randomUUID();
    addTextAnnotation({
      id: annotationId,
      progress: playback.progress,
      lat: currentPosition.lat,
      lon: currentPosition.lon,
      title: draftAnnotationTitle.trim(),
      subtitle: draftAnnotationSubtitle.trim() || undefined,
      color: draftAnnotationColor,
      elevation: currentPosition.elevation > 0 ? currentPosition.elevation : undefined,
      displayDuration: DEFAULT_ANNOTATION_DURATION,
    });
    trackEvent('annotation_created', { annotation_type: 'text' });
    setDraftAnnotationTitle('');
    setDraftAnnotationSubtitle('');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border border-[var(--evergreen)]/15 p-3 bg-[var(--evergreen)]/3">
        <p className="text-xs text-[var(--evergreen-60)]">
          {t('annotations.routeAnnotationsHint')}
        </p>

        <input
          value={draftAnnotationTitle}
          onChange={(e) => setDraftAnnotationTitle(e.target.value)}
          placeholder={t('annotations.routeAnnotationTitlePlaceholder')}
          className="w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--evergreen)] outline-none focus:border-[var(--trail-orange)]"
          maxLength={48}
        />

        <input
          value={draftAnnotationSubtitle}
          onChange={(e) => setDraftAnnotationSubtitle(e.target.value)}
          placeholder={t('annotations.routeAnnotationSubtitlePlaceholder')}
          className="w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--evergreen)] outline-none focus:border-[var(--trail-orange)]"
          maxLength={48}
        />

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--evergreen-60)]">
            {t('annotations.routeAnnotationColor')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {ANNOTATION_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setDraftAnnotationColor(color)}
                className={`h-7 w-7 rounded-full border-2 transition-transform ${
                  draftAnnotationColor === color
                    ? 'scale-110 border-[var(--evergreen)]'
                    : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: color }}
                title={t('annotations.routeAnnotationColor')}
              />
            ))}
            <input
              type="color"
              value={draftAnnotationColor}
              onChange={(e) => setDraftAnnotationColor(e.target.value)}
              className="h-8 w-10 rounded border border-[var(--evergreen)]/20 bg-[var(--canvas)]"
              aria-label={t('annotations.routeAnnotationColor')}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-[var(--evergreen)]/10 bg-[var(--canvas)]/55 px-3 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--evergreen)]">
              {canAddAnnotation
                ? t('annotations.routeAnnotationReady', { percent: (playback.progress * 100).toFixed(0) })
                : t('annotations.routeAnnotationNoPosition')}
            </p>
            {currentPosition?.elevation ? (
              <p className="text-[11px] text-[var(--evergreen-60)] mt-0.5">
                {t('annotations.routeAnnotationElevation', {
                  elevation: Math.round(convertElevation(currentPosition.elevation, unitSystem)).toLocaleString(),
                  unit: unitSystem === 'metric' ? 'm' : 'ft',
                })}
              </p>
              ) : null}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAddAnnotation}
              disabled={!canAddAnnotation || !draftAnnotationTitle.trim()}
              className="tr-btn tr-btn-primary inline-flex w-full items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              {t('annotations.addRouteAnnotation')}
            </button>
          </div>
        </div>
      </div>

      {textAnnotations.length === 0 ? (
        <div className="text-center py-8 text-[var(--evergreen-60)]">
          <p className="text-sm">{t('annotations.routeAnnotationsEmpty')}</p>
          <p className="text-xs mt-1">{t('media.routeAnnotationsEmptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {textAnnotations
            .slice()
            .sort((a, b) => a.progress - b.progress)
            .map((annotation) => {
              const annotationElevation = annotation.elevation !== undefined
                ? `${Math.round(convertElevation(annotation.elevation, unitSystem)).toLocaleString()} ${unitSystem === 'metric' ? 'm' : 'ft'}`
                : null;

              return (
                <div
                  key={annotation.id}
                  className="space-y-3 rounded-lg border border-[var(--evergreen)]/15 bg-[var(--evergreen)]/3 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full border border-white/40"
                      style={{ backgroundColor: annotation.color }}
                    />
                    <input
                      value={annotation.title}
                      onChange={(e) => updateTextAnnotation(annotation.id, { title: e.target.value })}
                      className="flex-1 rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--evergreen)] outline-none focus:border-[var(--trail-orange)]"
                      maxLength={48}
                    />
                  </div>

                  <input
                    value={annotation.subtitle ?? ''}
                    onChange={(e) => updateTextAnnotation(annotation.id, { subtitle: e.target.value || undefined })}
                    placeholder={t('annotations.routeAnnotationSubtitlePlaceholder')}
                    className="w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--evergreen)] outline-none focus:border-[var(--trail-orange)]"
                    maxLength={48}
                  />

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--evergreen-60)]">
                    <div className="flex items-center gap-2 rounded-full bg-[var(--canvas)]/70 px-2 py-1">
                      {ANNOTATION_COLORS.map((color) => (
                        <button
                          key={`${annotation.id}-${color}`}
                          type="button"
                          onClick={() => updateTextAnnotation(annotation.id, { color })}
                          className={`h-4 w-4 rounded-full border ${
                            annotation.color === color ? 'border-[var(--evergreen)] scale-110' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color }}
                          title={t('annotations.routeAnnotationColor')}
                        />
                      ))}
                      <input
                        type="color"
                        value={annotation.color}
                        onChange={(e) => updateTextAnnotation(annotation.id, { color: e.target.value })}
                        className="h-5 w-6 rounded border border-[var(--evergreen)]/20 bg-[var(--canvas)]"
                        aria-label={t('annotations.routeAnnotationColor')}
                      />
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--canvas)]/70 px-2 py-1">
                      <MapPinned className="w-3 h-3" />
                      {t('annotations.routeAnnotationProgress', { percent: (annotation.progress * 100).toFixed(0) })}
                    </span>
                    {annotationElevation && (
                      <span className="rounded-full bg-[var(--canvas)]/70 px-2 py-1">
                        {annotationElevation}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => seekToProgress(annotation.progress)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--evergreen)]/15 bg-[var(--canvas)]/70 px-3 py-2 text-sm text-[var(--evergreen)] hover:bg-[var(--evergreen)]/10"
                    >
                      <Play className="w-4 h-4" />
                      {t('annotations.goToAnnotation')}
                    </button>

                    <label className="flex items-center gap-2 rounded-lg border border-[var(--evergreen)]/15 bg-[var(--canvas)]/70 px-3 py-2 text-xs font-medium text-[var(--evergreen-60)]">
                      <span className="whitespace-nowrap">{t('annotations.annotationLeadTimeShort')}</span>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={Math.round(annotation.displayDuration / 1000)}
                        onChange={(e) => {
                          const value = Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1));
                          updateTextAnnotation(annotation.id, { displayDuration: value * 1000 });
                        }}
                        className="min-w-0 flex-1 rounded-md border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-2 py-1.5 text-sm text-[var(--evergreen)] outline-none focus:border-[var(--trail-orange)]"
                        title={t('annotations.annotationLeadTime')}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => removeTextAnnotation(annotation.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 hover:bg-red-100"
                      title={t('annotations.removeRouteAnnotation')}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                      <span>{t('common.remove')}</span>
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
