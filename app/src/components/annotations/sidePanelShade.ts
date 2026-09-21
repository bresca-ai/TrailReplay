/**
 * The slight shade behind a field note. Text shadow alone disappears over
 * bright snow, cloud or satellite imagery, so the note sits on a faint wash that
 * still lets the map show through.
 *
 * The live panel and the video export both read these values: the export
 * redraws the panel by hand, and preview and video must look the same.
 */
export const SIDE_PANEL_SHADE = {
  radius: 16,
  top: 'rgba(4, 16, 15, 0.5)',
  bottom: 'rgba(4, 16, 15, 0.3)',
} as const;

export const sidePanelShadeStyle = {
  background: `linear-gradient(180deg, ${SIDE_PANEL_SHADE.top}, ${SIDE_PANEL_SHADE.bottom})`,
  borderRadius: SIDE_PANEL_SHADE.radius,
};

export function drawSidePanelShade(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
) {
  const gradient = context.createLinearGradient(0, y, 0, y + height);
  gradient.addColorStop(0, SIDE_PANEL_SHADE.top);
  gradient.addColorStop(1, SIDE_PANEL_SHADE.bottom);
  context.save();
  context.fillStyle = gradient;
  context.beginPath();
  context.roundRect(x, y, width, height, SIDE_PANEL_SHADE.radius * scale);
  context.fill();
  context.restore();
}
