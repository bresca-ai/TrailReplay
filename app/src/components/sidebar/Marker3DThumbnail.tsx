import { useEffect, useRef } from 'react';
import { recolorMarkerPixels } from '@/utils/markerImageColor';

/** Small snapshots avoid keeping a WebGL context alive for every picker option. */
export function Marker3DThumbnail({ value, src, color, size, className }: {
  value: string; src?: string; color: string; size: number; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    let dispose = () => {};
    if (src) {
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return;
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        recolorMarkerPixels(pixels.data, color);
        context.putImageData(pixels, 0, 0);
      };
      image.src = src;
    } else {
      // Custom GLB uploads have no bundled snapshot, so render their actual model.
      void import('@/components/map/load3DMarker').then(({ create3DMarker }) => create3DMarker(canvas, value)).then(model => {
        if (cancelled) { model.dispose(); return; }
        dispose = () => model.dispose();
        model.render(180, 90, -60, 65, color);
      }).catch(error => console.error('Could not load 3D marker thumbnail', error));
    }
    return () => { cancelled = true; dispose(); };
  }, [value, src, color]);
  return <canvas ref={ref} aria-hidden="true" className={className} style={{ width: size, height: size, display: 'block' }} />;
}
