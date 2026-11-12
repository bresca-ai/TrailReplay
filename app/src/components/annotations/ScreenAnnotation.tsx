import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { OverlayFont, TextAnnotation } from '@/types';
import { drawFieldNote } from './drawFieldNote';
import { needsPinheadIcons } from './annotationSymbol';
import { usePinheadIcons } from './pinheadIcons';
import { overlayCanvasFontFamily } from '@/utils/typography';

export function ScreenAnnotation({ annotation, font, maxWidth, maxHeight, size, style, exportPixelRatio }: {
  annotation: TextAnnotation; font: OverlayFont; maxWidth: number; maxHeight: number; size: number; style: CSSProperties; exportPixelRatio?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const icons = usePinheadIcons(needsPinheadIcons([annotation.logo]));
  useLayoutEffect(() => {
    let cancelled = false;
    const paint = () => {
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const drawing = drawFieldNote(annotation, font, maxWidth / size, 'text', 1, 1, exportPixelRatio === undefined ? undefined : exportPixelRatio * size);
      if (!drawing) return;
      canvas.width = drawing.canvas.width;
      canvas.height = drawing.canvas.height;
      const width = drawing.canvas.width / drawing.resolution, height = drawing.canvas.height / drawing.resolution;
      const fit = Math.min(size, maxHeight / height, maxWidth / width);
      canvas.style.width = `${width * fit}px`;
      canvas.style.height = `${height * fit}px`;
      canvas.getContext('2d')?.drawImage(drawing.canvas, 0, 0);
    };
    paint();
    if (document.fonts?.load) {
      const text = [annotation.title, annotation.eyebrow, annotation.description].filter(Boolean).join(' ');
      void Promise.all([500, 600, 700].map(weight => document.fonts.load(`${weight} 16px ${overlayCanvasFontFamily('modern')}`, text))).then(paint).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [annotation, font, icons, maxWidth, maxHeight, size, exportPixelRatio]);
  return <canvas ref={canvasRef} className="tr-screen-annotation pointer-events-none absolute z-30" style={style} role="note" aria-label={[annotation.eyebrow, annotation.title, annotation.description].filter(Boolean).join('. ')} />;
}
