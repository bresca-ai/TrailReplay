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

/* ---------- the rally car (faces +X) ---------- */
function makeRunner() {
  const root = new THREE.Group();
  const jump = new THREE.Group(); root.add(jump);
  const RX = -1.05, FX = 1.1, WY = 0.44, WR = 0.44, ZW = 0.72;
  const wheelG = new THREE.Group(); jump.add(wheelG);
  const wheels = [];
  for (const x of [RX, FX]) for (const z of [ZW, -ZW]) wheels.push(wheel(wheelG, x, WY, z, WR, 0.32, { knobs: true }));
  const body = new THREE.Group(); jump.add(body);

  // shell with proper wheel arches
  const shell = shapeOf((s) => {
    s.moveTo(-1.62, 0.5); s.lineTo(RX - 0.58, 0.5); s.absarc(RX, 0.5, 0.58, Math.PI, 0, true);
    s.lineTo(FX - 0.58, 0.5); s.absarc(FX, 0.5, 0.58, Math.PI, 0, true);
    s.lineTo(1.62, 0.5); s.lineTo(1.72, 0.8); s.quadraticCurveTo(1.7, 0.98, 1.5, 1.02); s.lineTo(0.6, 1.1); s.lineTo(-1.5, 1.08); s.quadraticCurveTo(-1.68, 1.0, -1.66, 0.84); s.lineTo(-1.62, 0.5);
  });
  body.add(extrudeShape(shell, 1.36, M.orange, OUT, 0.08));
  for (const x of [RX, FX]) for (const s of [1, -1]) { const f = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.07, 8, 28, Math.PI), M.ink); f.position.set(x, 0.5, 0.75 * s); body.add(f); }
  // cage: pillars + roof + spoiler (open windows so you see the driver)
  for (const s of [1, -1]) {
    const z = 0.6 * s;
    body.add(seg(V(0.62, 1.06, z), V(0.1, 1.62, z * 0.95), 0.065, M.orange));
    body.add(seg(V(-0.5, 1.08, z), V(-0.5, 1.62, z * 0.95), 0.065, M.orange));
    body.add(seg(V(-1.45, 1.06, z), V(-1.15, 1.62, z * 0.95), 0.065, M.orange));
  }
  body.add(extrudeShape(shapeOf((s) => { s.moveTo(-1.2, 1.6); s.lineTo(0.16, 1.6); s.lineTo(0.08, 1.7); s.lineTo(-1.15, 1.7); s.lineTo(-1.2, 1.6); }), 1.12, M.orange, OUT, 0.05));
  body.add(extrudeShape(shapeOf((s) => { s.moveTo(-1.38, 1.74); s.lineTo(-0.98, 1.76); s.lineTo(-1.0, 1.84); s.lineTo(-1.4, 1.84); s.lineTo(-1.38, 1.74); }), 1.24, M.ink, OUT_T, 0.03));
  // livery: white stripe, door roundels, bonnet stripe
  for (const s of [1, -1]) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.09, 0.02), M.paper); st.position.set(0.05, 0.96, 0.765 * s); body.add(st);
    roundel(body, -0.15, 0.76, 0.77 * s, 0.19, s < 0);
  }
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.02, 0.22), M.paper); hood.position.set(1.08, 1.075, 0); hood.rotation.z = -0.08; body.add(hood);
  // rally lights, bumpers, mud flaps
  for (const z of [0.42, 0.14, -0.14, -0.42]) { const l = new THREE.CylinderGeometry(0.1, 0.1, 0.07, 20); l.rotateZ(Math.PI / 2); const lp = part(l, M.cream, OUT_T); lp.position.set(1.77, 0.86, z); body.add(lp); }
  body.add(seg(V(1.72, 0.56, 0.66), V(1.72, 0.56, -0.66), 0.06, M.ink, OUT_T));
  body.add(seg(V(-1.68, 0.56, 0.66), V(-1.68, 0.56, -0.66), 0.06, M.ink, OUT_T));
  const flaps = [];
  for (const s of [1, -1]) { const fp = new THREE.Group(); fp.position.set(RX - 0.6, 0.52, ZW * s); const m = box(0.04, 0.34, 0.3, M.ink); m.position.y = -0.17; fp.add(m); body.add(fp); flaps.push(fp); }
  // antenna
  const ant = new THREE.Group(); ant.position.set(-0.95, 1.72, 0.4); body.add(ant);
  ant.add(seg(V(0, 0, 0), V(-0.25, 0.65, 0), 0.015, M.ink, null));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), M.orange); tip.position.set(-0.25, 0.66, 0); ant.add(tip);
  // driver: green suit, gloves on the wheel, orange helmet with the icon's eyes
  const drv = new THREE.Group(); body.add(drv);
  drv.add(box(0.5, 0.5, 0.4, M.ink, OUT_T).translateX(-0.66).translateY(1.15).translateZ(0.3));
  drv.add(seg(V(-0.6, 1.02, 0.3), V(-0.46, 1.36, 0.3), 0.17, M.green));
  for (const dz of [0.12, -0.12]) drv.add(seg(V(-0.46, 1.32, 0.3 + dz), V(0.0, 1.24, 0.3 + dz * 0.8), 0.055, M.green, OUT_T));
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 24), M.ink); sw.position.set(0.04, 1.24, 0.3); sw.rotation.y = Math.PI / 2; sw.rotation.x = 0; sw.rotateX(-0.5); drv.add(sw);
  const { headG, eyes } = helmet(drv, -0.4, 1.52, 0.3, 0.2);
  // dust + gravel
  const puffs = clouds(jump, 5, 0.16);
  const bits = []; for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M.ink); jump.add(b); bits.push(b); }

  function pose(t) {
    for (const w of wheels) w.rotation.z = -t * 15;
    const c = 0; // no jumps: all four wheels stay on the ground
    let hy = 0, rz = 0, squash = 0, droop = 0;
    if (c > 2.0 && c < 2.9) { const k = (c - 2.0) / 0.9; hy = 0.85 * Math.sin(Math.PI * k); rz = 0.11 * (1 - 2 * k); droop = 0.09 * Math.sin(Math.PI * k); }
    if (c >= 2.9 && c < 3.25) squash = 0.13 * Math.sin(Math.PI * (c - 2.9) / 0.35);
    jump.position.y = hy; jump.rotation.z = rz;
    wheelG.position.y = -droop;
    const bump = hy > 0 ? 0 : 0.035 * Math.sin(t * 9.7) + 0.02 * Math.sin(t * 23);
    body.position.y = bump - squash; body.rotation.z = hy > 0 ? 0 : 0.015 * Math.sin(t * 7.3);
    for (const [i, f] of flaps.entries()) f.rotation.z = -0.25 - 0.15 * Math.abs(Math.sin(t * 19 + i));
    ant.rotation.z = 0.22 * Math.sin(t * 13) * (1 + squash * 4);
    headG.position.y = 1.52 + 0.025 * Math.sin(t * 11) - squash * 0.4; headG.rotation.z = 0.05 * Math.sin(t * 6);
    const onGround = hy === 0;
    for (const [i, p] of puffs.entries()) { const k = ((t * 1.4 + i / puffs.length) % 1); p.position.set(RX - 0.55 - k * 1.5, 0.15 + k * 0.55, (i % 2 ? 1 : -1) * 0.6); const s = Math.sin(Math.min(1, k * 1.1) * Math.PI) * (0.8 + k * 1.4); p.scale.setScalar(onGround ? Math.max(0.001, s) : 0.001); }
    for (const [i, b] of bits.entries()) { const k = ((t * 2.1 + i / bits.length) % 1); b.position.set(RX - 0.4 - k * 1.3, 0.12 + 0.9 * k - 1.1 * k * k, (i % 2 ? 1 : -1) * 0.74); b.visible = onGround && k < 0.9; }
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
      const extent = 3.6;
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
