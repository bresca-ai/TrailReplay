import type { ReactNode } from 'react';
import { ArrowLeft, ExternalLink, Sparkles } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { trackEvent } from '@/utils/analytics';

interface HelpHeaderAction {
  href: string;
  icon: ReactNode;
  label: string;
  tone?: 'ghost' | 'solid';
}

interface HelpLayoutProps {
  eyebrow: string;
  title: string;
  description: string;
  headerActions?: HelpHeaderAction[];
  children: ReactNode;
}

export function HelpLayout({ eyebrow, title, description, headerActions = [], children }: HelpLayoutProps) {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(193,101,47,0.16),transparent_32%),linear-gradient(180deg,#f8f4ee_0%,#fcfaf6_42%,#f3ede2_100%)] text-[var(--evergreen)]">
      <header className="sticky top-0 z-20 border-b border-[var(--evergreen)] bg-[var(--evergreen)] text-[var(--canvas)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] shadow-sm transition-colors hover:border-white/18 hover:bg-black/20"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('help.common.backToApp')}
          </a>
          {headerActions.length > 0 && (
            <div className="hidden items-center gap-2 md:flex">
              {headerActions.map((action) => (
                <HeaderAction key={action.href} {...action} />
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <img src="/media/images/simplelogo.png" alt="TrailReplay" className="h-9 w-9 rounded-md bg-white p-1 shadow-sm ring-1 ring-white/10" />
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/60">{eyebrow}</div>
              <div className="text-sm font-bold text-[var(--canvas)]">TrailReplay</div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:py-14">
        <section className="relative overflow-hidden rounded-[2rem] border border-[var(--evergreen)]/12 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(255,246,238,0.94))] px-6 py-8 shadow-[0_30px_90px_rgba(27,42,32,0.1)] sm:px-8 sm:py-10">
          <div className="absolute right-[-3rem] top-[-4rem] h-40 w-40 rounded-full bg-[var(--trail-orange)]/10 blur-3xl" />
          <div className="absolute bottom-[-3rem] left-[-2rem] h-32 w-32 rounded-full bg-[var(--evergreen)]/8 blur-3xl" />
          <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--trail-orange)]/20 bg-[var(--trail-orange-15)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--trail-orange)]">
                <Sparkles className="h-3.5 w-3.5" />
                {eyebrow}
              </div>
              <h1 className="max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--evergreen-80)] sm:text-base">
                {description}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="/"
                  onClick={() => trackEvent('help_cta_clicked', {
                    cta_location: 'help_page',
                    target_page: 'app',
                  })}
                  className="tr-btn tr-btn-primary"
                >
                  {t('help.common.openApp')}
                </a>
                <a
                  href="https://github.com/bresca-ai/TrailReplay"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tr-btn tr-btn-secondary inline-flex items-center gap-2"
                >
                  {t('help.common.github')}
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <HeroStat
                label={t('help.common.builtForLabel')}
                value={t('help.common.builtForValue')}
                body={t('help.common.builtForBody')}
              />
              <HeroStat
                label={t('help.common.bestWithLabel')}
                value={t('help.common.bestWithValue')}
                body={t('help.common.bestWithBody')}
              />
            </div>
          </div>
        </section>

        {children}

        <section className="border-t border-[var(--evergreen)]/12 pt-8">
          <h2 className="text-lg font-bold">Create your route video</h2>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-sm">
            <a href="/gpx-animation" className="font-semibold text-[var(--trail-orange)] hover:underline">GPX animation</a>
            <a href="/strava-to-video" className="font-semibold text-[var(--trail-orange)] hover:underline">Strava to video</a>
            <a href="/garmin-to-video" className="font-semibold text-[var(--trail-orange)] hover:underline">Garmin to video</a>
            <a href="/cycling-route-animation" className="font-semibold text-[var(--trail-orange)] hover:underline">Cycling animation</a>
            <a href="/running-route-animation" className="font-semibold text-[var(--trail-orange)] hover:underline">Running animation</a>
          </div>
        </section>

        <footer className="border-t border-[var(--evergreen)]/12 pt-6 text-xs text-[var(--evergreen-60)]">
          <a
            href="https://bresca.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold hover:text-[var(--trail-orange)] hover:underline"
          >
            {t('help.common.builtBy')}
          </a>
        </footer>
      </main>
    </div>
  );
}

function HeaderAction({ href, icon, label, tone = 'ghost' }: HelpHeaderAction) {
  const className = tone === 'solid'
    ? 'border-white/18 bg-[var(--trail-orange)] text-[var(--canvas)] hover:border-white/28 hover:bg-[var(--trail-orange)]/90'
    : 'border-white/10 bg-black/10 text-[var(--canvas)] hover:border-white/18 hover:bg-black/20 hover:text-white';

  return (
    <a
      href={href}
      onClick={() => trackEvent('help_cta_clicked', {
        cta_location: 'help_page',
        target_page: href.includes('gpx-download-guide') ? 'gpx_guide' : 'tutorial',
      })}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition-colors ${className}`}
    >
      {icon}
      {label}
    </a>
  );
}

function HeroStat({ label, value, body }: { label: string; value: string; body: string }) {
  return (
    <article className="rounded-[1.35rem] border border-[var(--evergreen)]/10 bg-white/85 p-4 shadow-sm">
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--trail-orange)]">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
      <p className="mt-1 text-sm leading-6 text-[var(--evergreen-60)]">{body}</p>
    </article>
  );
}
