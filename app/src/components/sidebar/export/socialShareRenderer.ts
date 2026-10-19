import type { SocialShareAspectRatio, SocialSharePhotoSlot, SocialShareSettings } from '@/types';
import { getCropRegion } from '@/utils/crop';
import { getActivityIconOption } from '@/utils/activityIcons';
import { annotationSymbolPath, drawAnnotationSymbol } from '@/components/annotations/annotationSymbol';
import { formatPace, metersToFeet } from '@/utils/units';
import type { SocialShareSummaryData } from './socialShareData';
import type { CanvasPoint, FitBox } from './socialShareRouteFit';
import { downsampleRoute, fitRouteToBox } from './socialShareRouteFit';
import { getSocialShareLogoBox } from './socialShareBrand';
import { getSplitMapBox } from './socialShareSplit';

const DARK_BG = 'rgba(10,10,10,0.97)';
const POSTER_W = 1080;

function visibleStatCount(settings: SocialShareSettings) {
  return settings.stats?.filter((stat) => stat.visible).length ?? 3;
}

function statsRowCount(settings: SocialShareSettings) {
  return Math.ceil(visibleStatCount(settings) / Math.max(1, settings.statsLayout ?? 3));
}

function hasVisibleStats(settings: SocialShareSettings) {
  return settings.showStats && visibleStatCount(settings) > 0;
}

export function getPosterSize(ratio: SocialShareAspectRatio): { w: number; h: number } {
  if (ratio === '16:9') return { w: POSTER_W, h: 608 };
  if (ratio === '4:5') return { w: POSTER_W, h: 1350 };
  if (ratio === '1:1') return { w: POSTER_W, h: POSTER_W };
  return { w: POSTER_W, h: 1920 };
}

export interface RenderInput {
  settings: SocialShareSettings;
  summary: SocialShareSummaryData;
  mapCanvas: HTMLCanvasElement | null;
  /** Route points already projected to poster canvas coordinates (map-first). */
  projectedRouteForMap: CanvasPoint[] | null;
  /** Raw lat/lon points for client-side fitting (photo-first). */
  routeLatLons: Array<{ lat: number; lon: number }> | null;
  selectedPhoto: HTMLImageElement | null;
  slotImages: Record<string, HTMLImageElement>;
  statIconImages: Record<string, HTMLImageElement>;
  fontFamily: string;
  brandLogo: HTMLImageElement;
  /** Primary route color from track settings (hex). */
  routeColor: string;
  /** Translated stat labels for the stats bar. */
  labels: Record<string, string>;
}

export function renderSocialPoster(input: RenderInput): string {
  const { w, h } = getPosterSize(input.settings.aspectRatio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  if (input.settings.template === 'split') {
    drawSplit(ctx, w, h, input);
  } else if (input.settings.template === 'map-first') {
    drawMapFirst(ctx, w, h, input);
  } else {
    drawPhotoFirst(ctx, w, h, input);
  }
  return canvas.toDataURL('image/png');
}

export function exportSocialPosterBlob(input: RenderInput): Promise<Blob> {
  const { w, h } = getPosterSize(input.settings.aspectRatio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  if (input.settings.template === 'split') {
    drawSplit(ctx, w, h, input);
  } else if (input.settings.template === 'map-first') {
    drawMapFirst(ctx, w, h, input);
  } else {
    drawPhotoFirst(ctx, w, h, input);
  }
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
}

// --- Drawing helpers ---

function tracePath(ctx: CanvasRenderingContext2D, points: CanvasPoint[]) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
}

function drawRoutePlain(
  ctx: CanvasRenderingContext2D,
  points: CanvasPoint[],
  lineWidth: number,
  opacity: number,
  color: string,
) {
  if (points.length < 2) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(6, lineWidth * 0.6);
  tracePath(ctx, points);
  ctx.stroke();
  ctx.restore();
}

function drawRouteGlow(
  ctx: CanvasRenderingContext2D,
  points: CanvasPoint[],
  lineWidth: number,
  opacity: number,
  color: string,
) {
  if (points.length < 2) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Drop shadow — gives elevation / 3-D depth
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur = lineWidth * 2.5;
  ctx.shadowOffsetX = lineWidth * 0.35;
  ctx.shadowOffsetY = lineWidth * 0.45;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = lineWidth * 2.8;
  tracePath(ctx, points); ctx.stroke();
  ctx.restore();

  // Wide outer glow
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = lineWidth * 9;
  ctx.strokeStyle = `${color}55`;
  ctx.lineWidth = lineWidth * 2.2;
  tracePath(ctx, points); ctx.stroke();
  ctx.restore();

  // Main route body
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = lineWidth * 3.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  tracePath(ctx, points); ctx.stroke();
  ctx.restore();

  // Bright specular core — simulates 3-D tube highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.70)';
  ctx.lineWidth = lineWidth * 0.32;
  tracePath(ctx, points); ctx.stroke();

  ctx.restore();
}

function drawElevationChart(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  { profile, minElev, maxElev, unitSystem }: SocialShareSummaryData['elevation'] & { unitSystem: SocialShareSummaryData['unitSystem'] },
  color: string,
  fontFamily: string,
  labelColor: string,
) {
  if (profile.length < 2) return;

  const isMetric = unitSystem === 'metric';
  const chartH = h * 0.82;
  const chartY = y + h * 0.18;
  const labelSize = Math.round(w * 0.027);

  // Grid lines + y-axis labels
  ctx.font = `400 ${labelSize}px ${fontFamily}`;
  for (let i = 0; i < 3; i++) {
    const t = i / 2;
    const elev = minElev + t * (maxElev - minElev);
    const ly = chartY + chartH - t * chartH * 0.88;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, ly, w, 1);
    ctx.fillStyle = labelColor;
    ctx.globalAlpha = 0.65;
    ctx.textAlign = 'left';
    const label = isMetric ? `${Math.round(elev)} m` : `${Math.round(elev * 3.28084)} ft`;
    ctx.fillText(label, x + 4, ly - 4);
    ctx.globalAlpha = 1;
  }

  // Area fill
  const grad = ctx.createLinearGradient(0, chartY, 0, chartY + chartH);
  grad.addColorStop(0, `${color}55`);
  grad.addColorStop(1, `${color}0A`);
  ctx.beginPath();
  ctx.moveTo(x + profile[0].x * w, chartY + chartH - profile[0].y * chartH * 0.88);
  for (const pt of profile.slice(1)) {
    ctx.lineTo(x + pt.x * w, chartY + chartH - pt.y * chartH * 0.88);
  }
  ctx.lineTo(x + w, chartY + chartH);
  ctx.lineTo(x, chartY + chartH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(x + profile[0].x * w, chartY + chartH - profile[0].y * chartH * 0.88);
  for (const pt of profile.slice(1)) {
    ctx.lineTo(x + pt.x * w, chartY + chartH - pt.y * chartH * 0.88);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

function drawStatsBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  summary: SocialShareSummaryData,
  settings: SocialShareSettings,
  labels: RenderInput['labels'],
  fontFamily: string,
  iconImages: RenderInput['statIconImages'],
) {
  const { distanceMeters, durationSeconds, movingDurationSeconds, elevationGainMeters, elevationLossMeters, maxElevationMeters, averageSpeedMetersPerSecond, maxSpeedMetersPerSecond, averageHeartRate, unitSystem } = summary;
  const isMetric = unitSystem === 'metric';
  const statsColor = settings.statsColor ?? '#FFFFFF';
  const stats = settings.stats ?? [
    { id: 'distance', metric: 'distance' as const, label: '', value: '', visible: true },
    { id: 'elevation', metric: 'elevationGain' as const, label: '', value: '', visible: true },
    { id: 'time', metric: 'duration' as const, label: '', value: '', visible: true },
  ];
  const visibleStats = stats.filter((stat) => stat.visible).slice(0, 4);
  if (visibleStats.length === 0) return;
  const columns = Math.min(visibleStats.length, Math.max(1, settings.statsLayout ?? 3));
  const rows = Math.ceil(visibleStats.length / columns);
  const colW = w / columns;
  const rowH = h / rows;
  const scale = Math.max(0.7, Math.min(1.4, settings.statsScale ?? 1));
  const splitWide = settings.template === 'split' && w > h;
  const labelSize = Math.round(rowH * (splitWide ? 0.29 : 0.19) * scale);
  const numSize = Math.round(rowH * (splitWide ? 0.52 : settings.layoutPreset === 'ridge-photo' || settings.layoutPreset === 'photo-grid' ? 0.42 : 0.50) * scale);
  const unitSize = Math.round(rowH * 0.27 * scale);

  const distNum = isMetric
    ? (distanceMeters / 1000).toFixed(distanceMeters >= 10000 ? 1 : 2)
    : (distanceMeters / 1609.344).toFixed(2);

  const elevNum = isMetric
    ? Math.round(elevationGainMeters).toString()
    : Math.round(metersToFeet(elevationGainMeters)).toString();

  const totalMins = Math.floor(durationSeconds / 60);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const movingMins = Math.floor(movingDurationSeconds / 60);
  const movingHrs = Math.floor(movingMins / 60);
  const movingMinsRemainder = movingMins % 60;

  const formatSpeed = (mps: number) => `${(mps * (isMetric ? 3.6 : 2.23694)).toFixed(1)} ${isMetric ? 'km/h' : 'mph'}`;
  const formatElevation = (meters: number) => `${Math.round(isMetric ? meters : metersToFeet(meters))} ${isMetric ? 'm' : 'ft'}`;
  const values: Record<string, { num: string; unit: string }> = {
    distance: { num: distNum, unit: isMetric ? 'km' : 'mi' },
    elevationGain: { num: elevNum, unit: isMetric ? 'm' : 'ft' },
    duration: { num: hrs > 0 ? `${hrs}h` : `${mins}m`, unit: hrs > 0 ? `${mins}m` : '' },
    movingDuration: { num: movingHrs > 0 ? `${movingHrs}h` : `${movingMins}m`, unit: movingHrs > 0 ? `${movingMinsRemainder}m` : '' },
    pace: { num: formatPace(averageSpeedMetersPerSecond, unitSystem), unit: '' },
    heartRate: { num: averageHeartRate === null ? '—' : `${Math.round(averageHeartRate)} bpm`, unit: '' },
    speed: { num: formatSpeed(averageSpeedMetersPerSecond), unit: '' },
    altitude: { num: formatElevation(maxElevationMeters), unit: '' },
    maxElevation: { num: formatElevation(maxElevationMeters), unit: '' },
    elevationLoss: { num: formatElevation(elevationLossMeters), unit: '' },
    maxSpeed: { num: formatSpeed(maxSpeedMetersPerSecond), unit: '' },
  };

  visibleStats.forEach((stat, i) => {
    const { num, unit } = stat.value.trim()
      ? { num: stat.value.trim(), unit: '' }
      : stat.metric === 'custom'
        ? { num: '', unit: '' }
        : values[stat.metric] ?? { num: '', unit: '' };
    const label = stat.label || labels[stat.metric] || '';
    const row = Math.floor(i / columns);
    const col = i % columns;
    const cellsInRow = Math.min(columns, visibleStats.length - row * columns);
    const rowOffset = ((columns - cellsInRow) * colW) / 2;
    const cellX = x + rowOffset + colW * col;
    const cellY = y + rowH * row;
    const cx = cellX + colW / 2;

    if (settings.showStatsBackground !== false && settings.statsStyle === 'cards') {
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(cellX + 5, cellY + 3, colW - 10, rowH - 6);
    } else if (settings.showStatsBackground !== false && settings.statsStyle === 'accent') {
      ctx.fillStyle = `${statsColor}28`;
      ctx.fillRect(cellX + 5, cellY + 3, colW - 10, rowH - 6);
    }

    if (col > 0) {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = statsColor;
      ctx.fillRect(cellX, cellY + rowH * 0.15, 1, rowH * 0.7);
      ctx.globalAlpha = 1;
    }
    if (row > 0 && col === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + w * 0.1, cellY, w * 0.8, 1);
    }

    const icon = stat.icon ? getActivityIconOption(stat.icon) : undefined;
    const mapIconPath = annotationSymbolPath(stat.icon);
    const iconSize = Math.min(rowH * 0.36, colW * 0.16);
    const iconX = cellX + colW * 0.12;
    const iconY = cellY + rowH * 0.48;
    if (mapIconPath) {
      drawAnnotationSymbol(ctx, stat.icon, iconX + iconSize / 2, iconY + iconSize / 2, iconSize, statsColor);
    } else if (icon?.kind === 'svg' && iconImages[stat.icon!]) {
      const stencil = document.createElement('canvas');
      stencil.width = Math.ceil(iconSize);
      stencil.height = Math.ceil(iconSize);
      const stencilCtx = stencil.getContext('2d');
      if (stencilCtx) {
        stencilCtx.drawImage(iconImages[stat.icon!], 0, 0, stencil.width, stencil.height);
        stencilCtx.globalCompositeOperation = 'source-in';
        stencilCtx.fillStyle = statsColor;
        stencilCtx.fillRect(0, 0, stencil.width, stencil.height);
        ctx.drawImage(stencil, iconX, iconY, iconSize, iconSize);
      }
    } else if (icon) {
      ctx.font = `${Math.round(iconSize)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(icon.content, iconX, iconY + iconSize);
    }

    ctx.font = `400 ${labelSize}px ${fontFamily}`;
    ctx.fillStyle = `${statsColor}B0`;
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cellY + rowH * 0.30);

    ctx.font = `700 ${numSize}px ${fontFamily}`;
    const numW = ctx.measureText(num).width;
    ctx.font = `400 ${unitSize}px ${fontFamily}`;
    const unitW = unit ? ctx.measureText(` ${unit}`).width : 0;
    const startX = cx - (numW + unitW) / 2 + (stat.icon ? iconSize * 0.25 : 0);

    ctx.font = `700 ${numSize}px ${fontFamily}`;
    ctx.fillStyle = statsColor;
    ctx.textAlign = 'left';
    ctx.fillText(num, startX, cellY + rowH * 0.82);

    if (unit) {
      ctx.font = `400 ${unitSize}px ${fontFamily}`;
      ctx.fillStyle = `${statsColor}B8`;
      ctx.fillText(` ${unit}`, startX + numW, cellY + rowH * 0.82);
    }
  });
}

function drawBrandMark(ctx: CanvasRenderingContext2D, w: number, h: number, input: RenderInput) {
  const box = getSocialShareLogoBox(input.settings, w, h);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = Math.round(w * 0.018);
  ctx.shadowOffsetY = Math.round(w * 0.005);
  ctx.drawImage(input.brandLogo, box.x, box.y, box.w, box.h);
  ctx.restore();
}

function drawTitle(
  ctx: CanvasRenderingContext2D,
  title: string,
  x: number, y: number, maxW: number, fontSize: number, fontFamily: string, color: string, shadow = true,
): number {
  ctx.font = `800 ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.shadowColor = shadow ? 'rgba(0,0,0,0.8)' : 'transparent';
  ctx.shadowBlur = shadow ? Math.round(fontSize * 0.25) : 0;
  const lines: string[] = [];
  for (const paragraph of title.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width > maxW && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
      if (lines.length >= 5) break;
    }
    if (current && lines.length < 5) lines.push(current);
    if (lines.length >= 5) break;
  }
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * fontSize * 1.04, maxW));
  ctx.shadowBlur = 0;
  return lines.length;
}

function drawLocation(ctx: CanvasRenderingContext2D, location: string, x: number, y: number, size: number, fontFamily: string, color: string) {
  if (!location) return;
  ctx.font = `400 ${size}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.72;
  ctx.textAlign = 'left';
  ctx.fillText(`📍 ${location}`, x, y);
  ctx.globalAlpha = 1;
}

function drawPhotoBackground(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  transform: SocialShareSettings['photoTransform'] | undefined,
) {
  const fitScale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const zoom = Math.max(1, Math.min(3, transform?.scale ?? 1));
  const drawW = img.naturalWidth * fitScale * zoom;
  const drawH = img.naturalHeight * fitScale * zoom;
  const maxX = Math.max(0, (drawW - w) / 2);
  const maxY = Math.max(0, (drawH - h) / 2);
  const dx = (w - drawW) / 2 + Math.max(-maxX, Math.min(maxX, (transform?.offsetX ?? 0) * w));
  const dy = (h - drawH) / 2 + Math.max(-maxY, Math.min(maxY, (transform?.offsetY ?? 0) * h));
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();
}


// --- Template renderers ---

function drawMapFirst(ctx: CanvasRenderingContext2D, w: number, h: number, input: RenderInput) {
  const { mapCanvas, summary, settings, projectedRouteForMap } = input;
  const showStats = hasVisibleStats(settings);
  const pad = Math.round(w * 0.04);

  // Fallback background (only visible if map capture failed)
  ctx.fillStyle = '#1a2030';
  ctx.fillRect(0, 0, w, h);

  // Map: full-bleed — covers the entire poster exactly as the user sees it
  if (mapCanvas) {
    const container = document.getElementById('map-capture-container');
    if (container) {
      const rect = container.getBoundingClientRect();
      const { cropX, cropY, cropW, cropH } = getCropRegion(rect, w, h);
      const px = mapCanvas.width / rect.width;
      const py = mapCanvas.height / rect.height;
      ctx.drawImage(mapCanvas, cropX * px, cropY * py, cropW * px, cropH * py, 0, 0, w, h);
    }
  }

  if (settings.layoutPreset === 'long-way') {
    ctx.save();
    ctx.fillStyle = 'rgba(8, 35, 22, 0.18)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Subtle top scrim — only enough to make the logo + title readable
  const topGrad = ctx.createLinearGradient(0, 0, 0, h * 0.22);
  topGrad.addColorStop(0, 'rgba(0,0,0,0.62)');
  topGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, w, h * 0.22);

  if (settings.layoutPreset === 'long-way') {
    const titleScrim = ctx.createLinearGradient(0, 0, w * 0.88, 0);
    titleScrim.addColorStop(0, 'rgba(3,18,13,0.58)');
    titleScrim.addColorStop(1, 'rgba(3,18,13,0)');
    ctx.fillStyle = titleScrim;
    ctx.fillRect(0, h * 0.12, w, h * 0.72);
  }

  // Route glow (3-D layered) — full poster, no clipping
  if (projectedRouteForMap && projectedRouteForMap.length > 1) {
    if (settings.routeGlow) {
      drawRouteGlow(ctx, projectedRouteForMap, Math.round(w * 0.014), settings.routeTransform.opacity, input.routeColor);
    } else if (!mapCanvas || settings.layoutPreset === 'long-way') {
      drawRoutePlain(ctx, projectedRouteForMap, Math.round(w * 0.014), settings.routeTransform.opacity, settings.layoutPreset === 'long-way' ? '#FF7A1A' : input.routeColor);
    }
  }

  drawBrandMark(ctx, w, h, input);

  // Title + location below logo
  const titleSize = Math.round(Math.min(w * 0.09, Math.max(h * 0.05, w * 0.055)) * (settings.titleScale ?? 1));
  const titleX = pad + settings.titleOffsetX * w;
  const titleY = pad + Math.round(h * 0.01) + titleSize + settings.titleOffsetY * h;
  const titleLines = drawTitle(ctx, summary.title, titleX, titleY, w * (settings.titleWidth ?? 0.74), titleSize, input.fontFamily, settings.titleColor ?? '#FFFFFF');
  if (settings.showLocation && summary.locationLabel) {
    const locSize = Math.round(h * 0.021);
    drawLocation(ctx, summary.locationLabel, titleX, titleY + titleLines * titleSize * 1.12 + locSize + 2, locSize, input.fontFamily, settings.titleColor ?? '#FFFFFF');
  }

  // Bottom scrim + stats/elevation
  if (showStats || settings.showElevationMiniChart) {
    const elevH = settings.showElevationMiniChart ? Math.round(h * 0.105) : 0;
    const statsH = showStats ? Math.round(h * 0.115 * statsRowCount(settings)) : 0;
    const shift = Math.round(settings.dataPanelOffsetY * h);
    const scrimBottom = h - shift;
    const panelTop = scrimBottom - elevH - statsH;

    if (settings.showStatsBackground !== false && shift < 4) {
      // Default position: gradient flows naturally to the poster bottom
      const scrimY = panelTop - Math.round(h * 0.06);
      const botGrad = ctx.createLinearGradient(0, scrimY, 0, h);
      botGrad.addColorStop(0, 'rgba(0,0,0,0)');
      botGrad.addColorStop(0.3, 'rgba(0,0,0,0.52)');
      botGrad.addColorStop(1, 'rgba(0,0,0,0.72)');
      ctx.fillStyle = botGrad;
      ctx.fillRect(0, scrimY, w, h - scrimY);
    } else if (settings.showStatsBackground !== false) {
      // Moved up: localized pill — fades in above, solid behind text, fades out below
      const fadeH = Math.round(h * 0.045);
      const gradTop = panelTop - fadeH;
      const gradBottom = scrimBottom + fadeH;
      const totalH = gradBottom - gradTop;
      const t0 = fadeH / totalH;
      const t1 = (fadeH + elevH + statsH) / totalH;
      const botGrad = ctx.createLinearGradient(0, gradTop, 0, gradBottom);
      botGrad.addColorStop(0, 'rgba(0,0,0,0)');
      botGrad.addColorStop(t0, 'rgba(0,0,0,0.68)');
      botGrad.addColorStop(t1, 'rgba(0,0,0,0.68)');
      botGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = botGrad;
      ctx.fillRect(0, gradTop, w, totalH);
    }

    if (showStats) drawStatsBar(ctx, 0, panelTop, w, statsH, summary, settings, input.labels, input.fontFamily, input.statIconImages);
    if (settings.showElevationMiniChart) {
      drawElevationChart(ctx, pad, scrimBottom - elevH, w - pad * 2, elevH, { ...summary.elevation, unitSystem: summary.unitSystem }, input.routeColor, input.fontFamily, settings.statsColor ?? '#FFFFFF');
    }
  }
}

function drawPhotoFirst(ctx: CanvasRenderingContext2D, w: number, h: number, input: RenderInput) {
  const { summary, settings, selectedPhoto, routeLatLons } = input;
  const showStats = hasVisibleStats(settings);
  const pad = Math.round(w * 0.04);

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, w, h);

  if (selectedPhoto) {
    drawPhotoBackground(ctx, selectedPhoto, w, h, settings.photoTransform);
  }

  // Size the stats area and its scrim from only the layers that are visible.
  const shift = Math.round(settings.dataPanelOffsetY * h);
  const panelBottom = h - shift;
  const elevH = settings.showElevationMiniChart ? Math.round(h * 0.155) : 0;
  const statsH = showStats ? Math.round(h * 0.125 * statsRowCount(settings)) : 0;
  const statsY = panelBottom - elevH - statsH;
  if (settings.showStatsBackground !== false && (showStats || settings.showElevationMiniChart)) {
    const botStart = statsY - Math.round(h * 0.07);
    const botGrad = ctx.createLinearGradient(0, botStart, 0, panelBottom);
    botGrad.addColorStop(0, 'rgba(10,10,10,0)');
    botGrad.addColorStop(0.4, 'rgba(10,10,10,0.72)');
    botGrad.addColorStop(1, DARK_BG);
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, botStart, w, panelBottom - botStart);
  }

  // Top gradient for text
  const topGrad = ctx.createLinearGradient(0, 0, 0, h * 0.38);
  topGrad.addColorStop(0, 'rgba(10,10,10,0.72)');
  topGrad.addColorStop(1, 'rgba(10,10,10,0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, w, h * 0.38);

  // Route overlay
  if (routeLatLons && routeLatLons.length > 1) {
    const { offsetX, offsetY, scale, opacity } = settings.routeTransform;
    const routeBox: FitBox = { x: w * 0.10, y: h * 0.07, w: w * 0.85, h: h * 0.62 };
    const sampled = downsampleRoute(routeLatLons, 300);
    const projected = fitRouteToBox(sampled, routeBox, {
      offsetX: offsetX * w,
      offsetY: offsetY * h,
      scale,
    });
    const drawRoute = settings.routeGlow ? drawRouteGlow : drawRoutePlain;
    drawRoute(ctx, projected, Math.round(w * 0.012), opacity, input.routeColor);
  }

  drawBrandMark(ctx, w, h, input);

  // Title
  const titleSize = Math.round(h * 0.072 * (settings.titleScale ?? 1));
  const titleX = pad + settings.titleOffsetX * w;
  const titleY = pad + Math.round(h * 0.018) + titleSize + settings.titleOffsetY * h;
  const titleLines = drawTitle(ctx, summary.title, titleX, titleY, w * (settings.titleWidth ?? 0.92), titleSize, input.fontFamily, settings.titleColor ?? '#FFFFFF');

  // Location
  if (settings.showLocation && summary.locationLabel) {
    const locSize = Math.round(h * 0.025);
    drawLocation(ctx, summary.locationLabel, titleX, titleY + titleLines * titleSize * 1.12 + locSize + 4, locSize, input.fontFamily, settings.titleColor ?? '#FFFFFF');
  }

  // Stats + elevation
  if (showStats) drawStatsBar(ctx, 0, statsY, w, statsH, summary, settings, input.labels, input.fontFamily, input.statIconImages);
  if (settings.showElevationMiniChart) {
    drawElevationChart(ctx, pad, panelBottom - elevH, w - pad * 2, elevH, { ...summary.elevation, unitSystem: summary.unitSystem }, input.routeColor, input.fontFamily, settings.statsColor ?? '#FFFFFF');
  }
}

function drawPhotoSlot(ctx: CanvasRenderingContext2D, slot: SocialSharePhotoSlot, image: HTMLImageElement | undefined, w: number, h: number) {
  const box = { x: slot.x * w, y: slot.y * h, w: slot.w * w, h: slot.h * h };
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  if (image) {
    const coverScale = Math.max(box.w / image.naturalWidth, box.h / image.naturalHeight) * Math.max(1, slot.scale);
    const imageW = image.naturalWidth * coverScale;
    const imageH = image.naturalHeight * coverScale;
    const availableX = Math.max(0, imageW - box.w);
    const availableY = Math.max(0, imageH - box.h);
    const x = box.x - availableX * (0.5 + Math.max(-0.5, Math.min(0.5, slot.offsetX)));
    const y = box.y - availableY * (0.5 + Math.max(-0.5, Math.min(0.5, slot.offsetY)));
    ctx.drawImage(image, x, y, imageW, imageH);
  } else {
    const grad = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
    grad.addColorStop(0, '#2d493d');
    grad.addColorStop(1, '#132820');
    ctx.fillStyle = grad;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `600 ${Math.max(20, Math.round(w * 0.025))}px sans-serif`;
    ctx.fillText('＋ ADD PHOTO', box.x + box.w / 2, box.y + box.h / 2);
  }
  ctx.restore();
}

function drawSplit(ctx: CanvasRenderingContext2D, w: number, h: number, input: RenderInput) {
  const { settings, mapCanvas, summary } = input;
  const pad = Math.round(w * 0.045);
  ctx.fillStyle = '#F6F3E9';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.strokeStyle = 'rgba(39, 73, 54, 0.09)';
  ctx.lineWidth = Math.max(1, w * 0.001);
  for (let line = 0; line < 7; line++) {
    const y = h * (0.92 + line * 0.019);
    ctx.beginPath();
    ctx.moveTo(-w * 0.08, y);
    ctx.bezierCurveTo(w * 0.18, y - h * 0.05, w * 0.34, y + h * 0.07, w * 0.56, y + h * 0.012);
    ctx.bezierCurveTo(w * 0.79, y - h * 0.04, w * 0.90, y + h * 0.035, w * 1.07, y - h * 0.02);
    ctx.stroke();
  }
  ctx.restore();

  for (const slot of settings.photoSlots ?? []) {
    drawPhotoSlot(ctx, slot, input.slotImages[slot.id], w, h);
  }

  const mapBox = getSplitMapBox(w, h, settings.splitMapFrame);
  ctx.save();
  ctx.shadowColor = 'rgba(11,31,23,0.30)';
  ctx.shadowBlur = w * 0.035;
  ctx.shadowOffsetY = w * 0.012;
  ctx.fillStyle = '#183126';
  ctx.beginPath();
  ctx.roundRect(mapBox.x, mapBox.y, mapBox.w, mapBox.h, w * 0.05);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(mapBox.x, mapBox.y, mapBox.w, mapBox.h, w * 0.05);
  ctx.clip();
  if (mapCanvas) {
    const container = document.getElementById('map-capture-container');
    if (container) {
      const rect = container.getBoundingClientRect();
      const { cropX, cropY, cropW, cropH } = getCropRegion(rect, mapBox.w, mapBox.h);
      const px = mapCanvas.width / rect.width;
      const py = mapCanvas.height / rect.height;
      ctx.drawImage(mapCanvas, cropX * px, cropY * py, cropW * px, cropH * py, mapBox.x, mapBox.y, mapBox.w, mapBox.h);
    }
  } else {
    ctx.fillStyle = '#183126';
    ctx.fillRect(mapBox.x, mapBox.y, mapBox.w, mapBox.h);
  }
  if (input.projectedRouteForMap && input.projectedRouteForMap.length > 1) {
    drawRoutePlain(ctx, input.projectedRouteForMap, Math.max(8, w * 0.01), settings.routeTransform.opacity, input.routeColor);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = Math.round(w * 0.003);
  ctx.beginPath();
  ctx.roundRect(mapBox.x, mapBox.y, mapBox.w, mapBox.h, w * 0.05);
  ctx.stroke();

  const titleSize = Math.round(Math.min(w * 0.095, h * 0.095) * (settings.titleScale ?? 1));
  const titleX = pad + settings.titleOffsetX * w;
  const titleY = h * 0.85 + settings.titleOffsetY * h;
  drawTitle(ctx, summary.title, titleX, titleY, w * (settings.titleWidth ?? 0.92), titleSize, input.fontFamily, settings.titleColor ?? '#21372C', false);

  if (hasVisibleStats(settings)) {
    const wide = w > h;
    drawStatsBar(ctx, pad, h * ((wide ? 0.88 : 0.905) - settings.dataPanelOffsetY), w - pad * 2, h * (wide ? 0.11 : 0.09) * statsRowCount(settings), summary, settings, input.labels, input.fontFamily, input.statIconImages);
  }
  drawBrandMark(ctx, w, h, input);
}
