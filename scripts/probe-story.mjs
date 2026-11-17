#!/usr/bin/env node
/**
 * Usage:
 *   node scripts/probe-story.mjs [<dir-with-gpx-and-optional-recipe>] [options]
 *
 *   --url <url>          a Vite dev server     (default http://localhost:5173)
 *   --only <a,b>         variants to run       (default: all; names below)
 *   --json <path>        write every reading and verdict
 *   --screenshots <dir>  one picture per variant at its strongest wedge
 *   --map-style <style>  the basemap to read on (default: the editor's, esri-clarity imagery)
 *   --headed             watch it run
 *
 * With no directory it reads the two sample routes in app/public/media/samples.
 */

import { existsSync, mkdirSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  firstDifference,
  framePurity,
  framingSummary,
  metersBetween,
  percentiles,
  reducedMotionSummary,
  textContrastUnderWedge,
  wedgeSummary,
  writesInPlace,
} from './story-metrics.mjs';

const SAMPLES = resolve(dirname(fileURLToPath(import.meta.url)), '../app/public/media/samples');
const SAMPLE_ROUTES = [
  'ultratrail-camins-dher-cdh-by-utmb-val-daran-2025.gpx',
  'pedals-de-foc-non-stop-2023.gpx',
].map((name) => join(SAMPLES, name));

const DEVICES = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
};

const VARIANTS = [
  ...['left', 'right'].flatMap((textSide) => ['2d', '3d'].map((view) => ({
    name: `desktop-${textSide}-${view}`, device: 'desktop', layout: { textSide, mobileMap: 'top', view },
  }))),
  { name: 'desktop-left-2d-reduced', device: 'desktop', layout: { textSide: 'left', mobileMap: 'top', view: '2d' }, reducedMotion: true },
  ...['top', 'bottom'].flatMap((mobileMap) => ['2d', '3d'].map((view) => ({
    name: `phone-${mobileMap}-${view}`, device: 'phone', layout: { textSide: 'left', mobileMap, view },
  }))),
  { name: 'phone-bottom-3d-reduced', device: 'phone', layout: { textSide: 'left', mobileMap: 'bottom', view: '3d' }, reducedMotion: true },
];

const PURITY_SCROLLTOPS = 40;
const SCROLL_STEPS = 120;
const FRAMING_INSET = 32;
const BUDGET_MS = 8;

const SENTENCES = [
  'We left before the light reached the valley floor, with frost still on the meadow grass.',
  'The track climbed through beech and then pine, and the river noise faded behind us.',
  'Every switchback opened a little more of the ridge we would follow in the afternoon.',
  'At the col the wind came straight from the north and we stopped only to drink.',
  'The refuge guardian pointed at the cloud on the far summit and told us to keep moving.',
  'Below the lakes the path turned to loose granite, slow going on tired legs.',
  'Someone had stacked cairns all along the plateau, which was a gift in the fog.',
  'We ate bread and cheese on a warm rock and watched a pair of vultures turn above the cirque.',
  'The descent felt longer than the climb, as descents always do after a long day.',
  'Cowbells somewhere below told us the village was closer than the map suggested.',
  'By the time we reached the road the shadows had crossed the whole valley.',
  'Nobody spoke much on the last kilometres; there was nothing left to say about the day.',
];

function prose(seed, paragraphs, sentencesEach) {
  return Array.from({ length: paragraphs }, (_, paragraph) => Array.from(
    { length: sentencesEach },
    (__, sentence) => SENTENCES[(seed * 5 + paragraph * 3 + sentence) % SENTENCES.length],
  ).join(' ')).join('\n\n');
}

function storySpec() {
  const section = (index, at, heading, extra = {}) => ({ at, heading, text: [prose(index, 2, 5), prose(index + 7, 3, 4)], ...extra });
  return {
    title: 'Two days across the Val d’Aran',
    intro: `${prose(11, 1, 4)}\n\n${prose(12, 1, 3)}`,
    sections: [
      section(1, 0.05, 'Leaving the valley', { media: { kind: 'picture', at: 0.11, size: [1200, 800] } }),
      section(2, 0.18, 'The first climb', { media: { kind: 'video', at: 0.24 } }),
      section(3, 0.32, 'Along the ridge', { media: { kind: 'picture', at: 0.37, size: [900, 1200], routePosition: true } }),
      section(4, 0.46, 'The refuge', { annotation: true }),
      section(5, 0.6, 'Over the pass', { media: { kind: 'picture', at: 0.64, size: [1600, 900], caption: 'Looking back at the pass' } }),
      section(6, 0.74, 'The long descent', { media: { kind: 'picture', at: 0.74, size: [2400, 600], offsetMeters: [4000, 3000], first: true } }),
      section(7, 0.88, 'The last kilometres'),
    ],
  };
}

// page.addInitScript serializes this function, so it cannot reach anything in this module's scope.
function installPageHelpers() {
  const webgl = new Set();
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function trackWebgl(type, ...rest) {
    const context = getContext.call(this, type, ...rest);
    if (context && /webgl/.test(type)) webgl.add(this);
    return context;
  };

  const nextFrame = () => new Promise((done) => requestAnimationFrame(() => done()));
  const rectOf = (element) => {
    const { top, bottom, left, right } = element.getBoundingClientRect();
    return { top, bottom, left, right };
  };
  const reader = () => window.__trailreplay.story;
  const dialog = () => document.querySelector('dialog[data-story-preview]');
  const editorMoves = [];
  let watchedMap = null;
  let watchedSince = 0;
  let readerSeen = false;
  let readerScroll = [];
  const note = (type, from) => editorMoves.push({
    type,
    at: performance.now(),
    reader: dialog() ? 'while open' : readerSeen ? 'after close' : 'before it opened',
    from,
  });
  const watchEditorMap = (map) => {
    if (!map || map === watchedMap) return;
    watchedMap = map;
    watchedSince = performance.now();
    for (const type of ['movestart', 'resize']) {
      map.on(type, () => note(type, new Error().stack.split('\n').map((line) => line.trim()).find((line) => line.includes('/src/')) ?? ''));
    }
  };
  let planAt = 0;
  let planInputsAt = 0;
  const debug = console.debug;
  console.debug = (...args) => {
    if (typeof args[0] === 'string' && args[0].startsWith('Aerial terrain plan')) {
      planAt = performance.now();
      note('terrain plan', String(args[1]));
    }
    debug.apply(console, args);
  };
  const PLAN_INPUTS = {
    journey: (state) => state.journeySegments,
    tracks: (state) => state.tracks,
    duration: (state) => state.playback.totalDuration,
    timing: (state) => state.playback.routeTimingMode,
    camera: (state) => state.cameraSettings,
    terrain: (state) => [state.settings.show3DTerrain, state.settings.terrainExaggeration].join(),
  };
  let planInputs = null;
  setInterval(() => {
    const state = window.__trailreplay?.getState();
    if (!state) return;
    const next = Object.fromEntries(Object.entries(PLAN_INPUTS).map(([name, read]) => [name, read(state)]));
    const changed = planInputs ? Object.keys(next).filter((name) => next[name] !== planInputs[name]) : [];
    if (changed.length) {
      planInputsAt = performance.now();
      note('plan inputs', changed.join(', '));
    }
    planInputs = next;
  }, 50);
  const planSettled = () => {
    const changedAt = Math.max(planInputsAt, editorMoves.findLast((move) => move.type === 'resize')?.at ?? 0);
    return (planAt > 0 && planAt > changedAt) || performance.now() - Math.max(watchedSince, changedAt) > 16_000;
  };
  const scroller = () => dialog()?.querySelector('[data-story-scroller]') ?? null;
  const mapBox = () => scroller().querySelector('[role="region"]');
  const wedgeLayer = () => scroller().nextElementSibling;
  const byUrl = (reference) => document.getElementById(/^url\(#(.+)\)$/.exec(reference ?? '')?.[1] ?? '');
  const pointsOf = (element) => element.getAttribute('points').trim().split(/\s+/).map((pair) => pair.split(',').map(Number));
  const textGradient = (slot) => byUrl(slot.querySelector('[data-wedge-part="text"]').getAttribute('fill'));

  async function compiled() {
    const [{ compileStory }, { storyCompileInput }] = await Promise.all([
      import('/src/utils/story/compileStory.ts'),
      import('/src/components/story/useCompiledStory.ts'),
    ]);
    return compileStory(storyCompileInput(window.__trailreplay.getState()));
  }

  function bandOf(scrollerBox, map) {
    const width = (box) => box.right - box.left;
    if (width(map) >= 0.9 * width(scrollerBox)) {
      return map.top + map.bottom < scrollerBox.top + scrollerBox.bottom
        ? { side: 'top', band: { top: map.bottom, bottom: scrollerBox.bottom } }
        : { side: 'bottom', band: { top: scrollerBox.top, bottom: map.top } };
    }
    const side = map.left + map.right < scrollerBox.left + scrollerBox.right ? 'left' : 'right';
    return { side, band: { top: scrollerBox.top, bottom: scrollerBox.bottom } };
  }
  const readingLine = () => {
    const { band } = bandOf(rectOf(scroller()), rectOf(mapBox()));
    return (band.top + band.bottom) / 2;
  };

  function trackKey(track) {
    const text = JSON.stringify([track.line, track.band, track.map, track.maxScroll, track.knots, track.media, track.blocks]);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    return (hash >>> 0).toString(36);
  }

  async function until(test, ms, what) {
    const deadline = performance.now() + ms;
    for (;;) {
      const value = test();
      if (value) return value;
      if (performance.now() > deadline) throw new Error(`timed out waiting for ${what}`);
      await nextFrame();
    }
  }

  async function frameAt(target) {
    const element = scroller();
    element.scrollTop = target;
    return until(() => {
      const last = reader().last();
      return last && last.frame.scrollTop === Math.min(Math.max(element.scrollTop, 0), last.track.maxScroll) && last;
    }, 60_000, `the frame for scrollTop ${element.scrollTop}`);
  }

  function read(last) {
    const element = scroller();
    const scrollerBox = rectOf(element);
    const map = rectOf(mapBox());
    const mediaElements = new Map([...element.querySelectorAll('[data-story-media]')].map((media) => [media.dataset.storyMedia, media]));
    const { frame, track, project, ms } = last;
    return {
      scrollTop: frame.scrollTop,
      frame,
      ms,
      track: trackKey(track),
      map,
      ...bandOf(scrollerBox, map),
      head: frame.head.visible ? project(frame.head.lngLat) : null,
      media: track.media.map((item, index) => ({
        key: item.key,
        point: item.point,
        strength: frame.media[index].strength,
        projected: item.point && project(item.point),
        rect: mediaElements.has(item.key) ? rectOf(mediaElements.get(item.key)) : null,
      })),
      painted: [...wedgeLayer().querySelectorAll('[data-wedge-slot]')].map((group) => {
        if (group.getAttribute('visibility') !== 'visible') return null;
        const circle = group.querySelector('circle');
        const stop = textGradient(group).querySelector('stop');
        const text = group.querySelector('[data-wedge-part="text"]');
        const mapPart = group.querySelector('[data-wedge-part="map"]');
        const textClip = byUrl(text.getAttribute('clip-path'))?.firstElementChild;
        const mapClip = byUrl(mapPart.getAttribute('clip-path'))?.firstElementChild;
        const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((name) => Number(mapClip?.getAttribute(name)));
        return {
          points: pointsOf(text),
          veil: pointsOf(mapPart.querySelector('polygon')),
          axes: [...group.querySelectorAll('linearGradient')].map((gradient) => ['x1', 'y1', 'x2', 'y2'].map((name) => Number(gradient.getAttribute(name)))),
          clip: {
            rule: textClip?.getAttribute('clip-rule') ?? null,
            text: textClip?.getAttribute('d') ?? null,
            map: mapClip?.tagName === 'rect' ? { left: x, top: y, right: x + width, bottom: y + height } : null,
          },
          cx: Number(circle.getAttribute('cx')),
          cy: Number(circle.getAttribute('cy')),
          alpha: Number(stop.getAttribute('stop-opacity')),
          hollow: circle.getAttribute('fill') !== stop.getAttribute('stop-color'),
        };
      }),
    };
  }

  const settled = (reading) => reading.painted.every((painted) => !painted || reading.media.some((media) => (
    media.projected && Math.hypot(media.projected.x - painted.cx, media.projected.y - painted.cy) <= 1
  )));

  async function sample(target) {
    const last = await frameAt(target);
    // MapLibre projects at elevation 0 until a point's DEM tile loads, so a 3D projection shifts as tiles arrive.
    if (last.frame.camera.pitch > 0) {
      await until(() => last.tilesLoaded(), 20_000, 'tiles').catch(() => {});
      await nextFrame();
      await nextFrame();
    }
    let reading = read(reader().last());
    for (let retry = 0; retry < 3 && !settled(reading); retry += 1) {
      await nextFrame();
      await nextFrame();
      reading = read(reader().last());
    }
    return reading;
  }

  async function settleScroll(from) {
    const element = scroller();
    if (from !== undefined) await until(() => element.scrollTop !== from, 10_000, 'a scroll').catch(() => {});
    let top = element.scrollTop;
    for (let still = 0, waited = 0; still < 8 && waited < 600; waited += 1) {
      await nextFrame();
      still = element.scrollTop === top ? still + 1 : 0;
      top = element.scrollTop;
    }
    return top;
  }

  async function makeImage([width, height], label, hue) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `hsl(${hue} 45% 60%)`);
    gradient.addColorStop(1, `hsl(${hue + 50} 35% 25%)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'white';
    context.font = `${Math.round(height / 9)}px sans-serif`;
    context.fillText(label, width * 0.06, height * 0.9);
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.85));
    const file = new File([blob], `${label}.jpg`, { type: 'image/jpeg' });
    return { file, url: URL.createObjectURL(file) };
  }

  async function makeClip(seconds) {
    const type = typeof MediaRecorder === 'undefined' ? undefined
      : ['video/webm;codecs=vp8', 'video/webm'].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!type) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext('2d');
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: type });
    const chunks = [];
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
    const stopped = new Promise((done) => { recorder.onstop = done; });
    recorder.start(100);
    const started = performance.now();
    await new Promise((finish) => {
      const draw = () => {
        const elapsed = (performance.now() - started) / 1000;
        context.fillStyle = `hsl(${Math.round(elapsed * 90) % 360} 45% 35%)`;
        context.fillRect(0, 0, 640, 360);
        context.fillStyle = 'white';
        context.font = '48px sans-serif';
        context.fillText(`clip ${elapsed.toFixed(1)} s`, 40, 200);
        if (elapsed >= seconds) finish();
        else setTimeout(draw, 33);
      };
      draw();
    });
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: 'video/webm' });
    if (blob.size === 0) return null;
    const file = new File([blob], 'probe-clip.webm', { type: 'video/webm' });
    return { file, url: URL.createObjectURL(file) };
  }

  window.__storyProbe = {
    trigger: null,

    async buildStory(spec) {
      const state = () => window.__trailreplay.getState();
      const empty = await compiled();
      if (!empty) throw new Error('no route to tell a story about');
      const profile = empty.route.route;
      const vertexAt = (fraction) => {
        const meters = fraction * profile.totalDistance;
        const index = Math.min(profile.cumulativeDistances.findIndex((along) => along >= meters), profile.coordinates.length - 1);
        const { lon, lat } = profile.coordinates[index];
        return { index, lon, lat, routeMeters: profile.cumulativeDistances[index] };
      };
      const clips = [];

      const addMedia = async ({ kind, at, size, caption, routePosition, offsetMeters }, index) => {
        const place = vertexAt(at);
        const id = `probe-${kind}-${index + 1}`;
        if (kind === 'video') {
          const clip = await makeClip(2);
          if (!clip) return null;
          clips.push(id);
          state().addVideo({ id, file: clip.file, url: clip.url, isPlaceholder: false, originalFileName: clip.file.name, lat: place.lat, lon: place.lon, progress: 0, durationSeconds: 2, placementSource: 'gps' });
          return id;
        }
        const image = await makeImage(size, `photo ${index + 1}`, (index * 67) % 360);
        let placement = { lat: place.lat, lon: place.lon, placementSource: 'gps' };
        if (routePosition) {
          const timing = empty.route.segmentTimings.find((candidate) => candidate.startCoordIndex <= place.index && place.index <= candidate.endCoordIndex);
          placement = { routeSegmentId: timing.segmentId, routeSegmentDistance: place.routeMeters - profile.cumulativeDistances[timing.startCoordIndex], placementSource: 'manual' };
        } else if (offsetMeters) {
          const [east, north] = offsetMeters;
          placement.lat += north / 111_320;
          placement.lon += east / (111_320 * Math.cos((place.lat * Math.PI) / 180));
        }
        state().addPicture({ id, file: image.file, url: image.url, isPlaceholder: false, originalFileName: image.file.name, progress: 0, position: 0, displayDuration: 3000, ...(caption && { title: caption }), ...placement });
        return id;
      };

      state().updateStory({ type: 'setCover', title: spec.title, intro: spec.intro });
      for (const [index, section] of spec.sections.entries()) {
        const id = `probe-section-${index + 1}`;
        const place = vertexAt(section.at);
        let ref = null;
        if (section.annotation) {
          ref = { kind: 'annotation', id: `probe-note-${index + 1}` };
          state().addTextAnnotation({ id: ref.id, progress: 0, lat: place.lat, lon: place.lon, title: section.heading, color: '#c2410c', displayDuration: 4000 });
        }
        state().updateStory({ type: 'addSection', id, anchor: { ref, place: { routeMeters: place.routeMeters } }, prefill: { heading: section.heading, text: section.text[0] } });
        const mediaId = section.media && await addMedia(section.media, index);
        if (mediaId) state().updateStory({ type: 'addBlock', sectionId: id, block: { id: 'media', kind: 'media', media: { kind: section.media.kind, id: mediaId } } });
        if (mediaId && section.media.first) state().updateStory({ type: 'moveBlock', sectionId: id, blockId: 'media', to: 0 });
        state().updateStory({ type: 'addBlock', sectionId: id, block: { id: 'more', kind: 'text', text: section.text[1] } });
      }
      const story = await compiled();
      return {
        routeKm: profile.totalDistance / 1000,
        sections: story.sections.length,
        media: story.sections.flatMap((section) => section.blocks).filter((block) => block.kind === 'media').map((block) => ({ key: block.key, kind: block.media.kind, point: block.media.point })),
        clip: clips.length > 0,
        issues: story.issues,
      };
    },

    async isolation() {
      const bridge = window.__trailreplay;
      watchEditorMap(bridge.getMap());
      await until(() => {
        const map = bridge.getMap();
        return map && !map.isMoving() && planSettled() && performance.now() - Math.max(watchedSince, editorMoves.at(-1)?.at ?? 0) > 3000;
      }, 120_000, 'the editor map to settle');
      const state = bridge.getState();
      const map = bridge.getMap();
      window.__storyProbe.editorMap ??= map;
      readerSeen = false;
      return JSON.parse(JSON.stringify({ moves: editorMoves, state: {
        playback: state.playback,
        settings: state.settings,
        isExporting: state.isExporting,
        animationPhase: state.animationPhase,
        cameraPosition: state.cameraPosition,
        cameraSettings: state.cameraSettings,
        cinematicCameraKeyframes: state.cinematicCameraKeyframes,
        exportPictureHoldElapsedMs: state.exportPictureHoldElapsedMs,
        exportVideoHoldTimeSeconds: state.exportVideoHoldTimeSeconds,
        editorMap: map && {
          sameInstance: map === window.__storyProbe.editorMap,
          center: map.getCenter().toArray(),
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing(),
        },
      } }));
    },

    async opened() {
      await until(() => {
        const last = scroller() && reader()?.last();
        return last && last.project(last.frame.head.lngLat);
      }, 120_000, 'the reader and its map');
      readerSeen = true;
      const element = scroller();
      const { get, set } = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
      const opened = performance.now();
      readerScroll = [];
      Object.defineProperty(element, 'scrollTop', {
        configurable: true,
        get() { return get.call(this); },
        set(value) {
          readerScroll.push(`wrote ${get.call(this).toFixed(2)} to ${Number(value).toFixed(2)} at ${Math.round(performance.now() - opened)} ms`);
          set.call(this, value);
        },
      });
      element.addEventListener('load', (event) => readerScroll.push(`${event.target.tagName.toLowerCase()} loaded at ${Math.round(performance.now() - opened)} ms`), true);
      element.addEventListener('keydown', (event) => {
        const key = event.key === ' ' ? 'Space' : event.key;
        const on = document.activeElement === element ? 'the scroller' : document.activeElement?.tagName.toLowerCase();
        readerScroll.push(`${key} at ${Math.round(performance.now() - opened)} ms on ${on}`);
        setTimeout(() => { if (event.defaultPrevented) readerScroll.push(`${key} prevented`); });
      }, true);
      return {
        focusOnScroller: document.activeElement === scroller(),
        webglOpen: [...webgl].filter((canvas) => canvas.isConnected).length,
      };
    },

    settleScroll,

    async remeasureInPlace() {
      const target = scroller().querySelector('img') ?? scroller().querySelector('[data-story-key]');
      if (!target) return false;
      target.dispatchEvent(new Event('load'));
      for (let frame = 0; frame < 10; frame += 1) await nextFrame();
      return true;
    },
    readerScroll: () => readerScroll.splice(0),

    async staleModules() {
      // Vite strips only 13-digit t= stamps from a request URL, so this 10-digit one forces a fresh transform.
      const fresh = `t=${Math.floor(Date.now() / 1000)}`;
      // t= stamps and the dep optimizer's v= hash change without any source edit.
      const plain = (code) => code.replace(/[?&](?:t=\d+|v=[\da-f]+)/g, '').replace(/createHotContext\([^)]*\)/, '').replace(/\/\/# sourceMappingURL=\S+\s*$/, '');
      const text = (url) => fetch(url).then((response) => response.text());
      const differs = async (path) => {
        const [served, current] = [plain(await text(path)).split('\n'), plain(await text(`${path}?${fresh}`)).split('\n')];
        const line = served.findIndex((code, index) => code !== current[index]);
        return line === -1 && served.length === current.length ? null : `line ${line + 1}: ${served[line]?.slice(0, 160)}`;
      };
      const seen = new Set(['/src/main.tsx']);
      const suspects = [];
      for (let wave = [...seen]; wave.length > 0;) {
        const codes = await Promise.all(wave.map((path) => Promise.all([text(path), text(`${path}?${fresh}`)])));
        const next = [];
        codes.forEach(([served, current], index) => {
          if (plain(served) !== plain(current)) suspects.push(wave[index]);
          for (const [, path] of current.matchAll(/["'](\/src\/[^"'?]+\.tsx?)/g)) {
            if (seen.has(path)) continue;
            seen.add(path);
            next.push(path);
          }
        });
        wave = next;
      }
      // A missed edit persists; a difference from hundreds of concurrent fetches may not, so each is asked again alone.
      const stale = [];
      for (const path of suspects) {
        const line = await differs(path);
        if (line) stale.push(`${path} (${line})`);
      }
      return { checked: seen.size, suspects, stale };
    },

    async warmUp() {
      const element = scroller();
      const media = [...element.querySelectorAll('img, video')];
      await Promise.all(media.map((item) => {
        const ready = item.tagName === 'IMG' ? item.complete : item.readyState >= 1;
        return ready ? null : new Promise((done) => {
          item.addEventListener(item.tagName === 'IMG' ? 'load' : 'loadedmetadata', done, { once: true });
          item.addEventListener('error', done, { once: true });
        });
      }));
      await document.fonts.ready;
      await frameAt(0);
      let key = '';
      for (let still = 0, waited = 0; still < 20 && waited < 1200; waited += 1) {
        await nextFrame();
        const next = trackKey(reader().last().track);
        still = next === key ? still + 1 : 0;
        key = next;
      }
      const { track } = reader().last();
      const story = await compiled();
      return {
        compiledRests: [0, ...story.sections.map((section) => section.travelMeters), story.route.travel.totalDistance],
        zNear: track.zNear,
        routeFitZoom: track.routeFitZoom,
        maxScroll: track.maxScroll,
        mapSide: track.mapSide,
        sections: track.sectionTops.length,
        media: track.media.length,
        webglOpen: [...webgl].filter((canvas) => canvas.isConnected).length,
      };
    },

    async visit(targets) {
      const readings = [];
      for (const target of targets) readings.push(await sample(target));
      return readings;
    },

    async headings() {
      const story = await compiled();
      const { coordinates, cumulativeDistances } = story.route.route;
      const pointAlong = (meters) => {
        let upper = cumulativeDistances.findIndex((along) => along >= meters);
        if (upper === -1) upper = cumulativeDistances.length - 1;
        const lower = Math.max(0, upper - 1);
        const span = cumulativeDistances[upper] - cumulativeDistances[lower];
        const ratio = span > 0 ? (meters - cumulativeDistances[lower]) / span : 1;
        const [a, b] = [coordinates[lower], coordinates[upper]];
        return [a.lon + (b.lon - a.lon) * ratio, a.lat + (b.lat - a.lat) * ratio];
      };
      const element = scroller();
      const results = [];
      for (const [index, head] of [...element.querySelectorAll('[data-story-head]')].entries()) {
        const rect = head.getBoundingClientRect();
        const reading = await sample(element.scrollTop + (rect.top + rect.bottom) / 2 - readingLine());
        const after = head.getBoundingClientRect();
        const section = story.sections[index];
        results.push({
          id: section.id,
          reading,
          offset: (after.top + after.bottom) / 2 - readingLine(),
          travel: section.travelMeters,
          place: pointAlong(section.routeMeters),
        });
      }
      return results;
    },

    overflow() {
      const root = document.documentElement;
      const element = scroller();
      const attribution = mapBox().querySelector('.maplibregl-ctrl-attrib');
      const box = attribution && rectOf(attribution);
      return {
        document: root.scrollWidth - root.clientWidth,
        scroller: element.scrollWidth - element.clientWidth,
        scrollLeft: element.scrollLeft,
        // MapLibre opens its compact attribution once on load; open, it covers the bottom of a phone map.
        attribution: attribution && {
          open: attribution.classList.contains('maplibregl-compact-show'),
          width: box.right - box.left,
          height: box.bottom - box.top,
          button: attribution.querySelector('.maplibregl-ctrl-attrib-button') !== null,
        },
      };
    },

    async touchPoints(scrollTop) {
      await frameAt(scrollTop);
      const map = rectOf(mapBox());
      const scrollerBox = rectOf(scroller());
      const { band } = bandOf(scrollerBox, map);
      return {
        text: { x: (scrollerBox.left + scrollerBox.right) / 2, y: (band.top + band.bottom) / 2 },
        map: { x: (map.left + map.right) / 2, y: (map.top + map.bottom) / 2 },
      };
    },

    scrollTop: () => scroller().scrollTop,
    viewportScale: () => visualViewport.scale,

    async placeIn(sectionIndex) {
      const element = scroller();
      const block = element.querySelectorAll('[data-story-head]')[sectionIndex].nextElementSibling.firstElementChild;
      const rect = block.getBoundingClientRect();
      const last = await frameAt(element.scrollTop + rect.top + 0.4 * rect.height - readingLine());
      return last.frame.place;
    },

    async settledPlace() {
      let key = '';
      for (let still = 0, waited = 0; still < 10 && waited < 1200; waited += 1) {
        await nextFrame();
        const last = reader().last();
        const fresh = last && JSON.stringify(last.track.map) === JSON.stringify(rectOf(mapBox()))
          && last.frame.scrollTop === Math.min(scroller().scrollTop, last.track.maxScroll);
        const now = fresh ? `${trackKey(last.track)}|${last.frame.scrollTop}` : '';
        still = now && now === key ? still + 1 : 0;
        key = now;
      }
      const last = reader().last();
      return { place: last.frame.place, mapSide: last.track.mapSide, width: innerWidth };
    },

    async clip() {
      const element = scroller();
      const video = element.querySelector('figure[data-story-key] video');
      if (!video) return { present: false };
      const key = video.closest('[data-story-key]').dataset.storyKey;
      const rect = video.closest('figure').getBoundingClientRect();
      await frameAt(element.scrollTop + (rect.top + rect.bottom) / 2 - readingLine());
      try {
        await video.play();
      } catch (error) {
        return { present: true, playing: false, error: String(error) };
      }
      const playing = await until(() => !video.paused && video.currentTime > 0, 10_000, 'the clip to play').then(() => true, () => false);
      const { band } = bandOf(rectOf(element), rectOf(mapBox()));
      const last = await frameAt(element.scrollTop - (band.bottom - band.top) - (rect.bottom - rect.top));
      const index = last.track.media.findIndex((item) => item.key === key);
      return { present: true, playing, inBand: last.frame.media[index].inBand, paused: video.paused };
    },

    async colours() {
      const element = scroller();
      const rgba = (css) => {
        const parts = /rgba?\(([^)]+)\)/.exec(css)?.[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        if (!parts || parts.length < 3) throw new Error(`unreadable colour ${css}`);
        return [parts[0], parts[1], parts[2], parts[3] ?? 1];
      };
      const { WEDGE_MAX_ALPHA } = await import('/src/components/story/view/storyWedge.ts');
      return {
        text: rgba(getComputedStyle(element.querySelector('[data-story-key] p')).color),
        canvas: rgba(getComputedStyle(element).backgroundColor),
        wedge: rgba(getComputedStyle(textGradient(wedgeLayer().querySelector('[data-wedge-slot]')).querySelector('stop')).stopColor),
        maxAlpha: WEDGE_MAX_ALPHA,
      };
    },

    async closed() {
      await until(() => !reader().isOpen() && !dialog(), 30_000, 'the preview to close');
      return { focusOnTrigger: document.activeElement === window.__storyProbe.trigger };
    },

    frameAt: async (target) => (await frameAt(target)).frame.scrollTop,
  };
}

function parseArgs(argv) {
  const args = { url: 'http://localhost:5173', headed: false };
  const rest = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--headed') args.headed = true;
    else if (arg === '--url') args.url = argv[++index];
    else if (arg === '--only') args.only = argv[++index].split(',').map((name) => name.trim());
    else if (arg === '--json') args.json = argv[++index];
    else if (arg === '--screenshots') args.screenshots = argv[++index];
    else if (arg === '--map-style') args.mapStyle = argv[++index];
    else rest.push(arg);
  }
  args.dir = rest[0];
  return args;
}

function collectFiles(dir) {
  const entries = readdirSync(dir).filter((name) => statSync(join(dir, name)).isFile());
  const recipes = entries.filter((name) => name.toLowerCase().endsWith('.json'));
  const routes = entries.filter((name) => /\.(gpx|kml)$/i.test(name));
  if (recipes.length > 1) throw new Error(`${dir}: expected at most one .json recipe, found ${recipes.length}`);
  if (routes.length === 0) throw new Error(`${dir}: no .gpx or .kml files`);
  return { files: [...recipes, ...routes].map((name) => join(dir, name)), recipe: recipes.length === 1 };
}

async function launch(headed) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('Playwright is not installed. Run:\n  npm i -D playwright && npx playwright install chromium');
  }
  return chromium.launch({
    headless: !headed,
    args: [
      // MapLibre needs WebGL and a headless machine has no GPU, so SwiftShader renders it in software.
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
}

function shuffled(items, seed) {
  let state = seed;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out: ${what}`)), ms); }),
  ]);
}

async function prepare(page, args, files) {
  const url = new URL(args.url);
  url.searchParams.set('probe', '1');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__trailreplay !== undefined, null, { timeout: 30_000 });
  const modules = await page.evaluate(() => window.__storyProbe.staleModules());
  if (modules.stale.length > 0) {
    throw new Error(`the dev server serves a stale ${modules.stale.join(', ')}: restart it, or every reading is of the old code`);
  }
  await page.locator('input[type="file"]').first().setInputFiles(files.files);
  await page.waitForFunction(
    (recipe) => window.__trailreplay.getState().journeySegments.length > 0 && (!recipe || window.__trailreplay.getReport() !== null),
    files.recipe,
    { timeout: 120_000 },
  );
  if (args.mapStyle) {
    const style = await page.evaluate((mapStyle) => {
      window.__trailreplay.getState().setMapStyle(mapStyle);
      return window.__trailreplay.getState().settings.mapStyle;
    }, args.mapStyle);
    if (style !== args.mapStyle) throw new Error(`--map-style ${args.mapStyle} did not take: the editor kept ${style}`);
  }
  return page.evaluate((spec) => window.__storyProbe.buildStory(spec), storySpec());
}

async function runVariant(page, variant, args) {
  const cdp = await page.context().newCDPSession(page);
  const helper = (name, arg) => page.evaluate(([method, value]) => window.__storyProbe[method](value), [name, arg]);
  const raw = { variant: variant.name };

  await page.emulateMedia({ reducedMotion: variant.reducedMotion ? 'reduce' : 'no-preference' });
  await page.evaluate((layout) => window.__trailreplay.getState().updateStory({ type: 'setLayout', layout }), variant.layout);
  await page.getByRole('button', { name: /^Story\s*\d*$/ }).click();
  const trigger = page.getByRole('button', { name: 'Preview story' });
  raw.before = await helper('isolation');
  await trigger.evaluate((element) => { window.__storyProbe.trigger = element; });
  await trigger.click();
  raw.open = await helper('opened');

  raw.keys = { start: await helper('settleScroll'), timeline: await helper('readerScroll'), dropped: [] };
  raw.keys.space = await pressKey(page, helper, 'Space', raw.keys);
  raw.keys.pageDown = await pressKey(page, helper, 'PageDown', raw.keys);
  raw.keys.playing = await page.evaluate(() => window.__trailreplay.getState().playback.isPlaying);
  raw.keys.remeasured = await helper('remeasureInPlace');
  raw.keys.timeline.push(...await helper('readerScroll'));

  raw.track = await helper('warmUp');
  const targets = [0, raw.track.maxScroll, ...Array.from({ length: PURITY_SCROLLTOPS - 2 }, (_, index) => (
    Math.round(((index + 1) / (PURITY_SCROLLTOPS - 1)) * raw.track.maxScroll)
  ))];
  raw.passes = [await helper('visit', shuffled(targets, 1)), await helper('visit', shuffled(targets, 2))];
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  try {
    raw.passes.push(await helper('visit', shuffled(targets, 3)));
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  raw.headings = await helper('headings');
  const started = Date.now();
  raw.scroll = await helper('visit', Array.from({ length: SCROLL_STEPS + 1 }, (_, index) => Math.round((index / SCROLL_STEPS) * raw.track.maxScroll)));
  raw.scrollSeconds = (Date.now() - started) / 1000;
  raw.colours = await helper('colours');

  if (variant.device === 'phone') raw.phone = await phoneChecks(cdp, helper, raw.track.maxScroll);
  raw.clip = await helper('clip');
  if (args.screenshots) raw.screenshots = await screenshots(page, helper, variant, raw, args.screenshots);
  if (variant.device === 'phone') raw.phone.pinch = await pinch(cdp, helper);

  await page.keyboard.press('Escape');
  raw.close = await helper('closed');
  raw.after = await helper('isolation');

  if (variant.device === 'phone') {
    await trigger.click();
    await helper('opened');
    await helper('warmUp');
    raw.phone.rotation = await rotation(page, helper);
    await page.keyboard.press('Escape');
    await helper('closed');
  }
  await cdp.detach();
  return raw;
}

/**
 * Headless Chromium on software WebGL now and then drops a key scroll that reached the focused scroller
 * unprevented, with no reader write in between; the same key again scrolls. Only that case is pressed again,
 * and the verdict names it. A reader write or a prevented key is the reader's doing and is not retried.
 */
async function pressKey(page, helper, key, keys) {
  const from = keys.space ?? keys.start;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.keyboard.press(key);
    const to = await helper('settleScroll', from);
    const timeline = await helper('readerScroll');
    keys.timeline.push(...timeline);
    const dropped = to === from && timeline.some((line) => line.startsWith(`${key} at`) && line.endsWith('on the scroller'))
      && !timeline.some((line) => line.startsWith('wrote') || line.endsWith('prevented'));
    if (!dropped || attempt === 1) return to;
    keys.dropped.push(key);
  }
}

async function phoneChecks(cdp, helper, maxScroll) {
  const result = { overflow: await helper('overflow'), swipes: {}, refused: {} };
  for (const where of ['text', 'map']) {
    const points = await helper('touchPoints', Math.round(maxScroll / 3));
    const before = await helper('scrollTop');
    try {
      await withTimeout(cdp.send('Input.synthesizeScrollGesture', {
        ...points[where], yDistance: -300, gestureSourceType: 'touch', speed: 800,
      }), 60_000, `touch swipe on the ${where}`);
      result.swipes[where] = (await helper('settleScroll', before)) - before;
    } catch (error) {
      result.swipes[where] = 0;
      result.refused[where] = error.message.split('\n')[0];
    }
  }
  return result;
}

async function rotation(page, helper) {
  const result = { before: await helper('placeIn', 2) };
  await page.setViewportSize({ width: 844, height: 390 });
  result.turned = await helper('settledPlace');
  await page.setViewportSize(DEVICES.phone.viewport);
  result.back = await helper('settledPlace');
  return result;
}

async function pinch(cdp, helper) {
  const { map } = await helper('touchPoints', 0);
  try {
    await withTimeout(cdp.send('Input.synthesizePinchGesture', { ...map, scaleFactor: 2, gestureSourceType: 'touch' }), 60_000, 'pinch on the map');
  } catch (error) {
    return { scale: Number.NaN, refused: error.message.split('\n')[0] };
  }
  await helper('settleScroll');
  const scale = await helper('viewportScale');
  if (Math.abs(scale - 1) > 1e-3) {
    await withTimeout(cdp.send('Input.synthesizePinchGesture', { ...map, scaleFactor: 1 / scale, gestureSourceType: 'touch' }), 60_000, 'pinch back');
  }
  return { scale };
}

async function screenshots(page, helper, variant, raw, dir) {
  mkdirSync(dir, { recursive: true });
  const readings = raw.passes.flat();
  const strength = (reading) => reading.painted.reduce((sum, painted) => sum + (painted?.alpha ?? 0), 0);
  const picks = [['', readings.reduce((best, reading) => (strength(reading) > strength(best) ? reading : best), readings[0])]];
  const hollow = readings.find((reading) => reading.painted.some((painted) => painted?.hollow));
  if (hollow) picks.push(['-hollow', hollow]);
  const paths = [];
  for (const [suffix, reading] of picks) {
    await helper('frameAt', reading.scrollTop);
    await page.waitForTimeout(1500);
    const path = join(dir, `${variant.name}${suffix}.png`);
    await page.screenshot({ path });
    paths.push(path);
  }
  return paths;
}

const check = (pass, summary, numbers = {}) => ({ pass, summary, ...numbers });
const fixed = (value, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : String(value));

function judge(variant, raw, story) {
  const readings = [...raw.passes.flat(), ...raw.headings.map((heading) => heading.reading), ...raw.scroll];
  const checks = {};

  const purity = framePurity(raw.passes.flat());
  const rebuilt = new Set(raw.passes.flat().map((reading) => reading.track)).size - 1;
  checks.a = check(
    purity.mismatches.length === 0 && purity.singles === 0 && rebuilt === 0 && purity.scrollTops >= 30,
    `${purity.scrollTops} scrollTops, ${purity.visits} visits in 3 orders (third under CPU x4): ${purity.mismatches.length} mismatches`
      + `${purity.mismatches[0] ? ` (first at ${purity.mismatches[0].scrollTop}: ${purity.mismatches[0].path})` : ''}`
      + `${purity.singles ? `, ${purity.singles} seen once` : ''}${rebuilt ? `, track rebuilt ${rebuilt} times` : ''}`,
    purity,
  );

  const headings = raw.headings.map((heading) => ({
    id: heading.id,
    travelError: Math.abs(heading.reading.frame.travel - heading.travel),
    meters: metersBetween(heading.reading.frame.head.lngLat, heading.place),
    lineOffset: heading.offset,
  }));
  const worst = (key) => Math.max(0, ...headings.map((heading) => Math.abs(heading[key])));
  checks.b = check(
    headings.length === story.sections && headings.every((heading) => heading.travelError <= 1e-6 && heading.meters <= 1 && Math.abs(heading.lineOffset) <= 1),
    `${headings.length}/${story.sections} headings on the line: travel off by ${worst('travelError').toExponential(1)} m, head ${fixed(worst('meters'), 2)} m from its place, heading ${fixed(worst('lineOffset'), 1)} px off the line (worst)`,
    { headings },
  );

  const framing = framingSummary(readings, FRAMING_INSET);
  checks.c = check(
    framing.head.checked > 0 && framing.head.outside === 0,
    `${framing.head.checked} frames with a head: ${framing.head.outside} outside the map box, closest ${fixed(framing.head.minMargin)} px from its edge`,
    framing.head,
  );

  const wedges = wedgeSummary(readings);
  checks.d = check(
    wedges.framesWithWedge > 0 && wedges.mismatched === 0 && wedges.missing === 0 && wedges.torn === 0 && wedges.unclipped === 0,
    `${wedges.painted} wedges on ${wedges.framesWithWedge}/${wedges.frames} frames: worst corner ${fixed(wedges.worstError, 2)} px, ${wedges.mismatched} off by more than 1 px, ${wedges.missing} due but not painted,`
      + ` ${wedges.torn} with copies off their shape, ${wedges.unclipped} not cut at the map box`,
    wedges,
  );

  checks.e = check(
    framing.media.checked > 0 && framing.media.outside === 0,
    `${framing.media.checked} points at full framing weight: ${framing.media.outside} closer than ${FRAMING_INSET} px to the map edge, closest ${fixed(framing.media.minMargin)} px`
      + `${variant.layout.view === '3d' ? `; ${wedges.hollow} wedges drew hollow (occluded)` : ''}`,
    { ...framing.media, hollow: wedges.hollow },
  );

  if (raw.phone) {
    const { overflow, swipes, rotation, pinch: pinched } = raw.phone;
    const maps = readings.map((reading) => reading.map);
    const moved = Math.max(...maps.flatMap((map) => ['top', 'bottom', 'left', 'right'].map((edge) => Math.abs(map[edge] - maps[0][edge]))));
    const { attribution } = overflow;
    // Collapsed, it is the 24 px (i) button alone.
    const tucked = attribution && !attribution.open && attribution.button && attribution.width <= 32 && attribution.height <= 32;
    checks.f = check(
      overflow.document <= 0 && overflow.scroller <= 0 && overflow.scrollLeft === 0 && moved <= 0.5
        && swipes.text > 0 && swipes.map > 0 && Math.abs(pinched.scale - 1) <= 1e-3 && tucked,
      `overflow document ${overflow.document} px, scroller ${overflow.scroller} px; map box moved ${fixed(moved, 2)} px over ${maps.length} frames;`
        + ` attribution ${attribution ? `${attribution.open ? 'open' : 'collapsed'} ${fixed(attribution.width, 0)}x${fixed(attribution.height, 0)} px${attribution.button ? '' : ', no button'}` : 'missing'};`
        + ` swipe scrolled ${fixed(swipes.text, 0)} px on text, ${fixed(swipes.map, 0)} px on the map; pinch scale ${fixed(pinched.scale, 3)}`
        + [...Object.entries(raw.phone.refused), ...(pinched.refused ? [['pinch', pinched.refused]] : [])]
          .map(([where, message]) => `; ${where} gesture refused: ${message}`).join(''),
      { overflow, moved, swipes, pinch: pinched },
    );
    const kept = (place) => place.key === rotation.before.key && Math.abs(place.fraction - rotation.before.fraction) <= 0.05;
    checks.g = check(
      kept(rotation.turned.place) && kept(rotation.back.place),
      `place ${rotation.before.key} at ${fixed(rotation.before.fraction, 3)}; at 844x390 (${rotation.turned.mapSide} map) ${rotation.turned.place.key} at ${fixed(rotation.turned.place.fraction, 3)};`
        + ` back ${rotation.back.place.key} at ${fixed(rotation.back.place.fraction, 3)}`,
      rotation,
    );
  } else {
    checks.f = check(null, 'phone only');
    checks.g = check(null, 'phone only');
  }

  if (variant.reducedMotion) {
    const reduced = reducedMotionSummary(readings, raw.track);
    checks.h = check(
      reduced.frames > 0 && reduced.offRest === 0 && reduced.offNear === 0 && reduced.glides === 0,
      `${reduced.frames} frames: ${reduced.offRest} with travel between rests, ${reduced.offNear} off the near zoom with nothing framed,`
        + ` ${reduced.cuts} media cuts, ${reduced.glides} glides`,
      reduced,
    );
  } else {
    checks.h = check(null, 'reduced-motion variants only');
  }

  const difference = firstDifference(raw.before.state, raw.after.state);
  const moves = raw.after.moves.slice(raw.before.moves.length);
  checks.i = check(
    difference === null,
    difference === null
      ? `playback, settings, export and camera state and the editor map (${raw.after.state.editorMap ? 'same instance' : 'none'}) unchanged`
      : `changed at ${difference}${moves.length ? `; editor map ${moves.slice(0, 3).map((move) => `${move.type} ${move.reader} from ${move.from || 'outside /src'}`).join('; ')}`
        + `${moves.length > 3 ? ` and ${moves.length - 3} more` : ''}` : ''}`,
    { difference, moves },
  );

  const clip = raw.clip.present
    ? raw.clip.playing && !raw.clip.inBand && raw.clip.paused
    : null;
  const keys = raw.keys;
  const inPlace = writesInPlace(keys.timeline);
  checks.j = check(
    raw.open.focusOnScroller && keys.space > keys.start && keys.pageDown > keys.space && !keys.playing
      && raw.close.focusOnTrigger && clip !== false && keys.remeasured && inPlace.length === 0,
    `focus on scroller ${raw.open.focusOnScroller}; Space ${fixed(keys.start, 0)} to ${fixed(keys.space, 0)} px, PageDown to ${fixed(keys.pageDown, 0)} px, playing ${keys.playing};`
      + ` Escape closed, focus back on the button ${raw.close.focusOnTrigger};`
      + ` ${raw.clip.present ? `clip played ${raw.clip.playing}, left the band ${!raw.clip.inBand}, paused ${raw.clip.paused}` : 'no clip in the story'}`
      + (keys.dropped.length ? `; dropped by the browser and pressed again: ${keys.dropped.join(', ')}` : '')
      + `; ${keys.remeasured ? `re-measured in place, ${inPlace.length ? `wrote scrollTop without moving it: ${inPlace.join(', ')}` : 'scrollTop left alone'}` : 'nothing in the reader to fire a load on'}`
      + (keys.space > keys.start && keys.pageDown > keys.space ? '' : `; while the keys scrolled: ${keys.timeline.join(', ') || 'nothing'}`),
    { keys, open: raw.open, close: raw.close, clip: raw.clip },
  );

  const { text, canvas, wedge, maxAlpha } = raw.colours;
  const painted = Math.max(0, ...readings.flatMap((reading) => reading.painted.map((entry) => entry?.alpha ?? 0)));
  const alpha = Math.max(maxAlpha, painted);
  const ratio = textContrastUnderWedge({ text, canvas: canvas.slice(0, 3), wedge: wedge.slice(0, 3), alpha });
  checks.k = check(
    ratio >= 4.5 && painted <= maxAlpha + 1e-9,
    `body text ${fixed(ratio, 2)}:1 over the canvas under the wedge's text part at alpha ${fixed(alpha, 3)} (WEDGE_MAX_ALPHA ${maxAlpha}, most painted ${fixed(painted, 3)})`,
    { ratio, alpha, colours: raw.colours },
  );

  const ms = percentiles(raw.scroll.map((reading) => reading.ms));
  const budget = {
    ...ms,
    frames: raw.scroll.length,
    fps: raw.scroll.length / raw.scrollSeconds,
    overBudget: ms.p95 > BUDGET_MS,
    webglOpen: raw.track.webglOpen,
  };
  return { checks, budget };
}

const NAMES = {
  a: 'purity', b: 'heading', c: 'head', d: 'wedges', e: 'framing', f: 'phone', g: 'rotation', h: 'reduced', i: 'isolation', j: 'keys', k: 'contrast',
};

function printVariant(result) {
  console.log(`\n${result.name}`);
  if (result.error) {
    console.log(`  x  probe failed: ${result.error}`);
    return;
  }
  for (const [id, verdict] of Object.entries(result.checks)) {
    const mark = verdict.pass === null ? '- ' : verdict.pass ? 'ok' : 'x ';
    console.log(`  ${mark} ${id} ${NAMES[id].padEnd(9)} ${verdict.summary}`);
  }
  const { budget } = result;
  console.log(
    `  ${budget.overBudget ? '! ' : '  '} budget      frame p50 ${fixed(budget.p50, 2)} ms, p95 ${fixed(budget.p95, 2)} ms, max ${fixed(budget.max, 2)} ms`
      + ` over ${budget.frames} frames at ${fixed(budget.fps)} fps; ${budget.webglOpen} WebGL canvases while open`
      + `${budget.overBudget ? `; p95 over ${BUDGET_MS} ms` : ''}`,
  );
}

function printErrors(exceptions, resourceErrors) {
  if (exceptions.length > 0) {
    console.log('\nuncaught page exceptions:');
    [...new Set(exceptions)].slice(0, 5).forEach((error) => console.log(`  x ${error}`));
  }
  if (resourceErrors.size > 0) {
    console.log('\nconsole errors (grouped):');
    [...resourceErrors.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .forEach(([key, count]) => console.log(`  ! ${String(count).padStart(4)}x ${key}`));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = args.dir ? collectFiles(resolve(args.dir)) : { files: SAMPLE_ROUTES, recipe: false };
  const unknown = (args.only ?? []).filter((name) => !VARIANTS.some((variant) => variant.name === name));
  if (unknown.length > 0) {
    throw new Error(`unknown variant ${unknown.join(', ')}; known: ${VARIANTS.map((variant) => variant.name).join(', ')}`);
  }
  const variants = VARIANTS.filter((variant) => !args.only || args.only.includes(variant.name));

  const browser = await launch(args.headed);
  const exceptions = [];
  const resourceErrors = new Map();
  const results = [];
  let story = null;

  try {
    for (const [device, options] of Object.entries(DEVICES)) {
      const mine = variants.filter((variant) => variant.device === device);
      if (mine.length === 0) continue;
      const context = await browser.newContext(options);
      const page = await context.newPage();
      page.on('pageerror', (error) => exceptions.push(String(error)));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        const host = /https?:\/\/([^/]+)/.exec(text)?.[1];
        const key = host ? `${host}: ${text.slice(0, 60)}` : text.slice(0, 120);
        resourceErrors.set(key, (resourceErrors.get(key) ?? 0) + 1);
      });
      await page.addInitScript(installPageHelpers);

      console.log(`${device}: dropping ${files.files.map((file) => file.split('/').pop()).join(', ')}`);
      story = await prepare(page, args, files);
      console.log(
        `story: ${fixed(story.routeKm)} km, ${story.sections} sections, ${story.media.length} media${args.mapStyle ? ` on ${args.mapStyle}` : ''}`
          + ` (${story.clip ? 'with a clip' : 'no clip: MediaRecorder could not make one'}), ${story.issues.length} compile issues`,
      );

      for (const variant of mine) {
        let result;
        try {
          const raw = await runVariant(page, variant, args);
          result = { name: variant.name, ...judge(variant, raw, story), raw };
        } catch (error) {
          result = { name: variant.name, error: error.message };
          await page.keyboard.press('Escape').catch(() => {});
        }
        results.push(result);
        printVariant(result);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const slowest = Math.min(...results.filter((result) => result.budget).map((result) => result.budget.fps));
  if (slowest < 20) {
    console.log(
      `\n  ! ${fixed(slowest)} fps: software WebGL draws the map far slower than a reader's GPU,`
        + '\n    so tile and terrain loading lag the scroll here. Every check waits for the frame of'
        + '\n    the scrollTop it set, so none depends on frame rate; frame ms times the reader\'s own'
        + '\n    frame work (frame, camera jump, line upload, wedges), not the GPU.',
    );
  }
  printErrors(exceptions, resourceErrors);

  if (args.json) {
    writeFileSync(args.json, JSON.stringify({ url: args.url, files: files.files, story, results, exceptions, resourceErrors: [...resourceErrors] }, null, 2));
    console.log(`\nfull readings written to ${args.json}`);
  }

  const failed = results.filter((result) => result.error || Object.values(result.checks).some((verdict) => verdict.pass === false));
  console.log(`\n${results.length - failed.length}/${results.length} variants passed${exceptions.length ? `; ${exceptions.length} page exceptions` : ''}`);
  process.exitCode = failed.length > 0 || exceptions.length > 0 ? 1 : 0;
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
