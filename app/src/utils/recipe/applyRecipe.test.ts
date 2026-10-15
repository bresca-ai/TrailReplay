import { describe, expect, it } from 'vitest';
import { mergeRecipeCameraSettings } from './applyRecipe';

describe('mergeRecipeCameraSettings', () => {
  it('keeps an authored follow-behind preset and its website distance level in sync', () => {
    expect(mergeRecipeCameraSettings({
      cameraSettings: { followBehindPreset: 'very-close' },
    })).toMatchObject({
      followBehindPreset: 'very-close',
      followBehindZoomLevel: 100,
    });
  });

  it('snaps an authored distance to a website slider stop and updates the preset label', () => {
    expect(mergeRecipeCameraSettings({
      cameraSettings: { followBehindPreset: 'far', followBehindZoomLevel: 64 },
    })).toMatchObject({
      followBehindPreset: 'close',
      followBehindZoomLevel: 66,
    });
  });
});
