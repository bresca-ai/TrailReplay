// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- Procedural model adapted from JavaScript source.
// @ts-nocheck
/* eslint-disable */
// Adapted from the user's procedural 3D model.
import * as THREE from 'three';

function buildModel(canvas: HTMLCanvasElement | null) {


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

const LENSM = new THREE.MeshBasicMaterial({ color: 0xDCE8EC });
function tube(points, r, mat, out = OUT_T) { const c = new THREE.CatmullRomCurve3(points); return part(new THREE.TubeGeometry(c, 40, r, 10, false), mat, out); }
// eyes drawn like the icon, placed on a sphere of radius r around a head group
function iconEyes(g, r, yaw = 24, pitch = 4, lift = 0.03, k = 1) {
  const WHITE = new THREE.MeshBasicMaterial({ color: PAPER }); const eyes = [];
  for (const s of [1, -1]) {
    const e = new THREE.Group(); const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), M.ink); ball.scale.set(0.06 * k, 0.08 * k, 0.028 * k); e.add(ball);
    const sl = new THREE.Mesh(new THREE.CircleGeometry(1, 16), WHITE); sl.scale.set(0.011 * k, 0.026 * k, 1); sl.position.set(0.009 * k * s, 0.007 * k, 0.03 * k); e.add(sl);
    const y = THREE.MathUtils.degToRad(yaw * s), p = THREE.MathUtils.degToRad(pitch); const d = V(Math.cos(p) * Math.cos(y), Math.sin(p), Math.cos(p) * Math.sin(y));
    e.position.copy(d).multiplyScalar(r + lift); e.quaternion.setFromUnitVectors(V(0, 0, 1), d); g.add(e); eyes.push(e);
  }
  return eyes;
}
const band = (r, w, mat, open = true) => new THREE.Mesh(new THREE.SphereGeometry(r, 40, 6, -1.15, 2.3, Math.PI * (0.5 - w), Math.PI * w * 2), mat);
/* ---------- motocross bike + rider standing on the pegs (faces +X) ---------- */
function makeRunner() {
  const root = new THREE.Group();
  const KIT = M.orange;
  const RW = V(-1.0, 0.5), FW = V(1.12, 0.53);
  const wheelsG = new THREE.Group(); root.add(wheelsG);
  const wheels = [wheel(wheelsG, RW.x, RW.y, 0, 0.5, 0.3, { knobs: true, face: 0.72 }), wheel(wheelsG, FW.x, FW.y, 0, 0.53, 0.24, { knobs: true, face: 0.74 })];
  const body = new THREE.Group(); root.add(body);
  // chassis: frame rails, engine, skid plate, swing arm, rear shock with a spring in the track colour
  body.add(seg(V(-0.1, 0.82), RW, 0.055, M.ink));
  const eng = part(new THREE.BoxGeometry(0.56, 0.44, 0.32), M.green); eng.position.set(0.08, 0.88, 0); body.add(eng);
  for (const y of [0.8, 0.9, 1.0]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.022, 0.34), M.ink); f.position.set(0.1, y, 0); body.add(f); }
  const skid = box(0.6, 0.06, 0.34, M.ink); skid.position.set(0.1, 0.62, 0); body.add(skid);
  body.add(seg(V(0.62, 1.55), V(0.35, 0.72), 0.045, M.ink, OUT_T)); body.add(seg(V(0.6, 1.5), V(-0.3, 1.42), 0.04, M.ink, OUT_T));
  for (let k = 0; k < 7; k++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 6, 14), KIT); c.position.set(-0.38 - k * 0.025, 1.38 - k * 0.07, 0); c.rotation.x = Math.PI / 2; c.rotation.z = 0.3; body.add(c); }
  body.add(seg(V(-0.36, 1.42), V(-0.56, 0.86), 0.03, M.ink, OUT_T));
  // fork: gold stanchions into dark lowers, triple clamp
  for (const s of [1, -1]) { body.add(seg(V(0.66, 1.66, 0.13 * s), V(0.9, 1.08, 0.13 * s), 0.05, fill(0xE9B44C, 0), OUT_T)); body.add(seg(V(0.88, 1.12, 0.13 * s), V(FW.x, FW.y, 0.13 * s), 0.065, M.ink, OUT_T)); }
  const clamp = box(0.12, 0.08, 0.36, M.ink); clamp.position.set(0.66, 1.66, 0); body.add(clamp);
  // bodywork in the track colour: shrouds/tank, side plates, high rear fender, high front fender
  body.add(extrudeShape(shapeOf((s) => { s.moveTo(0.66, 1.56); s.lineTo(0.34, 1.66); s.lineTo(-0.12, 1.52); s.lineTo(-0.18, 1.26); s.lineTo(0.3, 1.14); s.lineTo(0.64, 1.26); s.lineTo(0.66, 1.56); }), 0.48, KIT, OUT, 0.05));
  body.add(extrudeShape(shapeOf((s) => { s.moveTo(-0.92, 1.5); s.lineTo(-0.28, 1.5); s.lineTo(-0.44, 1.12); s.lineTo(-0.92, 1.24); s.lineTo(-0.92, 1.5); }), 0.38, M.paper, OUT, 0.04));
  for (const s of [1, -1]) roundel(body, -0.6, 1.33, 0.235 * s, 0.13, s < 0);
  body.add(extrudeShape(shapeOf((s) => { s.moveTo(-0.9, 1.52); s.lineTo(-1.66, 1.78); s.lineTo(-1.7, 1.7); s.lineTo(-0.96, 1.44); s.lineTo(-0.9, 1.52); }), 0.3, KIT, OUT_T, 0.03));
  body.add(extrudeShape(shapeOf((s) => { s.moveTo(0.72, 1.28); s.quadraticCurveTo(1.2, 1.24, 1.64, 1.12); s.lineTo(1.62, 1.05); s.quadraticCurveTo(1.2, 1.13, 0.74, 1.18); s.lineTo(0.72, 1.28); }), 0.24, KIT, OUT_T, 0.03));
  // long flat seat
  body.add(extrudeShape(shapeOf((s) => { s.moveTo(-1.08, 1.52); s.lineTo(0.02, 1.56); s.quadraticCurveTo(0.12, 1.64, 0.0, 1.66); s.lineTo(-1.02, 1.62); s.lineTo(-1.08, 1.52); }), 0.28, M.ink, OUT_T, 0.03));
  // front number plate facing forward
  const fp = extrudeShape(shapeOf((s) => { s.absellipse(0, 0, 0.2, 0.16, 0, Math.PI * 2); }), 0.03, M.paper, OUT_T, 0.01); fp.rotation.y = Math.PI / 2; fp.position.set(0.76, 1.55, 0); fp.rotation.x = 0; body.add(fp);
  const fpn = new THREE.Mesh(new THREE.CircleGeometry(0.15, 28), new THREE.MeshBasicMaterial({ map: plateTex })); fpn.rotation.y = Math.PI / 2; fpn.rotation.z = 0; fpn.position.set(0.79, 1.55, 0); body.add(fpn);
  // bars with crossbar pad, grips, levers
  body.add(seg(V(0.66, 1.7), V(0.64, 1.84), 0.03, M.ink, OUT_T));
  body.add(tube([V(0.62, 1.84, -0.44), V(0.64, 1.88, -0.2), V(0.64, 1.88, 0.2), V(0.62, 1.84, 0.44)], 0.024, M.ink));
  const pad = part(new THREE.CapsuleGeometry(0.04, 0.22, 4, 10), KIT, OUT_T); pad.rotation.x = Math.PI / 2; pad.position.set(0.64, 1.92, 0); body.add(pad);
  // exhaust silencer up high on the near side
  body.add(seg(V(0.3, 0.9, 0.2), V(-0.3, 1.12, 0.26), 0.05, M.cream, OUT_T));
  body.add(seg(V(-0.3, 1.14, 0.26), V(-1.12, 1.42, 0.26), 0.095, M.cream, OUT));
  // rider standing on the pegs: elbows up, knees gripping, weight back
  const rider = new THREE.Group(); body.add(rider);
  const J = KIT, PANT = M.paper;
  for (const s of [1, -1]) {
    const z = s;
    rider.add(seg(V(-0.22, 0.8, 0.3 * z), V(0.12, 0.78, 0.3 * z), 0.095, M.paper));          // boot
    for (const y of [0.92, 1.04]) { const bk = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.24), M.ink); bk.position.set(-0.04, y, 0.3 * z); rider.add(bk); }
    rider.add(seg(V(-0.08, 0.82, 0.3 * z), V(0.02, 1.16, 0.29 * z), 0.11, M.paper));          // boot shaft
    rider.add(seg(V(0.02, 1.12, 0.29 * z), V(0.2, 1.36, 0.27 * z), 0.11, PANT));              // shin
    const kp = part(new THREE.SphereGeometry(0.12, 14, 12), J, OUT_T); kp.position.set(0.21, 1.36, 0.27 * z); rider.add(kp);
    rider.add(seg(V(0.2, 1.36, 0.27 * z), V(-0.38, 1.74, 0.18 * z), 0.13, PANT));             // thigh
    const tp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.02), J); tp.position.set(-0.08, 1.56, 0.31 * z); tp.rotation.z = -0.58; rider.add(tp);
    rider.add(seg(V(0.04, 2.14, 0.27 * z), V(0.3, 1.98, 0.5 * z), 0.1, J));                    // upper arm, elbows up
    rider.add(seg(V(0.3, 1.98, 0.5 * z), V(0.6, 1.86, 0.42 * z), 0.09, J));                    // forearm
    rider.add(seg(V(0.08, 2.18, 0.31 * z), V(0.3, 2.04, 0.55 * z), 0.03, M.ink, null));
    const glove = part(new THREE.SphereGeometry(0.085, 14, 12), M.ink, OUT_T); glove.position.set(0.62, 1.85, 0.42 * z); rider.add(glove);
  }
  const torso = seg(V(-0.36, 1.76), V(0.06, 2.2), 0.27, J); rider.add(torso);
  const num = new THREE.Mesh(new THREE.CircleGeometry(0.13, 28), new THREE.MeshBasicMaterial({ map: plateTex })); num.position.set(-0.24, 2.0, 0); num.rotation.y = -Math.PI / 2; num.rotateX(0.7); rider.add(num);
  const neck = part(new THREE.TorusGeometry(0.17, 0.06, 8, 24), M.ink, OUT_T); neck.rotation.x = Math.PI / 2; neck.rotation.y = -0.6; neck.position.set(0.1, 2.24, 0); rider.add(neck);
  // MX helmet: long shell with side graphics, pointed chin bar with vents, vented peak, framed goggles over a dark eye port
  const hg = new THREE.Group(); hg.position.set(0.36, 2.52, 0); hg.rotation.z = -0.2; rider.add(hg);
  const HR = 0.3;
  const shellG = new THREE.SphereGeometry(HR, 36, 26); shellG.scale(1.14, 1.0, 0.98);
  hg.add(part(shellG, M.paper));
  // side graphics: white swoosh + number roundel, a dark rear spoiler lip
  for (const s of [1, -1]) {
    const sw = new THREE.Mesh(new THREE.TorusGeometry(HR + 0.004, 0.022, 6, 40, Math.PI * 0.75), M.orange); sw.position.z = 0.0; sw.rotation.set(0, 0, 0.55); sw.scale.set(1.14, 1, 1); const swg = new THREE.Group(); swg.rotation.x = 0.55 * s; swg.add(sw); hg.add(swg);
    const n = new THREE.Mesh(new THREE.CircleGeometry(0.085, 24), new THREE.MeshBasicMaterial({ map: plateTex })); n.position.set(-0.1, 0.02, 0.29 * s); if (s < 0) n.rotation.y = Math.PI; hg.add(n);
  }
  const lip = extrudeShape(shapeOf((q) => { q.moveTo(0, 0); q.lineTo(0.12, 0.05); q.lineTo(0.0, 0.1); q.lineTo(0, 0); }), 0.26, M.ink, OUT_T, 0.01); lip.position.set(-0.36, -0.06, 0); lip.rotation.z = Math.PI; hg.add(lip);
  // dark eye port around the goggles
  const port = band(HR * 1.12 + 0.012, 0.1, M.ink); port.rotation.y = Math.PI; port.scale.set(1, 1, 0.98); port.position.y = 0.03; hg.add(port);
  // pointed chin bar: track colour, white top stripe, three vents + breath grill
  const chin = extrudeShape(shapeOf((q) => { q.moveTo(0.14, -0.04); q.quadraticCurveTo(0.36, -0.06, 0.48, -0.14); q.lineTo(0.52, -0.24); q.quadraticCurveTo(0.46, -0.34, 0.3, -0.36); q.lineTo(0.08, -0.3); q.lineTo(0.14, -0.04); }), 0.3, M.orange, OUT, 0.05);
  hg.add(chin);
  const cs = extrudeShape(shapeOf((q) => { q.moveTo(0.2, -0.06); q.quadraticCurveTo(0.36, -0.08, 0.47, -0.15); q.lineTo(0.48, -0.18); q.quadraticCurveTo(0.36, -0.11, 0.2, -0.09); q.lineTo(0.2, -0.06); }), 0.38, M.ink, null, 0.0); hg.add(cs);
  for (const dz of [-0.09, 0, 0.09]) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.04), M.ink); v.position.set(0.555, -0.24, dz); v.rotation.z = 0.35; hg.add(v); }
  const grill = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.2), M.ink); grill.position.set(0.5, -0.31, 0); grill.rotation.z = -0.5; hg.add(grill);
  // vented peak with a centre ridge and screws
  const peak = extrudeShape(shapeOf((q) => { q.moveTo(-0.24, 0); q.quadraticCurveTo(0, 0.05, 0.24, 0); q.lineTo(0.2, 0.4); q.quadraticCurveTo(0, 0.46, -0.2, 0.4); q.lineTo(-0.24, 0); }), 0.025, M.orange, OUT_T, 0.012);
  peak.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); peak.position.set(0.16, 0.25, 0); peak.rotateX(-0.22); hg.add(peak);
  const pgr = new THREE.Group(); pgr.position.set(0.16, 0.25, 0); pgr.rotation.z = -0.22; hg.add(pgr);
  pgr.add(seg(V(0.04, 0.03, 0), V(0.4, 0.02, 0), 0.018, M.paper, null));
  for (const dz of [-0.11, 0.11]) { const sl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.03), M.ink); sl.position.set(0.22, 0.03, dz); pgr.add(sl); }
  for (const s of [1, -1]) { const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 10), M.ink); sc.rotation.x = Math.PI / 2; sc.position.set(-0.02, 0.18, 0.31 * s); hg.add(sc); }
  // goggles: thick foam frame, light lens with a tear-off tab, wide strap in the track colour with white logo marks
  const gy = 0.03, GR = HR * 1.12 + 0.03;
  const gl = band(GR, 0.07, LENSM); gl.rotation.y = Math.PI; gl.position.y = gy; hg.add(gl);
  for (const sgn of [1, -1]) { const fr = band(GR + 0.008, 0.016, M.ink); fr.rotation.y = Math.PI; fr.position.y = gy + sgn * Math.sin(Math.PI * 0.075) * GR; hg.add(fr); }
  for (const s of [1, -1]) { const side = seg(V(Math.cos(1.12) * GR, gy - 0.06, Math.sin(1.12) * GR * s), V(Math.cos(1.12) * GR, gy + 0.06, Math.sin(1.12) * GR * s), 0.03, M.ink, null); hg.add(side); }
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.02), M.paper); tab.position.set(Math.cos(1.05) * (GR + 0.02), gy - 0.02, Math.sin(1.05) * (GR + 0.02)); hg.add(tab);
  const strapG = new THREE.Mesh(new THREE.CylinderGeometry(HR * 1.02 + 0.02, HR * 1.02 + 0.02, 0.07, 44, 1, true), M.ink); strapG.position.y = gy; strapG.scale.set(1.12, 1, 0.98); hg.add(strapG);
  for (const a0 of [2.2, 2.6, 3.0, 3.4, 3.8, 4.2]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.02), M.orange); m.position.set(Math.cos(a0) * (HR * 1.14 + 0.03), gy, Math.sin(a0) * (HR + 0.025)); m.lookAt(0, gy, 0); hg.add(m); }
  const eyes = iconEyes(hg, GR - 0.02, 20, 4, 0.035, 1.25);
  // roost: dirt clouds and clods thrown by the back wheel
  const DUST = fill(0xD8C3A0, 0);
  const puffs = []; for (let i = 0; i < 6; i++) { const c = part(new THREE.SphereGeometry(0.15, 14, 10), DUST, OUT_T); root.add(c); puffs.push(c); }
  const clods = []; for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), M.ink); root.add(b); clods.push(b); }

  function pose(t) {
    for (const w of wheels) w.rotation.z = -t * 13;
    const bump = 0.05 * Math.sin(t * 6.3) + 0.03 * Math.sin(t * 14.1) + 0.012 * Math.sin(t * 80);
    body.position.y = bump; body.rotation.z = 0.02 * Math.sin(t * 4.7);
    rider.position.y = -bump * 0.6 + 0.02 * Math.sin(t * 5.1);       // legs soak up the bumps
    hg.rotation.y = 0.06 * Math.sin(t * 1.4);
    for (const [i, p] of puffs.entries()) { const k = ((t * 1.5 + i / puffs.length) % 1); p.position.set(RW.x - 0.5 - k * 1.7, 0.15 + k * 0.75, (i % 2 ? 1 : -1) * 0.18); const s = Math.sin(Math.min(1, k * 1.1) * Math.PI) * (0.7 + k * 1.5); p.scale.setScalar(Math.max(0.001, s)); }
    for (const [i, b] of clods.entries()) { const k = ((t * 2.2 + i / clods.length) % 1); b.position.set(RW.x - 0.4 - k * 1.6, 0.2 + 1.3 * k - 1.4 * k * k, (i % 2 ? 1 : -1) * (0.1 + 0.04 * i)); b.visible = k < 0.92; b.rotation.set(k * 9, k * 6, 0); }
    const blink = (t % 3.84) > 3.66; for (const e of eyes) e.scale.y = blink ? 0.15 : 1;
  }
  return { root, pose, crew: [rider] };
}



  // Scene-only mode: the marker transition renders this model inside its own stage.



  if (!canvas) return { model: makeRunner(), kit: { part, fill, M, OUT, OUT_T, BOIL } };



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
      const extent = 2.9;
      camera.left = -extent; camera.right = extent;
      camera.bottom = -extent + (0.12); camera.top = extent + (0.12);
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

export function createRunnerRenderer(canvas: HTMLCanvasElement): {
  render: (timeMs: number, heading: number, mapBearing: number, pitch: number, color?: string, preview?: boolean) => void;
  dispose: () => void;
} {
  return buildModel(canvas);
}

/** The model on its own (no renderer), for the marker transition stage. */
export function createModelScene() {
  return buildModel(null);
}
