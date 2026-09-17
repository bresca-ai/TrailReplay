import * as maplibregl from 'maplibre-gl';

function terrariumHeight(r: number, g: number, b: number): number {
  return (r * 256 + g + b / 256) - 32768;
}

function metersPerPixel(zoom: number): number {
  return 40075016.686 / (256 * Math.pow(2, zoom));
}

function slopeColor(degrees: number): [number, number, number, number] {
  if (degrees < 15) return [0, 0, 0, 0];
  if (degrees < 25) return [255, 255, 0, 120];
  if (degrees < 30) return [255, 200, 0, 150];
  if (degrees < 35) return [255, 120, 0, 180];
  if (degrees < 40) return [255, 50, 0, 200];
  if (degrees < 45) return [220, 0, 0, 210];
  return [160, 0, 80, 220];
}

function aspectColor(aspectDegrees: number, slopeDegrees: number): [number, number, number, number] {
  if (slopeDegrees < 5) return [0, 0, 0, 0];

  const d = (aspectDegrees + 360) % 360;
  const alpha = 170;

  if (d >= 337.5 || d < 22.5) return [0, 122, 255, alpha];
  if (d < 67.5) return [0, 200, 255, alpha];
  if (d < 112.5) return [0, 200, 90, alpha];
  if (d < 157.5) return [180, 220, 0, alpha];
  if (d < 202.5) return [255, 165, 0, alpha];
  if (d < 247.5) return [255, 80, 0, alpha];
  if (d < 292.5) return [200, 0, 200, alpha];
  return [120, 0, 255, alpha];
}

let slopeProtocolRegistered = false;
let aspectProtocolRegistered = false;

export function registerSlopeProtocol() {
  if (slopeProtocolRegistered) return;
  slopeProtocolRegistered = true;

  maplibregl.addProtocol('slope', async (params) => {
    const parts = params.url.replace('slope://', '').split('/');
    const z = parseInt(parts[0]);
    const x = parseInt(parts[1]);
    const y = parseInt(parts[2]);

    const tz = Math.min(z, 15);
    const scale = Math.pow(2, z - tz);
    const tx = Math.floor(x / scale);
    const ty = Math.floor(y / scale);

    const tileUrl = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${tz}/${tx}/${ty}.png`;

    const response = await fetch(tileUrl);
    if (!response.ok) throw new Error(`Tile fetch error: ${response.statusText}`);

    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const size = 256;
    const srcCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const srcCtx = srcCanvas.getContext('2d')!;
    srcCtx.drawImage(bitmap, 0, 0);
    const srcData = srcCtx.getImageData(0, 0, bitmap.width, bitmap.height);
    const src = srcData.data;
    const w = bitmap.width;
    const subSize = Math.floor(w / scale);
    const offX = Math.floor((x % scale) * subSize);
    const offY = Math.floor((y % scale) * subSize);

    const outCanvas = new OffscreenCanvas(size, size);
    const outCtx = outCanvas.getContext('2d')!;
    const outImg = outCtx.createImageData(size, size);
    const out = outImg.data;
    const cellSize = metersPerPixel(z);

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const sx = Math.min(Math.floor(offX + (px * subSize) / size), w - 1);
        const sy = Math.min(Math.floor(offY + (py * subSize) / size), w - 1);

        const idxL = (sy * w + Math.max(0, sx - 1)) * 4;
        const idxR = (sy * w + Math.min(w - 1, sx + 1)) * 4;
        const idxU = (Math.max(0, sy - 1) * w + sx) * 4;
        const idxD = (Math.min(w - 1, sy + 1) * w + sx) * 4;

        const hL = terrariumHeight(src[idxL], src[idxL + 1], src[idxL + 2]);
        const hR = terrariumHeight(src[idxR], src[idxR + 1], src[idxR + 2]);
        const hU = terrariumHeight(src[idxU], src[idxU + 1], src[idxU + 2]);
        const hD = terrariumHeight(src[idxD], src[idxD + 1], src[idxD + 2]);

        const dzdx = (hR - hL) / (2 * cellSize);
        const dzdy = (hD - hU) / (2 * cellSize);
        const slopeDeg = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * (180 / Math.PI);
        const [r, g, b, a] = slopeColor(slopeDeg);
        const oi = (py * size + px) * 4;
        out[oi] = r;
        out[oi + 1] = g;
        out[oi + 2] = b;
        out[oi + 3] = a;
      }
    }

    outCtx.putImageData(outImg, 0, 0);
    const outBlob = await outCanvas.convertToBlob({ type: 'image/png' });
    const arrayBuffer = await outBlob.arrayBuffer();
    return { data: arrayBuffer };
  });
}

export function registerAspectProtocol() {
  if (aspectProtocolRegistered) return;
  aspectProtocolRegistered = true;

  maplibregl.addProtocol('aspect', async (params) => {
    const parts = params.url.replace('aspect://', '').split('/');
    const z = parseInt(parts[0]);
    const x = parseInt(parts[1]);
    const y = parseInt(parts[2]);

    const tz = Math.min(z, 15);
    const scale = Math.pow(2, z - tz);
    const tx = Math.floor(x / scale);
    const ty = Math.floor(y / scale);

    const tileUrl = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${tz}/${tx}/${ty}.png`;
    const response = await fetch(tileUrl);
    if (!response.ok) throw new Error(`Tile fetch error: ${response.statusText}`);

    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const size = 256;
    const srcCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const srcCtx = srcCanvas.getContext('2d')!;
    srcCtx.drawImage(bitmap, 0, 0);
    const srcData = srcCtx.getImageData(0, 0, bitmap.width, bitmap.height);
    const src = srcData.data;
    const w = bitmap.width;
    const subSize = Math.floor(w / scale);
    const offX = Math.floor((x % scale) * subSize);
    const offY = Math.floor((y % scale) * subSize);

    const outCanvas = new OffscreenCanvas(size, size);
    const outCtx = outCanvas.getContext('2d')!;
    const outImg = outCtx.createImageData(size, size);
    const out = outImg.data;
    const cellSize = metersPerPixel(z);

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const sx = Math.min(Math.floor(offX + (px * subSize) / size), w - 1);
        const sy = Math.min(Math.floor(offY + (py * subSize) / size), w - 1);

        const idxL = (sy * w + Math.max(0, sx - 1)) * 4;
        const idxR = (sy * w + Math.min(w - 1, sx + 1)) * 4;
        const idxU = (Math.max(0, sy - 1) * w + sx) * 4;
        const idxD = (Math.min(w - 1, sy + 1) * w + sx) * 4;

        const hL = terrariumHeight(src[idxL], src[idxL + 1], src[idxL + 2]);
        const hR = terrariumHeight(src[idxR], src[idxR + 1], src[idxR + 2]);
        const hU = terrariumHeight(src[idxU], src[idxU + 1], src[idxU + 2]);
        const hD = terrariumHeight(src[idxD], src[idxD + 1], src[idxD + 2]);

        const dzdx = (hR - hL) / (2 * cellSize);
        const dzdy = (hD - hU) / (2 * cellSize);
        const slopeDeg = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * (180 / Math.PI);
        const aspectDeg = (Math.atan2(dzdy, -dzdx) * (180 / Math.PI) + 360) % 360;
        const [r, g, b, a] = aspectColor(aspectDeg, slopeDeg);
        const oi = (py * size + px) * 4;
        out[oi] = r;
        out[oi + 1] = g;
        out[oi + 2] = b;
        out[oi + 3] = a;
      }
    }

    outCtx.putImageData(outImg, 0, 0);
    const outBlob = await outCanvas.convertToBlob({ type: 'image/png' });
    const arrayBuffer = await outBlob.arrayBuffer();
    return { data: arrayBuffer };
  });
}
