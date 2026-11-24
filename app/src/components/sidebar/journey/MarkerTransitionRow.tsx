import { useState } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { clampTransitionDuration, MARKER_TRANSITION_MAX_MS, MARKER_TRANSITION_MIN_MS, type MarkerTransition } from '@/utils/markerTransitions';

const seconds = (ms: number) => String(Math.round(ms / 100) / 10);

/** Chronology row between two segments: the 3D marker's get-off / get-on animation, its length and an on/off switch. */
export function MarkerTransitionRow({ transition, onChange }: {
  transition: MarkerTransition;
  onChange: (update: { skip?: boolean; durationMs?: number }) => void;
}) {
  const { t } = useI18n();
  const on = !transition.skipped;
  // Text being typed; null shows the saved length.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const value = Number((draft ?? '').replace(',', '.'));
    setDraft(null);
    if (draft === null || !Number.isFinite(value) || value <= 0) return;
    const ms = clampTransitionDuration(value * 1000);
    if (ms !== transition.holdDuration) onChange({ durationMs: ms });
  };
  return (
    <div className="flex w-full items-center gap-2 rounded-lg border border-[var(--evergreen)]/20 bg-white/40 px-2 py-2"
      onPointerDown={(event) => event.stopPropagation()} draggable={false} onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }}>
      <span className={`min-w-0 flex-1 text-[10px] font-semibold ${on ? 'text-[var(--evergreen)]' : 'text-[var(--evergreen-60)]'}`}><span className="block">{t('journey.markerTransitionHeading')}</span><span className="mt-0.5 block font-normal leading-snug text-[var(--evergreen-60)]">{t('journey.markerChoiceHint')}</span></span>
      <label className={`flex items-center gap-0.5 rounded-md border border-[var(--evergreen)]/15 bg-[var(--canvas)] px-1.5 py-0.5 text-[10px] text-[var(--evergreen)] ${on ? '' : 'opacity-40'}`}>
        <input type="number" inputMode="decimal" min={MARKER_TRANSITION_MIN_MS / 1000} max={MARKER_TRANSITION_MAX_MS / 1000} step="0.5"
          value={draft ?? seconds(transition.holdDuration)} disabled={!on} aria-label={t('journey.markerTransitionDuration')}
          onChange={(event) => setDraft(event.target.value)} onBlur={commit}
          onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
          className="w-9 bg-transparent text-right font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
        <span className="text-[var(--evergreen-60)]">s</span>
      </label>
      <button type="button" role="switch" aria-checked={on} aria-label={t('journey.markerTransition')}
        onClick={() => onChange({ skip: on })}
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? 'bg-[var(--trail-orange)]' : 'bg-[var(--evergreen)]/25'}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}
