import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { useProjectFile } from '@/hooks/useProjectFile';
import { ExportSettingsModal } from './export/ExportSettingsModal';
import { QUALITY_OPTIONS } from './export/exportConfig';
import { useVideoExportRecorder } from './export/useVideoExportRecorder';
import { isValidDeliveryEmail, localStudioDownload } from './export/studioDelivery';
import { SocialSharePanel } from './export/SocialSharePanel';
import { AlertTriangle, Check, Download, Film, ImageIcon, Instagram, Loader2, Save, Settings, Sparkles, X } from 'lucide-react';

export function ExportPanel() {
  const { t } = useI18n();
  const videoExportSettings = useAppStore((state) => state.videoExportSettings);
  const setVideoExportSettings = useAppStore((state) => state.setVideoExportSettings);
  const playback = useAppStore((state) => state.playback);
  const exportMode = useAppStore((state) => state.exportSubMode);
  const setExportMode = useAppStore((state) => state.setExportSubMode);
  const tracks = useAppStore((state) => state.tracks);
  const isAppExporting = useAppStore((state) => state.isExporting);
  const journeyName = useAppStore((state) => state.journey?.name);
  const updateJourneyName = useAppStore((state) => state.updateJourneyName);
  const [showSettings, setShowSettings] = useState(false);
  const [studioDeliveryEmail, setStudioDeliveryEmail] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [consentDefaultsLoaded, setConsentDefaultsLoaded] = useState(false);
  const consentTouchedRef = useRef(false);
  const { saveProject, isSaving } = useProjectFile();

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetch('/api/consent-defaults', { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body: unknown) => {
        if (!consentTouchedRef.current && body && typeof body === 'object') {
          const defaults = body as { marketingPreTicked?: unknown };
          setMarketingConsent(defaults.marketingPreTicked === true);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // Consent defaults fail closed: the optional box remains unticked.
      })
      .finally(() => {
        if (active) setConsentDefaultsLoaded(true);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const {
    actualFormat,
    estimatedSize,
    exportProgress,
    exportStage,
    exportedBlob,
    handleCancelExport,
    handleDownload,
    handleStartExport,
    isExporting,
    mp4Supported,
    resetExportResult,
    studioDeliveryError,
    studioDeliveryStatus,
    studioSupported,
  } = useVideoExportRecorder({
    studioDelivery: {
      email: studioDeliveryEmail,
      marketingConsent,
    },
  });
  const studioEmailValid = localStudioDownload || isValidDeliveryEmail(studioDeliveryEmail);

  // The Instagram share prompt used to be a small card buried in the
  // scrollable sidebar (easy to miss). Surface it as a centered overlay
  // instead — much harder not to notice right when the export finishes.
  // Re-arming `shareModalDismissed` when `exportedBlob` changes identity (a
  // new export just finished) directly in the render body — rather than in
  // a useEffect — is React's recommended pattern for resetting state in
  // response to a prop/value change: https://react.dev/learn/you-might-not-need-an-effect
  const [shareModalDismissed, setShareModalDismissed] = useState(false);
  const [acknowledgedBlob, setAcknowledgedBlob] = useState<Blob | null>(null);
  if (exportedBlob !== acknowledgedBlob) {
    setAcknowledgedBlob(exportedBlob);
    setShareModalDismissed(false);
  }
  const showShareModal = Boolean(exportedBlob)
    && !isExporting
    && studioDeliveryStatus === 'idle'
    && !shareModalDismissed;

  return (
    <div className="space-y-4">
      {/* Save Project */}
      <div className="rounded-lg border border-[var(--evergreen)]/15 bg-[var(--evergreen)]/3 p-3">
        <h3 className="text-sm font-bold text-[var(--evergreen)]">{t('export.saveProjectTitle')}</h3>
        <p className="mt-0.5 text-xs text-[var(--evergreen-60)]">{t('export.saveProjectBody')}</p>
        <label className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--evergreen-60)]">
          {t('export.projectNameLabel')}
        </label>
        <input
          type="text"
          value={journeyName ?? ''}
          onChange={(event) => updateJourneyName(event.target.value)}
          disabled={!journeyName}
          placeholder={t('export.projectNamePlaceholder')}
          className="mt-1 w-full rounded-lg border border-[var(--evergreen)]/20 bg-white/90 px-3 py-2 text-sm text-[var(--evergreen)] focus:outline-none focus:border-[var(--trail-orange)] disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => saveProject('sidebar')}
          disabled={isAppExporting || isSaving || tracks.length === 0}
          className="tr-btn tr-btn-secondary mt-3 flex w-full items-center justify-center gap-1.5 py-2 text-sm disabled:opacity-45 disabled:cursor-not-allowed"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('sidebar.saveProject')}
        </button>
      </div>

      {/* Mode switch */}
      <div className="grid grid-cols-2 gap-1">
        <button
          onClick={() => setExportMode('video')}
          className={`py-2 rounded text-sm font-medium flex items-center justify-center gap-1.5 border transition-colors ${
            exportMode === 'video'
              ? 'bg-[var(--evergreen)] text-[var(--canvas)] border-[var(--evergreen)]'
              : 'bg-transparent border-[var(--evergreen-20)] text-[var(--evergreen)] hover:bg-[var(--evergreen-10)]'
          }`}
        >
          <Film className="w-3.5 h-3.5" /> {t('imageExport.modeVideo')}
        </button>
        <button
          onClick={() => setExportMode('image')}
          className={`py-2 rounded text-sm font-medium flex items-center justify-center gap-1.5 border transition-colors ${
            exportMode === 'image'
              ? 'bg-[var(--evergreen)] text-[var(--canvas)] border-[var(--evergreen)]'
              : 'bg-transparent border-[var(--evergreen-20)] text-[var(--evergreen)] hover:bg-[var(--evergreen-10)]'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" /> {t('imageExport.modeImage')}
        </button>
      </div>

      {exportMode === 'image' ? (
        <SocialSharePanel />
      ) : (
        <>
          <div className="bg-[var(--evergreen)] text-[var(--canvas)] p-4 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm uppercase tracking-wide">{t('export.title')}</h3>
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-1.5 whitespace-nowrap rounded border border-white/20 px-2 py-1.5 text-[11px] font-semibold hover:bg-white/10"
              >
                <Settings className="w-3.5 h-3.5" />
                {t('export.openSettings')}
              </button>
            </div>

            {videoExportSettings.qualityMode === 'studio' && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--trail-orange)] bg-white/10 p-2.5">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--trail-orange)]" aria-hidden="true" />
                <div>
                  <p className="text-xs font-bold text-[var(--canvas)]">
                    {t('export.qualityModeStudio')}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-4 text-[var(--canvas)]/70">
                    {t(localStudioDownload ? 'export.studioLocalSummary' : 'export.studioSidebarSummary')}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="opacity-70">{t('export.format')}:</span>
                <span className="ml-2 font-bold uppercase">
                  {actualFormat.toUpperCase()}
                  {videoExportSettings.format === 'mp4' && !mp4Supported && (
                    <span className="ml-1 text-yellow-400 text-xs">{t('export.fallbackWebm')}</span>
                  )}
                </span>
              </div>
              <div>
                <span className="opacity-70">{t('export.ratio')}:</span>
                <span className="ml-2 font-bold">{videoExportSettings.aspectRatio}</span>
              </div>
              <div>
                <span className="opacity-70">{t('export.quality')}:</span>
                <span className="ml-2 font-bold">
                  {QUALITY_OPTIONS.find((option) => option.value === videoExportSettings.quality)?.label} · {videoExportSettings.fps}fps
                  {videoExportSettings.qualityMode === 'studio' && (
                    <span className="ml-1.5 rounded bg-[var(--trail-orange)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                      {t('export.qualityModeStudio')}
                    </span>
                  )}
                </span>
              </div>
              <div>
                <span className="opacity-70">{t('export.duration')}:</span>
                <span className="ml-2 font-bold">{Math.round(playback.totalDuration / 1000)}s</span>
              </div>
            </div>
          </div>

          <div className="bg-[var(--trail-orange-15)] border border-[var(--trail-orange)] rounded-lg p-3">
            <p className="text-xs text-[var(--evergreen)]">
              <strong>{t('export.howItWorksTitle')}</strong> {t('export.howItWorksBody')}
            </p>
          </div>

          {!isExporting && !exportedBlob && (
            <button
              onClick={handleStartExport}
              disabled={playback.totalDuration === 0
                || (videoExportSettings.qualityMode === 'studio' && !studioEmailValid)}
              className="w-full tr-btn tr-btn-primary flex items-center justify-center gap-2 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Film className="w-5 h-5" />
              {t('export.generateVideo')}
            </button>
          )}

          {playback.totalDuration === 0 && !isExporting && (
            <p className="text-xs text-center text-[var(--evergreen-60)]">
              {t('export.needsJourney')}
            </p>
          )}

          {videoExportSettings.qualityMode === 'studio' && !studioEmailValid && !isExporting && (
            <p className="text-xs text-center text-red-700">
              {t('export.studioEmailRequired')}
            </p>
          )}

          {!exportedBlob && studioDeliveryStatus === 'failed' && !isExporting && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <strong>{t('export.deliverySetupFailed')}</strong>
              {studioDeliveryError && <span className="mt-1 block text-xs">{studioDeliveryError}</span>}
            </div>
          )}

          {isExporting && (
            <div className="tr-export-progress">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-[var(--evergreen)]">{exportStage}</span>
                <span className="text-sm font-bold text-[var(--trail-orange)]">{Math.round(exportProgress)}%</span>
              </div>

              <div className="tr-progress-bar mb-4">
                <div className="tr-progress-fill" style={{ width: `${exportProgress}%` }} />
              </div>

              <div className="flex items-center gap-2 mb-4 text-sm text-[var(--evergreen)]">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                {t('export.recordingInProgress')}
              </div>

              {videoExportSettings.qualityMode === 'studio' && (
                <div className="mb-4 flex items-start gap-2 rounded border border-yellow-200 bg-yellow-50 p-2 text-xs text-yellow-800">
                  <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                  {t('export.studioTabWarning')}
                </div>
              )}

              <button
                onClick={handleCancelExport}
                className="w-full tr-btn tr-btn-secondary flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" />
                {t('common.cancel')}
              </button>
            </div>
          )}

          {exportedBlob && !isExporting && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg">
                <Check className="w-5 h-5" />
                <span className="font-medium">{t('export.complete')}</span>
              </div>

              {studioDeliveryStatus === 'sent' && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                  {t('export.deliverySent', { email: studioDeliveryEmail.trim() })}
                </div>
              )}
              {studioDeliveryStatus === 'failed' && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                  <strong>{t('export.deliveryFailed')}</strong>
                  {studioDeliveryError && <span className="mt-1 block text-xs">{studioDeliveryError}</span>}
                </div>
              )}

              {(studioDeliveryStatus === 'idle' || studioDeliveryStatus === 'failed') && (
                <button
                  onClick={handleDownload}
                  className="w-full tr-btn tr-btn-primary flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {studioDeliveryStatus === 'failed'
                    ? t('export.downloadRecovery')
                    : t('export.downloadAgain')}
                </button>
              )}

              <button onClick={resetExportResult} className="w-full tr-btn tr-btn-secondary">
                {t('export.newExport')}
              </button>
            </div>
          )}

          <ExportSettingsModal
            estimatedSize={estimatedSize}
            isOpen={showSettings}
            mp4Supported={mp4Supported}
            studioSupported={studioSupported}
            onClose={() => setShowSettings(false)}
            consentDefaultsLoaded={consentDefaultsLoaded}
            marketingConsent={marketingConsent}
            onMarketingConsentChange={(checked) => {
              consentTouchedRef.current = true;
              setMarketingConsent(checked);
            }}
            onStudioDeliveryEmailChange={setStudioDeliveryEmail}
            setVideoExportSettings={setVideoExportSettings}
            studioDeliveryEmail={studioDeliveryEmail}
            t={t}
            videoExportSettings={videoExportSettings}
          />

          {showShareModal && (
            <div
              className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
              onClick={() => setShareModalDismissed(true)}
            >
              <div
                className="relative w-full max-w-sm rounded-xl bg-[var(--canvas)] p-6 text-center shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setShareModalDismissed(true)}
                  className="absolute top-3 right-3 p-1 rounded-full hover:bg-black/5"
                  aria-label={t('common.close')}
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-2 justify-center text-green-600 bg-green-50 px-3 py-2 rounded-lg mb-4">
                  <Check className="w-5 h-5" />
                  <span className="font-medium text-sm">{t('export.complete')}</span>
                </div>

                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--trail-orange)] text-white shadow-sm">
                  <Instagram className="w-7 h-7" aria-hidden="true" />
                </div>

                <h4 className="mt-4 text-base font-semibold text-[var(--evergreen)]">
                  {t('export.shareTitle')}
                </h4>
                <p className="mt-2 text-sm leading-6 text-[var(--evergreen-80)]">
                  {t('export.shareBodyBefore')}{' '}
                  <a
                    href="https://www.instagram.com/trailreplay/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[var(--evergreen)] underline decoration-[var(--trail-orange)] underline-offset-2 hover:text-[var(--trail-orange)]"
                  >
                    @trailreplay
                  </a>{' '}
                  {t('export.shareBodyAfter')}
                </p>
                <p className="mt-3 text-sm font-medium leading-6 text-[var(--evergreen)]">
                  {t('export.shareFeature')}
                </p>

                <button
                  onClick={() => setShareModalDismissed(true)}
                  className="mt-5 w-full tr-btn tr-btn-primary"
                >
                  {t('common.close')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
