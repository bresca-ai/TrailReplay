import { Component, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileStory, type CompiledStory } from '@/utils/story/compileStory';
import { normalizeStory, type StoryBlock, type StoryLayout } from '@/utils/story/storyDocument';
import { journeyWithCameraHop, km, media, northbound, settings, story } from '@/utils/story/storyTestFixtures';
import { formatDistance } from '@/utils/units';
import { buildScrollTrack, storyFrameAt, type TrackMeasure } from './storyFrame';
import { createStoryMap } from './storyMap';
import { WEDGE_COLOR } from './storyWedge';
import { StoryView, type StoryDebugFrame, type StoryStrings } from './StoryView';

const fakeMap = vi.hoisted(() => ({
  show: vi.fn(),
  project: vi.fn(),
  tilesLoaded: vi.fn(() => true),
  onRender: vi.fn<(listener: () => void) => () => void>(() => () => {}),
  resize: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock('./storyMap', () => ({ createStoryMap: vi.fn(() => fakeMap) }));

const dayOne = northbound('Day 1', 45, 6, 101);
const dayTwo = northbound('Day 2', 45, 7, 101);
const text = (id: string): StoryBlock => ({ id, kind: 'text', text: `${id}, first.\n\n${id}, second.` });
const mediaBlock = (kind: 'picture' | 'video', id: string): StoryBlock => ({ id, kind: 'media', media: { kind, id } });

function compiled(layout: Partial<StoryLayout> = {}, document = story(
    ['start', km(0), [text('a'), mediaBlock('picture', 'north'), mediaBlock('video', 'clip'), mediaBlock('picture', 'gone')]],
    ['day-2', km(dayOne.totalDistance, { segmentId: 'day-2', segmentMeters: 0 }), [text('b'), mediaBlock('picture', 'plain')]],
)): CompiledStory {
  return compileStory({
    document: { ...document, layout: { ...document.layout, ...layout } },
    tracks: [dayOne, dayTwo],
    journeySegments: journeyWithCameraHop(dayOne, dayTwo),
    textAnnotations: [],
    pictures: [
      media('north', { lat: 45.05, lon: 6, title: 'The ridge', originalFileName: 'north.jpg' }),
      media('gone', { isPlaceholder: true, originalFileName: 'gone.jpg' }),
      media('plain', { lat: 45.1, lon: 7, originalFileName: 'plain.jpg' }),
    ],
    videos: [media('clip', { lat: 45.06, lon: 6, originalFileName: 'clip.mp4' })],
    journeyName: 'Two days',
    settings,
  })!;
}

const strings: StoryStrings = {
  exit: 'Exit story', mapLabel: 'Route map', start: 'Start', finish: 'Finish',
  distance: 'Distance', elevationGain: 'Elevation gain', placeholder: (fileName) => `Missing ${fileName}`,
};

const SCROLLER = { top: 0, bottom: 800, left: 0, right: 1280 };
const MAP_BOX = { top: 0, bottom: 800, left: 640, right: 1280 };
const COLUMN = { left: 40, right: 600 };
const CONTENT_HEIGHT = 5000;
let layout: { sized: boolean; shift: number; scrollTop: number };
let resizeCallbacks: Array<() => void>;
let frames: Map<number, FrameRequestCallback>;
let motion: { matches: boolean; listener: (() => void) | null };
let fontsLoaded: () => void;

const keyed = () => [...document.querySelectorAll<HTMLElement>('[data-story-key]')];
const MEDIA_HEIGHT = 200;
const contentTop = (index: number) => 100 + layout.shift + index * 300;
const rect = (box: { top: number; bottom: number; left: number; right: number }) => ({
  ...box, x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top, toJSON: () => box,
});

function fakeRect(this: Element) {
  if (!layout.sized) return rect({ top: 0, bottom: 0, left: 0, right: 0 });
  if (this.hasAttribute('data-text-side')) return rect(SCROLLER);
  if (this.getAttribute('role') === 'region' || this.parentElement?.getAttribute('role') === 'region') return rect(MAP_BOX);
  const media = this.closest('[data-story-media]') === this;
  const index = keyed().indexOf((media ? this.closest('[data-story-key]') : this) as HTMLElement);
  if (index < 0) return rect({ top: 0, bottom: 0, left: 0, right: 0 });
  const top = contentTop(index) - layout.scrollTop;
  return rect({ top, bottom: top + (media ? MEDIA_HEIGHT : 250), ...COLUMN });
}

function expectedMeasure(): TrackMeasure {
  const blocks = keyed().map((element, index) => ({ key: element.dataset.storyKey!, top: contentTop(index), height: 250, ...COLUMN }));
  return {
    scroller: SCROLLER,
    map: MAP_BOX,
    contentHeight: CONTENT_HEIGHT,
    blocks,
    media: keyed().flatMap((element, index) => {
      const key = element.querySelector<HTMLElement>('[data-story-media]')?.dataset.storyMedia;
      return key ? [{ key, top: contentTop(index), height: MEDIA_HEIGHT, ...COLUMN }] : [];
    }),
    sections: keyed().flatMap((element, index) => (
      element.hasAttribute('data-story-head') ? [{ headTop: contentTop(index), headBottom: contentTop(index) + 250 }] : []
    )),
    finishTop: blocks.find((block) => block.key === 'finish')!.top,
  };
}

function scroller(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-story-scroller]')!;
}

function mount(props: Partial<Parameters<typeof StoryView>[0]> = {}) {
  const view = render(<StoryView story={compiled()} strings={strings} {...props} />);
  Object.defineProperty(scroller(), 'scrollTop', {
    configurable: true,
    get: () => layout.scrollTop,
    set: (value: number) => { layout.scrollTop = value; },
  });
  return view;
}

function resize() {
  act(() => resizeCallbacks.forEach((callback) => callback()));
}

function scrollTo(scrollTop: number) {
  layout.scrollTop = scrollTop;
  fireEvent.scroll(scroller());
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  });
}

beforeEach(() => {
  layout = { sized: true, shift: 0, scrollTop: 0 };
  resizeCallbacks = [];
  frames = new Map();
  motion = { matches: false, listener: null };
  fakeMap.project.mockReturnValue({ x: 960, y: 400, occluded: false });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(fakeRect);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-text-side') ? CONTENT_HEIGHT : 0;
  });
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resizeCallbacks.push(callback); }
    observe() {}
    disconnect() { resizeCallbacks = []; }
  });
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return motion.matches; },
    addEventListener: (_: string, listener: () => void) => { motion.listener = listener; },
    removeEventListener: (_: string, listener: () => void) => { if (listener === motion.listener) motion.listener = null; },
  }));
  let nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    nextFrame += 1;
    frames.set(nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: new Promise<void>((resolve) => { fontsLoaded = resolve; }) } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(createStoryMap).mockClear();
  Object.values(fakeMap).forEach((fn) => fn.mockClear());
});

describe('StoryView content', () => {
  it('renders the cover, each heading and block, then the finish, in reading order', () => {
    mount();
    expect(keyed().map((element) => element.dataset.storyKey)).toEqual([
      'cover', 'section-0', 'section-0-0', 'section-0-1', 'section-0-2', 'section-0-3', 'section-1', 'section-1-0', 'section-1-1', 'finish',
    ]);
    expect(screen.getByText('a, first.')).toBeInTheDocument();
    expect(screen.getByText('a, second.')).toBeInTheDocument();
  });

  it('labels each section with its route kilometre, never its travel kilometre', () => {
    const story = compiled();
    const [, dayTwoSection] = story.sections;
    const routeLabel = formatDistance(dayTwoSection.routeMeters, 'metric');
    expect(routeLabel).not.toBe(formatDistance(dayTwoSection.travelMeters, 'metric'));

    mount({ story });
    expect(keyed().find((element) => element.dataset.storyKey === 'section-1')).toHaveTextContent(routeLabel);
  });

  it('shows a neutral box with the file name for a missing file and for one that fails to load', () => {
    mount();
    expect(screen.getByText('Missing gone.jpg')).toBeInTheDocument();
    expect(screen.queryByText('Missing north.jpg')).not.toBeInTheDocument();

    const photo = screen.getByRole('img', { name: 'The ridge' });
    expect(photo).not.toHaveAttribute('loading');
    expect(photo).toHaveAttribute('decoding', 'async');
    fireEvent.error(photo);
    expect(screen.getByText('Missing north.jpg')).toBeInTheDocument();
    expect(screen.getByText('The ridge').tagName).toBe('FIGCAPTION');
  });

  it('names a photo without a caption by its file name, with no caption under it', () => {
    mount();
    const plain = keyed().find((element) => element.dataset.storyKey === 'section-1-1')!;
    expect(screen.getByRole('img', { name: 'plain.jpg' })).toBe(plain.querySelector('img'));
    expect(plain.querySelector('figcaption')).toBeNull();
  });

  it('gives clips controls and never autoplays them', () => {
    mount();
    const clip = document.querySelector('video')!;
    expect(clip).toHaveAttribute('controls');
    expect(clip).toHaveAttribute('playsinline');
    expect(clip).toHaveAttribute('preload', 'metadata');
    expect(clip).not.toHaveAttribute('autoplay');
  });

  it('shows an exit button only when the caller can exit', () => {
    mount();
    expect(screen.queryByRole('button', { name: 'Exit story' })).not.toBeInTheDocument();
    cleanup();

    const onExit = vi.fn();
    mount({ onExit });
    fireEvent.click(screen.getByRole('button', { name: 'Exit story' }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('puts the text on the side the layout names, and labels the map', () => {
    mount({ story: compiled({ textSide: 'right' }) });
    expect(scroller()).toHaveAttribute('data-text-side', 'right');
    expect(scroller()).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('region', { name: 'Route map' })).toBeInTheDocument();
  });
});

describe('StoryView keys and headings', () => {
  it('gives every element its own key, whatever ids the file uses', () => {
    const file = normalizeStory({
      sections: [
        { id: 'cover', anchor: km(0), heading: 'Cover', blocks: [{ id: 'finish', kind: 'text', text: 'x' }] },
        { id: 'finish', anchor: km(500), heading: 'Finish', blocks: [{ id: 'a/b', kind: 'text', text: 'y' }] },
        { id: 'a', anchor: km(900), heading: 'A', blocks: [{ id: 'b/a', kind: 'text', text: 'z' }] },
      ],
    });
    mount({ story: compiled({}, file) });
    const keys = keyed().map((element) => element.dataset.storyKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((key) => key === 'cover' || key === 'finish')).toEqual(['cover', 'finish']);
  });

  it('restores the finish card, not a section with the id finish, after a re-measure', () => {
    const file = normalizeStory({
      sections: [
        { id: 'cover', anchor: km(0), heading: 'Cover', blocks: [{ id: 'x', kind: 'text', text: 'x' }] },
        { id: 'finish', anchor: km(1000), heading: 'Finish line', blocks: [{ id: 'y', kind: 'text', text: 'y' }] },
      ],
    });
    mount({ story: compiled({}, file) });
    resize();
    const finish = keyed().findIndex((element) => element.textContent?.includes('Finish') && !element.hasAttribute('data-story-head'));
    expect(keyed()[finish].dataset.storyKey).toBe('finish');

    scrollTo(contentTop(finish) + 125 - 400);
    layout.shift = 200;
    resize();
    expect(layout.scrollTop).toBe(contentTop(finish) + 125 - 400);
  });

  it('never renders an empty heading: the anchored caption, else the distance', () => {
    const document = story(['photo', { ref: { kind: 'picture', id: 'north' }, place: { routeMeters: 0 } }], ['typed', km(600)]);
    const file = { ...document, sections: [{ ...document.sections[0], heading: '' }, { ...document.sections[1], heading: '  ' }] };
    const result = compiled({}, file);
    mount({ story: result });

    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(['The ridge', formatDistance(result.sections[1].routeMeters, 'metric')]);
    expect(keyed().find((element) => element.dataset.storyKey === 'section-1')!.textContent)
      .toBe(formatDistance(result.sections[1].routeMeters, 'metric'));
  });
});

describe('StoryView reading loop', () => {
  it('starts the map on the first measure with a size, measuring content from the scroll origin', () => {
    const onDebugFrame = vi.fn<(debug: StoryDebugFrame) => void>();
    layout.sized = false;
    const { container } = mount({ onDebugFrame });
    resize();
    expect(createStoryMap).not.toHaveBeenCalled();

    layout.sized = true;
    layout.scrollTop = 120;
    resize();
    const story = vi.mocked(createStoryMap).mock.calls[0][1];
    const track = buildScrollTrack(story, expectedMeasure());
    expect(createStoryMap).toHaveBeenCalledOnce();
    expect(vi.mocked(createStoryMap).mock.calls[0][0]).toBe(container.querySelector('[role="region"]')!.firstElementChild);
    expect(vi.mocked(createStoryMap).mock.calls[0][2]).toEqual(storyFrameAt(story, track, 120, false));
    expect(onDebugFrame.mock.lastCall![0].track).toEqual(track);
  });

  it('shows the frame storyFrameAt gives for the scroll position, and the reduced-motion frame when asked', () => {
    const onDebugFrame = vi.fn<(debug: StoryDebugFrame) => void>();
    mount({ onDebugFrame });
    resize();
    const { track } = onDebugFrame.mock.lastCall![0];
    const story = vi.mocked(createStoryMap).mock.calls[0][1];

    scrollTo(900);
    expect(fakeMap.show).toHaveBeenLastCalledWith(storyFrameAt(story, track, 900, false));
    expect(onDebugFrame.mock.lastCall![0]).toMatchObject({ frame: storyFrameAt(story, track, 900, false), project: fakeMap.project, tilesLoaded: fakeMap.tilesLoaded });

    motion.matches = true;
    act(() => {
      motion.listener!();
      frames.forEach((callback) => callback(0));
    });
    expect(fakeMap.show).toHaveBeenLastCalledWith(storyFrameAt(story, track, 900, true));
  });

  it('pauses a clip once it leaves the reading band, and leaves it playing inside it', () => {
    mount();
    resize();
    const clip = document.querySelector('video')!;
    const pause = vi.fn();
    Object.assign(clip, { pause });
    Object.defineProperty(clip, 'paused', { configurable: true, value: false });

    scrollTo(900);
    expect(pause).not.toHaveBeenCalled();
    scrollTo(3000);
    expect(pause).toHaveBeenCalledOnce();
  });

  it('draws the wedge of a photo at the reading line from the projected point to the photo, cut at the map box', () => {
    const onDebugFrame = vi.fn<(debug: StoryDebugFrame) => void>();
    mount({ onDebugFrame });
    resize();

    scrollTo(725);
    const { wedges } = onDebugFrame.mock.lastCall![0];
    const [wedge] = wedges;
    expect(wedge).toMatchObject({ key: 'section-0-1', apex: [960, 400], polygon: [[600, 275], [600, 475], [960, 400]] });

    const groups = [...document.querySelectorAll('svg[data-story-wedges] > g[data-wedge-slot]')];
    expect(groups.map((group) => group.getAttribute('visibility'))).toEqual(
      [0, 1, 2].map((index) => (index < wedges.length ? 'visible' : 'hidden')),
    );
    const [first] = groups;
    const text = first.querySelector('[data-wedge-part="text"]')!;
    const inMap = first.querySelector('[data-wedge-part="map"]')!;
    expect(first.querySelector('polygon')).toBe(text);
    for (const polygon of [text, inMap.querySelector('polygon')]) expect(polygon).toHaveAttribute('points', '600,275 600,475 960,400');
    expect(document.querySelector('svg[data-story-wedges] polyline')).toBeNull();

    const [textStops, veilStops] = [...first.querySelectorAll('linearGradient')].map((gradient) => (
      [...gradient.querySelectorAll('stop')].map((stop) => Number(stop.getAttribute('stop-opacity')))
    ));
    expect(textStops).toEqual([wedge.alpha, wedge.alpha * 0.5]);
    expect(veilStops).toEqual([wedge.veilAlpha, wedge.veilAlpha * 0.5]);
    expect(first.querySelector('stop')).toHaveAttribute('stop-color', `rgb(${WEDGE_COLOR.join(' ')})`);
    expect(first.querySelector('circle')).toHaveAttribute('cx', '960');

    const clip = (id: string) => document.getElementById(id.slice('url(#'.length, -1))!.firstElementChild!;
    expect(clip(inMap.getAttribute('clip-path')!)).toMatchObject({ tagName: 'rect' });
    expect(['x', 'y', 'width', 'height'].map((name) => clip(inMap.getAttribute('clip-path')!).getAttribute(name))).toEqual(['640', '0', '640', '800']);
    expect(clip(text.getAttribute('clip-path')!).getAttribute('d')).toContain('M640 0H1280V800H640Z');
    expect(clip(text.getAttribute('clip-path')!)).toHaveAttribute('clip-rule', 'evenodd');
  });

  it('tints the map part to contrast with the basemap: light over imagery, evergreen over light maps', () => {
    const dark = `rgb(${WEDGE_COLOR.join(' ')})`;
    const veil = (mapStyle: CompiledStory['look']['mapStyle']) => {
      const story = compiled();
      mount({ story: { ...story, look: { ...story.look, mapStyle } } });
      const color = document.querySelectorAll('linearGradient')[1].querySelector('stop')!.getAttribute('stop-color');
      cleanup();
      return color;
    };
    for (const mapStyle of ['satellite', 'esri-clarity', 'wayback'] as const) expect(veil(mapStyle), mapStyle).toBe('#F8F6F0');
    for (const mapStyle of ['street', 'topo', 'outdoor', 'mapbox-streets'] as const) expect(veil(mapStyle), mapStyle).toBe(dark);
  });

  it('marks the apex with a ringed dot that shows on any basemap, open when terrain hides the point', () => {
    const onDebugFrame = vi.fn<(debug: StoryDebugFrame) => void>();
    mount({ onDebugFrame });
    resize();
    const dot = () => document.querySelector('svg[data-story-wedges] > g circle')!;
    const dark = `rgb(${WEDGE_COLOR.join(' ')})`;
    const light = '#F8F6F0';

    scrollTo(725);
    const [solid] = onDebugFrame.mock.lastCall![0].wedges;
    expect(solid.hollow).toBe(false);
    expect(dot()).toHaveAttribute('opacity', String(solid.dotAlpha));
    expect(dot()).toHaveAttribute('fill', dark);
    expect(dot()).toHaveAttribute('stroke', light);

    fakeMap.project.mockReturnValue({ x: 960, y: 400, occluded: true });
    scrollTo(725);
    const [open] = onDebugFrame.mock.lastCall![0].wedges;
    expect(open.hollow).toBe(true);
    expect(dot()).toHaveAttribute('opacity', String(open.dotAlpha));
    expect(dot()).toHaveAttribute('fill', light);
    expect(dot()).toHaveAttribute('stroke', dark);
  });

  it('repaints only the wedges when the map renders a new projection', () => {
    mount();
    resize();
    scrollTo(725);
    const shown = fakeMap.show.mock.calls.length;

    fakeMap.project.mockReturnValue({ x: 900, y: 300, occluded: false });
    act(() => fakeMap.onRender.mock.calls[0][0]());
    expect(document.querySelector('svg[data-story-wedges] polygon')).toHaveAttribute('points', '600,275 600,475 900,300');
    expect(fakeMap.show).toHaveBeenCalledTimes(shown);
  });

  it('keeps the block at the reading line there after a re-measure', () => {
    mount();
    resize();
    scrollTo(725);

    layout.shift = 200;
    resize();
    expect(fakeMap.resize).toHaveBeenCalled();
    expect(layout.scrollTop).toBe(925);
  });

  it('re-measures when fonts and images load, keeping the block at the reading line', async () => {
    mount();
    resize();
    scrollTo(725);

    layout.shift = 200;
    await act(async () => fontsLoaded());
    expect(layout.scrollTop).toBe(925);

    layout.shift = 300;
    fireEvent.load(screen.getByRole('img', { name: 'The ridge' }));
    expect(layout.scrollTop).toBe(1025);
  });

  it('writes scrollTop only when the restored place is more than half a pixel away', () => {
    mount();
    resize();
    scrollTo(725);
    const writes = vi.fn();
    Object.defineProperty(scroller(), 'scrollTop', {
      configurable: true,
      get: () => layout.scrollTop,
      set: (value: number) => { writes(value); layout.scrollTop = value; },
    });

    resize();
    layout.shift = 0.4;
    resize();
    expect(writes).not.toHaveBeenCalled();

    layout.shift = 200;
    resize();
    expect(writes).toHaveBeenCalledOnce();
    expect(writes.mock.lastCall![0]).toBeCloseTo(725 + 200 - 0.4, 6);
  });

  it('hands a map that cannot start to the error boundary and stops listening', async () => {
    class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
      state = { error: null as Error | null };
      static getDerivedStateFromError(error: Error) { return { error }; }
      render() { return this.state.error ? <p>Closed: {this.state.error.message}</p> : this.props.children; }
    }
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(createStoryMap).mockImplementationOnce(() => { throw new Error('WebGL unavailable'); });
    render(<Boundary><StoryView story={compiled()} strings={strings} /></Boundary>);

    resize();
    expect(screen.getByText('Closed: WebGL unavailable')).toBeInTheDocument();
    expect(resizeCallbacks).toEqual([]);
    expect(motion.listener).toBeNull();

    await act(async () => fontsLoaded());
    expect(createStoryMap).toHaveBeenCalledOnce();
  });

  it('destroys the map and stops listening on unmount', () => {
    const { unmount } = mount();
    resize();
    const reader = scroller();
    const photo = screen.getByRole('img', { name: 'The ridge' });
    const shown = fakeMap.show.mock.calls.length;

    unmount();
    expect(fakeMap.destroy).toHaveBeenCalledOnce();
    expect(resizeCallbacks).toEqual([]);
    expect(motion.listener).toBeNull();

    fireEvent.load(photo);
    fireEvent.scroll(reader);
    act(() => frames.forEach((callback) => callback(0)));
    expect(fakeMap.show).toHaveBeenCalledTimes(shown);
    expect(createStoryMap).toHaveBeenCalledOnce();
  });

  it('cancels a frame still pending at unmount', () => {
    const { unmount } = mount();
    resize();
    fireEvent.scroll(scroller());
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
  });
});
