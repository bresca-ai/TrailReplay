import { BookmarkPlus, Check, Play, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { StravaBookmarklet } from './StravaBookmarklet';

const stepKeys = ['install', 'openActivity', 'clickBookmark', 'useRoute'] as const;

export function StravaImportWalkthrough() {
  const { t } = useI18n();

  return (
    <section
      className="rounded-[1.5rem] border border-[var(--trail-orange)]/30 bg-[var(--trail-orange-15)] p-5 shadow-sm sm:p-6"
      data-testid="strava-bookmarklet-tutorial"
    >
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-[var(--trail-orange)]">
          <BookmarkPlus className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--trail-orange)]">
            {t('help.gpxGuide.providers.strava.bookmarklet.walkthroughLabel')}
          </p>
          <h2 className="mt-1 text-xl font-bold">
            {t('help.gpxGuide.providers.strava.bookmarklet.walkthroughTitle')}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--evergreen-80)]">
            {t('help.gpxGuide.providers.strava.bookmarklet.walkthroughIntro')}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div>
          <ol className="space-y-3">
            {stepKeys.map((key, index) => (
              <li key={key} className="flex gap-4 rounded-2xl border border-[var(--evergreen)]/10 bg-white/80 px-4 py-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--evergreen)] text-sm font-bold text-white">
                  {index + 1}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--evergreen)]">
                    {t(`help.gpxGuide.providers.strava.bookmarklet.steps.${key}.title`)}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--evergreen-80)]">
                    {t(`help.gpxGuide.providers.strava.bookmarklet.steps.${key}.body`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-4 rounded-2xl border border-[var(--evergreen)]/10 bg-white/80 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--evergreen)]" />
              <p className="text-sm leading-6 text-[var(--evergreen-80)]">
                {t('help.gpxGuide.providers.strava.bookmarklet.privacyNote')}
              </p>
            </div>
          </div>
        </div>

        <div>
          <figure className="overflow-hidden rounded-[1.25rem] border border-[var(--evergreen)]/15 bg-white/90">
            {/* Replace this 16:9 placeholder with the finished video at /media/video/strava-bookmarklet-tutorial.mp4. */}
            <div
              className="flex aspect-video items-center justify-center bg-[linear-gradient(145deg,var(--evergreen),#314936)] px-6 text-center text-white"
              role="img"
              aria-label={t('help.gpxGuide.providers.strava.bookmarklet.videoPlaceholder')}
            >
              <div>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/25 bg-white/10">
                  <Play className="ml-1 h-6 w-6 fill-current" />
                </div>
                <p className="mt-4 text-sm font-semibold">
                  {t('help.gpxGuide.providers.strava.bookmarklet.videoPlaceholder')}
                </p>
              </div>
            </div>
            <figcaption className="p-4">
              <h3 className="text-base font-semibold text-[var(--evergreen)]">
                {t('help.gpxGuide.providers.strava.bookmarklet.videoTitle')}
              </h3>
              <p className="mt-1 text-sm leading-6 text-[var(--evergreen-60)]">
                {t('help.gpxGuide.providers.strava.bookmarklet.videoDescription')}
              </p>
            </figcaption>
          </figure>

          <div className="mt-4 rounded-[1.25rem] border border-[var(--evergreen)]/10 bg-white/80 p-4">
            <div className="flex items-start gap-3">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-[var(--evergreen)]" />
              <p className="text-sm leading-6 text-[var(--evergreen-80)]">
                {t('help.gpxGuide.providers.strava.bookmarklet.requirements')}
              </p>
            </div>
          </div>
        </div>
      </div>

      <StravaBookmarklet />
    </section>
  );
}
