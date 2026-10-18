import { BookOpen, Download, FileCode2, Globe2, MapPinned } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { HelpLayout } from './HelpLayout';
import { getGpxTips, getOtherProviders, getProviderGuides } from './helpContent';
import { trackEvent } from '@/utils/analytics';
import { StravaImportWalkthrough } from './StravaImportWalkthrough';
import { WikilocImportWalkthrough } from './WikilocImportWalkthrough';

export function GpxDownloadGuidePage() {
  const { t } = useI18n();
  const gpxTips = getGpxTips(t);
  const otherProviders = getOtherProviders(t);
  const providerGuides = getProviderGuides(t);

  return (
    <HelpLayout
      eyebrow={t('help.gpxGuide.eyebrow')}
      title={t('help.gpxGuide.title')}
      description={t('help.gpxGuide.description')}
      headerActions={[
        {
          href: '/tutorial',
          icon: <BookOpen className="h-3.5 w-3.5" />,
          label: t('help.gpxGuide.headerAction'),
          tone: 'solid',
        },
      ]}
    >
      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[1.5rem] border border-[var(--evergreen)]/15 bg-[linear-gradient(160deg,var(--evergreen),#24372a)] p-6 text-[var(--canvas)] shadow-sm">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-[var(--trail-orange)]">
            <FileCode2 className="h-5 w-5" />
          </div>
          <h2 className="text-xl font-bold">{t('help.gpxGuide.goodGpxTitle')}</h2>
          <ul className="mt-4 space-y-3">
            {gpxTips.map((tip) => (
              <li key={tip} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white/85">
                {tip}
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-[1.5rem] border border-[var(--evergreen)]/15 bg-white/80 p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--trail-orange-15)] text-[var(--trail-orange)]">
              <MapPinned className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{t('help.gpxGuide.beforeExportTitle')}</h2>
              <p className="text-sm text-[var(--evergreen-60)]">{t('help.gpxGuide.beforeExportBody')}</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[1.25rem] border border-[var(--evergreen)]/10 bg-[var(--canvas)] p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--trail-orange)]">{t('help.gpxGuide.beforeCards.chooseGpxLabel')}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--evergreen-80)]">{t('help.gpxGuide.beforeCards.chooseGpxBody')}</p>
            </div>
            <div className="rounded-[1.25rem] border border-[var(--evergreen)]/10 bg-[var(--canvas)] p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--trail-orange)]">{t('help.gpxGuide.beforeCards.keepTimestampsLabel')}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--evergreen-80)]">{t('help.gpxGuide.beforeCards.keepTimestampsBody')}</p>
            </div>
            <div className="rounded-[1.25rem] border border-[var(--evergreen)]/10 bg-[var(--canvas)] p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--trail-orange)]">{t('help.gpxGuide.beforeCards.fullActivityLabel')}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--evergreen-80)]">{t('help.gpxGuide.beforeCards.fullActivityBody')}</p>
            </div>
            <div className="rounded-[1.25rem] border border-[var(--evergreen)]/10 bg-[var(--canvas)] p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--trail-orange)]">{t('help.gpxGuide.beforeCards.checkPrivacyLabel')}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--evergreen-80)]">{t('help.gpxGuide.beforeCards.checkPrivacyBody')}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--evergreen)]/15 bg-[var(--trail-orange-15)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--trail-orange)]">{t('help.gpxGuide.fastPathBadge')}</p>
            <h2 className="mt-2 text-xl font-bold">{t('help.gpxGuide.fastPathTitle')}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--evergreen-80)]">
              {t('help.gpxGuide.fastPathBody')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="/"
              onClick={() => trackEvent('help_cta_clicked', {
                cta_location: 'gpx_guide',
                target_page: 'app',
              })}
              className="tr-btn tr-btn-primary"
            >
              {t('help.common.openApp')}
            </a>
            <a href="/tutorial" className="tr-btn tr-btn-secondary inline-flex items-center gap-2">
              <Download className="h-4 w-4" />
              {t('help.gpxGuide.openTutorial')}
            </a>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        {providerGuides.map((provider) => (
          <article id={provider.name === 'Strava' ? 'strava' : provider.name === 'Wikiloc' ? 'wikiloc' : undefined} key={provider.name} className="rounded-[1.5rem] border border-[var(--evergreen)]/15 bg-white/80 p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--evergreen)]/15 bg-[var(--trail-orange-15)] text-2xl">
                  {provider.icon}
                </div>
                <div>
                  <h2 className="text-xl font-bold">{provider.name}</h2>
                  <p className="text-sm text-[var(--evergreen-60)]">{provider.subtitle}</p>
                </div>
              </div>
              <a
                href={provider.siteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--trail-orange)] hover:underline"
              >
                {t('help.gpxGuide.openProvider', { provider: provider.name })}
              </a>
            </div>

            {provider.name === 'Strava' ? (
              <div className="mt-6">
                <StravaImportWalkthrough />
              </div>
            ) : provider.name === 'Wikiloc' ? (
              <div className="mt-6">
                <WikilocImportWalkthrough />
              </div>
            ) : (
              <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.72fr]">
                <ol className="space-y-3">
                  {provider.steps.map((step, index) => (
                    <li key={step} className="flex gap-4 rounded-2xl border border-[var(--evergreen)]/10 bg-[var(--canvas)] px-4 py-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--evergreen)] text-sm font-bold text-[var(--canvas)]">
                        {index + 1}
                      </div>
                      <p className="text-sm leading-6 text-[var(--evergreen-80)]">{step}</p>
                    </li>
                  ))}
                </ol>

                <div className="rounded-[1.25rem] border border-[var(--evergreen)]/10 bg-[var(--trail-orange-15)] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--trail-orange)]">{t('help.gpxGuide.notesLabel')}</p>
                  <ul className="mt-3 space-y-3">
                    {provider.notes.map((note) => (
                      <li key={note} className="text-sm leading-6 text-[var(--evergreen-80)]">
                        {note}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </article>
        ))}
      </section>

      <section className="rounded-[1.5rem] border border-[var(--evergreen)]/15 bg-white/80 p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--trail-orange-15)] text-[var(--trail-orange)]">
            <Globe2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{t('help.gpxGuide.otherPlatformsTitle')}</h2>
            <p className="text-sm text-[var(--evergreen-60)]">{t('help.gpxGuide.otherPlatformsBody')}</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {otherProviders.map((provider) => (
            <article key={provider.title} className="rounded-[1.25rem] border border-[var(--evergreen)]/10 bg-[var(--canvas)] p-5">
              <h3 className="text-base font-semibold">{provider.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--evergreen-80)]">{provider.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--evergreen)]/15 bg-[linear-gradient(160deg,var(--evergreen),#233427)] p-6 text-[var(--canvas)] shadow-sm">
        <h2 className="text-xl font-bold">{t('help.gpxGuide.nextStepTitle')}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/85">
          {t('help.gpxGuide.nextStepBody')}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href="/"
            onClick={() => trackEvent('help_cta_clicked', {
              cta_location: 'gpx_guide',
              target_page: 'app',
            })}
            className="tr-btn tr-btn-primary"
          >
            {t('help.common.openApp')}
          </a>
          <a href="/tutorial" className="tr-btn tr-btn-secondary inline-flex items-center gap-2">
            <Download className="h-4 w-4" />
            {t('help.gpxGuide.openTutorial')}
          </a>
        </div>
      </section>
    </HelpLayout>
  );
}
