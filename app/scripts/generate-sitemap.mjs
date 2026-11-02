import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SEO_PAGES } from './seo-pages.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(scriptDirectory, '../public/sitemap.xml');
const siteUrl = 'https://trailreplay.com';

// Shared source files and shallow build clones cannot reliably identify the
// last significant change to each page. Omit lastmod until it can be tracked
// per page, rather than publishing misleading dates.
const localizedHelp = ['es', 'ca', 'de', 'fr', 'zh-tw'].flatMap((language) =>
  ['tutorial', 'gpx-download-guide', 'agents'].map((slug) => ({ path: `/${language}/${slug}` })),
);
const germanLandings = ['strava-to-video', 'garmin-to-video', 'gpx-animation', 'cycling-route-animation', 'running-route-animation', 'cinematic-camera'].map((slug) => ({ path: `/de/${slug}` }));
const localizedHome = ['es', 'ca', 'de', 'fr', 'zh-tw'].map((language) => ({ path: `/${language}/` }));
const urls = [...SEO_PAGES, ...localizedHelp, ...germanLandings, ...localizedHome].map((page) => `  <url>
    <loc>${siteUrl}${page.path}</loc>
  </url>`).join('\n\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

await writeFile(outputPath, sitemap, 'utf8');
console.log(`Generated sitemap with ${SEO_PAGES.length + localizedHelp.length + germanLandings.length + localizedHome.length} canonical URLs.`);
