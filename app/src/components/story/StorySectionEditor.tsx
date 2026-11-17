import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { ArrowDown, ArrowUp, Film, Image, MapPin, Plus, Trash2, Type } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { createId } from '@/utils/id';
import type { CompiledStory, StoryCompileInput, StoryIssue } from '@/utils/story/compileStory';
import { STORY_LIMITS, type StorySection } from '@/utils/story/storyDocument';
import { StoryAnchorPicker, StoryAnchorSummary } from './StoryAnchorPicker';

const ISSUE_KEYS: Record<StoryIssue['kind'], string> = {
  'anchor-missing': 'story.issues.anchorMissing',
  'anchor-segment-missing': 'story.issues.anchorSegmentMissing',
  'media-missing': 'story.issues.mediaMissing',
  'media-unplaced': 'story.issues.mediaUnplaced',
  'media-placeholder': 'story.issues.mediaPlaceholder',
  'out-of-route-order': 'story.issues.outOfRouteOrder',
};

const FIELD = 'w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--evergreen)] outline-none focus:border-[var(--trail-orange)]';
const ICON_BUTTON = 'flex h-8 w-8 shrink-0 items-center justify-center rounded text-[var(--evergreen)] transition-colors hover:bg-[var(--evergreen)]/10 focus-visible:outline-2 focus-visible:outline-[var(--trail-orange)] disabled:opacity-30 disabled:hover:bg-transparent';
const ADD_BUTTON = 'flex flex-1 items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--evergreen)]/30 px-2 py-2 text-xs font-semibold text-[var(--evergreen)] transition-colors hover:border-[var(--trail-orange)] hover:bg-[var(--trail-orange-15)]';

function Issues({ issues }: { issues: StoryIssue[] }) {
  const { t } = useI18n();
  return issues.map((issue) => (
    <p key={issue.kind} className="border-l-2 border-[var(--trail-orange)] pl-2 text-[11px] leading-snug text-[var(--evergreen-80)]">{t(ISSUE_KEYS[issue.kind])}</p>
  ));
}

const issueKey = (issue: StoryIssue) => `${issue.kind} ${issue.sectionId} ${issue.blockId ?? ''}`;

export function StoryIssueAnnouncer({ issues, sections }: { issues: StoryIssue[]; sections: StorySection[] }) {
  const { t } = useI18n();
  const keys = issues.map(issueKey);
  const [seen, setSeen] = useState({ keys, text: '' });
  if (keys.join('|') !== seen.keys.join('|')) {
    setSeen({
      keys,
      text: issues.filter((_, index) => !seen.keys.includes(keys[index])).map((issue) =>
        `${t('story.section.label', { index: sections.findIndex((section) => section.id === issue.sectionId) + 1 })}: ${t(ISSUE_KEYS[issue.kind])}`).join(' '),
    });
  }
  return <p role="status" className="sr-only">{seen.text}</p>;
}

function removeKeepingFocus(control: HTMLElement, fallback: HTMLElement | null | undefined, remove: () => void) {
  const item = control.closest('li');
  const sibling = item?.nextElementSibling ?? item?.previousElementSibling;
  const target = sibling?.querySelector<HTMLElement>(`[data-remove="${control.dataset.remove}"]`) ?? fallback;
  remove();
  target?.focus();
}

function MoveButtons({ index, count, up, down, onMove, children, vertical = false }: {
  index: number; count: number; up: string; down: string; onMove: (to: number) => void; children: ReactNode; vertical?: boolean;
}) {
  return (
    <div className={`flex shrink-0 ${vertical ? 'flex-col' : ''}`}>
      <button type="button" aria-label={up} title={up} disabled={index === 0} onClick={() => onMove(index - 1)} className={ICON_BUTTON}><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
      <button type="button" aria-label={down} title={down} disabled={index === count - 1} onClick={() => onMove(index + 1)} className={ICON_BUTTON}><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
      {children}
    </div>
  );
}

type MediaItem = StoryCompileInput['pictures'][number];

function MediaName({ kind, item, fallback }: { kind: 'picture' | 'video'; item: MediaItem | undefined; fallback: string }) {
  const Icon = kind === 'picture' ? Image : Film;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      {kind === 'picture' && item?.url && !item.isPlaceholder
        ? <img src={item.url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
        : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[var(--evergreen)]/10"><Icon className="h-4 w-4" aria-hidden="true" /></span>}
      <span className="min-w-0 truncate text-xs">{item ? item.title || item.originalFileName || item.id : fallback}</span>
    </span>
  );
}

export function StorySectionEditor({ section, index, count, input, compiled, addSectionButton }: {
  section: StorySection; index: number; count: number; input: StoryCompileInput; compiled: CompiledStory | null;
  addSectionButton: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useI18n();
  const updateStory = useAppStore((state) => state.updateStory);
  const [picking, setPicking] = useState<'picture' | 'video' | null>(null);
  const [reanchoring, setReanchoring] = useState(false);
  const changePlace = useRef<HTMLButtonElement>(null);
  const addText = useRef<HTMLButtonElement>(null);
  const addMedia = useRef<Partial<Record<'picture' | 'video', HTMLButtonElement | null>>>({});
  const stopReanchoring = () => { setReanchoring(false); changePlace.current?.focus(); };
  const issues = compiled?.issues.filter((issue) => issue.sectionId === section.id) ?? [];
  const routeMeters = compiled?.sections.find((entry) => entry.id === section.id)?.routeMeters ?? section.anchor.place.routeMeters;
  const pickable = picking === 'picture' ? input.pictures : picking === 'video' ? input.videos : [];
  const findMedia = (kind: 'picture' | 'video', id: string) => (kind === 'picture' ? input.pictures : input.videos).find((item) => item.id === id);

  return (
    <section aria-label={t('story.section.label', { index: index + 1 })} className="space-y-3 rounded-xl border border-[var(--evergreen)]/15 bg-white/20 p-3">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 shrink-0 text-[var(--trail-orange)]" aria-hidden="true" />
        <div className="min-w-0 flex-1"><StoryAnchorSummary anchor={section.anchor} routeMeters={routeMeters} input={input} /></div>
        <MoveButtons index={index} count={count} up={t('story.section.moveSectionUp')} down={t('story.section.moveSectionDown')}
          onMove={(to) => updateStory({ type: 'moveSection', id: section.id, to })}>
          <button type="button" data-remove="section" aria-label={t('story.section.removeSection')} title={t('story.section.removeSection')} className={ICON_BUTTON}
            onClick={(event) => removeKeepingFocus(event.currentTarget, addSectionButton.current, () => updateStory({ type: 'removeSection', id: section.id }))}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </MoveButtons>
      </div>
      <Issues issues={issues.filter((issue) => issue.blockId === undefined)} />

      <button ref={changePlace} type="button" aria-expanded={reanchoring} onClick={() => setReanchoring(!reanchoring)} className="text-xs font-medium text-[var(--evergreen)] underline decoration-[var(--trail-orange)]/50 underline-offset-4 hover:text-[var(--trail-orange)]">
        {t('story.anchor.change')}
      </button>
      {reanchoring && (
        <StoryAnchorPicker input={input} totalMeters={compiled?.route.route.totalDistance ?? 0} actionLabel={t('story.anchor.move')}
          onPick={(anchor) => { updateStory({ type: 'setSection', id: section.id, anchor }); stopReanchoring(); }}
          onCancel={stopReanchoring} />
      )}

      <input aria-label={t('story.section.heading')} placeholder={t('story.section.heading')} value={section.heading} maxLength={STORY_LIMITS.heading}
        onChange={(event) => updateStory({ type: 'setSection', id: section.id, heading: event.target.value })} className={`${FIELD} font-semibold`} />

      {section.blocks.length > 0 && (
        <ol className="space-y-2">
          {section.blocks.map((block, blockIndex) => (
            <li key={block.id} className="space-y-1">
              <div className="flex items-start gap-1">
                {block.kind === 'text' ? (
                  <textarea aria-label={t('story.section.text')} value={block.text} maxLength={STORY_LIMITS.text}
                    onChange={(event) => updateStory({ type: 'setText', sectionId: section.id, blockId: block.id, text: event.target.value })}
                    className={`${FIELD} min-h-24 [overflow-wrap:anywhere]`} />
                ) : (
                  <MediaName kind={block.media.kind} item={findMedia(block.media.kind, block.media.id)} fallback={t('story.section.missingItem')} />
                )}
                <MoveButtons vertical index={blockIndex} count={section.blocks.length} up={t('story.section.moveUp')} down={t('story.section.moveDown')}
                  onMove={(to) => updateStory({ type: 'moveBlock', sectionId: section.id, blockId: block.id, to })}>
                  <button type="button" data-remove="block" aria-label={t('story.section.remove')} title={t('story.section.remove')} className={ICON_BUTTON}
                    onClick={(event) => removeKeepingFocus(event.currentTarget, addText.current, () => updateStory({ type: 'removeBlock', sectionId: section.id, blockId: block.id }))}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </MoveButtons>
              </div>
              <Issues issues={issues.filter((issue) => issue.blockId === block.id)} />
            </li>
          ))}
        </ol>
      )}

      <div className="flex gap-2">
        <button ref={addText} type="button" className={ADD_BUTTON}
          onClick={() => updateStory({ type: 'addBlock', sectionId: section.id, block: { id: createId('block'), kind: 'text', text: '' } })}>
          <Type className="h-3.5 w-3.5" aria-hidden="true" />{t('story.section.addText')}
        </button>
        {(['picture', 'video'] as const).map((kind) => (
          <button key={kind} ref={(node) => { addMedia.current[kind] = node; }} type="button" aria-expanded={picking === kind} onClick={() => setPicking(picking === kind ? null : kind)} className={ADD_BUTTON}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />{t(kind === 'picture' ? 'story.section.addPhoto' : 'story.section.addClip')}
          </button>
        ))}
      </div>
      {picking && (pickable.length === 0 ? (
        <p className="text-xs text-[var(--evergreen-80)]">{t(picking === 'picture' ? 'story.section.noPhotos' : 'story.section.noClips')}</p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto" aria-label={t(picking === 'picture' ? 'story.section.addPhoto' : 'story.section.addClip')}>
          {pickable.map((item) => (
            <li key={item.id}>
              <button type="button" className="flex w-full items-center rounded-lg p-1 text-left text-[var(--evergreen)] hover:bg-[var(--trail-orange-15)]"
                onClick={() => {
                  updateStory({ type: 'addBlock', sectionId: section.id, block: { id: createId('block'), kind: 'media', media: { kind: picking, id: item.id } } });
                  setPicking(null);
                  addMedia.current[picking]?.focus();
                }}>
                <MediaName kind={picking} item={item} fallback={item.id} />
              </button>
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}
