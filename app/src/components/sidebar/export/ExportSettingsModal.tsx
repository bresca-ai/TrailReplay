import { AlertTriangle, Monitor, Sparkles } from 'lucide-react';
import type { VideoExportSettings, VideoQuality } from '@/types';
import {
  ASPECT_RATIO_OPTIONS,
  FPS_OPTIONS,
  getResolution,
  QUALITY_OPTIONS,
} from './exportConfig';
import { localStudioDownload } from './studioDelivery';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

interface ExportSettingsModalProps {
  consentDefaultsLoaded: boolean;
  estimatedSize: string;
  isOpen: boolean;
  marketingConsent: boolean;
  mp4Supported: boolean;
  onClose: () => void;
  onMarketingConsentChange: (checked: boolean) => void;
  onStudioDeliveryEmailChange: (email: string) => void;
  setVideoExportSettings: (settings: Partial<VideoExportSettings>) => void;
  studioDeliveryEmail: string;
  studioSupported: boolean;
  t: TranslateFn;
  videoExportSettings: VideoExportSettings;
}

export function ExportSettingsModal({
  consentDefaultsLoaded,
  estimatedSize,
  isOpen,
  marketingConsent,
  mp4Supported,
  onClose,
  onMarketingConsentChange,
  onStudioDeliveryEmailChange,
  setVideoExportSettings,
  studioDeliveryEmail,
  studioSupported,
  t,
  videoExportSettings,
}: ExportSettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--canvas)] border-2 border-[var(--evergreen)] rounded-xl p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-[var(--evergreen)] mb-4">
          {t('export.title')}
        </h3>

        <div className="mb-4">
          <label className="block text-sm font-medium text-[var(--evergreen)] mb-2">
            {t('export.format')}
          </label>
          <div className="flex gap-2">
            {(['mp4', 'webm'] as const).map((format) => (
              <button
                key={format}
                onClick={() => setVideoExportSettings({
                  format,
                  qualityMode: format === 'webm' ? 'standard' : videoExportSettings.qualityMode,
                })}
                className={`
                  flex-1 py-2 px-3 rounded-lg text-sm font-medium uppercase transition-colors
                  ${videoExportSettings.format === format
                    ? 'bg-[var(--trail-orange)] text-[var(--canvas)]'
                    : 'bg-[var(--evergreen)]/10 text-[var(--evergreen)] hover:bg-[var(--evergreen)]/20'
                  }
                `}
              >
                {format}
              </button>
            ))}
          </div>
          {videoExportSettings.format === 'mp4' && !mp4Supported && (
            <div className="mt-2 flex items-start gap-2 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-2">
              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              {t('export.mp4Unsupported')}
            </div>
          )}
          {videoExportSettings.format === 'mp4' && mp4Supported && (
            <p className="mt-1 text-xs text-[var(--evergreen-60)]">{t('export.mp4Supported')}</p>
          )}
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-[var(--evergreen)] mb-2">
            {t('export.aspectRatio')}
          </label>
          <div className="flex gap-2">
            {ASPECT_RATIO_OPTIONS.map((aspectRatio) => (
              <button
                key={aspectRatio.id}
                onClick={() => setVideoExportSettings({
                  aspectRatio: aspectRatio.id,
                  resolution: getResolution(videoExportSettings.quality, aspectRatio.id),
                })}
                className={`
                  flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-xs font-medium transition-colors
                  ${videoExportSettings.aspectRatio === aspectRatio.id
                    ? 'bg-[var(--trail-orange)] text-[var(--canvas)]'
                    : 'bg-[var(--evergreen)]/10 text-[var(--evergreen)] hover:bg-[var(--evergreen)]/20'
                  }
                `}
              >
                <span
                  className={`
                    border-2 rounded-sm
                    ${videoExportSettings.aspectRatio === aspectRatio.id ? 'border-white/70' : 'border-[var(--evergreen)]/40'}
                    ${aspectRatio.id === '16:9' ? 'w-8 h-[18px]' : aspectRatio.id === '1:1' ? 'w-5 h-5' : 'w-[11px] h-5'}
                  `}
                />
                <span className="font-bold">{aspectRatio.label}</span>
                <span className="opacity-70 text-[10px]">{t(aspectRatio.descriptionKey)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-[var(--evergreen)] mb-2">
            {t('export.quality')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {QUALITY_OPTIONS.map((qualityOption) => (
              <button
                key={qualityOption.value}
                onClick={() => setVideoExportSettings({
                  quality: qualityOption.value as VideoQuality,
                  resolution: getResolution(qualityOption.value, videoExportSettings.aspectRatio),
                })}
                className={`
                  py-2 px-3 rounded-lg text-sm font-medium transition-colors
                  ${videoExportSettings.quality === qualityOption.value
                    ? 'bg-[var(--trail-orange)] text-[var(--canvas)]'
                    : 'bg-[var(--evergreen)]/10 text-[var(--evergreen)] hover:bg-[var(--evergreen)]/20'
                  }
                `}
              >
                {qualityOption.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-[var(--evergreen)] mb-2">
            {t('export.qualityMode')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(['standard', 'studio'] as const).map((mode) => {
              // Studio pacing only exists on the deterministic MP4 encoder.
              const isDisabled = mode === 'studio'
                && (!studioSupported || videoExportSettings.format !== 'mp4');
              const isSelected = videoExportSettings.qualityMode === mode && !isDisabled;
              const isStudio = mode === 'studio';
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={isDisabled}
                  onClick={() => setVideoExportSettings({ qualityMode: mode })}
                  className={`
                    relative min-h-24 rounded-lg border-2 px-3 py-3 text-left transition-colors
                    disabled:opacity-40 disabled:cursor-not-allowed
                    ${isSelected
                      ? isStudio
                        ? 'border-[var(--trail-orange)] bg-[var(--trail-orange)] text-[var(--canvas)]'
                        : 'border-[var(--evergreen)] bg-[var(--evergreen)] text-[var(--canvas)]'
                      : isStudio
                        ? 'border-[var(--trail-orange)]/60 bg-[var(--trail-orange-15)] text-[var(--evergreen)] hover:border-[var(--trail-orange)]'
                        : 'border-transparent bg-[var(--evergreen)]/10 text-[var(--evergreen)] hover:bg-[var(--evergreen)]/20'
                    }
                  `}
                >
                  <span className="flex items-center gap-1.5 text-sm font-bold">
                    {isStudio && <Sparkles className="h-4 w-4" aria-hidden="true" />}
                    {isStudio ? t('export.qualityModeStudio') : t('export.qualityModeStandard')}
                  </span>
                  {isStudio && (
                    <span className={`mt-1 inline-block text-[10px] font-bold uppercase tracking-[0.06em] ${isSelected ? 'text-[var(--canvas)]' : 'text-[var(--trail-orange)]'}`}>
                      {t('export.qualityModeStudioBadge')}
                    </span>
                  )}
                  <span className={`mt-1.5 block text-[11px] leading-4 ${isSelected ? 'opacity-80' : 'text-[var(--evergreen-60)]'}`}>
                    {isStudio
                      ? t('export.qualityModeStudioSummary')
                      : t('export.qualityModeStandardSummary')}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-[var(--evergreen-60)]">
            {videoExportSettings.qualityMode === 'studio'
              ? t('export.qualityModeStudioHint')
              : t('export.qualityModeStandardHint')}
          </p>
          {!studioSupported && (
            <div className="mt-2 flex items-start gap-2 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-2">
              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              {t('export.qualityModeStudioUnavailable')}
            </div>
          )}
        </div>

        {videoExportSettings.qualityMode === 'studio' && localStudioDownload && (
          <p className="mb-4 rounded-lg border border-[var(--trail-orange)]/40 bg-[var(--trail-orange-15)] p-3 text-sm text-[var(--evergreen)]">
            {t('export.studioLocalSummary')}
          </p>
        )}

        {videoExportSettings.qualityMode === 'studio' && !localStudioDownload && (
          <div className="mb-4 rounded-lg border border-[var(--trail-orange)]/40 bg-[var(--trail-orange-15)] p-3">
            <label
              htmlFor="studio-delivery-email"
              className="block text-sm font-medium text-[var(--evergreen)]"
            >
              {t('export.studioEmailLabel')}
            </label>
            <input
              id="studio-delivery-email"
              type="email"
              autoComplete="email"
              required
              value={studioDeliveryEmail}
              onChange={(event) => onStudioDeliveryEmailChange(event.target.value)}
              placeholder={t('export.studioEmailPlaceholder')}
              className="mt-2 w-full rounded-lg border border-[var(--evergreen)]/20 bg-white px-3 py-2 text-sm text-[var(--evergreen)] focus:border-[var(--trail-orange)] focus:outline-none"
            />
            <p className="mt-1 text-xs text-[var(--evergreen-60)]">
              {t('export.studioEmailHint')}
            </p>

            <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-[var(--evergreen)]">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--trail-orange)]"
                checked={marketingConsent}
                disabled={!consentDefaultsLoaded}
                onChange={(event) => onMarketingConsentChange(event.target.checked)}
              />
              <span>{t('export.marketingConsent')}</span>
            </label>
            <p className="ml-6 mt-1 text-[11px] text-[var(--evergreen-60)]">
              {t('export.marketingConsentHint')}
            </p>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-[var(--evergreen)] mb-2">
            {t('export.frameRate')}
          </label>
          <div className="flex gap-2">
            {FPS_OPTIONS.map((fps) => (
              <button
                key={fps}
                onClick={() => setVideoExportSettings({ fps })}
                className={`
                  flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors
                  ${videoExportSettings.fps === fps
                    ? 'bg-[var(--trail-orange)] text-[var(--canvas)]'
                    : 'bg-[var(--evergreen)]/10 text-[var(--evergreen)] hover:bg-[var(--evergreen)]/20'
                  }
                `}
              >
                {t('export.fpsLabel', { fps })}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[var(--evergreen)]/10 rounded-lg p-3 flex items-center gap-2 mb-4">
          <Monitor className="w-4 h-4 text-[var(--evergreen-60)]" />
          <span className="text-sm text-[var(--evergreen)]">
            <strong>{videoExportSettings.resolution.width}×{videoExportSettings.resolution.height}</strong>
            <span className="text-[var(--evergreen-60)] ml-2">≈ {estimatedSize}</span>
          </span>
        </div>

        <button
          onClick={onClose}
          className="w-full tr-btn tr-btn-primary"
        >
          {t('common.done')}
        </button>
      </div>
    </div>
  );
}
