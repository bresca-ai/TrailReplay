import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GPXPoint } from '@/types';
import type { PaintedTrailMarker } from '@/utils/paintedTrailMarker';

const LAYER = 'recorded-elevation-prototype';
type Point = Pick<GPXPoint, 'lat' | 'lon' | 'elevation'>;

/** Render an elevated ribbon in MapLibre's shared 3D depth buffer. */
export function useRecordedElevationLayer(mapRef: React.RefObject<maplibregl.Map | null>, loaded: boolean, enabled: boolean, points: Point[], current: Point | null, completedCount: number, markerRef: React.RefObject<PaintedTrailMarker | null>) {
  const state = useRef({ current, completedCount });
  useEffect(() => { state.current = { current, completedCount }; }, [current, completedCount]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !enabled || points.length < 2) return;
    const hidden = ['trail-line', 'trail-completed'];
    hidden.forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); });
    const origin = maplibregl.MercatorCoordinate.fromLngLat([points[0].lon, points[0].lat], points[0].elevation);
    const coord = (p: Point) => {
      const c = maplibregl.MercatorCoordinate.fromLngLat([p.lon, p.lat], p.elevation);
      return [c.x - origin.x, c.y - origin.y, c.z - origin.z];
    };
    const vertices: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = coord(points[i]); const b = coord(points[i + 1]);
      for (const [end, side] of [[0, -1], [1, -1], [0, 1], [0, 1], [1, -1], [1, 1]]) vertices.push(...a, ...b, end, side, i);
    }
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
          in vec3 a_start; in vec3 a_end; in float a_endFlag; in float a_side; in float a_index;
          uniform mat4 u_matrix; uniform vec2 u_viewport; uniform float u_point; uniform float u_completed;
          out float v_completed;
          void main() {
            vec4 a = u_matrix * vec4(a_start, 1.0); vec4 b = u_matrix * vec4(a_end, 1.0);
            vec4 p = mix(a, b, a_endFlag);
            if (u_point < 0.5) {
              vec2 d = (b.xy / b.w - a.xy / a.w) * u_viewport;
              vec2 n = length(d) > 0.0001 ? normalize(vec2(-d.y, d.x)) : vec2(0.0, 1.0);
              p.xy += n * a_side * 5.0 / u_viewport * p.w;
            }
            gl_Position = p; gl_PointSize = 14.0; v_completed = step(a_index, u_completed);
          }`));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, `#version 300 es
          precision highp float; in float v_completed; uniform float u_point; out vec4 color;
          void main() {
            if (u_point > 0.5 && distance(gl_PointCoord, vec2(0.5)) > 0.5) discard;
            color = u_point > 0.5 ? vec4(1.0, 0.96, 0.88, 1.0) : mix(vec4(0.76, 0.36, 0.15, 0.48), vec4(0.76, 0.36, 0.15, 1.0), v_completed);
          }`));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader link failed');
        buffer = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
      },
      render(gl, args) {
        gl.useProgram(program);
        const m = args.defaultProjectionData.mainMatrix; const matrix = new Float32Array(m);
        for (let row = 0; row < 4; row++) matrix[12 + row] = m[12 + row] + m[row] * origin.x + m[4 + row] * origin.y + m[8 + row] * origin.z;
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_matrix'), false, matrix);
        gl.uniform2f(gl.getUniformLocation(program, 'u_viewport'), gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.uniform1f(gl.getUniformLocation(program, 'u_completed'), state.current.completedCount - 2);
        const bind = (target: WebGLBuffer) => {
          gl.bindBuffer(gl.ARRAY_BUFFER, target);
          for (const [name, size, offset] of [['a_start', 3, 0], ['a_end', 3, 12], ['a_endFlag', 1, 24], ['a_side', 1, 28], ['a_index', 1, 32]] as const) {
            const loc = gl.getAttribLocation(program, name);
            if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 36, offset); }
          }
        };
        gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform1f(gl.getUniformLocation(program, 'u_point'), 0); bind(buffer); gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 9);
        if (state.current.current && markerRef.current) {
          const p = maplibregl.MercatorCoordinate.fromLngLat(
            [state.current.current.lon, state.current.current.lat], state.current.current.elevation,
          );
          const x = m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12];
          const y = m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13];
          const w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
          if (w > 0) {
            const canvas = map.getCanvas();
            markerRef.current.renderAt((x / w + 1) * canvas.clientWidth / 2, (1 - y / w) * canvas.clientHeight / 2);
          }
        }
      },
      onRemove(_map, gl) { gl.deleteBuffer(buffer); gl.deleteProgram(program); },
    };
    map.addLayer(layer);
    return () => {
      if (map.getLayer(LAYER)) map.removeLayer(LAYER);
      hidden.forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible'); });
    };
  }, [mapRef, loaded, enabled, points, markerRef]);
  useEffect(() => { if (enabled) mapRef.current?.triggerRepaint(); }, [mapRef, enabled, current, completedCount]);
}
