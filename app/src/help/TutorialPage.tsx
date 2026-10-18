import {
  Bot,
  BookOpen,
  Camera,
  ChartNoAxesCombined,
  Download,
  Eye,
  Film,
  ImageIcon,
  LocateFixed,
  MapPin,
  Mountain,
  MousePointer2,
  Palette,
  Play,
  Route,
  TimerReset,
} from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { HelpLayout } from './HelpLayout';
import { getQuickStartSteps, getSampleTracks, getTutorialFeatures, getTutorialVideos } from './helpContent';
import { trackEvent } from '@/utils/analytics';

const featureIcons = [MapPin, TimerReset, Palette, Mountain, ImageIcon, Film];

export function TutorialPage() {
  const { t } = useI18n();
  const quickStartSteps = getQuickStartSteps(t);
  const sampleTracks = getSampleTracks(t);
  const tutorialFeatures = getTutorialFeatures(t);
  const tutorialVideos = getTutorialVideos(t);
  const cameraModes = [
    { key: 'overview', icon: Eye, featured: false },
    { key: 'follow', icon: LocateFixed, featured: false },
    { key: 'followBehind', icon: Route, featured: false },
    { key: 'cinematic', icon: Film, featured: true },
  ] as const;
  const elevationTips = [
    { key: 'enable', icon: Eye },
    { key: 'play', icon: Play },
    { key: 'edit', icon: MousePointer2 },
  ] as const;

  return (
    <HelpLayout
      eyebrow={t('help.tutorial.eyebrow')}
      title={t('help.tutorial.title')}
      description={t('help.tutorial.description')}
      headerActions={[
        {
          href: '/agents',
          icon: <Bot className="h-3.5 w-3.5" />,
          label: t('help.tutorial.agentsAction'),
          tone: 'ghost',
        },
        {
          href: '/gpx-download-guide',
          icon: <Download className="h-3.5 w-3.5" />,
          label: t('help.tutorial.headerAction'),
          tone: 'solid',
        },
      ]}
    >
      <section className="grid items-start gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-[1.5rem] border border-[var(--evergreen)]/12 bg-white/80 p-6 shadow-sm">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--trail-orange-15)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--trail-orange)]">
            <BookOpen className="h-4 w-4" />
            {t('help.tutorial.quickStart.badge')}
          </div>
          <ol className="space-y-3">
            {quickStartSteps.map((step, index) => (
              <li key={step} className="flex gap-4 rounded-2xl border border-[var(--evergreen)]/10 bg-[var(--canvas)] px-4 py-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--evergreen)] text-sm font-bold text-[var(--canvas)]">
                  {index + 1}
                </div>
                <p className="text-sm leading-6 text-[var(--evergreen-80)]">{step}</p>
              </li>
            ))}
          </ol>
        </article>

        <aside className="rounded-[1.5rem] border border-[var(--evergreen)]/15 bg-[linear-gradient(160deg,var(--evergreen),#223428)] p-6 text-[var(--canvas)] shadow-sm">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/80">
            <Download className="h-4 w-4" />
            {t('help.tutorial.sampleRoutesBadge')}
          </div>
          <div className="space-y-3">
            {sampleTracks.map((track) => (
              <a
                key={track.href}
                href={track.href}
                download
                className="block rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-4 transition-colors hover:bg-white/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">
                      {track.badge}
                    </div>
                    <h3 className="mt-3 text-sm font-semibold leading-5 text-white">{track.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-white/72">{track.subtitle}</p>
                    <p className="mt-3 text-xs leading-5 text-white/65">{track.highlight}</p>
                  </div>
                  <Download className="mt-1 h-4 w-4 shrink-0 text-[var(--trail-orange)]" />
                </div>
              </a>
            ))}
          </div>
          <a
            href="/gpx-download-guide"
            onClick={() => trackEvent('help_cta_clicked', {
              cta_location: 'tutorial',
              target_page: 'gpx_guide',
            })}
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--trail-orange)] hover:underline"
          >
            {t('help.tutorial.needGpxGuide')}
          </a>
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[1.5rem] border border-[var(--evergreen)]/15 bg-white/75 p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--trail-orange-15)] text-[var(--trail-orange)]">
              <Route className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{t('help.tutorial.whyFilesTitle')}</h2>
              <p className="text-sm text-[var(--evergreen-60)]">{t('help.tutorial.whyFilesBody')}</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {sampleTracks.map((track) => (
              <article key={track.title} className="rounded-[1.25rem] border border-[var(--evergreen)]/10 bg-[var(--canvas)] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--trail-orange)]">{track.badge}</p>
                <h3 className="mt-2 text-base font-semibold">{track.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--evergreen-80)]">{track.highlight}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="rounded-[1.5rem] border border-[var(--evergreen)]/15 bg-[var(--trail-orange-15)] p-6 shadow-sm">
          <h2 className="text-xl font-bold">{t('help.tutorial.bestFirstPassTitle')}</h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-[1.15rem] border border-[var(--evergreen)]/10 bg-white/80 p-4">
              <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--trail-orange)]">{t('help.tutorial.caminsUseLabel')}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--evergreen-80)]">{t('help.tutorial.caminsUseBody')}</p>
            </div>
            <div className="rounded-[1.15rem] border border-[var(--evergreen)]/10 bg-white/80 p-4">
              <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--trail-orange)]">{t('help.tutorial.pedalsUseLabel')}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--evergreen-80)]">{t('help.tutorial.pedalsUseBody')}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--evergreen)]/15 bg-white/80 p-5 shadow-sm sm:p-6" data-testid="camera-modes-tutorial">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--trail-orange-15)] text-[var(--trail-orange)]">
            <Camera className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{t('help.tutorial.camera.title')}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--evergreen-60)]">{t('help.tutorial.camera.description')}</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="grid gap-3 sm:grid-cols-2">
            {cameraModes.map(({ key, icon: Icon, featured }) => (
              <article
                key={key}
                className={`rounded-[1.15rem] border p-4 ${featured
                  ? 'border-[var(--trail-orange)]/55 bg-[var(--trail-orange-15)]'
                  : 'border-[var(--evergreen)]/10 bg-[var(--canvas)]'}`}
              >
                <Icon className={`h-5 w-5 ${featured ? 'text-[var(--trail-orange)]' : 'text-[var(--evergreen)]'}`} />
                <h3 className="mt-3 text-sm font-bold">{t(`help.tutorial.camera.modes.${key}.title`)}</h3>
                <p className="mt-1 text-xs leading-5 text-[var(--evergreen-60)]">{t(`help.tutorial.camera.modes.${key}.body`)}</p>
              </article>
            ))}
          </div>

          <figure className="overflow-hidden rounded-[1.25rem] border border-[var(--evergreen)]/12 bg-[var(--canvas)]">
            <video
              controls
              playsInline
              preload="metadata"
              poster="/media/images/seo/cinematic-camera-tutorial-poster.jpg"
              className="aspect-video w-full bg-[#17251d] object-cover"
              aria-label={t('help.tutorial.camera.videoLabel')}
            >
              <source src="/media/video/cinematic-camera-tutorial.webm" type="video/webm" />
              <source src="/media/video/cinematic-camera-tutorial.mp4" type="video/mp4" />
            </video>
            <figcaption className="p-4 sm:p-5">
              <h3 className="text-base font-semibold">{t('help.tutorial.camera.videoTitle')}</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--evergreen-60)]">{t('help.tutorial.camera.videoDescription')}</p>
              <a
                href="/media/video/cinematic-camera-tutorial.mp4"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--trail-orange)] hover:underline"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                {t('help.tutorial.camera.openVideo')}
              </a>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--evergreen)]/15 bg-white/80 p-5 shadow-sm sm:p-6" data-testid="elevation-profile-tutorial">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--trail-orange-15)] text-[var(--trail-orange)]">
            <ChartNoAxesCombined className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{t('help.tutorial.elevation.title')}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--evergreen-60)]">{t('help.tutorial.elevation.description')}</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-[1.25rem] border border-[var(--evergreen)]/12 bg-[var(--canvas)] p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-bold">{t('help.tutorial.elevation.default.title')}</h3>
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--evergreen-60)]">
                {t('help.tutorial.elevation.default.badge')}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--evergreen-60)]">{t('help.tutorial.elevation.default.body')}</p>
            <div className="mt-5 overflow-hidden rounded-xl border border-[var(--evergreen)]/10 bg-[#17251d] p-4" aria-hidden="true">
              <svg viewBox="0 0 600 150" className="h-auto w-full" role="img">
                <defs>
                  <linearGradient id="whole-profile-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f07b55" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#f07b55" stopOpacity="0.04" />
                  </linearGradient>
                </defs>
                <path d="M0 133 L0 116 L45 110 L85 92 L120 101 L160 58 L198 36 L233 72 L273 87 L312 42 L350 65 L388 112 L430 102 L470 68 L510 82 L552 47 L600 75 L600 133 Z" fill="url(#whole-profile-fill)" />
                <path d="M0 116 L45 110 L85 92 L120 101 L160 58 L198 36 L233 72 L273 87 L312 42 L350 65 L388 112 L430 102 L470 68 L510 82 L552 47 L600 75" fill="none" stroke="#f3b133" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="255" y1="20" x2="255" y2="133" stroke="#ffffff" strokeWidth="2" strokeDasharray="5 6" opacity="0.8" />
                <circle cx="255" cy="82" r="6" fill="#ffffff" stroke="#f07b55" strokeWidth="3" />
                <line x1="0" y1="133" x2="600" y2="133" stroke="#ffffff" opacity="0.22" />
              </svg>
            </div>
          </article>

          <article className="rounded-[1.25rem] border border-[var(--trail-orange)]/45 bg-[var(--trail-orange-15)] p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-bold">{t('help.tutorial.elevation.dynamic.title')}</h3>
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--trail-orange)]">
                {t('help.tutorial.elevation.dynamic.badge')}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--evergreen-80)]">{t('help.tutorial.elevation.dynamic.body')}</p>
            <div className="mt-5 overflow-hidden rounded-xl border border-[var(--evergreen)]/10 bg-[#17251d] p-4" aria-hidden="true">
              <svg viewBox="0 0 600 150" className="h-auto w-full" role="img">
                <defs>
                  <linearGradient id="focus-profile-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f07b55" stopOpacity="0.62" />
                    <stop offset="100%" stopColor="#f07b55" stopOpacity="0.04" />
                  </linearGradient>
                </defs>
                <path d="M0 133 L0 122 L58 117 L112 104 L170 84 L228 56 L282 29 L332 47 L382 70 L438 101 L498 115 L550 108 L600 98 L600 133 Z" fill="url(#focus-profile-fill)" />
                <path d="M0 122 L58 117 L112 104 L170 84 L228 56 L282 29 L332 47 L382 70 L438 101 L498 115 L550 108 L600 98" fill="none" stroke="#f3b133" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="115" y1="13" x2="485" y2="13" stroke="#f07b55" strokeWidth="5" strokeLinecap="round" />
                <circle cx="115" cy="13" r="8" fill="#f07b55" stroke="#ffffff" strokeWidth="3" />
                <circle cx="485" cy="13" r="8" fill="#f07b55" stroke="#ffffff" strokeWidth="3" />
                <line x1="304" y1="23" x2="304" y2="133" stroke="#ffffff" strokeWidth="2" strokeDasharray="5 6" opacity="0.8" />
                <circle cx="304" cy="37" r="6" fill="#ffffff" stroke="#f07b55" strokeWidth="3" />
                <line x1="0" y1="133" x2="600" y2="133" stroke="#ffffff" opacity="0.22" />
              </svg>
            </div>
          </article>
        </div>

        <div className="mt-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--evergreen-60)]">
            {t('help.tutorial.elevation.howToTitle')}
          </p>
          <ol className="grid gap-3 lg:grid-cols-3">
            {elevationTips.map(({ key, icon: Icon }, index) => (
              <li key={key} className="flex gap-4 rounded-[1.15rem] border border-[var(--evergreen)]/10 bg-[var(--canvas)] p-4">
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--evergreen)] text-[var(--canvas)]">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-[var(--trail-orange)] text-[9px] font-bold text-white">{index + 1}</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold">{t(`help.tutorial.elevation.tips.${key}.title`)}</h3>
                  <p className="mt-1 text-xs leading-5 text-[var(--evergreen-60)]">{t(`help.tutorial.elevation.tips.${key}.body`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--evergreen)]/15 bg-white/75 p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--trail-orange-15)] text-[var(--trail-orange)]">
            <Film className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{t('help.tutorial.watchExportsTitle')}</h2>
            <p className="text-sm text-[var(--evergreen-60)]">{t('help.tutorial.watchExportsBody')}</p>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {tutorialVideos.map((video) => (
            <figure key={video.src} className="flex h-full flex-col rounded-[1.25rem] border border-[var(--evergreen)]/10 bg-[var(--canvas)] p-4">
              <video controls preload="none" poster={video.poster} className="aspect-video w-full rounded-xl border border-[var(--evergreen)]/15 bg-black/80">
                <source src={video.src} type="video/mp4" />
              </video>
              <figcaption className="mt-4 flex flex-1 flex-col">
                <h3 className="text-base font-semibold">{video.title}</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--evergreen-60)]">{video.description}</p>
                <a href={video.src} download className="mt-auto inline-flex items-center gap-2 pt-3 text-sm font-semibold text-[var(--trail-orange)] hover:underline">
                  <Download className="h-4 w-4" />
                  {video.downloadLabel}
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--evergreen)]/15 bg-white/75 p-6 shadow-sm">
        <h2 className="text-xl font-bold">{t('help.tutorial.coversTitle')}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--evergreen-60)]">{t('help.tutorial.coversDescription')}</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tutorialFeatures.map((feature, index) => {
            const Icon = featureIcons[index];
            return (
              <article key={feature.title} className="rounded-[1.25rem] border border-[var(--evergreen)]/10 bg-[var(--trail-orange-15)] p-5">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--canvas)] text-[var(--trail-orange)]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--evergreen-80)]">{feature.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--evergreen)]/15 bg-[linear-gradient(160deg,var(--evergreen),#233427)] p-6 text-[var(--canvas)] shadow-sm">
        <h2 className="text-xl font-bold">{t('help.tutorial.recommendedFirstRunTitle')}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-white/60">{t('help.tutorial.firstRun.importLabel')}</p>
            <p className="mt-2 text-sm leading-6 text-white/85">{t('help.tutorial.firstRun.importBody')}</p>
          </div>
          <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-white/60">{t('help.tutorial.firstRun.styleLabel')}</p>
            <p className="mt-2 text-sm leading-6 text-white/85">{t('help.tutorial.firstRun.styleBody')}</p>
          </div>
          <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-white/60">{t('help.tutorial.firstRun.exportLabel')}</p>
            <p className="mt-2 text-sm leading-6 text-white/85">{t('help.tutorial.firstRun.exportBody')}</p>
          </div>
        </div>
      </section>
    </HelpLayout>
  );
}
