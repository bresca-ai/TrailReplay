import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Play, Plus } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { createId } from '@/utils/id';
import { STORY_LIMITS, STORY_MOBILE_MAPS, STORY_TEXT_SIDES, STORY_VIEWS, STORY_ZOOMS, type StoryAnchor, type StoryLayout } from '@/utils/story/storyDocument';
import { SEGMENT, StoryAnchorPicker, type StoryPrefill } from './StoryAnchorPicker';
import { StoryIssueAnnouncer, StorySectionEditor } from './StorySectionEditor';
import { useStoryPreview } from './storyPreview';
import { useCompiledStory } from './useCompiledStory';

const LAYOUT_CONTROLS: Array<{ key: keyof StoryLayout; options: readonly string[] }> = [
  { key: 'view', options: STORY_VIEWS },
  { key: 'zoom', options: STORY_ZOOMS },
  { key: 'textSide', options: STORY_TEXT_SIDES },
  { key: 'mobileMap', options: STORY_MOBILE_MAPS },
];

const FIELD = 'mt-1 w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--evergreen)] outline-none focus:border-[var(--trail-orange)]';
const HEADING = 'flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--evergreen)] after:h-px after:flex-1 after:bg-[var(--evergreen)]/15';

export function StoryPanel() {
  const { t } = useI18n();
  const { input, story } = useCompiledStory();
  const updateStory = useAppStore((state) => state.updateStory);
  const [adding, setAdding] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  // The picker unmounts on pick or cancel; without this, focus falls to the page body.
  const stopAdding = () => { setAdding(false); addButton.current?.focus(); };
  const sectionList = useRef<HTMLOListElement>(null);
  const addSection = (anchor: StoryAnchor, prefill?: StoryPrefill) => {
    const id = createId('section');
    // Rendered now, because route order can put the new section far above this button: it takes focus there.
    flushSync(() => { updateStory({ type: 'addSection', id, anchor, prefill }); setAdding(false); });
    const item = sectionList.current?.children[useAppStore.getState().story.sections.findIndex((section) => section.id === id)];
    item?.scrollIntoView({ block: 'nearest' });
    (item?.querySelector('input') ?? addButton.current)?.focus({ preventScroll: true });
  };
  const doc = input.document;
  const totalMeters = story?.route.route.totalDistance ?? 0;

  return (
    <div className="space-y-6 text-[var(--evergreen)]">
      <section className="space-y-3">
        <h2 className="text-lg font-bold tracking-tight">{t('story.title')}</h2>
        <p className="text-[11px] leading-relaxed text-[var(--evergreen-80)]">{t('story.description')}</p>
        <button type="button" disabled={!story} aria-describedby={story ? undefined : 'story-preview-reason'}
          onClick={(event) => useStoryPreview.getState().open(event.currentTarget)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-[var(--trail-orange)] bg-[var(--trail-orange-15)] p-2.5 text-sm font-medium transition-colors hover:bg-[var(--trail-orange)]/20 disabled:cursor-not-allowed disabled:opacity-40">
          <Play className="h-4 w-4" aria-hidden="true" />{t('story.preview')}
        </button>
        {!story && <p id="story-preview-reason" className="text-xs text-[var(--evergreen-80)]">{t('story.previewNeedsRoute')}</p>}
      </section>

      <section className="space-y-3">
        <h3 className={HEADING}>{t('story.cover')}</h3>
        <label className="block text-xs font-medium">{t('story.coverTitle')}
          <input value={doc.title} maxLength={STORY_LIMITS.title} placeholder={t('story.coverTitlePlaceholder')}
            onChange={(event) => updateStory({ type: 'setCover', title: event.target.value })} className={FIELD} />
        </label>
        <label className="block text-xs font-medium">{t('story.intro')}
          <textarea value={doc.intro} maxLength={STORY_LIMITS.text}
            onChange={(event) => updateStory({ type: 'setCover', intro: event.target.value })} className={`${FIELD} min-h-20 [overflow-wrap:anywhere]`} />
        </label>
      </section>

      <section className="space-y-2">
        <h3 className={HEADING}>{t('story.layoutTitle')}</h3>
        {LAYOUT_CONTROLS.map(({ key, options }) => (
          <div key={key} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
            <span className="text-xs font-medium">{t(`story.layout.${key}`)}</span>
            <div className="flex overflow-hidden rounded-lg border border-[var(--evergreen)]/20" role="group" aria-label={t(`story.layout.${key}`)}>
              {options.map((option) => (
                <button key={option} type="button" aria-pressed={doc.layout[key] === option}
                  onClick={() => updateStory({ type: 'setLayout', layout: { [key]: option } })}
                  className={`${SEGMENT} ${doc.layout[key] === option ? 'bg-[var(--evergreen)] text-[var(--canvas)]' : 'text-[var(--evergreen-80)] hover:bg-[var(--evergreen)]/5'}`}>
                  {t(`story.options.${option}`)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h3 className={HEADING}>{t('story.sectionsTitle')}</h3>
        {doc.sections.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--evergreen)]/20 px-3 py-4 text-xs text-[var(--evergreen-80)]">{t('story.empty')}</p>
        ) : (
          <ol ref={sectionList} className="space-y-3">
            {doc.sections.map((section, index) => (
              <li key={section.id}>
                <StorySectionEditor section={section} index={index} count={doc.sections.length} input={input} compiled={story} addSectionButton={addButton} />
              </li>
            ))}
          </ol>
        )}
        <button ref={addButton} type="button" aria-expanded={adding} onClick={() => setAdding(!adding)} disabled={doc.sections.length >= STORY_LIMITS.sections}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--evergreen)]/30 px-3 py-2 text-xs font-semibold transition-colors hover:border-[var(--trail-orange)] hover:bg-[var(--trail-orange-15)] disabled:opacity-40">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />{t('story.addSection')}
        </button>
        {adding && (
          <StoryAnchorPicker input={input} totalMeters={totalMeters} actionLabel={t('story.anchor.add')}
            onPick={addSection} onCancel={stopAdding} />
        )}
        <StoryIssueAnnouncer issues={story?.issues ?? []} sections={doc.sections} />
      </section>
    </div>
  );
}
