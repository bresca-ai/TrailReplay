import type { OverlayFont } from '@/types';
import { splitLocationChapterLabel } from '@/utils/locationChapterLabel';
import { overlayFontFamily } from '@/utils/typography';

export function LocationChapterLabel({ label, accent, font }: { label: string; accent: string; font: OverlayFont }) {
  const { flag, name } = splitLocationChapterLabel(label);
  return (
    <div role="status" aria-label={label} data-location-flag={flag} data-location-name={name} data-location-accent={accent}
      className="tr-location-chapter absolute left-1/2 top-[34%] z-20 flex max-w-[90%] -translate-x-1/2 items-center justify-center gap-2.5 text-center text-white [filter:drop-shadow(0_2px_3px_rgba(0,0,0,0.95))_drop-shadow(0_0_9px_rgba(0,0,0,0.85))]"
      style={{ fontFamily: overlayFontFamily(font) }}>
      {flag && <span aria-hidden="true" className="shrink-0 text-2xl leading-none">{flag}</span>}
      {name && <span className="min-w-0 text-xl font-bold leading-tight [overflow-wrap:anywhere]">{name}</span>}
    </div>
  );
}
