import { useId, useState } from 'react';
import { BookmarkPlus, Check, Play, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { WikilocBookmarklet } from './WikilocBookmarklet';
import { getProviderGuides } from './helpContent';

const stepKeys = ['install', 'openTrail', 'clickBookmark', 'useRoute'] as const;

export function WikilocImportWalkthrough() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'manual' | 'automatic'>('automatic');
  const tabId = useId();
  const guide = getProviderGuides(t).find((provider) => provider.name === 'Wikiloc');
  const content = 'help.gpxGuide.providers.wikiloc.bookmarklet';

  const renderTab = (tab: 'manual' | 'automatic', label: string) => (
    <button
      id={`${tabId}-${tab}-tab`}
      type="button"
      role="tab"
      aria-selected={activeTab === tab}
      aria-controls={`${tabId}-${tab}-panel`}
      onClick={() => setActiveTab(tab)}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        activeTab === tab
          ? 'bg-[var(--evergreen)] text-white shadow-sm'
          : 'text-[var(--evergreen-80)] hover:bg-white/70'
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="rounded-[1.5rem] border border-[var(--trail-orange)]/30 bg-[var(--trail-orange-15)] p-5 shadow-sm sm:p-6" data-testid="wikiloc-bookmarklet-tutorial">
      <div className="mb-5 flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-[var(--trail-orange)]">
          <BookmarkPlus className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--trail-orange)]">
            {t(`${content}.walkthroughLabel`)}
          </p>
          <h2 className="mt-1 text-xl font-bold">{t(`${content}.walkthroughTitle`)}</h2>
        </div>
      </div>

      <div role="tablist" aria-label={t(`${content}.walkthroughLabel`)} className="mb-5 inline-flex rounded-full border border-[var(--evergreen)]/10 bg-white/60 p-1">
        {renderTab('manual', t(`${content}.manualTab`))}
        {renderTab('automatic', t(`${content}.automaticTab`))}
      </div>

      {activeTab === 'manual' ? (
        <div id={`${tabId}-manual-panel`} role="tabpanel" aria-labelledby={`${tabId}-manual-tab`}>
          <ol className="space-y-3">
            {guide?.steps.map((step, index) => (
              <li key={step} className="flex gap-4 rounded-2xl border border-[var(--evergreen)]/10 bg-white/80 px-4 py-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--evergreen)] text-sm font-bold text-white">
                  {index + 1}
                </div>
                <p className="text-sm leading-6 text-[var(--evergreen-80)]">{step}</p>
              </li>
            ))}
          </ol>
          <div className="mt-4 rounded-2xl border border-[var(--evergreen)]/10 bg-white/80 p-4">
            <p className="text-sm leading-6 text-[var(--evergreen-80)]">{guide?.notes[0]}</p>
          </div>
        </div>
      ) : (
        <div id={`${tabId}-automatic-panel`} role="tabpanel" aria-labelledby={`${tabId}-automatic-tab`}>
          <p className="mb-4 max-w-3xl text-sm leading-6 text-[var(--evergreen-80)]">{t(`${content}.walkthroughIntro`)}</p>
          <div className="mb-5"><WikilocBookmarklet /></div>
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <div>
              <ol className="space-y-3">
                {stepKeys.map((key, index) => (
                  <li key={key} className="flex gap-4 rounded-2xl border border-[var(--evergreen)]/10 bg-white/80 px-4 py-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--evergreen)] text-sm font-bold text-white">{index + 1}</div>
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--evergreen)]">{t(`${content}.steps.${key}.title`)}</h3>
                      <p className="mt-1 text-sm leading-6 text-[var(--evergreen-80)]">{t(`${content}.steps.${key}.body`)}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-4 rounded-2xl border border-[var(--evergreen)]/10 bg-white/80 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--evergreen)]" />
                  <p className="text-sm leading-6 text-[var(--evergreen-80)]">{t(`${content}.privacyNote`)}</p>
                </div>
              </div>
            </div>
            <div>
              <figure className="overflow-hidden rounded-[1.25rem] border border-[var(--evergreen)]/15 bg-white/90">
                {/* Replace this 16:9 placeholder with /media/video/wikiloc-bookmarklet-tutorial.mp4 when ready. */}
                <div className="flex aspect-video items-center justify-center bg-[linear-gradient(145deg,var(--evergreen),#314936)] px-6 text-center text-white" role="img" aria-label={t(`${content}.videoPlaceholder`)}>
                  <div>
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/25 bg-white/10"><Play className="ml-1 h-6 w-6 fill-current" /></div>
                    <p className="mt-4 text-sm font-semibold">{t(`${content}.videoPlaceholder`)}</p>
                  </div>
                </div>
                <figcaption className="p-4">
                  <h3 className="text-base font-semibold text-[var(--evergreen)]">{t(`${content}.videoTitle`)}</h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--evergreen-60)]">{t(`${content}.videoDescription`)}</p>
                </figcaption>
              </figure>
              <div className="mt-4 rounded-[1.25rem] border border-[var(--evergreen)]/10 bg-white/80 p-4">
                <div className="flex items-start gap-3">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-[var(--evergreen)]" />
                  <p className="text-sm leading-6 text-[var(--evergreen-80)]">{t(`${content}.requirements`)}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--evergreen)]/10 bg-white/70 p-4">
            <p className="text-sm font-medium text-[var(--evergreen-80)]">{t(`${content}.bottomCta`)}</p>
            <WikilocBookmarklet placement="bottom" />
          </div>
        </div>
      )}
    </section>
  );
}
