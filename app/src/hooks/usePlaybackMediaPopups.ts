import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import {
  getTriggeredPlaybackItems,
  getTriggeredPlaybackPictures,
  hasPlaybackProgressRewound,
} from '@/utils/playbackPictures';

export function usePlaybackMediaPopups() {
  const [autoPlaybackPictureId, setAutoPlaybackPictureId] = useState<string | null>(null);
  const pictures = useAppStore((state) => state.pictures);
  const videos = useAppStore((state) => state.videos);
  const tracks = useAppStore((state) => state.tracks);
  const textAnnotations = useAppStore((state) => state.textAnnotations);
  const playback = useAppStore((state) => state.playback);
  const animationPhase = useAppStore((state) => state.animationPhase);
  const isDeterministicExport = useAppStore((state) => state.isDeterministicExport);
  const selectedPictureId = useAppStore((state) => state.selectedPictureId);
  const setSelectedPictureId = useAppStore((state) => state.setSelectedPictureId);
  const selectedVideoId = useAppStore((state) => state.selectedVideoId);
  const setSelectedVideoId = useAppStore((state) => state.setSelectedVideoId);
  const play = useAppStore((state) => state.play);
  const pause = useAppStore((state) => state.pause);
  const shownPlaybackPictureIdsRef = useRef<Set<string>>(new Set());
  const queuedPlaybackPictureIdsRef = useRef<string[]>([]);
  const lastPlaybackProgressRef = useRef(0);
  const resumePlaybackAfterPictureQueueRef = useRef(false);
  const pendingQueuedPictureOpenRef = useRef<number | null>(null);
  const shownPlaybackVideoIdsRef = useRef<Set<string>>(new Set());
  const lastVideoProgressRef = useRef(0);
  const queuedPlaybackVideoIdsRef = useRef<string[]>([]);
  const resumePlaybackAfterVideoRef = useRef(false);

  const openNextQueuedPlaybackPicture = useCallback(() => {
    const nextPictureId = queuedPlaybackPictureIdsRef.current.shift();
    if (!nextPictureId) {
      setAutoPlaybackPictureId(null);
      return false;
    }

    setAutoPlaybackPictureId(nextPictureId);
    return true;
  }, []);

  const clearPendingQueuedPictureOpen = useCallback(() => {
    if (pendingQueuedPictureOpenRef.current !== null) {
      window.clearTimeout(pendingQueuedPictureOpenRef.current);
      pendingQueuedPictureOpenRef.current = null;
    }
  }, []);

  const scheduleNextQueuedPlaybackPicture = useCallback(() => {
    clearPendingQueuedPictureOpen();
    pendingQueuedPictureOpenRef.current = window.setTimeout(() => {
      pendingQueuedPictureOpenRef.current = null;
      openNextQueuedPlaybackPicture();
    }, 0);
  }, [clearPendingQueuedPictureOpen, openNextQueuedPlaybackPicture]);

  useEffect(() => {
    shownPlaybackPictureIdsRef.current.clear();
    queuedPlaybackPictureIdsRef.current = [];
    resumePlaybackAfterPictureQueueRef.current = false;
    shownPlaybackVideoIdsRef.current.clear();
    queuedPlaybackVideoIdsRef.current = [];
    resumePlaybackAfterVideoRef.current = false;
    lastVideoProgressRef.current = useAppStore.getState().playback.progress;
    clearPendingQueuedPictureOpen();
    lastPlaybackProgressRef.current = useAppStore.getState().playback.progress;
  }, [clearPendingQueuedPictureOpen, pictures, textAnnotations, tracks, videos]);

  useEffect(() => {
    return () => {
      clearPendingQueuedPictureOpen();
    };
  }, [clearPendingQueuedPictureOpen]);

  useEffect(() => {
    const currentProgress = playback.progress;
    const previousProgress = lastPlaybackProgressRef.current;

    if (hasPlaybackProgressRewound(previousProgress, currentProgress)) {
      shownPlaybackPictureIdsRef.current.clear();
      queuedPlaybackPictureIdsRef.current = [];
      resumePlaybackAfterPictureQueueRef.current = false;
      clearPendingQueuedPictureOpen();
    }

    // Wait for the cold-start preload/intro sequence to finish before ever
    // triggering a picture. Otherwise a photo anchored at/near progress 0
    // pops up as soon as Play is clicked (isPlaying flips true immediately),
    // ahead of the intro camera zoom-in and before the marker has moved.
    // During a deterministic export, `useVideoExportRecorder` drives its own
    // picture-hold logic (so the export can freeze the route position for
    // the full `displayDuration` instead of just showing the popup over an
    // already-advancing timeline) — this effect must stay out of the way.
    if (isDeterministicExport || !playback.isPlaying || animationPhase !== 'playing' || selectedPictureId || autoPlaybackPictureId || selectedVideoId || pictures.length === 0) {
      lastPlaybackProgressRef.current = currentProgress;
    } else {
      const triggeredPictures = getTriggeredPlaybackPictures({
        pictures,
        previousProgress,
        currentProgress,
        shownPictureIds: shownPlaybackPictureIdsRef.current,
        queuedPictureIds: queuedPlaybackPictureIdsRef.current,
      });

      if (triggeredPictures.length > 0) {
        triggeredPictures.forEach((picture) => {
          shownPlaybackPictureIdsRef.current.add(picture.id);
        });
        queuedPlaybackPictureIdsRef.current.push(...triggeredPictures.map((picture) => picture.id));
        resumePlaybackAfterPictureQueueRef.current = true;
        pause();
        // Open the popup synchronously in this same effect, rather than via
        // scheduleNextQueuedPlaybackPicture's setTimeout(0). Deferring by even
        // one macrotask let the camera/marker (which react to the same
        // progress update) paint an extra moving frame before the popup
        // mounted — most visible for photos anchored right at the start.
        clearPendingQueuedPictureOpen();
        // Opening here preserves the frame timing of the original App effect.
        openNextQueuedPlaybackPicture();
      }
    }

    lastPlaybackProgressRef.current = currentProgress;
  }, [
    animationPhase,
    autoPlaybackPictureId,
    clearPendingQueuedPictureOpen,
    isDeterministicExport,
    openNextQueuedPlaybackPicture,
    pause,
    pictures,
    playback.isPlaying,
    playback.progress,
    selectedPictureId,
    selectedVideoId,
  ]);

  // Clips are triggered on the same rule as photos, but hold the replay for
  // as long as the clip itself runs rather than for a fixed display duration.
  // The two effects keep separate progress refs: they both run on the same
  // store update, and a shared ref would leave whichever ran second looking at
  // a window that had already been consumed.
  useEffect(() => {
    const currentProgress = playback.progress;
    const previousProgress = lastVideoProgressRef.current;

    if (hasPlaybackProgressRewound(previousProgress, currentProgress)) {
      shownPlaybackVideoIdsRef.current.clear();
      queuedPlaybackVideoIdsRef.current = [];
      resumePlaybackAfterVideoRef.current = false;
    }

    const blocked = isDeterministicExport
      || !playback.isPlaying
      || animationPhase !== 'playing'
      || selectedVideoId
      || selectedPictureId
      || autoPlaybackPictureId
      || videos.length === 0;

    if (!blocked) {
      const triggeredVideos = getTriggeredPlaybackItems({
        items: videos,
        previousProgress,
        currentProgress,
        shownItemIds: shownPlaybackVideoIdsRef.current,
        queuedItemIds: queuedPlaybackVideoIdsRef.current,
      });

      if (triggeredVideos.length > 0) {
        triggeredVideos.forEach((video) => shownPlaybackVideoIdsRef.current.add(video.id));
        queuedPlaybackVideoIdsRef.current.push(...triggeredVideos.map((video) => video.id));
        resumePlaybackAfterVideoRef.current = true;
        pause();
        const nextVideoId = queuedPlaybackVideoIdsRef.current.shift();
        if (nextVideoId) setSelectedVideoId(nextVideoId);
      }
    }

    lastVideoProgressRef.current = currentProgress;
  }, [
    animationPhase,
    autoPlaybackPictureId,
    isDeterministicExport,
    pause,
    playback.isPlaying,
    playback.progress,
    selectedPictureId,
    selectedVideoId,
    setSelectedVideoId,
    videos,
  ]);

  const closeActiveVideo = useCallback(() => {
    const nextVideoId = queuedPlaybackVideoIdsRef.current.shift();
    if (nextVideoId) {
      setSelectedVideoId(nextVideoId);
      return;
    }

    setSelectedVideoId(null);
    if (resumePlaybackAfterVideoRef.current) {
      resumePlaybackAfterVideoRef.current = false;
      play();
    }
  }, [play, setSelectedVideoId]);

  const closeActivePicture = useCallback(() => {
    clearPendingQueuedPictureOpen();

    if (selectedPictureId) {
      setSelectedPictureId(null);
      return;
    }

    if (autoPlaybackPictureId) {
      setAutoPlaybackPictureId(null);
    }

    if (queuedPlaybackPictureIdsRef.current.length > 0) {
      scheduleNextQueuedPlaybackPicture();
      return;
    }

    if (resumePlaybackAfterPictureQueueRef.current) {
      resumePlaybackAfterPictureQueueRef.current = false;
      play();
    }
  }, [autoPlaybackPictureId, clearPendingQueuedPictureOpen, play, scheduleNextQueuedPlaybackPicture, selectedPictureId, setSelectedPictureId]);

  // Get active picture for current progress
  const selectedPicture = selectedPictureId
    ? pictures.find((p) => p.id === selectedPictureId)
    : undefined;
  const autoPlaybackPicture = autoPlaybackPictureId
    ? pictures.find((p) => p.id === autoPlaybackPictureId)
    : undefined;
  const activePicture = selectedPicture || autoPlaybackPicture;
  const activeVideo = selectedVideoId ? videos.find((entry) => entry.id === selectedVideoId) : undefined;
  return { activePicture, activeVideo, closeActivePicture, closeActiveVideo };
}
