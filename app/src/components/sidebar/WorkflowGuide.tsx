import { ArrowRight } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import type { AppState } from '@/store/storeTypes';

const steps: Array<{ id: AppState['activePanel']; labelKey: string; descriptionKey: string }> = [
  { id: 'tracks', labelKey: 'sidebar.tabs.tracks', descriptionKey: 'workflow.routesDescription' },
  { id: 'journey', labelKey: 'sidebar.tabs.journey', descriptionKey: 'workflow.timelineDescription' },
  { id: 'annotations', labelKey: 'sidebar.tabs.annotations', descriptionKey: 'workflow.styleDescription' },
  { id: 'settings', labelKey: 'sidebar.tabs.settings', descriptionKey: 'workflow.mapDescription' },
  { id: 'pictures', labelKey: 'sidebar.tabs.pictures', descriptionKey: 'workflow.mediaDescription' },
  { id: 'export', labelKey: 'sidebar.tabs.export', descriptionKey: 'workflow.generateDescription' },
];

export function WorkflowGuide() {
  const { t } = useI18n();
  const activePanel = useAppStore((state) => state.activePanel);
  const setActivePanel = useAppStore((state) => state.setActivePanel);
  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activePanel));
  const activeStep = steps[activeIndex];
  const nextStep = steps[activeIndex + 1];

  return (
    <section className="mb-4">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--trail-orange)]">{t('workflow.step', { current: activeIndex + 1, total: steps.length })}</p>
        {nextStep && <button type="button" onClick={() => setActivePanel(nextStep.id)}
          className="group inline-flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-[var(--evergreen)] underline decoration-[var(--trail-orange)]/50 underline-offset-4 transition-colors hover:text-[var(--trail-orange)] hover:decoration-[var(--trail-orange)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trail-orange)]">
          <span>{t('workflow.next', { step: t(nextStep.labelKey) })}</span><ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
        </button>}
      </div>
      <h2 className="mt-1 text-lg font-bold tracking-tight text-[var(--evergreen)]">{t(activeStep.labelKey)}</h2>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--evergreen-60)]">{t(activePanel === 'journey' ? 'journey.editor.description' : activeStep.descriptionKey)}</p>
      <div className="mt-3 grid grid-cols-6 gap-1" aria-label={t('workflow.progressLabel')}>
        {steps.map((step, index) => <button key={step.id} type="button" onClick={() => setActivePanel(step.id)} aria-label={t(step.labelKey)} aria-current={index === activeIndex ? 'step' : undefined}
          className={`h-1 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--evergreen)] ${index <= activeIndex ? 'bg-[var(--trail-orange)]' : 'bg-[var(--evergreen)]/10'}`} />)}
      </div>
    </section>
  );
}
