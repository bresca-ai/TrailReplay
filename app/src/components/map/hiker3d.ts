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

/* ---------- the runner (faces +X) ---------- */
function makeRunner() {
  const root = new THREE.Group();
  const PANTS = fill(0xC2A878, 0), HATC = fill(0xDCCBA4, 0), BOOT = fill(0x6B4A2E, 0), SHIRTC = M.cream;
  const hips = new THREE.Group(); root.add(hips);
  const upper = new THREE.Group(); hips.add(upper);

  // running shorts: waistband + two loose legs that ride on the thighs
  const waist = part(new THREE.CylinderGeometry(0.27, 0.29, 0.2, 24), PANTS); waist.position.y = 0.02; waist.scale.set(1, 1, 0.92); hips.add(waist);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.272, 0.022, 6, 32), M.ink); band.rotation.x = Math.PI / 2; band.position.y = 0.12; band.scale.set(1, 0.92, 1); hips.add(band);

  // tee: tapered orange shirt with a hem, collar and a race bib
  // hiking shirt: button placket, collar points, chest pocket
  const shirtG = new THREE.LatheGeometry([[0.0, -0.02], [0.28, -0.02], [0.3, 0.06], [0.29, 0.3], [0.31, 0.56], [0.27, 0.72], [0.14, 0.8], [0.0, 0.8]].map(([x, y]) => new THREE.Vector2(x, y)), 28);
  const shirt = part(shirtG, SHIRTC); shirt.scale.set(1, 1, 0.9); shirt.position.y = 0.08; upper.add(shirt);
  upper.add(seg(V(0.305, 0.12), V(0.29, 0.8), 0.011, M.ink, null));
  for (let k = 0; k < 5; k++) { const b = new THREE.Mesh(new THREE.CircleGeometry(0.018, 10), M.ink); b.position.set(0.312 - k * 0.002, 0.2 + k * 0.13, 0.02); b.rotation.y = Math.PI / 2; upper.add(b); }
  for (const s of [1, -1]) { const cp = part(new THREE.ConeGeometry(0.07, 0.14, 3), SHIRTC, OUT_T); cp.position.set(0.17, 0.84, 0.07 * s); cp.rotation.set(0, 0, Math.PI - 0.5); upper.add(cp); }
  const pocketS = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.13, 0.12), M.ink); pocketS.position.set(0.31, 0.55, -0.13); upper.add(pocketS);
  // daypack (about 25 L): body, lid, front pocket, bungee, side bottle, shoulder straps, sternum strap
  const PACK = M.orange;
  const body = part(new THREE.CapsuleGeometry(0.21, 0.36, 8, 18), PACK); body.position.set(-0.46, 0.44, 0); body.scale.set(0.72, 1, 1.12); upper.add(body);
  const lid = part(new THREE.SphereGeometry(0.22, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), PACK, OUT_T); lid.position.set(-0.46, 0.68, 0); lid.scale.set(0.8, 0.6, 1.15); upper.add(lid);
  const front = part(new THREE.CapsuleGeometry(0.13, 0.14, 6, 14), M.green, OUT_T); front.position.set(-0.6, 0.32, 0); front.scale.set(0.55, 1, 1.1); upper.add(front);
  upper.add(seg(V(-0.68, 0.5, 0.17), V(-0.68, 0.18, -0.17), 0.01, M.ink, null)); upper.add(seg(V(-0.68, 0.5, -0.17), V(-0.68, 0.18, 0.17), 0.01, M.ink, null));
  for (const z of [0.12, -0.12]) upper.add(seg(V(-0.55, 0.78, z), V(-0.64, 0.6, z), 0.016, M.ink, null));
  const bottle = part(new THREE.CylinderGeometry(0.07, 0.07, 0.28, 16), M.paper, OUT_T); bottle.position.set(-0.44, 0.34, 0.27); upper.add(bottle);
  const bcap = part(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 12), M.ink, OUT_T); bcap.position.set(-0.44, 0.5, 0.27); upper.add(bcap);
  const mesh = part(new THREE.CylinderGeometry(0.085, 0.085, 0.16, 16, 1, true), M.green, OUT_T); mesh.position.set(-0.44, 0.26, 0.27); upper.add(mesh);
  for (const s of [1, -1]) {
    upper.add(seg(V(-0.22, 0.82, 0.17 * s), V(0.06, 0.86, 0.18 * s), 0.055, PACK, OUT_T));
    upper.add(seg(V(0.06, 0.86, 0.18 * s), V(0.3, 0.58, 0.19 * s), 0.055, PACK, OUT_T));
    upper.add(seg(V(0.3, 0.58, 0.19 * s), V(0.27, 0.24, 0.22 * s), 0.035, M.ink, null));
  }
  upper.add(seg(V(0.33, 0.55, 0.19), V(0.33, 0.55, -0.19), 0.016, M.ink, null));
  const buckle = part(new THREE.BoxGeometry(0.03, 0.05, 0.07), M.ink, null); buckle.position.set(0.34, 0.55, 0); upper.add(buckle);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 24), M.ink); collar.rotation.x = Math.PI / 2; collar.position.y = 0.87; upper.add(collar);
  // padded hip belt of the pack, buckled at the front
  const hipBelt = part(new THREE.TorusGeometry(0.29, 0.045, 8, 36), M.orange, OUT_T); hipBelt.rotation.x = Math.PI / 2; hipBelt.position.y = 0.1; hipBelt.scale.set(1, 0.92, 1); hips.add(hipBelt);
  const hbk = part(new THREE.BoxGeometry(0.05, 0.08, 0.12), M.ink, null); hbk.position.set(0.33, 0.1, 0); hips.add(hbk);
  const neck = taper(0.16, 0.075, 0.085, M.paper, OUT_T); neck.position.y = 1.0; upper.add(neck);

  // head
  const head = new THREE.Group(); head.position.y = 1.3; upper.add(head);
  head.add(part(new THREE.SphereGeometry(0.42, 36, 26), M.paper));
  // spiky hair, a little messier than before
  const hairG = new THREE.ConeGeometry(0.105, 0.46, 12); hairG.translate(0, 0.23, 0);
  const spikes = [[-0.04, 0.3, 0, 0.12, 0, 1], [0.13, 0.27, 0.1, -0.32, 0.25, .9], [0.13, 0.27, -0.1, -0.32, -0.25, .9], [-0.14, 0.31, 0.17, 0.38, 0.45, 1], [-0.14, 0.31, -0.17, 0.38, -0.45, 1], [-0.27, 0.23, 0, 0.8, 0, 1.1], [0.25, 0.25, 0, -0.62, 0, .8], [-0.3, 0.16, 0.2, 1.0, 0.5, .9], [-0.3, 0.16, -0.2, 1.0, -0.5, .9], [0.03, 0.33, 0.2, 0, 0.6, .8], [0.03, 0.33, -0.2, 0, -0.6, .8]];
  const hair = new THREE.Group(); head.add(hair);
  for (const [x, y, z, rz, rx, s] of spikes.filter(() => false)) { const sp = part(hairG, M.paper, OUT_T); sp.position.set(x, y, z); sp.rotation.set(rx, 0, rz); sp.scale.setScalar(s); hair.add(sp); }
  // wide-brim sun hat with a band in the track colour and a chin cord
  const hat = new THREE.Group(); hat.position.set(-0.02, 0.2, 0); hat.rotation.z = -0.08; head.add(hat);
  hat.add(part(new THREE.CylinderGeometry(0.66, 0.66, 0.03, 44), HATC, OUT_T));
  const crown = part(new THREE.CylinderGeometry(0.34, 0.43, 0.32, 36), HATC); crown.position.y = 0.17; hat.add(crown);
  const top = part(new THREE.SphereGeometry(0.34, 30, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), HATC, OUT_T); top.position.y = 0.2; top.scale.set(1, 0.55, 1); hat.add(top);
  const hband = part(new THREE.CylinderGeometry(0.405, 0.42, 0.085, 36, 1, true), M.orange, OUT_T); hband.position.y = 0.065; hat.add(hband);
  for (const s of [1, -1]) head.add(seg(V(-0.02, 0.18, 0.42 * s), V(0.12, -0.4, 0.16 * s), 0.011, M.ink, null));
  const tails = [];
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
    // hiking trousers: full length, cargo pocket on the thigh
    hip.add(taper(0.56, 0.17, 0.15, PANTS, OUT, 0.06));
    const cargo = part(new THREE.BoxGeometry(0.16, 0.16, 0.03), PANTS, OUT_T); cargo.position.set(0, -0.22, 0.165 * side); hip.add(cargo);
    const knee = new THREE.Group(); knee.position.y = -0.5; hip.add(knee);
    knee.add(bone(0.47, 0.095));
    knee.add(taper(0.38, 0.15, 0.135, PANTS, OUT, 0.02));
    // wool sock rolled over the boot top
    const sockRoll = part(new THREE.TorusGeometry(0.115, 0.035, 8, 20), M.paper, OUT_T); sockRoll.rotation.x = Math.PI / 2; sockRoll.position.y = -0.36; knee.add(sockRoll);
    const ankle = new THREE.Group(); ankle.position.y = -0.48; knee.add(ankle);
    // running shoe: orange upper, chunky white sole, ink lace strokes
    // mid-cut hiking boot: leather upper above the ankle, padded collar, laces, toe rand, lugged sole
    const shaft = part(new THREE.CylinderGeometry(0.115, 0.11, 0.16, 18), BOOT); shaft.position.set(0.0, 0.07, 0); ankle.add(shaft);
    const upG = new THREE.CapsuleGeometry(0.11, 0.2, 6, 14); upG.rotateZ(Math.PI / 2); upG.translate(0.1, -0.04, 0);
    ankle.add(part(upG, BOOT));
    const rand = part(new THREE.SphereGeometry(0.09, 14, 10), M.ink, OUT_T); rand.scale.set(0.85, 0.7, 1.15); rand.position.set(0.27, -0.08, 0); ankle.add(rand);
    for (let k = 0; k < 4; k++) { const lc = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.09, 3, 6), M.orange); lc.rotation.x = Math.PI / 2; lc.position.set(0.02 + k * 0.055, 0.12 - k * 0.04, 0); ankle.add(lc); }
    const soleG = new THREE.CapsuleGeometry(0.06, 0.34, 4, 14); soleG.rotateZ(Math.PI / 2); soleG.scale(1, 0.85, 1.6); soleG.translate(0.11, -0.14, 0);
    ankle.add(part(soleG, M.ink, OUT_T));
    for (let k = 0; k < 6; k++) { const lug = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.16), M.ink); lug.position.set(-0.07 + k * 0.075, -0.2, 0); ankle.add(lug); }
    legs.push({ hip, knee, ankle, side });

    const sh = new THREE.Group(); sh.position.set(0.02, 0.7, 0.25 * side); upper.add(sh);
    const cap = part(new THREE.SphereGeometry(0.15, 22, 16), SHIRTC); cap.position.set(0.02, 0.7, 0.245 * side); cap.scale.set(1, 0.95, 0.9); upper.add(cap);
    sh.add(bone(0.34, 0.082));
    sh.add(taper(0.3, 0.14, 0.12, SHIRTC, OUT, 0.05));
    const roll = part(new THREE.TorusGeometry(0.12, 0.035, 8, 20), SHIRTC, OUT_T); roll.rotation.x = Math.PI / 2; roll.position.y = -0.26; sh.add(roll);
    const el = new THREE.Group(); el.position.y = -0.34; sh.add(el);
    el.add(bone(0.3, 0.078));
    const hand = part(new THREE.SphereGeometry(0.095, 18, 14), M.paper, OUT_T); hand.position.y = -0.32; el.add(hand);
    if (side === 1) watch(el);
    // trekking pole: track-colour upper section, light lower section, grip, wrist strap, basket and tip
    const pole = new THREE.Group(); pole.position.y = -0.32; el.add(pole);
    const PL = 1.42;
    pole.add(seg(V(0, 0.06), V(0, -0.62), 0.026, M.orange, OUT_T));
    pole.add(seg(V(0, -0.62), V(0, -PL + 0.06), 0.019, M.paper, OUT_T));
    const grip = part(new THREE.CapsuleGeometry(0.045, 0.16, 4, 10), M.ink, OUT_T); grip.position.y = -0.02; pole.add(grip);
    const lock = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 6, 14), M.ink); lock.rotation.x = Math.PI / 2; lock.position.y = -0.62; pole.add(lock);
    const basket = part(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 16), M.ink, null); basket.position.y = -PL + 0.14; pole.add(basket);
    const tipC = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 8), M.ink); tipC.rotation.z = Math.PI; tipC.position.y = -PL + 0.03; pole.add(tipC);
    const strapW = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 16, Math.PI * 1.3), M.ink); strapW.position.set(-0.03, 0.06, 0); pole.add(strapW);
    arms.push({ sh, el, side, pole });
  }

  // contact shadow: a scribbled ellipse
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32), new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.14, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.005; shadow.visible = false; root.add(shadow);

  const TH = 0.5, SH = 0.48;
  function pose(t) {
    const T = 1.1, ph = (t / T) * Math.PI * 2;
    const hgt = [];
    for (const L of legs) {
      const p = ph + (L.side === 1 ? 0 : Math.PI);
      const thigh = 0.42 * Math.sin(p) + 0.04;
      const kneeB = 0.08 + 0.95 * Math.pow(Math.max(0, Math.sin(p - 3.9)), 1.3) + 0.14 * Math.max(0, Math.sin(p + 0.3));
      const foot = -(thigh - kneeB) + 0.02 - 0.32 * Math.pow(Math.max(0, Math.sin(p - 3.3)), 2) + 0.14 * Math.max(0, Math.sin(p - 0.2));
      L.hip.rotation.z = thigh; L.knee.rotation.z = -kneeB; L.ankle.rotation.z = foot;
      hgt.push(0.04 + TH * Math.cos(thigh) + SH * Math.cos(thigh - kneeB) + 0.27);
    }
    hips.position.y = Math.max(...hgt);
    hips.rotation.y = 0.12 * Math.sin(ph);
    upper.rotation.z = -0.12 + 0.015 * Math.cos(2 * ph);
    upper.rotation.y = -0.12 * Math.sin(ph);
    head.rotation.z = 0.08 - 0.02 * Math.cos(2 * ph);
    head.rotation.y = -0.12 + 0.08 * Math.sin(ph);
    hair.rotation.z = 0.05 * Math.cos(2 * ph);
    for (const A of arms) {
      const p = ph + (A.side === 1 ? Math.PI : 0);
      A.sh.rotation.z = 0.32 * Math.sin(p) + 0.22;
      A.el.rotation.z = 0.95 + 0.18 * Math.sin(p);
      A.pole.rotation.z = -(A.sh.rotation.z + A.el.rotation.z + upper.rotation.z) + 0.04 + 0.26 * Math.sin(p);
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
      const extent = 2.15;
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
