import type { SocialShareLayoutPreset, SocialSharePhotoSlot, SocialShareSettings } from '@/types';
import { mapAnnotationSymbol } from '@/components/annotations/annotationSymbol';

export const PRESET_ORDER: SocialShareLayoutPreset[] = ['classic', 'long-way', 'ridge-photo', 'photo-grid'];

export function createPhotoSlot(id: string, x: number, y: number, w: number, h: number): SocialSharePhotoSlot {
  return { id, imageUrl: null, x, y, w, h, offsetX: 0, offsetY: 0, scale: 1 };
}

export function arrangePhotoSlots(slots: SocialSharePhotoSlot[]): SocialSharePhotoSlot[] {
  const count = slots.length;
  return slots.map((slot, index) => {
    if (count === 1) return { ...slot, x: 0, y: 0, w: 1, h: 0.66 };
    if (count <= 3) return { ...slot, x: index / count, y: 0, w: 1 / count, h: 0.66 };
    return { ...slot, x: (index % 2) * 0.5, y: Math.floor(index / 2) * 0.33, w: 0.5, h: 0.33 };
  });
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
    titleMode: 'journey-name',
    photoSlots: preset === 'ridge-photo'
      ? [{ ...(photos[0] ?? createPhotoSlot('hero', 0, 0, 1, 0.66)), x: 0, y: 0, w: 1, h: 0.66 }]
      : [
        { ...(photos[0] ?? createPhotoSlot('left', 0, 0, 0.5, 0.66)), x: 0, y: 0, w: 0.5, h: 0.66 },
        { ...(photos[1] ?? createPhotoSlot('right', 0.5, 0, 0.5, 0.66)), x: 0.5, y: 0, w: 0.5, h: 0.66 },
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
