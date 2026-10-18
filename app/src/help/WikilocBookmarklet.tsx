import { useEffect, useRef, useState } from 'react';
import { BookmarkPlus } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { createWikilocBookmarkletHref } from '@/utils/wikilocBookmarklet';

export function WikilocBookmarklet({ placement = 'top' }: { placement?: 'top' | 'bottom' }) {
  const { t } = useI18n();
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (linkRef.current) linkRef.current.href = createWikilocBookmarkletHref(window.location.origin);
  }, []);

  return (
    <div className={placement === 'top' ? 'rounded-2xl border border-[var(--trail-orange)]/25 bg-white/80 p-4' : 'flex justify-end'}>
      <div className={placement === 'top' ? 'flex items-start gap-3' : ''}>
        {placement === 'top' && <BookmarkPlus className="mt-0.5 h-5 w-5 shrink-0 text-[var(--trail-orange)]" />}
        <div>
          {placement === 'top' && (
            <>
              <h3 className="text-base font-bold">{t('help.gpxGuide.providers.wikiloc.bookmarklet.title')}</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--evergreen-80)]">
                {t('help.gpxGuide.providers.wikiloc.bookmarklet.description')}
              </p>
            </>
          )}
          <a
            ref={linkRef}
            draggable="true"
            onClick={(event) => {
              event.preventDefault();
              const bookmarklet = linkRef.current?.href;
              if (!bookmarklet || !navigator.clipboard?.writeText) {
                setCopied(false);
                return;
              }
              void navigator.clipboard.writeText(bookmarklet).then(() => setCopied(true)).catch(() => setCopied(false));
            }}
            className="tr-btn tr-btn-primary inline-flex cursor-grab items-center gap-2"
            aria-label={t('help.gpxGuide.providers.wikiloc.bookmarklet.dragLabel')}
            title={t('help.gpxGuide.providers.wikiloc.bookmarklet.dragLabel')}
          >
            <BookmarkPlus className="h-4 w-4" />
            {t('help.gpxGuide.providers.wikiloc.bookmarklet.button')}
          </a>
          {placement === 'top' && (
            <p className="mt-3 text-xs leading-5 text-[var(--evergreen-60)]" aria-live="polite">
              {copied
                ? t('help.gpxGuide.providers.wikiloc.bookmarklet.copied')
                : t('help.gpxGuide.providers.wikiloc.bookmarklet.copyHint')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
