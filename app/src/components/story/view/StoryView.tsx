import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, X } from 'lucide-react';
import type { CompiledBlock, CompiledMedia, CompiledStory } from '@/utils/story/compileStory';
import { formatDistance, formatElevation } from '@/utils/units';
import { buildScrollTrack, scrollTopForPlace, storyFrameAt, type Box, type ScrollTrack, type StoryFrame, type TrackMeasure } from './storyFrame';
import { createStoryMap, type StoryMap } from './storyMap';
import { WEDGE_COLOR, WEDGE_LIGHT, wedgeTone, wedgesFor, type ProjectPoint, type Wedge } from './storyWedge';

/** Every user-visible string the reader shows; the caller translates them. */
export interface StoryStrings {
  exit: string; mapLabel: string; start: string; finish: string;
  distance: string; elevationGain: string;
  placeholder: (fileName: string) => string;
}

export interface StoryDebugFrame { frame: StoryFrame; wedges: Wedge[]; track: ScrollTrack; ms: number; project: ProjectPoint; tilesLoaded: () => boolean }

export interface StoryViewProps {
  story: CompiledStory; // read once: the view never recompiles or subscribes
  strings: StoryStrings;
  onExit?: () => void; // absent in a standalone viewer
  onDebugFrame?: (debug: StoryDebugFrame) => void; // probe
}

const WEDGE_SLOTS = [0, 1, 2]; // wedgesFor returns at most 3
const WEDGE_FILL = `rgb(${WEDGE_COLOR.join(' ')})`;
const DOT_RING = WEDGE_LIGHT; // as the map's head dot: the dark fill alone vanishes on dark imagery
const LABEL = 'text-xs font-semibold uppercase tracking-[0.1em] text-[var(--evergreen-80)]';
const BODY = 'text-base leading-relaxed text-[var(--evergreen-80)] whitespace-pre-line [overflow-wrap:anywhere]';

/**
 * One scroll container (cover, sections, finish and a sticky map box), so wheel, touch and keys scroll natively;
 * one fixed wedge SVG above it. The map follows scrollTop through storyFrame's pure contract, with no React state
 * per frame.
 */
export function StoryView({ story, strings, onExit, onDebugFrame }: StoryViewProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const finishRef = useRef<HTMLDivElement>(null);
  const wedgesRef = useRef<SVGSVGElement>(null);
  const debugRef = useRef(onDebugFrame);
  const wedgeId = useId();
  // The map starts outside render (resize, font and image callbacks): its failure is rethrown here for the boundary.
  const [failure, setFailure] = useState<Error | null>(null);
  const { layout, unitSystem } = story;
  const tone = wedgeTone(story.look.mapStyle);

  useEffect(() => { debugRef.current = onDebugFrame; }, [onDebugFrame]);
  useEffect(() => runReader({
    scroller: scrollerRef.current!,
    content: contentRef.current!,
    mapBox: mapBoxRef.current!,
    map: mapRef.current!,
    finish: finishRef.current!,
    wedges: wedgesRef.current!,
  }, story, (debug) => debugRef.current?.(debug), setFailure), [story]);
  if (failure) throw failure;

  const mapPlacement = [
    layout.mobileMap === 'top' ? 'top-0' : 'bottom-0 order-last',
    layout.textSide === 'right' ? 'md:order-first' : 'md:order-last',
  ].join(' ');

  return (
    <>
      <div
        ref={scrollerRef}
        tabIndex={0}
        data-story-scroller=""
        data-text-side={layout.textSide}
        data-mobile-map={layout.mobileMap}
        className="fixed inset-0 flex flex-col overflow-x-hidden overflow-y-auto overscroll-contain bg-[var(--canvas)] text-[var(--evergreen)] [overflow-anchor:none] [--story-band:calc(100dvh_-_45svh)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--trail-orange)] md:grid md:grid-cols-2 md:[--story-band:100dvh]"
      >
        <div
          ref={mapBoxRef}
          role="region"
          aria-label={strings.mapLabel}
          className={`sticky h-[45svh] shrink-0 touch-pan-y bg-[#141b22] md:top-0 md:bottom-auto md:h-dvh md:self-start ${mapPlacement}`}
        >
          {/* MapLibre's unlayered CSS makes its container position: relative, so the sticky box wraps it. */}
          <div ref={mapRef} className="h-full w-full" />
        </div>
        <div ref={contentRef} className="min-w-0 shrink-0 px-4 sm:px-8 md:px-10">
          <div className="mx-auto max-w-[38rem]">
            <div data-story-key="cover" className="flex min-h-(--story-band) flex-col justify-center gap-6 py-12">
              <h1 className="text-3xl font-bold leading-tight [overflow-wrap:anywhere] md:text-4xl">{story.title}</h1>
              {story.intro.length > 0 && (
                <div className={`space-y-4 ${BODY}`}>{story.intro.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
              )}
              <dl className="flex flex-wrap gap-x-10 gap-y-3">
                <div>
                  <dt className={LABEL}>{strings.distance}</dt>
                  <dd className="mt-1 text-lg font-bold tabular-nums">{formatDistance(story.stats.distanceMeters, unitSystem)}</dd>
                </div>
                <div>
                  <dt className={LABEL}>{strings.elevationGain}</dt>
                  <dd className="mt-1 text-lg font-bold tabular-nums">{formatElevation(story.stats.elevationGainMeters, unitSystem)}</dd>
                </div>
              </dl>
              <p className={`flex items-center gap-2 ${LABEL}`}><ArrowDown className="h-4 w-4" aria-hidden="true" />{strings.start}</p>
            </div>

            {story.sections.map((section) => (
              <section
                key={section.key}
                className="min-h-[min(var(--story-leg),calc(var(--story-band)*1.2))]"
                style={{ '--story-leg': `${section.legMeters / 1000 * 30}px` } as CSSProperties}
              >
                <div data-story-key={section.key} data-story-head="" className="pt-12 pb-5">
                  {section.heading && <p className={`mb-1 ${LABEL}`}>{formatDistance(section.routeMeters, unitSystem)}</p>}
                  <h2 className="text-xl font-bold leading-snug [overflow-wrap:anywhere]">
                    {section.heading || formatDistance(section.routeMeters, unitSystem)}
                  </h2>
                </div>
                <div className="space-y-6 pb-12">
                  {section.blocks.map((block) => <StoryBlockView key={block.key} block={block} strings={strings} />)}
                </div>
              </section>
            ))}

            <div ref={finishRef} data-story-key="finish" className="rounded-lg border border-[var(--evergreen)]/15 p-6">
              <p className={LABEL}>{strings.finish}</p>
              <p className="mt-1 text-xl font-bold [overflow-wrap:anywhere]">{story.title}</p>
              <p className="mt-2 text-sm tabular-nums text-[var(--evergreen-80)]">
                {formatDistance(story.stats.distanceMeters, unitSystem)} · {formatElevation(story.stats.elevationGainMeters, unitSystem)}
              </p>
            </div>
            {/* Half the band: at the end the finish has crossed the reading line yet still sits inside the band. */}
            <div aria-hidden="true" className="h-[calc(var(--story-band)/2)]" />
          </div>
        </div>
      </div>

      {/* Cut at the map box: the bounded tint over text outside it, a veil and haloed edges in the basemap's contrast tone inside. */}
      <svg ref={wedgesRef} aria-hidden="true" data-story-wedges="" className="pointer-events-none fixed inset-0 z-10 h-full w-full">
        <defs>
          <clipPath id={`${wedgeId}-text`}><path clipRule="evenodd" /></clipPath>
          <clipPath id={`${wedgeId}-map`}><rect /></clipPath>
        </defs>
        {WEDGE_SLOTS.map((slot) => (
          <g key={slot} data-wedge-slot={slot} visibility="hidden">
            <defs>
              <linearGradient id={`${wedgeId}-text-${slot}`} gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor={WEDGE_FILL} stopOpacity="0" />
                <stop offset="1" stopColor={WEDGE_FILL} stopOpacity="0" />
              </linearGradient>
              <linearGradient id={`${wedgeId}-veil-${slot}`} gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor={tone.veil} stopOpacity="0" />
                <stop offset="1" stopColor={tone.veil} stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon data-wedge-part="text" clipPath={`url(#${wedgeId}-text)`} fill={`url(#${wedgeId}-text-${slot})`} />
            <g data-wedge-part="map" clipPath={`url(#${wedgeId}-map)`}>
              <polygon fill={`url(#${wedgeId}-veil-${slot})`} />
              <polyline data-wedge-edge="halo" fill="none" stroke={tone.halo} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              <polyline data-wedge-edge="line" fill="none" stroke={tone.edge} strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
            </g>
            <circle r="5" />
          </g>
        ))}
      </svg>

      {onExit && (
        <button
          type="button"
          onClick={onExit}
          aria-label={strings.exit}
          className="fixed top-3 right-3 z-20 inline-flex items-center gap-2 rounded-md bg-[var(--evergreen)] px-3 py-2 text-sm font-medium text-[var(--canvas)] shadow-lg hover:bg-[var(--evergreen)]/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--trail-orange)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{strings.exit}</span>
        </button>
      )}
    </>
  );
}

function StoryBlockView({ block, strings }: { block: CompiledBlock; strings: StoryStrings }) {
  if (block.kind === 'text') {
    return (
      <div data-story-key={block.key} className={`space-y-4 ${BODY}`}>
        {block.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
    );
  }
  return <StoryMediaView itemKey={block.key} media={block.media} strings={strings} />;
}

function StoryMediaView({ itemKey, media, strings }: { itemKey: string; media: CompiledMedia; strings: StoryStrings }) {
  const [failed, setFailed] = useState(false);
  const label = media.caption || media.fileName;
  const showFile = media.src !== null && !failed;
  return (
    <figure data-story-key={itemKey}>
      {showFile && media.kind === 'video' && (
        <video src={media.src!} aria-label={label} controls playsInline preload="metadata" onError={() => setFailed(true)} className="block w-full rounded-lg bg-black" />
      )}
      {showFile && media.kind === 'picture' && (
        // Eager: a photo loading mid-read would grow its section and move the knots under the reader.
        <img src={media.src!} alt={label} decoding="async" onError={() => setFailed(true)} className="block h-auto w-full rounded-lg" />
      )}
      {!showFile && (
        <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-[var(--evergreen)]/30 bg-[var(--evergreen)]/5 p-4 text-center text-sm text-[var(--evergreen-80)] [overflow-wrap:anywhere]">
          {strings.placeholder(media.fileName)}
        </div>
      )}
      {media.caption && <figcaption className="mt-2 text-sm text-[var(--evergreen-80)] [overflow-wrap:anywhere]">{media.caption}</figcaption>}
    </figure>
  );
}

interface ReaderDom {
  scroller: HTMLElement; content: HTMLElement; mapBox: HTMLElement; map: HTMLElement; finish: HTMLElement; wedges: SVGSVGElement;
}

/** Wires measuring, the map and the frame loop to the rendered DOM; returns the teardown. */
function runReader(
  dom: ReaderDom,
  story: CompiledStory,
  report: (debug: StoryDebugFrame) => void,
  fail: (error: Error) => void,
): () => void {
  const { scroller, content } = dom;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const [textClip, mapClip] = [...dom.wedges.querySelectorAll(':scope > defs > clipPath > *')];
  const slots = [...dom.wedges.querySelectorAll<SVGGElement>('[data-wedge-slot]')].map((group) => ({
    group,
    gradients: [...group.querySelectorAll('linearGradient')],
    stops: [...group.querySelectorAll('linearGradient')].map((gradient) => gradient.querySelectorAll('stop')),
    polygons: [...group.querySelectorAll('polygon')],
    edges: [...group.querySelectorAll('polyline')],
    dot: group.querySelector('circle')!,
  }));
  let map: StoryMap | null = null;
  let track: ScrollTrack | null = null;
  let frame: StoryFrame | null = null;
  let clips = new Map<string, HTMLVideoElement>();
  let pending = 0;
  let disposed = false;

  const paintWedges = (wedges: Wedge[]) => {
    slots.forEach(({ group, gradients, stops, polygons, edges, dot }, index) => {
      const wedge = wedges[index];
      group.setAttribute('visibility', wedge ? 'visible' : 'hidden');
      if (!wedge) return;
      const [[x1, y1], [x2, y2]] = [wedge.apex, wedge.baseMid];
      for (const gradient of gradients) setAttributes(gradient, { x1, y1, x2, y2 });
      [wedge.alpha, wedge.veilAlpha].forEach((alpha, part) => {
        stops[part][0].setAttribute('stop-opacity', String(alpha));
        stops[part][1].setAttribute('stop-opacity', String(alpha * 0.5));
      });
      const points = wedge.polygon.map((point) => point.join(',')).join(' ');
      for (const polygon of polygons) polygon.setAttribute('points', points);
      const [base0, base1, apex] = wedge.polygon;
      for (const edge of edges) edge.setAttribute('points', [base0, apex, base1].map((point) => point.join(',')).join(' '));
      edges[0].setAttribute('opacity', String(wedge.edgeAlpha * 0.6));
      edges[1].setAttribute('opacity', String(wedge.edgeAlpha));
      setAttributes(dot, {
        cx: wedge.apex[0],
        cy: wedge.apex[1],
        opacity: wedge.dotAlpha,
        fill: wedge.hollow ? DOT_RING : WEDGE_FILL,
        stroke: wedge.hollow ? WEDGE_FILL : DOT_RING,
        'stroke-width': 1.5,
      });
    });
  };
  const clipTo = ({ left, top, right, bottom }: Box) => {
    setAttributes(mapClip, { x: left, y: top, width: right - left, height: bottom - top });
    textClip.setAttribute('d', `M-1e5 -1e5H1e5V1e5H-1e5Z M${left} ${top}H${right}V${bottom}H${left}Z`);
  };

  const render = () => {
    cancelAnimationFrame(pending);
    pending = 0;
    if (!map || !track) return;
    const started = performance.now();
    const current = storyFrameAt(story, track, scroller.scrollTop, motion.matches);
    frame = current;
    map.show(current);
    const wedges = wedgesFor(track, current, map.project);
    paintWedges(wedges);
    track.media.forEach((item, index) => {
      const clip = clips.get(item.key);
      if (clip && !current.media[index].inBand && !clip.paused) clip.pause();
    });
    report({ frame: current, wedges, track, ms: performance.now() - started, project: map.project, tilesLoaded: map.tilesLoaded });
  };
  const schedule = () => {
    if (!pending) pending = requestAnimationFrame(render);
  };
  // Tiles and terrain move the projection after the scroll stops; the frame itself is unchanged.
  const repaint = () => {
    if (map && track && frame) paintWedges(wedgesFor(track, frame, map.project));
  };

  const remeasure = () => {
    if (disposed) return;
    const measure = measureReader(dom);
    if (!measure) return;
    track = buildScrollTrack(story, measure);
    clipTo(track.map);
    clips = new Map([...content.querySelectorAll('video')].map((clip) => [
      clip.closest<HTMLElement>('[data-story-key]')?.dataset.storyKey ?? '', clip,
    ]));
    if (!map) {
      try {
        map = createStoryMap(dom.map, story, storyFrameAt(story, track, scroller.scrollTop, motion.matches));
      } catch (error) {
        stop();
        fail(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      map.onRender(repaint);
    } else {
      map.resize();
      // Any write, even of the same value, cancels a smooth keyboard scroll in flight.
      const restored = frame ? scrollTopForPlace(track, frame.place) : scroller.scrollTop;
      if (Math.abs(restored - scroller.scrollTop) > 0.5) scroller.scrollTop = restored;
    }
    render();
  };

  const resizes = new ResizeObserver(remeasure);
  for (const element of [scroller, content, dom.mapBox]) resizes.observe(element);
  void document.fonts.ready.then(remeasure);
  content.addEventListener('load', remeasure, true); // images: load does not bubble
  scroller.addEventListener('scroll', schedule, { passive: true });
  motion.addEventListener('change', schedule);

  function stop() {
    disposed = true;
    cancelAnimationFrame(pending);
    resizes.disconnect();
    content.removeEventListener('load', remeasure, true);
    scroller.removeEventListener('scroll', schedule);
    motion.removeEventListener('change', schedule);
    map?.destroy();
    map = null;
  }
  return stop;
}

/** The reconciliation's origin: a content y is rect.top + scrollTop; boxes and left/right are viewport px. */
function measureReader({ scroller, content, mapBox, finish }: ReaderDom): TrackMeasure | null {
  const scrollerBox = boxOf(scroller);
  const mapBoxBox = boxOf(mapBox);
  if (isEmpty(scrollerBox) || isEmpty(mapBoxBox)) return null;
  const { scrollTop } = scroller;
  const place = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top + scrollTop, height: rect.height, left: rect.left, right: rect.right };
  };
  return {
    scroller: scrollerBox,
    map: mapBoxBox,
    contentHeight: scroller.scrollHeight,
    blocks: [...content.querySelectorAll<HTMLElement>('[data-story-key]')].map((element) => ({
      key: element.dataset.storyKey ?? '',
      ...place(element),
    })),
    sections: [...content.querySelectorAll('[data-story-head]')].map((element) => {
      const { top, height } = place(element);
      return { headTop: top, headBottom: top + height };
    }),
    finishTop: place(finish).top,
  };
}

function boxOf(element: Element): Box {
  const { top, bottom, left, right } = element.getBoundingClientRect();
  return { top, bottom, left, right };
}

function isEmpty(box: Box): boolean {
  return box.right <= box.left || box.bottom <= box.top;
}

function setAttributes(element: Element, attributes: Record<string, string | number>) {
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
}
