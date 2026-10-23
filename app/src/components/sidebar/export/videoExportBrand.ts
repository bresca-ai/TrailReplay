export const VIDEO_LOGO_URL = '/media/images/logohorizontal-white.svg';
export const VIDEO_LOGO_OPACITY = 0.85;

/** Watermark geometry in output pixels, shared by recording and its preview. */
export function getVideoLogoBox(width: number, height: number) {
  const longEdge = Math.max(width, height);
  const w = Math.round(longEdge * 0.16);
  const h = Math.round(w / 2.5);
  const margin = Math.round(longEdge * 0.025);
  return { x: width - w - margin, y: margin, w, h };
}
