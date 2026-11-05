import earcut from 'earcut';
import { setBuildingFrameController } from './buildingFrameReadiness';
import { BASEMAP_FILTER_PAINT } from './mapFilters';
import type { MapFilter } from '@/types';
import { intersection, type Polygon } from 'polygon-clipping';
import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MapLibreMap } from 'maplibre-gl';

type Batch = { x: number; y: number; zoom: number; vertices: number[] };

/** Distant views need fewer image tiles; close views retain detailed roofs. */
export function buildingImageryZoom(mapZoom: number): number {
  return Math.min(16, Math.max(13, Math.floor(mapZoom)));
}

/** Experimental overhead imagery projected onto building footprints at roof height. */
export function satelliteRoofs(map: MapLibreMap, template: string, initialFilter: MapFilter = 'none'): CustomLayerInterface {
  let gl: WebGL2RenderingContext;
  let program: WebGLProgram;
  let buffer: WebGLBuffer;
  let batches: Batch[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removed = false;
  let dirty = true;
  let currentFilter = initialFilter;
  const textures = new Map<string, WebGLTexture | null>();
  const pending = new Set<string>();

  function shader(type: number, source: string) {
    const result = gl.createShader(type)!;
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result) || 'Roof shader compilation failed');
    return result;
  }

  function texture(x: number, y: number, zoom: number) {
    const key = `${zoom}/${x}/${y}`;
    if (textures.has(key) || pending.has(key)) return;
    pending.add(key);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      pending.delete(key);
      if (removed) return;
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      textures.set(key, tex);
      // Keep the GPU cache bounded during long replays.
      if (textures.size > 128) {
        // Never evict a tile needed by the current frame, even if a wide
        // pitched view needs more than the usual cache budget.
        const active = new Set(batches.map((batch) => `${batch.zoom}/${batch.x}/${batch.y}`));
        for (const [oldest, old] of textures) {
          if (textures.size <= 128) break;
          if (active.has(oldest) || oldest === key) continue;
          if (old) gl.deleteTexture(old);
          textures.delete(oldest);
        }
      }
      map.triggerRepaint();
    };
    img.onerror = () => { pending.delete(key); if (!removed) textures.set(key, null); };
    img.src = template.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y));
  }

  function rebuild() {
    timer = undefined;
    dirty = false;
    if (removed || map.getZoom() < 13 || !map.getLayer('buildings-3d')) { batches = []; return; }
    const zoom = buildingImageryZoom(map.getZoom());
    const scale = 2 ** zoom;
    const grouped = new Map<string, Batch>();
    const features = map.queryRenderedFeatures({ layers: ['buildings-3d'] });
    for (const feature of features) {
      const height = Number(feature.properties?.render_height);
      if (!Number.isFinite(height) || height <= 0 || feature.properties?.hide_3d === true) continue;
      const geometry = feature.geometry;
      const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
      for (const polygon of polygons) {
        if (!polygon[0]?.length) continue;
        const tilePolygon: Polygon = polygon.map((ring) => ring.map((point) => {
          const m = MercatorCoordinate.fromLngLat([point[0], point[1]]);
          return [m.x * scale, m.y * scale] as [number, number];
        }));
        const points = tilePolygon[0];
        const minX = Math.floor(Math.min(...points.map((p) => p[0])));
        const maxX = Math.floor(Math.max(...points.map((p) => p[0])));
        const minY = Math.floor(Math.min(...points.map((p) => p[1])));
        const maxY = Math.floor(Math.max(...points.map((p) => p[1])));
        // MapLibre raises each extrusion using the average of its outer-ring
        // vertices. Sampling at the same point keeps our roof at that height.
        const ring = polygon[0];
        const last = ring[ring.length - 1];
        const closed = ring.length > 1 && ring[0][0] === last[0] && ring[0][1] === last[1];
        const samples = closed ? ring.slice(0, -1) : ring;
        const center = samples.reduce((sum, point) => [sum[0] + point[0] / samples.length, sum[1] + point[1] / samples.length], [0, 0]);
        const terrain = map.getTerrain() ? (map.queryTerrainElevation([center[0], center[1]]) ?? 0) : 0;
        const roofHeight = terrain + height * Math.min(1, Math.max(0, map.getZoom() - 13)) + 0.3;
        const z = MercatorCoordinate.fromLngLat([center[0], center[1]], roofHeight).z;
        // The overhead image cannot reveal the facade. Sample the building's
        // roof color and draw a restrained, procedural window pattern instead.
        const centerMercator = MercatorCoordinate.fromLngLat([center[0], center[1]]);
        const tileX = Math.floor(centerMercator.x * scale), tileY = Math.floor(centerMercator.y * scale);
        if (tileX >= 0 && tileY >= 0 && tileX < scale && tileY < scale) {
          const key = `${zoom}/${tileX}/${tileY}`;
          let walls = grouped.get(key);
          if (!walls) { walls = { x: tileX, y: tileY, zoom, vertices: [] }; grouped.set(key, walls); }
          const u = centerMercator.x * scale - tileX, v = centerMercator.y * scale - tileY;
          const fade = Math.min(1, Math.max(0, map.getZoom() - 13));
          const baseHeight = terrain + Math.max(0, Number(feature.properties?.render_min_height) || 0) * fade;
          const topHeight = terrain + height * fade;
          const meterScale = centerMercator.meterInMercatorCoordinateUnits();
          for (const boundary of polygon) {
            let distance = 0;
            for (let i = 0; i + 1 < boundary.length; i++) {
              const a = MercatorCoordinate.fromLngLat([boundary[i][0], boundary[i][1]]);
              const b = MercatorCoordinate.fromLngLat([boundary[i + 1][0], boundary[i + 1][1]]);
              const length = Math.hypot(b.x - a.x, b.y - a.y) / meterScale;
              if (length < 0.1) continue;
              const point = (p: MercatorCoordinate, elevation: number, d: number, h: number) => [
                p.x - tileX / scale, p.y - tileY / scale, elevation * meterScale,
                u, v, 1, d, h,
              ];
              const a0 = point(a, baseHeight, distance, 0), b0 = point(b, baseHeight, distance + length, 0);
              const a1 = point(a, topHeight, distance, height * fade), b1 = point(b, topHeight, distance + length, height * fade);
              walls.vertices.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
              distance += length;
            }
          }
          texture(tileX, tileY, zoom);
        }
        // Split at imagery tile boundaries so every triangle samples the correct tile.
        for (let x = Math.max(0, minX); x <= Math.min(scale - 1, maxX); x++) {
          for (let y = Math.max(0, minY); y <= Math.min(scale - 1, maxY); y++) {
            const clipped = intersection(tilePolygon, [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]]);
            for (const part of clipped) {
              const flat: number[] = [], holes: number[] = [];
              for (const [index, ring] of part.entries()) {
                if (index) holes.push(flat.length / 2);
                for (const point of ring) flat.push(point[0] - x, point[1] - y);
              }
              const indices = earcut(flat, holes, 2);
              if (!indices.length) continue;
              const key = `${zoom}/${x}/${y}`;
              let batch = grouped.get(key);
              if (!batch) { batch = { x, y, zoom, vertices: [] }; grouped.set(key, batch); }
              for (const i of indices) {
                const u = flat[i * 2], v = flat[i * 2 + 1];
                batch.vertices.push(u / scale, v / scale, z, u, v, 0, 0, 0);
              }
              texture(x, y, zoom);
            }
          }
        }
      }
    }
    batches = [...grouped.values()];
    map.triggerRepaint();
  }
  function schedule() {
    dirty = true;
    if (timer || removed) return;
    timer = setTimeout(rebuild, 200);
  }

  return {
    id: 'satellite-building-roofs', type: 'custom', renderingMode: '3d',
    onAdd(_map, context) {
      gl = context as WebGL2RenderingContext;
      const vert = shader(gl.VERTEX_SHADER, `#version 300 es\nin vec3 a_pos; in vec2 a_uv; in vec3 a_wall; uniform mat4 u_matrix; out vec2 v_uv; out vec3 v_wall; void main(){ gl_Position = u_matrix * vec4(a_pos, 1.0); v_uv = a_uv; v_wall = a_wall; }`);
      const frag = shader(gl.FRAGMENT_SHADER, `#version 300 es\nprecision highp float; in vec2 v_uv; in vec3 v_wall; uniform sampler2D u_image; uniform float u_saturation; uniform float u_contrast; uniform float u_brightness; out vec4 color;
vec3 applyFilter(vec3 rgb) {
  float average = (rgb.r + rgb.g + rgb.b) / 3.0;
  rgb += (vec3(average) - rgb) * u_saturation;
  rgb = (rgb - 0.5) * u_contrast + 0.5;
  return rgb * u_brightness;
}
void main(){
  if (v_wall.x < 0.5) { color = vec4(applyFilter(texture(u_image, v_uv).rgb), 1.0); return; }
  vec2 px = vec2(0.006);
  vec3 sampleColor = (texture(u_image, v_uv).rgb * 2.0 + texture(u_image, v_uv + vec2(px.x,0)).rgb + texture(u_image, v_uv - vec2(px.x,0)).rgb + texture(u_image, v_uv + vec2(0,px.y)).rgb + texture(u_image, v_uv - vec2(0,px.y)).rgb) / 6.0;
  float gray = dot(sampleColor, vec3(0.299, 0.587, 0.114));
  vec3 wall = mix(vec3(gray), sampleColor, 0.5);
  wall = mix(wall, vec3(0.65, 0.63, 0.59), 0.38) * 0.82;
  vec2 grid = abs(fract(vec2(v_wall.y / 4.0, v_wall.z / 3.2)) - 0.5);
  float edge = max(fwidth(grid.x), fwidth(grid.y));
  float windowShape = (1.0 - smoothstep(0.28 - edge, 0.28 + edge, grid.x)) * (1.0 - smoothstep(0.25 - edge, 0.25 + edge, grid.y));
  float visible = 1.0 - smoothstep(0.12, 0.3, edge);
  wall *= 1.0 - 0.20 * windowShape * visible;
  color = vec4(applyFilter(wall), 1.0);
}`);
      program = gl.createProgram()!; gl.attachShader(program, vert); gl.attachShader(program, frag); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Roof shader link failed');
      gl.deleteShader(vert); gl.deleteShader(frag);
      buffer = gl.createBuffer()!;
      setBuildingFrameController(map, {
        prepare: () => {
          if (!dirty) return;
          if (timer) { clearTimeout(timer); timer = undefined; }
          rebuild();
        },
        setFilter: (filter) => { currentFilter = filter; map.triggerRepaint(); },
        isReady: () => !dirty && batches.every((batch) => !!textures.get(`${batch.zoom}/${batch.x}/${batch.y}`)),
      });
      map.on('move', schedule); map.on('sourcedata', schedule); schedule();
    },
    render(context, options: CustomRenderMethodInput) {
      gl = context as WebGL2RenderingContext;
      if (!program || !batches.length) return;
      gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const pos = gl.getAttribLocation(program, 'a_pos'), uv = gl.getAttribLocation(program, 'a_uv'), wall = gl.getAttribLocation(program, 'a_wall');
      gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 3, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 32, 12);
      gl.enableVertexAttribArray(wall); gl.vertexAttribPointer(wall, 3, gl.FLOAT, false, 32, 20);
      gl.disable(gl.CULL_FACE); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -1); gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
      const filter = BASEMAP_FILTER_PAINT[currentFilter] ?? BASEMAP_FILTER_PAINT.none;
      const saturation = filter['raster-saturation'];
      const contrast = filter['raster-contrast'];
      gl.uniform1f(gl.getUniformLocation(program, 'u_saturation'), saturation > 0 ? 1 - 1 / (1.001 - saturation) : -saturation);
      gl.uniform1f(gl.getUniformLocation(program, 'u_contrast'), contrast > 0 ? 1 / (1 - contrast) : 1 + contrast);
      gl.uniform1f(gl.getUniformLocation(program, 'u_brightness'), filter['raster-brightness-max']);
      const matrix = options.defaultProjectionData.mainMatrix;
      for (const batch of batches) {
        const tex = textures.get(`${batch.zoom}/${batch.x}/${batch.y}`);
        if (!tex || !batch.vertices.length) continue;
        const scale = 2 ** batch.zoom;
        const ox = batch.x / scale, oy = batch.y / scale;
        const m = new Float32Array(matrix);
        for (let row = 0; row < 4; row++) m[12 + row] = matrix[12 + row] + matrix[row] * ox + matrix[4 + row] * oy;
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_matrix'), false, m);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(batch.vertices), gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.TRIANGLES, 0, batch.vertices.length / 8);
      }
      gl.disableVertexAttribArray(pos); gl.disableVertexAttribArray(uv); gl.disableVertexAttribArray(wall); gl.disable(gl.POLYGON_OFFSET_FILL);
    },
    onRemove() {
      removed = true;
      setBuildingFrameController(map, null);
      if (timer) clearTimeout(timer);
      map.off('move', schedule); map.off('sourcedata', schedule);
      for (const tex of textures.values()) if (tex) gl.deleteTexture(tex);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    },
  };
}
