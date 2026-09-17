import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const packageFiles = ['package.json', 'app/package.json'];
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const packages = await Promise.all(packageFiles.map(async (file) => ({
  file,
  value: JSON.parse(await readFile(resolve(root, file), 'utf8')).version,
})));

for (const { file, value } of packages) {
  if (typeof value !== 'string' || !semver.test(value)) {
    throw new Error(`${file} must contain a valid SemVer version; received ${JSON.stringify(value)}.`);
  }
}

const versions = new Set(packages.map(({ value }) => value));
if (versions.size !== 1) {
  throw new Error(`Package versions disagree: ${packages.map(({ file, value }) => `${file}=${value}`).join(', ')}`);
}

const sourceFile = 'app/src/utils/projectFile/types.ts';
const source = await readFile(resolve(root, sourceFile), 'utf8');
const appVersion = source.match(/export const APP_VERSION = '([^']+)'/u)?.[1];
const [version] = versions;
if (appVersion !== version) {
  throw new Error(`${sourceFile} APP_VERSION (${appVersion ?? 'missing'}) must match package version ${version}.`);
}

const changelog = await readFile(resolve(root, 'CHANGELOG.md'), 'utf8');
if (!changelog.includes(`## [${version}]`)) {
  throw new Error(`CHANGELOG.md must contain a section for ${version}.`);
}
if (process.argv.includes('--publish') && !new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'mu').test(changelog)) {
  throw new Error(`CHANGELOG.md must date the ${version} section before publishing a release.`);
}

console.log(`Release metadata is consistent for v${version}.`);
