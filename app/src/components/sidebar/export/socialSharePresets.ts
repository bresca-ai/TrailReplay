import type { SocialShareLayoutPreset, SocialSharePhotoSlot, SocialShareSettings } from '@/types';
import { mapAnnotationSymbol } from '@/components/annotations/annotationSymbol';

export const PRESET_ORDER: SocialShareLayoutPreset[] = ['classic', 'long-way', 'ridge-photo', 'photo-grid'];

export function createPhotoSlot(id: string, x: number, y: number, w: number, h: number): SocialSharePhotoSlot {
  return { id, imageUrl: null, x, y, w, h, offsetX: 0, offsetY: 0, scale: 1 };
}

/** Add a frame without moving any frames the user has already arranged. */
export function createAddedPhotoSlot(id: string, slots: SocialSharePhotoSlot[]): SocialSharePhotoSlot {
  if (slots.length === 0) return createPhotoSlot(id, 0, 0, 1, 0.66);
  const candidates = [
    { x: 0.04, y: 0.68 }, { x: 0.54, y: 0.68 },
    { x: 0.04, y: 0.36 }, { x: 0.54, y: 0.36 },
    { x: 0.04, y: 0.04 }, { x: 0.54, y: 0.04 },
  ];
  const size = { w: 0.42, h: 0.26 };
  const best = candidates.reduce<{ x: number; y: number; overlap: number }>((choice, candidate) => {
    const overlap = slots.reduce((total, slot) => total
      + Math.max(0, Math.min(candidate.x + size.w, slot.x + slot.w) - Math.max(candidate.x, slot.x))
      * Math.max(0, Math.min(candidate.y + size.h, slot.y + slot.h) - Math.max(candidate.y, slot.y)), 0);
    return overlap < choice.overlap ? { ...candidate, overlap } : choice;
  }, { ...candidates[0], overlap: Infinity });
  return { ...createPhotoSlot(id, best.x, best.y, size.w, size.h), aboveMap: true };
}

export function presetSettings(preset: SocialShareLayoutPreset, current: SocialShareSettings): Partial<SocialShareSettings> {
  const photos = current.photoSlots ?? [];
  if (preset === 'long-way') return {
    layoutPreset: preset,
    template: 'map-first',
    titleMode: 'custom',
    customTitle: current.customTitle || 'THE\nLONG\nWAY',
    titleScale: 3.1,
    titleWidth: 0.78,
    titleOffsetX: 0.04,
    titleOffsetY: 0.17,
    titleColor: '#FFF7E4',
    statsColor: '#FFF7E4',
    statsLayout: 2,
    stats: current.stats.map((stat, index) => ({ ...stat, visible: index < 2 })),
    statsStyle: 'minimal',
    showElevationMiniChart: false,
    routeGlow: false,
  };
  if (preset === 'ridge-photo' || preset === 'photo-grid') return {
    layoutPreset: preset,
    template: 'split',
    splitMapFrame: undefined,
    titleMode: 'journey-name',
    photoSlots: preset === 'ridge-photo'
      ? [{ ...(photos[0] ?? createPhotoSlot('hero', 0, 0, 1, 0.66)), x: 0, y: 0, w: 1, h: 0.66, aboveMap: false }]
      : [
        { ...(photos[0] ?? createPhotoSlot('left', 0, 0, 0.5, 0.66)), x: 0, y: 0, w: 0.5, h: 0.66, aboveMap: false },
        { ...(photos[1] ?? createPhotoSlot('right', 0.5, 0, 0.5, 0.66)), x: 0.5, y: 0, w: 0.5, h: 0.66, aboveMap: false },
      ],
    titleScale: 1.85,
    titleWidth: 0.92,
    titleOffsetX: 0,
    titleOffsetY: 0,
    titleColor: '#21372C',
    statsColor: '#21372C',
    statsLayout: 2,
    stats: current.stats.map((stat, index) => ({ ...stat, visible: index < 2, icon: index === 0 ? mapAnnotationSymbol('summit') : index === 1 ? mapAnnotationSymbol('waypoint') : stat.icon })),
    statsStyle: 'minimal',
    showElevationMiniChart: false,
    routeGlow: false,
  };
  return { layoutPreset: 'classic', template: 'map-first', titleScale: 1, titleWidth: 0.74, titleOffsetX: 0, titleOffsetY: 0, titleColor: '#FFFFFF', statsColor: '#FFFFFF', routeGlow: false };
}
