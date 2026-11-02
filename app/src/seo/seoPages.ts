import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Compass,
  Film,
  Keyboard,
  Orbit,
  Bike,
  ChartNoAxesCombined,
  Download,
  FileVideo2,
  Footprints,
  Gauge,
  Map,
  Mountain,
  Route,
  Sparkles,
  Timer,
  Upload,
} from 'lucide-react';

export type SeoLandingSlug =
  | 'strava-to-video'
  | 'garmin-to-video'
  | 'gpx-animation'
  | 'cycling-route-animation'
  | 'running-route-animation'
  | 'cinematic-camera';

interface SeoStep {
  title: string;
  body: string;
}

interface SeoFeature {
  icon: LucideIcon;
  title: string;
  body: string;
}

export interface SeoLandingPageConfig {
  slug: SeoLandingSlug;
  analyticsPageType: 'strava_to_video' | 'garmin_to_video' | 'gpx_animation' | 'cycling_route_animation' | 'running_route_animation' | 'cinematic_camera';
  eyebrow: string;
  title: string;
  description: string;
  proof: string;
  heroMedia: 'product-video' | 'running-photo' | 'cycling-photo';
  stepsTitle: string;
  stepsIntro: string;
  steps: SeoStep[];
  featuresTitle: string;
  features: SeoFeature[];
  detailTitle: string;
  detailParagraphs: string[];
  faq: Array<{ question: string; answer: string }>;
}

export const SEO_LANDING_PAGES: Record<SeoLandingSlug, SeoLandingPageConfig> = {
  'cinematic-camera': {
    slug: 'cinematic-camera',
    analyticsPageType: 'cinematic_camera',
    eyebrow: 'Cinematic camera',
    title: 'Direct the Camera on Your Own Route Video',
    description: 'Place camera keyframes along the timeline and TrailReplay glides between them — a shot you chose, not a camera that just trails the marker.',
    proof: 'The camera follows the line of the route, not every switchback in it.',
    heroMedia: 'product-video',
    stepsTitle: 'Four keys and a ball',
    stepsIntro: 'Cinematic mode lives in Map & Camera. Every step below also works from the keyboard, so you can shoot a whole route without touching the mouse.',
    steps: [
      { title: 'Pause where you want a shot', body: 'Press Space to pause the replay at the moment you want to frame. The marker stays put while you compose.' },
      { title: 'Aim the camera', body: 'Drag the orbit ball, or press A and D to swing around the marker, W and S to raise or lower the camera, R and F to move closer or further away.' },
      { title: 'Save the shot', body: 'Press Enter, or the Set camera keyframe button. Press Enter again at the same moment to update that shot rather than adding a second one.' },
      { title: 'Move on and repeat', body: 'Scrub to the next moment and frame it. Between two keyframes the camera glides smoothly from one to the other.' },
    ],
    featuresTitle: 'Why it looks calmer than a camera that follows',
    features: [
      { icon: Film, title: 'Shots you chose', body: 'Between keyframes the pose comes from a spline through your own values, so it is smooth by construction rather than smoothed after the fact.' },
      { icon: Compass, title: 'Steady through switchbacks', body: 'The camera reads the direction the route takes over several seconds, so hairpins and GPS wander do not turn into camera shake.' },
      { icon: Orbit, title: 'A subject-locked orbit', body: 'The ball only changes the angle, height and distance around your marker, so the subject cannot slide out of the shot while you frame it.' },
      { icon: Keyboard, title: 'Keyboard-first', body: 'Space, A/D, W/S, R/F and Enter cover the whole loop — pause, aim, save, move on.' },
    ],
    detailTitle: 'What a cinematic camera changes',
    detailParagraphs: [
      'A camera that follows a marker has to answer every move the marker makes. On a mountain route that means every switchback, and on a compressed replay a switchback lasts a fraction of a second — so the picture shakes even though the route is simply turning.',
      'Placing keyframes inverts that. You decide where the camera sits at a handful of moments, and the motion in between is interpolated rather than reacted. The result is a shot that holds still when you want it to and moves when you asked it to.',
      'Keyframes are saved inside your .replay project file and are anchored to a point on the route rather than to a timestamp, so changing the clip length or reordering journey segments keeps every shot on the piece of route you framed it for.',
    ],
    faq: [
      { question: 'Do I need to place a keyframe for the whole route?', answer: 'No. With no keyframes the camera behaves like Follow Behind, and a single keyframe holds one locked-off shot for the entire replay. Add more only where you want the shot to change.' },
      { question: 'What happens between two keyframes?', answer: 'The camera eases from one to the next. You can also set a keyframe to hold the previous shot until it is reached, or to move at a constant rate instead of easing.' },
      { question: 'Can the camera keep pointing the same way as the route?', answer: 'Yes. Each keyframe is either locked to the compass or held relative to the route, so a shot can stay over-the-shoulder as the trail turns.' },
      { question: 'Does the exported video match the preview?', answer: 'Yes. The exported frames use the same camera evaluation as the live preview, so what you framed is what gets recorded.' },
      { question: 'My camera still moves more than I want. What should I change?', answer: 'Pull the Camera Stability slider toward Cinematic. It widens the window the camera smooths its path over. Pulling the camera further back also helps, because a wider shot can absorb more of the route wander.' },
    ],
  },
  'strava-to-video': {
    slug: 'strava-to-video',
    analyticsPageType: 'strava_to_video',
    eyebrow: 'Strava activity to video',
    title: 'Turn a Strava Activity Into a 3D Route Video',
    description: 'Open a Strava activity in TrailReplay with one saved bookmark, or import its GPX manually. Turn the real route into a 3D video with stats and elevation.',
    proof: 'Built for real activity data, not a hand-drawn travel line.',
    heroMedia: 'product-video',
    stepsTitle: 'From Strava activity to MP4',
    stepsIntro: 'On desktop, save the Send to TrailReplay bookmark once. It reads an activity you can export from your signed-in Strava session and opens the route in a new TrailReplay tab.',
    steps: [
      { title: 'Save the importer', body: 'Drag Send to TrailReplay onto your bookmarks bar, or copy its code to create a bookmark without showing the bar.' },
      { title: 'Open your Strava activity', body: 'Sign in to Strava on desktop, open an activity you can export, and select the saved bookmark. Your route opens in a new TrailReplay tab.' },
      { title: 'Shape the replay', body: 'Choose the map, camera, trail style, statistics, speed, annotations, and export frame.' },
      { title: 'Download the video', body: 'Record an MP4 or WebM ready for editing, YouTube, Instagram, or your ride recap.' },
    ],
    featuresTitle: 'A replay that still feels like your activity',
    features: [
      { icon: Route, title: 'Recorded route', body: 'Animate the GPX line from the activity you actually completed.' },
      { icon: ChartNoAxesCombined, title: 'Real statistics', body: 'Show distance, elevation, pace, speed, and progress where the file supports them.' },
      { icon: Mountain, title: 'Terrain-aware 3D', body: 'Use terrain, camera movement, and elevation to give the route geographical context.' },
    ],
    detailTitle: 'Automatic or manual Strava import',
    detailParagraphs: [
      'For automatic import, save Send to TrailReplay from the guide on this page. Open an exportable Strava activity while signed in, then select the bookmark on that activity page. TrailReplay opens the route in a new tab without a separate download step.',
      'If you prefer a file, open your activity on Strava, select the three-dot action menu, choose Export GPX, and upload the file to TrailReplay. Strava may limit GPX export for activities that do not belong to you.',
      'A timestamped activity file produces the most faithful replay. If timestamps are unavailable, TrailReplay can still visualize the route and create an animation using the playback settings you choose.',
    ],
    faq: [
      { question: 'Does TrailReplay connect to my Strava account?', answer: 'No account connection is required. The bookmark uses your signed-in Strava browser session to export an activity you can access. You can also download its GPX and import it manually.' },
      { question: 'Can I use a Strava route instead of an activity?', answer: 'Yes, if you can export it as GPX. Activity files usually contain richer timing data.' },
      { question: 'Is my Strava GPX uploaded?', answer: 'The route is parsed locally in your browser by default and is not uploaded to TrailReplay servers.' },
    ],
  },
  'garmin-to-video': {
    slug: 'garmin-to-video',
    analyticsPageType: 'garmin_to_video',
    eyebrow: 'Garmin activity to video',
    title: 'Turn a Garmin Activity Into a 3D Route Video',
    description: 'Export GPX from Garmin Connect and create an animated route replay with terrain, elevation, statistics, photos, and video export.',
    proof: 'Works from a standard GPX export. No Garmin account connection needed.',
    heroMedia: 'product-video',
    stepsTitle: 'Create a Garmin route replay',
    stepsIntro: 'Start with the original activity export to preserve as much route and timing detail as possible.',
    steps: [
      { title: 'Open Garmin Connect', body: 'Open the completed activity on the Garmin Connect website.' },
      { title: 'Export the GPX', body: 'Use the activity settings menu and select Export to GPX.' },
      { title: 'Customize the route', body: 'Import the file, choose the map and camera, and add stats, elevation, photos, or text.' },
      { title: 'Export your replay', body: 'Record a landscape, square, or vertical route video for your preferred channel.' },
    ],
    featuresTitle: 'Use the detail your Garmin recorded',
    features: [
      { icon: Activity, title: 'Activity-first', body: 'Build the story around the route and timestamps captured by your device.' },
      { icon: Gauge, title: 'Sport statistics', body: 'Display useful motion and route metrics in the exported video.' },
      { icon: FileVideo2, title: 'Flexible output', body: 'Choose MP4 or WebM with export settings for different aspect ratios and quality levels.' },
    ],
    detailTitle: 'Exporting from Garmin Connect',
    detailParagraphs: [
      'Use Garmin Connect in a desktop browser, open the activity detail, select the gear icon, and choose Export to GPX. The exact menu wording can vary as Garmin updates Connect.',
      'GPX is ideal for route geometry and broadly compatible timestamps, and TrailReplay also imports FIT files directly. If you want the watch’s original recording and its extra sensor data, use Export Original and import the FIT file.',
    ],
    faq: [
      { question: 'Does this work with Garmin watches and bike computers?', answer: 'Yes. If the recorded activity appears in Garmin Connect and can be exported as GPX, TrailReplay can import it.' },
      { question: 'Do I need to install software?', answer: 'No. TrailReplay runs in a modern desktop browser.' },
      { question: 'Can I import a FIT file from Garmin?', answer: 'Yes. TrailReplay imports FIT files directly. Choose Export Original in Garmin Connect when you want the watch’s original recording and sensor data.' },
      { question: 'Can I add photos to a Garmin route replay?', answer: 'Yes. Photos can be positioned using GPS or timestamps when metadata is available, or placed manually.' },
    ],
  },
  'gpx-animation': {
    slug: 'gpx-animation',
    analyticsPageType: 'gpx_animation',
    eyebrow: 'Free online GPX animator',
    title: 'GPX Animator: Animate a GPX File on a 3D Map',
    description: 'TrailReplay is a free GPX animator that turns a recorded GPS track into a cinematic route animation with terrain, live statistics, elevation, photos, and downloadable video.',
    proof: 'Free, open source, and processed in your browser.',
    heroMedia: 'product-video',
    stepsTitle: 'Animate a GPX file in minutes',
    stepsIntro: 'No timeline editor is required. Import a route, compose the view, preview it, and record.',
    steps: [
      { title: 'Import GPX or KML', body: 'Drop one route or combine multiple tracks into a longer journey.' },
      { title: 'Choose the map', body: 'Select imagery, terrain, trail color, camera behavior, and the section of the route to show.' },
      { title: 'Add the story', body: 'Include elevation, statistics, pictures, labels, annotations, or a comparison track.' },
      { title: 'Record the animation', body: 'Export the replay as a video or capture a social-ready still image.' },
    ],
    featuresTitle: 'More than a moving line',
    features: [
      { icon: Map, title: 'Map and terrain', body: 'Put the route in its real landscape with configurable basemaps and 3D terrain.' },
      { icon: Sparkles, title: 'Story controls', body: 'Control pace, camera, crop, visual style, pictures, and annotations.' },
      { icon: Download, title: 'Files you can use', body: 'Download the result for a video editor or publish it directly.' },
    ],
    detailTitle: 'What makes a good GPX animation?',
    detailParagraphs: [
      'A clean track, useful timestamps, and a deliberate camera angle matter more than excessive effects. Start with the whole route, then choose a playback speed that keeps the geography readable.',
      'For a vertical social post, preview the 9:16 crop before recording. For YouTube or a longer film, landscape output leaves more space for the map and statistics.',
      'To preview a GPX on a 3D map, import the file and explore the terrain before recording. Choose a view that shows the whole route, then adjust the camera and playback speed to make important climbs and turns easy to follow.',
      'For a timed activity, recorded timestamps help the replay follow your progress. A route without timestamps can still be displayed and animated, but it cannot reproduce the original timing or provide statistics that were not recorded.',
      'Unlike animator tools that require a desktop install, TrailReplay runs entirely in the browser: no download, no Java runtime, no OS-specific build. Import a file, compose the view, and export, all in the same tab.',
    ],
    faq: [
      { question: 'What is a GPX animator?', answer: 'It is a tool that produces a timed visual replay of GPS coordinates on a map, usually exported as video for sharing or editing.' },
      { question: 'Do I need to download or install anything?', answer: 'No. TrailReplay is an online GPX animator that runs fully in your browser tab, with no desktop app, Java runtime, or installer required.' },
      { question: 'Is this the same as a GPX flyover or route replay tool?', answer: '"GPX flyover," "route replay," and "GPX animator" all describe the same idea: replaying a recorded route as a moving animation instead of a static line on a map.' },
      { question: 'Is TrailReplay a gpx2video alternative?', answer: 'Yes. Like other GPX-to-video tools, TrailReplay converts a track into a shareable video, with 3D terrain, live stats, and photo annotations built in.' },
      { question: 'Can I animate more than one GPX?', answer: 'Yes. TrailReplay supports multiple tracks, journeys, and separate comparison tracks.' },
      { question: 'Can TrailReplay export MP4?', answer: 'Yes, when your browser supports the required encoding path. WebM is available as a fallback.' },
    ],
  },
  'cycling-route-animation': {
    slug: 'cycling-route-animation',
    analyticsPageType: 'cycling_route_animation',
    eyebrow: 'Cycling route animation',
    title: 'Create an Animated Cycling Route Video',
    description: 'Transform a road, gravel, MTB, or bikepacking GPX into a 3D video with speed, elevation, distance, photos, and route progress.',
    proof: 'One ride, a multi-day journey, or a head-to-head comparison.',
    heroMedia: 'cycling-photo',
    stepsTitle: 'Tell the full story of the ride',
    stepsIntro: 'Use a route from your bike computer or activity platform, then make the geography easy to follow.',
    steps: [
      { title: 'Get the ride GPX', body: 'Export from Garmin, Strava, Komoot, Ride with GPS, or another service.' },
      { title: 'Frame the terrain', body: 'Choose a camera and map that make climbs, descents, and switchbacks legible.' },
      { title: 'Add ride context', body: 'Show distance, speed, elevation, progress, pictures, and day-by-day journey segments.' },
      { title: 'Export for your channel', body: 'Record landscape for YouTube or vertical and square variants for social posts.' },
    ],
    featuresTitle: 'Designed for the shape of a ride',
    features: [
      { icon: Bike, title: 'Road to bikepacking', body: 'Use one recorded ride or assemble multiple GPX files into a continuous journey.' },
      { icon: Mountain, title: 'Climbs in context', body: 'Pair 3D terrain and elevation data to show why a route felt hard.' },
      { icon: Timer, title: 'Ride progression', body: 'Use timing data and playback controls to communicate the rhythm of the activity.' },
    ],
    detailTitle: 'Cycling videos that explain the route',
    detailParagraphs: [
      'A route animation is useful before the ride as a course overview and after it as part of a recap. It can bridge footage gaps while showing viewers where the next climb, town, or stage fits.',
      'For long-distance trips, combine daily GPX files into a journey and use annotations or photos to mark stops. For races, add a comparison track to explain two lines or attempts.',
    ],
    faq: [
      { question: 'Can I animate a multi-day bikepacking route?', answer: 'Yes. Import multiple GPX files and organize them as journey segments.' },
      { question: 'Can it show speed and elevation?', answer: 'TrailReplay can display statistics supported by the imported data and calculated route profile.' },
      { question: 'Which cycling platforms work?', answer: 'Any platform that lets you export a standard GPX or KML route can feed TrailReplay.' },
    ],
  },
  'running-route-animation': {
    slug: 'running-route-animation',
    analyticsPageType: 'running_route_animation',
    eyebrow: 'Running route animation',
    title: 'Create an Animated Running Route Video',
    description: 'Turn a road race, marathon, trail run, or ultra GPX into a 3D replay with pace, elevation, distance, photos, and progress.',
    proof: 'Make the course and the effort understandable at a glance.',
    heroMedia: 'running-photo',
    stepsTitle: 'From finish line to route replay',
    stepsIntro: 'Start with the activity GPX from your watch or training platform and build the story around the course.',
    steps: [
      { title: 'Export your run', body: 'Download GPX from Strava, Garmin Connect, Coros, Suunto, or another activity service.' },
      { title: 'Import the course', body: 'TrailReplay reads the route, distance, timing, and available elevation information.' },
      { title: 'Show the effort', body: 'Choose pace, elevation, progress, camera, map style, photos, and annotations.' },
      { title: 'Share the result', body: 'Export a route video for your race recap, club, coach, film, or social post.' },
    ],
    featuresTitle: 'Made for races, trails, and long days out',
    features: [
      { icon: Footprints, title: 'Any running route', body: 'Use a city 5K, marathon course, mountain trail, or ultra-distance track.' },
      { icon: ChartNoAxesCombined, title: 'Pace and elevation', body: 'Give viewers context for the effort and the shape of the course.' },
      { icon: Upload, title: 'Photos on the route', body: 'Place race and trail photos by GPS, timestamp, or manual position.' },
    ],
    detailTitle: 'Make a race recap easier to follow',
    detailParagraphs: [
      'A map replay gives structure to race footage and photographs. Use it as an opening course overview, between aid stations, or as a complete visual summary when you did not record video during the run.',
      'Trail and ultra routes benefit from a lower camera angle and visible elevation. Road races usually read better with a cleaner overhead view and a crop that keeps the full course visible.',
    ],
    faq: [
      { question: 'Can I make a marathon route animation?', answer: 'Yes. Import the race activity GPX, customize the replay, and export it as video.' },
      { question: 'Does it work for trail running and ultras?', answer: 'Yes. 3D terrain, elevation, journey segments, and photos are especially useful for longer trail events.' },
      { question: 'Can I create a vertical running video?', answer: 'Yes. Preview and record a 9:16 crop for Reels, Shorts, and TikTok.' },
    ],
  },
};

export function isSeoLandingSlug(value: string): value is SeoLandingSlug {
  return value in SEO_LANDING_PAGES;
}
