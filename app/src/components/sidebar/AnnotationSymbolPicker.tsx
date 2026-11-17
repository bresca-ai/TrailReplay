import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import {
  annotationMapGlyph,
  annotationPinheadId,
  annotationSymbolPath,
  mapAnnotationSymbol,
  pinheadAnnotationSymbol,
} from '@/components/annotations/annotationSymbol';
import { loadPinheadIcons, pinheadLocalizedLabel, usePinheadIcons, usePinheadTerms, type PinheadIcon, type PinheadTerms, type PinheadLabelLookup } from '@/components/annotations/pinheadIcons';
import { LANDMARK_GLYPH_KEYS, PINHEAD_PATHS } from '@/components/map/landmarkGlyphs';
import { ICON_TOPICS, iconTopic, searchIconsByTopic } from '@/components/annotations/iconTopics';

// Enough to scan at a glance without rendering thousands of buttons for "a".
const RESULT_LIMIT = 96;

function IconButton({ path, label, selected, onClick }: {
  path: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return <button
    type="button"
    aria-label={label}
    aria-pressed={selected}
    title={label}
    onClick={onClick}
    className={`grid h-9 w-9 place-items-center rounded-md border transition-colors ${selected ? 'border-[var(--trail-orange)] bg-[var(--trail-orange-15)] text-[var(--trail-orange)]' : 'border-[var(--evergreen)]/20 text-[var(--evergreen)] hover:border-[var(--trail-orange)]'}`}
  ><svg aria-hidden="true" width="19" height="19" viewBox="0 0 15 15"><path fill="currentColor" d={path} /></svg></button>;
}

function IconBrowser({ icons, terms, language, lookup, query, onQueryChange, selectedId, onSelect, onClose, failed, onRetry, t }: {
  icons: PinheadIcon[] | null; terms: PinheadTerms | null; language: string; lookup?: PinheadLabelLookup; query: string;
  onQueryChange: (value: string) => void; selectedId: string | null; onSelect: (id: string) => void;
  onClose: () => void; failed: boolean; onRetry: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const results = useMemo(() => !icons ? [] : query.trim() ? searchIconsByTopic(icons, query, icons.length, terms, t, language, lookup).results : icons, [icons, query, terms, t, language, lookup]);
  const groups = [...ICON_TOPICS.map(([key]) => key), 'other'].map((key) => ({ key, icons: results.filter((icon) => iconTopic(icon) === key) })).filter((group) => group.icons.length);
  return createPortal(<dialog ref={ref} onClose={onClose} aria-labelledby="icon-browser-title"
    className="m-auto max-h-[85vh] w-[min(92vw,56rem)] rounded-xl border border-[var(--evergreen)]/20 bg-[var(--canvas)] p-0 text-[var(--evergreen)] shadow-xl backdrop:bg-black/50">
    <div className="flex max-h-[85vh] flex-col p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-3"><h2 id="icon-browser-title" className="text-lg font-bold">{t('annotations.iconBrowseAll')}</h2>
        <button type="button" onClick={onClose} className="rounded border border-[var(--evergreen)]/20 px-3 py-1 text-sm">{t('annotations.iconBrowseClose')}</button></div>
      <input autoFocus type="search" aria-label={t('annotations.iconSearchLabel')} placeholder={t('annotations.iconSearchPlaceholder')}
        value={query} onChange={(event) => onQueryChange(event.target.value)} className="mb-3 w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm" />
      {!icons ? <p className="text-sm">{failed ? <>{t('annotations.iconSearchError')} <button type="button" onClick={onRetry} className="underline">{t('annotations.iconSearchRetry')}</button></> : t('annotations.iconSearchLoading')}</p>
        : <><p className="mb-2 text-xs text-[var(--evergreen-60)]" aria-live="polite">{results.length} / {icons.length}</p>
          {results.length === 0 ? <p className="text-sm">{t('annotations.iconSearchEmpty', { query: query.trim() })}</p> :
            <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
              {groups.map((group) => <section key={group.key}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--evergreen-60)]">{t(`annotations.iconTopic.${group.key}`)}</h3>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
                  {group.icons.map((icon) => { const local = pinheadLocalizedLabel(icon, terms, language, lookup); return <button type="button" key={icon.id}
                    title={local} aria-label={local} aria-pressed={selectedId === icon.id} onClick={() => onSelect(icon.id)}
                    className="flex min-w-0 flex-col items-center gap-2 rounded-lg border border-[var(--evergreen)]/15 px-2 py-3 text-center hover:border-[var(--trail-orange)] focus-visible:outline-2 focus-visible:outline-[var(--trail-orange)] aria-pressed:border-[var(--trail-orange)]">
                    <svg aria-hidden="true" className="shrink-0" width="32" height="32" viewBox="0 0 15 15"><path fill="currentColor" d={icon.path} /></svg>
                    <span className="line-clamp-2 w-full break-words text-[10px] leading-tight text-[var(--evergreen-60)]">{local}</span>
                  </button>; })}
                </div>
              </section>)}
            </div>}</>}
    </div>
  </dialog>, document.body);
}

/**
 * The built-in trail glyphs as quick picks, plus a search over the whole
 * Pinhead library, which only loads once someone starts typing.
 */
export function AnnotationSymbolPicker({ value, onChange, label, allowEmoji = true }: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  allowEmoji?: boolean;
}) {
  const { t, language } = useI18n();
  const [query, setQuery] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [lookup, setLookup] = useState<PinheadLabelLookup>();
  const searching = query.trim().length > 0;
  useEffect(() => {
    if (language === 'en' || (!searching && !browserOpen) || lookup) return;
    let cancelled = false;
    import('@/components/annotations/pinheadLabels').then((module) => {
      if (!cancelled) setLookup(() => module.reviewedPinheadLabel);
    }).catch(() => { /* English names remain available if the catalogue fails to load. */ });
    return () => { cancelled = true; };
  }, [language, searching, browserOpen, lookup]);
  const icons = usePinheadIcons(searching || browserOpen || annotationPinheadId(value) !== null);
  // Searches match the English names and, when the app is in another
  // language, the same words in that language.
  const localTerms = usePinheadTerms(language, searching || browserOpen);

  const selectedGlyph = annotationMapGlyph(value);
  const selectedPinheadId = annotationPinheadId(value);
  const isEmoji = !selectedGlyph && !selectedPinheadId;

  const { results, total } = useMemo(
    () => (icons ? searchIconsByTopic(icons, query, RESULT_LIMIT, localTerms, t, language, lookup) : { results: [], total: 0 }),
    [icons, localTerms, query, t, language, lookup],
  );

  const retry = () => {
    setLoadFailed(false);
    loadPinheadIcons().catch(() => setLoadFailed(true));
  };

  const onQueryChange = (next: string) => {
    setQuery(next);
    if (next.trim() && !icons) loadPinheadIcons().catch(() => setLoadFailed(true));
  };

  return <fieldset className="w-full space-y-2">
    <legend className="text-xs font-medium text-[var(--evergreen)]">{label ?? t('annotations.logoLabel')}</legend>

    <div className="flex flex-wrap gap-1.5">
      {LANDMARK_GLYPH_KEYS.map((glyph) => <IconButton
        key={glyph}
        path={PINHEAD_PATHS[glyph]}
        label={t(`routeLandmarks.glyphs.${glyph}`)}
        selected={selectedGlyph === glyph}
        onClick={() => onChange(mapAnnotationSymbol(glyph))}
      />)}
      {selectedPinheadId && <IconButton
        path={annotationSymbolPath(value) ?? PINHEAD_PATHS.pin}
        label={selectedPinheadId.replace(/_/g, ' ')}
        selected
        onClick={() => undefined}
      />}
      {allowEmoji && <button type="button" aria-label={t('annotations.emojiLabel')} title={t('annotations.emojiLabel')} aria-pressed={isEmoji} onClick={() => onChange('🚰')}
        className={`rounded-md border px-2 text-xs ${isEmoji ? 'border-[var(--trail-orange)] bg-[var(--trail-orange-15)]' : 'border-[var(--evergreen)]/20'}`}>{t('annotations.emojiLabel')}</button>
      }
    </div>
    {allowEmoji && isEmoji && <input aria-label={`${t('annotations.logoLabel')} ${t('annotations.emojiLabel')}`} value={value} onChange={(event) => onChange(event.target.value)} maxLength={8}
      className="w-20 rounded border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-2 py-1 text-sm" />}

    <label className="relative block">
      <span className="sr-only">{t('annotations.iconSearchLabel')}</span>
      <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--evergreen-60)]" />
      <input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={t('annotations.iconSearchPlaceholder')}
        className="w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] py-1.5 pl-8 pr-2 text-sm"
      />
    </label>

    <button type="button" onClick={() => { setBrowserOpen(true); if (!icons) loadPinheadIcons().catch(() => setLoadFailed(true)); }}
      className="text-xs font-medium text-[var(--trail-orange)] underline">{t('annotations.iconBrowseAll')}</button>
    {browserOpen && <IconBrowser icons={icons} terms={localTerms} language={language} lookup={lookup} query={query} onQueryChange={onQueryChange}
      selectedId={selectedPinheadId} onSelect={(id) => { onChange(pinheadAnnotationSymbol(id)); setBrowserOpen(false); }}
      onClose={() => setBrowserOpen(false)} failed={loadFailed} onRetry={retry} t={t} />}
    {searching && <div className="space-y-1.5" aria-live="polite">
      {loadFailed && !icons
        ? <p className="text-xs text-[var(--evergreen-60)]">{t('annotations.iconSearchError')} <button type="button" onClick={retry} className="text-[var(--trail-orange)] underline">{t('annotations.iconSearchRetry')}</button></p>
        : !icons
          ? <p className="text-xs text-[var(--evergreen-60)]">{t('annotations.iconSearchLoading')}</p>
          : total === 0
            ? <p className="text-xs text-[var(--evergreen-60)]">{t('annotations.iconSearchEmpty', { query: query.trim() })}</p>
            : <>
              <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                {results.map((icon) => <IconButton
                  key={icon.id}
                  path={icon.path}
                  label={language === 'en' ? icon.label : `${icon.label} · ${pinheadLocalizedLabel(icon, localTerms, language, lookup)}`}
                  selected={selectedPinheadId === icon.id}
                  onClick={() => onChange(pinheadAnnotationSymbol(icon.id))}
                />)}
              </div>
              {total > results.length && <p className="text-[11px] text-[var(--evergreen-60)]">{t('annotations.iconSearchCount', { shown: results.length, total })}</p>}
            </>}
      <p className="text-[11px] text-[var(--evergreen-60)]">
        <a href="https://pinhead.ink" target="_blank" rel="noreferrer" className="hover:underline">{t('annotations.iconSearchCredit')}</a>
      </p>
    </div>}
  </fieldset>;
}
