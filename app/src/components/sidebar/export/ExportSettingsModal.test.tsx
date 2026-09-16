import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultVideoExportSettings } from '@/store/defaults';
import { ExportSettingsModal } from './ExportSettingsModal';
import { localStudioDownload } from './studioDelivery';

describe('Studio settings in local development', () => {
  it('explains local MP4 delivery without requiring an email address', () => {
    expect(localStudioDownload).toBe(true);
    render(<ExportSettingsModal
      consentDefaultsLoaded
      estimatedSize="20 MB"
      isOpen
      marketingConsent={false}
      mp4Supported
      onClose={vi.fn()}
      onMarketingConsentChange={vi.fn()}
      onStudioDeliveryEmailChange={vi.fn()}
      setVideoExportSettings={vi.fn()}
      studioDeliveryEmail=""
      studioSupported
      t={(key) => key}
      videoExportSettings={{ ...createDefaultVideoExportSettings(), qualityMode: 'studio' }}
    />);

    expect(screen.getByText('export.studioLocalSummary')).toBeInTheDocument();
    expect(screen.queryByLabelText('export.studioEmailLabel')).not.toBeInTheDocument();
  });
});
