/** Credit the building data in canvas exports, where HTML attribution is absent. */
export function drawBuildingsAttribution(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const size = Math.max(12, Math.round(width * 0.012));
  const text = '© OpenStreetMap contributors (openstreetmap.org/copyright) · © OpenMapTiles';
  ctx.save();
  ctx.font = `${size}px sans-serif`;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  const padding = size * 0.35;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, height - size - padding * 2, ctx.measureText(text).width + padding * 2, size + padding * 2);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, padding, height - padding);
  ctx.restore();
}
