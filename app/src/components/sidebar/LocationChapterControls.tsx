import { useAppStore } from '@/store/useAppStore';
import type { LocationChapterSettings } from '@/types';
import { useI18n } from '@/i18n/useI18n';

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
    <label className="block text-sm">{t('locationChapters.level')}
      <select aria-label={t('locationChapters.level')} className="mt-1 w-full rounded border p-2" value={settings.level} onChange={e => update({ level: e.target.value as LocationChapterSettings['level'] })}>
        <option value="off">{t('locationChapters.off')}</option><option value="country">{t('locationChapters.country')}</option><option value="region">{t('locationChapters.region')}</option>
      </select>
    </label>
    {settings.level !== 'off' && <div className="space-y-2 text-sm">
      <p className="text-xs text-[var(--evergreen-60)]">{t('locationChapters.playHint')}</p>
      <label className="flex items-center justify-between">{t('locationChapters.color')}<input aria-label={t('locationChapters.color')} type="color" value={settings.color} onChange={e => update({ color: e.target.value })} /></label>
      <label className="flex items-center justify-between">{t('locationChapters.width')}<input aria-label={t('locationChapters.width')} type="range" min="1" max="8" step="1" value={settings.width} onChange={e => update({ width: Number(e.target.value) })} /></label>
      {([['fill', 'fill'], ['showName', 'showName'], ['showFlag', 'showFlag'], ['zoomToPlace', 'zoom']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={settings[key]} onChange={e => update({ [key]: e.target.checked })} />{t(`locationChapters.${label}`)}</label>)}
      {settings.level === 'region' && <label className="flex items-center gap-2"><input type="checkbox" checked={settings.introCountryFirst ?? false} onChange={e => update({ introCountryFirst: e.target.checked })} />{t('locationChapters.introCountryFirst')}</label>}
      <label className="flex items-center justify-between">{t('locationChapters.duration')}<input aria-label={t('locationChapters.duration')} type="range" min="2" max="8" step="0.5" value={settings.durationSeconds} onChange={e => update({ durationSeconds: Number(e.target.value) })} /><output>{settings.durationSeconds}</output></label>
      <p className="text-xs text-[var(--evergreen-60)]">{t('locationChapters.coverage')}</p>
      <p className="text-xs text-[var(--evergreen-60)]">{t('locationChapters.privacy')}</p>
      <p className="text-xs text-[var(--evergreen-60)]">{t('locationChapters.credit')}</p>
    </div>}
  </section>;
}
