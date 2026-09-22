import { describe, expect, it, vi } from 'vitest';
import { createCameraSettingBatch, reportCameraSettingChange } from './cameraSettingAnalytics';

describe('camera adjustments', () => {
  it('reports one committed drag with the initial and final exact values', () => {
    const emit = vi.fn();
    const batch = createCameraSettingBatch(emit);
    batch.change({ setting: 'camera_stability', before: 0.5, after: 0.55, mode: 'follow', source: 'settings_panel' });
    batch.change({ setting: 'camera_stability', before: 0.55, after: 0.7, mode: 'follow', source: 'settings_panel' });
    expect(emit).not.toHaveBeenCalled();
    batch.flush(); batch.flush();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('camera_setting_changed', expect.objectContaining({ previous_value: '0.5', setting_value: '0.7' }));
  });
  it('ignores returning to the original setting and records map button adjustments', () => {
    const emit = vi.fn();
    reportCameraSettingChange({ setting: 'camera_stability', before: 0.5, after: 0.5, mode: 'follow', source: 'settings_panel' }, emit);
    expect(emit).not.toHaveBeenCalled();
    reportCameraSettingChange({ setting: 'follow_behind_distance_level', before: 33, after: 49.5, mode: 'follow-behind', source: 'map_zoom_control' }, emit);
    expect(emit).toHaveBeenCalledWith('camera_setting_changed', expect.objectContaining({ previous_value: '33', setting_value: '49.5', control_source: 'map_zoom_control' }));
  });
});
