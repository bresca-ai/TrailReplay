import { useRef, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import type { SocialShareSettings } from '@/types';
import type { RouteBboxNorm } from './useSocialShareExport';
import { useI18n } from '@/i18n/useI18n';

interface Props {
  previewUrl: string;
  isRendering: boolean;
  onClose: () => void;
  onExport: () => void;
  settings: SocialShareSettings;
  setSocialShareSettings: (patch: Partial<SocialShareSettings>) => void;
  routeBboxNorm: RouteBboxNorm | null;
  dataPanelBboxNorm: RouteBboxNorm | null;
}

interface RouteDragState {
  type: 'move' | 'resize';
  startX: number;
  startY: number;
  startScale: number;
  startOffsetX: number;
  startOffsetY: number;
  containerW: number;
  containerH: number;
}

interface PanelDragState {
  startY: number;
  startOffsetY: number;
  containerH: number;
}

export function SocialSharePreviewModal({
  previewUrl, isRendering, onClose, onExport,
  settings, setSocialShareSettings, routeBboxNorm, dataPanelBboxNorm,
}: Props) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);

  // Route overlay drag state
  const routeDragRef = useRef<RouteDragState | null>(null);
  const [routeDragVisual, setRouteDragVisual] = useState({ dx: 0, dy: 0, sf: 1, active: false });

  // Panel overlay drag state
  const panelDragRef = useRef<PanelDragState | null>(null);
  const [panelDragVisual, setPanelDragVisual] = useState({ dy: 0, active: false });

  const aspectStyle = settings.aspectRatio === '4:5' ? '4 / 5'
    : settings.aspectRatio === '9:16' ? '9 / 16' : '1 / 1';

  const showRouteOverlay = !!routeBboxNorm;
  const showPanelOverlay = !!dataPanelBboxNorm;
  const hasAnyOverlay = showRouteOverlay || showPanelOverlay;

  // ── Route drag handlers (pointer capture on the bbox div) ─────────────────
  const onRoutePointerDown = (e: React.PointerEvent, type: 'move' | 'resize') => {
    e.stopPropagation();
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = container.getBoundingClientRect();
    routeDragRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      startScale: settings.routeTransform.scale,
      startOffsetX: settings.routeTransform.offsetX,
      startOffsetY: settings.routeTransform.offsetY,
      containerW: rect.width,
      containerH: rect.height,
    };
    setRouteDragVisual({ dx: 0, dy: 0, sf: 1, active: true });
  };

  const onRoutePointerMove = (e: React.PointerEvent) => {
    const ds = routeDragRef.current;
    if (!ds) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    if (ds.type === 'move') {
      setRouteDragVisual({ dx, dy, sf: 1, active: true });
    } else {
      const diag = (dx + dy) * 0.5;
      const sf = Math.max(0.2, 1 + diag / (ds.containerW * 0.3));
      setRouteDragVisual({ dx: 0, dy: 0, sf, active: true });
    }
  };

  const onRoutePointerUp = () => {
    const ds = routeDragRef.current;
    if (!ds) return;
    setRouteDragVisual((prev) => {
      if (ds.type === 'move') {
        setSocialShareSettings({
          routeTransform: {
            ...settings.routeTransform,
            offsetX: ds.startOffsetX + prev.dx / ds.containerW,
            offsetY: ds.startOffsetY + prev.dy / ds.containerH,
          },
        });
      } else {
        setSocialShareSettings({
          routeTransform: {
            ...settings.routeTransform,
            scale: Math.max(0.3, Math.min(4, ds.startScale * prev.sf)),
          },
        });
      }
      routeDragRef.current = null;
      return { dx: 0, dy: 0, sf: 1, active: false };
    });
  };

  // ── Panel drag handlers (pointer capture on the panel div) ────────────────
  const onPanelPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = container.getBoundingClientRect();
    panelDragRef.current = {
      startY: e.clientY,
      startOffsetY: settings.dataPanelOffsetY,
      containerH: rect.height,
    };
    setPanelDragVisual({ dy: 0, active: true });
  };

  const onPanelPointerMove = (e: React.PointerEvent) => {
    const ds = panelDragRef.current;
    if (!ds) return;
    setPanelDragVisual({ dy: e.clientY - ds.startY, active: true });
  };

  const onPanelPointerUp = () => {
    const ds = panelDragRef.current;
    if (!ds) return;
    setPanelDragVisual((prev) => {
      const newOffsetY = Math.max(0, Math.min(0.85, ds.startOffsetY - prev.dy / ds.containerH));
      setSocialShareSettings({ dataPanelOffsetY: newOffsetY });
      panelDragRef.current = null;
      return { dy: 0, active: false };
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--canvas)] rounded-xl shadow-2xl max-h-[94vh] w-full max-w-md flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 shrink-0">
          <h2 className="font-bold text-sm uppercase tracking-wide text-[var(--evergreen)]">
            {t('imageExport.posterPreview')}
            {hasAnyOverlay && (
              <span className="ml-2 text-xs font-normal opacity-50 normal-case tracking-normal">
                {t('imageExport.dragHint')}
              </span>
            )}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 flex justify-center items-start">
          <div
            ref={containerRef}
            className="relative rounded-lg overflow-hidden shadow-lg w-full"
            style={{ aspectRatio: aspectStyle, maxHeight: '70vh' }}
          >
            <img
              src={previewUrl}
              alt="Social share poster preview"
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
            />

            {/* Panel overlay — rendered first (lower z-order) */}
            {showPanelOverlay && dataPanelBboxNorm && (
              <div
                className="absolute border-2 border-dashed border-white/70 rounded select-none"
                style={{
                  left: `${dataPanelBboxNorm.x * 100}%`,
                  top: `${dataPanelBboxNorm.y * 100}%`,
                  width: `${dataPanelBboxNorm.w * 100}%`,
                  height: `${dataPanelBboxNorm.h * 100}%`,
                  transform: `translateY(${panelDragVisual.active ? panelDragVisual.dy : 0}px)`,
                  cursor: panelDragVisual.active ? 'grabbing' : 'grab',
                  touchAction: 'none',
                }}
                onPointerDown={onPanelPointerDown}
                onPointerMove={onPanelPointerMove}
                onPointerUp={onPanelPointerUp}
                onPointerCancel={onPanelPointerUp}
              />
            )}

            {/* Route overlay — rendered last (higher z-order) */}
            {showRouteOverlay && routeBboxNorm && (
              <div
                className="absolute border-2 border-dashed border-[var(--trail-orange)] rounded select-none"
                style={{
                  left: `${routeBboxNorm.x * 100}%`,
                  top: `${routeBboxNorm.y * 100}%`,
                  width: `${routeBboxNorm.w * 100}%`,
                  height: `${routeBboxNorm.h * 100}%`,
                  transform: `translate(${routeDragVisual.active ? routeDragVisual.dx : 0}px, ${routeDragVisual.active ? routeDragVisual.dy : 0}px) scale(${routeDragVisual.active ? routeDragVisual.sf : 1})`,
                  transformOrigin: '50% 50%',
                  cursor: routeDragVisual.active ? 'grabbing' : 'grab',
                  touchAction: 'none',
                }}
                onPointerDown={(e) => onRoutePointerDown(e, 'move')}
                onPointerMove={onRoutePointerMove}
                onPointerUp={onRoutePointerUp}
                onPointerCancel={onRoutePointerUp}
              >
                {/* Resize handle — bottom-right corner */}
                <div
                  className="absolute bottom-0 right-0 w-5 h-5 bg-[var(--trail-orange)] rounded-tl-md flex items-center justify-center cursor-nwse-resize"
                  style={{ transform: 'translate(50%, 50%)' }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onRoutePointerDown(e, 'resize');
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1 7L7 1M4 7L7 4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
            )}

            {isRendering && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-black/10 flex gap-2 shrink-0">
          <button onClick={onClose} className="tr-btn tr-btn-secondary flex-1">
            {t('imageExport.back')}
          </button>
          <button
            onClick={onExport}
            disabled={isRendering}
            className="tr-btn tr-btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isRendering ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {t('imageExport.downloadPng')}
          </button>
        </div>
      </div>
    </div>
  );
}
