import { useId, useMemo, useState } from 'react';
import { useI18n } from '@/i18n/useI18n';
import type { LanguageCode } from '@/i18n/translations';
import { localizedAnnotation } from '@/utils/annotationTranslations';
import { sideAnnotationContent } from '@/components/annotations/sideAnnotationContent';
import { formatDistance } from '@/utils/units';
import { resolveRoutePlace, type StoryCompileInput } from '@/utils/story/compileStory';
import type { StoryAnchor, StoryRef, StoryRefKind } from '@/utils/story/storyDocument';

type Source = StoryRefKind | 'distance';
const SOURCES: Source[] = ['annotation', 'picture', 'video', 'distance'];
const METERS_PER_UNIT = { metric: 1000, imperial: 1609.344 } as const;
export type StoryPrefill = { heading: string; text: string };

export const SEGMENT = 'min-h-9 min-w-0 flex-1 px-1 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--trail-orange)]';
const FIELD = 'w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--evergreen)] outline-none focus:border-[var(--trail-orange)]';

function itemLabel(input: StoryCompileInput, ref: StoryRef, language: LanguageCode): string | null {
  if (ref.kind === 'annotation') {
    const note = input.textAnnotations.find((candidate) => candidate.id === ref.id);
    return note ? localizedAnnotation(note, language).title.trim() || note.id : null;
  }
  const item = (ref.kind === 'picture' ? input.pictures : input.videos).find((candidate) => candidate.id === ref.id);
  return item ? item.title || item.originalFileName || item.id : null;
}

export function StoryAnchorSummary({ anchor, routeMeters, input }: { anchor: StoryAnchor; routeMeters: number; input: StoryCompileInput }) {
  const { t, language } = useI18n();
  const label = anchor.ref && (itemLabel(input, anchor.ref, language) ?? t('story.section.missingItem'));
  return (
    <p className="min-w-0 text-[11px] leading-snug text-[var(--evergreen-80)] [overflow-wrap:anywhere]">
      {[t(`story.anchor.${anchor.ref?.kind ?? 'distance'}`), label, formatDistance(routeMeters, input.settings.unitSystem)].filter(Boolean).join(' · ')}
    </p>
  );
}

export function StoryAnchorPicker({ input, totalMeters, actionLabel, onPick, onCancel }: {
  input: StoryCompileInput; totalMeters: number; actionLabel: string;
  onPick: (anchor: StoryAnchor, prefill?: StoryPrefill) => void; onCancel: () => void;
}) {
  const { t, language } = useI18n();
  const [source, setSource] = useState<Source>('annotation');
  const [itemId, setItemId] = useState('');
  const [distance, setDistance] = useState('');
  const hintId = useId();
  const unitSystem = input.settings.unitSystem;

  const items = useMemo(() => source === 'distance' ? [] : (source === 'annotation' ? input.textAnnotations : source === 'picture' ? input.pictures : input.videos)
    .map((item) => {
      const ref = { kind: source, id: item.id };
      return { ref, label: itemLabel(input, ref, language) ?? item.id, place: resolveRoutePlace(input, ref) };
    }), [input, language, source]);

  const typedMeters = distance.trim() === '' ? NaN : Number(distance.replace(',', '.')) * METERS_PER_UNIT[unitSystem];
  const typedPlace = typedMeters >= 0 && typedMeters <= totalMeters + 0.05 * METERS_PER_UNIT[unitSystem]
    ? resolveRoutePlace(input, { routeMeters: typedMeters })
    : null;
  const chosen = items.find((item) => item.ref.id === itemId);
  const anchor: StoryAnchor | null = source === 'distance'
    ? typedPlace && { ref: null, place: typedPlace }
    : chosen?.place ? { ref: chosen.ref, place: chosen.place } : null;

  const pick = () => {
    if (!anchor) return;
    const note = anchor.ref?.kind === 'annotation' ? input.textAnnotations.find((candidate) => candidate.id === anchor.ref?.id) : undefined;
    const shown = note && localizedAnnotation(note, language);
    onPick(anchor, shown && { heading: shown.title.trim(), text: sideAnnotationContent(shown).description });
  };

  return (
    <div className="space-y-2 rounded-lg border border-[var(--evergreen)]/15 bg-[var(--evergreen)]/[0.03] p-3">
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-[var(--evergreen)]/20" role="group" aria-label={t('story.anchor.source')}>
        {SOURCES.map((option) => (
          <button key={option} type="button" aria-pressed={source === option} onClick={() => { setSource(option); setItemId(''); }}
            className={`${SEGMENT} ${source === option ? 'bg-[var(--evergreen)] text-[var(--canvas)]' : 'text-[var(--evergreen-80)] hover:bg-[var(--evergreen)]/5'}`}>
            {t(`story.anchor.${option}`)}
          </button>
        ))}
      </div>
      {source === 'distance' ? (
        <div>
          <label className="block text-xs text-[var(--evergreen)]">
            {t('story.anchor.distanceLabel', { unit: unitSystem === 'metric' ? 'km' : 'mi' })}
            <input type="text" inputMode="decimal" value={distance} aria-describedby={hintId} onChange={(event) => setDistance(event.target.value)} className={`mt-1 ${FIELD}`} />
          </label>
          <p id={hintId} className="mt-1 text-[11px] text-[var(--evergreen-80)]">{t('story.anchor.distanceHint', { max: formatDistance(totalMeters, unitSystem) })}</p>
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-[var(--evergreen-80)]">{t('story.anchor.nothing')}</p>
      ) : (
        <select aria-label={t(`story.anchor.${source}`)} value={itemId} onChange={(event) => setItemId(event.target.value)} className={FIELD}>
          <option value="">{t('story.anchor.choose')}</option>
          {items.map(({ ref, label, place }) => (
            <option key={ref.id} value={ref.id} disabled={!place}>{place ? label : t('story.anchor.notOnRoute', { label })}</option>
          ))}
        </select>
      )}
      <div className="flex gap-2">
        <button type="button" disabled={!anchor} onClick={pick}
          className="flex-1 rounded-lg border-2 border-[var(--trail-orange)] bg-[var(--trail-orange-15)] px-3 py-2 text-xs font-semibold text-[var(--evergreen)] transition-colors hover:bg-[var(--trail-orange)]/20 disabled:cursor-not-allowed disabled:opacity-40">
          {actionLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-xs font-medium text-[var(--evergreen)] underline hover:bg-[var(--evergreen)]/5">
          {t('story.anchor.cancel')}
        </button>
      </div>
    </div>
  );
}
