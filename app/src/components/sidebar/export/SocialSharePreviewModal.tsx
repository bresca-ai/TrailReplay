import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Download, ImagePlus, Loader2, Minus, Move, Plus, X } from 'lucide-react';
import type { SocialSharePhotoSlot, SocialShareSettings } from '@/types';
import type { MapRouteGesture, RouteBboxNorm } from './useSocialShareExport';
import { useI18n } from '@/i18n/useI18n';
import { getSplitMapFrame } from './socialShareSplit';
import { getPosterSize } from './socialShareRenderer';
import { movePosterFrame, resizePosterFrame, type FrameCorner, type PosterFrame } from './socialShareFrame';

export type CoverEditorSection = 'layout' | 'photos' | 'map' | 'title' | 'stats' | 'route' | 'logo';

interface Props {
  previewUrl: string;
  isRendering: boolean;
  onClose: () => void;
  onExport: () => void;
  onDownload?: () => void;
  settings: SocialShareSettings;
  setSocialShareSettings: (patch: Partial<SocialShareSettings>) => void;
  onMapRouteGesture: (gesture: MapRouteGesture) => Promise<void>;
  routeBboxNorm: RouteBboxNorm | null;
  dataPanelBboxNorm: RouteBboxNorm | null;
  titleBboxNorm: RouteBboxNorm;
  logoBboxNorm: RouteBboxNorm;
  onPhotoSlotPick: (id: string) => void;
  onPhotoSlotFile: (id: string, file: File) => void;
  onPhotoSlotPicture: (id: string, pictureId: string) => void;
  onPhotoSlotChange: (id: string, patch: Partial<SocialSharePhotoSlot>) => void;
  activePhotoSlotId: string | null;
  onPhotoSlotSelect: (id: string) => void;
  onElementSelect?: (section: CoverEditorSection) => void;
  coverMode?: boolean;
  inline?: boolean;
}

interface RouteDragState {
  type: 'move' | 'resize' | 'frame-move';
  frame?: PosterFrame;
  corner?: FrameCorner;
  startX: number;
  startY: number;
  startScale: number;
  startOffsetX: number;
  startOffsetY: number;
  containerW: number;
  containerH: number;
}

interface PanelDragState {
  startX: number;
  startY: number;
  startOffsetY: number;
  frame: RouteBboxNorm;
  containerW: number;
  containerH: number;
}

type StatsResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface StatsResizeState {
  startX: number;
  startY: number;
  frame: RouteBboxNorm;
  corner: StatsResizeCorner;
  containerW: number;
  containerH: number;
}

function chooseStatsColumns(width: number, height: number, count: number): 1 | 2 | 3 | 4 {
  let best: 1 | 2 | 3 | 4 = 1;
  let bestScore = Infinity;
  for (let columns = 1; columns <= Math.min(4, count); columns++) {
    const rows = Math.ceil(count / columns);
    const score = Math.abs(Math.log((width / Math.max(1, height)) / (columns / rows)));
    if (score < bestScore) { best = columns as 1 | 2 | 3 | 4; bestScore = score; }
  }
  return best;
}

function resizedStatsFrame(
  frame: RouteBboxNorm, corner: StatsResizeCorner,
  dx: number, dy: number, containerW: number, containerH: number,
): RouteBboxNorm {
  const moveX = dx / containerW;
  const moveY = dy / containerH;
  const fromLeft = corner.includes('left');
  const fromTop = corner.includes('top');
  const right = frame.x + frame.w;
  const bottom = frame.y + frame.h;
  const x = fromLeft ? Math.max(0, Math.min(right - 0.16, frame.x + moveX)) : frame.x;
  const y = fromTop ? Math.max(0, Math.min(bottom - 0.07, frame.y + moveY)) : frame.y;
  const w = fromLeft ? right - x : Math.max(0.16, Math.min(1 - x, frame.w + moveX));
  const h = fromTop ? bottom - y : Math.max(0.07, Math.min(1 - y, frame.h + moveY));
  return { x, y, w, h };
}

interface TitleDragState {
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
  containerW: number;
  containerH: number;
}

interface PhotoDragState {
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
  containerW: number;
  containerH: number;
}

export function SocialSharePreviewModal({
  previewUrl, isRendering, onClose, onExport, onDownload,
  settings, setSocialShareSettings, onMapRouteGesture, routeBboxNorm, dataPanelBboxNorm, titleBboxNorm, coverMode = false, inline = false,
  logoBboxNorm,
  onPhotoSlotPick, onPhotoSlotFile, onPhotoSlotPicture, onPhotoSlotChange, activePhotoSlotId, onPhotoSlotSelect, onElementSelect,
}: Props) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [canvasZoom, setCanvasZoom] = useState(1);

  // Route overlay drag state
  const routeDragRef = useRef<RouteDragState | null>(null);
  const [routeDragVisual, setRouteDragVisual] = useState<{ dx: number; dy: number; sf: number; active: boolean; type: RouteDragState['type'] | null }>({ dx: 0, dy: 0, sf: 1, active: false, type: null });
  const [splitMapDraft, setSplitMapDraft] = useState<PosterFrame | null>(null);

  // Panel overlay drag state
  const panelDragRef = useRef<PanelDragState | null>(null);
  const [panelDragVisual, setPanelDragVisual] = useState({ dx: 0, dy: 0, active: false });
  const statsResizeRef = useRef<StatsResizeState | null>(null);
  const [statsResizeVisual, setStatsResizeVisual] = useState<{
    dx: number; dy: number; corner: StatsResizeCorner; active: boolean;
    frame: RouteBboxNorm | null; containerW: number; containerH: number;
  }>({ dx: 0, dy: 0, corner: 'bottom-right', active: false, frame: null, containerW: 0, containerH: 0 });
  const titleDragRef = useRef<TitleDragState | null>(null);
  const [titleDragVisual, setTitleDragVisual] = useState({ dx: 0, dy: 0, active: false });
  const titleResizeRef = useRef<{ x: number; y: number; scale: number; width: number; containerW: number } | null>(null);
  const logoDragRef = useRef<TitleDragState | null>(null);
  const [logoDragVisual, setLogoDragVisual] = useState({ dx: 0, dy: 0, active: false });
  const photoDragRef = useRef<PhotoDragState | null>(null);
  const [photoDragVisual, setPhotoDragVisual] = useState({ dx: 0, dy: 0, active: false });
  const [photoEditMode, setPhotoEditMode] = useState(false);
  const splitPhotoDragRef = useRef<{
    slot: SocialSharePhotoSlot; x: number; y: number;
    containerW: number; containerH: number;
    mode: 'move' | 'resize' | 'crop'; corner?: FrameCorner;
  } | null>(null);
  const [splitPhotoDragVisual, setSplitPhotoDragVisual] = useState({ id: '', dx: 0, dy: 0 });
  const [splitPhotoDraft, setSplitPhotoDraft] = useState<{ id: string; frame: PosterFrame } | null>(null);
  const [splitPhotoCropId, setSplitPhotoCropId] = useState<string | null>(null);

  const onSplitPhotoPointerDown = (e: React.PointerEvent, slot: SocialSharePhotoSlot, mode: 'move' | 'resize' | 'crop', corner?: FrameCorner) => {
    e.stopPropagation();
    e.preventDefault();
    onElementSelect?.('photos');
    onPhotoSlotSelect(slot.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    splitPhotoDragRef.current = { slot, x: e.clientX, y: e.clientY, containerW: rect.width, containerH: rect.height, mode, corner };
    setSplitPhotoDragVisual({ id: slot.id, dx: 0, dy: 0 });
  };
  const onSplitPhotoPointerMove = (e: React.PointerEvent) => {
    const drag = splitPhotoDragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (drag.mode === 'crop') setSplitPhotoDragVisual({ id: drag.slot.id, dx, dy });
    else setSplitPhotoDraft({
      id: drag.slot.id,
      frame: drag.mode === 'resize' && drag.corner
        ? resizePosterFrame(drag.slot, drag.corner, dx / drag.containerW, dy / drag.containerH)
        : movePosterFrame(drag.slot, dx / drag.containerW, dy / drag.containerH),
    });
  };
  const onSplitPhotoPointerUp = (e: React.PointerEvent) => {
    const drag = splitPhotoDragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (drag.mode === 'crop') {
      if (Math.abs(dx) + Math.abs(dy) > 1) onPhotoSlotChange(drag.slot.id, {
        offsetX: Math.max(-0.5, Math.min(0.5, drag.slot.offsetX - dx / (drag.containerW * drag.slot.w))),
        offsetY: Math.max(-0.5, Math.min(0.5, drag.slot.offsetY - dy / (drag.containerH * drag.slot.h))),
      });
    } else if (drag.mode === 'resize' && drag.corner) {
      onPhotoSlotChange(drag.slot.id, resizePosterFrame(drag.slot, drag.corner, dx / drag.containerW, dy / drag.containerH));
    } else if (Math.abs(dx) + Math.abs(dy) > 3) {
      onPhotoSlotChange(drag.slot.id, movePosterFrame(drag.slot, dx / drag.containerW, dy / drag.containerH));
    } else if (!drag.slot.imageUrl) {
      onPhotoSlotPick(drag.slot.id);
    }
    splitPhotoDragRef.current = null;
    setSplitPhotoDragVisual({ id: '', dx: 0, dy: 0 });
    setSplitPhotoDraft(null);
  };

  const aspectStyle = settings.aspectRatio === '16:9' ? '16 / 9'
    : settings.aspectRatio === '4:5' ? '4 / 5'
      : settings.aspectRatio === '9:16' ? '9 / 16' : '1 / 1';
  const aspectNumber = settings.aspectRatio === '16:9' ? 16 / 9
    : settings.aspectRatio === '4:5' ? 4 / 5
      : settings.aspectRatio === '9:16' ? 9 / 16 : 1;
  const canvasWidth = Math.min(stageSize.width, stageSize.height * aspectNumber) * canvasZoom;

  useEffect(() => {
    if (!inline || !stageRef.current) return;
    const stage = stageRef.current;
    const update = () => setStageSize({ width: Math.max(0, stage.clientWidth - 32), height: Math.max(0, stage.clientHeight - 32) });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [inline]);

  const showRouteOverlay = !!routeBboxNorm;
  const displayedMapFrame = settings.template === 'split' && splitMapDraft ? splitMapDraft : routeBboxNorm;
  const showPanelOverlay = !!dataPanelBboxNorm;
  const hasVisibleCoverStats = settings.showStats && (settings.stats?.some((stat) => stat.visible) ?? true);
  const visibleCoverStatCount = Math.max(1, Math.min(4, settings.stats?.filter((stat) => stat.visible).length ?? 3));
  const resizePreviewFrame = statsResizeVisual.active && statsResizeVisual.frame
    ? resizedStatsFrame(statsResizeVisual.frame, statsResizeVisual.corner, statsResizeVisual.dx, statsResizeVisual.dy, statsResizeVisual.containerW, statsResizeVisual.containerH)
    : null;
  const resizePreviewColumns = resizePreviewFrame
    ? chooseStatsColumns(resizePreviewFrame.w * statsResizeVisual.containerW, resizePreviewFrame.h * statsResizeVisual.containerH, visibleCoverStatCount)
    : settings.statsLayout;
  const guideFrame = statsResizeVisual.frame;
  const resizeGuideTargets = guideFrame && statsResizeVisual.active
    ? Array.from({ length: visibleCoverStatCount }, (_, index) => {
      const columns = index + 1;
      const rows = Math.ceil(visibleCoverStatCount / columns);
      const { corner, containerW, containerH } = statsResizeVisual;
      const frame = guideFrame;
      const area = frame.w * containerW * frame.h * containerH;
      const ratio = columns / rows;
      const naturalW = Math.sqrt(area * ratio);
      const naturalH = Math.sqrt(area / ratio);
      const anchorRight = (frame.x + frame.w) * containerW;
      const anchorBottom = (frame.y + frame.h) * containerH;
      const availableW = corner.includes('left') ? anchorRight : containerW - frame.x * containerW;
      const availableH = corner.includes('top') ? anchorBottom : containerH - frame.y * containerH;
      const fit = Math.min(1, availableW / naturalW, availableH / naturalH);
      const width = naturalW * fit;
      const height = naturalH * fit;
      return {
        columns, rows, width, height,
        left: corner.includes('left') ? anchorRight - width : frame.x * containerW,
        top: corner.includes('top') ? anchorBottom - height : frame.y * containerH,
      };
    })
    : [];
  const hasAnyOverlay = showRouteOverlay || showPanelOverlay || !!titleBboxNorm || !!logoBboxNorm;
  const hasEmptySplitFrame = settings.template === 'split' && (!settings.photoSlots?.length || settings.photoSlots.some((slot) => !slot.imageUrl));
  const photoFirstSlotId = settings.photoSlots?.[0]?.id ?? 'photo-first-hero';
  const hasPhotoFirstImage = !!settings.photoSlots?.[0]?.imageUrl || !!settings.selectedPictureId;
  const hasEmptyPhotoFrame = settings.template === 'photo-first' && !hasPhotoFirstImage;

  const onPhotoPointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    if (settings.template !== 'photo-first' || !hasPhotoFirstImage) return;
    onElementSelect?.('photos');
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const transform = settings.photoTransform ?? { offsetX: 0, offsetY: 0, scale: 1 };
    photoDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: transform.offsetX,
      startOffsetY: transform.offsetY,
      containerW: rect.width,
      containerH: rect.height,
    };
    setPhotoDragVisual({ dx: 0, dy: 0, active: true });
  };

  const onPhotoPointerMove = (e: React.PointerEvent<HTMLImageElement>) => {
    const drag = photoDragRef.current;
    if (!drag) return;
    setPhotoDragVisual({ dx: e.clientX - drag.startX, dy: e.clientY - drag.startY, active: true });
  };

  const onPhotoPointerUp = () => {
    const drag = photoDragRef.current;
    if (!drag) return;
    setSocialShareSettings({
      photoTransform: {
        ...(settings.photoTransform ?? { offsetX: 0, offsetY: 0, scale: 1 }),
        offsetX: Math.max(-1, Math.min(1, drag.startOffsetX + photoDragVisual.dx / drag.containerW)),
        offsetY: Math.max(-1, Math.min(1, drag.startOffsetY + photoDragVisual.dy / drag.containerH)),
      },
    });
    photoDragRef.current = null;
    setPhotoDragVisual({ dx: 0, dy: 0, active: false });
  };

  const onTitlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onElementSelect?.('title');
    const container = containerRef.current;
    if (!container) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = container.getBoundingClientRect();
    titleDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: settings.titleOffsetX,
      startOffsetY: settings.titleOffsetY,
      containerW: rect.width,
      containerH: rect.height,
    };
    setTitleDragVisual({ dx: 0, dy: 0, active: true });
  };

  const onTitlePointerMove = (e: React.PointerEvent) => {
    const drag = titleDragRef.current;
    if (!drag) return;
    setTitleDragVisual({ dx: e.clientX - drag.startX, dy: e.clientY - drag.startY, active: true });
  };

  const onTitlePointerUp = (e: React.PointerEvent) => {
    const drag = titleDragRef.current;
    if (!drag) return;
    const x = Math.max(0, Math.min(1 - titleBboxNorm.w, titleBboxNorm.x + (e.clientX - drag.startX) / drag.containerW));
    const y = Math.max(0, Math.min(1 - titleBboxNorm.h, titleBboxNorm.y + (e.clientY - drag.startY) / drag.containerH));
    setSocialShareSettings({
      titleOffsetX: drag.startOffsetX + x - titleBboxNorm.x,
      titleOffsetY: drag.startOffsetY + y - titleBboxNorm.y,
    });
    titleDragRef.current = null;
    setTitleDragVisual({ dx: 0, dy: 0, active: false });
  };

  const onTitleResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onElementSelect?.('title');
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    titleResizeRef.current = { x: e.clientX, y: e.clientY, scale: settings.titleScale, width: settings.titleWidth, containerW: rect.width };
  };
  const onTitleResizeUp = (e: React.PointerEvent) => {
    const drag = titleResizeRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.x) / drag.containerW;
    const dy = (e.clientY - drag.y) / drag.containerW;
    setSocialShareSettings({
      titleScale: Math.max(0.5, Math.min(3.2, drag.scale * (1 + dy * 2.4))),
      titleWidth: Math.max(0.3, Math.min(0.96, drag.width + dx)),
    });
    titleResizeRef.current = null;
  };

  const onLogoPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onElementSelect?.('logo');
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    logoDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: logoBboxNorm.x,
      startOffsetY: logoBboxNorm.y,
      containerW: rect.width,
      containerH: rect.height,
    };
    setLogoDragVisual({ dx: 0, dy: 0, active: true });
  };

  const onLogoPointerMove = (e: React.PointerEvent) => {
    const drag = logoDragRef.current;
    if (!drag) return;
    setLogoDragVisual({ dx: e.clientX - drag.startX, dy: e.clientY - drag.startY, active: true });
  };

  const onLogoPointerUp = (e: React.PointerEvent) => {
    const drag = logoDragRef.current;
    if (!drag) return;
    setSocialShareSettings({
      logoPositionX: Math.max(0, Math.min(1 - logoBboxNorm.w, drag.startOffsetX + (e.clientX - drag.startX) / drag.containerW)),
      logoPositionY: Math.max(0, Math.min(1 - logoBboxNorm.h, drag.startOffsetY + (e.clientY - drag.startY) / drag.containerH)),
    });
    logoDragRef.current = null;
    setLogoDragVisual({ dx: 0, dy: 0, active: false });
  };

  // ── Route drag handlers (pointer capture on the bbox div) ─────────────────
  const onRoutePointerDown = (e: React.PointerEvent, type: RouteDragState['type'], corner?: FrameCorner) => {
    e.stopPropagation();
    e.preventDefault();
    onElementSelect?.(settings.template === 'photo-first' ? 'route' : 'map');
    const container = containerRef.current;
    if (!container) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = container.getBoundingClientRect();
    const poster = getPosterSize(settings.aspectRatio);
    routeDragRef.current = {
      type,
      frame: settings.template === 'split' ? getSplitMapFrame(poster.w, poster.h, settings.splitMapFrame) : undefined,
      corner,
      startX: e.clientX,
      startY: e.clientY,
      startScale: settings.routeTransform.scale,
      startOffsetX: settings.routeTransform.offsetX,
      startOffsetY: settings.routeTransform.offsetY,
      containerW: rect.width,
      containerH: rect.height,
    };
    setRouteDragVisual({ dx: 0, dy: 0, sf: 1, active: true, type });
  };

  const onRoutePointerMove = (e: React.PointerEvent) => {
    const ds = routeDragRef.current;
    if (!ds) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    if (settings.template === 'split' && ds.frame && ds.type !== 'move') {
      setSplitMapDraft(ds.type === 'resize' && ds.corner
        ? resizePosterFrame(ds.frame, ds.corner, dx / ds.containerW, dy / ds.containerH, 0.18, 0.12)
        : movePosterFrame(ds.frame, dx / ds.containerW, dy / ds.containerH));
      return;
    }
    if (ds.type === 'move' || ds.type === 'frame-move' || settings.template === 'split') {
      setRouteDragVisual({ dx, dy, sf: 1, active: true, type: ds.type });
    } else {
      const diag = (dx + dy) * 0.5;
      const sf = Math.max(0.2, 1 + diag / (ds.containerW * 0.6));
      setRouteDragVisual({ dx: 0, dy: 0, sf, active: true, type: ds.type });
    }
  };

  const onRoutePointerUp = (e: React.PointerEvent) => {
    const ds = routeDragRef.current;
    if (!ds) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    const scaleFactor = Math.max(0.2, 1 + (dx + dy) * 0.5 / (ds.containerW * 0.6));
    routeDragRef.current = null;
    setRouteDragVisual({ dx: 0, dy: 0, sf: 1, active: false, type: null });
    setSplitMapDraft(null);

    if (settings.template === 'split' && ds.frame) {
      if (ds.type === 'move') {
        if (Math.abs(dx) + Math.abs(dy) < 2) return;
        void onMapRouteGesture({
          type: 'move',
          deltaX: dx / (ds.containerW * ds.frame.w),
          deltaY: dy / (ds.containerH * ds.frame.h),
        });
      } else {
        const frame = ds.type === 'resize' && ds.corner
          ? resizePosterFrame(ds.frame, ds.corner, dx / ds.containerW, dy / ds.containerH, 0.18, 0.12)
          : movePosterFrame(ds.frame, dx / ds.containerW, dy / ds.containerH);
        setSocialShareSettings({ splitMapFrame: frame });
      }
      return;
    }

    if (settings.template === 'map-first') {
      if (ds.type === 'move') {
        void onMapRouteGesture({
          type: 'move',
          deltaX: dx / ds.containerW,
          deltaY: dy / ds.containerH,
        });
      } else {
        void onMapRouteGesture({
          type: 'resize',
          scaleFactor,
          anchorX: (routeBboxNorm?.x ?? 0) + (routeBboxNorm?.w ?? 1) / 2,
          anchorY: (routeBboxNorm?.y ?? 0) + (routeBboxNorm?.h ?? 1) / 2,
        });
      }
      return;
    }

    if (ds.type === 'move') {
      setSocialShareSettings({
        routeTransform: {
          ...settings.routeTransform,
          offsetX: ds.startOffsetX + dx / ds.containerW,
          offsetY: ds.startOffsetY + dy / ds.containerH,
        },
      });
    } else {
      setSocialShareSettings({
        routeTransform: {
          ...settings.routeTransform,
          scale: Math.max(0.3, Math.min(4, ds.startScale * scaleFactor)),
        },
      });
    }
  };

  // ── Panel drag handlers (pointer capture on the panel div) ────────────────
  const onPanelPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onElementSelect?.('stats');
    const container = containerRef.current;
    if (!container || !dataPanelBboxNorm) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = container.getBoundingClientRect();
    panelDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOffsetY: settings.dataPanelOffsetY,
      frame: dataPanelBboxNorm,
      containerW: rect.width,
      containerH: rect.height,
    };
    setPanelDragVisual({ dx: 0, dy: 0, active: true });
  };

  const onPanelPointerMove = (e: React.PointerEvent) => {
    const ds = panelDragRef.current;
    if (!ds) return;
    setPanelDragVisual({ dx: e.clientX - ds.startX, dy: e.clientY - ds.startY, active: true });
  };

  const onPanelPointerUp = (e: React.PointerEvent) => {
    const ds = panelDragRef.current;
    if (!ds) return;
    if (hasVisibleCoverStats) {
      setSocialShareSettings({ statsFrame: {
        ...ds.frame,
        x: Math.max(0, Math.min(1 - ds.frame.w, ds.frame.x + (e.clientX - ds.startX) / ds.containerW)),
        y: Math.max(0, Math.min(1 - ds.frame.h, ds.frame.y + (e.clientY - ds.startY) / ds.containerH)),
      } });
    } else {
      setSocialShareSettings({ dataPanelOffsetY: Math.max(0, Math.min(0.85, ds.startOffsetY - (e.clientY - ds.startY) / ds.containerH)) });
    }
    panelDragRef.current = null;
    setPanelDragVisual({ dx: 0, dy: 0, active: false });
  };

  const onStatsResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onElementSelect?.('stats');
    const corner = e.currentTarget.getAttribute('data-corner') as StatsResizeCorner;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !dataPanelBboxNorm) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    statsResizeRef.current = { startX: e.clientX, startY: e.clientY, frame: dataPanelBboxNorm, corner, containerW: rect.width, containerH: rect.height };
    setStatsResizeVisual({ dx: 0, dy: 0, corner, active: true, frame: dataPanelBboxNorm, containerW: rect.width, containerH: rect.height });
  };

  const onStatsResizeMove = (e: React.PointerEvent) => {
    const drag = statsResizeRef.current;
    if (!drag) return;
    setStatsResizeVisual({ dx: e.clientX - drag.startX, dy: e.clientY - drag.startY, corner: drag.corner, active: true, frame: drag.frame, containerW: drag.containerW, containerH: drag.containerH });
  };

  const onStatsResizeUp = (e: React.PointerEvent) => {
    const drag = statsResizeRef.current;
    if (!drag) return;
    const frame = resizedStatsFrame(drag.frame, drag.corner, e.clientX - drag.startX, e.clientY - drag.startY, drag.containerW, drag.containerH);
    setSocialShareSettings({ statsFrame: frame, statsLayout: chooseStatsColumns(frame.w * drag.containerW, frame.h * drag.containerH, visibleCoverStatCount) });
    statsResizeRef.current = null;
    setStatsResizeVisual({ dx: 0, dy: 0, corner: 'bottom-right', active: false, frame: null, containerW: 0, containerH: 0 });
  };

  const photoSlotElements: ReactNode[] = [];
  if (settings.template === 'split') {
    for (const slot of settings.photoSlots ?? []) {
              const frame = splitPhotoDraft?.id === slot.id ? splitPhotoDraft.frame : slot;
              const selected = activePhotoSlotId === slot.id;
              const cropping = splitPhotoCropId === slot.id;
              const photoResizeHandles: ReactNode[] = [];
              for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
                photoResizeHandles.push(<div key={corner}
                  className={`absolute z-30 h-4 w-4 rounded-sm bg-[var(--trail-orange)] shadow ${corner.includes('top') ? 'top-0' : 'bottom-0'} ${corner.includes('left') ? 'left-0' : 'right-0'}`}
                  style={{ cursor: corner === 'top-right' || corner === 'bottom-left' ? 'nesw-resize' : 'nwse-resize' }}
                  onPointerDown={(event) => onSplitPhotoPointerDown(event, slot, 'resize', corner)}
                  onPointerMove={onSplitPhotoPointerMove}
                  onPointerUp={onSplitPhotoPointerUp}
                  onPointerCancel={onSplitPhotoPointerUp}
                  aria-label={t('imageExport.resizePhotoFrame')} title={t('imageExport.resizePhotoFrame')} />
                );
              }
              photoSlotElements.push(<div key={slot.id}
                className={`absolute select-none border-2 ${selected ? 'border-[var(--trail-orange)] ring-1 ring-white/80' : slot.imageUrl ? 'border-transparent hover:border-white/90' : 'border-dashed border-white/80 bg-white/5'}`}
                style={{ left: `${frame.x * 100}%`, top: `${frame.y * 100}%`, width: `${frame.w * 100}%`, height: `${frame.h * 100}%`, zIndex: slot.aboveMap ? 15 : 5, cursor: cropping ? 'move' : 'grab', touchAction: 'none' }}
                onPointerDown={(event) => onSplitPhotoPointerDown(event, slot, cropping ? 'crop' : 'move')}
                onPointerMove={onSplitPhotoPointerMove}
                onPointerUp={onSplitPhotoPointerUp}
                onPointerCancel={onSplitPhotoPointerUp}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  if (slot.imageUrl) setSplitPhotoCropId(cropping ? null : slot.id);
                  else onPhotoSlotPick(slot.id);
                }}
                onWheel={(event) => { if (!slot.imageUrl) return; event.preventDefault(); onPhotoSlotChange(slot.id, { scale: Math.max(1, Math.min(3, slot.scale + (event.deltaY < 0 ? 0.03 : -0.03))) }); }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files[0];
                  const pictureId = event.dataTransfer.getData('text/x-trailreplay-picture');
                  if (file?.type.startsWith('image/')) onPhotoSlotFile(slot.id, file);
                  else if (pictureId) onPhotoSlotPicture(slot.id, pictureId);
                }}
                aria-label={slot.imageUrl ? t(cropping ? 'imageExport.movePhotoCrop' : 'imageExport.movePhotoFrame') : t('imageExport.addPhoto')}
              >
                {splitPhotoDraft?.id === slot.id && slot.imageUrl && <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <img src={slot.imageUrl} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${50 + slot.offsetX * 100}% ${50 + slot.offsetY * 100}%`, transform: `scale(${slot.scale})` }} />
                </div>}
                {selected && slot.imageUrl && <button type="button"
                  className="absolute left-1/2 top-2 z-30 -translate-x-1/2 rounded bg-white px-2 py-1 text-[10px] font-semibold text-[var(--evergreen)] shadow"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => { event.stopPropagation(); setSplitPhotoCropId(cropping ? null : slot.id); }}
                  aria-pressed={cropping}>
                  {t(cropping ? 'imageExport.doneEditingPhoto' : 'imageExport.cropPhoto')}
                </button>}
                {selected && !cropping && photoResizeHandles}
                {cropping && splitPhotoDragVisual.id === slot.id && (splitPhotoDragVisual.dx !== 0 || splitPhotoDragVisual.dy !== 0) && <span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-xs text-white">{t('imageExport.movePhotoCrop')}</span>}
              </div>);
    }
  }

  const routeResizeHandles: ReactNode[] = [];
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
    routeResizeHandles.push(<div key={corner}
                    className={`absolute z-20 flex h-5 w-5 items-center justify-center rounded-sm bg-[var(--trail-orange)] shadow ${corner.includes('top') ? 'top-0' : 'bottom-0'} ${corner.includes('left') ? 'left-0' : 'right-0'}`}
                    style={{ cursor: corner === 'top-right' || corner === 'bottom-left' ? 'nesw-resize' : 'nwse-resize' }}
                    onPointerDown={(event) => onRoutePointerDown(event, 'resize', corner)}
                    onPointerMove={onRoutePointerMove}
                    onPointerUp={onRoutePointerUp}
                    onPointerCancel={onRoutePointerUp}
                    aria-label={t('imageExport.resizeMapFrame')} title={t('imageExport.resizeMapFrame')}>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 7L7 1M4 7L7 4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </div>
    );
  }

  return (
    <div
      className={inline
        ? 'absolute inset-0 z-40 flex items-center justify-center bg-[#101916] p-3 sm:p-6'
        : 'fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4'}
      onClick={inline ? undefined : onClose}
    >
      <div
        className={inline
          ? 'flex h-full w-full flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#17231e] shadow-2xl'
          : 'bg-[var(--canvas)] rounded-xl shadow-2xl max-h-[94vh] w-full max-w-md flex flex-col overflow-hidden'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between gap-3 px-4 py-3 shrink-0 ${inline ? 'border-b border-white/10 text-white' : 'border-b border-black/10'}`}>
          <h2 className={`font-bold text-sm uppercase tracking-wide ${inline ? 'text-white' : 'text-[var(--evergreen)]'}`}>
            {inline ? t(coverMode ? 'imageExport.videoCover' : 'imageExport.posterPreview') : t('imageExport.posterPreview')}
            {!inline && hasAnyOverlay && (
              <span className="ml-2 text-xs font-normal opacity-60 normal-case tracking-normal">
                {t(settings.template === 'map-first'
                ? 'imageExport.dragMapHint'
                : settings.template === 'split' ? 'imageExport.dragSplitMapHint'
                  : photoEditMode ? 'imageExport.dragPhotoOnlyHint' : 'imageExport.dragPhotoHint')}
              </span>
            )}
          </h2>
          {inline && isRendering && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/60" aria-label={t('imageExport.rendering')} />}
          {settings.template === 'photo-first' && (
            <button type="button" onClick={() => setPhotoEditMode((active) => !active)}
              aria-pressed={photoEditMode}
              className={`ml-auto mr-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${photoEditMode ? 'bg-[var(--trail-orange)] text-white' : inline ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-black/5 hover:bg-black/10'}`}>
              <Move className="h-3.5 w-3.5" />
              {t(photoEditMode ? 'imageExport.doneEditingPhoto' : 'imageExport.editPhoto')}
            </button>
          )}
          {inline && <div className="ml-auto flex shrink-0 items-center gap-1 rounded-lg bg-white/10 p-1 text-white">
            <button type="button" onClick={() => setCanvasZoom((zoom) => Math.max(1, Number((zoom - 0.1).toFixed(2))))} disabled={canvasZoom <= 1} aria-label={t('imageExport.zoomOut')} className="rounded p-1 hover:bg-white/15 disabled:opacity-35"><Minus className="h-3.5 w-3.5" /></button>
            <span className="w-10 text-center text-[11px] tabular-nums">{Math.round(canvasZoom * 100)}%</span>
            <button type="button" onClick={() => setCanvasZoom((zoom) => Math.min(2.5, Number((zoom + 0.1).toFixed(2))))} disabled={canvasZoom >= 2.5} aria-label={t('imageExport.zoomIn')} className="rounded p-1 hover:bg-white/15 disabled:opacity-35"><Plus className="h-3.5 w-3.5" /></button>
          </div>}
          {!inline && <button onClick={onClose} className="p-1 hover:bg-black/5 rounded">
            <X className="w-4 h-4" />
          </button>}
        </div>

        <div ref={stageRef} className={`min-h-0 flex-1 p-4 flex ${inline && canvasZoom > 1 ? 'items-start justify-start' : 'items-center justify-center'} ${inline ? 'overflow-auto bg-[radial-gradient(circle_at_center,#30463a_0%,#101916_75%)]' : 'overflow-y-auto'}`}>
          <div
            ref={containerRef}
            className={`relative overflow-hidden shadow-2xl ${inline ? 'mx-auto shrink-0 rounded-sm ring-1 ring-white/20' : 'w-full rounded-lg'}`}
            style={inline
              ? { aspectRatio: aspectStyle, width: canvasWidth, height: canvasWidth / aspectNumber }
              : { aspectRatio: aspectStyle, maxHeight: '70vh' }}
            onDragOver={(event) => { if (settings.template === 'photo-first') event.preventDefault(); }}
            onDrop={(event) => {
              if (settings.template !== 'photo-first') return;
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              const pictureId = event.dataTransfer.getData('text/x-trailreplay-picture');
              if (file?.type.startsWith('image/')) onPhotoSlotFile(photoFirstSlotId, file);
              else if (pictureId) onPhotoSlotPicture(photoFirstSlotId, pictureId);
            }}
          >
            <img
              src={previewUrl}
              alt="Social share poster preview"
              className={`absolute inset-0 w-full h-full object-cover ${settings.template === 'photo-first' && hasPhotoFirstImage ? (photoDragVisual.active ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
              draggable={false}
              onPointerDown={onPhotoPointerDown}
              onPointerMove={onPhotoPointerMove}
              onPointerUp={onPhotoPointerUp}
              onPointerCancel={onPhotoPointerUp}
              onDoubleClick={() => { if (settings.template === 'photo-first') onPhotoSlotPick(photoFirstSlotId); }}
              onWheel={(event) => {
                if (settings.template !== 'photo-first' || !hasPhotoFirstImage) return;
                event.preventDefault();
                const transform = settings.photoTransform ?? { offsetX: 0, offsetY: 0, scale: 1 };
                setSocialShareSettings({ photoTransform: { ...transform, scale: Math.max(1, Math.min(3, transform.scale + (event.deltaY < 0 ? 0.03 : -0.03))) } });
              }}
            />

            {hasEmptyPhotoFrame && <button type="button" onClick={() => { onElementSelect?.('photos'); onPhotoSlotPick(photoFirstSlotId); }}
              className="absolute inset-3 z-40 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/75 bg-black/40 px-4 text-center text-sm font-semibold text-white hover:bg-black/50"
              aria-label={t('imageExport.addPhoto')}>
              <ImagePlus className="h-7 w-7" aria-hidden="true" />
              {t('imageExport.addFirstPhoto')}
            </button>}

            {photoSlotElements}

            <div
              className="absolute z-20 rounded-md border-2 border-dashed border-transparent hover:border-white/85 select-none"
              style={{
                left: `${titleBboxNorm.x * 100}%`,
                top: `${titleBboxNorm.y * 100}%`,
                width: `${titleBboxNorm.w * 100}%`,
                height: `${titleBboxNorm.h * 100}%`,
                transform: `translate(${titleDragVisual.active ? titleDragVisual.dx : 0}px, ${titleDragVisual.active ? titleDragVisual.dy : 0}px)`,
                cursor: titleDragVisual.active ? 'grabbing' : 'grab',
                touchAction: 'none',
                pointerEvents: photoEditMode ? 'none' : 'auto',
              }}
              onPointerDown={onTitlePointerDown}
              onPointerMove={onTitlePointerMove}
              onPointerUp={onTitlePointerUp}
              onPointerCancel={onTitlePointerUp}
              aria-label={t('imageExport.dragTitle')}
            >
              <div className="absolute bottom-0 right-0 flex h-5 w-5 translate-x-1/2 translate-y-1/2 cursor-nwse-resize items-center justify-center rounded-tl bg-white text-[var(--evergreen)] shadow"
                onPointerDown={onTitleResizeDown} onPointerUp={onTitleResizeUp} onPointerCancel={onTitleResizeUp}
                aria-label={t('imageExport.resizeTitle')} title={t('imageExport.resizeTitle')}>
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1 8L8 1M4 8L8 4" stroke="currentColor" strokeWidth="1.4" /></svg>
              </div>
            </div>

            {/* Drag stats to place them; resize their box to change row/column flow. */}
            {showPanelOverlay && dataPanelBboxNorm && (
              <div
                className="group absolute z-20 rounded border-2 border-dashed border-white/35 hover:border-white/85 select-none"
                style={{
                  left: `calc(${dataPanelBboxNorm.x * 100}% + ${statsResizeVisual.active && statsResizeVisual.corner.includes('left') ? statsResizeVisual.dx : 0}px)`,
                  top: `calc(${dataPanelBboxNorm.y * 100}% + ${statsResizeVisual.active && statsResizeVisual.corner.includes('top') ? statsResizeVisual.dy : 0}px)`,
                  width: `calc(${dataPanelBboxNorm.w * 100}% + ${statsResizeVisual.active ? (statsResizeVisual.corner.includes('left') ? -statsResizeVisual.dx : statsResizeVisual.dx) : 0}px)`,
                  height: `calc(${dataPanelBboxNorm.h * 100}% + ${statsResizeVisual.active ? (statsResizeVisual.corner.includes('top') ? -statsResizeVisual.dy : statsResizeVisual.dy) : 0}px)`,
                  transform: `translate(${panelDragVisual.active ? panelDragVisual.dx : 0}px, ${panelDragVisual.active ? panelDragVisual.dy : 0}px)`,
                  cursor: panelDragVisual.active ? 'grabbing' : 'grab',
                  touchAction: 'none',
                  pointerEvents: photoEditMode ? 'none' : 'auto',
                }}
                onPointerDown={onPanelPointerDown}
                onPointerMove={onPanelPointerMove}
                onPointerUp={onPanelPointerUp}
                onPointerCancel={onPanelPointerUp}
                aria-label={t('imageExport.dragResizeStatsHint')}
              >
                {hasVisibleCoverStats && (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((corner) => (
                  <div key={corner}
                    className={`absolute z-30 flex h-5 w-5 items-center justify-center rounded bg-white text-[var(--evergreen)] shadow cursor-nwse-resize ${corner.includes('top') ? 'top-0' : 'bottom-0'} ${corner.includes('left') ? 'left-0' : 'right-0'}`}
                    style={{ cursor: corner === 'top-right' || corner === 'bottom-left' ? 'nesw-resize' : 'nwse-resize' }}
                    data-corner={corner}
                    onPointerDown={onStatsResizeDown}
                    onPointerMove={onStatsResizeMove}
                    onPointerUp={onStatsResizeUp}
                    onPointerCancel={onStatsResizeUp}
                    aria-label={t('imageExport.resizeStats')} title={t('imageExport.resizeStats')}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 9L9 1M5 9L9 5" stroke="currentColor" strokeWidth="1.5" /></svg>
                  </div>
                ))}
              </div>
            )}

            {statsResizeVisual.active && resizeGuideTargets.length > 0 && (
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[19]">
                {resizeGuideTargets.map((target) => {
                  const active = target.columns === resizePreviewColumns;
                  return <div key={target.columns}
                    className={`absolute flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed shadow-lg ${active
                      ? 'border-[var(--trail-orange)] bg-[#11251b]/75 text-white ring-2 ring-[var(--trail-orange)]/45'
                      : 'border-white/55 bg-[#11251b]/35 text-white/85'}`}
                    style={{ left: target.left, top: target.top, width: target.width, height: target.height, zIndex: active ? 2 : 1 }}>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${active ? 'bg-[var(--trail-orange)]' : 'bg-black/55'}`}>
                      {target.columns} × {target.rows}
                    </span>
                    <div className="grid max-w-[70%] gap-0.5" style={{ gridTemplateColumns: `repeat(${target.columns}, minmax(0, 1fr))` }}>
                      {Array.from({ length: visibleCoverStatCount }, (_, index) => <span key={index}
                        className={`h-2 w-3 rounded-sm border ${active ? 'border-white bg-white/65' : 'border-white/70 bg-white/35'}`} />)}
                    </div>
                  </div>;
                })}
              </div>
            )}

            {/* Route overlay — rendered last (higher z-order) */}
            {showRouteOverlay && routeBboxNorm && displayedMapFrame && (
              <div
                className="absolute z-10 border-2 border-dashed border-transparent hover:border-[var(--trail-orange)] rounded select-none"
                style={{
                  left: `${displayedMapFrame.x * 100}%`,
                  top: `${displayedMapFrame.y * 100}%`,
                  width: `${displayedMapFrame.w * 100}%`,
                  height: `${displayedMapFrame.h * 100}%`,
                  transform: settings.template === 'split'
                    ? undefined
                    : `translate(${routeDragVisual.active ? routeDragVisual.dx : 0}px, ${routeDragVisual.active ? routeDragVisual.dy : 0}px) scale(${routeDragVisual.active ? routeDragVisual.sf : 1})`,
                  transformOrigin: '50% 50%',
                  cursor: routeDragVisual.active ? 'grabbing' : 'grab',
                  touchAction: 'none',
                  pointerEvents: photoEditMode ? 'none' : 'auto',
                }}
                onPointerDown={(e) => onRoutePointerDown(e, 'move')}
                onPointerMove={onRoutePointerMove}
                onPointerUp={onRoutePointerUp}
                onPointerCancel={onRoutePointerUp}
                onWheel={(event) => {
                  if (settings.template !== 'split') return;
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  void onMapRouteGesture({
                    type: 'resize',
                    scaleFactor: event.deltaY < 0 ? 1.05 : 1 / 1.05,
                    anchorX: (event.clientX - rect.left) / rect.width,
                    anchorY: (event.clientY - rect.top) / rect.height,
                  });
                }}
                aria-label={settings.template === 'split' ? t('imageExport.dragSplitMapHint') : t('imageExport.dragMapHint')}
              >
                {settings.template === 'split' && <button type="button"
                  className="absolute left-1/2 top-1 z-20 flex h-6 w-6 -translate-x-1/2 cursor-move items-center justify-center rounded-md bg-white text-[var(--evergreen)] shadow"
                  onPointerDown={(event) => onRoutePointerDown(event, 'frame-move')}
                  onPointerMove={onRoutePointerMove}
                  onPointerUp={onRoutePointerUp}
                  onPointerCancel={onRoutePointerUp}
                  aria-label={t('imageExport.moveMapFrame')} title={t('imageExport.moveMapFrame')}>
                  <Move className="h-3.5 w-3.5" />
                </button>}
                {settings.template === 'split'
                  ? routeResizeHandles
                  : <div
                    className="absolute bottom-0 right-0 flex h-5 w-5 translate-x-1/2 translate-y-1/2 cursor-nwse-resize items-center justify-center rounded-tl-md bg-[var(--trail-orange)]"
                    onPointerDown={(event) => onRoutePointerDown(event, 'resize')}
                    onPointerMove={onRoutePointerMove}
                    onPointerUp={onRoutePointerUp}
                    onPointerCancel={onRoutePointerUp}
                    aria-label={t('imageExport.zoomIn')}>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 7L7 1M4 7L7 4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </div>}
              </div>
            )}

            <div
              className="absolute z-30 rounded-sm border border-transparent hover:border-white/90 hover:ring-2 hover:ring-black/40 select-none"
              style={{
                left: `${logoBboxNorm.x * 100}%`,
                top: `${logoBboxNorm.y * 100}%`,
                width: `${logoBboxNorm.w * 100}%`,
                height: `${logoBboxNorm.h * 100}%`,
                transform: `translate(${logoDragVisual.active ? logoDragVisual.dx : 0}px, ${logoDragVisual.active ? logoDragVisual.dy : 0}px)`,
                cursor: logoDragVisual.active ? 'grabbing' : 'grab',
                touchAction: 'none',
                pointerEvents: photoEditMode ? 'none' : 'auto',
              }}
              onPointerDown={onLogoPointerDown}
              onPointerMove={onLogoPointerMove}
              onPointerUp={onLogoPointerUp}
              onPointerCancel={onLogoPointerUp}
              aria-label={t('imageExport.dragLogo')}
              title={t('imageExport.dragLogo')}
            />

            {isRendering && !inline && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
          </div>
        </div>

        <div className={`px-4 py-3 flex flex-wrap gap-2 shrink-0 ${inline ? 'border-t border-white/10 text-white' : 'border-t border-black/10'}`}>
          {inline && <p className="mr-auto hidden min-w-0 self-center text-xs leading-4 text-white/60 sm:block">
            {t(settings.template === 'map-first' ? 'imageExport.dragMapHint' : settings.template === 'split' ? 'imageExport.dragSplitMapHint' : photoEditMode ? 'imageExport.dragPhotoOnlyHint' : 'imageExport.dragPhotoHint')}
          </p>}
          {!inline && <button onClick={onClose} className="tr-btn tr-btn-secondary flex-1">
            {t('imageExport.back')}
          </button>}
          {coverMode && onDownload && <button
            onClick={onDownload}
            disabled={isRendering || hasEmptySplitFrame || hasEmptyPhotoFrame}
            title={hasEmptySplitFrame || hasEmptyPhotoFrame ? t('imageExport.addPhoto') : undefined}
            className={`tr-btn tr-btn-secondary flex items-center justify-center gap-2 disabled:opacity-60 ${inline ? 'ml-auto' : 'flex-1'}`}
          >
            <Download className="w-4 h-4" />
            {t('imageExport.savePng')}
          </button>}
          <button
            onClick={onExport}
            disabled={isRendering || hasEmptySplitFrame || hasEmptyPhotoFrame}
            title={hasEmptySplitFrame || hasEmptyPhotoFrame ? t('imageExport.addPhoto') : undefined}
            className={`tr-btn tr-btn-primary flex items-center justify-center gap-2 disabled:opacity-60 ${inline ? (coverMode ? 'sm:min-w-36' : 'ml-auto sm:min-w-36') : 'flex-1'}`}
          >
            {isRendering ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : coverMode ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            {t(coverMode ? 'imageExport.backToVideoExport' : 'imageExport.downloadPng')}
          </button>
        </div>
      </div>
    </div>
  );
}
