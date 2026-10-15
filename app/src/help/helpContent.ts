type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface SampleTrack {
  title: string;
  subtitle: string;
  badge: string;
  href: string;
  highlight: string;
}

export function getTutorialVideos(t: Translate) {
  return [
    {
      title: t('help.tutorial.videos.pathExport.title'),
      description: t('help.tutorial.videos.pathExport.description'),
      src: '/media/video/path-export-with-stats.mp4',
      poster: '/media/images/seo/path-export-with-stats-poster.jpg',
      downloadLabel: t('help.tutorial.videos.pathExport.downloadLabel'),
    },
    {
      title: t('help.tutorial.videos.comparison.title'),
      description: t('help.tutorial.videos.comparison.description'),
      src: '/media/video/comparison-mode-demo.mp4',
      poster: '/media/images/seo/comparison-mode-demo-poster.jpg',
      downloadLabel: t('help.tutorial.videos.comparison.downloadLabel'),
    },
    {
      title: t('help.tutorial.videos.aranLandmarks.title'),
      description: t('help.tutorial.videos.aranLandmarks.description'),
      src: '/media/video/aran-by-utmb-landmarks-demo.mp4',
      poster: '/media/images/seo/aran-by-utmb-landmarks-demo-poster.jpg',
      downloadLabel: t('help.tutorial.videos.aranLandmarks.downloadLabel'),
    },
  ];
}

export function getSampleTracks(t: Translate): SampleTrack[] {
  return [
    {
      title: "Camins d'Her CDH by UTMB Val d'Aran 2025",
      subtitle: t('help.tutorial.sampleTracks.camins.subtitle'),
      badge: t('help.tutorial.sampleTracks.camins.badge'),
      href: '/media/samples/ultratrail-camins-dher-cdh-by-utmb-val-daran-2025.gpx',
      highlight: t('help.tutorial.sampleTracks.camins.highlight'),
    },
    {
      title: 'Pedals de Foc Non Stop 2023',
      subtitle: t('help.tutorial.sampleTracks.pedals.subtitle'),
      badge: t('help.tutorial.sampleTracks.pedals.badge'),
      href: '/media/samples/pedals-de-foc-non-stop-2023.gpx',
      highlight: t('help.tutorial.sampleTracks.pedals.highlight'),
    },
  ];
}

export function getTutorialFeatures(t: Translate) {
  return [
    {
      title: t('help.tutorial.features.routes.title'),
      body: t('help.tutorial.features.routes.body'),
    },
    {
      title: t('help.tutorial.features.timeline.title'),
      body: t('help.tutorial.features.timeline.body'),
    },
    {
      title: t('help.tutorial.features.style.title'),
      body: t('help.tutorial.features.style.body'),
    },
    {
      title: t('help.tutorial.features.mapCamera.title'),
      body: t('help.tutorial.features.mapCamera.body'),
    },
    {
      title: t('help.tutorial.features.media.title'),
      body: t('help.tutorial.features.media.body'),
    },
    {
      title: t('help.tutorial.features.generate.title'),
      body: t('help.tutorial.features.generate.body'),
    },
  ];
}

export function getQuickStartSteps(t: Translate) {
  return [
    t('help.tutorial.quickStart.step1'),
    t('help.tutorial.quickStart.step2'),
    t('help.tutorial.quickStart.step3'),
    t('help.tutorial.quickStart.step4'),
    t('help.tutorial.quickStart.step5'),
  ];
}

export function getProviderGuides(t: Translate) {
  return [
    {
      name: 'Wikiloc',
      icon: '🗺️',
      subtitle: t('help.gpxGuide.providers.wikiloc.subtitle'),
      siteHref: 'https://www.wikiloc.com',
      steps: [
        t('help.gpxGuide.providers.wikiloc.step1'),
        t('help.gpxGuide.providers.wikiloc.step2'),
        t('help.gpxGuide.providers.wikiloc.step3'),
        t('help.gpxGuide.providers.wikiloc.step4'),
      ],
      notes: [
        t('help.gpxGuide.providers.wikiloc.note1'),
        t('help.gpxGuide.providers.wikiloc.note2'),
      ],
    },
    {
      name: 'Strava',
      icon: '🏃',
      subtitle: t('help.gpxGuide.providers.strava.subtitle'),
      siteHref: 'https://www.strava.com',
      steps: [
        t('help.gpxGuide.providers.strava.step1'),
        t('help.gpxGuide.providers.strava.step2'),
        t('help.gpxGuide.providers.strava.step3'),
        t('help.gpxGuide.providers.strava.step4'),
      ],
      notes: [
        t('help.gpxGuide.providers.strava.note1'),
        t('help.gpxGuide.providers.strava.note2'),
      ],
    },
  ];
}

export function getOtherProviders(t: Translate) {
  return [
    { title: 'Garmin Connect', body: t('help.gpxGuide.otherProviders.garmin') },
    { title: 'Polar Flow', body: t('help.gpxGuide.otherProviders.polar') },
    { title: 'Runkeeper', body: t('help.gpxGuide.otherProviders.runkeeper') },
    { title: 'AllTrails', body: t('help.gpxGuide.otherProviders.alltrails') },
    { title: 'Apple Health', body: t('help.gpxGuide.otherProviders.appleHealth') },
    { title: 'Google Fit', body: t('help.gpxGuide.otherProviders.googleFit') },
  ];
}

export function getGpxTips(t: Translate) {
  return [
    t('help.gpxGuide.tips.tip1'),
    t('help.gpxGuide.tips.tip2'),
    t('help.gpxGuide.tips.tip3'),
    t('help.gpxGuide.tips.tip4'),
  ];
}

export interface AgentStep {
  title: string;
  body: string;
}

export function getAgentSteps(t: Translate): AgentStep[] {
  return [
    { title: t('help.agents.steps.ask.title'), body: t('help.agents.steps.ask.body') },
    { title: t('help.agents.steps.write.title'), body: t('help.agents.steps.write.body') },
    { title: t('help.agents.steps.drop.title'), body: t('help.agents.steps.drop.body') },
  ];
}

export interface AgentExample {
  badge: string;
  title: string;
  problem: string;
  recipe: string;
  result: string;
}

/**
 * The recipes are real and runnable, not illustrations. The aid stations are the
 * published ones for that race; the trip example is the shape that turns a
 * folder of days into an ordered journey.
 */
export function getAgentExamples(t: Translate): AgentExample[] {
  return [
    {
      badge: t('help.agents.examples.race.badge'),
      title: t('help.agents.examples.race.title'),
      problem: t('help.agents.examples.race.problem'),
      result: t('help.agents.examples.race.result'),
      recipe: `{
  "name": "Valls del Freser XTREM 32K",
  "tracks": [{ "file": "xtrem.gpx", "color": "#E86F51" }],
  "landmarks": [
    { "auto": "start-finish", "type": "trailhead", "icon": "town" }
  ],
  "annotations": [
    { "km": 6.5,  "title": "Avituallament 1 — Collet de Barraques" },
    { "km": 13,   "title": "Avituallament 2 — Torrent Gros" },
    { "km": 17,   "title": "Avituallament 3 — Dòrria" },
    { "km": 25,   "title": "Avituallament 4 — Les Casetes" }
  ]
}`,
    },
    {
      badge: t('help.agents.examples.trip.badge'),
      title: t('help.agents.examples.trip.title'),
      problem: t('help.agents.examples.trip.problem'),
      result: t('help.agents.examples.trip.result'),
      recipe: `{
  "name": "Ten days across the Pyrenees",
  "tracks": { "files": "*.gpx", "order": "chronological" },
  "landmarks": [
    { "auto": "start-finish", "type": "trailhead" },
    { "auto": "overnight-stops", "type": "hut", "icon": "shelter" }
  ]
}`,
    },
  ];
}

export interface AgentResource {
  href: string;
  title: string;
  description: string;
}

export function getAgentResources(t: Translate): AgentResource[] {
  return [
    {
      href: '/llms.txt',
      title: 'llms.txt',
      description: t('help.agents.resources.llms'),
    },
    {
      href: '/replay-file.md',
      title: 'replay-file.md',
      description: t('help.agents.resources.spec'),
    },
    {
      href: '/example-recipe.json',
      title: 'example-recipe.json',
      description: t('help.agents.resources.example'),
    },
  ];
}

export interface AgentSource {
  label: string;
  body: string;
}

/**
 * Where routes come from, in the order an agent should try them. The ordering is
 * the useful part: a race's own GPX URL needs nothing from the person, and a
 * bulk export costs them an hour.
 */
export function getAgentSources(t: Translate): AgentSource[] {
  return [
    { label: t('help.agents.sources.url.label'), body: t('help.agents.sources.url.body') },
    { label: t('help.agents.sources.folder.label'), body: t('help.agents.sources.folder.body') },
    { label: t('help.agents.sources.export.label'), body: t('help.agents.sources.export.body') },
    { label: t('help.agents.sources.session.label'), body: t('help.agents.sources.session.body') },
  ];
}
