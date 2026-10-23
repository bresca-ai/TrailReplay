import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { useAppStore } from '@/store/useAppStore';
import { getCropPreviewMetrics } from '@/utils/crop';
import { VideoLogoPreview } from './VideoLogoPreview';

const originalSettings = useAppStore.getState().videoExportSettings;
afterEach(() => {
  cleanup();
  useAppStore.setState({ videoExportSettings: originalSettings });
});

describe('video watermark preview inside the export crop', () => {
  it.each([
    { ratio: '16:9' as const, width: 1920, height: 1080, left: 978.125, top: 92.5, logoWidth: 191.875 },
    { ratio: '9:16' as const, width: 1080, height: 1920, left: 677.083333, top: 20, logoWidth: 127.916667 },
    { ratio: '1:1' as const, width: 1920, height: 1920, left: 852.083333, top: 20, logoWidth: 127.916667 },
  ])('matches recorded geometry for $ratio with crop offsets', ({ ratio, width, height, left, top, logoWidth }) => {
    useAppStore.setState({ videoExportSettings: { ...originalSettings, resolution: { width, height } } });
    render(<VideoLogoPreview frame={getCropPreviewMetrics(1200, 800, ratio)} />);
    const logo = screen.getByRole('img', { name: 'TrailReplay' });
    expect(logo).toHaveAttribute('src', '/media/images/logohorizontal-white.svg');
    expect(parseFloat(logo.style.left)).toBeCloseTo(left);
    expect(parseFloat(logo.style.top)).toBeCloseTo(top);
    expect(parseFloat(logo.style.width)).toBeCloseTo(logoWidth);
    expect(logo.style.opacity).toBe('0.85');
    expect(logo).toHaveClass('pointer-events-none');
  });
});
