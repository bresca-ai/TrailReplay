import { INTRO_DURATION, OUTRO_DELAY, OUTRO_DURATION } from '@/components/playback/PlaybackProvider';
import { useAppStore } from '@/store/useAppStore';
import {
  getBlobSizeBucket,
  getProgressBucket,
  getVideoExportAnalyticsParams,
  trackEvent,
} from '@/utils/analytics';
import { getCameraUsageAnalyticsParams, trackConfigurationUsage } from '@/utils/configurationAnalytics';
import {
  annotationExportFrameStride,
  playbackTimeForRoute,
  routeTimeForPlayback,
} from '@/utils/annotationTiming';
import { getTriggeredPlaybackItems, getTriggeredPlaybackPictures } from '@/utils/playbackPictures';
import fixWebmDuration from 'fix-webm-duration';
import { useCallback, useEffect } from 'react';
import { getSupportedMimeType, getVideoBitrate } from './exportConfig';
import { createMp4CanvasEncoder } from './mp4CanvasEncoder';
import {
  createStudioDeliveryJob,
  deliverStudioExport,
  isValidDeliveryEmail,
  localStudioDownload,
  shouldAutoDownloadVideo,
} from './studioDelivery';
import { useVideoExportRecorderCore, type UseVideoExportRecorderOptions } from './useVideoExportRecorderCore';

const EXPORT_MAP_SETTLE_MS = 150;

export function useVideoExportRecorder(options: UseVideoExportRecorderOptions = {}) {
  const {
    t, language, studioDelivery, videoExportSettings, mapStyle, show3DTerrain, tracks,
    pictures, videos, journeySegments, cameraSettings, playback, animationPhase,
    isExporting, exportProgress, exportStage, setIsExporting, setIsDeterministicExport, setExportProgress, setExportStage,
    resetPlayback, setSpeed, play, setCinematicPlayed, exportedBlob, setExportedBlob, studioDeliveryStatus,
    setStudioDeliveryStatus, studioDeliveryError, setStudioDeliveryError, studioSupported, mp4Supported, actualFormat, estimatedSize,
    includeStats, includeElevation, loadHtml2Canvas, resetOverlayCapture, updateOverlayAsync, recordingCanvasRef, recordingContextRef,
    mediaRecorderRef, recordedChunksRef, recordingStartTimeRef, isRecordingRef, recordingCancelledRef, mp4EncoderRef, useWebCodecsRef, setUseWebCodecs,
    frameRequestRef, frameCleanupRef, cachedLogoRef, studioQualityRef, studioStatsRef, wakeLockRef, hiddenSinceRef,
    hiddenMsRef, studioDeliveryJobRef, captureFrame, encodeWebCodecsFrame, startFrameCapture, waitForMapFrame, waitForExportFrame,
    applyStudioMapSettings, restoreStudioMapSettings, requestScreenWakeLock, preloadExportOpeningTiles, captureDeterministicPhase, capturePictureHold, captureVideoHold,
    waitForVideoPopup,
  } = useVideoExportRecorderCore(options);

  // Flush the WebCodecs-encoded MP4 once recording has stopped. Standard
  // exports download immediately; Studio exports are delivered by email.
  const finalizeWebCodecsExport = useCallback(async () => {
    const encoder = mp4EncoderRef.current;
    if (!encoder) return;
    mp4EncoderRef.current = null;
    setUseWebCodecs(false);

    if (recordingCancelledRef.current) {
      encoder.close();
      setIsExporting(false);
      resetPlayback();
      return;
    }

    try {
      const blob = await encoder.finalize();
      if (blob.size > 0) {
        const studioStats = studioStatsRef.current;
        const wasStudioQuality = studioQualityRef.current;
        const studioTimedOut = wasStudioQuality && studioStats.timedOutFrames > 0;

        setExportedBlob(blob);
        // Never claim a clean studio render when some frames gave up waiting —
        // those frames contain exactly the soft fallback tiles this mode sells
        // the absence of.
        setExportStage(studioTimedOut
          ? t('export.stageCompleteStudioPartial', { frames: studioStats.timedOutFrames })
          : t('export.stageComplete'));
        setExportProgress(100);
        trackEvent('export_completed', {
          ...getVideoExportAnalyticsParams(videoExportSettings, 'mp4', playback.totalDuration),
          export_blob_size_bucket: getBlobSizeBucket(blob.size),
          export_encoder_path: 'webcodecs',
          export_quality_mode: wasStudioQuality ? 'studio' : 'standard',
          export_studio_timed_out_frames: studioStats.timedOutFrames,
        });

        if (shouldAutoDownloadVideo(wasStudioQuality ? 'studio' : 'standard', localStudioDownload)) {
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `trail-replay-${Date.now()}.mp4`;
          anchor.click();
          URL.revokeObjectURL(url);
        }

        const deliveryJob = studioDeliveryJobRef.current;
        if (wasStudioQuality && deliveryJob) {
          try {
            const deliveryResult = await deliverStudioExport(deliveryJob, blob, (phase) => {
              setStudioDeliveryStatus(phase);
              setExportStage(phase === 'uploading'
                ? t('export.stageUploadingVideo')
                : t('export.stageEmailingLink'));
            });
            setStudioDeliveryStatus('sent');
            setStudioDeliveryError(null);
            setExportStage(t('export.stageEmailSent'));
            trackEvent('studio_export_delivery_completed', {
              provider: deliveryResult.provider ?? 'unknown',
            });
          } catch (deliveryError) {
            console.error('Studio export delivery failed', deliveryError);
            const message = deliveryError instanceof Error ? deliveryError.message : String(deliveryError);
            setStudioDeliveryStatus('failed');
            setStudioDeliveryError(message);
            setExportStage(t('export.stageDeliveryFailed'));
            trackEvent('export_failed', {
              export_failure_scope: 'studio_delivery',
              export_format: 'mp4',
              export_encoder_path: 'webcodecs',
            });
          }
        }
      } else {
        setExportStage(t('export.stageFailedNoData'));
        trackEvent('export_failed', {
          export_failure_scope: 'no_data',
          export_format: 'mp4',
          export_encoder_path: 'webcodecs',
        });
      }
    } catch (error) {
      console.error('WebCodecs export failed', error);
      setExportStage(t('export.stageFailedWithError', { error: (error as Error).message }));
      trackEvent('export_failed', {
        export_failure_scope: 'encoder_finalize',
        export_format: 'mp4',
        export_encoder_path: 'webcodecs',
      });
    } finally {
      restoreStudioMapSettings();
      studioDeliveryJobRef.current = null;
      studioQualityRef.current = false;
      setIsDeterministicExport(false);
      setIsExporting(false);
      // Deterministic export drives the animation directly through its outro.
      // Restore an idle, replayable timeline once the file has been finalized.
      resetPlayback();
    }
  }, [mp4EncoderRef, playback.totalDuration, recordingCancelledRef, resetPlayback, restoreStudioMapSettings, setExportProgress, setExportStage, setExportedBlob, setIsDeterministicExport, setIsExporting, setStudioDeliveryError, setStudioDeliveryStatus, setUseWebCodecs, studioDeliveryJobRef, studioQualityRef, studioStatsRef, t, videoExportSettings]);

  const finishRecording = useCallback(() => {
    if (!isRecordingRef.current) return;

    isRecordingRef.current = false;

    if (frameCleanupRef.current) {
      frameCleanupRef.current();
      frameCleanupRef.current = null;
    }
    if (frameRequestRef.current) {
      cancelAnimationFrame(frameRequestRef.current);
      frameRequestRef.current = null;
    }

    setExportStage(t('export.stageFinalizing'));

    if (useWebCodecsRef.current) {
      void finalizeWebCodecsExport();
      return;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      // Flush the trailing partial timeslice before stopping so the tail of
      // the animation isn't dropped from the recording.
      if (recorder.state === 'recording') {
        try {
          recorder.requestData();
        } catch {
          // requestData can throw if the recorder already stopped; ignore.
        }
      }
      recorder.stop();
    }
  }, [finalizeWebCodecsExport, frameCleanupRef, frameRequestRef, isRecordingRef, mediaRecorderRef, setExportStage, t, useWebCodecsRef]);

  /**
   * Studio export is bound by tile network latency, not by the video's own
   * duration, so a percentage of the timeline sits near-still for minutes and
   * reads as a hang. Report encoded frames and a rolling estimate instead.
   * Time spent with the tab hidden is excluded: rAF is frozen there, so the
   * export makes no progress and that wall clock would poison the average.
   */
  const describeRecordingStage = useCallback((frameIndex: number, frameCount: number) => {
    if (!studioQualityRef.current) return t('export.recording');

    const hiddenMs = hiddenMsRef.current
      + (hiddenSinceRef.current === null ? 0 : performance.now() - hiddenSinceRef.current);
    const elapsedMs = performance.now() - recordingStartTimeRef.current - hiddenMs;
    const remainingMs = (elapsedMs / Math.max(1, frameIndex)) * Math.max(0, frameCount - frameIndex);
    const minutes = Math.round(remainingMs / 60000);

    return minutes < 1
      ? t('export.studioProgressSoon', { frame: frameIndex, total: frameCount })
      : t('export.studioProgress', { frame: frameIndex, total: frameCount, minutes });
  }, [hiddenMsRef, hiddenSinceRef, recordingStartTimeRef, studioQualityRef, t]);

  const runDeterministicExport = useCallback(async () => {
    if (!mp4EncoderRef.current) return;

    const { fps } = videoExportSettings;
    const frameDurationMs = 1000 / fps;
    const store = useAppStore.getState();
    const routeDurationMs = store.playback.totalDuration;
    const annotations = store.textAnnotations;
    const outputDurationMs = playbackTimeForRoute(routeDurationMs, routeDurationMs, annotations);
    // Preview speed only affects interactive playback. Export always preserves
    // the configured journey duration on the encoded timeline.
    const frameCount = Math.ceil(outputDurationMs / frameDurationMs);
    const progressUpdateInterval = Math.max(1, Math.round(fps / 5));

    setIsDeterministicExport(true);
    store.setPlayback({ isPlaying: true, currentTime: 0, progress: 0 });
    // Start the cinematic movement first and wait for its first rendered frame.
    // This ensures the video begins from the actual introductory camera pose,
    // rather than catching the map halfway through a state transition.
    store.setCinematicPlayed(false);
    store.setAnimationPhase('intro');
    setExportStage(t('export.recordingIntro'));
    await waitForMapFrame();
    await captureDeterministicPhase(INTRO_DURATION, 0);

    if (!isRecordingRef.current || recordingCancelledRef.current) return;

    store.setCinematicPlayed(true);
    store.setAnimationPhase('playing');
    setExportStage(describeRecordingStage(0, frameCount));
    let encodedDurationMs = INTRO_DURATION;
    // Mirrors App.tsx's live-playback picture trigger (`getTriggeredPlaybackPictures`),
    // but drives its own hold here so the export can freeze the route
    // position for the picture's full `displayDuration` instead of just
    // showing the popup over an already-advancing timeline.
    const shownPictureIds = new Set<string>();
    const shownVideoIds = new Set<string>();
    let previousProgress = 0;

    // The intro already contains the progress-zero pose. Begin at the first
    // advancing route frame so the cut into the route has no duplicate hold.
    let frameIndex = 1;
    let lastProgressUpdateFrame = 0;
    while (frameIndex <= frameCount) {
      if (!isRecordingRef.current || recordingCancelledRef.current) break;

      const currentTime = routeTimeForPlayback(Math.min(outputDurationMs, frameIndex * frameDurationMs), routeDurationMs, annotations);
      const progress = routeDurationMs > 0 ? currentTime / routeDurationMs : 1;
      const frameStride = Math.min(
        frameCount - frameIndex + 1,
        annotationExportFrameStride(currentTime, routeDurationMs, annotations),
      );
      const coveredThroughFrame = frameIndex + frameStride - 1;
      useAppStore.getState().setPlayback({ currentTime, progress });
      await waitForExportFrame();

      if (!isRecordingRef.current || recordingCancelledRef.current) break;
      captureFrame();
      // Match the original `(fixedBase + frameIndex * frameDurationMs)`
      // timestamp math exactly: increment before encoding, so frame 1 lands
      // at `INTRO_DURATION + frameDurationMs`, not `INTRO_DURATION` (which
      // would collide with the intro phase's own last encoded timestamp).
      const encodedTimestampMs = encodedDurationMs + frameDurationMs;
      const encodedFrameDurationMs = frameDurationMs * frameStride;
      await encodeWebCodecsFrame(encodedTimestampMs * 1000, encodedFrameDurationMs * 1000);
      encodedDurationMs += encodedFrameDurationMs;

      if (coveredThroughFrame - lastProgressUpdateFrame >= progressUpdateInterval || coveredThroughFrame === frameCount) {
        setExportProgress((coveredThroughFrame / frameCount) * 100);
        setExportStage(describeRecordingStage(coveredThroughFrame, frameCount));
        lastProgressUpdateFrame = coveredThroughFrame;
      }

      const triggeredPictures = getTriggeredPlaybackPictures({
        pictures,
        previousProgress,
        currentProgress: progress,
        shownPictureIds,
        queuedPictureIds: [],
      });
      const triggeredVideos = getTriggeredPlaybackItems({
        items: videos,
        previousProgress,
        currentProgress: progress,
        shownItemIds: shownVideoIds,
        queuedItemIds: [],
      });
      previousProgress = progress;

      // Photos and clips that fall in the same frame are held in route order,
      // so the export cuts between them the way the live replay does.
      const triggeredMedia = [
        ...triggeredPictures.map((picture) => ({ kind: 'picture' as const, picture })),
        ...triggeredVideos.map((video) => ({ kind: 'video' as const, video })),
      ].sort((a, b) => (
        (a.kind === 'picture' ? a.picture.progress : a.video.progress)
        - (b.kind === 'picture' ? b.picture.progress : b.video.progress)
      ));

      for (const media of triggeredMedia) {
        if (!isRecordingRef.current || recordingCancelledRef.current) break;

        if (media.kind === 'picture') {
          const picture = media.picture;
          shownPictureIds.add(picture.id);
          store.setSelectedPictureId(picture.id);
          const holdTimestampOffset = encodedDurationMs;
          const holdDurationMs = picture.displayDuration || 5000;
          // `progress`/`currentTime` are left untouched for the whole hold, so
          // the map/marker stay frozen; only `exportPictureHoldElapsedMs`
          // advances, driving the popup's own zoom/progress-bar animation.
          await capturePictureHold(holdDurationMs, holdTimestampOffset);
          encodedDurationMs = holdTimestampOffset + holdDurationMs;
          store.setSelectedPictureId(null);
          store.setExportPictureHoldElapsedMs(null);
          continue;
        }

        const video = media.video;
        shownVideoIds.add(video.id);
        // A clip whose file was never re-linked has nothing to decode; the
        // export skips it rather than freezing on a placeholder for its whole
        // length.
        if (video.isPlaceholder) continue;

        const holdTimestampOffset = encodedDurationMs;
        store.setExportVideoHoldTimeSeconds(0);
        store.setSelectedVideoId(video.id);
        const decodedDuration = await waitForVideoPopup();
        const clipDuration = decodedDuration ?? video.durationSeconds ?? 0;
        if (clipDuration > 0) {
          const heldMs = await captureVideoHold(clipDuration, holdTimestampOffset);
          encodedDurationMs = holdTimestampOffset + heldMs;
        }
        store.setSelectedVideoId(null);
        store.setExportVideoHoldTimeSeconds(null);
      }

      frameIndex += frameStride;
    }

    if (!recordingCancelledRef.current && isRecordingRef.current) {
      // Mirror the on-screen finale: a short hold at the finish, then the
      // outward camera move. Both are encoded before the file is finalized.
      store.setPlayback({ isPlaying: false, currentTime: routeDurationMs, progress: 1 });
      if (OUTRO_DELAY > 0) {
        store.setAnimationPhase('playing');
        await captureDeterministicPhase(OUTRO_DELAY, encodedDurationMs);
        encodedDurationMs += OUTRO_DELAY;
      }

      if (!isRecordingRef.current || recordingCancelledRef.current) return;
      store.setAnimationPhase('outro');
      setExportStage(t('export.recordingOutro'));
      await captureDeterministicPhase(OUTRO_DURATION, encodedDurationMs);
    }

    if (!recordingCancelledRef.current) finishRecording();
  }, [captureDeterministicPhase, captureFrame, capturePictureHold, captureVideoHold, describeRecordingStage, encodeWebCodecsFrame, finishRecording, isRecordingRef, mp4EncoderRef, pictures, recordingCancelledRef, setExportProgress, setExportStage, setIsDeterministicExport, t, videoExportSettings, videos, waitForExportFrame, waitForMapFrame, waitForVideoPopup]);

  useEffect(() => {
    if (!isRecordingRef.current) return;

    // The deterministic renderer reports encoded frames itself. React playback
    // updates must not overwrite its Studio ETA or reset the phase label.
    if (useWebCodecsRef.current) return;

    if (animationPhase === 'playing') {
      setExportProgress(playback.progress * 100);
      setExportStage(t('export.recording'));
    } else if (animationPhase === 'intro') {
      setExportStage(t('export.recordingIntro'));
    } else if (animationPhase === 'outro') {
      setExportStage(t('export.recordingOutro'));
    }

    if (animationPhase === 'ended') {
      setTimeout(() => {
        finishRecording();
      }, 1000);
    }
  }, [animationPhase, finishRecording, isRecordingRef, playback.progress, setExportProgress, setExportStage, t, useWebCodecsRef]);

  // Fallback path when WebCodecs MP4 encoding isn't available: record the canvas
  // stream with MediaRecorder. For WebM output we patch the duration on stop so
  // the file stays seekable and doesn't freeze in players other than Chrome.
  const setupMediaRecorderFallback = useCallback(() => {
    if (!recordingCanvasRef.current) return;

    const stream = recordingCanvasRef.current.captureStream(videoExportSettings.fps);
    const { mimeType, actualFormat: recordedFormat } = getSupportedMimeType(videoExportSettings.format);
    const extension = recordedFormat === 'mp4' ? 'mp4' : 'webm';

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: getVideoBitrate(videoExportSettings.quality),
    });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      // A cancelled export still fires onstop; don't save or download it.
      if (recordingCancelledRef.current) {
        setIsExporting(false);
        resetPlayback();
        return;
      }
      let blob = new Blob(recordedChunksRef.current, { type: mimeType });
      if (blob.size > 0) {
        // MediaRecorder writes WebM without a Duration/Cues header, so many
        // players (QuickTime, Windows, social uploads, editors) freeze after
        // the first cluster. Patch in the real measured duration so the file
        // is seekable and plays to the end everywhere.
        if (recordedFormat === 'webm') {
          const durationMs = recordingStartTimeRef.current > 0
            ? performance.now() - recordingStartTimeRef.current
            : 0;
          if (durationMs > 0) {
            try {
              blob = await fixWebmDuration(blob, durationMs, { logger: false });
            } catch (fixError) {
              console.warn('Failed to patch WebM duration, using raw recording', fixError);
            }
          }
        }

        setExportedBlob(blob);
        setExportStage(t('export.stageComplete'));
        setExportProgress(100);
        trackEvent('export_completed', {
          ...getVideoExportAnalyticsParams(videoExportSettings, extension, playback.totalDuration),
          export_blob_size_bucket: getBlobSizeBucket(blob.size),
          export_encoder_path: 'mediarecorder',
        });

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `trail-replay-${Date.now()}.${extension}`;
        anchor.click();
        URL.revokeObjectURL(url);
      } else {
        setExportStage(t('export.stageFailedNoData'));
        trackEvent('export_failed', {
          export_failure_scope: 'no_data',
          export_format: extension,
          export_encoder_path: 'mediarecorder',
        });
      }
      setIsExporting(false);
      // The screen-recording fallback completes after the normal animation has
      // reached its finale. Reset so the next Play starts a fresh replay.
      resetPlayback();
    };

    recorder.onerror = (event) => {
      // On weaker hardware the encoder can stall or error partway through a
      // high-resolution recording. Stop the capture loop and let onstop
      // finalize whatever was captured so the user still gets a video.
      console.error('MediaRecorder error during export', event);
      trackEvent('export_failed', {
        export_failure_scope: 'recorder_error',
        export_format: recordedFormat,
        export_encoder_path: 'mediarecorder',
      });
      if (frameCleanupRef.current) {
        frameCleanupRef.current();
        frameCleanupRef.current = null;
      }
      if (frameRequestRef.current) {
        cancelAnimationFrame(frameRequestRef.current);
        frameRequestRef.current = null;
      }
      isRecordingRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };

    recorder.start(100);
  }, [frameCleanupRef, frameRequestRef, isRecordingRef, mediaRecorderRef, playback.totalDuration, recordedChunksRef, recordingCancelledRef, recordingCanvasRef, recordingStartTimeRef, resetPlayback, setExportProgress, setExportStage, setExportedBlob, setIsExporting, t, videoExportSettings]);

  const handleStartExport = useCallback(async () => {
    const mapCanvas = document.querySelector('.maplibregl-canvas') as HTMLCanvasElement | null;
    if (!mapCanvas) {
      alert(t('export.noCanvas'));
      return;
    }
    if (videoExportSettings.qualityMode === 'studio') {
      if (!studioSupported) {
        alert(t('export.qualityModeStudioUnavailable'));
        return;
      }
      if (!localStudioDownload && (!studioDelivery || !isValidDeliveryEmail(studioDelivery.email))) {
        alert(t('export.studioEmailRequired'));
        return;
      }
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStage(t('export.stagePreparing'));
    setExportedBlob(null);
    setStudioDeliveryStatus('idle');
    setStudioDeliveryError(null);
    studioDeliveryJobRef.current = null;
    recordedChunksRef.current = [];
    recordingCancelledRef.current = false;
    setIsDeterministicExport(false);
    setUseWebCodecs(false);
    mp4EncoderRef.current = null;
    resetOverlayCapture();
    trackEvent('export_started', {
      ...getVideoExportAnalyticsParams(videoExportSettings, actualFormat, playback.totalDuration),
      export_include_stats: includeStats,
      export_include_elevation: includeElevation,
      track_count: tracks.length,
      picture_count: pictures.length,
      journey_segment_count: journeySegments.length,
      camera_mode: cameraSettings.mode,
      ...getCameraUsageAnalyticsParams(cameraSettings),
      has_annotations: useAppStore.getState().textAnnotations.length > 0,
      camera_preset: cameraSettings.mode === 'follow-behind' ? cameraSettings.followBehindPreset : 'not_applicable',
      // How much of the cinematic camera was actually authored, so exports
      // can be told apart from ones that only visited the mode.
      cinematic_keyframe_count: useAppStore.getState().cinematicCameraKeyframes.length,
      transport_segment_count: journeySegments.filter((segment) => segment.type === 'transport').length,
      map_style: mapStyle,
      terrain_3d_enabled: show3DTerrain,
    });
    trackConfigurationUsage('video_export', useAppStore.getState(), actualFormat);

    try {
      const { width, height } = videoExportSettings.resolution;

      setExportStage(t('export.stageCreateCanvas'));
      if (!recordingCanvasRef.current) {
        recordingCanvasRef.current = document.createElement('canvas');
      }
      recordingCanvasRef.current.width = width;
      recordingCanvasRef.current.height = height;
      recordingContextRef.current = recordingCanvasRef.current.getContext('2d');

      setExportStage(t('export.stageLoadOverlay'));
      await loadHtml2Canvas();

      cachedLogoRef.current = null;
      await new Promise<void>((resolve) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
          cachedLogoRef.current = image;
          resolve();
        };
        image.onerror = () => resolve();
        image.src = '/media/images/logohorizontal.svg';
      });

      await updateOverlayAsync(width, height);

      setExportStage(t('export.stageResetting'));
      const exportSpeed = useAppStore.getState().playback.speed;
      resetPlayback();
      setSpeed(exportSpeed);
      setCinematicPlayed(false);

      setExportStage(t('export.stagePreparing'));
      await preloadExportOpeningTiles();

      // Let MapLibre complete its reset pose before starting the intro and its
      // first encoded frame. This avoids a recording that begins mid-reframe.
      await new Promise((resolve) => setTimeout(resolve, EXPORT_MAP_SETTLE_MS));

      setExportStage(t('export.stageSetupRecorder'));

      // Preferred path: encode MP4 with WebCodecs + mp4-muxer. This produces a
      // clean, seekable file with a real moov/duration, avoiding the fragmented
      // MediaRecorder MP4 that freezes after the first fragment in many players.
      if (videoExportSettings.format === 'mp4') {
        try {
          mp4EncoderRef.current = await createMp4CanvasEncoder({
            width,
            height,
            fps: videoExportSettings.fps,
            bitrate: getVideoBitrate(videoExportSettings.quality),
          });
          setUseWebCodecs(mp4EncoderRef.current !== null);
        } catch (encoderError) {
          console.warn('WebCodecs MP4 encoder unavailable, falling back to MediaRecorder', encoderError);
          mp4EncoderRef.current = null;
          setUseWebCodecs(false);
        }
      }

      if (videoExportSettings.qualityMode === 'studio' && !useWebCodecsRef.current) {
        throw new Error(t('export.qualityModeStudioUnavailable'));
      }

      if (!useWebCodecsRef.current) {
        setupMediaRecorderFallback();
      }

      // Studio pacing only exists on the deterministic WebCodecs path. The
      // MediaRecorder fallback records against wall clock, so pausing between
      // frames to wait for tiles would stretch the video rather than sharpen it.
      studioQualityRef.current =
        videoExportSettings.qualityMode === 'studio' && useWebCodecsRef.current;
      studioStatsRef.current = { frames: 0, timedOutFrames: 0, waitedMs: 0 };
      hiddenMsRef.current = 0;
      hiddenSinceRef.current = document.hidden ? performance.now() : null;
      if (studioQualityRef.current) {
        if (!localStudioDownload) {
          setStudioDeliveryStatus('registering');
          setExportStage(t('export.stageRegisteringDelivery'));
          try {
            studioDeliveryJobRef.current = await createStudioDeliveryJob({
              email: studioDelivery!.email,
              marketingConsent: studioDelivery!.marketingConsent,
              locale: language,
              settings: {
                quality: videoExportSettings.quality,
                qualityMode: 'studio',
                aspectRatio: videoExportSettings.aspectRatio,
                fps: videoExportSettings.fps,
                durationMs: playback.totalDuration,
              },
            });
          } catch (deliveryError) {
            const message = deliveryError instanceof Error ? deliveryError.message : String(deliveryError);
            setStudioDeliveryStatus('failed');
            setStudioDeliveryError(message);
            throw deliveryError;
          }
        }
        applyStudioMapSettings();
        await requestScreenWakeLock();
      }

      setExportStage(t('export.stageStartingRecording'));
      recordingStartTimeRef.current = performance.now();
      isRecordingRef.current = true;

      setExportStage(t('export.stageRecordingAnimation'));
      if (useWebCodecsRef.current) {
        void runDeterministicExport().catch((error) => {
          console.error('Deterministic export failed', error);
          setExportStage(t('export.stageFailedWithError', { error: (error as Error).message }));
          finishRecording();
        });
      } else {
        startFrameCapture();
        await new Promise((resolve) => setTimeout(resolve, 200));
        play();
      }
    } catch (error) {
      console.error('Export failed:', error);
      trackEvent('export_failed', {
        export_failure_scope: 'setup',
        export_format: actualFormat,
        export_encoder_path: useWebCodecsRef.current ? 'webcodecs' : 'unknown',
      });
      setExportStage(t('export.stageFailedWithError', { error: (error as Error).message }));
      restoreStudioMapSettings();
      studioDeliveryJobRef.current = null;
      studioQualityRef.current = false;
      setIsExporting(false);
      setIsDeterministicExport(false);
      resetPlayback();
      isRecordingRef.current = false;
      if (mp4EncoderRef.current) {
        mp4EncoderRef.current.close();
        mp4EncoderRef.current = null;
      }
      setUseWebCodecs(false);
    }
  }, [actualFormat, applyStudioMapSettings, cachedLogoRef, cameraSettings, finishRecording, hiddenMsRef, hiddenSinceRef, includeElevation, includeStats, isRecordingRef, journeySegments, language, loadHtml2Canvas, mapStyle, mp4EncoderRef, pictures.length, play, playback.totalDuration, preloadExportOpeningTiles, recordedChunksRef, recordingCancelledRef, recordingCanvasRef, recordingContextRef, recordingStartTimeRef, requestScreenWakeLock, resetOverlayCapture, resetPlayback, restoreStudioMapSettings, runDeterministicExport, setCinematicPlayed, setExportProgress, setExportStage, setExportedBlob, setIsDeterministicExport, setIsExporting, setSpeed, setStudioDeliveryError, setStudioDeliveryStatus, setUseWebCodecs, setupMediaRecorderFallback, show3DTerrain, startFrameCapture, studioDelivery, studioDeliveryJobRef, studioQualityRef, studioStatsRef, studioSupported, t, tracks.length, updateOverlayAsync, useWebCodecsRef, videoExportSettings]);

  // `requestAnimationFrame` does not fire while the tab is hidden, so the whole
  // export — standard and studio alike — stalls until the user comes back.
  // Track that time so the studio ETA is not poisoned by it, and say so.
  useEffect(() => {
    if (!isExporting) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenSinceRef.current = performance.now();
        return;
      }
      if (hiddenSinceRef.current !== null) {
        hiddenMsRef.current += performance.now() - hiddenSinceRef.current;
        hiddenSinceRef.current = null;
      }
      // The screen lock is dropped by the browser whenever the page is hidden,
      // so it has to be taken again on the way back.
      if (studioQualityRef.current && !wakeLockRef.current) void requestScreenWakeLock();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [hiddenMsRef, hiddenSinceRef, isExporting, requestScreenWakeLock, studioQualityRef, wakeLockRef]);

  const handleCancelExport = useCallback(() => {
    const exportEncoderPath = useWebCodecsRef.current ? 'webcodecs' : 'mediarecorder';
    isRecordingRef.current = false;
    recordingCancelledRef.current = true;
    resetOverlayCapture();
    restoreStudioMapSettings();
    studioDeliveryJobRef.current = null;
    studioQualityRef.current = false;

    if (frameCleanupRef.current) {
      frameCleanupRef.current();
      frameCleanupRef.current = null;
    }
    if (frameRequestRef.current) {
      cancelAnimationFrame(frameRequestRef.current);
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (mp4EncoderRef.current) {
      mp4EncoderRef.current.close();
      mp4EncoderRef.current = null;
    }
    setUseWebCodecs(false);
    setIsDeterministicExport(false);

    trackEvent('export_cancelled', {
      export_progress_bucket: getProgressBucket(exportProgress),
      export_format: actualFormat,
      export_encoder_path: exportEncoderPath,
    });
    setIsExporting(false);
    setExportProgress(0);
    setExportStage('');
    resetPlayback();
  }, [actualFormat, exportProgress, frameCleanupRef, frameRequestRef, isRecordingRef, mediaRecorderRef, mp4EncoderRef, recordingCancelledRef, resetOverlayCapture, resetPlayback, restoreStudioMapSettings, setExportProgress, setExportStage, setIsDeterministicExport, setIsExporting, setUseWebCodecs, studioDeliveryJobRef, studioQualityRef, useWebCodecsRef]);

  const handleDownload = useCallback(() => {
    if (!exportedBlob) return;

    const extension = exportedBlob.type.startsWith('video/mp4') ? 'mp4' : 'webm';
    const url = URL.createObjectURL(exportedBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `trail-replay-${Date.now()}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
    trackEvent('export_downloaded_again', { export_format: extension });
  }, [exportedBlob]);

  const resetExportResult = useCallback(() => {
    setExportedBlob(null);
    setStudioDeliveryStatus('idle');
    setStudioDeliveryError(null);
    setExportProgress(0);
    setExportStage('');
  }, [setExportProgress, setExportStage, setExportedBlob, setStudioDeliveryError, setStudioDeliveryStatus]);

  return {
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
  };
}
