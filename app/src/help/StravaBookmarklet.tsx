import { useEffect, useRef } from 'react';
import { BookmarkPlus } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { STRAVA_BOOKMARKLET_HREF } from '@/utils/stravaBookmarklet';

export function StravaBookmarklet() {
  const { t } = useI18n();
  const linkRef = useRef<HTMLAnchorElement>(null);

  // React sanitizes javascript: hrefs. Assign it after render so browsers can
  // save this link as a bookmarklet when the user drags it to their bar.
  useEffect(() => {
    if (linkRef.current) linkRef.current.href = STRAVA_BOOKMARKLET_HREF;
  }, []);

  return (
    <div className="mt-5 rounded-2xl border border-[var(--trail-orange)]/25 bg-white/80 p-5">
      <div className="flex items-start gap-3">
        <BookmarkPlus className="mt-0.5 h-5 w-5 shrink-0 text-[var(--trail-orange)]" />
        <div>
          <h3 className="text-base font-bold">{t('help.gpxGuide.providers.strava.bookmarklet.title')}</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--evergreen-80)]">
            {t('help.gpxGuide.providers.strava.bookmarklet.description')}
          </p>
          <a
            ref={linkRef}
            draggable="true"
            className="tr-btn tr-btn-primary mt-4 inline-flex cursor-grab items-center gap-2"
            aria-label={t('help.gpxGuide.providers.strava.bookmarklet.dragLabel')}
          >
            <BookmarkPlus className="h-4 w-4" />
            {t('help.gpxGuide.providers.strava.bookmarklet.button')}
          </a>
          <p className="mt-3 text-xs leading-5 text-[var(--evergreen-60)]">
            {t('help.gpxGuide.providers.strava.bookmarklet.note')}
          </p>
        </div>
      </div>
    </div>
  );
}
