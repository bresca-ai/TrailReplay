import { useEffect, useMemo, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { useComputedJourney } from '@/hooks/useComputedJourney';
import { convertElevation, formatDistance } from '@/utils/units';
import { ANNOTATION_DRAG_TYPE } from '@/utils/pendingMediaPlacement';
import { annotationPlacementAtDistance } from '@/utils/annotationPlacement';
import { mapGlobalRef } from '@/utils/mapRef';
import { trackEvent } from '@/utils/analytics';
import { localizedAnnotation } from '@/utils/annotationTranslations';
import { sideAnnotationContent } from '@/components/annotations/sideAnnotationContent';
import { mapAnnotationSymbol, pinheadAnnotationSymbol } from '@/components/annotations/annotationSymbol';
import { AnnotationSymbolPicker } from './AnnotationSymbolPicker';
import { ChevronDown, MapPinned, Play, Plus, Trash2 } from 'lucide-react';
import type { TextAnnotation } from '@/types';

const DEFAULT_ANNOTATION_DURATION = 4000;
const DEFAULT_ANNOTATION_COLOR = '#f3b133';
const ANNOTATION_COLORS = ['#f3b133', '#ff7a59', '#53c16d', '#3b82f6', '#8b5cf6', '#ec4899'];

export function RouteAnnotationsEditor() {
  const { t, language } = useI18n();
  const playback = useAppStore((state) => state.playback);
  const unitSystem = useAppStore((state) => state.settings.unitSystem);
  const textAnnotations = useAppStore((state) => state.textAnnotations);
  const addTextAnnotation = useAppStore((state) => state.addTextAnnotation);
  const updateTextAnnotation = useAppStore((state) => state.updateTextAnnotation);
  const removeTextAnnotation = useAppStore((state) => state.removeTextAnnotation);
  const seekToProgress = useAppStore((state) => state.seekToProgress);
  const markerSize = useAppStore((state) => state.settings.annotationMarkerScale ?? state.settings.annotationScale ?? 1);
  const textSize = useAppStore((state) => state.settings.annotationTextScale ?? state.settings.annotationScale ?? 1);
  const setSettings = useAppStore((state) => state.setSettings);
  const defaultPinLead = useAppStore((state) => state.settings.annotationPinLeadDuration ?? 5000);
  const defaultHold = useAppStore((state) => state.settings.annotationHoldDuration ?? 5000);

  const [draftAnnotationTitle, setDraftAnnotationTitle] = useState('');
  const [draftEyebrow, setDraftEyebrow] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftAnnotationColor, setDraftAnnotationColor] = useState(DEFAULT_ANNOTATION_COLOR);
  const [draftPresentation, setDraftPresentation] = useState<'map-card' | 'side-panel'>('side-panel');
  const [draftMarkerFilled, setDraftMarkerFilled] = useState(true);
  const [draftLogo, setDraftLogo] = useState(pinheadAnnotationSymbol('jug_and_apple'));
  const [draftShowOnMatchingRoutes, setDraftShowOnMatchingRoutes] = useState(false);
  const [composerOpen, setComposerOpen] = useState(textAnnotations.length === 0);
  const [chosenDistance, setChosenDistance] = useState<number | null>(null);
  const [distanceDraft, setDistanceDraft] = useState<string | null>(null);
  const updateWording = (annotation: TextAnnotation, updates: { title?: string; subtitle?: string; eyebrow?: string; meta?: string; description?: string }) => {
    const existing = annotation.translations?.[language];
    const shown = localizedAnnotation(annotation, language);
    const content = sideAnnotationContent(shown);
    updateTextAnnotation(annotation.id, {
      ...(updates.eyebrow !== undefined ? { code: '' } : {}),
      translations: {
        ...annotation.translations,
        [language]: {
          title: updates.title ?? existing?.title ?? content.title,
          subtitle: updates.description !== undefined ? '' : updates.subtitle ?? existing?.subtitle ?? annotation.subtitle,
          eyebrow: updates.eyebrow ?? existing?.eyebrow ?? annotation.eyebrow,
          meta: updates.description !== undefined ? '' : updates.meta ?? existing?.meta ?? content.meta ?? undefined,
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

  const { currentPosition, routeDistance, totalDistance = 0, computedJourney = null, activeTrack = null, routeTimingMode = 'recorded' } = useComputedJourney();
  const selectedDistance = Math.max(0, Math.min(totalDistance, chosenDistance ?? routeDistance));
  const placement = useMemo(() => chosenDistance === null && currentPosition
    ? { lat: currentPosition.lat, lon: currentPosition.lon, elevation: currentPosition.elevation, routeDistance, progress: playback.progress }
    : annotationPlacementAtDistance(selectedDistance, computedJourney, activeTrack, routeTimingMode),
  [chosenDistance, currentPosition, routeDistance, playback.progress, selectedDistance, computedJourney, activeTrack, routeTimingMode]);
  const canAddAnnotation = Boolean(placement);
  const unitDivisor = unitSystem === 'metric' ? 1000 : 1609.344;
  const distanceUnit = unitSystem === 'metric' ? 'km' : 'mi';
  const distanceValue = (selectedDistance / unitDivisor).toFixed(2);

  // This marker is a temporary map preview, never part of the saved project or video.
  useEffect(() => {
    if (!composerOpen || !placement || !mapGlobalRef.current) return;
    const marker = new maplibregl.Marker({ color: '#C1652F' }).setLngLat([placement.lon, placement.lat]).addTo(mapGlobalRef.current);
    marker.getElement().style.pointerEvents = 'none';
    return () => { marker.remove(); };
  }, [composerOpen, placement?.lat, placement?.lon]);

  const handleAddAnnotation = () => {
    if (!placement) return;

    const annotationId = crypto.randomUUID();
    addTextAnnotation({
      id: annotationId,
      progress: placement.progress,
      showOnMatchingRoutes: draftShowOnMatchingRoutes || undefined,
      routeDistance: placement.routeDistance,
      lat: placement.lat,
      lon: placement.lon,
      title: draftAnnotationTitle.trim(),
      description: draftDescription.trim() || undefined,
      color: draftAnnotationColor,
      elevation: placement.elevation > 0 ? placement.elevation : undefined,
      displayDuration: DEFAULT_ANNOTATION_DURATION,
      translations: { [language]: { title: draftAnnotationTitle.trim(), eyebrow: draftEyebrow.trim() || undefined, description: draftDescription.trim() || undefined } },
      presentation: draftPresentation,
      logo: draftLogo, markerFilled: draftMarkerFilled,
    });
    trackEvent('annotation_created', { annotation_type: 'text' });
    setDraftAnnotationTitle('');
    setDraftEyebrow('');
    setDraftDescription('');
    setDraftShowOnMatchingRoutes(false);
    setChosenDistance(null);
    setDistanceDraft(null);
    setComposerOpen(false);
  };

  return (
    <div className="space-y-4">
      {textAnnotations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--evergreen)]/20 px-3 py-4 text-[var(--evergreen-60)]">
          <p className="text-sm">{t('annotations.routeAnnotationsEmpty')}</p>
          <p className="text-xs mt-1">{t('annotations.annotationEmptyPlacementHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {textAnnotations
            .slice()
            .sort((a, b) => a.progress - b.progress)
            .map((annotation) => {
              const content = sideAnnotationContent(localizedAnnotation(annotation, language));
              const isSidePanel = annotation.presentation === 'side-panel';
              const wording = annotation.translations?.[language];
              const rawHeading = wording?.eyebrow ?? annotation.eyebrow ?? '';
              const heading = [rawHeading, content.code].filter(Boolean).join(rawHeading ? ' · ' : '');
              const rawDescription = wording?.description ?? annotation.description ?? content.description;
              const description = content.meta ? [content.meta, rawDescription].filter(Boolean).join('\n') : rawDescription;
              const annotationElevation = annotation.elevation !== undefined
                ? `${Math.round(convertElevation(annotation.elevation, unitSystem)).toLocaleString()} ${unitSystem === 'metric' ? 'm' : 'ft'}`
                : null;

              return (
                <details key={annotation.id} className="group rounded-xl border border-[var(--evergreen)]/15 bg-white/20">
                  <summary draggable onDragStart={(event) => { event.dataTransfer.setData(ANNOTATION_DRAG_TYPE, annotation.id); event.dataTransfer.effectAllowed = 'move'; }} className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 text-left text-[var(--evergreen)]">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: annotation.color }} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{content.title || t('annotations.routeAnnotationTitlePlaceholder')}</span><span className="mt-0.5 block text-[10px] text-[var(--evergreen-60)]">{annotation.routeDistance !== undefined ? formatDistance(annotation.routeDistance, unitSystem) : t('annotations.routeAnnotationProgress', { percent: (annotation.progress * 100).toFixed(0) })} · {t(isSidePanel ? 'annotations.presentationSidePanel' : 'annotations.presentationMapCard')}</span></span>
                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="space-y-3 border-t border-[var(--evergreen)]/10 p-3">
                  {<label className="block text-xs text-[var(--evergreen)]">{t('annotations.eyebrowLabel')}
                    <input value={heading} onChange={(e) => updateWording(annotation, { eyebrow: e.target.value })} placeholder={t('annotations.sidePanelEyebrow')} maxLength={36} className="mt-1 w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm" />
                  </label>}
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full border border-white/40"
                      style={{ backgroundColor: annotation.color }}
                    />
                    <input
                      value={annotation.translations?.[language]?.title ?? content.title}
                      onChange={(e) => updateWording(annotation, { title: e.target.value })}
                      aria-label={t('annotations.routeAnnotationTitlePlaceholder')}
                      className="flex-1 rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--evergreen)] outline-none focus:border-[var(--trail-orange)]"
                      maxLength={120}
                    />
                  </div>

                  <label className="block text-xs text-[var(--evergreen)]">{t('annotations.descriptionLabel')}
                    <textarea value={description} onChange={(e) => updateWording(annotation, { description: e.target.value })} maxLength={600} className="mt-1 w-full min-h-20 rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm" />
                  </label>
                  <label className="flex items-start gap-2 text-xs text-[var(--evergreen)]">
                    <input type="checkbox" checked={annotation.showOnMatchingRoutes ?? false} onChange={(event) => updateTextAnnotation(annotation.id, { showOnMatchingRoutes: event.target.checked })} className="mt-0.5 accent-[var(--trail-orange)]" />
                    <span>{t('annotations.showOnMatchingRoutes')}<span className="mt-0.5 block text-[10px] text-[var(--evergreen-60)]">{t('annotations.showOnMatchingRoutesHint')}</span></span>
                  </label>
                  <div className="flex flex-wrap gap-2 text-xs text-[var(--evergreen)]">
                    <select aria-label={t('annotations.presentationLabel')} value={annotation.presentation ?? 'map-card'} onChange={(e) => {
                      const presentation = e.target.value as 'map-card' | 'side-panel';
                      updateTextAnnotation(annotation.id, {
                        presentation,
                        logo: annotation.logo || mapAnnotationSymbol('pin'),
                      });
                    }} className="rounded border bg-[var(--canvas)] p-2">
                      <option value="map-card">{t('annotations.presentationMapCard')}</option><option value="side-panel">{t('annotations.presentationSidePanel')}</option>
                    </select>
                    {<>
                      <AnnotationSymbolPicker value={annotation.logo ?? mapAnnotationSymbol('pin')} onChange={(logo) => updateTextAnnotation(annotation.id, { logo })} />
                      <label className="flex items-center gap-2"><input type="checkbox" checked={annotation.markerFilled ?? true} onChange={(event) => updateTextAnnotation(annotation.id, { markerFilled: event.target.checked })} />{t('annotations.markerFilled')}</label>
                      <label className="block w-full">{t('annotations.pinLeadOverride')} <input type="number" min="0" max="120" value={annotation.pinLeadDuration === undefined ? '' : annotation.pinLeadDuration / 1000} placeholder={String(defaultPinLead / 1000)} onChange={(e) => updateTextAnnotation(annotation.id, { pinLeadDuration: e.target.value === '' ? undefined : Math.max(0, Math.min(120, Number(e.target.value))) * 1000 })} className="w-20 rounded border bg-[var(--canvas)] p-2" /></label>
                      <label className="block w-full">{t('annotations.slowdownOverride')} <input type="number" min="0" max="30" value={annotation.holdDuration === undefined ? '' : annotation.holdDuration / 1000} placeholder={String(defaultHold / 1000)} onChange={(e) => updateTextAnnotation(annotation.id, { holdDuration: e.target.value === '' ? undefined : Math.max(0, Math.min(30, Number(e.target.value))) * 1000 })} className="w-20 rounded border bg-[var(--canvas)] p-2" /></label>
                      <span className="text-[10px] text-[var(--evergreen-60)]">{t('annotations.timingOverrideHint')}</span>
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
                </details>
              );
            })}
        </div>
      )}
      <div className="space-y-3 border-t border-[var(--evergreen)]/15 pt-3">
        <div className="text-xs font-semibold text-[var(--evergreen)]">{t('annotations.sharedTiming')}</div>
        <div className="grid grid-cols-2 items-stretch gap-2 text-xs text-[var(--evergreen)]">
          <label className="flex min-w-0 flex-col gap-2 rounded-lg border border-[var(--evergreen)]/10 bg-white/35 p-2.5">
            <span className="flex-1 font-medium leading-snug">{t('annotations.defaultPinLead')}</span>
            <input type="number" min="0" max="120" value={defaultPinLead / 1000} onChange={(event) => setSettings({ annotationPinLeadDuration: Math.max(0, Math.min(120, Number(event.target.value) || 0)) * 1000 })} className="h-9 w-full rounded-md border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-2.5 text-sm tabular-nums outline-none focus:border-[var(--trail-orange)]" />
          </label>
          <label className="flex min-w-0 flex-col gap-2 rounded-lg border border-[var(--evergreen)]/10 bg-white/35 p-2.5">
            <span className="flex-1 font-medium leading-snug">{t('annotations.defaultSlowdown')}</span>
            <input type="number" min="0" max="30" value={defaultHold / 1000} onChange={(event) => setSettings({ annotationHoldDuration: Math.max(0, Math.min(30, Number(event.target.value) || 0)) * 1000 })} className="h-9 w-full rounded-md border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-2.5 text-sm tabular-nums outline-none focus:border-[var(--trail-orange)]" />
          </label>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs font-semibold"><label htmlFor="annotation-marker-size">{t('annotations.annotationMarkerSize')}</label><span>{Math.round(Math.max(0.5, Math.min(2, markerSize)) * 100)}%</span></div>
          <input id="annotation-marker-size" type="range" min="0.5" max="2" step="0.1" value={Math.max(0.5, Math.min(2, markerSize))} onChange={(event) => setSettings({ annotationMarkerScale: Number(event.target.value) })} className="w-full accent-[var(--trail-orange)]" />
        </div>
        <div>
          <div className="flex items-center justify-between text-xs font-semibold"><label htmlFor="annotation-text-size">{t('annotations.annotationTextSize')}</label><span>{Math.round(Math.max(0.5, Math.min(2, textSize)) * 100)}%</span></div>
          <input id="annotation-text-size" type="range" min="0.5" max="2" step="0.1" value={Math.max(0.5, Math.min(2, textSize))} onChange={(event) => setSettings({ annotationTextScale: Number(event.target.value) })} className="w-full accent-[var(--trail-orange)]" />
        </div>
      </div>
      <details className="group border-t border-[var(--evergreen)]/15" open={composerOpen} onToggle={(event) => setComposerOpen(event.currentTarget.open)}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-3 text-xs font-bold uppercase tracking-wide text-[var(--evergreen)] hover:text-[var(--trail-orange)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trail-orange)]"><Plus className="h-4 w-4" aria-hidden="true" /><span className="flex-1">{t('annotations.addRouteAnnotation')}</span><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
        <div className="pb-1">
      <div className="space-y-3">
        <div role="group" aria-label={t('annotations.presentationLabel')} className="grid grid-cols-2 gap-2">
          {(['map-card', 'side-panel'] as const).map((type) => <button key={type} type="button" aria-pressed={draftPresentation === type} onClick={() => setDraftPresentation(type)}
            className={`min-w-0 overflow-hidden rounded-lg border text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trail-orange)] ${draftPresentation === type ? 'border-[var(--trail-orange)] bg-[var(--trail-orange-15)] ring-1 ring-[var(--trail-orange)]' : 'border-[var(--evergreen)]/20 bg-[var(--canvas)] hover:border-[var(--trail-orange)]/60'}`}>
            <span aria-hidden="true" className="relative block h-20 overflow-hidden bg-cover bg-center" style={{ backgroundImage: "url('/media/images/map-previews/satellite.jpg')" }}>
              <span className="absolute inset-0 bg-black/15" />
              <span className="absolute bottom-3 left-[20%] h-5 w-5 rounded-full border-2 border-[var(--trail-orange)] shadow" />
              <span className="absolute bottom-4 left-[39%] h-6 w-px bg-[var(--trail-orange)]" />
              <span className="absolute bottom-4 left-[46%] flex w-[45%] flex-col gap-1"><span className="h-1.5 w-full rounded bg-white/90" /><span className="h-1 w-3/4 rounded bg-white/60" /></span>
            </span>
            <span className="block px-2.5 pb-2.5 pt-2"><span className="block text-xs font-bold text-[var(--evergreen)]">{t(type === 'map-card' ? 'annotations.presentationMapCard' : 'annotations.presentationSidePanel')}</span>
              <span className="mt-1 block text-[10px] leading-snug text-[var(--evergreen-60)]">{t(type === 'map-card' ? 'annotations.mapCaptionExplanation' : 'annotations.fieldNoteExplanation')}</span></span>
          </button>)}
        </div>
        <p className="text-right text-[9px] text-[var(--evergreen-60)]">© Esri</p>
        <div className="space-y-2 border-t border-[var(--evergreen)]/10 pt-3">
          <div className="flex items-center justify-between gap-2"><label htmlFor="annotation-position" className="text-xs font-semibold text-[var(--evergreen)]">{t('annotations.positionOnRoute')}</label>
            <button type="button" onClick={() => { setChosenDistance(null); setDistanceDraft(null); }} disabled={!currentPosition} className="text-xs font-semibold text-[var(--trail-orange)] underline underline-offset-2 disabled:opacity-40">{t('annotations.usePlayhead')}</button></div>
          <div className="flex items-center gap-2 text-xs text-[var(--evergreen-60)]">
            <input id="annotation-position" type="text" inputMode="decimal" value={distanceDraft ?? distanceValue} disabled={!currentPosition || totalDistance <= 0}
              onChange={(event) => setDistanceDraft(event.target.value)} onBlur={() => { const parsed = Number((distanceDraft ?? distanceValue).replace(',', '.')); if (distanceDraft?.trim() && Number.isFinite(parsed)) setChosenDistance(Math.max(0, Math.min(totalDistance, parsed * unitDivisor))); setDistanceDraft(null); }}
              onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} className="w-20 rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-2 py-2 text-sm tabular-nums text-[var(--evergreen)] focus:border-[var(--trail-orange)] focus:outline-none disabled:opacity-50" />
            <span>{distanceUnit}</span><span>{t('annotations.positionTotal', { distance: formatDistance(totalDistance, unitSystem) })}</span>
          </div>
          <input type="range" aria-label={t('annotations.positionOnRoute')} min={0} max={totalDistance || 1} step="any" value={selectedDistance} disabled={!currentPosition || totalDistance <= 0}
            onChange={(event) => { setChosenDistance(Number(event.target.value)); setDistanceDraft(null); }} className="w-full accent-[var(--trail-orange)] disabled:opacity-50" />
        </div>
        {<label className="block text-xs text-[var(--evergreen)]">{t('annotations.eyebrowLabel')}
          <input value={draftEyebrow} onChange={(e) => setDraftEyebrow(e.target.value)} maxLength={36} className="mt-1 w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm" />
        </label>}
        <input
          value={draftAnnotationTitle}
          aria-label={t('annotations.routeAnnotationTitlePlaceholder')}
          onChange={(e) => setDraftAnnotationTitle(e.target.value)}
          placeholder={t('annotations.routeAnnotationTitlePlaceholder')}
          className="w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--evergreen)] outline-none focus:border-[var(--trail-orange)]"
          maxLength={120}
        />

        <label className="block text-xs text-[var(--evergreen)]">{t('annotations.descriptionLabel')}
          <textarea value={draftDescription} onChange={(e) => setDraftDescription(e.target.value)} maxLength={600} className="mt-1 w-full min-h-20 rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm" />
        </label>

        <div className="space-y-3">
          {<>
            <details className="group w-full border-y border-[var(--evergreen)]/10">
              <summary className="flex cursor-pointer list-none items-center justify-between py-2 text-xs font-semibold text-[var(--evergreen)]">{t('annotations.logoLabel')}<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
              <div className="pb-3"><AnnotationSymbolPicker value={draftLogo} onChange={setDraftLogo} /></div>
            </details>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draftMarkerFilled} onChange={(event) => setDraftMarkerFilled(event.target.checked)} />{t('annotations.markerFilled')}</label>

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
                aria-label={`${t('annotations.routeAnnotationColor')}: ${color}`}
                aria-pressed={draftAnnotationColor === color}
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

        <label className="flex items-start gap-2 text-xs text-[var(--evergreen)]">
          <input type="checkbox" checked={draftShowOnMatchingRoutes} onChange={(event) => setDraftShowOnMatchingRoutes(event.target.checked)} className="mt-0.5 accent-[var(--trail-orange)]" />
          <span>{t('annotations.showOnMatchingRoutes')}<span className="mt-0.5 block text-[10px] text-[var(--evergreen-60)]">{t('annotations.showOnMatchingRoutesHint')}</span></span>
        </label>
        <div className="space-y-2 border-t border-[var(--evergreen)]/10 pt-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--evergreen)]">
              {canAddAnnotation
                ? t('annotations.positionReady', { distance: formatDistance(placement?.routeDistance ?? 0, unitSystem) })
                : t('annotations.noRoutePositionHint')}
            </p>
            {placement?.elevation ? (
              <p className="text-[11px] text-[var(--evergreen-60)] mt-0.5">
                {t('annotations.routeAnnotationElevation', {
                  elevation: Math.round(convertElevation(placement.elevation, unitSystem)).toLocaleString(),
                  unit: unitSystem === 'metric' ? 'm' : 'ft',
                })}
              </p>
              ) : null}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAddAnnotation}
              disabled={!canAddAnnotation}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--trail-orange)] px-3 py-2 text-sm font-semibold text-white transition-colors hover:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trail-orange)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {t('annotations.addRouteAnnotation')}
            </button>
          </div>
        </div>
      </div>

        </div>
      </details>
    </div>
  );
}
