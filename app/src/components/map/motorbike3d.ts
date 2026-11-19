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

/* ---------- the motorbike + rider (faces +X) ---------- */
function makeRunner() {
  const root = new THREE.Group();
  const RW = V(-0.98, 0.5), FW = V(1.02, 0.5), WR = 0.5;
  const tilt = new THREE.Group(); tilt.position.set(RW.x, 0, 0); root.add(tilt);   // wheelie pivot: rear contact patch
  const bike = new THREE.Group(); bike.position.set(-RW.x, 0, 0); tilt.add(bike);

  // wheels: fat ink tyre, white rim, three spokes, hub and an orange valve dot so the spin reads
  const wheels = [];
  for (const W of [RW, FW]) {
    const w = new THREE.Group(); w.position.copy(W); bike.add(w);
    w.add(part(new THREE.TorusGeometry(WR - 0.12, 0.13, 16, 40), M.ink, OUT));
    const spin = new THREE.Group(); w.add(spin);
    const rim = new THREE.CylinderGeometry(0.33, 0.33, 0.1, 32); rim.rotateX(Math.PI / 2); spin.add(part(rim, M.paper, OUT_T));
    for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.035, 0.12), M.ink); s.rotation.z = k * Math.PI / 3; spin.add(s); }
    const hub = new THREE.CylinderGeometry(0.075, 0.075, 0.2, 18); hub.rotateX(Math.PI / 2); spin.add(new THREE.Mesh(hub, M.ink));
    const valve = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), M.orange); valve.position.set(0.25, 0, 0.06); spin.add(valve);
    wheels.push(spin);
  }

  // chassis bounces on its suspension above the wheels
  const body = new THREE.Group(); bike.add(body);
  body.add(seg(V(RW.x, RW.y, 0), V(-0.2, 0.78, 0), 0.06, M.ink));                                 // swing arm
  for (const z of [0.16, -0.16]) body.add(seg(V(0.62, 1.38, z), V(FW.x, FW.y, z), 0.055, M.cream, OUT_T));   // fork legs
  const engine = part(new THREE.BoxGeometry(0.62, 0.42, 0.38), M.green); engine.position.set(0.12, 0.72, 0); body.add(engine);
  for (const y of [0.66, 0.76, 0.86]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.025, 0.4), M.ink); fin.position.set(0.14, y, 0); body.add(fin); }
  // exhaust: header pipe + muffler
  body.add(seg(V(0.35, 0.62, 0.2), V(-0.3, 0.5, 0.26), 0.05, M.cream, OUT_T));
  body.add(seg(V(-0.3, 0.5, 0.26), V(-1.05, 0.82, 0.26), 0.05, M.cream, OUT_T));
  const muff = seg(V(-0.75, 0.7, 0.27), V(-1.3, 0.92, 0.27), 0.1, M.cream, OUT); body.add(muff);
  // tank + side fairing, tail, seat
  body.add(extrude([[-0.38, 0.86], [0.5, 0.82], [0.78, 1.08], [0.72, 1.32, 0.45, 1.36], [-0.02, 1.27], [-0.4, 1.12]], 0.36, M.orange));
  body.add(extrude([[-1.36, 1.2], [-0.95, 1.0], [-0.38, 1.0], [-0.45, 1.18]], 0.26, M.orange, OUT, 0.04));
  body.add(extrude([[-1.02, 1.17], [-0.06, 1.24], [0.0, 1.33, -0.14, 1.35], [-0.88, 1.31], [-1.08, 1.29, -1.02, 1.17]], 0.3, M.ink, OUT, 0.04));
  for (const s of [1, -1]) { const pl = new THREE.Mesh(new THREE.CircleGeometry(0.17, 32), new THREE.MeshBasicMaterial({ map: plateTex })); pl.position.set(0.18, 1.04, 0.233 * s); if (s < 0) pl.rotation.y = Math.PI; body.add(pl); }
  // headlight, windscreen, bars
  const lamp = part(new THREE.SphereGeometry(0.13, 20, 16), M.cream, OUT); lamp.position.set(0.86, 1.22, 0); lamp.scale.set(0.8, 1, 1); body.add(lamp);
  body.add(extrude([[0.72, 1.36], [0.92, 1.36], [0.84, 1.66], [0.74, 1.64]], 0.3, M.paper, OUT_T, 0.02));
  body.add(seg(V(0.6, 1.34, 0), V(0.56, 1.56, 0), 0.04, M.ink, OUT_T));
  body.add(seg(V(0.52, 1.56, 0.38), V(0.52, 1.56, -0.38), 0.035, M.ink, OUT_T));
  for (const s of [1, -1]) body.add(seg(V(0.52, 1.56, 0.34 * s), V(0.52, 1.56, 0.42 * s), 0.05, M.ink, OUT_T));

  // rider: green jacket, ink boots and gloves, orange full-face helmet with a white visor showing the icon's eyes
  const rider = new THREE.Group(); body.add(rider);
  const hipC = V(-0.42, 1.4), neck = V(0.08, 1.98);
  const torso = seg(hipC, neck, 0.25, M.green); torso.scale.set(1, 1, 0.9); rider.add(torso);
  const stripe = seg(V(-0.3, 1.58, 0), V(0.02, 1.95, 0), 0.255, M.orange, null); stripe.scale.set(0.2, 1, 0.92); rider.add(stripe);
  for (const s of [1, -1]) {
    const z = 0.17 * s;
    rider.add(seg(V(-0.4, 1.38, z), V(0.14, 1.2, 0.25 * s), 0.11, M.green));        // thigh
    rider.add(seg(V(0.14, 1.2, 0.25 * s), V(-0.04, 0.78, 0.27 * s), 0.1, M.green));  // shin
    rider.add(seg(V(-0.06, 0.74, 0.27 * s), V(0.14, 0.72, 0.27 * s), 0.08, M.ink));  // boot
    rider.add(seg(V(0.04, 1.86, 0.22 * s), V(0.34, 1.7, 0.3 * s), 0.09, M.green));   // upper arm
    rider.add(seg(V(0.34, 1.7, 0.3 * s), V(0.5, 1.56, 0.34 * s), 0.08, M.green));    // forearm
    const glove = part(new THREE.SphereGeometry(0.085, 16, 12), M.ink, OUT_T); glove.position.set(0.52, 1.56, 0.34 * s); rider.add(glove);
  }
  const headG = new THREE.Group(); headG.position.set(0.26, 2.24, 0); rider.add(headG);
  const HR = 0.37;
  headG.add(part(new THREE.SphereGeometry(HR, 34, 24), M.orange));
  const crest = new THREE.Mesh(new THREE.TorusGeometry(HR + 0.004, 0.035, 8, 40, Math.PI * 1.15), M.paper); crest.rotation.z = 0.55; headG.add(crest);
  const onHead = (obj, yaw, pitch, lift = 0) => { const y = THREE.MathUtils.degToRad(yaw), p = THREE.MathUtils.degToRad(pitch); const d = V(Math.cos(p) * Math.cos(y), Math.sin(p), Math.cos(p) * Math.sin(y)); obj.position.copy(d).multiplyScalar(HR + lift); obj.quaternion.setFromUnitVectors(V(0, 0, 1), d); headG.add(obj); return obj; };
  // visor: white rounded window wrapped on the front
  const visor = new THREE.Mesh(new THREE.SphereGeometry(HR + 0.012, 36, 20, -0.95, 1.9, Math.PI * 0.36, Math.PI * 0.2), M.paper); visor.rotation.y = Math.PI; headG.add(visor);
  const visorRim = new THREE.Mesh(new THREE.SphereGeometry(HR + 0.006, 36, 20, -1.02, 2.04, Math.PI * 0.34, Math.PI * 0.24), M.ink); visorRim.rotation.y = Math.PI; headG.add(visorRim);
  const WHITE = new THREE.MeshBasicMaterial({ color: PAPER });
  const eyes = [];
  for (const s of [1, -1]) { const e = new THREE.Group(); const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), M.ink); ball.scale.set(0.07, 0.085, 0.03); e.add(ball); const sl = new THREE.Mesh(new THREE.CircleGeometry(1, 16), WHITE); sl.scale.set(0.012, 0.03, 1); sl.position.set(0.01 * s, 0.006, 0.032); e.add(sl); onHead(e, 22 * s, 7, 0.012); eyes.push(e); }
  // scarf tails flapping from the collar
  const tails = [];
  for (const i of [0, 1]) { const tl = new THREE.Group(); tl.position.set(-0.02, 1.98, 0.06 - 0.12 * i); rider.add(tl); const g = new THREE.BoxGeometry(0.42 - i * 0.1, 0.09, 0.02); g.translate(-(0.42 - i * 0.1) / 2, 0, 0); tl.add(part(g, M.orange, OUT_T)); tails.push(tl); }
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.05, 8, 24), M.orange); scarf.rotation.x = Math.PI / 2; scarf.position.set(0.08, 1.98, 0); rider.add(scarf);

  // exhaust puffs: little outlined clouds that grow then pop
  const puffs = [];
  for (let i = 0; i < 4; i++) { const pf = part(new THREE.SphereGeometry(0.12, 16, 12), M.paper, OUT_T); bike.add(pf); puffs.push(pf); }

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.13, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.005; shadow.visible = false; shadow.scale.set(1.5, 0.42, 1); root.add(shadow);

  function pose(t) {
    for (const w of wheels) w.rotation.z = -t * 13;
    // engine buzz + suspension on bumps
    body.position.y = 0.012 * Math.sin(t * 90) + 0.025 * Math.sin(t * 5.3) * Math.sin(t * 2.1);
    rider.position.y = 0.02 * Math.sin(t * 6.1); rider.rotation.z = 0.02 * Math.sin(t * 3.2);
    headG.rotation.z = 0.04 * Math.sin(t * 4.3); headG.rotation.y = 0.06 * Math.sin(t * 1.3);
    // a little wheelie every 4 s
    const c = t % 4, wl = c < 1.9 ? 0 : c < 2.4 ? (c - 1.9) / 0.5 : c < 3.1 ? 1 : c < 3.5 ? 1 - (c - 3.1) / 0.4 : 0;
    tilt.rotation.z = 0; // no wheelie: both wheels stay on the ground
    for (const [i, tl] of tails.entries()) { tl.rotation.z = -0.25 + 0.2 * Math.sin(t * 21 + i * 1.6); tl.rotation.y = (i ? -0.3 : 0.3) + 0.1 * Math.sin(t * 15 + i); }
    for (const [i, pf] of puffs.entries()) { const k = ((t * 1.3 + i / puffs.length) % 1); pf.position.set(-1.38 - k * 0.9, 0.95 + k * 0.35, 0.27); const s = Math.sin(Math.min(1, k * 1.15) * Math.PI) * (1 + k); pf.scale.setScalar(Math.max(0.001, s)); }
    shadow.scale.set(1.5 - 0.15 * tilt.rotation.z * 5, 0.42, 1);
    const blink = (t % 3.84) > 3.66;
    for (const e of eyes) e.scale.y = blink ? 0.15 : 1;
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
