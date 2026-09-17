import { useEffect, type MutableRefObject } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { PictureAnnotation } from '@/types';

// Matches the lucide-react `Image` icon used for the Pictures tab elsewhere
// in the app (e.g. PicturesPanel.tsx), rendered as a raw SVG string since
// this marker element is created outside React for MapLibre.
const PICTURE_MARKER_ICON_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
    fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
`;

interface UsePictureMarkersParams {
  isMapLoaded: boolean;
  mapRef: MutableRefObject<maplibregl.Map | null>;
  pictures: PictureAnnotation[];
  setSelectedPictureId: (pictureId: string | null) => void;
  showPictures: boolean;
}

export function usePictureMarkers({
  isMapLoaded,
  mapRef,
  pictures,
  setSelectedPictureId,
  showPictures,
}: UsePictureMarkersParams) {
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;

    const existingMarkers = document.querySelectorAll('.tr-picture-marker');
    existingMarkers.forEach((element) => element.remove());

    if (!showPictures) return;

    pictures.forEach((picture) => {
      if (!picture.lat || !picture.lon) return;

      const element = document.createElement('div');
      element.className = picture.isPlaceholder ? 'tr-picture-marker tr-picture-marker--placeholder' : 'tr-picture-marker';
      element.style.cssText = `
        width: 32px;
        height: 32px;
        background: ${picture.isPlaceholder ? 'var(--evergreen-60)' : 'var(--trail-orange)'};
        border: 3px solid var(--canvas);
        border-radius: 50%;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        opacity: ${picture.isPlaceholder ? '0.7' : '1'};
      `;
      if (picture.isPlaceholder) {
        element.innerHTML = '🖼️';
      } else {
        // Show the photo itself, cropped to fill the circle. Fall back to
        // the generic icon if the thumbnail fails to load (e.g. a revoked
        // blob URL after reload).
        const thumb = document.createElement('img');
        thumb.src = picture.url;
        thumb.alt = '';
        thumb.style.cssText = 'width: 100%; height: 100%; object-fit: cover; display: block;';
        thumb.onerror = () => {
          thumb.remove();
          element.innerHTML = PICTURE_MARKER_ICON_SVG;
        };
        element.appendChild(thumb);
      }

      element.addEventListener('click', (event) => {
        event.stopPropagation();
        setSelectedPictureId(picture.id);
      });

      new maplibregl.Marker({ element, anchor: 'bottom' })
        .setLngLat([picture.lon, picture.lat])
        .addTo(mapRef.current!);
    });
  }, [isMapLoaded, mapRef, pictures, setSelectedPictureId, showPictures]);
}
