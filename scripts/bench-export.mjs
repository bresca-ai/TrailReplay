#!/usr/bin/env node
/**
 * Drive one synthetic, repeatable TrailReplay export in Chromium and print the
 * stage timings produced by `?exportProfile=1`.
 *
 * Start the app first (`npm run dev`), then run:
 *   npm run bench:export -- --duration 15 --json /tmp/export-profile.json
 *   npm run bench:export -- --duration 15 --output /tmp/trailreplay-export.mp4
 *   npm run bench:export -- --duration 15 --terrain
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

function parseArgs(argv) {
  const args = {
    duration: 15,
    headed: false,
    terrain: false,
    timeout: 300_000,
    url: 'http://localhost:5173',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--duration') args.duration = Number(argv[++index]);
    else if (value === '--headed') args.headed = true;
    else if (value === '--json') args.json = argv[++index];
    else if (value === '--output') args.output = argv[++index];
    else if (value === '--terrain') args.terrain = true;
    else if (value === '--timeout') args.timeout = Number(argv[++index]);
    else if (value === '--url') args.url = argv[++index];
    else throw new Error(`Unknown option: ${value}`);
  }
  if (!Number.isFinite(args.duration) || args.duration < 15) {
    throw new Error('--duration must be at least 15 seconds (the app playback minimum)');
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const browserArgs = ['--disable-dev-shm-usage'];
if (process.platform === 'darwin') {
  browserArgs.push('--use-gl=angle', '--use-angle=metal');
} else {
  browserArgs.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader');
}
const browser = await chromium.launch({
  headless: !args.headed,
  args: browserArgs,
});
const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));
if (!args.output) page.on('download', (download) => download.cancel().catch(() => undefined));

try {
  const url = new URL(args.url);
  url.searchParams.set('probe', '1');
  url.searchParams.set('exportProfile', '1');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__trailreplay !== undefined, null, { timeout: 30_000 });

  const sample = resolve('app/public/media/samples/pedals-de-foc-non-stop-2023.gpx');
  await page.locator('input[type="file"]').first().setInputFiles(sample);
  await page.waitForFunction(() => window.__trailreplay.getState().journeySegments.length > 0, null, {
    timeout: 60_000,
  });

  await page.evaluate(({ durationMs, terrain }) => {
    const state = window.__trailreplay.getState();
    const total = state.journeySegments.reduce((sum, segment) => sum + Math.max(0, segment.duration || 0), 0);
    let assigned = 0;
    state.reorderJourneySegments(state.journeySegments.map((segment, index, all) => {
      const weight = total > 0 ? Math.max(0, segment.duration || 0) / total : 1 / all.length;
      const duration = index === all.length - 1 ? durationMs - assigned : Math.round(durationMs * weight);
      assigned += duration;
      return { ...segment, duration };
    }));
    state.setSettings({ show3DTerrain: terrain });
    state.setVideoExportSettings({
      fps: 30,
      format: 'mp4',
      quality: 'medium',
      qualityMode: 'standard',
      resolution: { width: 1920, height: 1080 },
      aspectRatio: '16:9',
    });
    state.setExportSubMode('video');
    state.setActivePanel('export');
  }, { durationMs: args.duration * 1000, terrain: args.terrain });

  const generate = page.getByRole('button', { name: 'Generate Video' });
  await generate.waitFor({ state: 'visible', timeout: 30_000 });
  const downloadPromise = args.output
    ? page.waitForEvent('download', { timeout: args.timeout })
    : null;
  await generate.click();
  await page.waitForFunction(() => window.__trailreplayExportProfile !== undefined, null, {
    timeout: args.timeout,
  });

  const profile = await page.evaluate(() => window.__trailreplayExportProfile);
  let output;
  if (downloadPromise && args.output) {
    const download = await downloadPromise;
    output = resolve(args.output);
    await download.saveAs(output);
  }
  const result = { ...profile, pageErrors, ...(output && { output }) };
  console.log(JSON.stringify(result, null, 2));
  if (args.json) writeFileSync(args.json, JSON.stringify(result, null, 2));
  if (profile?.outcome !== 'completed' || pageErrors.length > 0) process.exitCode = 1;
} catch (error) {
  const diagnostics = await page.evaluate(() => ({
    body: document.body.innerText.slice(-2_000),
    exportProfile: window.__trailreplayExportProfile,
    state: window.__trailreplay ? {
      activePanel: window.__trailreplay.getState().activePanel,
      exportProgress: window.__trailreplay.getState().exportProgress,
      isExporting: window.__trailreplay.getState().isExporting,
      journeyDuration: window.__trailreplay.getState().journeySegments.reduce(
        (sum, segment) => sum + Math.max(0, segment.duration || 0),
        0,
      ),
      settings: window.__trailreplay.getState().videoExportSettings,
    } : null,
  })).catch((diagnosticError) => ({ diagnosticError: String(diagnosticError) }));
  console.error(JSON.stringify({ error: String(error), diagnostics, pageErrors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
