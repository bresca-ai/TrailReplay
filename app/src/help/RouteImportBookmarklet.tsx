import { useEffect, useRef, useState } from 'react';
import { BookmarkPlus, Copy } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { createRouteImportBookmarkletHref } from '@/utils/routeImportBookmarklet';

export function RouteImportBookmarklet({ placement = 'top' }: { placement?: 'top' | 'bottom' }) {
  const { t } = useI18n();
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (linkRef.current) linkRef.current.href = createRouteImportBookmarkletHref(window.location.origin);
  }, []);

  const copyBookmarklet = () => {
    const bookmarklet = linkRef.current?.href;
    if (!bookmarklet || !navigator.clipboard?.writeText) {
      setCopied(false);
      return;
    }
    void navigator.clipboard.writeText(bookmarklet).then(() => setCopied(true)).catch(() => setCopied(false));
  };

  return (
    <div className={placement === 'top' ? 'rounded-2xl border border-[var(--trail-orange)]/25 bg-white/80 p-4' : 'flex justify-end'}>
      <div className={placement === 'top' ? 'flex items-start gap-3' : ''}>
        {placement === 'top' && <BookmarkPlus className="mt-0.5 h-5 w-5 shrink-0 text-[var(--trail-orange)]" />}
        <div>
          {placement === 'top' && (
            <>
              <h3 className="text-base font-bold">{t('help.gpxGuide.importer.title')}</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--evergreen-80)]">
                {t('help.gpxGuide.importer.description')}
              </p>
            </>
          )}
          <div className={placement === 'top' ? 'mt-4 flex flex-wrap items-center gap-3' : ''}>
            <a
              ref={linkRef}
              draggable="true"
              onClick={(event) => {
                event.preventDefault();
                copyBookmarklet();
              }}
              className="tr-btn tr-btn-primary inline-flex cursor-grab items-center gap-2"
              aria-label={t('help.gpxGuide.importer.dragLabel')}
              title={t('help.gpxGuide.importer.dragLabel')}
            >
              <BookmarkPlus className="h-4 w-4" />
              {t('help.gpxGuide.importer.button')}
            </a>
            {placement === 'top' && (
              <button type="button" onClick={copyBookmarklet} className="tr-btn tr-btn-secondary inline-flex items-center gap-2 text-sm">
                <Copy className="h-4 w-4" />
                {t('help.gpxGuide.importer.copyButton')}
              </button>
            )}
          </div>
          {placement === 'top' && (
            <p className="mt-3 text-xs leading-5 text-[var(--evergreen-60)]" aria-live="polite">
              {copied ? t('help.gpxGuide.importer.copied') : t('help.gpxGuide.importer.copyHint')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
