// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { retainDeploymentAssets } from './retain-deployment-assets.mjs';

const tempDirs = [];
const servers = [];
const day = 86400000;
async function makeDist(name = 'main-new12345.js') {
  const dir = await mkdtemp(path.join(tmpdir(), 'trailreplay-retention-'));
  tempDirs.push(dir);
  await mkdir(path.join(dir, 'assets'));
  await writeFile(path.join(dir, 'assets', name), 'new app');
  return dir;
}
async function serve(files) {
  const server = createServer((req, res) => {
    const value = files[req.url] ?? (!req.url.startsWith('/assets/') && req.url !== '/retained-assets.json' ? files['/'] : undefined);
    if (value === undefined) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': req.url.endsWith('.json') ? 'application/json' : 'application/javascript' }).end(value);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('retaining previous production assets', () => {
  it('bootstraps old lazy chunks, transitive styles and JSON without replacing the new build', async () => {
    const dist = await makeDist();
    const source = await serve({
      '/': '<script src="/assets/main-old12345.js"></script>',
      '/assets/main-old12345.js': 'import "./vendor-abc12345.js"; const lazy=["assets/Export-old12345.js"]',
      '/assets/vendor-abc12345.js': 'const data="/assets/icons-abc12345.json"',
      '/assets/Export-old12345.js': 'const dep="assets/style-abc12345.css"',
      '/assets/style-abc12345.css': '@font-face{src:url(./font-abc12345.woff2)}',
      '/assets/icons-abc12345.json': '{}',
      '/assets/font-abc12345.woff2': 'font bytes',
    });
    expect(await retainDeploymentAssets({ dist, source, now: 1000 })).toEqual({ current: 1, retained: 6 });
    expect(await readFile(path.join(dist, 'assets/Export-old12345.js'), 'utf8')).toContain('style-abc12345.css');
    expect(await readFile(path.join(dist, 'assets/icons-abc12345.json'), 'utf8')).toBe('{}');
    expect(await readFile(path.join(dist, 'assets/main-new12345.js'), 'utf8')).toBe('new app');
  });

  it('keeps the live build after a long quiet period but expires older retained builds', async () => {
    const dist = await makeDist();
    const source = await serve({
      '/retained-assets.json': JSON.stringify({ version: 1, currentAssets: ['main-live1234.js'], assets: [
        { name: 'main-live1234.js', expiresAt: 30 * day },
        { name: 'old-older123.js', expiresAt: 30 * day },
      ] }),
      '/assets/main-live1234.js': 'live',
    });
    expect(await retainDeploymentAssets({ dist, source, now: 45 * day })).toEqual({ current: 1, retained: 1 });
    const manifest = JSON.parse(await readFile(path.join(dist, 'retained-assets.json'), 'utf8'));
    expect(manifest.assets).toContainEqual({ name: 'main-live1234.js', expiresAt: 75 * day });
    expect(manifest.assets.some((item) => item.name === 'old-older123.js')).toBe(false);
  });

  it('carries both the live and still-valid older builds through consecutive deployments', async () => {
    const dist = await makeDist();
    const source = await serve({
      '/retained-assets.json': JSON.stringify({ version: 1, currentAssets: ['main-live1234.js'], assets: [
        { name: 'main-live1234.js', expiresAt: 50 * day },
        { name: 'old-older123.js', expiresAt: 31 * day },
      ] }),
      '/assets/main-live1234.js': 'live',
      '/assets/old-older123.js': 'older',
    });
    expect(await retainDeploymentAssets({ dist, source, now: 15 * day })).toEqual({ current: 1, retained: 2 });
    const manifest = JSON.parse(await readFile(path.join(dist, 'retained-assets.json'), 'utf8'));
    expect(manifest.assets).toContainEqual({ name: 'old-older123.js', expiresAt: 31 * day });
    expect(await readFile(path.join(dist, 'assets/old-older123.js'), 'utf8')).toBe('older');
  });

  it('fails the build if an old asset cannot be retained', async () => {
    const dist = await makeDist();
    const source = await serve({ '/': '<script src="/assets/main-old12345.js"></script>' });
    await expect(retainDeploymentAssets({ dist, source })).rejects.toThrow('HTTP 404');
  });

  it('fails instead of overwriting a current asset with different bytes', async () => {
    const dist = await makeDist('main-same1234.js');
    const source = await serve({
      '/retained-assets.json': JSON.stringify({ version: 1, currentAssets: ['main-same1234.js'], assets: [{ name: 'main-same1234.js', expiresAt: 999999 }] }),
      '/assets/main-same1234.js': 'different',
    });
    await expect(retainDeploymentAssets({ dist, source, now: 1000 })).rejects.toThrow('Asset name collision');
  });
});
