import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair, ImagePlus, ImageIcon, Loader2, Minus, Plus, X } from 'lucide-react';
import { useSocialShareExport } from './useSocialShareExport';
import { SocialSharePreviewModal } from './SocialSharePreviewModal';
import { mapGlobalRef } from '@/utils/mapRef';
import { useI18n } from '@/i18n/useI18n';
import { trackEvent } from '@/utils/analytics';
import { renderActivityIcon } from '@/utils/activityIcons';
import { AnnotationSymbolPicker } from '@/components/sidebar/AnnotationSymbolPicker';
import { annotationSymbolLabel, annotationSymbolPath } from '@/components/annotations/annotationSymbol';
import { OverlayFontPicker } from '@/components/sidebar/OverlayFontPicker';
import { useAppStore } from '@/store/useAppStore';
import { compressCoverPhoto } from './socialShareMedia';
import { arrangePhotoSlots, createPhotoSlot, PRESET_ORDER, presetSettings } from './socialSharePresets';
import { getPosterSize } from './socialShareRenderer';
import { getSplitMapFrame } from './socialShareSplit';
import type { MapStyle, SocialShareTemplate, SocialShareAspectRatio, SocialShareStat, SocialShareStatMetric, SocialSharePhotoSlot } from '@/types';

const RATIOS: { value: SocialShareAspectRatio; label: string }[] = [
  { value: '16:9', label: '16:9' },
  { value: '4:5', label: '4:5' },
  { value: '1:1', label: '1:1' },
  { value: '9:16', label: '9:16' },
];

const STAT_OPTIONS: { value: SocialShareStatMetric; labelKey: string }[] = [
  { value: 'distance', labelKey: 'imageExport.statDistance' },
  { value: 'elevationGain', labelKey: 'imageExport.statElevGain' },
  { value: 'duration', labelKey: 'imageExport.statTime' },
  { value: 'movingDuration', labelKey: 'stats.movingDuration' },
  { value: 'pace', labelKey: 'stats.avgPace' },
  { value: 'heartRate', labelKey: 'stats.heartRateShort' },
  { value: 'speed', labelKey: 'imageExport.statAvgSpeed' },
  { value: 'altitude', labelKey: 'stats.altitude' },
  { value: 'maxElevation', labelKey: 'imageExport.statMaxElevation' },
  { value: 'elevationLoss', labelKey: 'imageExport.statElevationLoss' },
  { value: 'maxSpeed', labelKey: 'imageExport.statMaxSpeed' },
  { value: 'custom', labelKey: 'imageExport.statCustom' },
];

const DEFAULT_SOCIAL_STATS: SocialShareStat[] = [
  { id: 'distance', metric: 'distance', label: '', value: '', visible: true },
  { id: 'elevation', metric: 'elevationGain', label: '', value: '', visible: true },
  { id: 'time', metric: 'duration', label: '', value: '', visible: true },
];

interface Props {
  coverMode?: boolean;
  aspectRatioOverride?: SocialShareAspectRatio;
  onAspectRatioChange?: (ratio: SocialShareAspectRatio) => void;
  onPosterReady?: (url: string) => void;
  onUseCover?: () => void;
}

export function SocialSharePanel({ coverMode = false, aspectRatioOverride, onAspectRatioChange, onPosterReady, onUseCover }: Props) {
  const { t } = useI18n();
  const overlayFont = useAppStore((state) => state.settings.trailStyle.overlayFont);
  const setTrailStyle = useAppStore((state) => state.setTrailStyle);
  const mapStyle = useAppStore((state) => state.settings.mapStyle);
  const setMapStyle = useAppStore((state) => state.setMapStyle);
  const {
    previewUrl, isRendering, generatePreview, exportPng, fitTrackToMap,
    settings, setSocialShareSettings, pictures, hasTracks,
    routeBboxNorm, dataPanelBboxNorm,
    transformMapViewport,
    titleBboxNorm,
    logoBboxNorm,
  } = useSocialShareExport();
  const [showPreview, setShowPreview] = useState(false);
  const [editorHost] = useState(() => document.getElementById('map-capture-container'));
  const [pitch, setPitch] = useState(() => Math.round(mapGlobalRef.current?.getPitch() ?? 0));
  const [bearing, setBearing] = useState(() => Math.round(mapGlobalRef.current?.getBearing() ?? 0));
  const cameraPreviewTimer = useRef<number | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const targetPhotoSlotRef = useRef<string | null>(null);
  const [activePhotoSlotId, setActivePhotoSlotId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [editingStatIconId, setEditingStatIconId] = useState<string | null>(null);
  const photoFirstSlotId = settings.photoSlots?.[0]?.id ?? 'photo-first-hero';
  const photoFirstImageUrl = settings.photoSlots?.[0]?.imageUrl
    ?? pictures.find((picture) => picture.id === settings.selectedPictureId)?.url
    ?? null;
  const posterSize = getPosterSize(settings.aspectRatio);
  const splitMapFrame = getSplitMapFrame(posterSize.w, posterSize.h, settings.splitMapFrame);
  const updateSplitMapFrame = (patch: Partial<typeof splitMapFrame>) =>
    setSocialShareSettings({ splitMapFrame: getSplitMapFrame(posterSize.w, posterSize.h, { ...splitMapFrame, ...patch }) });

  const applyPreset = (preset: typeof PRESET_ORDER[number]) => {
    const patch = presetSettings(preset, settings);
    setSocialShareSettings({ ...patch, statsFrame: undefined });
    if (preset === 'long-way') setTrailStyle({ overlayFont: 'poster' });
    if (preset === 'ridge-photo' || preset === 'photo-grid') setTrailStyle({ overlayFont: 'condensed' });
    setActivePhotoSlotId(patch.photoSlots?.[0]?.id ?? null);
  };
  const updatePhotoSlot = (id: string, patch: Partial<SocialSharePhotoSlot>) => {
    const latestSlots = useAppStore.getState().socialShareSettings.photoSlots ?? [];
    setSocialShareSettings({ photoSlots: latestSlots.map((slot) => slot.id === id ? { ...slot, ...patch } : slot) });
  };
  const openPhotoPicker = (id: string) => {
    targetPhotoSlotRef.current = id;
    setActivePhotoSlotId(id);
    photoInputRef.current?.click();
  };
  const loadPhotoIntoSlot = async (id: string, file: File) => {
    try {
      setPhotoError(null);
      const imageUrl = await compressCoverPhoto(file);
      const current = useAppStore.getState().socialShareSettings;
      const slots = current.photoSlots ?? [];
      const newSlot = { ...createPhotoSlot(id, 0, 0, 1, 1), imageUrl };
      const photoSlots = slots.some((slot) => slot.id === id)
        ? slots.map((slot) => slot.id === id ? { ...slot, imageUrl, offsetX: 0, offsetY: 0, scale: 1 } : slot)
        : [newSlot, ...slots];
      setSocialShareSettings({
        photoSlots,
        ...(current.template === 'photo-first' ? { selectedPictureId: null, photoTransform: { offsetX: 0, offsetY: 0, scale: 1 } } : {}),
      });
      setActivePhotoSlotId(id);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : String(error));
    }
  };
  const loadLibraryPhotoIntoSlot = async (id: string, pictureId: string) => {
    const picture = pictures.find((item) => item.id === pictureId);
    if (!picture) return;
    try {
      const response = await fetch(picture.url);
      const blob = await response.blob();
      await loadPhotoIntoSlot(id, new File([blob], picture.originalFileName ?? 'cover-photo.jpg', { type: blob.type || 'image/jpeg' }));
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : String(error));
    }
  };

  const setRouteTransform = (patch: Partial<typeof settings.routeTransform>) =>
    setSocialShareSettings({ routeTransform: { ...settings.routeTransform, ...patch } });
  const photoTransform = settings.photoTransform ?? { offsetX: 0, offsetY: 0, scale: 1 };
  const setPhotoTransform = (patch: Partial<typeof photoTransform>) =>
    setSocialShareSettings({ photoTransform: { ...photoTransform, ...patch } });

  const stats: SocialShareStat[] = settings.stats ?? DEFAULT_SOCIAL_STATS;
  const updateStat = (index: number, patch: Partial<SocialShareStat>) => {
    const next = [...stats];
    next[index] = { ...next[index], ...patch };
    setSocialShareSettings({ stats: next });
  };
  const moveStat = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= stats.length) return;
    const next = [...stats];
    [next[index], next[target]] = [next[target], next[index]];
    setSocialShareSettings({ stats: next });
  };

  useEffect(() => {
    if (aspectRatioOverride && settings.aspectRatio !== aspectRatioOverride) {
      setSocialShareSettings({ aspectRatio: aspectRatioOverride });
    }
  }, [aspectRatioOverride, setSocialShareSettings, settings.aspectRatio]);

  useEffect(() => () => {
    if (cameraPreviewTimer.current !== null) window.clearTimeout(cameraPreviewTimer.current);
  }, []);

  const refreshCameraPreview = () => {
    if (cameraPreviewTimer.current !== null) window.clearTimeout(cameraPreviewTimer.current);
    cameraPreviewTimer.current = window.setTimeout(() => {
      cameraPreviewTimer.current = null;
      void generatePreview();
    }, 180);
  };

  const handlePitch = (v: number) => {
    setPitch(v);
    mapGlobalRef.current?.jumpTo({ pitch: v });
    refreshCameraPreview();
  };
  const handleBearing = (v: number) => {
    setBearing(v);
    mapGlobalRef.current?.jumpTo({ bearing: v });
    refreshCameraPreview();
  };

  const nudgeMap = (x: number, y: number) => {
    const map = mapGlobalRef.current;
    if (!map) return;
    map.panBy([x, y], { duration: 0 });
    window.setTimeout(() => { void generatePreview(); }, 100);
  };

  const zoomMap = (direction: 'in' | 'out') => {
    const map = mapGlobalRef.current;
    if (!map) return;
    map[direction === 'in' ? 'zoomIn' : 'zoomOut']({ duration: 0 });
    window.setTimeout(() => { void generatePreview(); }, 100);
  };

  const centerMap = () => {
    fitTrackToMap();
    window.setTimeout(() => { void generatePreview(); }, 700);
  };

  const templates: { value: SocialShareTemplate; label: string }[] = [
    { value: 'map-first', label: t('imageExport.templateMapFirst') },
    { value: 'photo-first', label: t('imageExport.templatePhotoFirst') },
    { value: 'split', label: t('imageExport.templateSplit') },
  ];

  return (
    <div className="space-y-4 text-[var(--evergreen)]">
      {coverMode && (
        <div className="rounded-xl border border-[var(--trail-orange)]/40 bg-[var(--trail-orange-15)] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{t('imageExport.videoCover')}</p>
              <p className="mt-0.5 text-xs opacity-70">{t('imageExport.videoCoverHint')}</p>
            </div>
            <span className="shrink-0 rounded-full bg-[var(--evergreen)] px-2.5 py-1 text-[11px] font-semibold text-[var(--canvas)]">1 sec</span>
          </div>
        </div>
      )}

      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => {
        const file = event.target.files?.[0];
        const id = targetPhotoSlotRef.current;
        if (file && id) void loadPhotoIntoSlot(id, file);
        event.target.value = '';
      }} />

      <div>
        <div className="mb-2 text-xs uppercase tracking-wide opacity-60">{t('imageExport.layoutPresets')}</div>
        <div className="grid grid-cols-2 gap-2">
          {PRESET_ORDER.map((preset) => (
            <button key={preset} type="button" onClick={() => applyPreset(preset)}
              aria-pressed={settings.layoutPreset === preset}
              className={`min-h-20 overflow-hidden rounded-xl border text-left shadow-sm transition hover:-translate-y-0.5 ${settings.layoutPreset === preset ? 'border-[var(--trail-orange)] ring-2 ring-[var(--trail-orange)]/25' : 'border-black/10 hover:border-[var(--trail-orange)]/50'}`}>
              <span className={`flex h-12 items-center justify-center px-3 text-center ${preset === 'long-way' ? 'bg-[#12281d] text-[#fff7e4] font-black text-xl leading-none' : preset === 'classic' ? 'bg-[#24382d] text-white font-semibold' : 'bg-[linear-gradient(115deg,#476a5d_55%,#f6f3e9_55%)] text-[#21372c] font-black'}`}
                style={{ fontFamily: preset === 'long-way' ? "'Anton', Impact, sans-serif" : undefined }}>
                {preset === 'long-way' ? 'THE LONG WAY' : preset === 'ridge-photo' ? 'PHOTO + MAP' : preset === 'photo-grid' ? 'TWO PHOTOS' : 'TRAILREPLAY'}
              </span>
              <span className="block px-2.5 py-1.5 text-xs font-semibold">{t(`imageExport.preset${preset === 'long-way' ? 'LongWay' : preset === 'ridge-photo' ? 'RidgePhoto' : preset === 'photo-grid' ? 'PhotoGrid' : 'Classic'}`)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Template */}
      <div>
        <div className="text-xs uppercase tracking-wide opacity-60 mb-2">{t('imageExport.template')}</div>
        <div className="grid grid-cols-3 gap-2">
          {templates.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => value === 'split' ? applyPreset('ridge-photo') : setSocialShareSettings({ template: value, layoutPreset: 'classic' })}
              className={`py-2 rounded text-sm font-medium transition-colors ${
                settings.template === value
                  ? 'bg-[var(--trail-orange)] text-white'
                  : 'bg-black/5 hover:bg-black/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-xs uppercase tracking-wide opacity-60" htmlFor="cover-font">{t('imageExport.coverTypography')}</label>
        <OverlayFontPicker id="cover-font" value={overlayFont} onChange={(font) => setTrailStyle({ overlayFont: font })} />
      </div>

      {/* Aspect ratio */}
      <div>
        <div className="text-xs uppercase tracking-wide opacity-60 mb-2">{t('imageExport.ratio')}</div>
        <div className="grid grid-cols-4 gap-2">
          {RATIOS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onAspectRatioChange ? onAspectRatioChange(value) : setSocialShareSettings({ aspectRatio: value })}
              aria-pressed={settings.aspectRatio === value}
              className={`py-2 rounded text-sm font-medium transition-colors ${
                settings.aspectRatio === value
                  ? 'bg-[var(--trail-orange)] text-white'
                  : 'bg-black/5 hover:bg-black/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {settings.template === 'split' && (
        <div className="space-y-2 rounded-xl border border-black/10 bg-black/[0.025] p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide">{t('imageExport.photoFrames')}</div>
            <button type="button" disabled={(settings.photoSlots?.length ?? 0) >= 4} onClick={() => {
              const id = `photo-${Date.now()}`;
              setSocialShareSettings({ photoSlots: arrangePhotoSlots([...(settings.photoSlots ?? []), createPhotoSlot(id, 0, 0, 1, 0.66)]) });
              setActivePhotoSlotId(id);
            }} className="text-xs font-semibold text-[var(--trail-orange)] disabled:opacity-40">+ {t('imageExport.addFrame')}</button>
          </div>
          <p className="text-[11px] opacity-60">{t('imageExport.photoFramesHint')}</p>
          <div className="grid grid-cols-2 gap-2">
            {(settings.photoSlots ?? []).map((slot, index) => <button key={slot.id} type="button" onClick={() => slot.imageUrl ? setActivePhotoSlotId(slot.id) : openPhotoPicker(slot.id)}
              className={`relative aspect-[4/3] overflow-hidden rounded-lg border-2 text-xs ${activePhotoSlotId === slot.id ? 'border-[var(--trail-orange)]' : 'border-black/15'}`}>
              {slot.imageUrl ? <img src={slot.imageUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full flex-col items-center justify-center gap-1"><ImagePlus className="h-5 w-5" />{t('imageExport.addPhoto')}</span>}
              <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">{index + 1}</span>
            </button>)}
          </div>
          {activePhotoSlotId && (settings.photoSlots ?? []).some((slot) => slot.id === activePhotoSlotId) && <div className="flex items-center gap-2">
            <button type="button" onClick={() => openPhotoPicker(activePhotoSlotId)} className="rounded bg-black/5 px-2 py-1 text-xs">{t('imageExport.replacePhoto')}</button>
            <label className="min-w-0 flex-1 text-xs">{t('imageExport.zoomPhoto')}
              <input type="range" min={1} max={3} step={0.05} value={(settings.photoSlots ?? []).find((slot) => slot.id === activePhotoSlotId)?.scale ?? 1}
                onChange={(event) => updatePhotoSlot(activePhotoSlotId, { scale: Number(event.target.value) })}
                className="block w-full accent-[var(--trail-orange)]" />
            </label>
            {(settings.photoSlots?.length ?? 0) > 1 && <button type="button" onClick={() => {
              const remaining = arrangePhotoSlots(settings.photoSlots.filter((slot) => slot.id !== activePhotoSlotId));
              setSocialShareSettings({ photoSlots: remaining });
              setActivePhotoSlotId(remaining[0]?.id ?? null);
            }} aria-label={t('imageExport.removePhoto')} title={t('imageExport.removePhoto')} className="rounded p-1.5 text-red-600 hover:bg-red-500/10"><X className="h-4 w-4" /></button>}
          </div>}
          {pictures.length > 0 && <div className="flex gap-1.5 overflow-x-auto pt-1">
            {pictures.map((picture) => <button key={picture.id} type="button" draggable
              onDragStart={(event) => event.dataTransfer.setData('text/x-trailreplay-picture', picture.id)}
              onClick={() => { const id = activePhotoSlotId ?? settings.photoSlots?.[0]?.id; if (id) void loadLibraryPhotoIntoSlot(id, picture.id); }}
              className="h-12 w-12 shrink-0 overflow-hidden rounded border border-black/15" title={picture.originalFileName}>
              <img src={picture.url} alt="" className="h-full w-full object-cover" />
            </button>)}
          </div>}
          {photoError && <p className="text-xs text-red-600" role="alert">{photoError}</p>}
        </div>
      )}

      {/* Photo-first image uses the same direct upload and library picker as split frames. */}
      {settings.template === 'photo-first' && <div className="space-y-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs uppercase tracking-wide opacity-60">{t('imageExport.photo')}</div>
          {photoFirstImageUrl && <button type="button" onClick={() => openPhotoPicker(photoFirstSlotId)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[var(--trail-orange)] hover:bg-[var(--trail-orange-15)]"><ImagePlus className="h-3.5 w-3.5" />{t('imageExport.replacePhoto')}</button>}
        </div>
        <button type="button" onClick={() => openPhotoPicker(photoFirstSlotId)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            const pictureId = event.dataTransfer.getData('text/x-trailreplay-picture');
            if (file?.type.startsWith('image/')) void loadPhotoIntoSlot(photoFirstSlotId, file);
            else if (pictureId) void loadLibraryPhotoIntoSlot(photoFirstSlotId, pictureId);
          }}
          className="relative flex min-h-28 w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-[var(--evergreen)]/25 bg-black/[0.025] text-xs hover:border-[var(--trail-orange)]">
          {photoFirstImageUrl ? <img src={photoFirstImageUrl} alt="" className="h-28 w-full object-cover" />
            : <span className="flex flex-col items-center gap-2 opacity-70"><ImagePlus className="h-6 w-6" />{t('imageExport.addFirstPhoto')}</span>}
        </button>
        {photoFirstImageUrl && <button type="button" onClick={() => setSocialShareSettings({
          photoSlots: (settings.photoSlots ?? []).map((slot, index) => index === 0 ? { ...slot, imageUrl: null } : slot),
          selectedPictureId: null,
        })} className="inline-flex items-center gap-1 text-xs text-[var(--evergreen-60)] hover:text-red-600"><X className="h-3.5 w-3.5" />{t('imageExport.removePhoto')}</button>}
        {pictures.length > 0 && <div className="flex gap-1.5 overflow-x-auto pt-1">
          {pictures.filter((picture) => !picture.isPlaceholder).map((picture) => <button key={picture.id} type="button" draggable
            onDragStart={(event) => event.dataTransfer.setData('text/x-trailreplay-picture', picture.id)}
            onClick={() => { void loadLibraryPhotoIntoSlot(photoFirstSlotId, picture.id); }}
            className="h-12 w-12 shrink-0 overflow-hidden rounded border border-black/15" title={picture.originalFileName}>
            <img src={picture.url} alt="" className="h-full w-full object-cover" />
          </button>)}
        </div>}
        {photoError && <p className="text-xs text-red-600" role="alert">{photoError}</p>}
      </div>}

      {settings.template === 'split' && <div className="space-y-3 rounded-xl border border-black/10 bg-black/[0.025] p-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide">{t('imageExport.mapFrame')}</div>
          <p className="mt-1 text-[11px] leading-4 opacity-60">{t('imageExport.splitMapHint')}</p>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-3 text-xs">
            <span className="w-16 shrink-0 opacity-70">{t('imageExport.mapWidth')}</span>
            <input type="range" min={0.18} max={0.9} step={0.01} value={splitMapFrame.w}
              onChange={(event) => updateSplitMapFrame({ w: Number(event.target.value) })}
              className="min-w-0 flex-1 accent-[var(--trail-orange)]" />
            <span className="w-9 text-right tabular-nums opacity-60">{Math.round(splitMapFrame.w * 100)}%</span>
          </label>
          <label className="flex items-center gap-3 text-xs">
            <span className="w-16 shrink-0 opacity-70">{t('imageExport.mapHeight')}</span>
            <input type="range" min={0.12} max={0.7} step={0.01} value={splitMapFrame.h}
              onChange={(event) => updateSplitMapFrame({ h: Number(event.target.value) })}
              className="min-w-0 flex-1 accent-[var(--trail-orange)]" />
            <span className="w-9 text-right tabular-nums opacity-60">{Math.round(splitMapFrame.h * 100)}%</span>
          </label>
        </div>
        <button type="button" onClick={() => setSocialShareSettings({ splitMapFrame: undefined })}
          className="rounded-md bg-black/5 px-2.5 py-1.5 text-xs font-medium hover:bg-black/10">{t('imageExport.resetMapFrame')}</button>
        <div>
          <div className="mb-2 text-xs font-medium">{t('imageExport.mapStyle')}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { id: 'satellite', label: 'settings.mapStyles.satellite' },
              { id: 'topo', label: 'settings.mapStyles.topo' },
              { id: 'outdoor', label: 'settings.mapStyles.outdoor' },
              { id: 'street', label: 'settings.mapStyles.street' },
            ] as const satisfies Array<{ id: MapStyle; label: string }>).map((option) => <button key={option.id} type="button"
              onClick={() => setMapStyle(option.id)} aria-pressed={mapStyle === option.id}
              className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${mapStyle === option.id ? 'bg-[var(--trail-orange)] text-white' : 'bg-white text-[var(--evergreen)] hover:bg-black/10'}`}>
              {t(option.label)}
            </button>)}
          </div>
        </div>
      </div>}

      {/* Title */}
      <div>
        <div className="text-xs uppercase tracking-wide opacity-60 mb-2">{t('imageExport.title')}</div>
        <div className="grid grid-cols-3 gap-1 mb-2">
          {(['journey-name', 'track-name', 'custom'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setSocialShareSettings({ titleMode: mode })}
              className={`py-1.5 rounded text-xs font-medium transition-colors ${
                settings.titleMode === mode
                  ? 'bg-[var(--trail-orange)] text-white'
                  : 'bg-black/5 hover:bg-black/10'
              }`}
            >
              {mode === 'journey-name'
                ? t('imageExport.titleModeJourney')
                : mode === 'track-name'
                  ? t('imageExport.titleModeTrack')
                  : t('imageExport.titleModeCustom')}
            </button>
          ))}
        </div>
        {settings.titleMode === 'custom' && (
          <textarea
            rows={3}
            value={settings.customTitle}
            onChange={(e) => setSocialShareSettings({ customTitle: e.target.value })}
            placeholder={t('imageExport.titlePlaceholder')}
            className="w-full resize-y bg-black/5 border border-black/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-[var(--trail-orange)]"
          />
        )}
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-black/10 bg-black/[0.025] p-2">
          <label className="min-w-0 flex-1 text-[11px] font-medium">
            {t('imageExport.titleSize')}
            <input type="range" min={0.5} max={3.2} step={0.05} value={settings.titleScale ?? 1}
              onChange={(event) => setSocialShareSettings({ titleScale: Number(event.target.value) })}
              className="mt-1 block w-full accent-[var(--trail-orange)]" />
          </label>
          <span className="w-9 text-right text-[11px] tabular-nums opacity-60">{Math.round((settings.titleScale ?? 1) * 100)}%</span>
        </div>
        <label className="mt-2 flex items-center gap-2 text-[11px] font-medium">
          {t('imageExport.titleColor')}
          <input type="color" value={settings.titleColor ?? '#FFFFFF'} onChange={(event) => setSocialShareSettings({ titleColor: event.target.value })}
            aria-label={t('imageExport.titleColor')} className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0" />
        </label>
        <label className="mt-2 block text-[11px] font-medium">{t('imageExport.titleWidth')}
          <input type="range" min={0.3} max={0.96} step={0.02} value={settings.titleWidth ?? 0.74}
            onChange={(event) => setSocialShareSettings({ titleWidth: Number(event.target.value) })}
            className="mt-1 block w-full accent-[var(--trail-orange)]" />
        </label>
      </div>

      {/* Location */}
      {settings.template !== 'split' && <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide opacity-60">{t('imageExport.location')}</div>
          <button
            onClick={() => setSocialShareSettings({ showLocation: !settings.showLocation })}
            className={`relative w-9 h-5 rounded-full transition-colors ${
              settings.showLocation ? 'bg-[var(--trail-orange)]' : 'bg-black/20'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                settings.showLocation ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        {settings.showLocation && (
          <input
            type="text"
            value={settings.locationLabel}
            onChange={(e) => setSocialShareSettings({ locationLabel: e.target.value })}
            placeholder={t('imageExport.locationPlaceholder')}
            className="w-full bg-black/5 border border-black/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-[var(--trail-orange)]"
          />
        )}
      </div>}

      {/* Overlays toggles */}
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={settings.showStats}
            onChange={(e) => setSocialShareSettings({ showStats: e.target.checked })}
            className="accent-[var(--trail-orange)]"
          />
          {t('imageExport.stats')}
        </label>
        {settings.template !== 'split' && <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={settings.showElevationMiniChart}
            onChange={(e) => setSocialShareSettings({ showElevationMiniChart: e.target.checked })}
            className="accent-[var(--trail-orange)]"
          />
          {t('imageExport.elevation')}
        </label>}
        {settings.template !== 'split' && <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={settings.routeGlow}
            onChange={(e) => setSocialShareSettings({ routeGlow: e.target.checked })}
            className="accent-[var(--trail-orange)]"
          />
          {t('imageExport.routeGlow')}
        </label>}
      </div>

      {settings.showStats && (
        <div className="space-y-2 rounded-xl border border-black/10 bg-black/[0.025] p-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide">{t('imageExport.customizeStats')}</p>
            <p className="mt-0.5 text-[11px] opacity-60">{t('imageExport.customizeStatsHint')}</p>
            <p className="mt-1 text-[11px] font-medium text-[var(--evergreen)]">{t('imageExport.dragResizeStatsHint')}</p>
            {settings.statsFrame && <button type="button"
              onClick={() => setSocialShareSettings({ statsFrame: undefined, statsLayout: settings.layoutPreset === 'classic' ? 3 : 2 })}
              className="mt-1 text-[11px] font-semibold text-[var(--trail-orange)] hover:underline">
              {t('imageExport.resetStatsLayout')}
            </button>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] opacity-60">{t('imageExport.statsStyle')}</span>
            {(['minimal', 'cards', 'accent'] as const).map((style) => (
              <button key={style} type="button" onClick={() => setSocialShareSettings({ statsStyle: style })}
                className={`rounded px-2 py-1 text-[11px] ${settings.statsStyle === style ? 'bg-[var(--trail-orange)] text-white' : 'bg-black/5 hover:bg-black/10'}`}>
                {t(`imageExport.statsStyle${style[0].toUpperCase()}${style.slice(1)}`)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[11px] font-medium">
              {t('imageExport.statsColor')}
              <input type="color" value={settings.statsColor ?? '#FFFFFF'} onChange={(event) => setSocialShareSettings({ statsColor: event.target.value })}
                aria-label={t('imageExport.statsColor')} className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0" />
            </label>
            <label className="flex items-center gap-2 text-[11px] font-medium">
              <input type="checkbox" checked={settings.showStatsBackground !== false}
                onChange={(event) => setSocialShareSettings({ showStatsBackground: event.target.checked })}
                className="accent-[var(--trail-orange)]" />
              {t('imageExport.statsBackground')}
            </label>
          </div>
          {stats.map((stat, index) => (
            <div key={stat.id} className="space-y-1.5 rounded-lg bg-[var(--canvas)] p-2">
              <div className="flex items-center gap-1.5">
                <input type="checkbox" checked={stat.visible} onChange={(event) => updateStat(index, { visible: event.target.checked })}
                  aria-label={t('imageExport.showStat')} className="accent-[var(--trail-orange)]" />
                <select value={stat.metric} onChange={(event) => updateStat(index, { metric: event.target.value as SocialShareStatMetric })}
                  className="min-w-0 flex-1 rounded border border-black/10 bg-[var(--canvas)] px-2 py-1 text-xs">
                  {STAT_OPTIONS.map(({ value, labelKey }) => <option key={value} value={value}>{t(labelKey)}</option>)}
                </select>
                <button type="button" onClick={() => moveStat(index, -1)} disabled={index === 0} aria-label={t('imageExport.moveStatUp')} className="rounded p-1 hover:bg-black/5 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => moveStat(index, 1)} disabled={index === stats.length - 1} aria-label={t('imageExport.moveStatDown')} className="rounded p-1 hover:bg-black/5 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => setSocialShareSettings({ stats: stats.filter((_, i) => i !== index) })} aria-label={t('imageExport.removeStat')} className="rounded p-1 text-red-600 hover:bg-red-500/10"><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <button type="button" onClick={() => setEditingStatIconId(editingStatIconId === stat.id ? null : stat.id)}
                  aria-expanded={editingStatIconId === stat.id}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded border border-black/10 bg-[var(--canvas)] px-2 py-1 text-left hover:border-[var(--trail-orange)]">
                  <span className="grid h-6 w-6 shrink-0 place-items-center">
                    {stat.icon && annotationSymbolPath(stat.icon)
                      ? <svg aria-hidden="true" width="22" height="22" viewBox="0 0 15 15"><path fill={settings.statsColor} d={annotationSymbolPath(stat.icon) ?? ''} /></svg>
                      : stat.icon ? renderActivityIcon(stat.icon, { size: 22, color: settings.statsColor }) : null}
                  </span>
                  <span className="truncate">{stat.icon ? annotationSymbolLabel(stat.icon) : t('imageExport.noIcon')}</span>
                </button>
                {stat.icon && <button type="button" onClick={() => updateStat(index, { icon: undefined })} aria-label={t('imageExport.noIcon')} title={t('imageExport.noIcon')} className="rounded p-1 hover:bg-black/5"><X className="h-3.5 w-3.5" /></button>}
              </div>
              {editingStatIconId === stat.id && <div className="rounded-lg border border-black/10 bg-white p-2">
                <AnnotationSymbolPicker value={stat.icon ?? ''} label={t('imageExport.statIcon')} allowEmoji={false}
                  onChange={(icon) => { updateStat(index, { icon }); setEditingStatIconId(null); }} />
              </div>}
              <input type="text" value={stat.label} onChange={(event) => updateStat(index, { label: event.target.value })}
                placeholder={t('imageExport.statLabel')} className="w-full rounded border border-black/10 bg-[var(--canvas)] px-2 py-1 text-xs" />
              <input type="text" value={stat.value} onChange={(event) => updateStat(index, { value: event.target.value })}
                placeholder={t('imageExport.statValue')} aria-label={t('imageExport.statValue')}
                className="w-full rounded border border-black/10 bg-[var(--canvas)] px-2 py-1 text-xs" />
            </div>
          ))}
          <button type="button" disabled={stats.length >= 4}
            onClick={() => setSocialShareSettings({ stats: [...stats, { id: `stat-${Date.now()}`, metric: 'custom', label: '', value: '', visible: true }] })}
            className="w-full rounded-lg border border-dashed border-[var(--evergreen)]/25 px-2 py-1.5 text-xs font-medium hover:border-[var(--trail-orange)] disabled:opacity-40">
            {t('imageExport.addStat')}
          </button>
        </div>
      )}

      {/* Map camera controls */}
      {settings.template !== 'photo-first' && (
        <div>
          <div className="text-xs uppercase tracking-wide opacity-60 mb-2">{t('imageExport.mapCamera')}</div>
          <div className="space-y-2 mb-2">
            <div className="flex items-center gap-3 text-xs">
              <span className="w-16 shrink-0 opacity-70">{t('imageExport.tilt3D')}</span>
              <input
                type="range" min={0} max={60} step={1}
                value={pitch}
                onChange={(e) => handlePitch(Number(e.target.value))}
                className="flex-1 accent-[var(--trail-orange)]"
              />
              <span className="w-8 text-right opacity-50 tabular-nums">{pitch}°</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="w-16 shrink-0 opacity-70">{t('imageExport.rotate')}</span>
              <input
                type="range" min={-180} max={180} step={1}
                value={bearing}
                onChange={(e) => handleBearing(Number(e.target.value))}
                className="flex-1 accent-[var(--trail-orange)]"
              />
              <span className="w-8 text-right opacity-50 tabular-nums">{bearing}°</span>
            </div>
          </div>
          <button
            onClick={centerMap}
            disabled={!hasTracks}
            className="w-full text-xs py-1.5 rounded bg-black/5 hover:bg-black/10 transition-colors disabled:opacity-40"
          >
            {t('imageExport.fitTrack')}
          </button>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-black/[0.035] p-2.5">
            <div className="grid grid-cols-3 gap-1" aria-label={t('imageExport.mapPosition')}>
              <span />
              <button type="button" onClick={() => nudgeMap(0, -72)} aria-label={t('imageExport.moveMapUp')} className="rounded-md p-2 hover:bg-black/10"><ArrowUp className="h-4 w-4" /></button>
              <span />
              <button type="button" onClick={() => nudgeMap(-72, 0)} aria-label={t('imageExport.moveMapLeft')} className="rounded-md p-2 hover:bg-black/10"><ArrowLeft className="h-4 w-4" /></button>
              <button type="button" onClick={centerMap} aria-label={t('imageExport.centerMap')} className="rounded-md p-2 hover:bg-black/10"><Crosshair className="h-4 w-4" /></button>
              <button type="button" onClick={() => nudgeMap(72, 0)} aria-label={t('imageExport.moveMapRight')} className="rounded-md p-2 hover:bg-black/10"><ArrowRight className="h-4 w-4" /></button>
              <span />
              <button type="button" onClick={() => nudgeMap(0, 72)} aria-label={t('imageExport.moveMapDown')} className="rounded-md p-2 hover:bg-black/10"><ArrowDown className="h-4 w-4" /></button>
              <span />
            </div>
            <div className="flex flex-col gap-1">
              <button type="button" onClick={() => zoomMap('in')} aria-label={t('imageExport.zoomIn')} className="rounded-md p-2 hover:bg-black/10"><Plus className="h-4 w-4" /></button>
              <button type="button" onClick={() => zoomMap('out')} aria-label={t('imageExport.zoomOut')} className="rounded-md p-2 hover:bg-black/10"><Minus className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      )}

      {/* Photo-first route controls */}
      {settings.template === 'photo-first' && (
        <div>
          <div className="text-xs uppercase tracking-wide opacity-60 mb-2">{t('imageExport.routeOverlay')}</div>
          <div className="space-y-2">
            {(
              [
                { key: 'scale', labelKey: 'imageExport.scale', min: 0.3, max: 2.5, step: 0.05 },
                { key: 'offsetX', labelKey: 'imageExport.horizontal', min: -0.4, max: 0.4, step: 0.01 },
                { key: 'offsetY', labelKey: 'imageExport.vertical', min: -0.4, max: 0.4, step: 0.01 },
                { key: 'opacity', labelKey: 'imageExport.opacity', min: 0.2, max: 1, step: 0.05 },
              ] as const
            ).map(({ key, labelKey, min, max, step }) => (
              <div key={key} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 opacity-70">{t(labelKey)}</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={settings.routeTransform[key]}
                  onChange={(e) => setRouteTransform({ [key]: parseFloat(e.target.value) })}
                  className="flex-1 accent-[var(--trail-orange)]"
                />
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl bg-black/[0.035] p-2.5">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium">{t('imageExport.photoPosition')}</span>
              <span className="tabular-nums opacity-60">{photoTransform.scale.toFixed(1)}×</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="grid grid-cols-3 gap-1" aria-label={t('imageExport.photoPosition')}>
                <span />
                <button type="button" onClick={() => setPhotoTransform({ offsetY: Math.max(-1, photoTransform.offsetY - 0.04) })} aria-label={t('imageExport.movePhotoUp')} className="rounded-md p-2 hover:bg-black/10"><ArrowUp className="h-4 w-4" /></button>
                <span />
                <button type="button" onClick={() => setPhotoTransform({ offsetX: Math.max(-1, photoTransform.offsetX - 0.04) })} aria-label={t('imageExport.movePhotoLeft')} className="rounded-md p-2 hover:bg-black/10"><ArrowLeft className="h-4 w-4" /></button>
                <button type="button" onClick={() => setPhotoTransform({ offsetX: 0, offsetY: 0, scale: 1 })} aria-label={t('imageExport.resetPhoto')} className="rounded-md p-2 hover:bg-black/10"><Crosshair className="h-4 w-4" /></button>
                <button type="button" onClick={() => setPhotoTransform({ offsetX: Math.min(1, photoTransform.offsetX + 0.04) })} aria-label={t('imageExport.movePhotoRight')} className="rounded-md p-2 hover:bg-black/10"><ArrowRight className="h-4 w-4" /></button>
                <span />
                <button type="button" onClick={() => setPhotoTransform({ offsetY: Math.min(1, photoTransform.offsetY + 0.04) })} aria-label={t('imageExport.movePhotoDown')} className="rounded-md p-2 hover:bg-black/10"><ArrowDown className="h-4 w-4" /></button>
                <span />
              </div>
              <div className="flex flex-col gap-1">
                <button type="button" onClick={() => setPhotoTransform({ scale: Math.min(3, photoTransform.scale + 0.1) })} aria-label={t('imageExport.zoomIn')} className="rounded-md p-2 hover:bg-black/10"><Plus className="h-4 w-4" /></button>
                <button type="button" onClick={() => setPhotoTransform({ scale: Math.max(1, photoTransform.scale - 0.1) })} aria-label={t('imageExport.zoomOut')} className="rounded-md p-2 hover:bg-black/10"><Minus className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!hasTracks && (
        <p className="text-xs opacity-50 text-center">{t('imageExport.noTrackHint')}</p>
      )}

      {/* The cover canvas stays in the main map area while its controls remain in the sidebar. */}
      {coverMode && editorHost && createPortal(
        previewUrl ? <SocialSharePreviewModal
          previewUrl={previewUrl}
          isRendering={isRendering}
          onClose={() => undefined}
          onExport={() => { onPosterReady?.(previewUrl); onUseCover?.(); }}
          settings={settings}
          setSocialShareSettings={setSocialShareSettings}
          onMapRouteGesture={transformMapViewport}
          onPhotoSlotPick={openPhotoPicker}
          onPhotoSlotFile={(id, file) => { void loadPhotoIntoSlot(id, file); }}
          onPhotoSlotPicture={(id, pictureId) => { void loadLibraryPhotoIntoSlot(id, pictureId); }}
          onPhotoSlotChange={updatePhotoSlot}
          routeBboxNorm={routeBboxNorm}
          dataPanelBboxNorm={dataPanelBboxNorm}
          titleBboxNorm={titleBboxNorm}
          logoBboxNorm={logoBboxNorm}
          coverMode
          inline
        /> : <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#101916] text-sm text-white/70">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />{t('imageExport.rendering')}
        </div>,
        editorHost,
      )}

      {!coverMode && <button
        onClick={async () => {
          trackEvent('social_share_preview_opened', {
            template: settings.template,
            aspect_ratio: settings.aspectRatio,
          });
          await generatePreview({ fitMapFirstRoute: settings.template !== 'photo-first' });
          setShowPreview(true);
        }}
        disabled={isRendering || !hasTracks}
        className="w-full tr-btn tr-btn-primary flex items-center justify-center gap-2 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isRendering ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ImageIcon className="w-4 h-4" />
        )}
        {isRendering ? t('imageExport.rendering') : t(coverMode ? 'imageExport.previewCover' : 'imageExport.previewDownload')}
      </button>}

      {!coverMode && showPreview && previewUrl && (
        <SocialSharePreviewModal
          previewUrl={previewUrl}
          isRendering={isRendering}
          onClose={() => setShowPreview(false)}
          onExport={async () => { if (coverMode) onUseCover?.(); else await exportPng(); setShowPreview(false); }}
          settings={settings}
          setSocialShareSettings={setSocialShareSettings}
          onMapRouteGesture={transformMapViewport}
          onPhotoSlotPick={openPhotoPicker}
          onPhotoSlotFile={(id, file) => { void loadPhotoIntoSlot(id, file); }}
          onPhotoSlotPicture={(id, pictureId) => { void loadLibraryPhotoIntoSlot(id, pictureId); }}
          onPhotoSlotChange={updatePhotoSlot}
          routeBboxNorm={routeBboxNorm}
          dataPanelBboxNorm={dataPanelBboxNorm}
          titleBboxNorm={titleBboxNorm}
          logoBboxNorm={logoBboxNorm}
          coverMode={coverMode}
        />
      )}
    </div>
  );
}
