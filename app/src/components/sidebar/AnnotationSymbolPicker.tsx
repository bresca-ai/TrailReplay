import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import {
  annotationMapGlyph,
  annotationPinheadId,
  annotationSymbolPath,
  mapAnnotationSymbol,
  pinheadAnnotationSymbol,
} from '@/components/annotations/annotationSymbol';
import { loadPinheadIcons, searchPinheadIcons, usePinheadIcons } from '@/components/annotations/pinheadIcons';
import { LANDMARK_GLYPH_KEYS, LANDMARK_GLYPH_LABELS, PINHEAD_PATHS } from '@/components/map/landmarkGlyphs';

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

/**
 * The built-in trail glyphs as quick picks, plus a search over the whole
 * Pinhead library, which only loads once someone starts typing.
 */
export function AnnotationSymbolPicker({ value, onChange }: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const searching = query.trim().length > 0;
  const icons = usePinheadIcons(searching || annotationPinheadId(value) !== null);

  const selectedGlyph = annotationMapGlyph(value);
  const selectedPinheadId = annotationPinheadId(value);
  const isEmoji = !selectedGlyph && !selectedPinheadId;

  const { results, total } = useMemo(
    () => (icons ? searchPinheadIcons(icons, query, RESULT_LIMIT) : { results: [], total: 0 }),
    [icons, query],
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
    <legend className="text-xs font-medium text-[var(--evergreen)]">{t('annotations.logoLabel')}</legend>

    <div className="flex flex-wrap gap-1.5">
      {LANDMARK_GLYPH_KEYS.map((glyph) => <IconButton
        key={glyph}
        path={PINHEAD_PATHS[glyph]}
        label={LANDMARK_GLYPH_LABELS[glyph]}
        selected={selectedGlyph === glyph}
        onClick={() => onChange(mapAnnotationSymbol(glyph))}
      />)}
      {selectedPinheadId && <IconButton
        path={annotationSymbolPath(value) ?? PINHEAD_PATHS.pin}
        label={selectedPinheadId.replace(/_/g, ' ')}
        selected
        onClick={() => undefined}
      />}
      <button type="button" aria-label={t('annotations.emojiLabel')} title={t('annotations.emojiLabel')} aria-pressed={isEmoji} onClick={() => onChange('🚰')}
        className={`rounded-md border px-2 text-xs ${isEmoji ? 'border-[var(--trail-orange)] bg-[var(--trail-orange-15)]' : 'border-[var(--evergreen)]/20'}`}>{t('annotations.emojiLabel')}</button>
    </div>
    {isEmoji && <input aria-label={`${t('annotations.logoLabel')} ${t('annotations.emojiLabel')}`} value={value} onChange={(event) => onChange(event.target.value)} maxLength={8}
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
                  label={icon.label}
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
