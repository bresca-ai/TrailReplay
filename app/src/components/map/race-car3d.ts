// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- Procedural model adapted from JavaScript source.
// @ts-nocheck
/* eslint-disable */
// Adapted from the user's procedural 3D model.
import * as THREE from 'three';

export function createRunnerRenderer(canvas: HTMLCanvasElement) {
const INK = 0x1B2A20, ORANGE = 0xC1652F, PAPER = 0xffffff, CREAM = 0xF8F6F0, CANVAS = 0xF8F6F0;
const BOIL = { value: 0 };   // changes ~8 times a second: makes every line "re-drawn"

/* ---------- pen-and-ink materials ---------- */
// fill: flat colour, pen hatching where it turns away from the light, slightly wobbly strokes
const fill = (color, hatch = 0.85) => new THREE.ShaderMaterial({
  uniforms: { col: { value: new THREE.Color(color) }, ink: { value: new THREE.Color(INK) }, boil: BOIL, hatch: { value: hatch } },
  vertexShader: `varying vec3 vN; varying vec3 vP;
    void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 col; uniform vec3 ink; uniform float boil; uniform float hatch; varying vec3 vN; varying vec3 vP;
    void main(){
      vec3 L = normalize(vec3(-0.45, 0.75, 0.55));
      float d = dot(normalize(vN), L);
      vec2 f = gl_FragCoord.xy;
      float wob = sin(f.y * 0.09 + boil * 2.3) * 1.6 + sin(f.x * 0.05 + boil) * 1.2;
      float s1 = abs(fract((f.x + f.y + wob) / 7.0) - 0.5);
      float s2 = abs(fract((f.x - f.y - wob) / 7.0) - 0.5);
      float a = 0.0;
      if (d < -0.02) a = max(a, smoothstep(0.17, 0.08, s1));
      if (d < -0.38) a = max(a, smoothstep(0.17, 0.08, s2));
      // a few loose strokes break up the edge of the shadow like a pen would
      float edge = smoothstep(0.12, 0.05, s1) * step(0.05, d) * step(d, 0.14) * step(0.5, fract(sin(floor((f.x+f.y)/7.0)*12.9898 + boil)*43758.5));
      a = max(a, edge);
      gl_FragColor = vec4(mix(col, ink, a * hatch), 1.0);
      #include <colorspace_fragment>
    }`
});
// outline: inverted hull, thickness varies along the stroke and "boils"
const outline = (w) => new THREE.ShaderMaterial({
  uniforms: { w: { value: w }, c: { value: new THREE.Color(INK) }, boil: BOIL }, side: THREE.BackSide,
  vertexShader: `uniform float w; uniform float boil;
    float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)) + boil * 1.7) * 43758.5453); }
    void main(){
      vec3 q = floor(position * 9.0);
      float n = mix(h(q), h(q + 1.0), 0.5);
      float k = 0.72 + 0.6 * n;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * w * k, 1.0);
    }`,
  fragmentShader: `uniform vec3 c; void main(){ gl_FragColor = vec4(c,1.0);
      #include <colorspace_fragment>
    }`
});
const M = { paper: fill(PAPER, 0), orange: fill(ORANGE, 0), ink: fill(INK, 0), green: fill(0x2E4A36, 0), cream: fill(CREAM, 0) };
const OUT = outline(0.05), OUT_T = outline(0.032);
const isLine = (m) => m === OUT || m === OUT_T;
function part(geo, mat, out = OUT) { const g = new THREE.Group(); const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); if (out) g.add(new THREE.Mesh(geo, out)); return g; }
function bone(len, r, mat = M.paper, out = OUT) { const geo = new THREE.CapsuleGeometry(r, len, 6, 16); geo.translate(0, -len / 2, 0); return part(geo, mat, out); }
const taper = (len, r0, r1, mat, out = OUT, y0 = 0) => { const g = new THREE.CylinderGeometry(r0, r1, len, 20, 1, false); g.translate(0, y0 - len / 2, 0); return part(g, mat, out); };

/* ---------- number plate texture ---------- */
const plateTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(128, 128, 120, 120, 0, 0, 7); g.fill();
  g.lineWidth = 14; g.strokeStyle = '#1B2A20'; g.stroke();
  g.fillStyle = '#1B2A20'; g.font = '900 130px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('42', 128, 138);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
})();

/* ---------- helpers ---------- */
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
// capsule from a to b (static segment)
function seg(a, b, r, mat, out = OUT) {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.CapsuleGeometry(r, len, 6, 14);
  const p = part(g, mat, out); p.position.copy(a).addScaledVector(d, 0.5);
  p.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return p;
}
const extrude = (pts, depth, mat, out = OUT, bevel = 0.05) => {
  const s = new THREE.Shape(); s.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) { const q = pts[i]; q.length === 4 ? s.quadraticCurveTo(...q) : s.lineTo(...q); }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 18 });
  g.translate(0, 0, -depth / 2); g.computeVertexNormals(); return part(g, mat, out);
};

/* ---------- shared vehicle parts ---------- */
const GOLD = fill(0xE9B44C, 0);
function helmet(parent, x, y, z, HR) {
  const headG = new THREE.Group(); headG.position.set(x, y, z); parent.add(headG);
  const k = HR / 0.37;
  headG.add(part(new THREE.SphereGeometry(HR, 34, 24), M.orange, k < 0.8 ? OUT_T : OUT));
  const crest = new THREE.Mesh(new THREE.TorusGeometry(HR + 0.004, 0.035 * k, 8, 40, Math.PI * 1.15), M.paper); crest.rotation.z = 0.55; headG.add(crest);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(HR + 0.012 * k, 36, 20, -0.95, 1.9, Math.PI * 0.36, Math.PI * 0.2), M.paper); visor.rotation.y = Math.PI; headG.add(visor);
  const rim = new THREE.Mesh(new THREE.SphereGeometry(HR + 0.006 * k, 36, 20, -1.02, 2.04, Math.PI * 0.34, Math.PI * 0.24), M.ink); rim.rotation.y = Math.PI; headG.add(rim);
  const WHITE = new THREE.MeshBasicMaterial({ color: PAPER });
  const eyes = [];
  for (const s of [1, -1]) {
    const e = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), M.ink); ball.scale.set(0.07 * k, 0.085 * k, 0.03 * k); e.add(ball);
    const sl = new THREE.Mesh(new THREE.CircleGeometry(1, 16), WHITE); sl.scale.set(0.012 * k, 0.03 * k, 1); sl.position.set(0.01 * k * s, 0.006 * k, 0.032 * k); e.add(sl);
    const yy = THREE.MathUtils.degToRad(22 * s), p = THREE.MathUtils.degToRad(7);
    const d = V(Math.cos(p) * Math.cos(yy), Math.sin(p), Math.cos(p) * Math.sin(yy));
    e.position.copy(d).multiplyScalar(HR + 0.012 * k); e.quaternion.setFromUnitVectors(V(0, 0, 1), d); headG.add(e); eyes.push(e);
  }
  return { headG, eyes };
}
// wheel: ink tyre, white face, three spokes, valve dots; knobs for gravel, orange sidewall ring for racing
function wheel(parent, x, y, z, R, w, opt = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const tyre = new THREE.CylinderGeometry(R, R, w, 40); tyre.rotateX(Math.PI / 2); g.add(part(tyre, M.ink, OUT));
  const spin = new THREE.Group(); g.add(spin);
  const fr = opt.face ?? 0.6;
  const face = new THREE.CylinderGeometry(R * fr, R * fr, w + 0.02, 30); face.rotateX(Math.PI / 2); spin.add(part(face, M.paper, OUT_T));
  for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(R * fr * 1.9, R * 0.08, w + 0.05), M.ink); s.rotation.z = i * Math.PI / 3; spin.add(s); }
  const hub = new THREE.CylinderGeometry(R * 0.16, R * 0.16, w + 0.08, 18); hub.rotateX(Math.PI / 2); spin.add(new THREE.Mesh(hub, M.ink));
  for (const s of [1, -1]) { const v = new THREE.Mesh(new THREE.SphereGeometry(R * 0.08, 12, 10), M.orange); v.position.set(R * fr * 0.72, 0, s * (w / 2 + 0.02)); spin.add(v); }
  if (opt.ring) for (const s of [1, -1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(R * 0.8, R * 0.045, 6, 40), M.orange); r.position.z = s * (w / 2 + 0.005); g.add(r); }
  if (opt.knobs) for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const kb = new THREE.Mesh(new THREE.BoxGeometry(R * 0.2, R * 0.12, w + 0.02), M.ink); kb.position.set(Math.cos(a) * (R + 0.015), Math.sin(a) * (R + 0.015), 0); kb.rotation.z = a; spin.add(kb); }
  return spin;
}
const shapeOf = (fn) => { const s = new THREE.Shape(); fn(s); return s; };
function extrudeShape(shape, depth, mat, out = OUT, bevel = 0.05) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 24 });
  g.translate(0, 0, -depth / 2); g.computeVertexNormals(); return part(g, mat, out);
}
const box = (w, h, d, mat, out = OUT_T) => part(new THREE.BoxGeometry(w, h, d), mat, out);
function roundel(parent, x, y, z, r, flip) { const pl = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ map: plateTex })); pl.position.set(x, y, z); if (flip) pl.rotation.y = Math.PI; parent.add(pl); return pl; }
function clouds(parent, n, r) { const a = []; for (let i = 0; i < n; i++) { const c = part(new THREE.SphereGeometry(r, 16, 12), M.paper, OUT_T); parent.add(c); a.push(c); } return a; }

/* ---------- the race car (faces +X) ---------- */
function makeRunner() {
  const root = new THREE.Group();
  const drift = new THREE.Group(); root.add(drift);
  const RX = -1.4, FX = 1.38;
  const wheels = [
    wheel(drift, RX, 0.44, 0.82, 0.44, 0.52, { ring: true, face: 0.55 }), wheel(drift, RX, 0.44, -0.82, 0.44, 0.52, { ring: true, face: 0.55 }),
    wheel(drift, FX, 0.38, 0.8, 0.38, 0.42, { ring: true, face: 0.55 }), wheel(drift, FX, 0.38, -0.8, 0.38, 0.42, { ring: true, face: 0.55 }),
  ];
  const body = new THREE.Group(); drift.add(body);
  // monocoque tub + nose
  body.add(extrudeShape(shapeOf((s) => { s.moveTo(2.0, 0.28); s.lineTo(2.02, 0.4); s.quadraticCurveTo(1.2, 0.5, 0.4, 0.66); s.quadraticCurveTo(0.1, 0.8, -0.4, 0.84); s.lineTo(-1.2, 0.76); s.lineTo(-1.62, 0.5); s.lineTo(-1.58, 0.26); s.lineTo(2.0, 0.28); }), 0.56, M.orange, OUT, 0.07));
  // sidepods with dark intakes
  body.add(extrudeShape(shapeOf((s) => { s.moveTo(0.32, 0.26); s.lineTo(0.36, 0.6); s.quadraticCurveTo(-0.3, 0.74, -1.1, 0.6); s.lineTo(-1.3, 0.28); s.lineTo(0.32, 0.26); }), 1.2, M.orange, OUT, 0.08));
  for (const s of [1, -1]) { const it = box(0.05, 0.22, 0.32, M.ink); it.position.set(0.41, 0.44, 0.44 * s); body.add(it); }
  // engine cover + airbox
  body.add(extrudeShape(shapeOf((s) => { s.moveTo(-0.2, 0.8); s.lineTo(-0.26, 1.22); s.quadraticCurveTo(-0.4, 1.3, -0.56, 1.24); s.lineTo(-1.42, 0.72); s.lineTo(-0.9, 0.7); s.lineTo(-0.2, 0.8); }), 0.32, M.orange, OUT, 0.05));
  const ab = box(0.05, 0.16, 0.22, M.ink); ab.position.set(-0.24, 1.13, 0); body.add(ab);
  // cockpit opening, halo, mirrors
  const pit = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), M.ink); pit.scale.set(0.42, 0.06, 0.26); pit.position.set(0.0, 0.84, 0); body.add(pit);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 32), M.ink); halo.rotation.x = Math.PI / 2; halo.position.set(-0.04, 1.17, 0); body.add(halo);
  body.add(seg(V(0.26, 1.17, 0), V(0.42, 0.72, 0), 0.035, M.ink, null));
  for (const s of [1, -1]) { body.add(seg(V(0.38, 0.68, 0.24 * s), V(0.42, 0.86, 0.36 * s), 0.015, M.ink, null)); const mr = box(0.03, 0.08, 0.14, M.ink); mr.position.set(0.42, 0.88, 0.38 * s); body.add(mr); }
  // pilot
  const { headG, eyes } = helmet(body, -0.06, 1.0, 0, 0.24);
  // front + rear wings
  const fw = box(0.42, 0.05, 1.72, M.orange, OUT_T); fw.position.set(1.92, 0.2, 0); body.add(fw);
  const fw2 = box(0.26, 0.04, 1.6, M.ink); fw2.position.set(1.84, 0.29, 0); fw2.rotation.z = 0.25; body.add(fw2);
  for (const s of [1, -1]) { const ep = box(0.46, 0.2, 0.04, M.paper); ep.position.set(1.9, 0.27, 0.88 * s); body.add(ep); }
  const rw = box(0.44, 0.07, 1.42, M.orange, OUT_T); rw.position.set(-1.76, 1.16, 0); body.add(rw);
  const rw2 = box(0.3, 0.05, 1.38, M.ink); rw2.position.set(-1.84, 1.29, 0); rw2.rotation.z = -0.3; body.add(rw2);
  for (const s of [1, -1]) { const ep = box(0.62, 0.48, 0.04, M.paper); ep.position.set(-1.78, 1.1, 0.73 * s); body.add(ep); }
  body.add(seg(V(-1.45, 0.62, 0), V(-1.7, 1.12, 0), 0.04, M.ink, null));
  // suspension wishbones
  for (const s of [1, -1]) for (const [x, wx, y] of [[1.1, FX, 0.42], [-1.15, RX, 0.46]]) {
    body.add(seg(V(x, y + 0.08, 0.26 * s), V(wx, y, 0.62 * s), 0.02, M.ink, null));
    body.add(seg(V(x + 0.2, y - 0.04, 0.24 * s), V(wx, y - 0.02, 0.62 * s), 0.02, M.ink, null));
  }
  // roundels
  for (const s of [1, -1]) { roundel(body, 1.02, 0.46, 0.355 * s, 0.11, s < 0); roundel(body, -0.82, 0.92, 0.215 * s, 0.13, s < 0); }
  // exhaust flame
  const flame = new THREE.Group(); flame.position.set(-1.64, 0.6, 0); body.add(flame);
  const c1 = new THREE.ConeGeometry(0.11, 0.5, 16); c1.translate(0, 0.25, 0); c1.rotateZ(Math.PI / 2); flame.add(part(c1, M.orange, OUT_T));
  const c2 = new THREE.ConeGeometry(0.06, 0.3, 12); c2.translate(0, 0.15, 0); c2.rotateZ(Math.PI / 2); const in2 = new THREE.Mesh(c2, GOLD); in2.position.x = -0.02; flame.add(in2);

  function pose(t) {
    for (const w of wheels) w.rotation.z = -t * 24;
    drift.position.x = 0; // stays on its spot on the route
    body.position.y = 0.012 * Math.sin(t * 95); body.rotation.z = 0.006 * Math.sin(t * 31);
    flame.scale.set(0.7 + 0.55 * Math.abs(Math.sin(t * 37)), 0.85 + 0.3 * Math.abs(Math.sin(t * 23)), 1);
    headG.rotation.z = 0.04 * Math.sin(t * 2.3); headG.rotation.y = 0.12 * Math.sin(t * 0.9);
    const blink = (t % 3.84) > 3.66; for (const e of eyes) e.scale.y = blink ? 0.15 : 1;
  }
  return { root, pose };
}


  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(256, 256, false);
  const scene = new THREE.Scene();
  const { root, pose } = makeRunner(); scene.add(root);
  const camera = new THREE.OrthographicCamera(-2.9, 2.9, 3.75, -2.05, 0.1, 100);
  let previewFramed = false;
  let lastColor = null;
  function render(timeMs, heading, mapBearing, pitch, color, preview = false) {
    if (preview && !previewFramed) {
      // Give the turning character room on every side without changing map framing.
      const extent = 3.3;
      camera.left = -extent; camera.right = extent;
      camera.bottom = -extent + (-0.25); camera.top = extent + (-0.25);
      camera.updateProjectionMatrix();
      previewFramed = true;
    }
    M.orange.uniforms.col.value.set(color || ORANGE);

    lastColor = color;
    const t = Math.max(0, timeMs) / 1000;
    BOIL.value = Math.floor(t * 8) % 3;
    pose(Math.floor(t * 12) / 12);
    root.rotation.y = Math.PI / 2 - THREE.MathUtils.degToRad(heading);
    const bearing = THREE.MathUtils.degToRad(mapBearing);
    const inclination = THREE.MathUtils.degToRad(Math.max(1, Math.min(85, pitch)));
    camera.position.set(-8 * Math.sin(bearing) * Math.sin(inclination), 8 * Math.cos(inclination) + 1, 8 * Math.cos(bearing) * Math.sin(inclination));
    camera.up.set(0, 1, 0); camera.lookAt(0, 1, 0); renderer.render(scene, camera);
  }
  function dispose() {
    const geometries = new Set(), materials = new Set();
    root.traverse(obj => { if (obj.geometry) geometries.add(obj.geometry); if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => materials.add(m)); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    plateTex.dispose(); renderer.dispose();
  }
  return { render, dispose };
}
