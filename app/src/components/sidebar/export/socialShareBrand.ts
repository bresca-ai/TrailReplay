import type { SocialShareSettings } from '@/types';

const LOGO_WIDTH_FRACTION = 0.20;
const LOGO_ASPECT_RATIO = 500 / 200;
const DEFAULT_X = 0.76;
const DEFAULT_Y = 0.04;
const LOGO_URL = '/media/images/logohorizontalfondo.svg';

let logoPromise: Promise<HTMLImageElement> | null = null;

export function loadSocialShareLogo(): Promise<HTMLImageElement> {
  if (!logoPromise) {
    logoPromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => {
        logoPromise = null;
        reject(new Error('TrailReplay cover logo could not be loaded'));
      };
      image.src = LOGO_URL;
    });
  }
  return logoPromise;
}

export function getSocialShareLogoBox(settings: SocialShareSettings, width: number, height: number) {
  const w = width * LOGO_WIDTH_FRACTION;
  const h = w / LOGO_ASPECT_RATIO;
  const x = Math.max(0, Math.min(width - w, (settings.logoPositionX ?? DEFAULT_X) * width));
  const y = Math.max(0, Math.min(height - h, (settings.logoPositionY ?? DEFAULT_Y) * height));
  return { x, y, w, h };
}
