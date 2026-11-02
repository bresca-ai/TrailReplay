import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDirectory, '..');
const distRoot = path.join(appRoot, 'dist');

const ROOT_DIV = '<div id="root"></div>';

// Read by vite.config.ts to keep the dev-only inspector out of rendered markup.
process.env.TRAILREPLAY_PRERENDER = '1';

const vite = await createServer({
  root: appRoot,
  logLevel: 'warn',
  server: { middlewareMode: true },
  appType: 'custom',
});

let rendered;
let localizedHelpMetadata;
let germanLandingMetadata;
let localizedHomeMetadata;
try {
  const module = await vite.ssrLoadModule('/src/prerender/entry-server.tsx');
  rendered = module.renderAllPages();
  localizedHelpMetadata = module.localizedHelpMetadata;
  germanLandingMetadata = module.germanLandingMetadata;
  localizedHomeMetadata = module.localizedHomeMetadata;
} finally {
  await vite.close();
}

const locales = ['en', 'es', 'ca', 'de', 'fr', 'zh-TW'];
const helpSlugs = ['tutorial', 'gpx-download-guide', 'agents'];
const landingSlugs = ['strava-to-video', 'garmin-to-video', 'gpx-animation', 'cycling-route-animation', 'running-route-animation', 'cinematic-camera'];
const templates = new Map();
for (const file of Object.keys(rendered)) {
  const base = file.split('/').at(-1);
  if (!templates.has(base)) templates.set(base, await readFile(path.join(distRoot, base), 'utf8'));
}
const escapeHtml = (text) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

for (const [file, markup] of Object.entries(rendered)) {
  const target = path.join(distRoot, file);
  const parts = file.split('/');
  const localized = parts.length === 2;
  const baseFile = parts.at(-1);
  const slug = baseFile.replace(/\.html$/, '');
  const language = localized ? locales.find((code) => code.toLowerCase() === parts[0]) : 'en';
  const template = path.join(distRoot, baseFile);
  let html = templates.get(baseFile);
  if (!html.includes(ROOT_DIV)) throw new Error(`prerender: no empty #root mount point found in ${template}`);

  if (slug === 'index') {
    const alternates = locales.map((code) => {
      const prefix = code === 'en' ? '' : `/${code.toLowerCase()}`;
      return `<link rel="alternate" hreflang="${code}" href="https://trailreplay.com${prefix}/" />`;
    }).join('\n    ');
    html = html.replace('</head>', `    ${alternates}\n  </head>`);
    if (localized) {
      const metadata = localizedHomeMetadata(language);
      const url = `https://trailreplay.com/${language.toLowerCase()}/`;
      const title = escapeHtml(`${metadata.title} | TrailReplay`);
      const description = escapeHtml(metadata.description);
      html = html.replace('<html lang="en">', `<html lang="${language}">`)
        .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
        .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/, `<meta name="description" content="${description}" />`)
        .replace(/<meta name="language" content="[^"]*"\s*\/>/, '')
        .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${url}" />`)
        .replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${url}" />`)
        .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${title}" />`)
        .replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/, `<meta property="og:description" content="${description}" />`)
        .replace(/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${title}" />`)
        .replace(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${description}" />`)
        .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
    }
  }
  if (helpSlugs.includes(slug) || landingSlugs.includes(slug)) {
    const pageLocales = helpSlugs.includes(slug) ? locales : ['en', 'de'];
    const alternates = pageLocales.map((code) => {
      const prefix = code === 'en' ? '' : `/${code.toLowerCase()}`;
      return `<link rel="alternate" hreflang="${code}" href="https://trailreplay.com${prefix}/${slug}" />`;
    }).join('\n    ');
    html = html.replace('</head>', `    ${alternates}\n  </head>`);
    if (localized) {
      const metadata = helpSlugs.includes(slug) ? localizedHelpMetadata(language, slug) : germanLandingMetadata(slug);
      const url = `https://trailreplay.com/${language.toLowerCase()}/${slug}`;
      const title = escapeHtml(`${metadata.title} | TrailReplay`);
      const description = escapeHtml(metadata.description);
      html = html.replace('<html lang="en">', `<html lang="${language}">`)
        .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
        .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${description}" />`)
        .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${url}" />`)
        .replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${url}" />`)
        .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${title}" />`)
        .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${description}" />`)
        .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
    }
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html.replace(ROOT_DIV, `<div id="root">${markup}</div>`), 'utf8');
}

console.log(`Prerendered ${Object.keys(rendered).length} documents.`);
