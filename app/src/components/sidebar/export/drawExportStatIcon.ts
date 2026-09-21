/** Draws Lucide's SVG strokes directly onto an exported video frame. */
export function drawExportStatIcon(context: CanvasRenderingContext2D, icon: SVGSVGElement) {
  icon.querySelectorAll('path,circle,line,polyline,rect').forEach((shape) => {
    if (shape.tagName.toLowerCase() === 'path') {
      const d = shape.getAttribute('d');
      if (d) context.stroke(new Path2D(d));
    } else if (shape.tagName.toLowerCase() === 'circle') {
      context.beginPath();
      context.arc(
        Number(shape.getAttribute('cx')),
        Number(shape.getAttribute('cy')),
        Number(shape.getAttribute('r')),
        0,
        2 * Math.PI,
      );
      context.stroke();
    } else if (shape.tagName.toLowerCase() === 'line') {
      context.beginPath();
      context.moveTo(Number(shape.getAttribute('x1')), Number(shape.getAttribute('y1')));
      context.lineTo(Number(shape.getAttribute('x2')), Number(shape.getAttribute('y2')));
      context.stroke();
    } else if (shape.tagName.toLowerCase() === 'polyline') {
      const points = (shape.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
      if (points.length >= 4 && points.length % 2 === 0) {
        context.beginPath();
        context.moveTo(points[0], points[1]);
        for (let index = 2; index < points.length; index += 2) {
          context.lineTo(points[index], points[index + 1]);
        }
        context.stroke();
      }
    } else if (shape.tagName.toLowerCase() === 'rect') {
      context.beginPath();
      context.roundRect(
        Number(shape.getAttribute('x')),
        Number(shape.getAttribute('y')),
        Number(shape.getAttribute('width')),
        Number(shape.getAttribute('height')),
        Number(shape.getAttribute('rx')) || 0,
      );
      context.stroke();
    }
  });
}
