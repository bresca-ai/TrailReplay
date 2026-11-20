/** Replace the terracotta paint in a rendered sprite while retaining ink, paper and gold. */
export function recolorMarkerPixels(pixels: Uint8ClampedArray, color: string): void {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return;
  const target = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
  const orange = [193, 101, 47];
  for (let i = 0; i < pixels.length; i += 4) {
    if (!pixels[i + 3]) continue;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    // Orange and its antialiased shades stay in this hue range; gold is > 32°.
    if (max !== r || delta < 18) continue;
    const hue = 60 * (g - b) / delta;
    if (hue < 8 || hue > 32) continue;
    // Preserve highlights and shading by estimating the blend with white or ink.
    const lighter = r >= orange[0] && g >= orange[1] && b >= orange[2];
    const base = lighter ? [255, 255, 255] : [27, 42, 32];
    let numerator = 0, denominator = 0;
    for (let k = 0; k < 3; k++) { numerator += (pixels[i + k] - base[k]) * (orange[k] - base[k]); denominator += (orange[k] - base[k]) ** 2; }
    const weight = Math.max(0, Math.min(1, numerator / denominator));
    for (let k = 0; k < 3; k++) pixels[i + k] = Math.round(base[k] + weight * (target[k] - base[k]));
  }
}
