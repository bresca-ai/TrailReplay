/** Keep older, content-hashed assets available to pages open during a deployment.
 * Cloudflare Pages normally serves only the latest deployment at the production
 * hostname. Do not reload an open editor: its project is held in memory.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const MANIFEST = 'retained-assets.json';
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const ASSET_NAME = /^[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.(?:js|css|json|woff2?|ttf|otf|png|jpe?g|webp|gif|svg|wasm)$/;
const ENTRY_PAGES = ['/', '/tutorial', '/releases', '/agents', '/gpx-download-guide', '/strava-to-video', '/garmin-to-video', '/gpx-animation', '/cycling-route-animation', '/running-route-animation', '/cinematic-camera'];

function references(text) {
  const names = new Set();
  // Vite's dependency maps use assets/name; static imports and CSS use ./name.
  const pattern = /(?:assets\/|\.\/)([A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.(?:js|css|json|woff2?|ttf|otf|png|jpe?g|webp|gif|svg|wasm))\b/g;
  for (const match of text.matchAll(pattern)) if (ASSET_NAME.test(match[1])) names.add(match[1]);
  return names;
}

async function fetchChecked(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!response.ok) throw new Error(`Unable to retain ${url.pathname}: HTTP ${response.status}`);
  return response;
}

async function fetchPriorAssets(base, now) {
  const manifestUrl = new URL(`/${MANIFEST}`, base);
  const response = await fetch(manifestUrl, { signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (response.ok) {
    const manifest = await response.json();
    if (manifest.version !== 1 || !Array.isArray(manifest.assets) || !Array.isArray(manifest.currentAssets)
      || manifest.currentAssets.length === 0 || manifest.assets.length > 5000) throw new Error('Invalid retained asset manifest');
    const live = new Set(manifest.currentAssets);
    const result = new Map();
    for (const entry of manifest.assets) {
      if (!ASSET_NAME.test(entry.name) || !Number.isFinite(entry.expiresAt)) throw new Error('Invalid retained asset entry');
      if (entry.expiresAt > now || live.has(entry.name)) result.set(entry.name, live.has(entry.name) ? now + RETENTION_MS : entry.expiresAt);
    }
    if ([...live].some((name) => !ASSET_NAME.test(name) || !result.has(name))) throw new Error('Missing live asset in retention manifest');
    return result;
  }
  if (response.status !== 404) throw new Error(`Unable to read retained asset manifest: HTTP ${response.status}`);

  // Bootstrap the first deployment of this feature from the live build. Walk
  // Vite's import/dependency maps and CSS URLs so even not-yet-opened panels
  // from that build remain available.
  const html = await Promise.all(ENTRY_PAGES.map(async (page) => (await fetchChecked(new URL(page, base))).text()));
  const pending = [...new Set(html.flatMap((page) => [...references(page)]))];
  if (!pending.length) throw new Error('Could not find the live application assets');
  const found = new Map();
  for (let i = 0; i < pending.length; i++) {
    const name = pending[i];
    if (found.has(name)) continue;
    found.set(name, now + RETENTION_MS);
    if (/\.(js|css)$/.test(name)) {
      const source = await (await fetchChecked(new URL(`/assets/${name}`, base))).text();
      for (const child of references(source)) if (!found.has(child)) pending.push(child);
    }
    if (found.size > 5000) throw new Error('Too many live assets to retain');
  }
  return found;
}

export async function retainDeploymentAssets({ dist = DIST, source, now = Date.now() } = {}) {
  const assetsDir = path.join(dist, 'assets');
  const current = (await readdir(assetsDir)).filter((name) => ASSET_NAME.test(name));
  if (!current.some((name) => /^main-.*\.js$/.test(name))) throw new Error('Missing built app entry point');
  const entries = new Map();
  if (source) {
    const base = new URL(source);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Invalid asset source URL');
    const previous = await fetchPriorAssets(base, now);
    await mkdir(assetsDir, { recursive: true });
    const previousEntries = [...previous];
    let next = 0;
    async function copyNext() {
      while (next < previousEntries.length) {
        const [name, expiresAt] = previousEntries[next++];
        const response = await fetchChecked(new URL(`/assets/${name}`, base));
        if (response.headers.get('content-type')?.includes('text/html')) throw new Error(`Expected an asset for ${name}, received HTML`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (current.includes(name)) {
          const existing = await readFile(path.join(assetsDir, name));
          const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');
          if (digest(existing) !== digest(bytes)) throw new Error(`Asset name collision: ${name}`);
        } else {
          await writeFile(path.join(assetsDir, name), bytes);
        }
        entries.set(name, expiresAt);
      }
    }
    await Promise.all(Array.from({ length: Math.min(12, previousEntries.length) }, () => copyNext()));
  }
  for (const name of current) entries.set(name, now + RETENTION_MS);
  const manifest = { version: 1, currentAssets: current, assets: [...entries].sort(([a], [b]) => a.localeCompare(b)).map(([name, expiresAt]) => ({ name, expiresAt })) };
  await writeFile(path.join(dist, MANIFEST), JSON.stringify(manifest));
  return { current: current.length, retained: entries.size - current.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = process.env.TRAILREPLAY_ASSET_SOURCE || (process.env.CF_PAGES === '1' && process.env.CF_PAGES_BRANCH === 'main' ? 'https://trailreplay.com' : undefined);
  const result = await retainDeploymentAssets({ source });
  console.log(`Asset retention: ${result.current} current, ${result.retained} retained`);
}
