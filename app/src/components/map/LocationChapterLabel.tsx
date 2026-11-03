import type { OverlayFont } from '@/types';
import { splitLocationChapterLabel } from '@/utils/locationChapterLabel';
import { overlayFontFamily } from '@/utils/typography';

export function LocationChapterLabel({ label, accent, font }: { label: string; accent: string; font: OverlayFont }) {
  const { flag, name } = splitLocationChapterLabel(label);
  return (
    <div role="status" aria-label={label} data-location-flag={flag} data-location-name={name} data-location-accent={accent}
      className="tr-location-chapter absolute left-1/2 top-[34%] z-20 flex w-max max-w-[88%] -translate-x-1/2 flex-col items-center text-center text-white [filter:drop-shadow(0_2px_3px_rgba(0,0,0,0.95))_drop-shadow(0_0_9px_rgba(0,0,0,0.85))]"
      style={{ fontFamily: overlayFontFamily(font) }}>
      {flag && <span aria-hidden="true" className="mb-2 text-2xl leading-none">{flag}</span>}
      {name && <span className="max-w-full text-2xl font-bold leading-[1.12] tracking-tight sm:text-3xl [overflow-wrap:anywhere]">{name}</span>}
      <span aria-hidden="true" className="mt-3 h-0.5 w-10 rounded-full" style={{ backgroundColor: accent }} />
    </div>
  );
}
