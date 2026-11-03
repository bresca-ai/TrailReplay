import type { OverlayFont } from '@/types';
import { splitLocationChapterLabel } from '@/utils/locationChapterLabel';
import { overlayFontFamily } from '@/utils/typography';

export function LocationChapterLabel({ label, accent, font }: { label: string; accent: string; font: OverlayFont }) {
  const { flag, name } = splitLocationChapterLabel(label);
  return (
    <div role="status" aria-label={label} data-location-flag={flag} data-location-name={name} data-location-accent={accent}
      className="tr-location-chapter absolute left-1/2 top-[34%] z-20 flex max-w-[90%] -translate-x-1/2 items-center gap-2.5 rounded-xl border border-white/15 bg-[rgba(9,14,19,0.9)] py-2 pl-3 pr-4 text-left text-white shadow-[0_12px_32px_rgba(0,0,0,0.32)]"
      style={{ fontFamily: overlayFontFamily(font), borderLeft: `3px solid ${accent}` }}>
      {flag && <span aria-hidden="true" className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 px-1.5 text-xl leading-none">{flag}</span>}
      {flag && name && ' '}
      {name && <span className="min-w-0 text-lg font-bold leading-tight [overflow-wrap:anywhere]">{name}</span>}
    </div>
  );
}
