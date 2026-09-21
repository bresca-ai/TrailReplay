import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { useComputedJourney } from '@/hooks/useComputedJourney';
import { convertElevation } from '@/utils/units';
import { trackEvent } from '@/utils/analytics';
import { localizedAnnotation } from '@/utils/annotationTranslations';
import { sideAnnotationContent } from '@/components/annotations/sideAnnotationContent';
import { annotationMapGlyph, mapAnnotationSymbol } from '@/components/annotations/annotationSymbol';
import { LANDMARK_GLYPH_KEYS, LANDMARK_GLYPH_LABELS, PINHEAD_PATHS } from '@/components/map/landmarkGlyphs';
import { MapPinned, Play, Plus, Trash2 } from 'lucide-react';
import type { TextAnnotation } from '@/types';

const DEFAULT_ANNOTATION_DURATION = 4000;
const DEFAULT_ANNOTATION_COLOR = '#f3b133';
const ANNOTATION_COLORS = ['#f3b133', '#ff7a59', '#53c16d', '#3b82f6', '#8b5cf6', '#ec4899'];

function AnnotationSymbolPicker({ value, onChange, label, emojiLabel }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  emojiLabel: string;
}) {
  const selectedGlyph = annotationMapGlyph(value);
  return <fieldset className="w-full space-y-2">
    <legend className="text-xs font-medium text-[var(--evergreen)]">{label}</legend>
    <div className="flex flex-wrap gap-1.5">
      {LANDMARK_GLYPH_KEYS.map((glyph) => <button
        key={glyph}
        type="button"
        aria-label={LANDMARK_GLYPH_LABELS[glyph]}
        aria-pressed={selectedGlyph === glyph}
        title={LANDMARK_GLYPH_LABELS[glyph]}
        onClick={() => onChange(mapAnnotationSymbol(glyph))}
        className={`grid h-9 w-9 place-items-center rounded-md border transition-colors ${selectedGlyph === glyph ? 'border-[var(--trail-orange)] bg-[var(--trail-orange-15)] text-[var(--trail-orange)]' : 'border-[var(--evergreen)]/20 text-[var(--evergreen)] hover:border-[var(--trail-orange)]'}`}
      ><svg aria-hidden="true" width="19" height="19" viewBox="0 0 15 15"><path fill="currentColor" d={PINHEAD_PATHS[glyph]} /></svg></button>)}
      <button type="button" aria-label={emojiLabel} title={emojiLabel} aria-pressed={!selectedGlyph} onClick={() => onChange('🚰')}
        className={`rounded-md border px-2 text-xs ${!selectedGlyph ? 'border-[var(--trail-orange)] bg-[var(--trail-orange-15)]' : 'border-[var(--evergreen)]/20'}`}>{emojiLabel}</button>
    </div>
    {!selectedGlyph && <input aria-label={`${label} ${emojiLabel}`} value={value} onChange={(event) => onChange(event.target.value)} maxLength={8}
      className="w-20 rounded border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-2 py-1 text-sm" />}
  </fieldset>;
}

export function RouteAnnotationsEditor() {
  const { t, language } = useI18n();
  const playback = useAppStore((state) => state.playback);
  const unitSystem = useAppStore((state) => state.settings.unitSystem);
  const textAnnotations = useAppStore((state) => state.textAnnotations);
  const addTextAnnotation = useAppStore((state) => state.addTextAnnotation);
  const updateTextAnnotation = useAppStore((state) => state.updateTextAnnotation);
  const removeTextAnnotation = useAppStore((state) => state.removeTextAnnotation);
  const seekToProgress = useAppStore((state) => state.seekToProgress);

  const [draftAnnotationTitle, setDraftAnnotationTitle] = useState('');
  const [draftAnnotationSubtitle, setDraftAnnotationSubtitle] = useState('');
  const [draftEyebrow, setDraftEyebrow] = useState('');
  const [draftCode, setDraftCode] = useState('');
  const [draftMeta, setDraftMeta] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftAnnotationColor, setDraftAnnotationColor] = useState(DEFAULT_ANNOTATION_COLOR);
  const [draftPresentation, setDraftPresentation] = useState<'map-card' | 'side-panel'>('side-panel');
  const [draftLogo, setDraftLogo] = useState(mapAnnotationSymbol('pin'));
  const [draftHoldSeconds, setDraftHoldSeconds] = useState(6);
  const updateWording = (annotation: TextAnnotation, updates: { title?: string; subtitle?: string; eyebrow?: string; meta?: string; description?: string }) => {
    const existing = annotation.translations?.[language];
    const shown = localizedAnnotation(annotation, language);
    const content = sideAnnotationContent(shown);
    updateTextAnnotation(annotation.id, {
      translations: {
        ...annotation.translations,
        [language]: {
          title: updates.title ?? existing?.title ?? (annotation.presentation === 'side-panel' ? content.title : shown.title),
          subtitle: updates.subtitle ?? existing?.subtitle ?? annotation.subtitle,
          eyebrow: updates.eyebrow ?? existing?.eyebrow ?? annotation.eyebrow,
          meta: updates.meta ?? existing?.meta ?? content.meta ?? undefined,
          description: updates.description ?? existing?.description ?? content.description,
        },
      },
    });
  };

  const moveToPlayhead = (annotation: TextAnnotation) => {
    if (!currentPosition) return;
    updateTextAnnotation(annotation.id, {
      progress: playback.progress,
      routeDistance,
      lat: currentPosition.lat,
      lon: currentPosition.lon,
      elevation: currentPosition.elevation > 0 ? currentPosition.elevation : undefined,
    });
  };

  const { currentPosition, routeDistance } = useComputedJourney();
  const canAddAnnotation = Boolean(currentPosition);

  const handleAddAnnotation = () => {
    if (!currentPosition || !draftAnnotationTitle.trim()) return;

    const annotationId = crypto.randomUUID();
    addTextAnnotation({
      id: annotationId,
      progress: playback.progress,
      routeDistance,
      lat: currentPosition.lat,
      lon: currentPosition.lon,
      title: draftAnnotationTitle.trim(),
      ...(draftPresentation === 'map-card' ? { subtitle: draftAnnotationSubtitle.trim() || undefined } : {
        code: draftCode.trim() || undefined,
        meta: draftMeta.trim() || undefined,
        description: draftDescription.trim() || undefined,
      }),
      color: draftAnnotationColor,
      elevation: currentPosition.elevation > 0 ? currentPosition.elevation : undefined,
      displayDuration: DEFAULT_ANNOTATION_DURATION,
      translations: { [language]: { title: draftAnnotationTitle.trim(), ...(draftPresentation === 'map-card' ? { subtitle: draftAnnotationSubtitle.trim() || undefined } : { eyebrow: draftEyebrow.trim() || undefined, meta: draftMeta.trim() || undefined, description: draftDescription.trim() || undefined }) } },
      presentation: draftPresentation,
      logo: draftLogo,
      ...(draftPresentation === 'side-panel' ? { holdDuration: draftHoldSeconds * 1000 } : {}),
    });
    trackEvent('annotation_created', { annotation_type: 'text' });
    setDraftAnnotationTitle('');
    setDraftAnnotationSubtitle('');
    setDraftEyebrow('');
    setDraftCode('');
    setDraftMeta('');
    setDraftDescription('');
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-[var(--evergreen-60)]">{t('annotations.translationFallback')}</p>
      <div className="space-y-3 rounded-lg border border-[var(--evergreen)]/15 p-3 bg-[var(--evergreen)]/3">
        <p className="text-xs text-[var(--evergreen-60)]">
          {t('annotations.routeAnnotationsHint')}
        </p>

        {draftPresentation === 'side-panel' && <label className="block text-xs text-[var(--evergreen)]">{t('annotations.eyebrowLabel')}
          <input value={draftEyebrow} onChange={(e) => setDraftEyebrow(e.target.value)} placeholder={t('annotations.sidePanelEyebrow')} maxLength={36} className="mt-1 w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm" />
        </label>}
        {draftPresentation === 'side-panel' && <label className="block text-xs text-[var(--evergreen)]">{t('annotations.codeLabel')}
          <input value={draftCode} onChange={(e) => setDraftCode(e.target.value)} maxLength={12} className="mt-1 w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm" />
        </label>}
        <input
          value={draftAnnotationTitle}
          onChange={(e) => setDraftAnnotationTitle(e.target.value)}
          placeholder={t('annotations.routeAnnotationTitlePlaceholder')}
          className="w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--evergreen)] outline-none focus:border-[var(--trail-orange)]"
          maxLength={120}
        />

        {draftPresentation === 'side-panel' ? <>
          <label className="block text-xs text-[var(--evergreen)]">{t('annotations.routeDetailsLabel')}
            <input value={draftMeta} onChange={(e) => setDraftMeta(e.target.value)} placeholder={t('annotations.routeDetailsPlaceholder')} maxLength={100} className="mt-1 w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs text-[var(--evergreen)]">{t('annotations.descriptionLabel')}
            <textarea value={draftDescription} onChange={(e) => setDraftDescription(e.target.value)} maxLength={600} className="mt-1 w-full min-h-20 rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm" />
          </label>
        </> : <textarea
          value={draftAnnotationSubtitle}
          onChange={(e) => setDraftAnnotationSubtitle(e.target.value)}
          placeholder={t('annotations.routeAnnotationSubtitlePlaceholder')}
          className="w-full min-h-20 rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--evergreen)] outline-none focus:border-[var(--trail-orange)]"
          maxLength={600}
        />}

        <div className="flex flex-wrap gap-2">
          <label className="text-xs text-[var(--evergreen)]">{t('annotations.presentationLabel')}
            <select value={draftPresentation} onChange={(e) => setDraftPresentation(e.target.value as 'map-card' | 'side-panel')}
              className="ml-2 rounded border bg-[var(--canvas)] p-2">
              <option value="map-card">{t('annotations.presentationMapCard')}</option><option value="side-panel">{t('annotations.presentationSidePanel')}</option>
            </select>
          </label>
          <AnnotationSymbolPicker value={draftLogo} onChange={setDraftLogo} label={t('annotations.logoLabel')} emojiLabel={t('annotations.emojiLabel')} />
          {draftPresentation === 'side-panel' && <>
            <label className="text-xs text-[var(--evergreen)]">{t('annotations.slowdownSeconds')} <input type="number" min="0" max="30" value={draftHoldSeconds} onChange={(e) => setDraftHoldSeconds(Math.max(0, Math.min(30, Number(e.target.value) || 0)))} className="ml-2 w-16 rounded border bg-[var(--canvas)] p-2" /></label>
          </>}
        </div>

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
              const content = sideAnnotationContent(localizedAnnotation(annotation, language));
              const isSidePanel = annotation.presentation === 'side-panel';
              const annotationElevation = annotation.elevation !== undefined
                ? `${Math.round(convertElevation(annotation.elevation, unitSystem)).toLocaleString()} ${unitSystem === 'metric' ? 'm' : 'ft'}`
                : null;

              return (
                <div
                  key={annotation.id}
                  className="space-y-3 rounded-lg border border-[var(--evergreen)]/15 bg-[var(--evergreen)]/3 p-3"
                >
                  {isSidePanel && <label className="block text-xs text-[var(--evergreen)]">{t('annotations.eyebrowLabel')}
                    <input value={content.eyebrow ?? ''} onChange={(e) => updateWording(annotation, { eyebrow: e.target.value })} placeholder={t('annotations.sidePanelEyebrow')} maxLength={36} className="mt-1 w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm" />
                  </label>}
                  {isSidePanel && <label className="block text-xs text-[var(--evergreen)]">{t('annotations.codeLabel')}
                    <input value={content.code ?? ''} onChange={(e) => updateTextAnnotation(annotation.id, { code: e.target.value })} maxLength={12} className="mt-1 w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm" />
                  </label>}
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full border border-white/40"
                      style={{ backgroundColor: annotation.color }}
                    />
                    <input
                      value={isSidePanel ? content.title : localizedAnnotation(annotation, language).title}
                      onChange={(e) => updateWording(annotation, { title: e.target.value })}
                      aria-label={t('annotations.routeAnnotationTitlePlaceholder')}
                      className="flex-1 rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--evergreen)] outline-none focus:border-[var(--trail-orange)]"
                      maxLength={120}
                    />
                  </div>

                  {isSidePanel ? <>
                    <label className="block text-xs text-[var(--evergreen)]">{t('annotations.routeDetailsLabel')}
                      <input value={content.meta ?? ''} onChange={(e) => updateWording(annotation, { meta: e.target.value })} maxLength={100} className="mt-1 w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-xs text-[var(--evergreen)]">{t('annotations.descriptionLabel')}
                      <textarea value={content.description} onChange={(e) => updateWording(annotation, { description: e.target.value })} maxLength={600} className="mt-1 w-full min-h-20 rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm" />
                    </label>
                  </> : <textarea
                    value={localizedAnnotation(annotation, language).subtitle ?? ''}
                    onChange={(e) => updateWording(annotation, { subtitle: e.target.value })}
                    placeholder={t('annotations.routeAnnotationSubtitlePlaceholder')}
                    className="w-full min-h-20 rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--evergreen)] outline-none focus:border-[var(--trail-orange)]"
                    maxLength={600}
                  />}
                  <div className="flex flex-wrap gap-2 text-xs text-[var(--evergreen)]">
                    <select aria-label={t('annotations.presentationLabel')} value={annotation.presentation ?? 'map-card'} onChange={(e) => {
                      const presentation = e.target.value as 'map-card' | 'side-panel';
                      updateTextAnnotation(annotation.id, {
                        presentation,
                        ...(presentation === 'side-panel' ? { logo: annotation.logo || mapAnnotationSymbol('pin'), holdDuration: annotation.holdDuration ?? 6000 } : {}),
                      });
                    }} className="rounded border bg-[var(--canvas)] p-2">
                      <option value="map-card">{t('annotations.presentationMapCard')}</option><option value="side-panel">{t('annotations.presentationSidePanel')}</option>
                    </select>
                    <AnnotationSymbolPicker value={annotation.logo ?? mapAnnotationSymbol('pin')} onChange={(logo) => updateTextAnnotation(annotation.id, { logo })} label={t('annotations.logoLabel')} emojiLabel={t('annotations.emojiLabel')} />
                    {annotation.presentation === 'side-panel' && <>
                      <label>{t('annotations.slowdownSeconds')} <input type="number" min="0" max="30" value={(annotation.holdDuration ?? 0) / 1000} onChange={(e) => updateTextAnnotation(annotation.id, { holdDuration: Math.max(0, Math.min(30, Number(e.target.value) || 0)) * 1000 })} className="w-16 rounded border bg-[var(--canvas)] p-2" /></label>
                    </>}
                  </div>

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

                    <button type="button" onClick={() => moveToPlayhead(annotation)} disabled={!currentPosition || Math.abs(playback.progress - annotation.progress) < 0.00001}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--evergreen)]/15 bg-[var(--canvas)]/70 px-3 py-2 text-sm text-[var(--evergreen)] hover:bg-[var(--evergreen)]/10 disabled:opacity-40"
                      title={t('annotations.moveToPlayheadHint')}>
                      <MapPinned className="w-4 h-4" />{t('annotations.moveToPlayhead')}
                    </button>

                    {annotation.presentation !== 'side-panel' && <label className="flex items-center gap-2 rounded-lg border border-[var(--evergreen)]/15 bg-[var(--canvas)]/70 px-3 py-2 text-xs font-medium text-[var(--evergreen-60)]">
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
                    </label>}

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
