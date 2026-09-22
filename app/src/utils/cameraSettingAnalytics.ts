import { trackEvent } from './analytics';
import type { CameraMode } from '@/types';

type Change = {
  setting: 'camera_mode' | 'follow_behind_distance_level' | 'camera_stability';
  before: string | number;
  after: string | number;
  mode: CameraMode;
  source: 'settings_panel' | 'map_zoom_control';
};

export function reportCameraSettingChange(change: Change, emit = trackEvent) {
  if (change.before === change.after) return;
  emit('camera_setting_changed', {
    setting_name: change.setting,
    setting_value: String(change.after),
    previous_value: String(change.before),
    camera_mode: change.mode,
    feature_context: 'settings',
    control_source: change.source,
  });
}

/** A drag/key repeat is one committed adjustment, including the original value. */
export function createCameraSettingBatch(emit = trackEvent) {
  const pending = new Map<Change['setting'], Change>();
  return {
    change(change: Change) {
      const first = pending.get(change.setting);
      pending.set(change.setting, { ...change, before: first?.before ?? change.before });
    },
    flush() {
      for (const change of pending.values()) reportCameraSettingChange(change, emit);
      pending.clear();
    },
  };
}
