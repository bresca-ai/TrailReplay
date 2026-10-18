/** Shared poster geometry for the inset map, editor handle, and export. */
export function getSplitMapBox(width: number, height: number) {
  const wide = width > height;
  return wide
    ? { x: width * 0.35, y: height * 0.45, w: width * 0.30, h: height * 0.27 }
    : { x: width * 0.24, y: height * 0.53, w: width * 0.52, h: height * 0.20 };
}
