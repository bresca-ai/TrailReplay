import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { playbackTimeForRoute, routeTimeForPlayback } from '@/utils/annotationTiming';
import { INTRO_DURATION, OUTRO_DELAY, OUTRO_DURATION } from '@/utils/playbackTiming';

interface PlaybackProviderProps {
  children: React.ReactNode;
}

// Animation timing constants
const AUTO_RESET_DELAY = 3000; // 3 seconds after outro before auto-reset

// Duration limits (in milliseconds)
const MIN_DURATION = 15000; // Keep the 15-second Timeline preset valid

export function PlaybackProvider({ children }: PlaybackProviderProps) {
  const playback = useAppStore((state) => state.playback);
  const tracks = useAppStore((state) => state.tracks);
  const activeTrackId = useAppStore((state) => state.activeTrackId);
  const journeySegments = useAppStore((state) => state.journeySegments);
  const cinematicPlayed = useAppStore((state) => state.cinematicPlayed);
  const animationPhase = useAppStore((state) => state.animationPhase);
  const isDeterministicExport = useAppStore((state) => state.isDeterministicExport);
  const setPlayback = useAppStore((state) => state.setPlayback);
  const pause = useAppStore((state) => state.pause);
  const setCinematicPlayed = useAppStore((state) => state.setCinematicPlayed);
  const setAnimationPhase = useAppStore((state) => state.setAnimationPhase);
  const resetPlayback = useAppStore((state) => state.resetPlayback);

  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const introTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const outroTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resetTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const activeTrack = tracks.find((t) => t.id === activeTrackId);

  // Calculate total duration based on journey segments or active track.
  // Only a floor is enforced (to keep the 15-second Timeline preset valid);
  // there's no upper cap, so segment durations set in the Journey panel are
  // fully honored regardless of how long the resulting video is.
  const calculateTotalDuration = useCallback(() => {
    let duration = 0;

    // If we have journey segments, use their total duration
    if (journeySegments.length > 0) {
      duration = journeySegments.reduce((sum, seg) => sum + (seg.duration || 0), 0);
    } else if (activeTrack) {
      // Default to 60 seconds for a track
      duration = 60000;
    }

    return Math.max(MIN_DURATION, duration);
  }, [journeySegments, activeTrack]);

  // Clear all timeouts
  const clearAllTimeouts = useCallback(() => {
    if (introTimeoutRef.current) {
      clearTimeout(introTimeoutRef.current);
      introTimeoutRef.current = null;
    }
    if (outroTimeoutRef.current) {
      clearTimeout(outroTimeoutRef.current);
      outroTimeoutRef.current = null;
    }
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
  }, []);

  // Handle play start - trigger tile preloading before the intro animation.
  // The map tiles for the high-zoom/pitched playback start aren't loaded yet on a
  // fresh play, so we insert a `preloading` phase (see useTilePreload) that warms
  // those tiles via the MapLibre `idle` event before the cinematic intro runs.
  useEffect(() => {
    if (playback.isPlaying && !cinematicPlayed && playback.progress < 0.01) {
      // Cold cinematic start: preload tiles first. The preload hook advances the
      // phase to 'intro' once tiles are ready (or a safety timeout elapses).
      if (animationPhase === 'idle') {
        setAnimationPhase('preloading');
      }
    } else if (playback.isPlaying && cinematicPlayed && animationPhase === 'idle') {
      // Warm resume mid-track: skip preload and intro entirely.
      setAnimationPhase('playing');
    }
  }, [playback.isPlaying, cinematicPlayed, playback.progress, animationPhase, setAnimationPhase]);

  // Once preloading completes and we enter the intro phase, run the cinematic
  // intro timer. This fires after the warm-up rather than before it, so the intro
  // flyTo animates against an already-loaded tile cache (no white squares).
  useEffect(() => {
    if (animationPhase !== 'intro') return;

    introTimeoutRef.current = setTimeout(() => {
      setCinematicPlayed(true);
      setAnimationPhase('playing');
    }, INTRO_DURATION);

    return () => {
      if (introTimeoutRef.current) {
        clearTimeout(introTimeoutRef.current);
        introTimeoutRef.current = null;
      }
    };
  }, [animationPhase, setCinematicPlayed, setAnimationPhase]);

  // Animation loop - only run when in 'playing' phase
  useEffect(() => {
    // Video export owns playback time itself. It advances exactly one route
    // interval per encoded frame, so this wall-clock rAF loop must stay idle.
    if (!playback.isPlaying || animationPhase !== 'playing' || isDeterministicExport) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      lastTimeRef.current = 0;
      return;
    }

    const totalDuration = calculateTotalDuration();
    if (totalDuration === 0) return;

    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp;
      }

      const deltaTime = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      // Read the latest time/speed from the store rather than closing over them,
      // so this effect doesn't need `playback.currentTime` as a dependency.
      // Depending on it would tear down and recreate this rAF loop every frame,
      // resetting lastTimeRef and dropping elapsed time — which stretched a 30s
      // animation into ~75s of wall-clock (and recording) time.
      const state = useAppStore.getState();
      const { currentTime, speed } = state.playback;
      const annotations = state.textAnnotations;
      const elapsed = playbackTimeForRoute(currentTime, totalDuration, annotations) + deltaTime * speed;
      const newTime = routeTimeForPlayback(elapsed, totalDuration, annotations);

      if (elapsed >= playbackTimeForRoute(totalDuration, totalDuration, annotations)) {
        // End of playback - start outro sequence
        pause();
        setPlayback({ currentTime: totalDuration, progress: 1 });
        setAnimationPhase('outro');

        // Schedule auto-reset after outro
        outroTimeoutRef.current = setTimeout(() => {
          setAnimationPhase('ended');

          // Auto-reset after delay
          resetTimeoutRef.current = setTimeout(() => {
            resetPlayback();
          }, AUTO_RESET_DELAY);
        }, OUTRO_DELAY + OUTRO_DURATION);
      } else {
        const progress = totalDuration > 0 ? newTime / totalDuration : 0;
        setPlayback({ currentTime: newTime, progress });
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    lastTimeRef.current = 0;
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [playback.isPlaying, animationPhase, calculateTotalDuration, isDeterministicExport, pause, setPlayback, setAnimationPhase, resetPlayback]);

  // Update total duration when track or journey changes
  useEffect(() => {
    const totalDuration = calculateTotalDuration();
    setPlayback({ totalDuration });
  }, [journeySegments, activeTrack, calculateTotalDuration, setPlayback]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      clearAllTimeouts();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [clearAllTimeouts]);

  return <>{children}</>;
}

export { INTRO_DURATION, OUTRO_DELAY, OUTRO_DURATION };
