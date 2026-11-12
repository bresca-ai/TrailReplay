import type { TextAnnotation } from '@/types';
import { sidePanelVisible } from './annotationTiming';

export function getActivePlaybackAnnotationId(params: {
  annotations: TextAnnotation[];
  currentTime: number;
  totalDuration: number;
  phase?: 'idle' | 'preloading' | 'intro' | 'playing' | 'outro' | 'ended';
}) {
  const { annotations, currentTime, totalDuration, phase } = params;

  const cameraTransitionHidesAnnotations = phase === 'preloading'
    || phase === 'intro'
    || phase === 'outro'
    || phase === 'ended'
    || (phase === 'idle' && currentTime <= 0);

  if (totalDuration <= 0 || annotations.length === 0 || cameraTransitionHidesAnnotations) {
    return null;
  }

  const sortedAnnotations = [...annotations].sort((a, b) => a.progress - b.progress);

  for (const annotation of sortedAnnotations) {
    if (sidePanelVisible(annotation, currentTime, totalDuration)) return annotation.id;
  }

  return null;
}

/** Pins appear ahead of the text and remain through the annotation slowdown. */
export function getUpcomingAnnotationIndexes(annotations: TextAnnotation[], currentTime: number, totalDuration: number, defaultLeadDuration: number, phase?: string): number[] {
  if (totalDuration <= 0 || phase === 'preloading' || phase === 'intro' || phase === 'outro' || phase === 'ended') return [];
  return annotations.flatMap((annotation, index) => {
    const arrival = annotation.progress * totalDuration;
    const lead = Math.max(500, annotation.pinLeadDuration ?? defaultLeadDuration);
    return currentTime >= Math.max(0, arrival - lead) && currentTime <= Math.min(totalDuration, arrival + 500) ? [index] : [];
  });
}
