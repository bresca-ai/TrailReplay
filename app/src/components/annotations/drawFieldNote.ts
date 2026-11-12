import type { OverlayFont, TextAnnotation } from '@/types';
import { drawAnnotationSymbol } from './annotationSymbol';
import { layoutFieldNote } from './fieldNoteLayout';

export function drawFieldNote(annotation: TextAnnotation, font: OverlayFont, maxWidth: number, mode: 'all' | 'pin' | 'text' = 'all', markerSize = 1, textSize = 1, exportPixelRatio?: number) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;
  const layout = layoutFieldNote(annotation, font, maxWidth, (text, textFont) => {
    context.font = textFont;
    return context.measureText(text).width;
  }, mode === 'text', markerSize, textSize);
  // Four source pixels per CSS pixel preserve sharp video text when the
  // visible export crop is enlarged to a 1080p or 4K output.
  const resolution = exportPixelRatio === undefined
    ? Math.min(4, 1024 / Math.max(layout.width, layout.height))
    : Math.max(1, Math.min(exportPixelRatio, 8192 / Math.max(layout.width, layout.height)));
  canvas.width = Math.ceil(layout.width * resolution);
  canvas.height = Math.ceil(layout.height * resolution);
  context.scale(resolution, resolution);
  const s = layout.scale;
  // Center the divider on the icon and start the shade exactly behind it.
  const textHeight = Math.max(32 * s, layout.height - 28 * s);
  const pinHeight = 40 * s * markerSize;
  const pinScale = pinHeight / 22;
  const pinX = 10 * s + 10 * pinScale;
  const centerY = layout.height / 2;
  const pinY = centerY + 3 * pinScale;
  const tipY = pinY + 12 * pinScale;
  const lineX = mode === 'text' ? 2 * s : 10 * s + 20 * pinScale + 7 * s;
  const lineHeight = Math.min(layout.height - 4 * s, mode === 'text' ? textHeight : Math.max(pinHeight, textHeight));
  const shadeX = lineX;
  const shadeWidth = Math.max(0, layout.width - shadeX);
  if (layout.lines.length && shadeWidth > 0) {
    context.save();
    context.beginPath();
    context.rect(shadeX, 0, shadeWidth, layout.height);
    context.clip();
    context.translate(shadeX + shadeWidth / 2, centerY);
    context.scale(Math.max(1, shadeWidth / 2), Math.max(1, lineHeight / 2));
    const wash = context.createRadialGradient(0, 0, 0.12, 0, 0, 1);
    wash.addColorStop(0, 'rgba(3, 10, 8, 0.72)');
    wash.addColorStop(0.55, 'rgba(3, 10, 8, 0.53)');
    wash.addColorStop(1, 'rgba(3, 10, 8, 0)');
    context.fillStyle = wash;
    context.fillRect(-1, -1, 2, 2);
    context.restore();
  }
  if (mode !== 'text') {
    context.save();
    context.translate(pinX, pinY);
    context.scale(pinScale, pinScale);
    const pin = new Path2D('M 0 12 C -2 9 -10 3 -10 -3 A 10 10 0 1 1 10 -3 C 10 3 2 9 0 12 Z');
    context.shadowColor = 'rgba(0,0,0,0.6)';
    context.shadowBlur = 3;
    context.strokeStyle = annotation.color;
    if (annotation.markerFilled ?? true) {
      context.fillStyle = '#101417';
      context.fill(pin);
    }
    context.lineWidth = 1.5;
    context.stroke(pin);
    context.restore();
    drawAnnotationSymbol(context, annotation.logo || 'map:pin', pinX, centerY, 10 * pinScale, annotation.color);
  }
  if (layout.lines.length) {
    context.fillStyle = annotation.color;
    context.fillRect(lineX, centerY - lineHeight / 2, 2 * s, lineHeight);
  }
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.shadowColor = 'rgba(0, 0, 0, 0.75)';
  context.shadowBlur = 3 * s;
  for (const line of layout.lines) {
    context.font = line.font;
    context.fillStyle = '#fffaf0';
    context.fillText(line.text, mode === 'text' ? 14 * s : 10 * s + 20 * pinScale + 19 * s, line.y);
  }
  return { canvas, anchorX: pinX, anchorBottom: layout.height - tipY, resolution };
}
