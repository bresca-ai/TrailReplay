import type { SocialShareAspectRatio, SocialShareSettings } from '@/types';
import { getCropRegion } from '@/utils/crop';
import { metersToFeet } from '@/utils/units';
import type { SocialShareSummaryData } from './socialShareData';
import type { CanvasPoint, FitBox } from './socialShareRouteFit';
import { downsampleRoute, fitRouteToBox } from './socialShareRouteFit';

// ponytail: layout geometry lives here; extract to socialShareLayout.ts if templates exceed 2

const DARK_BG = 'rgba(10,10,10,0.97)';
const WHITE = 'rgba(255,255,255,0.95)';
const WHITE_DIM = 'rgba(255,255,255,0.60)';
const POSTER_W = 1080;

export function getPosterSize(ratio: SocialShareAspectRatio): { w: number; h: number } {
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
  /** Primary route color from track settings (hex). */
  routeColor: string;
  /** Translated stat labels for the stats bar. */
  labels: { distance: string; elevGain: string; time: string };
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
) {
  if (profile.length < 2) return;

  const isMetric = unitSystem === 'metric';
  const chartH = h * 0.82;
  const chartY = y + h * 0.18;
  const labelSize = Math.round(w * 0.027);

  // Grid lines + y-axis labels
  ctx.font = `400 ${labelSize}px system-ui,-apple-system,sans-serif`;
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
  { distanceMeters, durationSeconds, elevationGainMeters, unitSystem }: SocialShareSummaryData,
  labels: RenderInput['labels'],
) {
  const isMetric = unitSystem === 'metric';
  const colW = w / 3;
  const labelSize = Math.round(h * 0.19);
  const numSize = Math.round(h * 0.50);
  const unitSize = Math.round(h * 0.27);
  const baseline = y + h * 0.82;

  const distNum = isMetric
    ? (distanceMeters / 1000).toFixed(distanceMeters >= 10000 ? 1 : 2)
    : (distanceMeters / 1609.344).toFixed(2);

  const elevNum = isMetric
    ? Math.round(elevationGainMeters).toString()
    : Math.round(metersToFeet(elevationGainMeters)).toString();

  const totalMins = Math.floor(durationSeconds / 60);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  const stats = [
    { label: labels.distance, num: distNum, unit: isMetric ? 'km' : 'mi' },
    { label: labels.elevGain, num: elevNum, unit: isMetric ? 'm' : 'ft' },
    { label: labels.time, num: hrs > 0 ? `${hrs}h` : `${mins}m`, unit: hrs > 0 ? `${mins}m` : '' },
  ];

  stats.forEach(({ label, num, unit }, i) => {
    const cx = x + colW * i + colW / 2;

    if (i > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + colW * i, y + h * 0.15, 1, h * 0.7);
    }

    ctx.font = `400 ${labelSize}px system-ui,-apple-system,sans-serif`;
    ctx.fillStyle = WHITE_DIM;
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, y + h * 0.30);

    ctx.font = `700 ${numSize}px system-ui,-apple-system,sans-serif`;
    const numW = ctx.measureText(num).width;
    ctx.font = `400 ${unitSize}px system-ui,-apple-system,sans-serif`;
    const unitW = unit ? ctx.measureText(` ${unit}`).width : 0;
    const startX = cx - (numW + unitW) / 2;

    ctx.font = `700 ${numSize}px system-ui,-apple-system,sans-serif`;
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'left';
    ctx.fillText(num, startX, baseline);

    if (unit) {
      ctx.font = `400 ${unitSize}px system-ui,-apple-system,sans-serif`;
      ctx.fillStyle = WHITE_DIM;
      ctx.fillText(` ${unit}`, startX + numW, baseline);
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
  x: number, y: number, maxW: number, fontSize: number,
): number {
  ctx.font = `800 ${fontSize}px system-ui,-apple-system,sans-serif`;
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

function drawLocation(ctx: CanvasRenderingContext2D, location: string, x: number, y: number, size: number) {
  if (!location) return;
  ctx.font = `400 ${size}px system-ui,-apple-system,sans-serif`;
  ctx.fillStyle = WHITE_DIM;
  ctx.textAlign = 'left';
  ctx.fillText(`📍 ${location}`, x, y);
}

function coverFit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number, dy: number, dw: number, dh: number,
  clip?: () => void,
) {
  const imgAspect = img.naturalWidth / img.naturalHeight;
  const boxAspect = dw / dh;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (imgAspect > boxAspect) {
    sw = img.naturalHeight * boxAspect;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / boxAspect;
    sy = (img.naturalHeight - sh) / 2;
  }
  if (clip) {
    ctx.save();
    clip();
    ctx.clip();
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  }
}


// --- Template renderers ---

function drawMapFirst(ctx: CanvasRenderingContext2D, w: number, h: number, input: RenderInput) {
  const { mapCanvas, summary, settings, logo, projectedRouteForMap } = input;
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
  const titleY = pad + logoH + Math.round(h * 0.010) + titleSize;
  const titleLines = drawTitle(ctx, summary.title, pad, titleY, w * 0.72, titleSize);
  if (settings.showLocation && summary.locationLabel) {
    const locSize = Math.round(h * 0.021);
    drawLocation(ctx, summary.locationLabel, pad, titleY + titleLines * titleSize * 1.12 + locSize + 2, locSize);
  }

  // Bottom scrim + stats/elevation
  if (settings.showStats || settings.showElevationMiniChart) {
    const elevH = settings.showElevationMiniChart ? Math.round(h * 0.105) : 0;
    const statsH = settings.showStats ? Math.round(h * 0.115) : 0;
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

    if (settings.showStats) drawStatsBar(ctx, 0, panelTop, w, statsH, summary, input.labels);
    if (settings.showElevationMiniChart) {
      drawElevationChart(ctx, pad, scrimBottom - elevH, w - pad * 2, elevH, { ...summary.elevation, unitSystem: summary.unitSystem }, input.routeColor);
    }
  }
}

function drawPhotoFirst(ctx: CanvasRenderingContext2D, w: number, h: number, input: RenderInput) {
  const { summary, settings, logo, selectedPhoto, routeLatLons } = input;
  const pad = Math.round(w * 0.04);

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, w, h);

  if (selectedPhoto) {
    coverFit(ctx, selectedPhoto, 0, 0, w, h);
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
  const titleY = pad + logoH + Math.round(h * 0.018) + titleSize;
  const titleLines = drawTitle(ctx, summary.title, pad, titleY, w - pad * 2, titleSize);

  // Location
  if (settings.showLocation && summary.locationLabel) {
    const locSize = Math.round(h * 0.025);
    drawLocation(ctx, summary.locationLabel, pad, titleY + titleLines * titleSize * 1.12 + locSize + 4, locSize);
  }

  // Stats + elevation (panelBottom and shift already computed above)
  const elevH = Math.round(h * 0.155);
  const statsH = Math.round(h * 0.125);
  const statsY = panelBottom - elevH - statsH;

  if (settings.showStats) drawStatsBar(ctx, 0, statsY, w, statsH, summary, input.labels);
  if (settings.showElevationMiniChart) {
    drawElevationChart(ctx, pad, panelBottom - elevH, w - pad * 2, elevH, { ...summary.elevation, unitSystem: summary.unitSystem }, input.routeColor);
  }
}
