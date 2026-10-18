import { useState } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { StravaImportWalkthrough } from './StravaImportWalkthrough';
import { WikilocImportWalkthrough } from './WikilocImportWalkthrough';

type RouteSource = 'strava' | 'wikiloc';

export function RouteImportTutorial() {
  const { t } = useI18n();
  const [source, setSource] = useState<RouteSource>('strava');

  return (
    <section className="space-y-4" aria-labelledby="route-import-title">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--trail-orange)]">
          {t('help.tutorial.importRouteEyebrow')}
        </p>
        <h2 id="route-import-title" className="mt-1 text-2xl font-bold text-[var(--evergreen)]">
          {t('help.tutorial.importRouteTitle')}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--evergreen-80)]">
          {t('help.tutorial.importRouteIntro')}
        </p>
      </div>

      <div role="tablist" aria-label={t('help.tutorial.importRouteEyebrow')} className="inline-flex rounded-full border border-[var(--evergreen)]/10 bg-white/70 p-1">
        {(['strava', 'wikiloc'] as const).map((provider) => (
          <button
            key={provider}
            id={`route-import-${provider}-tab`}
            type="button"
            role="tab"
            aria-selected={source === provider}
            aria-controls="route-import-provider-panel"
            onClick={() => setSource(provider)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              source === provider
                ? 'bg-[var(--evergreen)] text-white shadow-sm'
                : 'text-[var(--evergreen-80)] hover:bg-white'
            }`}
          >
            {provider === 'strava' ? 'Strava' : 'Wikiloc'}
          </button>
        ))}
      </div>

      <div id="route-import-provider-panel" role="tabpanel" aria-labelledby={`route-import-${source}-tab`}>
        {source === 'strava' ? <StravaImportWalkthrough /> : <WikilocImportWalkthrough />}
      </div>
    </section>
  );
}
