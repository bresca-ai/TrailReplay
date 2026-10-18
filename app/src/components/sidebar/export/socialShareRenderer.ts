import type { SocialShareAspectRatio, SocialShareSettings } from '@/types';
import { getCropRegion } from '@/utils/crop';
import { formatPace, metersToFeet } from '@/utils/units';
import type { SocialShareSummaryData } from './socialShareData';
import type { CanvasPoint, FitBox } from './socialShareRouteFit';
import { downsampleRoute, fitRouteToBox } from './socialShareRouteFit';

// ponytail: layout geometry lives here; extract to socialShareLayout.ts if templates exceed 2

const DARK_BG = 'rgba(10,10,10,0.97)';
const WHITE = 'rgba(255,255,255,0.95)';
const WHITE_DIM = 'rgba(255,255,255,0.60)';
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
  logo: HTMLImageElement | null;
  fontFamily: string;
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
  if (input.settings.template === 'map-first') {
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
  if (input.settings.template === 'map-first') {
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
  ctx.lineWidth = lineWidth;
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
    ctx.fillStyle = WHITE_DIM;
    ctx.textAlign = 'left';
    const label = isMetric ? `${Math.round(elev)} m` : `${Math.round(elev * 3.28084)} ft`;
    ctx.fillText(label, x + 4, ly - 4);
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
  const labelSize = Math.round(rowH * 0.19 * scale);
  const numSize = Math.round(rowH * 0.50 * scale);
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
    const { num, unit } = stat.metric === 'custom'
      ? { num: stat.value, unit: '' }
      : values[stat.metric] ?? { num: '', unit: '' };
    const label = stat.label || labels[stat.metric] || '';
    const row = Math.floor(i / columns);
    const col = i % columns;
    const cellsInRow = Math.min(columns, visibleStats.length - row * columns);
    const rowOffset = ((columns - cellsInRow) * colW) / 2;
    const cellX = x + rowOffset + colW * col;
    const cellY = y + rowH * row;
    const cx = cellX + colW / 2;

    if (settings.statsStyle === 'cards') {
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(cellX + 5, cellY + 3, colW - 10, rowH - 6);
    } else if (settings.statsStyle === 'accent') {
      ctx.fillStyle = `${statsColor}28`;
      ctx.fillRect(cellX + 5, cellY + 3, colW - 10, rowH - 6);
    }

    if (col > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(cellX, cellY + rowH * 0.15, 1, rowH * 0.7);
    }
    if (row > 0 && col === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + w * 0.1, cellY, w * 0.8, 1);
    }

    ctx.font = `400 ${labelSize}px ${fontFamily}`;
    ctx.fillStyle = `${statsColor}B0`;
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cellY + rowH * 0.30);

    ctx.font = `700 ${numSize}px ${fontFamily}`;
    const numW = ctx.measureText(num).width;
    ctx.font = `400 ${unitSize}px ${fontFamily}`;
    const unitW = unit ? ctx.measureText(` ${unit}`).width : 0;
    const startX = cx - (numW + unitW) / 2;

    ctx.font = `700 ${numSize}px ${fontFamily}`;
    ctx.fillStyle = statsColor;
    ctx.textAlign = 'left';
    ctx.fillText(num, startX, cellY + rowH * 0.82);

    if (unit) {
      ctx.font = `400 ${unitSize}px ${fontFamily}`;
      ctx.fillStyle = WHITE_DIM;
      ctx.fillText(` ${unit}`, startX + numW, cellY + rowH * 0.82);
    }
  });
}

function drawLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, x: number, y: number, w: number) {
  if (!logo) return;
  // Use intrinsic SVG ratio (500×200 viewBox → 2.5:1); fall back gracefully
  const aspect = logo.naturalWidth > 0 && logo.naturalHeight > 0
    ? logo.naturalWidth / logo.naturalHeight
    : 2.5;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.drawImage(logo, x, y, w, Math.round(w / aspect));
  ctx.restore();
}

function drawTitle(
  ctx: CanvasRenderingContext2D,
  title: string,
  x: number, y: number, maxW: number, fontSize: number, fontFamily: string,
): number {
  ctx.font = `800 ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = WHITE;
  const words = title.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxW && current) {
      lines.push(current);
      current = word;
      if (lines.length >= 2) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < 2) lines.push(current);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * fontSize * 1.12, maxW));
  return lines.length;
}

function drawLocation(ctx: CanvasRenderingContext2D, location: string, x: number, y: number, size: number, fontFamily: string) {
  if (!location) return;
  ctx.font = `400 ${size}px ${fontFamily}`;
  ctx.fillStyle = WHITE_DIM;
  ctx.textAlign = 'left';
  ctx.fillText(`📍 ${location}`, x, y);
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
  const { mapCanvas, summary, settings, logo, projectedRouteForMap } = input;
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

  // Subtle top scrim — only enough to make the logo + title readable
  const topGrad = ctx.createLinearGradient(0, 0, 0, h * 0.22);
  topGrad.addColorStop(0, 'rgba(0,0,0,0.62)');
  topGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, w, h * 0.22);

  // Route glow (3-D layered) — full poster, no clipping
  if (projectedRouteForMap && projectedRouteForMap.length > 1) {
    const drawRoute = settings.routeGlow ? drawRouteGlow : drawRoutePlain;
    drawRoute(ctx, projectedRouteForMap, Math.round(w * 0.014), settings.routeTransform.opacity, input.routeColor);
  }

  // Logo (top-left)
  const logoW = Math.round(w * 0.28);
  const logoAspect = logo && logo.naturalWidth > 0 && logo.naturalHeight > 0 ? logo.naturalWidth / logo.naturalHeight : 2.5;
  const logoH = Math.round(logoW / logoAspect);
  drawLogo(ctx, logo, pad, pad, logoW);

  // Title + location below logo
  const titleSize = Math.round(h * 0.050);
  const titleX = pad + settings.titleOffsetX * w;
  const titleY = pad + logoH + Math.round(h * 0.010) + titleSize + settings.titleOffsetY * h;
  const titleLines = drawTitle(ctx, summary.title, titleX, titleY, w * 0.72, titleSize, input.fontFamily);
  if (settings.showLocation && summary.locationLabel) {
    const locSize = Math.round(h * 0.021);
    drawLocation(ctx, summary.locationLabel, titleX, titleY + titleLines * titleSize * 1.12 + locSize + 2, locSize, input.fontFamily);
  }

  // Bottom scrim + stats/elevation
  if (showStats || settings.showElevationMiniChart) {
    const elevH = settings.showElevationMiniChart ? Math.round(h * 0.105) : 0;
    const statsH = showStats ? Math.round(h * 0.115 * statsRowCount(settings)) : 0;
    const shift = Math.round(settings.dataPanelOffsetY * h);
    const scrimBottom = h - shift;
    const panelTop = scrimBottom - elevH - statsH;

    if (shift < 4) {
      // Default position: gradient flows naturally to the poster bottom
      const scrimY = panelTop - Math.round(h * 0.06);
      const botGrad = ctx.createLinearGradient(0, scrimY, 0, h);
      botGrad.addColorStop(0, 'rgba(0,0,0,0)');
      botGrad.addColorStop(0.3, 'rgba(0,0,0,0.52)');
      botGrad.addColorStop(1, 'rgba(0,0,0,0.72)');
      ctx.fillStyle = botGrad;
      ctx.fillRect(0, scrimY, w, h - scrimY);
    } else {
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

    if (showStats) drawStatsBar(ctx, 0, panelTop, w, statsH, summary, settings, input.labels, input.fontFamily);
    if (settings.showElevationMiniChart) {
      drawElevationChart(ctx, pad, scrimBottom - elevH, w - pad * 2, elevH, { ...summary.elevation, unitSystem: summary.unitSystem }, input.routeColor, input.fontFamily);
    }
  }
}

function drawPhotoFirst(ctx: CanvasRenderingContext2D, w: number, h: number, input: RenderInput) {
  const { summary, settings, logo, selectedPhoto, routeLatLons } = input;
  const showStats = hasVisibleStats(settings);
  const pad = Math.round(w * 0.04);

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, w, h);

  if (selectedPhoto) {
    drawPhotoBackground(ctx, selectedPhoto, w, h, settings.photoTransform);
  }

  // Bottom dark gradient — ends at the data panel bottom so it doesn't bleed below when panel is moved up
  const shift = Math.round(settings.dataPanelOffsetY * h);
  const panelBottom = h - shift;
  const botStart = Math.min(h * 0.52, panelBottom - h * 0.22);
  const botGrad = ctx.createLinearGradient(0, botStart, 0, panelBottom);
  botGrad.addColorStop(0, 'rgba(10,10,10,0)');
  botGrad.addColorStop(0.38, 'rgba(10,10,10,0.88)');
  botGrad.addColorStop(1, DARK_BG);
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, botStart, w, panelBottom - botStart);

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

  // Logo
  const logoW = Math.round(w * 0.30);
  const logoAspect = logo && logo.naturalWidth > 0 && logo.naturalHeight > 0 ? logo.naturalWidth / logo.naturalHeight : 2.5;
  const logoH = Math.round(logoW / logoAspect);
  drawLogo(ctx, logo, pad, pad, logoW);

  // Title
  const titleSize = Math.round(h * 0.072);
  const titleX = pad + settings.titleOffsetX * w;
  const titleY = pad + logoH + Math.round(h * 0.018) + titleSize + settings.titleOffsetY * h;
  const titleLines = drawTitle(ctx, summary.title, titleX, titleY, w - pad * 2, titleSize, input.fontFamily);

  // Location
  if (settings.showLocation && summary.locationLabel) {
    const locSize = Math.round(h * 0.025);
    drawLocation(ctx, summary.locationLabel, titleX, titleY + titleLines * titleSize * 1.12 + locSize + 4, locSize, input.fontFamily);
  }

  // Stats + elevation (panelBottom and shift already computed above)
  const elevH = Math.round(h * 0.155);
  const statsH = showStats ? Math.round(h * 0.125 * statsRowCount(settings)) : 0;
  const statsY = panelBottom - elevH - statsH;

  if (showStats) drawStatsBar(ctx, 0, statsY, w, statsH, summary, settings, input.labels, input.fontFamily);
  if (settings.showElevationMiniChart) {
    drawElevationChart(ctx, pad, panelBottom - elevH, w - pad * 2, elevH, { ...summary.elevation, unitSystem: summary.unitSystem }, input.routeColor, input.fontFamily);
  }
}
