import { Check, ChevronDown, MapPinned, Palette, Route } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { LocationChapterSettings } from '@/types';
import { useI18n } from '@/i18n/useI18n';
import { LOCATION_LEVELS, levelCode, type LocationLevel } from '@/utils/locationBoundaries';
import { getIntroDuration, getIntroLevels, getMinimumStaySeconds, getZoomDurationSeconds } from '@/utils/locationChapterCamera';
import { useComputedJourney } from '@/hooks/useComputedJourney';
import { useStartLocationLevels } from '@/hooks/useStartLocationLevels';

const defaults: LocationChapterSettings = { level: 'off', color: '#ffbd66', width: 3, fill: false, showName: true, showFlag: true, zoomToPlace: true, durationSeconds: 4.5 };

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 py-1 text-sm text-[var(--evergreen)]">
      <span className="leading-snug">{label}</span>
      <span className="relative inline-flex shrink-0 items-center">
        <input type="checkbox" className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" checked={checked} onChange={event => onChange(event.target.checked)} />
        <span aria-hidden="true" className="h-6 w-10 rounded-full bg-[var(--evergreen)]/20 transition-colors peer-checked:bg-[var(--trail-orange)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--trail-orange)] peer-focus-visible:ring-offset-2" />
        <span aria-hidden="true" className="absolute left-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

function RangeSetting({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (value: number) => void }) {
  return (
    <label className="block space-y-1.5 py-1">
      <span className="flex items-center justify-between gap-3 text-sm text-[var(--evergreen)]">
        <span className="leading-snug">{label}</span>
        <span aria-hidden="true" className="shrink-0 rounded-md bg-[var(--evergreen)]/5 px-2 py-1 text-xs font-semibold tabular-nums">{value}{unit && ` ${unit}`}</span>
      </span>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))}
        className="block h-5 w-full cursor-pointer accent-[var(--trail-orange)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trail-orange)]" />
    </label>
  );
}

export function LocationChapterControls() {
  const { t } = useI18n();
  const { allCoordinates } = useComputedJourney();
  const { results: startPlaces, hasStart, retry } = useStartLocationLevels(allCoordinates[0]);
  const saved = useAppStore(state => state.settings.locationChapters);
  const setSettings = useAppStore(state => state.setSettings);
  const settings = { ...defaults, ...saved };
  const update = (next: Partial<LocationChapterSettings>) => setSettings({ locationChapters: { ...settings, ...next } });
  const selectedIntroLevels = getIntroLevels(settings);
  const availableIntroLevels = LOCATION_LEVELS.filter(level => startPlaces[level].status === 'available');
  const checkingStart = hasStart && LOCATION_LEVELS.some(level => startPlaces[level].status === 'pending');
  const startErrors = hasStart && LOCATION_LEVELS.some(level => startPlaces[level].status === 'error');
  const levelLabel = (level: LocationLevel) => level === 'country' ? t('locationChapters.country') : level === 'region' ? t('locationChapters.region') : t('locationChapters.adminLevel');

  return (
    <section className="space-y-4" aria-label={t('locationChapters.title')}>
      <p className="text-xs leading-relaxed text-[var(--evergreen-60)]">{t('locationChapters.description')}</p>
      {settings.level === 'off' && hasStart && <p className="text-xs leading-relaxed text-[var(--evergreen-60)]">{t('locationChapters.privacy')}</p>}

      <fieldset className="space-y-3">
        <legend className="text-sm font-bold text-[var(--evergreen)]"><span className="inline-flex items-center gap-1.5"><Route className="h-4 w-4 text-[var(--trail-orange)]" aria-hidden="true" />{t('locationChapters.playbackTitle')}</span></legend>
        <label className="block text-xs font-semibold text-[var(--evergreen)]">{t('locationChapters.playbackLevel')}
          <select aria-label={t('locationChapters.playbackLevel')} className="mt-1.5 min-h-11 w-full rounded-lg border border-[var(--evergreen)]/25 bg-white px-3 text-sm text-[var(--evergreen)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trail-orange)]" value={settings.level} onChange={event => update({ level: event.target.value as LocationChapterSettings['level'], ...(settings.level !== 'off' && !settings.introLevels ? { introLevels: getIntroLevels(settings) } : {}) })}>
            <option value="off">{t('locationChapters.off')}</option>
            {LOCATION_LEVELS.map(level => {
              const result = startPlaces[level];
              const place = !hasStart ? '' : result.status === 'available' ? result.name : result.status === 'pending' ? t('locationChapters.startChecking') : result.status === 'error' ? t('locationChapters.startFailed') : t('locationChapters.startMissing');
              const label = level === 'country' || level === 'region' ? `${levelLabel(level)} (${levelCode(level)})` : `${levelCode(level)} · ${levelLabel(level)}`;
              return <option key={level} value={level}>{label}{place ? ` — ${place}` : ''}</option>;
            })}
          </select>
        </label>
        <p className="text-xs leading-relaxed text-[var(--evergreen-60)]">{t('locationChapters.playbackLevelHint')}</p>
        <div aria-live="polite" className="space-y-1 text-xs leading-relaxed text-[var(--evergreen-60)]">
          {!hasStart && <p>{t('locationChapters.startNoRoute')}</p>}
          {checkingStart && <p>{t('locationChapters.startLoading')}</p>}
          {startErrors && <p>{t('locationChapters.startError')} {!checkingStart && <button type="button" className="font-semibold underline" onClick={retry}>{t('locationChapters.startRetry')}</button>}</p>}
        </div>
        {settings.level !== 'off' && <div className="space-y-2 border-t border-[var(--evergreen)]/10 pt-2">
          <ToggleRow label={t('locationChapters.playbackZoom')} checked={settings.zoomToPlace} onChange={checked => update({ zoomToPlace: checked, introZoomToPlace: settings.introZoomToPlace ?? settings.zoomToPlace })} />
          {settings.zoomToPlace && <>
            <RangeSetting label={t('locationChapters.zoomDuration')} value={getZoomDurationSeconds(settings)} min={4} max={20} step={.5} unit="s" onChange={value => update({ zoomDurationSeconds: value })} />
            <p className="text-xs leading-relaxed text-[var(--evergreen-60)]">{t('locationChapters.zoomDurationHint')}</p>
          </>}
          <RangeSetting label={t('locationChapters.revealDuration')} value={settings.durationSeconds} min={2} max={8} step={.5} unit="s" onChange={value => update({ durationSeconds: value })} />
          <p className="text-xs leading-relaxed text-[var(--evergreen-60)]">{t('locationChapters.revealDurationHint')}</p>
          <RangeSetting label={t('locationChapters.minimumStay')} value={getMinimumStaySeconds(settings)} min={0} max={2} step={.1} unit="s" onChange={value => update({ minimumStaySeconds: value })} />
          <p className="text-xs leading-relaxed text-[var(--evergreen-60)]">{t('locationChapters.minimumStayHint')}</p>
        </div>}
      </fieldset>

      {settings.level !== 'off' && <>
        <fieldset className="space-y-3 border-t border-[var(--evergreen)]/10 pt-4">
          <legend className="text-sm font-bold text-[var(--evergreen)]"><span className="inline-flex items-center gap-1.5"><MapPinned className="h-4 w-4 text-[var(--trail-orange)]" aria-hidden="true" />{t('locationChapters.introLevels')}</span></legend>
          <p className="text-xs leading-relaxed text-[var(--evergreen-60)]">{t('locationChapters.introLevelsHint')}</p>
          <div className="divide-y divide-[var(--evergreen)]/10 border-y border-[var(--evergreen)]/10">
            {availableIntroLevels.map(level => {
              const checked = selectedIntroLevels.includes(level);
              const accessibleLabel = `${levelLabel(level)} (${levelCode(level)})`;
              return <label key={level} className="relative block cursor-pointer">
                <input type="checkbox" aria-label={accessibleLabel} className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" checked={checked} onChange={event => update({ introLevels: event.target.checked ? [...selectedIntroLevels, level] : selectedIntroLevels.filter(item => item !== level) })} />
                <span className="flex min-h-12 items-center gap-3 py-2 text-xs font-medium text-[var(--evergreen)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--trail-orange)]">
                  <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-[var(--trail-orange)] text-[var(--trail-orange)]' : 'border-[var(--evergreen)]/35'}`}>{checked && <Check className="h-3 w-3" />}</span>
                  <span className="min-w-0 flex-1"><span className="block">{startPlaces[level].name}</span><span className="mt-0.5 block text-[var(--evergreen-60)]">{level === 'country' || level === 'region' ? `${levelLabel(level)} · ${levelCode(level)}` : levelCode(level)}</span></span>
                </span>
              </label>;
            })}
          </div>
          <div aria-live="polite" className="space-y-1 text-xs leading-relaxed text-[var(--evergreen-60)]">
            {hasStart && !checkingStart && !startErrors && availableIntroLevels.length === 0 && <p>{t('locationChapters.startNone')}</p>}
          </div>
          {availableIntroLevels.some(level => selectedIntroLevels.includes(level)) && <div className="space-y-2 border-t border-[var(--evergreen)]/10 pt-2">
            <ToggleRow label={t('locationChapters.introZoom')} checked={settings.introZoomToPlace ?? settings.zoomToPlace} onChange={checked => update({ introZoomToPlace: checked })} />
            <RangeSetting label={t('locationChapters.introDuration')} value={getIntroDuration(settings) / 1000} min={5} max={30} step={1} unit="s" onChange={value => update({ introDurationSeconds: value })} />
          </div>}
        </fieldset>

        <details className="group border-t border-[var(--evergreen)]/10">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 text-sm font-bold text-[var(--evergreen)] [&::-webkit-details-marker]:hidden">
            <Palette className="h-4 w-4 text-[var(--trail-orange)]" aria-hidden="true" />
            <span className="flex-1">{t('locationChapters.appearanceTitle')}</span>
            <span aria-hidden="true" className="h-4 w-4 rounded-full border border-[var(--evergreen)]/20" style={{ backgroundColor: settings.color }} />
            <ChevronDown className="h-4 w-4 text-[var(--evergreen-60)] transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="space-y-2 border-t border-[var(--evergreen)]/10 pb-3 pt-2">
            <label className="flex min-h-10 items-center justify-between gap-3 text-sm text-[var(--evergreen)]">{t('locationChapters.color')}<input aria-label={t('locationChapters.color')} type="color" value={settings.color} onChange={event => update({ color: event.target.value })} className="h-9 w-12 cursor-pointer rounded-md border border-[var(--evergreen)]/20 bg-white p-1" /></label>
            <RangeSetting label={t('locationChapters.width')} value={settings.width} min={1} max={8} step={1} onChange={value => update({ width: value })} />
            {([['fill', 'fill'], ['showName', 'showName'], ['showFlag', 'showFlag']] as const).map(([key, label]) => <ToggleRow key={key} label={t(`locationChapters.${label}`)} checked={settings[key]} onChange={checked => update({ [key]: checked })} />)}
            <ToggleRow label={t('locationChapters.traceBorder')} checked={settings.traceBorder !== false} onChange={checked => update({ traceBorder: checked })} />
          </div>
        </details>
        <div className="space-y-2 text-xs leading-relaxed text-[var(--evergreen-60)]">
          <p>{t('locationChapters.coverage')}</p><p>{t('locationChapters.privacy')}</p><p>{t('locationChapters.credit')}</p>
        </div>
      </>}
    </section>
  );
}
