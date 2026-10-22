import { useState } from 'react';
import {
  BookOpen,
  Bot,
  Check,
  ClipboardCopy,
  FolderInput,
  Radar,
  Download,
  SlidersHorizontal,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { HelpLayout } from './HelpLayout';
import { getAgentExamples, getAgentResources, getAgentSources, getAgentSteps } from './helpContent';
import { trackEvent } from '@/utils/analytics';

const stepIcons = [Bot, Wand2, FolderInput];
const cameraPresets = [
  { key: 'far', level: 0 },
  { key: 'medium', level: 33 },
  { key: 'close', level: 66 },
  { key: 'veryClose', level: 100 },
] as const;

/** Copy-to-clipboard that says what it did, since a silent button reads as broken. */
function CopyButton({ text, label, event }: { text: string; label: string; event: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
          trackEvent('agents_copy_clicked', { copy_target: event });
        } catch {
          // Clipboard access can be refused; leaving the text selectable is the
          // fallback, so there is nothing useful to report here.
        }
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--evergreen)]/15 bg-white/80 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--evergreen-80)] transition-colors hover:border-[var(--trail-orange)]/40 hover:text-[var(--trail-orange)]"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
      {copied ? t('help.agents.copied') : label}
    </button>
  );
}

function Recipe({ code }: { code: string }) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-[var(--evergreen)]/12 bg-[var(--evergreen)] text-[13px] text-[var(--canvas)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/55">
          recipe.json
        </span>
        <CopyButton text={code} label={t('help.agents.copy')} event="recipe" />
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono leading-6">{code}</pre>
    </div>
  );
}

export function AgentsPage() {
  const { t } = useI18n();
  const steps = getAgentSteps(t);
  const examples = getAgentExamples(t);
  const resources = getAgentResources(t);
  const sources = getAgentSources(t);
  const prompt = t('help.agents.prompt.body');

  return (
    <HelpLayout
      eyebrow={t('help.agents.eyebrow')}
      title={t('help.agents.title')}
      description={t('help.agents.description')}
      headerActions={[
        {
          href: '/tutorial',
          icon: <BookOpen className="h-3.5 w-3.5" />,
          label: t('help.agents.headerAction'),
          tone: 'ghost',
        },
      ]}
    >
      {/* Three steps, because the whole point is that there are only three. */}
      <section className="grid gap-4 md:grid-cols-3">
        {steps.map((step, index) => {
          const Icon = stepIcons[index] ?? Sparkles;
          return (
            <article
              key={step.title}
              className="rounded-[1.5rem] border border-[var(--evergreen)]/12 bg-white/80 p-6 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--evergreen)] text-[var(--canvas)]">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--trail-orange)]">
                  {t('help.agents.stepLabel', { number: String(index + 1) })}
                </span>
              </div>
              <h2 className="text-base font-bold">{step.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--evergreen-80)]">{step.body}</p>
            </article>
          );
        })}
      </section>

      {/* The single most useful thing on the page: words to paste. */}
      <section className="rounded-[1.5rem] border border-[var(--trail-orange)]/25 bg-[var(--trail-orange-15)] p-6 shadow-sm">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--trail-orange)]">
          <Sparkles className="h-3.5 w-3.5" />
          {t('help.agents.prompt.badge')}
        </div>
        <h2 className="text-lg font-bold">{t('help.agents.prompt.title')}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--evergreen-80)]">
          {t('help.agents.prompt.intro')}
        </p>
        <div className="mt-4 rounded-2xl border border-[var(--evergreen)]/12 bg-white/85">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--evergreen)]/10 px-4 py-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--evergreen-60)]">
              {t('help.agents.prompt.label')}
            </span>
            <CopyButton text={prompt} label={t('help.agents.copy')} event="prompt" />
          </div>
          <p className="px-4 py-3 font-mono text-[13px] leading-6 text-[var(--evergreen)]">
            {prompt}
          </p>
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--evergreen-60)]">
          {t('help.agents.prompt.note')}
        </p>
      </section>

      <section
        className="rounded-[1.5rem] border border-[var(--evergreen)]/15 bg-white/80 p-6 shadow-sm"
        data-testid="agent-camera-values"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--trail-orange-15)] text-[var(--trail-orange)]">
            <SlidersHorizontal className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{t('help.agents.camera.title')}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--evergreen-80)]">
              {t('help.agents.camera.description')}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="overflow-hidden rounded-2xl border border-[var(--evergreen)]/12 bg-[var(--canvas)]">
            <table className="w-full border-collapse text-left">
              <thead className="bg-[var(--evergreen)] text-[var(--canvas)]">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">{t('help.agents.camera.table.preset')}</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">{t('help.agents.camera.table.value')}</th>
                  <th className="hidden px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] sm:table-cell">{t('help.agents.camera.table.result')}</th>
                </tr>
              </thead>
              <tbody>
                {cameraPresets.map(({ key, level }) => (
                  <tr key={key} className="border-t border-[var(--evergreen)]/10 first:border-t-0">
                    <th className="px-4 py-3 text-sm font-semibold">{t(`help.agents.camera.presets.${key}.label`)}</th>
                    <td className="px-4 py-3 font-mono text-sm font-bold text-[var(--trail-orange)]">{level}</td>
                    <td className="hidden px-4 py-3 text-xs leading-5 text-[var(--evergreen-60)] sm:table-cell">{t(`help.agents.camera.presets.${key}.body`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-[var(--evergreen)]/12 px-4 py-3 text-xs leading-5 text-[var(--evergreen-60)]">
              <strong className="text-[var(--evergreen)]">{t('help.agents.camera.stopsLabel')}</strong>{' '}
              {t('help.agents.camera.stopsBody')}
            </div>
          </div>

          <aside className="rounded-2xl border border-[var(--evergreen)]/15 bg-[var(--evergreen)] p-5 text-[var(--canvas)]">
            <h3 className="text-base font-bold">{t('help.agents.camera.rulesTitle')}</h3>
            <ol className="mt-4 space-y-3">
              {(['preset', 'level', 'zoom'] as const).map((key, index) => (
                <li key={key} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--trail-orange)] text-[11px] font-bold text-white">{index + 1}</span>
                  <div>
                    <h4 className="text-sm font-semibold">{t(`help.agents.camera.rules.${key}.title`)}</h4>
                    <p className="mt-1 text-xs leading-5 text-white/70">{t(`help.agents.camera.rules.${key}.body`)}</p>
                  </div>
                </li>
              ))}
            </ol>
            <pre className="mt-5 overflow-x-auto rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-[12px] leading-5 text-white/85">
{`"cameraSettings": {
  "mode": "follow-behind",
  "followBehindPreset": "medium"
}`}
            </pre>
          </aside>
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-bold">{t('help.agents.examples.title')}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--evergreen-80)]">
            {t('help.agents.examples.intro')}
          </p>
        </div>

        {examples.map((example) => (
          <article
            key={example.title}
            className="grid gap-6 rounded-[1.5rem] border border-[var(--evergreen)]/12 bg-white/80 p-6 shadow-sm lg:grid-cols-[0.9fr_1.1fr]"
          >
            <div>
              <div className="mb-3 inline-flex items-center rounded-full bg-[var(--evergreen)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--canvas)]">
                {example.badge}
              </div>
              <h3 className="text-lg font-bold">{example.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--evergreen-80)]">{example.problem}</p>
              <p className="mt-4 rounded-2xl border border-[var(--evergreen)]/10 bg-[var(--canvas)] px-4 py-3 text-sm leading-6 text-[var(--evergreen-80)]">
                {example.result}
              </p>
            </div>
            <Recipe code={example.recipe} />
          </article>
        ))}
      </section>

      {/* Before any of this works, someone has to have the files. */}
      <section>
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--evergreen)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--canvas)]">
          <Download className="h-3.5 w-3.5" />
          {t('help.agents.sources.badge')}
        </div>
        <h2 className="text-xl font-bold">{t('help.agents.sources.title')}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--evergreen-80)]">
          {t('help.agents.sources.intro')}
        </p>

        <ol className="mt-4 grid gap-3 md:grid-cols-2">
          {sources.map((source, index) => (
            <li
              key={source.label}
              className="rounded-2xl border border-[var(--evergreen)]/12 bg-white/80 px-4 py-4"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-bold text-[var(--trail-orange)]">{index + 1}</span>
                <span className="text-sm font-bold">{source.label}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-[var(--evergreen-80)]">{source.body}</p>
            </li>
          ))}
        </ol>

        <p className="mt-4 rounded-2xl border border-[var(--trail-orange)]/25 bg-[var(--trail-orange-15)] px-4 py-3 text-sm leading-6 text-[var(--evergreen-80)]">
          {t('help.agents.sources.boundary')}
        </p>

        <a
          href="/gpx-download-guide"
          onClick={() => trackEvent('agents_resource_clicked', { resource: '/gpx-download-guide' })}
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--trail-orange)] hover:underline"
        >
          {t('help.agents.sources.guideLink')}
        </a>
      </section>

      {/* Trust: the app checks the agent's work and shows you the result. */}
      <section className="rounded-[1.5rem] border border-[var(--evergreen)]/15 bg-[linear-gradient(160deg,var(--evergreen),#223428)] p-6 text-[var(--canvas)] shadow-sm">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/80">
          <Radar className="h-3.5 w-3.5" />
          {t('help.agents.check.badge')}
        </div>
        <h2 className="text-lg font-bold">{t('help.agents.check.title')}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/75">
          {t('help.agents.check.body')}
        </p>
        <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-[13px] leading-6 text-white/85">
{` 7.1 km   23-28s   Les Casetes
25.0 km   42-47s   Les Casetes        marker 4.1 km away`}
        </pre>
        <p className="mt-3 text-xs leading-5 text-white/60">{t('help.agents.check.note')}</p>
      </section>

      <section>
        <div className="rounded-[1.5rem] border border-[var(--evergreen)]/15 bg-white/80 p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--trail-orange-15)] text-[var(--trail-orange)]">
              <SlidersHorizontal className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Cinematic camera tools for agents</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--evergreen-80)]">
                An optional Node.js 20+ CLI reads GPX, KML, or .replay files locally. It uses TrailReplay's shared route and recipe engine to inspect playback context, sample public terrain tiles, and evaluate authored camera keyframes.
              </p>
            </div>
          </div>
          <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-[var(--evergreen)] px-4 py-3 font-mono text-[12px] leading-5 text-white/85">
{`node agent-tools.mjs inspect --recipe recipe.json --routes route.gpx --out context.json
node agent-tools.mjs terrain --recipe recipe.json --routes route.gpx --out terrain-brief.json
node agent-tools.mjs evaluate --recipe recipe.json --routes route.gpx --out evaluation.json`}
          </pre>
          <p className="mt-3 text-xs leading-5 text-[var(--evergreen-60)]">
            Route files stay on the machine; terrain commands send requested tile coordinates to AWS Terrarium. Numeric evaluation does not verify the rendered replay. FIT is not supported by this CLI.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-[var(--trail-orange)]">
            <a href="/agent-tools.mjs" download onClick={() => trackEvent('agents_resource_clicked', { resource: '/agent-tools.mjs' })} className="hover:underline">Download agent-tools.mjs</a>
            <a href="/camera-authoring.md" onClick={() => trackEvent('agents_resource_clicked', { resource: '/camera-authoring.md' })} className="hover:underline">Camera authoring guide</a>
            <a href="/agent-tools.json" onClick={() => trackEvent('agents_resource_clicked', { resource: '/agent-tools.json' })} className="hover:underline">Tool manifest</a>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold">{t('help.agents.resources.title')}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--evergreen-80)]">
          {t('help.agents.resources.intro')}
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {resources.map((resource) => (
            <a
              key={resource.href}
              href={resource.href}
              onClick={() => trackEvent('agents_resource_clicked', { resource: resource.href })}
              className="rounded-2xl border border-[var(--evergreen)]/12 bg-white/80 px-4 py-4 transition-colors hover:border-[var(--trail-orange)]/40"
            >
              <div className="font-mono text-sm font-semibold text-[var(--trail-orange)]">
                {resource.title}
              </div>
              <p className="mt-1 text-xs leading-5 text-[var(--evergreen-80)]">
                {resource.description}
              </p>
            </a>
          ))}
        </div>
      </section>
    </HelpLayout>
  );
}
