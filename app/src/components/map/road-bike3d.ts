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

/* ---------- helpers ---------- */
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
function seg(a, b, r, mat, out = OUT) {
  const d = b.clone().sub(a), len = d.length();
  const p = part(new THREE.CapsuleGeometry(r, len, 6, 14), mat, out); p.position.copy(a).addScaledVector(d, 0.5);
  p.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return p;
}
function tube(points, r, mat, out = OUT_T) { const c = new THREE.CatmullRomCurve3(points); return part(new THREE.TubeGeometry(c, 40, r, 10, false), mat, out); }
const shapeOf = (fn) => { const s = new THREE.Shape(); fn(s); return s; };
function extrudeShape(shape, depth, mat, out = OUT, bevel = 0.04) { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 20 }); g.translate(0, 0, -depth / 2); g.computeVertexNormals(); return part(g, mat, out); }
// 2-bone IK in the side plane. dir=+1 bends the middle joint forward (+X), -1 backward.
function ik2(A, B, L1, L2, dir) {
  const dx = B.x - A.x, dy = B.y - A.y; const d = Math.min(Math.hypot(dx, dy), L1 + L2 - 1e-4);
  const t0 = Math.atan2(dx, -dy), k = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const th = t0 + dir * k; const K = V(A.x + L1 * Math.sin(th), A.y - L1 * Math.cos(th));
  const ph = Math.atan2(B.x - K.x, -(B.y - K.y)); return { th, ph, K };
}
const SKIN = M.paper, KIT = M.orange, BIB = M.ink, WHITE = M.paper;
const SOFTWHITE = new THREE.MeshBasicMaterial({ color: PAPER });

/* ---------- road bike + rider (faces +X) ---------- */
function makeRunner() {
  const root = new THREE.Group();
  const bike = new THREE.Group(); root.add(bike);
  const WR = 0.68, RW = V(-1.0, WR), FW = V(0.98, WR), BB = V(-0.18, 0.55), CR = 0.34;
  const ST = V(-0.52, 1.62), HT = V(0.64, 1.6), HB = V(0.74, 1.28);

  /* deep-section carbon wheels with a white rim decal that shows the spin */
  const wheels = [];
  for (const W of [RW, FW]) {
    const w = new THREE.Group(); w.position.copy(W); bike.add(w);
    w.add(part(new THREE.TorusGeometry(WR - 0.04, 0.045, 10, 64), BIB, OUT_T));
    const spin = new THREE.Group(); w.add(spin);
    for (const z of [0.035, -0.035]) {
      const rim = new THREE.Mesh(new THREE.RingGeometry(0.44, WR - 0.07, 64), BIB); rim.position.z = z; if (z < 0) rim.rotation.y = Math.PI; spin.add(rim);
      for (const a0 of [0.2, 0.2 + Math.PI]) { const dec = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.56, 24, 1, a0, 1.0), SOFTWHITE); dec.position.z = z * 1.15; if (z < 0) dec.rotation.y = Math.PI; spin.add(dec); }
    }
    for (let i = 0; i < 12; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.42, 4), BIB); const a1 = i / 12 * Math.PI * 2; s.position.set(Math.cos(a1) * 0.23, Math.sin(a1) * 0.23, (i % 2 ? 1 : -1) * 0.02); s.rotation.z = a1 - Math.PI / 2; spin.add(s); }
    const hub = new THREE.CylinderGeometry(0.05, 0.05, 0.14, 16); hub.rotateX(Math.PI / 2); spin.add(part(hub, WHITE, OUT_T));
    wheels.push(spin);
  }
  /* frame: white tubes, track-colour fork and decals */
  const F = new THREE.Group(); bike.add(F);
  const ft = (a, b, r) => F.add(seg(a, b, r, WHITE, OUT_T));
  ft(BB, ST, 0.045); ft(ST, HT, 0.04); ft(BB, HB, 0.055); ft(HB, HT, 0.05);
  for (const s of [1, -1]) { F.add(seg(V(BB.x, BB.y, 0.04 * s), V(RW.x, RW.y, 0.07 * s), 0.028, WHITE, OUT_T)); F.add(seg(V(ST.x + 0.02, ST.y - 0.06, 0.03 * s), V(RW.x, RW.y, 0.07 * s), 0.024, WHITE, OUT_T)); }
  for (const s of [1, -1]) F.add(seg(V(HB.x, HB.y, 0.035 * s), V(FW.x, FW.y, 0.06 * s), 0.03, KIT, OUT_T));
  const decal = seg(V(0.05, 0.82), V(0.5, 1.15), 0.058, KIT, null); F.add(decal);
  // seatpost, saddle
  const SP = V(-0.62, 1.86); ft(ST, SP, 0.035);
  F.add(extrudeShape(shapeOf((s) => { s.moveTo(-0.92, 1.9); s.quadraticCurveTo(-0.7, 1.86, -0.38, 1.9); s.lineTo(-0.36, 1.94); s.quadraticCurveTo(-0.7, 1.97, -0.92, 1.95); s.lineTo(-0.92, 1.9); }), 0.12, BIB, OUT_T, 0.03));
  // stem + drop bars (tops, hoods, drops) + brake hoods
  const STEM = V(0.82, 1.72); F.add(seg(HT, V(0.66, 1.72), 0.035, BIB, OUT_T)); F.add(seg(V(0.66, 1.72), STEM, 0.032, BIB, OUT_T));
  F.add(seg(V(STEM.x, STEM.y, 0.22), V(STEM.x, STEM.y, -0.22), 0.026, BIB, OUT_T));
  for (const s of [1, -1]) {
    const z = 0.22 * s;
    F.add(tube([V(STEM.x, STEM.y, z), V(0.96, 1.73, z), V(1.04, 1.62, z), V(1.0, 1.46, z), V(0.88, 1.42, z)], 0.026, BIB));
    const hood = seg(V(0.95, 1.73, z), V(1.04, 1.8, z), 0.035, BIB, OUT_T); F.add(hood);
    F.add(seg(V(1.04, 1.78, z), V(1.07, 1.55, z), 0.018, BIB, null));
  }
  // drivetrain on the near side (+Z): chainring, cassette, chain, derailleur
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 40), BIB); ring.position.set(BB.x, BB.y, 0.11); bike.add(ring);
  const ringIn = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), KIT); ringIn.position.set(BB.x, BB.y, 0.105); bike.add(ringIn);
  const cas = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), BIB); cas.position.set(RW.x, RW.y, 0.1); bike.add(cas);
  bike.add(seg(V(BB.x, BB.y + 0.22, 0.1), V(RW.x, RW.y + 0.1, 0.1), 0.012, BIB, null));
  bike.add(seg(V(BB.x, BB.y - 0.22, 0.1), V(RW.x + 0.05, RW.y - 0.2, 0.1), 0.012, BIB, null));
  bike.add(seg(V(RW.x + 0.05, RW.y - 0.2, 0.1), V(RW.x, RW.y - 0.1, 0.1), 0.02, BIB, null));
  // bottle + cage on the down tube
  const bottle = new THREE.Group(); bottle.position.set(0.18, 0.98, 0); bottle.rotation.z = -0.82; bike.add(bottle);
  bottle.add(part(new THREE.CylinderGeometry(0.075, 0.075, 0.36, 18), KIT, OUT_T));
  const cap = part(new THREE.CylinderGeometry(0.04, 0.06, 0.08, 14), WHITE, OUT_T); cap.position.y = 0.21; bottle.add(cap);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.012, 6, 20), BIB); band.rotation.x = Math.PI / 2; bottle.add(band);
  // cranks (both sides) with pedals
  const cranks = [];
  for (const s of [1, -1]) {
    const c = new THREE.Group(); c.position.set(BB.x, BB.y, 0.14 * s); bike.add(c);
    c.add(seg(V(0, 0), V(CR, 0), 0.025, BIB, null));
    const ped = new THREE.Group(); ped.position.set(CR, 0, 0.05 * s); c.add(ped);
    ped.add(part(new THREE.BoxGeometry(0.12, 0.03, 0.09), BIB, null));
    cranks.push({ c, ped, s });
  }

  /* ---------- rider ---------- */
  const rider = new THREE.Group(); root.add(rider);
  const H = V(-0.6, 1.98);                       // sit bones on the saddle
  const TANG = 0.6;                              // flat-ish back
  const torso = new THREE.Group(); torso.position.copy(H); torso.rotation.z = -(Math.PI / 2 - TANG); rider.add(torso);
  // bib shorts seat
  const seat = part(new THREE.CapsuleGeometry(0.2, 0.18, 6, 16), BIB); seat.rotation.x = Math.PI / 2; rider.add(seat); seat.position.copy(H).add(V(0.02, 0.02));
  // jersey: fitted, track colour, white chest band, full zip, three back pockets, race number on the back
  const TL = 1.08;
  const jerseyG = new THREE.LatheGeometry([[0.0, -0.05], [0.25, -0.05], [0.29, 0.1], [0.27, 0.45], [0.3, 0.82], [0.27, 1.0], [0.15, 1.1], [0.0, 1.1]].map(([x, y]) => new THREE.Vector2(x, y)), 32);
  const jersey = part(jerseyG, KIT); jersey.scale.set(0.82, 1, 1.08); torso.add(jersey);
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.296, 0.288, 0.13, 32, 1, true), WHITE); chest.position.y = 0.66; chest.scale.set(0.83, 1, 1.09); torso.add(chest);
  for (const y of [0.6, 0.72]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.01, 6, 40), BIB); r.rotation.x = Math.PI / 2; r.position.y = y; r.scale.set(0.84, 1.1, 1); torso.add(r); }
  const zip = seg(V(0.235, 0.18), V(0.24, 1.0), 0.012, BIB, null); torso.add(zip);
  for (const z of [-0.14, 0, 0.14]) torso.add(seg(V(-0.235, 0.06, z), V(-0.235, 0.26, z), 0.011, BIB, null));
  torso.add(seg(V(-0.236, 0.27, -0.21), V(-0.236, 0.27, 0.21), 0.011, BIB, null));
  const num = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.25), new THREE.MeshBasicMaterial({ map: bibTex })); num.position.set(-0.252, 0.5, 0); num.rotation.y = -Math.PI / 2; torso.add(num);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 24), BIB); collar.rotation.x = Math.PI / 2; collar.position.y = 1.08; torso.add(collar);
  // world-space shoulders
  const tdir = V(Math.cos(TANG), Math.sin(TANG));
  const SH = H.clone().addScaledVector(tdir, 0.92);
  // arms: short sleeve with white cuff, bare forearm, fingerless mitts on the hoods
  for (const s of [1, -1]) {
    const S = V(SH.x, SH.y, 0.29 * s), Hd = V(1.0, 1.77, 0.22 * s);
    const L1 = 0.56, L2 = 0.54, d = S.distanceTo(Hd), dirv = Hd.clone().sub(S).normalize();
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const perp = V(-dirv.y, dirv.x, 0).multiplyScalar(-1);   // elbows point down/back
    const E = S.clone().addScaledVector(dirv, a).addScaledVector(perp, h).add(V(0, 0, 0.07 * s));
    rider.add(seg(S, E, 0.085, SKIN));
    const sleeve = seg(S, S.clone().lerp(E, 0.5), 0.12, KIT); rider.add(sleeve);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.014, 6, 20), WHITE); cuff.position.copy(S.clone().lerp(E, 0.5)); cuff.quaternion.setFromUnitVectors(V(0, 0, 1), E.clone().sub(S).normalize()); rider.add(cuff);
    rider.add(seg(E, Hd, 0.075, SKIN));
    const mitt = part(new THREE.SphereGeometry(0.085, 16, 12), BIB, OUT_T); mitt.position.copy(Hd); rider.add(mitt);
    const shcap = part(new THREE.SphereGeometry(0.14, 18, 14), KIT); shcap.position.copy(S); rider.add(shcap);
  }
  // head: icon face, aero helmet, wraparound glasses with the eyes still visible, spiky hair poking out the back
  const headG = new THREE.Group(); headG.position.copy(SH).add(V(0.36, 0.34)); rider.add(headG);
  rider.add(seg(SH.clone().add(V(0.04, 0.04)), headG.position.clone().add(V(-0.12, -0.2)), 0.08, SKIN, OUT_T));
  const HR = 0.36;
  headG.add(part(new THREE.SphereGeometry(HR, 34, 24), SKIN));
  const hairG = new THREE.ConeGeometry(0.075, 0.3, 10); hairG.translate(0, 0.15, 0);
  const helm = new THREE.Group(); headG.add(helm); helm.position.set(-0.04, 0.12, 0); helm.rotation.z = 0.12;
  const shellG = new THREE.SphereGeometry(HR + 0.06, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.56); shellG.scale(1.22, 0.92, 1.02);
  helm.add(part(shellG, KIT));
  for (const z of [-0.16, 0, 0.16]) { const v = seg(V(0.18, 0.25, z * 0.9), V(-0.2, 0.26, z), 0.022, BIB, null); helm.add(v); }
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(HR + 0.065, 0.02, 6, 48, Math.PI * 0.95), WHITE); stripe.scale.set(1.22, 0.92, 1); stripe.rotation.z = 0.28; helm.add(stripe);
  for (const s of [1, -1]) helm.add(seg(V(-0.02, -0.06, 0.34 * s), V(0.1, -0.42, 0.27 * s), 0.012, BIB, null));
  const onHead = (obj, yaw, pitch, lift = 0) => { const y = THREE.MathUtils.degToRad(yaw), p = THREE.MathUtils.degToRad(pitch); const d = V(Math.cos(p) * Math.cos(y), Math.sin(p), Math.cos(p) * Math.sin(y)); obj.position.copy(d).multiplyScalar(HR + lift); obj.quaternion.setFromUnitVectors(V(0, 0, 1), d); headG.add(obj); return obj; };
  const lens = new THREE.Mesh(new THREE.SphereGeometry(HR + 0.02, 40, 16, -1.15, 2.3, Math.PI * 0.4, Math.PI * 0.16), new THREE.MeshBasicMaterial({ color: 0xDCE8EC })); lens.rotation.y = Math.PI; headG.add(lens);
  const frame = new THREE.Mesh(new THREE.SphereGeometry(HR + 0.026, 40, 4, -1.2, 2.4, Math.PI * 0.385, Math.PI * 0.03), BIB); frame.rotation.y = Math.PI; headG.add(frame);
  const lower = new THREE.Mesh(new THREE.SphereGeometry(HR + 0.024, 40, 4, -1.12, 2.24, Math.PI * 0.555, Math.PI * 0.012), BIB); lower.rotation.y = Math.PI; headG.add(lower);
  for (const s of [1, -1]) { const y0 = Math.cos(Math.PI * 0.4) * (HR + 0.03); const ang = 1.15; headG.add(seg(V(Math.cos(ang) * (HR + 0.03), y0, Math.sin(ang) * (HR + 0.03) * s), V(-0.18, y0 - 0.02, (HR - 0.02) * s), 0.016, BIB, null)); }
  const eyes = [];
  for (const s of [1, -1]) { const e = new THREE.Group(); const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), M.ink); ball.scale.set(0.068, 0.088, 0.03); e.add(ball); const sl = new THREE.Mesh(new THREE.CircleGeometry(1, 16), SOFTWHITE); sl.scale.set(0.012, 0.03, 1); sl.position.set(0.01 * s, 0.008, 0.032); e.add(sl); onHead(e, 24 * s, 2, 0.03); eyes.push(e); }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.016, 8, 24, 1.6), M.ink); const sm = new THREE.Group(); smile.rotation.z = Math.PI + (Math.PI - 1.6) / 2 + 0.2; smile.position.y = 0.06; sm.add(smile); onHead(sm, 12, -24, -0.004);
  headG.rotation.z = 0.32;

  // legs: bib shorts to above the knee with a gripper band, white skin, socks with a stripe, white clipless shoes with a BOA dial
  const legs = [];
  for (const s of [1, -1]) {
    const hip = new THREE.Group(); hip.position.set(H.x + 0.02, H.y - 0.04, 0.16 * s); rider.add(hip);
    const L1 = 0.84, L2 = 0.8;
    const sh = new THREE.CapsuleGeometry(0.13, L1 * 0.78, 6, 16); sh.translate(0, -L1 * 0.39, 0); hip.add(part(sh, BIB));
    const grip = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.02, 6, 24), KIT); grip.rotation.x = Math.PI / 2; grip.position.y = -L1 * 0.8; hip.add(grip);
    hip.add(seg(V(0, -L1 * 0.75), V(0, -L1), 0.11, SKIN, OUT));
    const knee = new THREE.Group(); knee.position.y = -L1; hip.add(knee);
    knee.add(seg(V(0, 0), V(0, -L2), 0.095, SKIN));
    const sock = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 20), KIT); sock.rotation.x = Math.PI / 2; sock.position.y = -L2 * 0.72; knee.add(sock);
    const ank = new THREE.Group(); ank.position.y = -L2; knee.add(ank);
    const shoeG = new THREE.CapsuleGeometry(0.085, 0.24, 6, 14); shoeG.rotateZ(Math.PI / 2); shoeG.translate(0.1, -0.02, 0);
    ank.add(part(shoeG, WHITE));
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.035, 0.15), BIB); sole.position.set(0.1, -0.095, 0); ank.add(sole);
    const boa = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.02, 14), KIT); boa.rotation.x = Math.PI / 2; boa.position.set(0.08, 0.04, 0.085 * s); ank.add(boa);
    legs.push({ hip, knee, ank, s, L1, L2 });
  }

  function pose(t) {
    const T = 0.62, al = -(t / T) * Math.PI * 2;      // crank angle, turning forward
    for (const W of wheels) W.rotation.z = -t * 9.5;
    for (const [i, C] of cranks.entries()) { const a = al + (C.s === 1 ? 0 : Math.PI); C.c.rotation.z = a; C.ped.rotation.z = -a + 0.12 * Math.sin(a); }
    for (const L of legs) {
      const a = al + (L.s === 1 ? 0 : Math.PI);
      const P = V(BB.x + CR * Math.cos(a), BB.y + CR * Math.sin(a));
      const footPitch = -0.12 + 0.22 * Math.sin(a + 0.6);           // a bit of ankling
      const A = V(P.x - 0.08 * Math.cos(footPitch), P.y + 0.1);
      const hp = V(L.hip.position.x, L.hip.position.y);
      const r = ik2(hp, A, L.L1, L.L2, 1);
      L.hip.rotation.z = r.th; L.knee.rotation.z = r.ph - r.th; L.ank.rotation.z = footPitch - r.ph;
    }
    headG.rotation.z = 0.32 + 0.025 * Math.sin(t * 2.4); headG.rotation.y = 0.05 * Math.sin(t * 1.1);
    rider.position.y = 0.008 * Math.sin(-al * 2);
    const blink = (t % 3.84) > 3.66; for (const e of eyes) e.scale.y = blink ? 0.15 : 1;
  }
  return { root, pose };
}


  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(256, 256, false);
  const scene = new THREE.Scene();
  const { root, pose } = makeRunner(); scene.add(root);
  const camera = new THREE.OrthographicCamera(-3.3, 3.3, 4.1499999999999995, -2.4499999999999997, 0.1, 100);
  let previewFramed = false;
  let lastColor = null;
  function render(timeMs, heading, mapBearing, pitch, color, preview = false) {
    if (preview && !previewFramed) {
      // Give the turning character room on every side without changing map framing.
      const extent = 3.05;
      camera.left = -extent; camera.right = extent;
      camera.bottom = -extent + (0.25); camera.top = extent + (0.25);
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
