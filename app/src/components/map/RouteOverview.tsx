import { useEffect, useMemo, useRef } from 'react';
import type { CropPreviewMetrics } from '@/utils/crop';
import { useComputedJourney } from '@/hooks/useComputedJourney';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { buildRouteOverviewGeometry } from './routeOverviewGeometry';

interface Props { containerSize: { width: number; height: number }; frame: CropPreviewMetrics | null }
const WIDTH = 200, HEIGHT = 144;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function RouteOverview({ containerSize, frame }: Props) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const settings = useAppStore(state => state.settings);
  const setSettings = useAppStore(state => state.setSettings);
  const isExporting = useAppStore(state => state.isExporting);
  const phase = useAppStore(state => state.animationPhase);
  const { allCoordinates, currentPosition, currentTrackColor } = useComputedJourney();
  const geometry = useMemo(() => buildRouteOverviewGeometry(allCoordinates, WIDTH, HEIGHT), [allCoordinates]);
  const color = currentTrackColor || settings.trailStyle.trailColor;
  const frameWidth = frame?.frameWidth ?? containerSize.width;
  const frameHeight = frame?.frameHeight ?? containerSize.height;
  const width = Math.min(WIDTH, Math.max(70, frameWidth * 0.38), Math.max(70, frameHeight * 0.32));
  const height = width * HEIGHT / WIDTH;
  const position = settings.routeOverviewPosition ?? { x: 0.86, y: 0.15 };
  const x = clamp(position.x), y = clamp(position.y);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !geometry || !settings.showRouteOverview) return;
    const ctx = element.getContext('2d');
    if (!ctx) return;
    const resolution = 2;
    element.width = WIDTH * resolution; element.height = HEIGHT * resolution;
    ctx.scale(resolution, resolution);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
    geometry.path.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = color; ctx.globalAlpha = .88; ctx.lineWidth = 2.6; ctx.stroke(); ctx.globalAlpha = 1;
    const marker = currentPosition ? geometry.project(currentPosition.lon, currentPosition.lat) : geometry.path[0];
    ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(marker.x, marker.y, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
  }, [geometry, currentPosition, color, settings.showRouteOverview, phase]);

  if (!settings.showRouteOverview || !geometry || (phase !== 'idle' && phase !== 'playing')) return null;
  return <canvas ref={canvas} className="tr-route-overview absolute z-20" role="img" aria-label={t('annotations.routeOverview')} tabIndex={isExporting ? -1 : 0}
    style={{ left: (frame?.frameLeft ?? 0) + x * Math.max(0, frameWidth - width), top: (frame?.frameTop ?? 0) + y * Math.max(0, frameHeight - height), width, height, cursor: isExporting ? 'default' : 'grab', touchAction: 'none' }}
    onPointerDown={event => { if (isExporting) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, startX: x, startY: y }; }}
    onPointerMove={event => { if (!drag.current) return; setSettings({ routeOverviewPosition: { x: clamp(drag.current.startX + (event.clientX - drag.current.x) / Math.max(1, frameWidth - width)), y: clamp(drag.current.startY + (event.clientY - drag.current.y) / Math.max(1, frameHeight - height)) } }); }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
    onKeyDown={event => {
      if (isExporting || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      setSettings({ routeOverviewPosition: { x: clamp(x + (event.key === 'ArrowRight' ? 0.02 : event.key === 'ArrowLeft' ? -0.02 : 0)), y: clamp(y + (event.key === 'ArrowDown' ? 0.02 : event.key === 'ArrowUp' ? -0.02 : 0)) } });
    }} />;
}
