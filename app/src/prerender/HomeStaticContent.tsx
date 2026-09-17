import { SEO_LANDING_PAGES, type SeoLandingSlug } from '@/seo/seoPages';

const HELP_LINKS = [
  { href: '/tutorial', label: 'How to turn a GPX file into a video', body: 'The full TrailReplay workflow, from import to a finished export.' },
  { href: '/gpx-download-guide', label: 'How to download GPX files', body: 'Export route files from Strava, Garmin Connect, Wikiloc, and more.' },
];

/**
 * Crawlable first-paint content for the studio homepage.
 *
 * `main.tsx` mounts the real application into the same `#root` node, so this is
 * replaced as soon as the bundle executes. It exists so that crawlers (and the
 * first frame) get a described page and a link graph instead of an empty div.
 */
export function HomeStaticContent() {
  const landingPages = Object.keys(SEO_LANDING_PAGES) as SeoLandingSlug[];

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-[var(--evergreen)]">
      <h1 className="text-3xl font-bold tracking-[-0.04em]">
        Turn a GPX File Into a 3D Route Video
      </h1>
      <p className="mt-4 leading-7">
        TrailReplay is a free, open-source studio for runners, cyclists, hikers, and outdoor
        creators. Import a GPX or KML track, replay it on a 3D map with terrain, and export the
        animation as a video with distance, pace, elevation, photos, and annotations.
      </p>
      <p className="mt-4 leading-7">
        Routes are parsed locally in your browser — no account, no upload, and no installation.
      </p>

      <h2 className="mt-10 text-xl font-bold">How it works</h2>
      <ol className="mt-4 space-y-2 leading-7">
        <li>1. Import one or more GPX or KML files, or combine them into a longer journey.</li>
        <li>2. Choose the basemap, 3D terrain, camera behaviour, and trail style.</li>
        <li>3. Add live statistics, elevation, photos, icons, and text annotations.</li>
        <li>4. Record an MP4 or WebM in landscape, square, or vertical format.</li>
      </ol>

      <h2 className="mt-10 text-xl font-bold">Guides</h2>
      <ul className="mt-4 space-y-3 leading-7">
        {HELP_LINKS.map(({ href, label, body }) => (
          <li key={href}>
            <a href={href} className="font-semibold underline">{label}</a>
            <span className="block text-sm">{body}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-xl font-bold">Make a route video</h2>
      <ul className="mt-4 space-y-3 leading-7">
        {landingPages.map((slug) => {
          const page = SEO_LANDING_PAGES[slug];
          return (
            <li key={slug}>
              <a href={`/${slug}`} className="font-semibold underline">{page.title}</a>
              <span className="block text-sm">{page.description}</span>
            </li>
          );
        })}
      </ul>

      <p className="mt-10 text-sm">
        <a href="/acknowledgments" className="underline">Acknowledgments</a>
        {' · '}
        <a href="/privacy" className="underline">Privacy</a>
        {' · '}
        <a href="/terms" className="underline">Terms</a>
        {' · '}
        <a href="https://github.com/bresca-ai/TrailReplay" className="underline">Source on GitHub</a>
      </p>
    </main>
  );
}
