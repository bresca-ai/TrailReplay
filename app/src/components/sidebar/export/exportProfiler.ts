export type ExportProfileStage = 'mapFrameWait' | 'frameComposite' | 'overlayCapture' | 'encode';

export interface ExportProfileStageStats {
  count: number;
  meanMs: number;
  p95Ms: number;
  totalMs: number;
}

export interface ExportProfileSnapshot {
  enabled: true;
  startedAt: string;
  totalMs: number;
  outcome: 'completed' | 'failed' | 'cancelled';
  stages: Record<ExportProfileStage, ExportProfileStageStats>;
  metadata: Record<string, string | number | boolean>;
}

declare global {
  interface Window {
    __trailreplayExportProfile?: ExportProfileSnapshot;
  }
}

const STAGES: ExportProfileStage[] = ['mapFrameWait', 'frameComposite', 'overlayCapture', 'encode'];
const enabled = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('exportProfile') === '1';

let startedAt = 0;
let startedAtIso = '';
let samples = createSamples();

function createSamples(): Record<ExportProfileStage, number[]> {
  return {
    mapFrameWait: [],
    frameComposite: [],
    overlayCapture: [],
    encode: [],
  };
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(Math.max(0, Math.min(1, fraction)) * sorted.length);
  return sorted[Math.max(0, rank - 1)] ?? 0;
}

function stageStats(values: readonly number[]): ExportProfileStageStats {
  const totalMs = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    meanMs: values.length > 0 ? totalMs / values.length : 0,
    p95Ms: percentile(values, 0.95),
    totalMs,
  };
}

export function isExportProfilingEnabled(): boolean {
  return enabled;
}

export function startExportProfile(): void {
  if (!enabled) return;
  samples = createSamples();
  startedAt = performance.now();
  startedAtIso = new Date().toISOString();
  delete window.__trailreplayExportProfile;
}

export function markExportProfileStage(stage: ExportProfileStage, durationMs: number): void {
  if (!enabled || !Number.isFinite(durationMs) || durationMs < 0) return;
  samples[stage].push(durationMs);
}

export function finishExportProfile(
  outcome: ExportProfileSnapshot['outcome'],
  metadata: ExportProfileSnapshot['metadata'] = {},
): ExportProfileSnapshot | null {
  if (!enabled || startedAt === 0) return null;
  const stages = {} as Record<ExportProfileStage, ExportProfileStageStats>;
  STAGES.forEach((stage) => { stages[stage] = stageStats(samples[stage]); });
  const snapshot: ExportProfileSnapshot = {
    enabled: true,
    startedAt: startedAtIso,
    totalMs: performance.now() - startedAt,
    outcome,
    stages,
    metadata,
  };
  window.__trailreplayExportProfile = snapshot;
  // One machine-readable line makes the browser benchmark easy to collect.
  console.info('[trailreplay-export-profile]', JSON.stringify(snapshot));
  startedAt = 0;
  return snapshot;
}

export const exportProfilerTestUtils = { percentile, stageStats };
