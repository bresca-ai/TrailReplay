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

/* ---------- the runner (faces +X) ---------- */
function makeRunner() {
  const root = new THREE.Group();
  const hips = new THREE.Group(); root.add(hips);
  const upper = new THREE.Group(); hips.add(upper);

  // running shorts: waistband + two loose legs that ride on the thighs
  const waist = part(new THREE.CylinderGeometry(0.27, 0.29, 0.2, 24), M.green); waist.position.y = 0.02; waist.scale.set(1, 1, 0.92); hips.add(waist);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.272, 0.022, 6, 32), M.ink); band.rotation.x = Math.PI / 2; band.position.y = 0.12; band.scale.set(1, 0.92, 1); hips.add(band);

  // tee: tapered orange shirt with a hem, collar and a race bib
  const shirtG = new THREE.LatheGeometry([[0.0, -0.02], [0.27, -0.02], [0.3, 0.06], [0.29, 0.3], [0.31, 0.56], [0.27, 0.72], [0.14, 0.8], [0.0, 0.8]].map(([x, y]) => new THREE.Vector2(x, y)), 28);
  const shirt = part(shirtG, M.orange); shirt.scale.set(1, 1, 0.9); shirt.position.y = 0.08; upper.add(shirt);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 24), M.ink); collar.rotation.x = Math.PI / 2; collar.position.y = 0.87; upper.add(collar);
  const bib = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.27), new THREE.MeshBasicMaterial({ map: bibTex }));
  bib.position.set(0.312, 0.43, 0); bib.rotation.y = Math.PI / 2; bib.rotation.x = 0; bib.rotateX(-0.06); upper.add(bib);
  const neck = taper(0.16, 0.075, 0.085, M.paper, OUT_T); neck.position.y = 1.0; upper.add(neck);

  // head
  const head = new THREE.Group(); head.position.y = 1.3; upper.add(head);
  head.add(part(new THREE.SphereGeometry(0.42, 36, 26), M.paper));
  // spiky hair, a little messier than before
  const hairG = new THREE.ConeGeometry(0.105, 0.46, 12); hairG.translate(0, 0.23, 0);
  const spikes = [[-0.04, 0.3, 0, 0.12, 0, 1], [0.13, 0.27, 0.1, -0.32, 0.25, .9], [0.13, 0.27, -0.1, -0.32, -0.25, .9], [-0.14, 0.31, 0.17, 0.38, 0.45, 1], [-0.14, 0.31, -0.17, 0.38, -0.45, 1], [-0.27, 0.23, 0, 0.8, 0, 1.1], [0.25, 0.25, 0, -0.62, 0, .8], [-0.3, 0.16, 0.2, 1.0, 0.5, .9], [-0.3, 0.16, -0.2, 1.0, -0.5, .9], [0.03, 0.33, 0.2, 0, 0.6, .8], [0.03, 0.33, -0.2, 0, -0.6, .8]];
  const hair = new THREE.Group(); head.add(hair);
  for (const [x, y, z, rz, rx, s] of spikes) { const sp = part(hairG, M.paper, OUT_T); sp.position.set(x, y, z); sp.rotation.set(rx, 0, rz); sp.scale.setScalar(s); hair.add(sp); }
  // sweatband with two tails that flap behind
  const hb = part(new THREE.CylinderGeometry(0.43, 0.435, 0.12, 44, 1, true), M.orange, OUT_T); hb.position.y = 0.19; hb.rotation.z = -0.13; head.add(hb);
  const tails = [];
  for (const [i, s] of [[0, 1], [1, -1]]) {
    const tl = new THREE.Group(); tl.position.set(-0.42, 0.22, 0.04 * s); head.add(tl);
    const g = new THREE.BoxGeometry(0.3, 0.07, 0.018); g.translate(-0.15, 0, 0);
    tl.add(part(g, M.orange, OUT_T)); tails.push({ tl, i, s });
  }
  // face, drawn like the icon: big ink eyes with a white slit, one smile stroke
  const HR = 0.42;
  const onHead = (obj, yaw, pitch, lift = 0) => { const y = THREE.MathUtils.degToRad(yaw), p = THREE.MathUtils.degToRad(pitch); const d = new THREE.Vector3(Math.cos(p) * Math.cos(y), Math.sin(p), Math.cos(p) * Math.sin(y)); obj.position.copy(d).multiplyScalar(HR + lift); obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d); head.add(obj); return obj; };
  const WHITE = new THREE.MeshBasicMaterial({ color: PAPER });
  const eyes = [];
  for (const s of [1, -1]) {
    const eye = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), M.ink); ball.scale.set(0.085, 0.12, 0.034); eye.add(ball);
    const slit = new THREE.Mesh(new THREE.CircleGeometry(1, 20), WHITE); slit.scale.set(0.014, 0.036, 1); slit.position.set(0.012 * s, 0.01, 0.036); eye.add(slit);
    onHead(eye, 26 * s, 1, -0.008); eyes.push(eye);
  }
  // determined brows: short, slightly angled pen strokes
  for (const s of [1, -1]) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.09, 4, 8), M.ink); const h = new THREE.Group(); b.rotation.z = Math.PI / 2 + 0.28 * s; h.add(b); onHead(h, 27 * s, 13, 0.0); }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 8, 24, 1.6), M.ink);
  const sm = new THREE.Group(); smile.rotation.z = Math.PI + (Math.PI - 1.6) / 2 + 0.2; smile.position.y = 0.07; sm.add(smile); onHead(sm, 10, -20, -0.004);

  // limbs
  const legs = [], arms = [];
  for (const side of [1, -1]) {
    const hip = new THREE.Group(); hip.position.set(0, -0.04, 0.15 * side); hips.add(hip);
    hip.add(bone(0.5, 0.105));
    const shortsLeg = taper(0.27, 0.165, 0.185, M.green, OUT, 0.06); hip.add(shortsLeg);
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.017, 6, 24), M.orange); hem.rotation.x = Math.PI / 2; hem.position.y = -0.2; hip.add(hem);
    const knee = new THREE.Group(); knee.position.y = -0.5; hip.add(knee);
    knee.add(bone(0.47, 0.095));
    const sock = taper(0.12, 0.1, 0.105, M.paper, OUT_T, -0.36); knee.add(sock);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.103, 0.016, 6, 20), M.orange); stripe.rotation.x = Math.PI / 2; stripe.position.y = -0.4; knee.add(stripe);
    const ankle = new THREE.Group(); ankle.position.y = -0.48; knee.add(ankle);
    // running shoe: orange upper, chunky white sole, ink lace strokes
    const upG = new THREE.CapsuleGeometry(0.1, 0.2, 6, 14); upG.rotateZ(Math.PI / 2); upG.scale(1, 0.95, 0.95); upG.translate(0.1, -0.04, 0);
    ankle.add(part(upG, M.orange));
    const soleG = new THREE.CapsuleGeometry(0.06, 0.32, 4, 14); soleG.rotateZ(Math.PI / 2); soleG.scale(1, 0.75, 1.55); soleG.translate(0.11, -0.13, 0);
    ankle.add(part(soleG, M.cream, OUT_T));
    for (const dx of [0.08, 0.15]) { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.07, 3, 6), M.ink); l.rotation.x = Math.PI / 2; l.position.set(dx, 0.05, 0); ankle.add(l); }
    legs.push({ hip, knee, ankle, side });

    const sh = new THREE.Group(); sh.position.set(0.02, 0.7, 0.25 * side); upper.add(sh);
    const cap = part(new THREE.SphereGeometry(0.15, 22, 16), M.orange); cap.position.set(0.02, 0.7, 0.245 * side); cap.scale.set(1, 0.95, 0.9); upper.add(cap);
    sh.add(bone(0.34, 0.082));
    sh.add(taper(0.24, 0.142, 0.13, M.orange, OUT, 0.05));   // short sleeve, overlaps the shoulder cap
    const el = new THREE.Group(); el.position.y = -0.34; sh.add(el);
    el.add(bone(0.3, 0.078));
    const hand = part(new THREE.SphereGeometry(0.095, 18, 14), M.paper, OUT_T); hand.position.y = -0.32; el.add(hand);
    arms.push({ sh, el, side });
  }

  // contact shadow: a scribbled ellipse
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32), new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.14, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.005; shadow.visible = false; root.add(shadow);

  const TH = 0.5, SH = 0.48;
  function pose(t) {
    const T = 0.64, ph = (t / T) * Math.PI * 2;
    const hgt = [];
    for (const L of legs) {
      const p = ph + (L.side === 1 ? 0 : Math.PI);
      const thigh = 0.62 * Math.sin(p) + 0.08;
      const kneeB = 0.18 + 1.6 * Math.pow(Math.max(0, Math.sin(p - 3.75)), 1.25) + 0.22 * Math.max(0, Math.sin(p + 0.35));
      const foot = -(thigh - kneeB) + 0.08 - 0.55 * Math.pow(Math.max(0, Math.sin(p - 3.2)), 2) + 0.25 * Math.max(0, Math.sin(p - 0.2));
      L.hip.rotation.z = thigh; L.knee.rotation.z = -kneeB; L.ankle.rotation.z = foot;
      hgt.push(0.04 + TH * Math.cos(thigh) + SH * Math.cos(thigh - kneeB) + 0.2);
    }
    hips.position.y = Math.max(...hgt) + 0.03 * Math.max(0, Math.cos(2 * ph));
    hips.rotation.y = 0.12 * Math.sin(ph);
    upper.rotation.z = -0.22 + 0.03 * Math.cos(2 * ph);
    upper.rotation.y = -0.22 * Math.sin(ph);
    head.rotation.z = 0.2 - 0.04 * Math.cos(2 * ph);
    head.rotation.y = -0.1 + 0.12 * Math.sin(ph);
    hair.rotation.z = 0.05 * Math.cos(2 * ph);
    for (const A of arms) {
      const p = ph + (A.side === 1 ? Math.PI : 0);
      A.sh.rotation.z = 0.75 * Math.sin(p) + 0.1;
      A.el.rotation.z = 1.45 + 0.3 * Math.sin(p);
      A.sh.rotation.x = -0.14 * A.side;
    }
    for (const T2 of tails) { T2.tl.rotation.z = -0.35 + 0.22 * Math.sin(t * 19 + T2.i * 1.7); T2.tl.rotation.y = 0.35 * T2.s + 0.12 * Math.sin(t * 13 + T2.i); }
    shadow.scale.set(1 - 0.1 * Math.cos(2 * ph), 0.62, 1);
    const blink = (t % 3.84) > 3.66;
    for (const e of eyes) e.scale.y = blink ? 0.14 : 1;
  }
  return { root, pose };
}


  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(256, 256, false);
  const scene = new THREE.Scene();
  const { root, pose } = makeRunner(); scene.add(root);
  const camera = new THREE.OrthographicCamera(-1.75, 1.75, 2.6, -0.9, 0.1, 100);
  let previewFramed = false;
  let lastColor = null;
  function render(timeMs, heading, mapBearing, pitch, color, preview = false) {
    if (preview && !previewFramed) {
      // Give the turning character room on every side without changing map framing.
      const extent = 2.1;
      camera.left = -extent; camera.right = extent;
      camera.bottom = -extent + (0.38); camera.top = extent + (0.38);
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
    camera.position.set(-8 * Math.sin(bearing) * Math.sin(inclination), 8 * Math.cos(inclination) + 1, 8 * Math.cos(bearing) * Math.sin(inclination));
    camera.up.set(0, 1, 0); camera.lookAt(0, 1, 0); renderer.render(scene, camera);
  }
  function dispose() {
    const geometries = new Set(), materials = new Set();
    root.traverse(obj => { if (obj.geometry) geometries.add(obj.geometry); if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => materials.add(m)); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    bibTex.dispose(); renderer.dispose();
  }
  return { render, dispose };
}
