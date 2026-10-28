import type { VideoExportSettings } from '@/types';
import { ASPECT_RATIO_OPTIONS, FPS_OPTIONS, getResolution, QUALITY_OPTIONS } from './exportConfig';
import { localStudioDownload } from './studioDelivery';

type Props = {
  settings: VideoExportSettings;
  onChange: (settings: Partial<VideoExportSettings>) => void;
  disabled: boolean;
  mp4Supported: boolean;
  studioSupported: boolean;
  estimatedSize: string;
  durationSeconds: number;
  studioDeliveryEmail: string;
  onStudioDeliveryEmailChange: (email: string) => void;
  marketingConsent: boolean;
  consentDefaultsLoaded: boolean;
  onMarketingConsentChange: (value: boolean) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function VideoSettingsInline({ settings, onChange, disabled, mp4Supported, studioSupported, estimatedSize, durationSeconds, studioDeliveryEmail, onStudioDeliveryEmailChange, marketingConsent, consentDefaultsLoaded, onMarketingConsentChange, t }: Props) {
  const selectClass = 'min-w-0 w-28 rounded-md border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-2 py-2 text-xs font-semibold text-[var(--evergreen)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trail-orange)] disabled:opacity-50';
  const rowClass = 'flex min-h-11 items-center justify-between gap-2 border-b border-[var(--evergreen)]/10 py-1 text-xs text-[var(--evergreen)]';
  const studioDisabled = !studioSupported || settings.format !== 'mp4';
  const effectiveQuality = QUALITY_OPTIONS.find((option) => {
    const size = getResolution(option.value, settings.aspectRatio);
    return size.width === settings.resolution.width && size.height === settings.resolution.height;
  })?.value;
  const selectedQuality = effectiveQuality ?? 'custom';
  return <div className="space-y-4">
    <section aria-label={t('export.title')} className="space-y-1">
      <h3 className="text-sm font-bold text-[var(--evergreen)]">{t('export.title')}</h3>
      <label className={rowClass}><span>{t('export.format')}</span><select aria-label={t('export.format')} className={selectClass} value={settings.format} disabled={disabled} onChange={(event) => {
        const format = event.target.value as VideoExportSettings['format'];
        onChange({ format, qualityMode: format === 'webm' ? 'standard' : settings.qualityMode });
      }}><option value="mp4">MP4</option><option value="webm">WebM</option></select></label>
      {settings.format === 'mp4' && !mp4Supported && <p className="text-xs text-amber-800" role="status">{t('export.mp4Unsupported')}</p>}
      <div className="space-y-2 border-b border-[var(--evergreen)]/10 py-2">
        <span className="text-xs text-[var(--evergreen)]">{t('export.aspectRatio')}</span>
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={t('export.aspectRatio')}>
          {ASPECT_RATIO_OPTIONS.map((option) => (
            <button key={option.id} type="button" disabled={disabled} aria-pressed={settings.aspectRatio === option.id}
              onClick={() => {
                const quality = effectiveQuality ?? settings.quality;
                onChange({ aspectRatio: option.id, quality, resolution: getResolution(quality, option.id) });
              }}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${settings.aspectRatio === option.id ? 'border-[var(--trail-orange)] bg-[var(--trail-orange)]/10 text-[var(--evergreen)]' : 'border-[var(--evergreen)]/15 text-[var(--evergreen)] hover:border-[var(--trail-orange)]/50 hover:bg-[var(--evergreen)]/5'}`}>
              <span aria-hidden="true" className="flex h-5 items-center justify-center"><span className={`block rounded-[2px] border-2 ${settings.aspectRatio === option.id ? 'border-[var(--trail-orange)]' : 'border-[var(--evergreen)]/50'} ${option.id === '16:9' ? 'h-[15px] w-7' : option.id === '1:1' ? 'h-5 w-5' : option.id === '4:5' ? 'h-5 w-4' : 'h-5 w-[11px]'}`} /></span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>
      <label className={rowClass}><span>{t('export.quality')}</span><select aria-label={t('export.quality')} className={selectClass} value={selectedQuality} disabled={disabled} onChange={(event) => {
        const quality = event.target.value as VideoExportSettings['quality'];
        onChange({ quality, resolution: getResolution(quality, settings.aspectRatio) });
      }}>{!effectiveQuality && <option value="custom" disabled>{settings.resolution.width}×{settings.resolution.height}</option>}{QUALITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label className={rowClass}><span>{t('export.frameRate')}</span><select aria-label={t('export.frameRate')} className={selectClass} value={settings.fps} disabled={disabled} onChange={(event) => onChange({ fps: Number(event.target.value) as VideoExportSettings['fps'] })}>{FPS_OPTIONS.map((fps) => <option key={fps} value={fps}>{t('export.fpsLabel', { fps })}</option>)}</select></label>
    </section>
    <section className="space-y-2" aria-label={t('export.qualityMode')}>
      <h3 className="text-sm font-bold text-[var(--evergreen)]">{t('export.qualityMode')}</h3>
      <div className="flex overflow-hidden rounded-lg border border-[var(--evergreen)]/20" role="group" aria-label={t('export.qualityMode')}>
        {(['standard', 'studio'] as const).map((mode) => <button key={mode} type="button" disabled={disabled || (mode === 'studio' && studioDisabled)} aria-pressed={settings.qualityMode === mode} onClick={() => onChange({ qualityMode: mode })} className={`min-h-10 flex-1 px-2 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${settings.qualityMode === mode ? 'bg-[var(--evergreen)] text-[var(--canvas)]' : 'text-[var(--evergreen)] hover:bg-[var(--evergreen)]/5'}`}>{t(mode === 'studio' ? 'export.qualityModeStudio' : 'export.qualityModeStandard')}</button>)}
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--evergreen-60)]">{t(settings.qualityMode === 'studio' ? 'export.qualityModeStudioHint' : 'export.qualityModeStandardHint')}</p>
      {studioDisabled && <p className="text-[11px] leading-relaxed text-[var(--evergreen-60)]">{t(settings.format !== 'mp4' ? 'export.studioNeedsMp4' : 'export.qualityModeStudioUnavailable')}</p>}
      {settings.qualityMode === 'studio' && (localStudioDownload ? <p className="text-xs text-[var(--evergreen-60)]">{t('export.studioLocalSummary')}</p> : <div className="space-y-2">
        <label htmlFor="studio-inline-email" className="block text-xs font-semibold text-[var(--evergreen)]">{t('export.studioEmailLabel')}</label>
        <input id="studio-inline-email" type="email" autoComplete="email" required disabled={disabled} value={studioDeliveryEmail} onChange={(event) => onStudioDeliveryEmailChange(event.target.value)} placeholder={t('export.studioEmailPlaceholder')} className="w-full rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--evergreen)] focus:border-[var(--trail-orange)] focus:outline-none" />
        <p className="text-[11px] leading-relaxed text-[var(--evergreen-60)]">{t('export.studioEmailHint')}</p>
        <label className="flex items-start gap-2 text-xs text-[var(--evergreen)]"><input type="checkbox" checked={marketingConsent} disabled={disabled || !consentDefaultsLoaded} onChange={(event) => onMarketingConsentChange(event.target.checked)} className="mt-0.5 accent-[var(--trail-orange)]" /><span>{t('export.marketingConsent')}</span></label>
        <p className="pl-5 text-[11px] text-[var(--evergreen-60)]">{t('export.marketingConsentHint')}</p>
      </div>)}
    </section>
    <div className="grid grid-cols-3 gap-2 rounded-lg bg-[var(--evergreen)]/5 px-3 py-2 text-[10px] text-[var(--evergreen-60)]">
      <div><span className="block">{t('export.resolution')}</span><strong className="text-xs text-[var(--evergreen)]">{settings.resolution.width}×{settings.resolution.height}</strong></div>
      <div><span className="block">{t('export.duration')}</span><strong className="text-xs text-[var(--evergreen)]">{durationSeconds}s</strong></div>
      <div><span className="block">{t('export.estimatedSize')}</span><strong className="text-xs text-[var(--evergreen)]">≈ {estimatedSize}</strong></div>
    </div>
  </div>;
}
