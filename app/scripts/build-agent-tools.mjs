import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(appRoot, 'public');
const outFile = resolve(publicDir, 'agent-tools.mjs');
const manifestTemplate = resolve(appRoot, 'scripts/agent-tools-manifest.json');
await mkdir(publicDir, { recursive: true });
const baseOptions = {
  absWorkingDir: appRoot,
  entryPoints: ['scripts/agent-tools-entry.ts'],
  outfile: outFile,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  packages: 'bundle',
  tsconfig: 'tsconfig.app.json',
  sourcemap: false,
  // pngjs is CommonJS and depends on Node built-ins via require(). Supply a
  // real Node require in the ESM bundle so it remains a single downloadable file.
  banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
};

// Hash every bundled source input (including shared engine and bundled package
// sources) before embedding the version string in the CLI output.
const graph = await build({ ...baseOptions, define: { __TRAILREPLAY_ENGINE_VERSION__: '"pending"' }, metafile: true, write: false, logLevel: 'silent' });
const sourceHasher = createHash('sha256');
for (const input of Object.keys(graph.metafile.inputs).sort()) {
  sourceHasher.update(input).update('\0').update(await readFile(resolve(appRoot, input))).update('\0');
}
const engineVersion = `source-sha256:${sourceHasher.digest('hex')}`;

await build({ ...baseOptions, define: { __TRAILREPLAY_ENGINE_VERSION__: JSON.stringify(engineVersion) }, logLevel: 'silent' });
const bundle = await readFile(outFile);
const bundleHash = createHash('sha256').update(bundle).digest('hex');
const immutableName = `agent-tools.${bundleHash.slice(0, 16)}.mjs`;
const immutableFile = resolve(publicDir, immutableName);

for (const name of await readdir(publicDir)) {
  if (/^agent-tools\.[a-f0-9]{16}\.mjs$/.test(name) && name !== immutableName) {
    await unlink(resolve(publicDir, name));
  }
}
await writeFile(immutableFile, bundle);

const template = JSON.parse(await readFile(manifestTemplate, 'utf8'));
const manifest = {
  ...template,
  contractVersion: 1,
  engineVersion,
  download: `https://trailreplay.com/${immutableName}`,
  latestDownload: 'https://trailreplay.com/agent-tools.mjs',
  sha256: bundleHash,
};
await writeFile(resolve(publicDir, 'agent-tools.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Agent tools bundle ${immutableName} (${bundleHash})`);
