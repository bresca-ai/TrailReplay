import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SEO_PAGES } from './seo-pages.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDirectory, '..');
const distRoot = path.join(appRoot, 'dist');
const failures = [];

const requiredDocuments = SEO_PAGES
  .filter(({ path: pagePath }) => pagePath !== '/acknowledgments')
  .map(({ file, path: pagePath }) => ({ file, canonical: `https://trailreplay.com${pagePath}` }));

/**
 * Google reports thin, JS-only documents as "Crawled - currently not indexed",
 * so every crawlable page must ship real prerendered text and an internal link
 * graph in its served HTML — not just a mount point.
 */
const MIN_PRERENDERED_WORDS = 250;

function visibleWordCount(html) {
  const body = html.slice(html.indexOf('<body'));
  return body
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function validateVideoObjects(value, file, location = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateVideoObjects(item, file, `${location}[${index}]`));
    return;
  }

  if (!value || typeof value !== 'object') return;

  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  if (types.includes('VideoObject')) {
    for (const property of ['name', 'thumbnailUrl', 'uploadDate']) {
      if (!value[property]) {
        failures.push(`${file} has a VideoObject at ${location} without required ${property}`);
      }
    }
  }

  for (const [property, child] of Object.entries(value)) {
    validateVideoObjects(child, file, `${location}.${property}`);
  }
}

function validateStructuredData(html, file) {
  const scriptPattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    try {
      validateVideoObjects(JSON.parse(match[1]), file);
    } catch (error) {
      failures.push(`${file} contains invalid JSON-LD: ${error.message}`);
    }
  }
}

for (const { file, canonical } of requiredDocuments) {
  const html = await readFile(path.join(distRoot, file), 'utf8');
  validateStructuredData(html, file);
  for (const match of html.matchAll(/href="(\/media\/samples\/[^"?#]+)"/g)) {
    try {
      await access(path.join(distRoot, match[1]));
    } catch {
      failures.push(`${file} links to a missing sample file: ${match[1]}`);
    }
  }
  if (!html.includes('<title>')) failures.push(`${file} is missing a title`);
  if (!html.includes(`rel="canonical" href="${canonical}"`)) {
    failures.push(`${file} is missing canonical ${canonical}`);
  }

  if (html.includes('<div id="root"></div>')) {
    failures.push(`${file} was not prerendered (empty #root)`);
  }
  if (!/<h1[\s>]/.test(html)) failures.push(`${file} is missing a prerendered h1`);
  if (!/<a [^>]*href="\/[^"]*"/.test(html)) {
    failures.push(`${file} has no crawlable internal links`);
  }

  const words = visibleWordCount(html);
  if (words < MIN_PRERENDERED_WORDS) {
    failures.push(`${file} has only ${words} prerendered words (minimum ${MIN_PRERENDERED_WORDS})`);
  }

  if (file.includes('-to-video') || file.includes('route-animation') || file === 'gpx-animation.html') {
    if (!html.includes('application/ld+json')) failures.push(`${file} is missing structured data`);
  }
}

const tutorial = await readFile(path.join(distRoot, 'tutorial.html'), 'utf8');
const gpxAnimation = await readFile(path.join(distRoot, 'gpx-animation.html'), 'utf8');
if (!tutorial.includes('id="sample-routes"') || !gpxAnimation.includes('href="/tutorial#sample-routes"')) {
  failures.push('the GPX animator sample-routes link or its tutorial target is missing');
}

await access(path.join(distRoot, '404.html'));

const sitemap = await readFile(path.join(distRoot, 'sitemap.xml'), 'utf8');
for (const { path: pagePath } of SEO_PAGES) {
  if (!sitemap.includes(`<loc>https://trailreplay.com${pagePath}</loc>`)) {
    failures.push(`sitemap is missing ${pagePath}`);
  }
}

for (const excludedPath of ['/privacy', '/terms', '.html']) {
  if (sitemap.includes(excludedPath)) {
    failures.push(`sitemap contains excluded value ${excludedPath}`);
  }
}

if (failures.length > 0) {
  throw new Error(`SEO validation failed:\n- ${failures.join('\n- ')}`);
}

console.log('SEO output validation passed.');
