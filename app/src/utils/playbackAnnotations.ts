import type { TextAnnotation } from '@/types';
import { sidePanelVisible } from './annotationTiming';

export function getActivePlaybackAnnotationId(params: {
  annotations: TextAnnotation[];
  currentTime: number;
  totalDuration: number;
  phase?: 'idle' | 'preloading' | 'intro' | 'playing' | 'outro' | 'ended';
}) {
  const { annotations, currentTime, totalDuration, phase } = params;

  if (totalDuration <= 0 || annotations.length === 0 || phase === 'outro' || phase === 'ended') {
    return null;
  }

  const sortedAnnotations = [...annotations].sort((a, b) => a.progress - b.progress);

  for (const annotation of sortedAnnotations) {
    if (annotation.presentation === 'side-panel') {
      if (sidePanelVisible(annotation, currentTime, totalDuration)) return annotation.id;
      continue;
    }
    const arrivalTime = annotation.progress * totalDuration;
    const leadTime = Math.max(0, annotation.displayDuration);
    const windowStart = Math.max(0, arrivalTime - leadTime);

    if (currentTime >= windowStart && currentTime <= arrivalTime) {
      return annotation.id;
    }
  }

  return null;
}
