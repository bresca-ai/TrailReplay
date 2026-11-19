// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- Procedural model adapted from JavaScript source.
// @ts-nocheck
/* eslint-disable */
// Adapted from the user's procedural 3D swimmer.
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

/* ---------- race bib texture ---------- */
let drawBib;
const bibTex = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 200; const g = c.getContext('2d');
  drawBib = (hex) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 200);
  g.fillStyle = hex; g.fillRect(0, 0, 256, 44);
  g.fillStyle = '#fff'; g.font = '700 26px ui-monospace,Menlo,monospace'; g.textAlign = 'center'; g.fillText('TRAILREPLAY', 128, 32);
  g.fillStyle = '#1B2A20'; g.font = '900 112px system-ui,sans-serif'; g.fillText('42', 128, 168);
  for (const [x, y] of [[16, 60], [240, 60], [16, 186], [240, 186]]) { g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); }
  g.lineWidth = 10; g.strokeStyle = '#1B2A20'; g.strokeRect(5, 5, 246, 190);
  };
  drawBib('#C1652F');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; drawBib.tex = t; return t;
})();

/* ---------- small helpers ---------- */
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
function seg(a, b, r, mat, out = OUT) {
  const d = b.clone().sub(a), len = d.length();
  const p = part(new THREE.CapsuleGeometry(r, len, 6, 14), mat, out); p.position.copy(a).addScaledVector(d, 0.5);
  p.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return p;
}
const LENS = new THREE.MeshBasicMaterial({ color: 0xDCE8EC });
// GPS watch on the forearm group
function watch(el) {
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.024, 8, 22), M.ink); band.rotation.x = Math.PI / 2; band.position.y = -0.24; el.add(band);
  const face = part(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 18), M.ink, OUT_T); face.rotation.x = Math.PI / 2; face.position.set(0, -0.24, 0.1); el.add(face);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.036, 18), new THREE.MeshBasicMaterial({ color: 0xE9B44C })); glass.position.set(0, -0.24, 0.117); el.add(glass);
}

/* ---------- open-water swimmer (faces +X, lying prone at the water line y = 0) ---------- */
function makeRunner() {
  const root = new THREE.Group();
  const SUIT = M.ink, ACC = M.orange, SKIN = M.paper;
  const swim = new THREE.Group(); swim.position.y = 0.06; root.add(swim);   // whole body: bobs with the stroke
  const roll = new THREE.Group(); swim.add(roll);                           // body roll around the long axis

  // wetsuit torso: long, slightly flattened, track-colour side panels and chest logo stripe
  const torsoG = new THREE.CapsuleGeometry(0.27, 0.78, 8, 20); torsoG.rotateZ(Math.PI / 2);
  const torso = part(torsoG, SUIT); torso.scale.set(1, 0.82, 1); roll.add(torso);
  for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.012), ACC); p.position.set(-0.02, 0.02, 0.268 * s); roll.add(p); }
  const zipBack = seg(V(-0.45, 0.225, 0), V(0.3, 0.225, 0), 0.012, ACC, null); roll.add(zipBack);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 6, 24), ACC); collar.rotation.y = Math.PI / 2; collar.position.set(0.62, 0.03, 0); roll.add(collar);

  // head: icon face, bright race cap with number, goggles over the eyes, strap around the back
  const headRoll = new THREE.Group(); headRoll.position.set(0.86, 0.06, 0); roll.add(headRoll);
  const headPitch = new THREE.Group(); headRoll.add(headPitch);
  const head = new THREE.Group(); headPitch.add(head);
  const HR = 0.34;
  head.add(part(new THREE.SphereGeometry(HR, 34, 24), SKIN));
  const capG = new THREE.SphereGeometry(HR + 0.025, 36, 22, 0, Math.PI * 2, 0, Math.PI * 0.6);
  const cap = part(capG, ACC, OUT_T); cap.rotation.z = 0.75; head.add(cap);
  const capEdge = new THREE.Mesh(new THREE.TorusGeometry(Math.sin(Math.PI * 0.6) * (HR + 0.026), 0.016, 6, 40), M.ink); capEdge.rotation.x = Math.PI / 2; capEdge.position.y = Math.cos(Math.PI * 0.6) * (HR + 0.026); const capEdgeG = new THREE.Group(); capEdgeG.add(capEdge); capEdgeG.rotation.z = 0.75; head.add(capEdgeG);
  const capNum = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.font = '900 86px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('42', 64, 70); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  for (const s of [1, -1]) { const n = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: capNum, transparent: true })); const ny = 0.12, nz = (HR + 0.03) * 0.92; n.position.set(-0.08, ny, nz * s); if (s < 0) n.rotation.y = Math.PI; n.rotation.z = 0.2 * s; head.add(n); }
  const onHead = (obj, yaw, pitch, lift = 0) => { const y = THREE.MathUtils.degToRad(yaw), p = THREE.MathUtils.degToRad(pitch); const d = V(Math.cos(p) * Math.cos(y), Math.sin(p), Math.cos(p) * Math.sin(y)); obj.position.copy(d).multiplyScalar(HR + lift); obj.quaternion.setFromUnitVectors(V(0, 0, 1), d); head.add(obj); return obj; };
  const WHITE = new THREE.MeshBasicMaterial({ color: PAPER });
  const eyes = [];
  for (const s of [1, -1]) {
    const gog = new THREE.Group();
    const lensM = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), LENS); lensM.scale.set(1, 0.82, 1); gog.add(lensM);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 8, 28), M.ink); rim.scale.set(1, 0.82, 1); gog.add(rim);
    const eye = new THREE.Group(); const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), M.ink); ball.scale.set(0.05, 0.065, 0.02); eye.add(ball);
    const slit = new THREE.Mesh(new THREE.CircleGeometry(1, 16), WHITE); slit.scale.set(0.009, 0.022, 1); slit.position.set(0.008 * s, 0.006, 0.021); eye.add(slit);
    eye.position.z = 0.012; gog.add(eye); eyes.push(eye);
    onHead(gog, 27 * s, 6, 0.03);
  }
  head.add(seg(V(Math.cos(0.1) * (HR + 0.05), 0.06, 0.06), V(Math.cos(0.1) * (HR + 0.05), 0.06, -0.06), 0.014, M.ink, null));
  const strap = new THREE.Mesh(new THREE.TorusGeometry(HR + 0.035, 0.018, 6, 48), M.ink); strap.rotation.set(Math.PI / 2, 0, 0); strap.position.y = 0.03; strap.rotation.z = 0; const strapG = new THREE.Group(); strapG.add(strap); strapG.rotation.z = -0.25; head.add(strapG);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 8, 24, 1.6), M.ink); const sm = new THREE.Group(); smile.rotation.z = Math.PI + (Math.PI - 1.6) / 2 + 0.2; smile.position.y = 0.05; sm.add(smile); onHead(sm, 14, -26, -0.004);
  const breathMouth = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), M.ink); breathMouth.scale.set(0.055, 0.045, 0.02); onHead(breathMouth, 34, -22, -0.004); breathMouth.visible = false;

  // arms: sleeveless wetsuit (bare arms, track-colour armhole trim), GPS watch, freestyle windmill
  const arms = [];
  for (const s of [1, -1]) {
    const sh = new THREE.Group(); sh.position.set(0.42, 0.06, 0.3 * s); roll.add(sh);
    sh.add(part(new THREE.SphereGeometry(0.11, 18, 14), SKIN));
    sh.add(bone(0.42, 0.09, SKIN));
    const el = new THREE.Group(); el.position.y = -0.42; sh.add(el);
    el.add(bone(0.36, 0.08, SKIN));
    if (s === 1) watch(el);
    const hand = part(new THREE.CapsuleGeometry(0.075, 0.1, 6, 12), SKIN, OUT_T); hand.position.y = -0.47; hand.scale.set(1, 1, 0.7); el.add(hand);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 24), ACC); trim.position.set(0.42, 0.06, 0.27 * s); trim.rotation.y = 0.2 * s; roll.add(trim);
    arms.push({ sh, el, s, hand });
  }
  // legs: wetsuit to the ankle, pointed bare feet, timing chip on the left ankle, flutter kick
  const legs = [];
  for (const s of [1, -1]) {
    const hip = new THREE.Group(); hip.position.set(-0.6, -0.02, 0.15 * s); roll.add(hip);
    hip.add(bone(0.6, 0.12, SUIT));
    const knee = new THREE.Group(); knee.position.y = -0.6; hip.add(knee);
    knee.add(bone(0.55, 0.1, SKIN));
    knee.add(taper(0.36, 0.115, 0.11, SUIT, OUT, 0.02));
    const kp = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.02, 6, 20), ACC); kp.rotation.x = Math.PI / 2; kp.position.y = -0.33; knee.add(kp);
    const ank = new THREE.Group(); ank.position.y = -0.58; knee.add(ank);
    const foot = part(new THREE.CapsuleGeometry(0.075, 0.18, 6, 12), SKIN, OUT_T); foot.position.y = -0.12; foot.scale.set(0.75, 1, 1.15); ank.add(foot);
    if (s === 1) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.025, 6, 20), M.ink); band.rotation.x = Math.PI / 2; band.position.y = 0.02; ank.add(band); const chip = part(new THREE.BoxGeometry(0.08, 0.06, 0.05), ACC, OUT_T); chip.position.set(0, 0.02, 0.12); ank.add(chip); }
    legs.push({ hip, knee, ank, s });
  }

  // tow float: bright buoy tethered to the waist, bobbing behind
  const buoy = new THREE.Group(); root.add(buoy);
  const bG = new THREE.CapsuleGeometry(0.2, 0.42, 8, 18); bG.rotateZ(Math.PI / 2);
  buoy.add(part(bG, ACC));
  const bBand = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.03, 6, 24), M.paper); bBand.rotation.y = Math.PI / 2; buoy.add(bBand);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 6, 16, Math.PI), M.ink); handle.position.set(0.3, 0.12, 0); buoy.add(handle);
  const tether = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 1, 6), M.ink); root.add(tether);

  // water hints at the surface: wake strokes off the head, foam where hands enter and feet kick
  const foam = []; for (let i = 0; i < 7; i++) { const f = part(new THREE.SphereGeometry(0.09, 12, 10), M.paper, OUT_T); root.add(f); foam.push(f); }
  const wake = []; for (let i = 0; i < 4; i++) { const w = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.5, 3, 6), M.ink); w.rotation.z = Math.PI / 2; root.add(w); wake.push(w); }

  const T = 1.4;
  function pose(t) {
    const base = (t / T) * Math.PI * 2;
    // arms: beta 0 = hand enters in front, pi/2 pulling under the body, pi at the hip, 3pi/2 recovering over the water
    let pullSide = 0;
    for (const A of arms) {
      const beta = ((base + (A.s === 1 ? 0 : Math.PI)) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      A.sh.rotation.z = Math.PI / 2 - beta;
      const rec = Math.max(0, -Math.sin(beta));
      A.el.rotation.z = 1.5 * Math.pow(rec, 0.8) + 0.35 * Math.max(0, Math.sin(beta));
      A.sh.rotation.x = -0.25 * A.s * rec;
      if (beta < Math.PI) pullSide += A.s * Math.sin(beta);
    }
    roll.rotation.x = 0.42 * pullSide;
    // breathe to the camera side every second stroke
    const b = Math.pow(Math.max(0, Math.sin(base / 2 + 0.6)), 6);
    headPitch.rotation.z = -0.62 + 0.2 * b;
    headRoll.rotation.x = -1.25 * b - 0.4 * pullSide * (1 - b);
    breathMouth.visible = b > 0.35; sm.visible = !breathMouth.visible;
    // flutter kick, six beats per cycle
    for (const L of legs) {
      const k = Math.sin(base * 3 + (L.s === 1 ? 0 : Math.PI));
      L.hip.rotation.z = -Math.PI / 2 + 0.12 * k;
      L.knee.rotation.z = -0.12 - 0.22 * Math.max(0, k);
      L.ank.rotation.z = -0.25;
    }
    swim.position.y = 0.06 + 0.025 * Math.sin(base * 2);
    // buoy + tether
    buoy.position.set(-2.55, 0.12 + 0.04 * Math.sin(t * 2.3), 0.15 * Math.sin(t * 0.8)); buoy.rotation.z = 0.06 * Math.sin(t * 2.3 + 1);
    const a = V(-0.55, 0.0, 0), c = buoy.position.clone().add(V(0.38, 0, 0));
    tether.position.copy(a).lerp(c, 0.5); tether.scale.y = a.distanceTo(c); tether.quaternion.setFromUnitVectors(V(0, 1, 0), c.clone().sub(a).normalize());
    // foam + wake
    for (const [i, f] of foam.entries()) {
      const k = ((t * 1.6 + i / foam.length) % 1);
      const atHands = i < 3;
      f.position.set(atHands ? 1.25 - k * 0.6 : -1.75 - k * 0.7, 0.02 + Math.sin(k * Math.PI) * 0.18, (i % 2 ? 1 : -1) * (atHands ? 0.32 : 0.15));
      f.scale.setScalar(Math.max(0.001, Math.sin(k * Math.PI) * (atHands ? 1.0 : 1.2)));
    }
    for (const [i, w] of wake.entries()) {
      const k = ((t * 0.9 + i / wake.length) % 1); const side = i % 2 ? 1 : -1;
      w.position.set(1.0 - k * 2.4, 0.0, side * (0.45 + k * 0.6)); w.rotation.y = side * 0.35; w.scale.set(1, 1 - k * 0.7, 1); w.visible = k < 0.9;
    }
    const blink = (t % 3.84) > 3.66; for (const e of eyes) e.scale.y = blink ? 0.15 : 1;
  }
  return { root, pose };
}



  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(256, 256, false);
  const scene = new THREE.Scene();
  const { root, pose } = makeRunner(); scene.add(root);
  const camera = new THREE.OrthographicCamera(-2.4, 2.4, 2.4, -2.4, 0.1, 100);
  let previewFramed = false;
  let lastColor = null;
  function render(timeMs, heading, mapBearing, pitch, color, preview = false) {
    if (preview && !previewFramed) {
      // Give the turning character room on every side without changing map framing.
      const extent = 2.75;
      camera.left = -extent; camera.right = extent;
      camera.bottom = -extent + (0.0); camera.top = extent + (0.0);
      camera.updateProjectionMatrix();
      previewFramed = true;
    }
    M.orange.uniforms.col.value.set(color || ORANGE);
    if (lastColor !== color && typeof drawBib === 'function') { drawBib(color || '#C1652F'); bibTex.needsUpdate = true; }
    lastColor = color;
    const t = Math.max(0, timeMs) / 1000;
    BOIL.value = Math.floor(t * 8) % 3;
    pose(Math.floor(t * 12) / 12);
    root.rotation.y = Math.PI / 2 - THREE.MathUtils.degToRad(heading);
    const bearing = THREE.MathUtils.degToRad(mapBearing);
    const inclination = THREE.MathUtils.degToRad(Math.max(1, Math.min(85, pitch)));
    camera.position.set(-8 * Math.sin(bearing) * Math.sin(inclination), 8 * Math.cos(inclination), 8 * Math.cos(bearing) * Math.sin(inclination));
    if (preview) camera.position.x -= 0.6;
    camera.up.set(0, 1, 0); camera.lookAt(preview ? -0.6 : 0, 0, 0); renderer.render(scene, camera);
  }
  function dispose() {
    const geometries = new Set(), materials = new Set();
    root.traverse(obj => { if (obj.geometry) geometries.add(obj.geometry); if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => materials.add(m)); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    bibTex.dispose(); renderer.dispose();
  }
  return { render, dispose };
}
