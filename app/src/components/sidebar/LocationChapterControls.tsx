import { Check, ChevronDown, MapPinned, Palette, Route } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { LocationChapterSettings } from '@/types';
import { useI18n } from '@/i18n/useI18n';
import { LOCATION_LEVELS, levelCode, type LocationLevel } from '@/utils/locationBoundaries';
import { getIntroDuration, getIntroLevels, getMinimumStaySeconds } from '@/utils/locationChapterCamera';

const defaults: LocationChapterSettings = { level: 'off', color: '#ffbd66', width: 3, fill: true, showName: true, showFlag: true, zoomToPlace: true, durationSeconds: 4.5 };

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

function RangeSetting({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="block space-y-1.5 py-1">
      <span className="flex items-center justify-between gap-3 text-sm text-[var(--evergreen)]">
        <span className="leading-snug">{label}</span>
        <span aria-hidden="true" className="shrink-0 rounded-md bg-[var(--evergreen)]/5 px-2 py-1 text-xs font-semibold tabular-nums">{value}</span>
      </span>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))}
        className="block h-5 w-full cursor-pointer accent-[var(--trail-orange)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trail-orange)]" />
    </label>
  );
}

export function LocationChapterControls() {
  const { t } = useI18n();
  const saved = useAppStore(state => state.settings.locationChapters);
  const setSettings = useAppStore(state => state.setSettings);
  const settings = { ...defaults, ...saved };
  const update = (next: Partial<LocationChapterSettings>) => setSettings({ locationChapters: { ...settings, ...next } });
  const selectedIntroLevels = getIntroLevels(settings);
  const levelLabel = (level: LocationLevel) => level === 'country' ? t('locationChapters.country') : level === 'region' ? t('locationChapters.region') : t('locationChapters.adminLevel');

  return (
    <section className="space-y-4 border-t border-[var(--evergreen)]/15 pt-5" aria-label={t('locationChapters.title')}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--trail-orange)]/10 text-[var(--trail-orange)]"><MapPinned className="h-4 w-4" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--evergreen)]">{t('locationChapters.title')}</h3>
            <span className="rounded-full bg-[var(--evergreen)]/5 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--evergreen-60)]">{settings.level === 'off' ? t('locationChapters.off') : levelCode(settings.level)}</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--evergreen-60)]">{t('locationChapters.description')}</p>
        </div>
      </div>

      <fieldset className="space-y-3 rounded-xl border border-[var(--evergreen)]/15 bg-[var(--evergreen)]/[0.025] p-3">
        <legend className="px-1 text-sm font-bold text-[var(--evergreen)]"><span className="inline-flex items-center gap-1.5"><Route className="h-4 w-4 text-[var(--trail-orange)]" aria-hidden="true" />{t('locationChapters.playbackTitle')}</span></legend>
        <label className="block text-xs font-semibold text-[var(--evergreen)]">{t('locationChapters.playbackLevel')}
          <select aria-label={t('locationChapters.playbackLevel')} className="mt-1.5 min-h-11 w-full rounded-lg border border-[var(--evergreen)]/25 bg-white px-3 text-sm text-[var(--evergreen)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trail-orange)]" value={settings.level} onChange={event => update({ level: event.target.value as LocationChapterSettings['level'], ...(settings.level !== 'off' && !settings.introLevels ? { introLevels: getIntroLevels(settings) } : {}) })}>
            <option value="off">{t('locationChapters.off')}</option>
            {LOCATION_LEVELS.map(level => <option key={level} value={level}>{level === 'country' || level === 'region' ? `${levelLabel(level)} (${levelCode(level)})` : `${levelCode(level)} · ${levelLabel(level)}`}</option>)}
          </select>
        </label>
        <p className="text-xs leading-relaxed text-[var(--evergreen-60)]">{t('locationChapters.playbackLevelHint')}</p>
        {settings.level !== 'off' && <div className="space-y-2 border-t border-[var(--evergreen)]/10 pt-2">
          <ToggleRow label={t('locationChapters.playbackZoom')} checked={settings.zoomToPlace} onChange={checked => update({ zoomToPlace: checked, introZoomToPlace: settings.introZoomToPlace ?? settings.zoomToPlace })} />
          <RangeSetting label={t('locationChapters.revealDuration')} value={settings.durationSeconds} min={2} max={8} step={.5} onChange={value => update({ durationSeconds: value })} />
          <RangeSetting label={t('locationChapters.minimumStay')} value={getMinimumStaySeconds(settings)} min={0} max={2} step={.1} onChange={value => update({ minimumStaySeconds: value })} />
          <p className="text-xs leading-relaxed text-[var(--evergreen-60)]">{t('locationChapters.minimumStayHint')}</p>
        </div>}
      </fieldset>

      {settings.level !== 'off' && <>
        <fieldset className="space-y-3 rounded-xl border border-[var(--evergreen)]/15 bg-[var(--evergreen)]/[0.025] p-3">
          <legend className="px-1 text-sm font-bold text-[var(--evergreen)]"><span className="inline-flex items-center gap-1.5"><MapPinned className="h-4 w-4 text-[var(--trail-orange)]" aria-hidden="true" />{t('locationChapters.introLevels')}</span></legend>
          <p className="text-xs leading-relaxed text-[var(--evergreen-60)]">{t('locationChapters.introLevelsHint')}</p>
          <div className="grid grid-cols-2 gap-2">
            {LOCATION_LEVELS.map(level => {
              const checked = selectedIntroLevels.includes(level);
              const accessibleLabel = `${levelLabel(level)} (${levelCode(level)})`;
              return <label key={level} className="relative block cursor-pointer">
                <input type="checkbox" aria-label={accessibleLabel} className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" checked={checked} onChange={event => update({ introLevels: event.target.checked ? [...selectedIntroLevels, level] : selectedIntroLevels.filter(item => item !== level) })} />
                <span className="flex min-h-11 items-center justify-between gap-1 rounded-lg border border-[var(--evergreen)]/20 bg-white px-2.5 py-2 text-xs font-medium text-[var(--evergreen)] transition-colors peer-checked:border-[var(--trail-orange)] peer-checked:bg-[var(--trail-orange)]/10 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--trail-orange)]">
                  <span>{level === 'country' || level === 'region' ? levelLabel(level) : levelCode(level)}</span>
                  <span className="flex items-center gap-1">{(level === 'country' || level === 'region') && <span className="text-[10px] text-[var(--evergreen-60)]">{levelCode(level)}</span>}{checked && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--trail-orange)]" aria-hidden="true" />}</span>
                </span>
              </label>;
            })}
          </div>
          {selectedIntroLevels.length > 0 && <div className="space-y-2 border-t border-[var(--evergreen)]/10 pt-2">
            <ToggleRow label={t('locationChapters.introZoom')} checked={settings.introZoomToPlace ?? settings.zoomToPlace} onChange={checked => update({ introZoomToPlace: checked })} />
            <RangeSetting label={t('locationChapters.introDuration')} value={getIntroDuration(settings) / 1000} min={5} max={30} step={1} onChange={value => update({ introDurationSeconds: value })} />
          </div>}
        </fieldset>

        <details className="group rounded-xl border border-[var(--evergreen)]/15 bg-[var(--evergreen)]/[0.025]">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 text-sm font-bold text-[var(--evergreen)] [&::-webkit-details-marker]:hidden">
            <Palette className="h-4 w-4 text-[var(--trail-orange)]" aria-hidden="true" />
            <span className="flex-1">{t('locationChapters.appearanceTitle')}</span>
            <span aria-hidden="true" className="h-4 w-4 rounded-full border border-[var(--evergreen)]/20" style={{ backgroundColor: settings.color }} />
            <ChevronDown className="h-4 w-4 text-[var(--evergreen-60)] transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="space-y-2 border-t border-[var(--evergreen)]/10 px-3 pb-3 pt-2">
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
