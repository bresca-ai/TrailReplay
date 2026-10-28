import { Instagram } from '@/components/icons/brandIcons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n/useI18n';
import { useProjectFile } from '@/hooks/useProjectFile';
import { ExportSettingsModal } from './export/ExportSettingsModal';
import { getResolution, QUALITY_OPTIONS } from './export/exportConfig';
import { VideoSettingsInline } from './export/VideoSettingsInline';
import { useVideoExportRecorder } from './export/useVideoExportRecorder';
import { isValidDeliveryEmail, localStudioDownload } from './export/studioDelivery';
import { SocialSharePanel } from './export/SocialSharePanel';
import { useSocialShareExport } from './export/useSocialShareExport';
import { AlertTriangle, Check, Download, ChevronDown, Film, ImageIcon, Loader2, Save, Settings, X } from 'lucide-react';
import type { SocialShareAspectRatio } from '@/types';

export function ExportPanel() {
  const { t } = useI18n();
  const videoExportSettings = useAppStore((state) => state.videoExportSettings);
  const setVideoExportSettings = useAppStore((state) => state.setVideoExportSettings);
  const setSocialShareSettings = useAppStore((state) => state.setSocialShareSettings);
  const coverPreviewUrl = useAppStore((state) => state.videoCoverImageUrl);
  const setCoverPreviewUrl = useAppStore((state) => state.setVideoCoverImageUrl);
  const playback = useAppStore((state) => state.playback);
  const exportMode = useAppStore((state) => state.exportSubMode);
  const setExportMode = useAppStore((state) => state.setExportSubMode);
  const tracks = useAppStore((state) => state.tracks);
  const isAppExporting = useAppStore((state) => state.isExporting);
  const journeyName = useAppStore((state) => state.journey?.name);
  const updateJourneyName = useAppStore((state) => state.updateJourneyName);
  const studioDeliveryEmail = useAppStore((state) => state.studioDeliveryEmail);
  const setStudioDeliveryEmail = useAppStore((state) => state.setStudioDeliveryEmail);
  const [showSettings, setShowSettings] = useState(false);
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
    coverImageUrl: videoExportSettings.includeCover ? coverPreviewUrl : null,
  });
  const studioEmailValid = localStudioDownload || isValidDeliveryEmail(studioDeliveryEmail);
  const coverMode = videoExportSettings.includeCover;
  const effectiveQuality = QUALITY_OPTIONS.find((option) => {
    const size = getResolution(option.value, videoExportSettings.aspectRatio);
    return size.width === videoExportSettings.resolution.width && size.height === videoExportSettings.resolution.height;
  })?.value;
  // One renderer owns the preview across both tabs, including in-flight edits.
  const socialExport = useSocialShareExport(exportMode === 'image' || (coverMode && !coverPreviewUrl));
  const coverAspectRatio = videoExportSettings.aspectRatio;
  const receiveCoverPoster = useCallback((url: string) => setCoverPreviewUrl(url), [setCoverPreviewUrl]);
  const openCoverEditor = () => {
    setVideoExportSettings({ includeCover: true });
    setSocialShareSettings({ aspectRatio: coverAspectRatio });
    setExportMode('image');
  };
  const returnToVideo = () => {
    setExportMode('video');
  };
  const changeCoverAspectRatio = (ratio: SocialShareAspectRatio) => {
    setCoverPreviewUrl(null);
    setVideoExportSettings({
      aspectRatio: ratio,
      resolution: getResolution(videoExportSettings.quality, ratio),
    });
    setSocialShareSettings({ aspectRatio: ratio });
  };

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
      <details className="group rounded-lg border border-[var(--evergreen)]/15">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-[var(--evergreen)] hover:text-[var(--trail-orange)]"><Save className="h-4 w-4" aria-hidden="true" /><span className="flex-1">{t('export.saveProjectTitle')}</span><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
        <div className="space-y-2 border-t border-[var(--evergreen)]/10 px-3 pb-3 pt-2">
        <p className="mt-0.5 text-xs text-[var(--evergreen-60)]">{t('export.saveProjectBody')}</p>
        <label htmlFor="export-project-name" className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--evergreen-60)]">
          {t('export.projectNameLabel')}
        </label>
        <input
          id="export-project-name"
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
      </details>

      {/* Mode switch */}
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button" onClick={returnToVideo} disabled={isAppExporting} aria-pressed={exportMode === 'video'}
          className={`py-2 rounded text-sm font-medium flex items-center justify-center gap-1.5 border transition-colors ${
            exportMode === 'video'
              ? 'bg-[var(--evergreen)] text-[var(--canvas)] border-[var(--evergreen)]'
              : 'bg-transparent border-[var(--evergreen-20)] text-[var(--evergreen)] hover:bg-[var(--evergreen-10)]'
          }`}
        >
          <Film className="w-3.5 h-3.5" /> {t('imageExport.modeVideo')}
        </button>
        <button
          type="button" onClick={() => setExportMode('image')} disabled={isAppExporting} aria-pressed={exportMode === 'image'}
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
        <SocialSharePanel
          exportController={socialExport}
          coverMode={coverMode}
          aspectRatioOverride={coverMode ? coverAspectRatio : undefined}
          onAspectRatioChange={coverMode ? changeCoverAspectRatio : undefined}
          onPosterReady={coverMode ? receiveCoverPoster : undefined}
          onUseCover={returnToVideo}
        />
      ) : (
        <>
          <VideoSettingsInline
            settings={videoExportSettings} onChange={setVideoExportSettings} disabled={isExporting}
            mp4Supported={mp4Supported} studioSupported={studioSupported} estimatedSize={estimatedSize}
            durationSeconds={Math.round(playback.totalDuration / 1000)} studioDeliveryEmail={studioDeliveryEmail}
            onStudioDeliveryEmailChange={setStudioDeliveryEmail} marketingConsent={marketingConsent} consentDefaultsLoaded={consentDefaultsLoaded}
            onMarketingConsentChange={(checked) => { consentTouchedRef.current = true; setMarketingConsent(checked); }} t={t}
          />

          {(!exportedBlob || videoExportSettings.includeCover) && (
            <div className="rounded-xl border border-[var(--evergreen)]/15 bg-[var(--evergreen)]/[0.03] p-3 text-[var(--evergreen)]">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={videoExportSettings.includeCover}
                  disabled={isExporting || !!exportedBlob}
                  onChange={(event) => {
                    if (event.target.checked) openCoverEditor();
                    else {
                      setVideoExportSettings({ includeCover: false });
                      setCoverPreviewUrl(null);
                    }
                  }}
                  className="mt-0.5 h-4 w-4 accent-[var(--trail-orange)]"
                />
                <span>
                  <span className="block text-sm font-semibold">{t('export.addVideoCover')}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-[var(--evergreen-60)]">{t('export.addVideoCoverHint')}</span>
                </span>
              </label>
              {videoExportSettings.includeCover && coverPreviewUrl && (
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-[var(--evergreen)]/10 bg-white/70 p-2">
                  <img
                    src={coverPreviewUrl}
                    alt={t('imageExport.videoCover')}
                    className="max-h-36 w-auto max-w-24 shrink-0 rounded-md object-contain shadow-sm"
                  />
                  <span className="text-xs leading-5 text-[var(--evergreen-60)]">{t('imageExport.videoCoverHint')}</span>
                </div>
              )}
              {videoExportSettings.includeCover && !isExporting && !exportedBlob ? (
                <button type="button" onClick={openCoverEditor} className="tr-btn tr-btn-secondary mt-3 flex w-full items-center justify-center gap-2 py-2 text-xs">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {coverPreviewUrl ? t('export.editVideoCover') : t('export.designVideoCover')}
                </button>
              ) : null}
            </div>
          )}

          {!isExporting && !exportedBlob && (
            <button
              onClick={handleStartExport}
              disabled={playback.totalDuration === 0
                || (videoExportSettings.includeCover && (!coverPreviewUrl || socialExport.isRendering))
                || (videoExportSettings.qualityMode === 'studio' && !studioEmailValid)}
              className="w-full tr-btn tr-btn-primary flex items-center justify-center gap-2 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Film className="w-5 h-5" />
              {t('export.generateVideo')}
            </button>
          )}

          {!isExporting && !exportedBlob && videoExportSettings.includeCover && !coverPreviewUrl ? (
            <p className="text-center text-xs text-[var(--evergreen-60)]">{t('export.designCoverBeforeExport')}</p>
          ) : null}

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

          {!isExporting && !exportedBlob && <>
            <button type="button" onClick={() => setShowSettings(true)} className="flex min-h-10 w-full items-center gap-2 border-t border-[var(--evergreen)]/15 py-2 text-left text-xs font-semibold text-[var(--evergreen)] hover:text-[var(--trail-orange)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trail-orange)]"><Settings className="h-4 w-4" aria-hidden="true" /><span className="flex-1">{t('export.openSettings')}</span><ChevronDown className="h-4 w-4" aria-hidden="true" /></button>
            <details className="text-xs text-[var(--evergreen-60)]"><summary className="cursor-pointer font-semibold text-[var(--evergreen)]">{t('export.howItWorksTitle')}</summary><p className="mt-2 leading-relaxed">{t('export.howItWorksBody')}</p></details>
          </>}

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
            videoExportSettings={effectiveQuality ? { ...videoExportSettings, quality: effectiveQuality } : videoExportSettings}
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
