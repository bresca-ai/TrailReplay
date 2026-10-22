import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SEO_PAGES } from './seo-pages.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(scriptDirectory, '../public/sitemap.xml');
const repositoryRoot = path.resolve(scriptDirectory, '../..');
const siteUrl = 'https://trailreplay.com';

function pageLastmod(page) {
  try {
    const date = execFileSync('git', [
      'log', '-1', '--format=%cs', '--', ...page.sourceFiles,
    ], { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  } catch {
    // Static exports without Git metadata use the checked-in fallback date.
  }
  return page.lastmod;
}

const urls = SEO_PAGES.map((page) => `  <url>
    <loc>${siteUrl}${page.path}</loc>
    <lastmod>${pageLastmod(page)}</lastmod>
  </url>`).join('\n\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

await writeFile(outputPath, sitemap, 'utf8');
console.log(`Generated sitemap with ${SEO_PAGES.length} canonical URLs.`);
