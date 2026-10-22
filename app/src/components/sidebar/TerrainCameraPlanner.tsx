import { useEffect, useMemo, useRef, useState } from 'react';
import { Mountain, Upload, Download, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { terrainContextFingerprint } from '@/utils/terrainCamera/context';
import { buildCameraPlanningBundle, downloadCameraFile } from '@/utils/terrainCamera/planningBundle';
import type { TerrainCameraBrief, TerrainCameraPlanFrame } from '@/utils/terrainCamera/types';
import { resolveRecipeCameraKeyframes, serializeCameraRecipe } from '@/utils/recipe/cameraRecipe';
import { parseRecipeFile } from '@/utils/recipe/parseRecipeFile';
import { mapGlobalRef } from '@/utils/mapRef';

const buttonClass = 'rounded border border-[var(--evergreen)]/25 px-2 py-1.5 text-xs disabled:opacity-40 hover:bg-[var(--evergreen)]/5';

function currentViewport() {
  const map = mapGlobalRef.current;
  const container = map?.getContainer();
  const exaggeration = map?.getTerrain()?.exaggeration;
  return {
    widthPx: container?.clientWidth || 1280,
    heightPx: container?.clientHeight || 720,
    verticalFovDeg: map?.getVerticalFieldOfView() ?? 36.86989764584402,
    terrainExaggeration: useAppStore.getState().settings.show3DTerrain ? (typeof exaggeration === 'number' ? exaggeration : 1.2) : 0,
  };
}

/** Camera proposals never replace tracks, annotations, or accepted shots until Apply. */
export function TerrainCameraPlanner() {
  const { t } = useI18n();
  const tracks = useAppStore((state) => state.tracks);
  const segments = useAppStore((state) => state.journeySegments);
  const timing = useAppStore((state) => state.playback.routeTimingMode);
  const review = useAppStore((state) => state.cameraPlanReview);
  const playing = useAppStore((state) => state.playback.isPlaying);
  const exporting = useAppStore((state) => state.isExporting);
  const animationPhase = useAppStore((state) => state.animationPhase);
  const [intent, setIntent] = useState('');
  const [brief, setBrief] = useState<TerrainCameraBrief | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const fingerprint = useMemo(() => terrainContextFingerprint(tracks, segments, timing), [tracks, segments, timing]);
  const stale = !!review && review.contextFingerprint !== fingerprint;
  const locked = busy || playing || exporting || ['intro', 'outro', 'preloading'].includes(animationPhase);

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (stale && review?.previewing) useAppStore.getState().previewCameraPlan(false);
  }, [stale, review?.previewing]);

  const currentFingerprint = () => {
    const state = useAppStore.getState();
    return terrainContextFingerprint(state.tracks, state.journeySegments, state.playback.routeTimingMode);
  };

  const analyze = async () => {
    const snapshot = useAppStore.getState();
    const expected = currentFingerprint();
    const abortController = new AbortController();
    controller.current?.abort();
    controller.current = abortController;
    setBusy(true); setError(''); setProgress('');
    try {
      const { buildTerrainCameraBrief } = await import('@/utils/terrainCamera');
      const result = await buildTerrainCameraBrief({
        tracks: snapshot.tracks, journeySegments: snapshot.journeySegments,
        routeTimingMode: snapshot.playback.routeTimingMode,
        cameraStability: snapshot.cameraSettings.cameraStability,
        viewport: currentViewport(),
        intent, signal: abortController.signal,
        onProgress: ({ completed, total }) => setProgress(`${completed} / ${total}`),
      });
      if (abortController.signal.aborted) return;
      if (expected !== currentFingerprint()) throw new Error(t('terrainCamera.changed'));
      const recipe = { ...serializeCameraRecipe(snapshot), cameraKeyframes: { ...result.cameraKeyframes, contextFingerprint: expected } };
      const frames = resolveRecipeCameraKeyframes(recipe, snapshot.tracks, snapshot.journeySegments);
      if (!frames.length) throw new Error(t('terrainCamera.noFrames'));
      setBrief(result);
      snapshot.stageCameraPlan({ frames, contextFingerprint: expected, warnings: result.warnings });
    } catch (cause) {
      if (!abortController.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    } finally { if (controller.current === abortController) { setBusy(false); controller.current = null; } }
  };

  const reviewFile = async (file: File) => {
    setError('');
    try {
      if (file.size > 2_000_000) throw new Error(t('terrainCamera.tooLarge'));
      const recipe = await parseRecipeFile(file);
      const state = useAppStore.getState();
      if (!recipe.cameraKeyframes) throw new Error(t('terrainCamera.missingFrames'));
      if (recipe.routeTimingMode !== undefined && recipe.routeTimingMode !== state.playback.routeTimingMode) throw new Error(t('terrainCamera.changed'));
      const frames = resolveRecipeCameraKeyframes({ ...recipe, routeTimingMode: state.playback.routeTimingMode }, state.tracks, state.journeySegments);
      if (!frames.length) throw new Error(t('terrainCamera.noFrames'));
      state.stageCameraPlan({
        frames, contextFingerprint: currentFingerprint(),
        warnings: [...new Set([
          ...(recipe.cameraKeyframes.contextFingerprint ? [] : [t('terrainCamera.noFingerprint')]),
          ...frames.flatMap((frame) => frame.terrain?.warnings ?? []),
        ])],
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  const assess = async () => {
    const snapshot = useAppStore.getState();
    const draft = snapshot.cameraPlanReview;
    if (!draft || stale) return;
    const abortController = new AbortController();
    controller.current = abortController;
    setBusy(true); setError('');
    try {
      const recipe = serializeCameraRecipe({ ...snapshot, cinematicCameraKeyframes: draft.frames });
      const frames = recipe.cameraKeyframes!.frames as TerrainCameraPlanFrame[];
      const { evaluateTerrainCameraPlan } = await import('@/utils/terrainCamera');
      const results = await evaluateTerrainCameraPlan({
        frames, tracks: snapshot.tracks, journeySegments: snapshot.journeySegments,
        routeTimingMode: snapshot.playback.routeTimingMode, signal: abortController.signal,
        cameraStability: snapshot.cameraSettings.cameraStability,
        viewport: currentViewport(),
      });
      if (abortController.signal.aborted) return;
      if (draft !== useAppStore.getState().cameraPlanReview || draft.contextFingerprint !== currentFingerprint()) throw new Error(t('terrainCamera.changed'));
      snapshot.stageCameraPlan({
        ...draft,
        frames: draft.frames.map((frame) => {
          const related = results.filter((entry) => entry.frameId === frame.id || entry.anchor.segmentId === frame.anchor.routeSegmentId && entry.anchor.distanceMeters === frame.anchor.routeSegmentDistance);
          return related.length ? { ...frame, terrain: { ...frame.terrain, confidence: Math.min(...related.map((entry) => entry.confidence)), warnings: [...new Set(related.flatMap((entry) => entry.warnings))] } } : frame;
        }),
        warnings: [...new Set(results.flatMap((entry) => entry.warnings))],
      });
    } catch (cause) { if (!abortController.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (controller.current === abortController) { setBusy(false); controller.current = null; } }
  };

  const download = async () => {
    setError('');
    try {
      const state = useAppStore.getState();
      const data = brief?.contextFingerprint === currentFingerprint() ? brief : undefined;
      downloadCameraFile(await buildCameraPlanningBundle(state, intent, data), 'trailreplay-camera-brief.zip');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  return <section className="space-y-2 border-b border-[var(--evergreen)]/20 pb-3 text-[var(--evergreen)]" aria-label={t('terrainCamera.title')}>
    <h4 className="flex items-center gap-2 text-sm font-semibold"><Mountain className="h-4 w-4" />{t('terrainCamera.title')}</h4>
    <p className="text-xs text-[var(--evergreen-60)]">{t('terrainCamera.description')}</p>
    <label className="block text-xs">{t('terrainCamera.intent')}
      <textarea value={intent} onChange={(event) => setIntent(event.target.value)} disabled={locked} maxLength={2000} rows={2} className="mt-1 w-full rounded border border-[var(--evergreen)]/25 bg-[var(--canvas)] p-2" placeholder={t('terrainCamera.intentPlaceholder')} />
    </label>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={buttonClass} disabled={locked || !tracks.length} onClick={() => void analyze()}>{t('terrainCamera.analyze')}</button>
      <button type="button" className={buttonClass} disabled={locked || !tracks.length} onClick={() => void download()}><Download className="mr-1 inline h-3 w-3" />{t('terrainCamera.download')}</button>
      <button type="button" className={buttonClass} disabled={locked} onClick={() => input.current?.click()}><Upload className="mr-1 inline h-3 w-3" />{t('terrainCamera.import')}</button>
      <input ref={input} type="file" accept=".json,application/json" className="hidden" aria-label={t('terrainCamera.import')} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void reviewFile(file); }} />
    </div>
    <p className="text-[10px] text-[var(--evergreen-60)]">{t('terrainCamera.privacy')} <a href="/camera-authoring.md" target="_blank" rel="noreferrer" className="underline">{t('terrainCamera.guide')}</a></p>
    {busy && <div className="flex items-center justify-between text-xs" role="status">{t('terrainCamera.analyzing')} {progress}<button type="button" className={buttonClass} onClick={() => controller.current?.abort()}><X className="mr-1 inline h-3 w-3" />{t('terrainCamera.cancel')}</button></div>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {brief?.contextFingerprint === fingerprint && <p className="text-xs">{t('terrainCamera.coverage', { known: brief.coverage.known, total: brief.coverage.sampled })}</p>}
    {review && <div className="space-y-2 rounded border border-[var(--trail-orange)]/50 p-2">
      <p className="text-xs font-semibold">{t('terrainCamera.draft', { count: review.frames.length })}</p>
      <p className="text-xs">{stale ? t('terrainCamera.changed') : review.previewing ? t('terrainCamera.previewing') : t('terrainCamera.ready')}</p>
      {review.warnings.length > 0 && <ul className="list-disc space-y-1 pl-4 text-[10px]">{review.warnings.slice(0, 8).map((warning) => <li key={warning}>{warning}</li>)}</ul>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} disabled={locked || stale} onClick={() => useAppStore.getState().previewCameraPlan(!review.previewing)}>{t(review.previewing ? 'terrainCamera.savedShots' : 'terrainCamera.preview')}</button>
        <button type="button" className={buttonClass} disabled={locked || stale} onClick={() => void assess()}>{t('terrainCamera.assess')}</button>
        <button type="button" className={buttonClass} disabled={locked || stale || !review.previewing || !review.frames.length} onClick={() => useAppStore.getState().applyCameraPlan(currentFingerprint())}>{t('terrainCamera.apply')}</button>
        <button type="button" className={buttonClass} disabled={locked} onClick={() => useAppStore.getState().discardCameraPlan()}>{t('terrainCamera.discard')}</button>
      </div>
    </div>}
  </section>;
}
