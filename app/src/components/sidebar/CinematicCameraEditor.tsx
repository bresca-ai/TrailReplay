import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { AppState } from '@/store/storeTypes';
import { useComputedJourney } from '@/hooks/useComputedJourney';
import { usePreparedCinematicCameraKeyframes } from '@/hooks/useCinematicCameraKeyframes';
import { useI18n } from '@/i18n/useI18n';
import { createId } from '@/utils/id';
import { mapGlobalRef } from '@/utils/mapRef';
import { formatDuration } from '@/utils/units';
import { trackEvent } from '@/utils/analytics';
import { getPlaybackCameraPose, getRouteBearingAtProgress } from '@/utils/replayCameraPlan';
import {
  deriveCinematicKeyframeProgress,
  getCinematicCameraPose,
  type CinematicKeyframeEasing,
  type CinematicKeyframeFrame,
} from '@/utils/cinematicCameraPlan';
import { isFocusedViaPointer } from '@/utils/focusModality';
import { isTypingTarget, shouldHandleEnterAsPrimaryAction } from '@/utils/keyboardShortcuts';
import { CinematicOrbitBall } from './CinematicOrbitBall';
import { Camera, ChevronDown, ChevronUp, Minus, Plus, Trash2 } from 'lucide-react';

const FRAME_OPTIONS: CinematicKeyframeFrame[] = ['world', 'route'];
const EASING_OPTIONS: CinematicKeyframeEasing[] = ['smooth', 'linear', 'hold'];
const ZOOM_MIN = 8;
const ZOOM_MAX = 20;
const ZOOM_STEP = 0.5;
const MAX_PITCH = 85;
const BEARING_KEY_STEP = 5;
const PITCH_KEY_STEP = 5;

/** Two keyframes closer than this (as a fraction of the whole replay) are treated as "the same moment" when capturing, so nudging the ball updates the existing keyframe instead of adding a near-duplicate. */
const RECAPTURE_PROGRESS_TOLERANCE = 0.002;

/**
 * Whether the replay is currently driving the camera, in which case this
 * panel must not touch it.
 *
 * Deliberately does not test `animationPhase === 'idle'`. Pausing does not
 * restore that phase — nothing resets it until a replay starts again — so a
 * paused replay still reads as 'playing', and asking for 'idle' leaves the
 * ball unable to move the camera at all, which is exactly how it felt.
 */
function isReplayDrivingNow(state: Pick<AppState, 'playback' | 'isExporting' | 'animationPhase'>): boolean {
  return state.playback.isPlaying
    || state.isExporting
    || state.animationPhase === 'preloading'
    || state.animationPhase === 'intro'
    || state.animationPhase === 'outro';
}

function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function shortestAngleDelta(fromDeg: number, toDeg: number): number {
  return (((toDeg - fromDeg) % 360) + 540) % 360 - 180;
}

/**
 * Cinematic-mode authoring. The primary control is the orbit ball
 * (CINEMATIC_CAMERA_PLAN.md section 8.2): it only ever changes bearing and
 * pitch around the marker, which is always kept as the map's centre, so
 * there is no way to accidentally pan the subject out of frame the way free
 * map dragging could. Zoom is a separate slider, per the plan's own table.
 * The draggable timeline strip (section 8.3) is not built yet; re-timing is
 * still delete-and-recapture.
 */
export function CinematicCameraEditor() {
  const { t } = useI18n();
  const keyframes = useAppStore((state) => state.cinematicCameraKeyframes);
  const playback = useAppStore((state) => state.playback);
  const animationPhase = useAppStore((state) => state.animationPhase);
  const isExporting = useAppStore((state) => state.isExporting);
  const cameraSettings = useAppStore((state) => state.cameraSettings);
  const addCinematicCameraKeyframe = useAppStore((state) => state.addCinematicCameraKeyframe);
  const updateCinematicCameraKeyframe = useAppStore((state) => state.updateCinematicCameraKeyframe);
  const removeCinematicCameraKeyframe = useAppStore((state) => state.removeCinematicCameraKeyframe);
  const seekToProgress = useAppStore((state) => state.seekToProgress);
  const { computedJourney, currentPosition, currentSegment, cameraPathCoordinates, elevationData } = useComputedJourney();
  const preparedKeyframes = usePreparedCinematicCameraKeyframes(cameraPathCoordinates);

  const [draftPose, setDraftPose] = useState({ bearingDeg: 180, pitchDeg: 55, zoom: 14 });
  const [showInfo, setShowInfo] = useState(false);

  const routeHeadingDeg = cameraPathCoordinates.length > 0
    ? getRouteBearingAtProgress(cameraPathCoordinates, playback.progress)
    : null;

  // Composing and playing are different jobs, and only one of them may drive
  // the camera.
  //
  // While the replay is running, `useTrailPlaybackCamera` owns the camera: it
  // is the thing that applies the keyframe spline and the smoothed anchor.
  // The live preview below must stand down then, or the two write to the map
  // on the same frames and the last one wins — which was this panel, pinning
  // the camera to the marker with the ball's fixed pose and undoing every bit
  // of smoothing.
  //
  const isComposing = !isReplayDrivingNow({ playback, isExporting, animationPhase });

  // A new moment to compose: start the ball from whatever the camera
  // currently shows there (the authored shot if one already covers this
  // progress, otherwise the follow-behind fallback), rather than wherever it
  // was left after editing a different keyframe. Also resyncs when playback
  // stops, so the ball matches the frame the replay left on screen.
  useEffect(() => {
    if (!isComposing) return;

    const cinematicPose = getCinematicCameraPose({
      keyframes: preparedKeyframes,
      coordinates: cameraPathCoordinates,
      progress: playback.progress,
      routeHeadingDeg,
    });
    const pose = cinematicPose ?? getPlaybackCameraPose({
      cameraMode: 'follow-behind',
      coordinates: cameraPathCoordinates,
      elevationData,
      followBehindZoomLevel: cameraSettings.followBehindZoomLevel,
      progress: playback.progress,
    });
    if (pose) {
      setDraftPose({ bearingDeg: pose.bearing, pitchDeg: pose.pitch, zoom: pose.zoom });
    }
    // Deliberately keyed on progress and on whether we are composing at all:
    // this is "arriving at a new moment", not "the pose at this moment
    // changed" (which happens on every ball drag and would fight the drag by
    // resetting it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.progress, isComposing]);

  // The ball (and zoom slider) are the source of truth for the live preview
  // *while composing*. The centre is always the marker's true position —
  // never the pan position free map dragging could leave it at — so there is
  // nothing here that can decouple what's shown from what gets captured.
  useEffect(() => {
    if (!isComposing) return;

    const map = mapGlobalRef.current;
    if (!map || !currentPosition) return;

    map.jumpTo({
      center: [currentPosition.lon, currentPosition.lat],
      bearing: draftPose.bearingDeg,
      pitch: draftPose.pitchDeg,
      zoom: draftPose.zoom,
    });
  }, [draftPose, currentPosition, isComposing]);

  // WASD + R/F rather than arrow keys or +/-: arrow keys already pan the map
  // itself, and only fire this if the ball happens to be focused, which the
  // user has to remember to do. A window-level listener with keys the map
  // doesn't already claim works no matter where focus is on the page —
  // still skipped while actually typing somewhere (a track name, a text
  // annotation), and while any modifier is held (so browser/OS shortcuts on
  // the same letters keep working).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Read the live store rather than a rendered value: a keypress that
      // lands in the same tick as playback starting would otherwise be judged
      // against a render that has not happened yet, and would move a camera
      // the replay is already driving.
      if (isReplayDrivingNow(useAppStore.getState())) return;

      // Enter saves the shot, so the whole loop — scrub, aim, save — can be
      // driven without reaching for the mouse. Unlike the letter keys it is a
      // key focused controls act on themselves, so it is only claimed when
      // the focused control did not mean to receive it.
      if (shouldHandleEnterAsPrimaryAction(event, { focusedViaPointer: isFocusedViaPointer() })) {
        event.preventDefault();
        captureRef.current('keyboard');
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'a':
          setDraftPose((current) => ({ ...current, bearingDeg: normalizeAngle(current.bearingDeg - BEARING_KEY_STEP) }));
          break;
        case 'd':
          setDraftPose((current) => ({ ...current, bearingDeg: normalizeAngle(current.bearingDeg + BEARING_KEY_STEP) }));
          break;
        case 'w':
          setDraftPose((current) => ({ ...current, pitchDeg: Math.max(0, current.pitchDeg - PITCH_KEY_STEP) }));
          break;
        case 's':
          setDraftPose((current) => ({ ...current, pitchDeg: Math.min(MAX_PITCH, current.pitchDeg + PITCH_KEY_STEP) }));
          break;
        case 'r':
          setDraftPose((current) => ({ ...current, zoom: Math.min(ZOOM_MAX, current.zoom + ZOOM_STEP) }));
          break;
        case 'f':
          setDraftPose((current) => ({ ...current, zoom: Math.max(ZOOM_MIN, current.zoom - ZOOM_STEP) }));
          break;
        default:
          return;
      }
      event.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const canCapture = !!computedJourney && !!currentPosition && !!currentSegment;

  const handleCapture = (source: 'button' | 'keyboard') => {
    if (!currentPosition || !currentSegment) return;

    const existingId = computedJourney
      ? keyframes.find((entry) => {
          const progress = deriveCinematicKeyframeProgress(
            entry.anchor,
            computedJourney.segmentTimings,
            computedJourney.coordinates,
            playback.routeTimingMode,
          );
          return progress !== null && Math.abs(progress - playback.progress) <= RECAPTURE_PROGRESS_TOLERANCE;
        })?.id
      : undefined;

    if (existingId) {
      updateCinematicCameraKeyframe(existingId, {
        bearingDeg: draftPose.bearingDeg,
        pitchDeg: draftPose.pitchDeg,
        zoom: draftPose.zoom,
        frame: 'world',
      });
    } else {
      addCinematicCameraKeyframe({
        id: createId('keyframe'),
        anchor: {
          routeSegmentId: currentSegment.segment.segmentId,
          routeSegmentDistance: currentPosition.distance,
        },
        // 'world' per CINEMATIC_CAMERA_PLAN.md section 11: more stable, and
        // the mode's selling point is shots that don't simply trail the
        // subject.
        bearingDeg: draftPose.bearingDeg,
        pitchDeg: draftPose.pitchDeg,
        zoom: draftPose.zoom,
        frame: 'world',
        easing: 'smooth',
      });
    }
    // A dedicated event rather than the generic `feature_enabled`, because
    // the question this has to answer is "is anyone actually authoring
    // shots", which needs the depth (how many keyframes) and the route in
    // (button or the keyboard-only flow), not just that the feature was
    // touched once.
    trackEvent('cinematic_keyframe_saved', {
      keyframe_action: existingId ? 'updated' : 'added',
      capture_source: source,
      keyframe_count: existingId ? keyframes.length : keyframes.length + 1,
    });
  };

  // The key listener is registered once; this keeps it calling the current
  // capture rather than one closed over a stale marker position. Re-binding
  // the listener instead would mean re-binding it on every frame of playback,
  // since the capture closes over the marker.
  const captureRef = useRef(handleCapture);
  useEffect(() => {
    captureRef.current = handleCapture;
  });

  const rows = computedJourney
    ? keyframes
        .map((keyframe) => {
          const progress = deriveCinematicKeyframeProgress(
            keyframe.anchor,
            computedJourney.segmentTimings,
            computedJourney.coordinates,
            playback.routeTimingMode,
          );
          return progress === null ? null : { keyframe, progress };
        })
        .filter((entry): entry is { keyframe: (typeof keyframes)[number]; progress: number } => entry !== null)
        .sort((a, b) => a.progress - b.progress)
    : [];

  const changeFrame = (keyframeId: string, progress: number, nextFrame: CinematicKeyframeFrame) => {
    const keyframe = keyframes.find((entry) => entry.id === keyframeId);
    if (!keyframe || keyframe.frame === nextFrame) return;

    // Re-derive bearingDeg so the shot itself doesn't jump when its frame
    // changes — only how the number is interpreted changes.
    const headingHere = getRouteBearingAtProgress(cameraPathCoordinates, progress);
    const absoluteBearingDeg = keyframe.frame === 'route'
      ? normalizeAngle(headingHere + keyframe.bearingDeg)
      : keyframe.bearingDeg;
    const nextBearingDeg = nextFrame === 'route'
      ? shortestAngleDelta(headingHere, absoluteBearingDeg)
      : absoluteBearingDeg;

    updateCinematicCameraKeyframe(keyframeId, { frame: nextFrame, bearingDeg: nextBearingDeg });
  };

  return (
    <div className="mt-3 p-3 bg-[var(--evergreen)]/5 rounded-lg space-y-3">
      <p className="text-xs text-[var(--evergreen-60)]">{t('settings.cinematicCamera.hint')}</p>

      <button
        type="button"
        onClick={() => setShowInfo((value) => !value)}
        className="w-full flex items-center justify-between text-xs font-medium text-[var(--evergreen)] hover:text-[var(--trail-orange)]"
        aria-expanded={showInfo}
      >
        {t('settings.cinematicCamera.infoTitle')}
        {showInfo ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {showInfo && (
        <ul className="text-[11px] text-[var(--evergreen-60)] leading-relaxed space-y-1.5 list-disc pl-4">
          <li>{t('settings.cinematicCamera.infoKeyboard')}</li>
          <li>{t('settings.cinematicCamera.infoBall')}</li>
          <li>{t('settings.cinematicCamera.infoZoom')}</li>
          <li>{t('settings.cinematicCamera.infoFrame')}</li>
          <li>{t('settings.cinematicCamera.infoEasing')}</li>
          <li>{t('settings.cinematicCamera.infoStability')}</li>
        </ul>
      )}

      <div className="flex justify-center">
        <CinematicOrbitBall
          bearingDeg={draftPose.bearingDeg}
          pitchDeg={draftPose.pitchDeg}
          routeHeadingDeg={routeHeadingDeg}
          onChange={(next) => setDraftPose((current) => ({ ...current, ...next }))}
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-xs text-[var(--evergreen-60)]">{t('settings.cinematicCamera.zoom')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDraftPose((current) => ({ ...current, zoom: Math.max(ZOOM_MIN, current.zoom - ZOOM_STEP) }))}
            aria-label={t('settings.cinematicCamera.zoomOut')}
            className="p-1.5 rounded border border-[var(--evergreen)]/30 text-[var(--evergreen)] hover:border-[var(--trail-orange)] hover:text-[var(--trail-orange)]"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.1}
            value={draftPose.zoom}
            onChange={(e) => setDraftPose((current) => ({ ...current, zoom: Number(e.target.value) }))}
            className="flex-1 accent-[var(--trail-orange)]"
          />
          <button
            type="button"
            onClick={() => setDraftPose((current) => ({ ...current, zoom: Math.min(ZOOM_MAX, current.zoom + ZOOM_STEP) }))}
            aria-label={t('settings.cinematicCamera.zoomIn')}
            className="p-1.5 rounded border border-[var(--evergreen)]/30 text-[var(--evergreen)] hover:border-[var(--trail-orange)] hover:text-[var(--trail-orange)]"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => handleCapture('button')}
        disabled={!canCapture}
        className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg border-2 border-[var(--trail-orange)] bg-[var(--trail-orange-15)] text-sm font-medium text-[var(--evergreen)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--trail-orange)]/20 transition-colors"
      >
        <Camera className="w-4 h-4" />
        {t('settings.cinematicCamera.capture')}
      </button>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--evergreen-60)]">{t('settings.cinematicCamera.empty')}</p>
      ) : (
        <div className="space-y-2">
          {rows.map(({ keyframe, progress }) => (
            <div key={keyframe.id} className="p-2 rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] space-y-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => seekToProgress(progress)}
                  className="text-xs font-medium text-[var(--evergreen)] underline decoration-dotted hover:text-[var(--trail-orange)]"
                >
                  {t('settings.cinematicCamera.keyframeAt', { time: formatDuration(progress * playback.totalDuration / 1000) })}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removeCinematicCameraKeyframe(keyframe.id);
                    trackEvent('cinematic_keyframe_removed', {
                      keyframe_count: Math.max(0, keyframes.length - 1),
                    });
                  }}
                  aria-label={t('settings.cinematicCamera.delete')}
                  className="p-1 rounded text-[var(--evergreen-60)] hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] text-[var(--evergreen-60)]">
                  {t('settings.cinematicCamera.frame')}
                  <select
                    value={keyframe.frame}
                    onChange={(e) => changeFrame(keyframe.id, progress, e.target.value as CinematicKeyframeFrame)}
                    className="mt-0.5 w-full text-xs rounded border border-[var(--evergreen)]/30 bg-[var(--canvas)] text-[var(--evergreen)] px-1.5 py-1"
                  >
                    {FRAME_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {t(`settings.cinematicCamera.frame${option === 'world' ? 'World' : 'Route'}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[10px] text-[var(--evergreen-60)]">
                  {t('settings.cinematicCamera.easing')}
                  <select
                    value={keyframe.easing}
                    onChange={(e) => updateCinematicCameraKeyframe(keyframe.id, { easing: e.target.value as CinematicKeyframeEasing })}
                    className="mt-0.5 w-full text-xs rounded border border-[var(--evergreen)]/30 bg-[var(--canvas)] text-[var(--evergreen)] px-1.5 py-1"
                  >
                    {EASING_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {t(`settings.cinematicCamera.easing${option.charAt(0).toUpperCase()}${option.slice(1)}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
