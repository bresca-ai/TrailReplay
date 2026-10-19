const HERO_VIDEO = {
  contentUrl: 'https://trailreplay.com/media/video/path-export-with-stats.mp4',
  thumbnailUrl: 'https://trailreplay.com/media/images/seo/path-export-with-stats-poster.jpg',
  durationSeconds: 41,
};

const ROUTE_IMPORT_VIDEO = {
  title: 'Import a Strava or Wikiloc route into TrailReplay',
  description: 'See how to save one Send to TrailReplay bookmark, use it on a Strava activity or Wikiloc trail, and open the route in a new TrailReplay tab.',
  contentUrl: 'https://trailreplay.com/media/video/strava-wikiloc-import-tutorial.mp4',
  thumbnailUrl: 'https://trailreplay.com/media/images/seo/strava-wikiloc-import-tutorial-poster.jpg',
  durationSeconds: 133,
};

export const VIDEO_PAGES = [
  {
    path: '/gpx-animation',
    videos: [{ title: 'GPX Animator: Animate a GPX Route in 3D', description: 'See a GPX route animated on a 3D terrain map with live distance, elevation, and pace statistics, exported straight from the browser.', ...HERO_VIDEO }],
  },
  {
    path: '/strava-to-video',
    videos: [ROUTE_IMPORT_VIDEO, { title: 'Strava Activity Animated as a 3D Route Video', description: 'See a Strava activity GPX animated on a 3D terrain map with live distance, elevation, and pace statistics, exported straight from the browser.', ...HERO_VIDEO }],
  },
  {
    path: '/cinematic-camera',
    videos: [{
      title: 'Cinematic camera tutorial',
      description: 'Learn how to scrub the replay timeline, aim a shot, save camera keyframes, and let TrailReplay blend the moves.',
      contentUrl: 'https://trailreplay.com/media/video/cinematic-camera-tutorial.mp4',
      thumbnailUrl: 'https://trailreplay.com/media/images/seo/cinematic-camera-tutorial-poster.jpg',
      durationSeconds: 30,
    }],
  },
  {
    path: '/garmin-to-video',
    videos: [{ title: 'Garmin Activity Animated as a 3D Route Video', description: 'See a Garmin Connect activity GPX animated on a 3D terrain map with live distance, elevation, and pace statistics, exported straight from the browser.', ...HERO_VIDEO }],
  },
  {
    path: '/gpx-download-guide',
    videos: [ROUTE_IMPORT_VIDEO],
  },
  {
    path: '/tutorial',
    videos: [
      ROUTE_IMPORT_VIDEO,
      {
        title: 'Cinematic camera tutorial',
        description: 'Learn how to scrub the replay timeline, aim a shot, save camera keyframes, and let TrailReplay blend the moves.',
        contentUrl: 'https://trailreplay.com/media/video/cinematic-camera-tutorial.mp4',
        thumbnailUrl: 'https://trailreplay.com/media/images/seo/cinematic-camera-tutorial-poster.jpg',
        durationSeconds: 30,
      },
      { title: 'Path export with stats', description: 'A full route replay with live stats, elevation, and export-ready framing.', ...HERO_VIDEO },
      {
        title: 'Comparison mode demo',
        description: 'Two GPX files replayed together to compare pace, route choices, and timing.',
        contentUrl: 'https://trailreplay.com/media/video/comparison-mode-demo.mp4',
        thumbnailUrl: 'https://trailreplay.com/media/images/seo/comparison-mode-demo-poster.jpg',
        durationSeconds: 38,
      },
      {
        title: 'Aran by UTMB route with landmarks',
        description: 'A square route replay showing named places and route annotations across the Aran by UTMB course.',
        contentUrl: 'https://trailreplay.com/media/video/aran-by-utmb-landmarks-demo.mp4',
        thumbnailUrl: 'https://trailreplay.com/media/images/seo/aran-by-utmb-landmarks-demo-poster.jpg',
        durationSeconds: 35,
      },
    ],
  },
];
