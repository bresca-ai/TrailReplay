import { useAppStore } from '@/store/useAppStore';
import type { LocationChapterSettings } from '@/types';
import { useI18n } from '@/i18n/useI18n';
import { LOCATION_LEVELS, levelCode } from '@/utils/locationBoundaries';
import { getIntroDuration, getIntroLevels, getMinimumStaySeconds } from '@/utils/locationChapterCamera';

const defaults: LocationChapterSettings = { level: 'off', color: '#ffbd66', width: 3, fill: true, showName: true, showFlag: true, zoomToPlace: true, durationSeconds: 4.5 };
export function LocationChapterControls() {
  const { t } = useI18n();
  const saved = useAppStore(state => state.settings.locationChapters);
  const setSettings = useAppStore(state => state.setSettings);
  const settings = { ...defaults, ...saved };
  const update = (next: Partial<LocationChapterSettings>) => setSettings({ locationChapters: { ...settings, ...next } });
  return <section className="space-y-3 border-t border-[var(--evergreen)]/20 pt-4" aria-label={t('locationChapters.title')}>
    <h3 className="text-sm font-bold uppercase tracking-wide">{t('locationChapters.title')}</h3>
    <p className="text-xs text-[var(--evergreen-60)]">{t('locationChapters.description')}</p>
    <fieldset className="space-y-2 rounded border border-[var(--evergreen)]/20 p-3 text-sm">
      <legend className="px-1 font-semibold">{t('locationChapters.playbackTitle')}</legend>
      <label className="block">{t('locationChapters.playbackLevel')}
        <select aria-label={t('locationChapters.playbackLevel')} className="mt-1 w-full rounded border p-2" value={settings.level} onChange={e => update({ level: e.target.value as LocationChapterSettings['level'], ...(settings.level !== 'off' && !settings.introLevels ? { introLevels: getIntroLevels(settings) } : {}) })}>
          <option value="off">{t('locationChapters.offAll')}</option>{LOCATION_LEVELS.map(level => <option key={level} value={level}>{level === 'country' ? t('locationChapters.country') : level === 'region' ? t('locationChapters.region') : t('locationChapters.adminLevel')} ({levelCode(level)})</option>)}
        </select>
      </label>
      <p className="text-xs text-[var(--evergreen-60)]">{t('locationChapters.playbackLevelHint')}</p>
      {settings.level !== 'off' && <>
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.zoomToPlace} onChange={e => update({ zoomToPlace: e.target.checked, introZoomToPlace: settings.introZoomToPlace ?? settings.zoomToPlace })} />{t('locationChapters.playbackZoom')}</label>
        <label className="flex items-center justify-between gap-2">{t('locationChapters.revealDuration')}<input aria-label={t('locationChapters.revealDuration')} type="range" min="2" max="8" step="0.5" value={settings.durationSeconds} onChange={e => update({ durationSeconds: Number(e.target.value) })} /><output>{settings.durationSeconds}</output></label>
        <label className="flex items-center justify-between gap-2">{t('locationChapters.minimumStay')}<input aria-label={t('locationChapters.minimumStay')} type="range" min="0" max="2" step="0.1" value={getMinimumStaySeconds(settings)} onChange={e => update({ minimumStaySeconds: Number(e.target.value) })} /><output>{getMinimumStaySeconds(settings)}</output></label>
        <p className="text-xs text-[var(--evergreen-60)]">{t('locationChapters.minimumStayHint')}</p>
      </>}
    </fieldset>
    {settings.level !== 'off' && <div className="space-y-3 text-sm">
      <fieldset className="space-y-1 rounded border border-[var(--evergreen)]/20 p-2">
        <legend className="px-1 font-semibold">{t('locationChapters.introLevels')}</legend>
        <p className="text-xs text-[var(--evergreen-60)]">{t('locationChapters.introLevelsHint')}</p>
        {LOCATION_LEVELS.map(level => <label key={level} className="flex items-center gap-2"><input type="checkbox" checked={getIntroLevels(settings).includes(level)} onChange={e => update({ introLevels: e.target.checked ? [...getIntroLevels(settings), level] : getIntroLevels(settings).filter(item => item !== level) })} />{level === 'country' ? t('locationChapters.country') : level === 'region' ? t('locationChapters.region') : t('locationChapters.adminLevel')} ({levelCode(level)})</label>)}
        {getIntroLevels(settings).length > 0 && <>
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.introZoomToPlace ?? settings.zoomToPlace} onChange={e => update({ introZoomToPlace: e.target.checked })} />{t('locationChapters.introZoom')}</label>
          <label className="flex items-center justify-between gap-2">{t('locationChapters.introDuration')}<input aria-label={t('locationChapters.introDuration')} type="range" min="5" max="30" step="1" value={getIntroDuration(settings) / 1000} onChange={e => update({ introDurationSeconds: Number(e.target.value) })} /><output>{getIntroDuration(settings) / 1000}</output></label>
        </>}
      </fieldset>
      <fieldset className="space-y-2 rounded border border-[var(--evergreen)]/20 p-3"><legend className="px-1 font-semibold">{t('locationChapters.appearanceTitle')}</legend>
      <label className="flex items-center justify-between">{t('locationChapters.color')}<input aria-label={t('locationChapters.color')} type="color" value={settings.color} onChange={e => update({ color: e.target.value })} /></label>
      <label className="flex items-center justify-between">{t('locationChapters.width')}<input aria-label={t('locationChapters.width')} type="range" min="1" max="8" step="1" value={settings.width} onChange={e => update({ width: Number(e.target.value) })} /></label>
      {([['fill', 'fill'], ['showName', 'showName'], ['showFlag', 'showFlag']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={settings[key]} onChange={e => update({ [key]: e.target.checked })} />{t(`locationChapters.${label}`)}</label>)}
      <label className="flex items-center gap-2"><input type="checkbox" checked={settings.traceBorder !== false} onChange={e => update({ traceBorder: e.target.checked })} />{t('locationChapters.traceBorder')}</label>
      </fieldset>
      <p className="text-xs text-[var(--evergreen-60)]">{t('locationChapters.coverage')}</p>
      <p className="text-xs text-[var(--evergreen-60)]">{t('locationChapters.privacy')}</p>
      <p className="text-xs text-[var(--evergreen-60)]">{t('locationChapters.credit')}</p>
    </div>}
  </section>;
}
