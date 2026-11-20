import type { CropPreviewMetrics } from '@/utils/crop';

// This guide is pointer-transparent, so video overlays remain draggable.
export function ReelsOverlayPreview({ frame, ratio }: { frame: CropPreviewMetrics; ratio: '9:16' | '4:5' }) {
  return (
    <div aria-hidden="true" data-reels-preview className="pointer-events-none absolute z-40 overflow-hidden" style={{ left: frame.frameLeft, top: frame.frameTop, width: frame.frameWidth, height: frame.frameHeight }}>
      <svg viewBox={ratio === '4:5' ? '0 95 360 450' : '0 0 360 640'} preserveAspectRatio="none" width="100%" height="100%" style={{ display: 'block', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.8))' }}>
        <defs><linearGradient id="reels-top" x2="0" y2="1"><stop stopColor="#000" stopOpacity=".55"/><stop offset="1" stopColor="#000" stopOpacity="0"/></linearGradient><linearGradient id="reels-bottom" x2="0" y2="1"><stop stopColor="#000" stopOpacity="0"/><stop offset="1" stopColor="#000" stopOpacity=".65"/></linearGradient></defs>
        <path fill="url(#reels-top)" d="M0 0h360v90H0z"/><path fill="url(#reels-bottom)" d="M0 490h360v150H0z"/>
        <g fill="white" fontFamily="Arial, sans-serif"><text x="20" y="26" fontSize="13" fontWeight="bold">9:41</text><text x="286" y="26" fontSize="13">● ▰</text><text x="20" y="65" fontSize="20" fontWeight="bold">Reels</text><text x="92" y="65" fontSize="18" opacity=".7">Friends</text>
          <text x="20" y="570" fontSize="14" fontWeight="bold">●  your_username</text><text x="155" y="570" fontSize="12">Follow</text><text x="20" y="596" fontSize="13">Your caption appears here…</text><text x="20" y="619" fontSize="12">♫  Original audio</text>
        </g>
        <g fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M327 433c-16-10-11-20-5-20 3 0 5 2 5 4 2-3 4-4 7-4 7 0 10 10-7 20z"/><path d="M316 465a11 11 0 1 1 5 9l-5 2 1-6"/><path d="M316 506l23-10-7 22-5-8-11-4zm11 4 12-14"/><rect x="318" y="534" width="18" height="18" rx="4"/></g>
        <g fill="white" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="10"><text x="327" y="449">123</text><text x="327" y="488">12</text><text x="327" y="529">Share</text></g>
      </svg>
    </div>
  );
}
