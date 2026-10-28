import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { PaintedTrailMarker } from '@/utils/paintedTrailMarker';
import { buildElevatedSegments, completedRouteIndex, terrainSafeElevation, type ElevatedSegment, type ElevationPoint, type ElevationStyle } from './recordedElevationGeometry';

const LAYER = 'recorded-elevation-prototype';

function colorComponents(color: string): [number, number, number] {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return [0.76, 0.36, 0.15];
  context.fillStyle = '#c1652f'; context.fillStyle = color;
  const value = context.fillStyle;
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) return [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16) / 255) as [number, number, number];
  const rgb = /^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/i.exec(value);
  return rgb ? [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255] : [0.76, 0.36, 0.15];
}

/** Render the same colored route and playback marker in 3D map space. */
export function useRecordedElevationLayer(mapRef: React.RefObject<maplibregl.Map | null>, loaded: boolean, enabled: boolean, points: ElevationPoint[], current: ElevationPoint | null, completed: number[][], markerRef: React.RefObject<PaintedTrailMarker | null>, style: ElevationStyle, ghostOpacity: number) {
  const state = useRef({ current, completed, ghostOpacity });
  useEffect(() => { state.current = { current, completed, ghostOpacity }; }, [current, completed, ghostOpacity]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !enabled || points.length < 2) return;
    const hidden = ['trail-line', 'trail-completed'];
    hidden.forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); });
    const origin = maplibregl.MercatorCoordinate.fromLngLat([points[0].lon, points[0].lat], points[0].elevation);
    const coord = (p: ElevationPoint) => {
      const c = maplibregl.MercatorCoordinate.fromLngLat([p.lon, p.lat], p.elevation);
      return [c.x - origin.x, c.y - origin.y, c.z - origin.z];
    };
    const sample = (lon: number, lat: number) => map.getTerrain() ? map.queryTerrainElevation([lon, lat]) : null;
    let segments: ElevatedSegment[] = [];
    let vertices = new Float32Array();
    let dirty = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const rebuild = () => {
      segments = buildElevatedSegments(points, style, sample);
      const data: number[] = []; const colors = new Map<string, [number, number, number]>();
      for (const segment of segments) {
        const a = coord(segment.start), b = coord(segment.end);
        let color = colors.get(segment.color); if (!color) { color = colorComponents(segment.color); colors.set(segment.color, color); }
        for (const [end, side] of [[0, -1], [1, -1], [0, 1], [0, 1], [1, -1], [1, 1]]) data.push(...a, ...b, end, side, end ? segment.toIndex : segment.fromIndex, ...color);
      }
      vertices = new Float32Array(data); dirty = true; map.triggerRepaint();
    };
    const queueRebuild = () => { if (timer) return; timer = setTimeout(() => { timer = undefined; rebuild(); }, 250); };
    const onSourceData = (event: maplibregl.MapSourceDataEvent) => { if (event.sourceId === 'terrain-dem') queueRebuild(); };
    let program: WebGLProgram; let buffer: WebGLBuffer;
    const layer: maplibregl.CustomLayerInterface = {
      id: LAYER, type: 'custom', renderingMode: '3d',
      onAdd(_map, gl) {
        const compile = (type: number, source: string) => {
          const shader = gl.createShader(type)!; gl.shaderSource(shader, source); gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Shader compilation failed');
          return shader;
        };
        program = gl.createProgram()!;
        gl.attachShader(program, compile(gl.VERTEX_SHADER, `#version 300 es
          precision highp float;
          in vec3 a_start; in vec3 a_end; in float a_endFlag; in float a_side; in float a_index; in vec3 a_color;
          uniform mat4 u_matrix; uniform vec2 u_viewport; uniform float u_width;
          out float v_index; out vec3 v_color;
          void main() {
            vec4 a = u_matrix * vec4(a_start, 1.0); vec4 b = u_matrix * vec4(a_end, 1.0);
            vec4 p = mix(a, b, a_endFlag);
            vec2 d = (b.xy / b.w - a.xy / a.w) * u_viewport;
            vec2 n = length(d) > 0.0001 ? normalize(vec2(-d.y, d.x)) : vec2(0.0, 1.0);
            p.xy += n * a_side * u_width / u_viewport * p.w;
            gl_Position = p; v_index = a_index; v_color = a_color;
          }`));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, `#version 300 es
          precision highp float; in float v_index; in vec3 v_color; uniform float u_completed; uniform float u_opacity; uniform bool u_clip; out vec4 color;
          void main() { if (u_clip && v_index > u_completed) discard; color = vec4(v_color, u_opacity); }`));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader link failed');
        buffer = gl.createBuffer()!; rebuild();
      },
      render(gl, args) {
        gl.useProgram(program);
        const m = args.defaultProjectionData.mainMatrix; const matrix = new Float32Array(m);
        for (let row = 0; row < 4; row++) matrix[12 + row] = m[12 + row] + m[row] * origin.x + m[4 + row] * origin.y + m[8 + row] * origin.z;
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_matrix'), false, matrix);
        gl.uniform2f(gl.getUniformLocation(program, 'u_viewport'), gl.drawingBufferWidth, gl.drawingBufferHeight);
        const progress = completedRouteIndex(points, state.current.completed, state.current.current);
        gl.uniform1f(gl.getUniformLocation(program, 'u_completed'), progress);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        if (dirty) { gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW); dirty = false; }
        for (const [name, size, offset] of [['a_start', 3, 0], ['a_end', 3, 12], ['a_endFlag', 1, 24], ['a_side', 1, 28], ['a_index', 1, 32], ['a_color', 3, 36]] as const) {
          const loc = gl.getAttribLocation(program, name);
          if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 48, offset); }
        }
        gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        const pixelRatio = gl.drawingBufferWidth / (map.getCanvas().clientWidth || gl.drawingBufferWidth);
        gl.uniform1f(gl.getUniformLocation(program, 'u_width'), 4 * pixelRatio); gl.uniform1f(gl.getUniformLocation(program, 'u_opacity'), state.current.ghostOpacity); gl.uniform1i(gl.getUniformLocation(program, 'u_clip'), 0);
        gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 12);
        gl.uniform1f(gl.getUniformLocation(program, 'u_width'), 6 * pixelRatio); gl.uniform1f(gl.getUniformLocation(program, 'u_opacity'), 1); gl.uniform1i(gl.getUniformLocation(program, 'u_clip'), 1);
        gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 12); gl.depthMask(true);
        if (state.current.current && markerRef.current) {
          const currentPoint = state.current.current;
          const segment = segments.find(s => progress >= s.fromIndex && progress <= s.toIndex);
          let elevation = terrainSafeElevation(currentPoint, sample);
          if (segment) {
            const t = (progress - segment.fromIndex) / (segment.toIndex - segment.fromIndex);
            elevation = segment.start.elevation + t * (segment.end.elevation - segment.start.elevation);
          }
          const p = maplibregl.MercatorCoordinate.fromLngLat([currentPoint.lon, currentPoint.lat], elevation);
          const x = m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12];
          const y = m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13];
          const w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
          if (w > 0) { const canvas = map.getCanvas(); markerRef.current.renderAt((x / w + 1) * canvas.clientWidth / 2, (1 - y / w) * canvas.clientHeight / 2); }
        }
      },
      onRemove(_map, gl) { gl.deleteBuffer(buffer); gl.deleteProgram(program); },
    };
    map.addLayer(layer);
    map.on('sourcedata', onSourceData); map.on('moveend', queueRebuild); map.on('terrain', queueRebuild);
    return () => {
      if (timer) clearTimeout(timer);
      map.off('sourcedata', onSourceData); map.off('moveend', queueRebuild); map.off('terrain', queueRebuild);
      if (map.getLayer(LAYER)) map.removeLayer(LAYER);
      hidden.forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible'); });
    };
  }, [mapRef, loaded, enabled, points, markerRef, style]);
  useEffect(() => { if (enabled) mapRef.current?.triggerRepaint(); }, [mapRef, enabled, current, completed, ghostOpacity]);
}
