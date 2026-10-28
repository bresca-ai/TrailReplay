import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultVideoExportSettings } from '@/store/defaults';
import { getResolution } from './exportConfig';
import { VideoSettingsInline } from './VideoSettingsInline';

function setup(overrides: Partial<Parameters<typeof VideoSettingsInline>[0]> = {}) {
  const onChange = vi.fn();
  const settings = { ...createDefaultVideoExportSettings(), quality: 'medium' as const };
  render(<VideoSettingsInline settings={settings} onChange={onChange} disabled={false} mp4Supported studioSupported estimatedSize="12 MB" durationSeconds={15} studioDeliveryEmail="" onStudioDeliveryEmailChange={vi.fn()} marketingConsent={false} consentDefaultsLoaded onMarketingConsentChange={vi.fn()} t={(key) => key} {...overrides} />);
  return { onChange, settings };
}

afterEach(cleanup);

describe('inline video settings', () => {
  it('keeps quality, ratio, resolution and format changes consistent', () => {
    const { onChange, settings } = setup();
    expect(settings.resolution).toEqual(getResolution(settings.quality, settings.aspectRatio));
    fireEvent.change(screen.getByLabelText('export.quality'), { target: { value: 'high' } });
    expect(onChange).toHaveBeenCalledWith({ quality: 'high', resolution: getResolution('high', '16:9') });
    fireEvent.click(screen.getByRole('button', { name: '4:5' }));
    expect(onChange).toHaveBeenCalledWith({ aspectRatio: '4:5', quality: settings.quality, resolution: getResolution(settings.quality, '4:5') });
    fireEvent.change(screen.getByLabelText('export.format'), { target: { value: 'webm' } });
    expect(onChange).toHaveBeenCalledWith({ format: 'webm', qualityMode: 'standard' });
  });
  it('shows the effective quality for older mismatched settings', () => {
    setup({ settings: { ...createDefaultVideoExportSettings(), quality: 'high' } });
    expect(screen.getByLabelText('export.quality')).toHaveValue('medium');
  });
  it('prevents Studio with WebM', () => {
    const settings = { ...createDefaultVideoExportSettings(), format: 'webm' as const };
    setup({ settings });
    expect(screen.getByRole('button', { name: 'export.qualityModeStudio' })).toBeDisabled();
    expect(screen.getByText('export.studioNeedsMp4')).toBeInTheDocument();
  });
  it('locks settings during export', () => {
    setup({ disabled: true });
    expect(screen.getByLabelText('export.format')).toBeDisabled();
    expect(screen.getByRole('button', { name: '4:5' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'export.qualityModeStandard' })).toBeDisabled();
  });
});
