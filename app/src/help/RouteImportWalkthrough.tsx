import { useId, useState } from 'react';
import { BookmarkPlus, Check, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { getProviderGuides } from './helpContent';
import { RouteImportBookmarklet } from './RouteImportBookmarklet';

type Method = 'automatic' | 'manual';
type Provider = 'Strava' | 'Wikiloc';

const automaticSteps = ['install', 'openPage', 'clickBookmark', 'useRoute'] as const;

export function RouteImportWalkthrough() {
  const { t } = useI18n();
  const id = useId();
  const [method, setMethod] = useState<Method>('automatic');
  const [provider, setProvider] = useState<Provider>('Strava');
  const guide = getProviderGuides(t).find((item) => item.name === provider);
  const content = 'help.gpxGuide.importer';

  return (
    <section className="rounded-[1.5rem] border border-[var(--trail-orange)]/30 bg-[var(--trail-orange-15)] p-5 shadow-sm sm:p-6" data-testid="route-import-tutorial">
      <span id="strava" className="scroll-mt-24" />
      <span id="wikiloc" className="scroll-mt-24" />
      <div className="mb-5 flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-[var(--trail-orange)]">
          <BookmarkPlus className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--trail-orange)]">{t('help.tutorial.importRouteEyebrow')}</p>
          <h2 className="mt-1 text-xl font-bold">{t('help.tutorial.importRouteTitle')}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--evergreen-80)]">{t(`${content}.intro`)}</p>
        </div>
      </div>

      <div role="tablist" aria-label={t('help.tutorial.importRouteTitle')} className="mb-5 inline-flex rounded-full border border-[var(--evergreen)]/10 bg-white/60 p-1">
        {(['automatic', 'manual'] as const).map((choice) => (
          <button
            key={choice}
            id={`${id}-${choice}-tab`}
            type="button"
            role="tab"
            aria-selected={method === choice}
            aria-controls={`${id}-${choice}-panel`}
            onClick={() => setMethod(choice)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${method === choice ? 'bg-[var(--evergreen)] text-white shadow-sm' : 'text-[var(--evergreen-80)] hover:bg-white/70'}`}
          >
            {t(`${content}.${choice}Tab`)}
          </button>
        ))}
      </div>

      {method === 'automatic' ? (
        <div id={`${id}-automatic-panel`} role="tabpanel" aria-labelledby={`${id}-automatic-tab`}>
          <div className="mb-5"><RouteImportBookmarklet /></div>
          <figure className="mb-5 overflow-hidden rounded-[1.25rem] border border-[var(--evergreen)]/15 bg-white/90">
            <video
              className="aspect-video w-full bg-[var(--evergreen)] object-contain"
              controls
              playsInline
              preload="none"
              poster="/media/images/seo/route-import-bookmark-tutorial-poster.jpg"
              width="1280"
              height="720"
              aria-label={t(`${content}.videoTitle`)}
            >
              <source src="/media/video/route-import-bookmark-tutorial.mp4" type="video/mp4" />
            </video>
            <figcaption className="p-4 sm:p-5">
              <h3 className="text-base font-semibold text-[var(--evergreen)]">{t(`${content}.videoTitle`)}</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--evergreen-60)]">{t(`${content}.videoDescription`)}</p>
            </figcaption>
          </figure>
          <div className="mb-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--evergreen)]/10 bg-white/80 p-4">
              <h3 className="text-sm font-bold text-[var(--evergreen)]">{t(`${content}.barSetupTitle`)}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--evergreen-80)]">{t(`${content}.barSetupBody`)}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--evergreen-60)]">{t(`${content}.barShortcut`)}</p>
            </div>
            <div className="rounded-2xl border border-[var(--evergreen)]/10 bg-white/80 p-4">
              <h3 className="text-sm font-bold text-[var(--evergreen)]">{t(`${content}.hiddenSetupTitle`)}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--evergreen-80)]">{t(`${content}.hiddenSetupBody`)}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--evergreen-60)]">{t(`${content}.hiddenUseBody`)}</p>
            </div>
          </div>
          <ol className="grid gap-3 lg:grid-cols-2">
            {automaticSteps.map((step, index) => (
              <li key={step} className="flex gap-4 rounded-2xl border border-[var(--evergreen)]/10 bg-white/80 px-4 py-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--evergreen)] text-sm font-bold text-white">{index + 1}</div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--evergreen)]">{t(`${content}.steps.${step}.title`)}</h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--evergreen-80)]">{t(`${content}.steps.${step}.body`)}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="flex items-start gap-3 rounded-2xl border border-[var(--evergreen)]/10 bg-white/80 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--evergreen)]" />
              <p className="text-sm leading-6 text-[var(--evergreen-80)]">{t(`${content}.privacyNote`)}</p>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-[var(--evergreen)]/10 bg-white/80 p-4">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-[var(--evergreen)]" />
              <p className="text-sm leading-6 text-[var(--evergreen-80)]">{t(`${content}.requirements`)}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--evergreen)]/10 bg-white/70 p-4">
            <p className="text-sm font-medium text-[var(--evergreen-80)]">{t(`${content}.bottomCta`)}</p>
            <RouteImportBookmarklet placement="bottom" />
          </div>
        </div>
      ) : (
        <div id={`${id}-manual-panel`} role="tabpanel" aria-labelledby={`${id}-manual-tab`}>
          <p className="mb-4 text-sm leading-6 text-[var(--evergreen-80)]">{t(`${content}.manualIntro`)}</p>
          <div role="tablist" aria-label={t(`${content}.manualTab`)} className="mb-5 inline-flex rounded-full border border-[var(--evergreen)]/10 bg-white/60 p-1">
            {(['Strava', 'Wikiloc'] as const).map((choice) => (
              <button
                key={choice}
                id={`${id}-${choice}-tab`}
                type="button"
                role="tab"
                aria-selected={provider === choice}
                aria-controls={`${id}-provider-panel`}
                onClick={() => setProvider(choice)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${provider === choice ? 'bg-[var(--evergreen)] text-white shadow-sm' : 'text-[var(--evergreen-80)] hover:bg-white/70'}`}
              >
                {choice}
              </button>
            ))}
          </div>
          <div id={`${id}-provider-panel`} role="tabpanel" aria-labelledby={`${id}-${provider}-tab`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--evergreen-80)]">{guide?.subtitle}</p>
              <a href={guide?.siteHref} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[var(--trail-orange)] hover:underline">
                {t('help.gpxGuide.openProvider', { provider })}
              </a>
            </div>
            <ol className="space-y-3">
              {guide?.steps.map((step, index) => (
                <li key={step} className="flex gap-4 rounded-2xl border border-[var(--evergreen)]/10 bg-white/80 px-4 py-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--evergreen)] text-sm font-bold text-white">{index + 1}</div>
                  <p className="text-sm leading-6 text-[var(--evergreen-80)]">{step}</p>
                </li>
              ))}
            </ol>
            <ul className="mt-4 space-y-2 rounded-2xl border border-[var(--evergreen)]/10 bg-white/80 p-4">
              {guide?.notes.map((note) => <li key={note} className="text-sm leading-6 text-[var(--evergreen-80)]">{note}</li>)}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
