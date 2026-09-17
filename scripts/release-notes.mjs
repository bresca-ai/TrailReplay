import { readFile } from 'node:fs/promises';

const version = process.argv[2];
if (!version || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error('Pass a release version such as 1.0.0.');
}

const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const heading = `## [${version}] - `;
const start = changelog.indexOf(heading);
if (start === -1) {
  throw new Error(`CHANGELOG.md has no section for ${version}.`);
}

const bodyStart = changelog.indexOf('\n', start) + 1;
const nextSection = changelog.indexOf('\n## [', bodyStart);
const body = changelog.slice(bodyStart, nextSection === -1 ? undefined : nextSection)
  .replace(/^\[\d+\.\d+\.\d+\]:.*$/gmu, '')
  .trim();
if (!body) {
  throw new Error(`CHANGELOG.md section for ${version} is empty.`);
}

process.stdout.write(`${body}\n`);
