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

/* ---------- crew: icon-face character, same build as the paraglider pilot ---------- */
const LENS = new THREE.MeshBasicMaterial({ color: 0xDCE8EC, side: THREE.DoubleSide });
const NAVY = fill(0x2C3E5C, 0), LEATHER = fill(0x7A4B2C, 0), SKIN = M.paper;
function setLine(m, a, b) { m.position.copy(a).lerp(b, 0.5); m.scale.y = Math.max(1e-3, a.distanceTo(b)); m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); }
function line(a, b, r = 0.007, mat = M.ink) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 6), mat); setLine(m, a, b); return m; }
const stripeTex = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 8; const g = c.getContext('2d');
  g.fillStyle = '#F8F6F0'; g.fillRect(0, 0, 256, 8); g.fillStyle = '#2C3E5C'; for (let x = 0; x < 256; x += 16) g.fillRect(x, 0, 7, 8);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
})();
// flat half disc bulging towards +X (cap peaks)
function halfDisc(r, d, mat, out = OUT_T) {
  const s = new THREE.Shape(); s.moveTo(0, -r); s.absarc(0, 0, r, -Math.PI / 2, Math.PI / 2, false); s.lineTo(0, -r);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 24 }); g.translate(0, 0, -d / 2); g.rotateX(-Math.PI / 2); return part(g, mat, out);
}
// horizontal arc centred on +X (windscreen frames)
function arc(r, half, tube, mat) { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 28, half * 2), mat); m.rotation.x = Math.PI / 2; g.add(m); g.rotation.y = half; return g; }
function glassArc(r, half, h) { return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28, 1, true, Math.PI / 2 - half, half * 2), LENS); }

function pilot(parent, o) {
  const HR = 0.34, WHITE = new THREE.MeshBasicMaterial({ color: PAPER });
  const P = new THREE.Group(); P.position.set(o.x, o.y, o.z || 0); P.scale.setScalar(o.s); parent.add(P);
  const torso = seg(V(-0.02, 0.2), V(-0.08, 0.86), 0.26, o.suit); torso.scale.set(1, 1, 1.05); P.add(torso);
  P.add(seg(V(-0.07, 0.95), V(-0.05, 1.05), 0.075, SKIN, OUT_T));
  const head = new THREE.Group(); head.position.set(-0.04, 1.22, 0); P.add(head);
  head.add(part(new THREE.SphereGeometry(HR, 34, 24), SKIN));
  const onHead = (obj, yaw, pitch, lift = 0) => { const y = THREE.MathUtils.degToRad(yaw), p = THREE.MathUtils.degToRad(pitch); const d = V(Math.cos(p) * Math.cos(y), Math.sin(p), Math.cos(p) * Math.sin(y)); obj.position.copy(d).multiplyScalar(HR + lift); obj.quaternion.setFromUnitVectors(V(0, 0, 1), d); head.add(obj); return obj; };
  const eyes = [];
  for (const s of [1, -1]) { const e = new THREE.Group(); const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), M.ink); ball.scale.set(0.066, 0.09, 0.03); e.add(ball); const sl = new THREE.Mesh(new THREE.CircleGeometry(1, 16), WHITE); sl.scale.set(0.012, 0.028, 1); sl.position.set(0.01 * s, 0.008, 0.032); e.add(sl); onHead(e, 26 * s, 2, 0.032); eyes.push(e); }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.016, 8, 24, 1.6), M.ink); const sm = new THREE.Group(); smile.rotation.z = Math.PI + (Math.PI - 1.6) / 2 + 0.2; smile.position.y = 0.06; sm.add(smile); onHead(sm, 12, -24, -0.004);
  // arms hang from the shoulders; each vehicle poses them
  const arms = [];
  for (const s of [1, -1]) {
    const sh = new THREE.Group(); sh.position.set(-0.05, 0.8, 0.3 * s); P.add(sh);
    const up = new THREE.Group(); sh.add(up); up.add(bone(0.4, 0.085, o.suit));
    const el = new THREE.Group(); el.position.y = -0.4; up.add(el); el.add(bone(0.36, 0.078, o.suit));
    const glove = part(new THREE.SphereGeometry(0.09, 16, 12), o.glove || SKIN, OUT_T); glove.position.y = -0.38; el.add(glove);
    arms.push({ s, sh, up, el });
  }
  // neckwear
  if (o.neck) { const col = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.045, 8, 22), o.neck); col.rotation.x = Math.PI / 2; col.position.set(-0.06, 1.08, 0); P.add(col); }
  const scarf = [];
  if (o.hat === 'aviator') {
    // leather flying helmet: covers the whole skull, ear flaps, chin strap, goggles pushed up on the forehead
    const cap = part(new THREE.SphereGeometry(HR + 0.03, 36, 22, 0, Math.PI * 2, 0, Math.PI * 0.55), LEATHER); cap.rotation.z = 0.45; head.add(cap);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(HR + 0.032, 0.012, 6, 40, Math.PI), M.ink); seam.rotation.y = 0; seam.rotation.z = 0.2; head.add(seam);
    for (const s of [1, -1]) {
      const flap = part(new THREE.SphereGeometry(0.15, 16, 12), LEATHER, OUT_T); flap.scale.set(1, 1.3, 0.4); flap.position.set(-0.05, -0.1, (HR + 0.005) * s); head.add(flap);
      head.add(seg(V(-0.02, -0.24, 0.29 * s), V(0.12, -0.35, 0.15 * s), 0.014, M.ink, null));
    }
    const gb = new THREE.Group(); gb.rotation.z = 0.6; head.add(gb);
    const band = new THREE.Mesh(new THREE.TorusGeometry(HR + 0.05, 0.022, 6, 48), M.ink); band.rotation.x = Math.PI / 2; gb.add(band);
    for (const s of [1, -1]) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.026, 8, 24), M.ink));
      const ln = new THREE.Mesh(new THREE.CircleGeometry(0.076, 24), LENS); ln.position.z = 0.004; g.add(ln);
      const gl = new THREE.Mesh(new THREE.CircleGeometry(0.02, 12), WHITE); gl.position.set(0.025, 0.025, 0.01); g.add(gl);
      onHead(g, 21 * s, 35, 0.075);
    }
    // white silk scarf: wrap + a tail that streams back in the wind
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.06, 8, 22), M.paper); wrap.rotation.x = Math.PI / 2; wrap.position.set(-0.06, 1.06, 0); P.add(wrap);
    let at = P, pos = V(-0.2, 1.06, 0.1);
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group(); g.position.copy(pos); at.add(g);
      const piece = part(new THREE.BoxGeometry(0.2, 0.05, 0.13 - i * 0.012), M.paper, OUT_T); piece.position.x = -0.09; g.add(piece);
      scarf.push(g); at = g; pos = V(-0.19, 0, 0);
    }
  }
  if (o.hat === 'engineer') {
    // railroad engineer's cap in striped hickory cloth, soft crown, short peak
    const STR = new THREE.MeshBasicMaterial({ map: stripeTex });
    const crown = part(new THREE.SphereGeometry(HR + 0.05, 36, 22, 0, Math.PI * 2, 0, Math.PI * 0.5), STR); crown.scale.set(1.05, 0.82, 1.05); crown.position.y = 0.05; crown.rotation.z = 0.12; head.add(crown);
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), M.ink); button.position.set(-0.03, 0.39, 0); head.add(button);
    const peak = halfDisc(0.3, 0.03, M.ink); peak.scale.set(0.7, 1, 1); peak.position.set(0.29, 0.15, 0); peak.rotation.z = -0.2; head.add(peak);
    const knot = part(new THREE.ConeGeometry(0.08, 0.2, 4), o.neck || M.orange, OUT_T); knot.rotation.z = Math.PI; knot.position.set(0.15, 0.97, 0); P.add(knot);
  }
  if (o.hat === 'captain') {
    // skipper's peaked cap: white top, black band, gold badge and braid on the peak
    const capt = new THREE.Group(); capt.position.y = 0.19; capt.rotation.z = 0.1; head.add(capt);
    const band = part(new THREE.CylinderGeometry(0.365, 0.355, 0.13, 36), M.ink, OUT_T); band.position.y = 0.06; capt.add(band);
    const top = part(new THREE.CylinderGeometry(0.46, 0.37, 0.15, 36), M.paper); top.position.y = 0.2; top.scale.x = 1.06; capt.add(top);
    const peak = halfDisc(0.3, 0.035, M.ink); peak.scale.set(0.62, 1, 1); peak.position.set(0.3, 0.0, 0); peak.rotation.z = -0.38; capt.add(peak);
    const braid = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.014, 6, 24, 2.0), GOLD); braid.rotation.x = Math.PI / 2; const bg = new THREE.Group(); bg.add(braid); bg.rotation.y = 1.0; bg.position.set(0.18, 0.03, 0); bg.rotation.z = -0.3; capt.add(bg);
    const badge = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), GOLD); badge.scale.set(0.4, 1, 1); badge.position.set(0.36, 0.07, 0); capt.add(badge);
    for (const [y, z] of [[0.5, 0.08], [0.5, -0.08], [0.7, 0.08], [0.7, -0.08]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), GOLD); b.position.set(0.215, y, z); P.add(b); }
    for (const s of [1, -1]) { const ep = part(new THREE.BoxGeometry(0.18, 0.03, 0.12), GOLD, null); ep.position.set(-0.05, 1.04, 0.2 * s); P.add(ep); }
  }
  if (o.hat === 'sailor') {
    // white sailor's cap: soft dome and an upturned brim all round
    const sc = new THREE.Group(); sc.position.y = 0.13; sc.rotation.z = 0.12; head.add(sc);
    const dome = part(new THREE.SphereGeometry(HR + 0.04, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.5), M.paper); dome.scale.y = 0.72; sc.add(dome);
    const brim = part(new THREE.CylinderGeometry(0.47, 0.37, 0.13, 36, 1, true), M.paper, OUT_T); brim.position.y = 0.0; sc.add(brim);
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.465, 0.365, 0.13, 36, 1, true), M.paper); bin.material = M.paper; bin.scale.setScalar(0.995); sc.add(bin);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.012, 6, 40), M.ink); rim.rotation.x = Math.PI / 2; rim.position.y = 0.065; sc.add(rim);
  }
  if (o.vest) {
    // buoyancy aid over the shirt: track-colour panels, buckles, white collar
    const vest = seg(V(-0.03, 0.28), V(-0.08, 0.8), 0.295, o.vest); vest.scale.set(1, 1, 1.06); P.add(vest);
    for (const y of [0.4, 0.62]) { const st = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 6, 36), M.ink); st.rotation.x = Math.PI / 2; st.scale.z = 1.06; st.position.set(-0.05, y, 0); P.add(st); const bk = box(0.04, 0.07, 0.1, M.paper, null); bk.position.set(0.255, y, 0); P.add(bk); }
    const zip = box(0.02, 0.5, 0.025, M.ink, null); zip.position.set(0.24, 0.62, 0); zip.rotation.z = 0.08; P.add(zip);
  }
  return { P, head, eyes, arms, scarf };
}
// wave hello now and then; otherwise call rest()
function waveArm(A, t, period, rest) {
  const k = t % period;
  if (k < 1.3) { A.up.rotation.set(-2.5 * A.s, 0, 0.2); A.el.rotation.set(0, 0, 0.35 * Math.sin(t * 14)); return true; }
  rest(A); return false;
}

/* ---------- the plane: vintage open-cockpit tail-dragger (faces +X, flying) ---------- */
function makeRunner() {
  const root = new THREE.Group();
  const ALT = 1.9;
  const fly = new THREE.Group(); fly.position.y = ALT; root.add(fly);
  const plane = new THREE.Group(); fly.add(plane);
  const body = new THREE.Group(); body.rotation.z = -0.03; plane.add(body);
  // fuselage: round, fat behind the engine, tapering to the tail
  const lathe = (pts, mat, sc = [1, 1.08, 0.9]) => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 36); g.rotateZ(-Math.PI / 2); const p = part(g, mat); p.scale.set(...sc); return p; };
  body.add(lathe([[0, -2.55], [0.08, -2.5], [0.2, -1.8], [0.36, -0.9], [0.46, -0.1], [0.5, 0.6], [0.49, 1.2], [0.45, 1.6], [0.36, 1.85], [0, 1.9]], M.orange));
  // engine cowling with cooling slots
  body.add(lathe([[0.525, 1.12], [0.51, 1.3], [0.47, 1.6], [0.39, 1.85], [0.24, 1.96], [0, 1.97]], M.paper));
  for (const s of [1, -1]) for (let i = 0; i < 3; i++) { const v = box(0.2, 0.03, 0.04, M.ink); v.position.set(1.45 + i * 0.04, 0.12 - i * 0.12, 0.43 * s); v.rotation.y = 0.2 * s; body.add(v); }
  // cockpit opening, coaming and windscreen
  const pit = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), M.ink); pit.scale.set(0.52, 0.06, 0.32); pit.position.set(-0.18, 0.5, 0); body.add(pit);
  const ws = new THREE.Group(); ws.position.set(0.12, 0.48, 0); ws.rotation.z = 0.45; body.add(ws);
  const gl = glassArc(0.3, 0.9, 0.24); gl.position.y = 0.12; ws.add(gl);
  const f1 = arc(0.3, 0.9, 0.018, M.ink); f1.position.y = 0.24; ws.add(f1);
  // the pilot: leather flying helmet, goggles, scarf
  const pl = pilot(body, { x: -0.18, y: 0.1, s: 0.66, suit: LEATHER, glove: M.ink, hat: 'aviator' });
  // cockpit side hatch, hinged at the bottom; only shown in the marker transition (see `fx`)
  const hatches = [1, -1].map((s) => {
    const h = new THREE.Group(); h.position.set(-0.18, 0.04, 0.42 * s); h.visible = false; body.add(h);
    const p = box(0.6, 0.32, 0.035, M.orange, OUT); p.position.y = 0.16; h.add(p);
    const lining = box(0.54, 0.27, 0.02, M.ink, null); lining.position.set(0, 0.16, -0.025 * s); h.add(lining);
    const hd = box(0.12, 0.03, 0.03, M.paper, null); hd.position.set(0.12, 0.25, 0.025 * s); h.add(hd);
    return { s, h };
  });
  // low wing: rectangular planform, a touch of dihedral, track-colour tips
  const af = (c, t) => shapeOf((s) => { s.moveTo(0.5 * c, 0); s.quadraticCurveTo(0.55 * c, t, 0.1 * c, t); s.quadraticCurveTo(-0.3 * c, t * 0.9, -0.5 * c, 0.01); s.quadraticCurveTo(0, -t * 0.25, 0.5 * c, 0); });
  for (const s of [1, -1]) {
    const half = new THREE.Group(); half.position.set(0.35, -0.34, 0); half.rotation.x = -0.07 * s; body.add(half);
    const w = extrudeShape(af(1.4, 0.18), 3.0, M.paper, OUT, 0.04); w.position.z = 1.5 * s; half.add(w);
    const tip = extrudeShape(af(1.4, 0.18), 0.32, M.orange, OUT_T, 0.04); tip.position.z = 3.14 * s; half.add(tip);
    const ail = box(0.03, 0.012, 1.2, M.ink, null); ail.position.set(-0.42, 0.13, 2.2 * s); half.add(ail);
    roundel(half, 0.05, 0.235, 2.3 * s, 0.22).rotation.x = -Math.PI / 2;
  }
  // tail: stabiliser + fin with the number
  const st = extrudeShape(af(0.8, 0.08), 2.3, M.paper, OUT_T, 0.03); st.position.set(-2.2, 0.08, 0); body.add(st);
  for (const s of [1, -1]) { const tp = extrudeShape(af(0.8, 0.08), 0.22, M.orange, OUT_T, 0.03); tp.position.set(-2.2, 0.08, 1.27 * s); body.add(tp); }
  body.add(extrudeShape(shapeOf((s) => { s.moveTo(-1.72, 0.22); s.quadraticCurveTo(-2.0, 0.4, -2.22, 0.98); s.lineTo(-2.5, 1.0); s.quadraticCurveTo(-2.64, 0.92, -2.62, 0.6); s.lineTo(-2.56, 0.12); s.lineTo(-1.72, 0.22); }), 0.07, M.orange, OUT_T, 0.025));
  for (const s of [1, -1]) roundel(body, -2.33, 0.6, 0.075 * s, 0.13, s < 0);
  for (const s of [1, -1]) roundel(body, -0.95, 0.03, 0.335 * s, 0.15, s < 0);
  // landing gear: V legs, fat tyres, tail wheel
  for (const s of [1, -1]) { body.add(seg(V(0.72, -0.42, 0.2 * s), V(0.86, -1.1, 0.72 * s), 0.035, M.ink, null)); body.add(seg(V(0.2, -0.45, 0.2 * s), V(0.86, -1.1, 0.72 * s), 0.03, M.ink, null)); wheel(body, 0.86, -1.12, 0.76 * s, 0.26, 0.16, { face: 0.55 }); }
  body.add(seg(V(-2.2, -0.05), V(-2.32, -0.3), 0.025, M.ink, null)); wheel(body, -2.34, -0.34, 0, 0.09, 0.06, { face: 0.5 });
  // propeller: spinner, two blades with track-colour tips, a pale blur disc
  const prop = new THREE.Group(); prop.position.set(1.97, 0, 0); body.add(prop);
  const spn = new THREE.ConeGeometry(0.2, 0.38, 24); spn.rotateZ(-Math.PI / 2); spn.translate(0.18, 0, 0); prop.add(part(spn, M.orange, OUT_T));
  for (const s of [1, -1]) {
    const bl = part(new THREE.CapsuleGeometry(0.075, 0.78, 4, 10), M.ink, OUT_T); bl.scale.set(0.35, 1, 1); bl.position.set(0.06, 0.5 * s, 0); bl.rotation.y = 0.3; prop.add(bl);
    const tp = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.1, 4, 10), M.orange); tp.scale.set(0.38, 1, 1.05); tp.position.set(0.06, 0.9 * s, 0); tp.rotation.y = 0.3; prop.add(tp);
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.0, 48), new THREE.MeshBasicMaterial({ color: PAPER, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })); disc.rotation.y = Math.PI / 2; disc.position.x = 2.05; body.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.008, 4, 64), M.ink); ring.rotation.y = Math.PI / 2; ring.position.x = 2.05; body.add(ring);

  function pose(t) {
    prop.rotation.x = t * 15.6;
    fly.position.y = ALT + 0.1 * Math.sin(t * 0.8);
    plane.rotation.z = 0.03 * Math.sin(t * 0.6);
    plane.rotation.x = 0.05 * Math.sin(t * 0.5 + 1);
    pl.head.rotation.y = -0.25 + 0.35 * Math.sin(t * 0.45); pl.head.rotation.z = 0.05 * Math.sin(t * 0.9);
    pl.scarf.forEach((g, i) => { g.rotation.y = 0.32 * Math.sin(t * 9 - i * 0.9); g.rotation.z = 0.12 * Math.sin(t * 7 - i); });
    const rest = (A) => { A.up.rotation.set(-0.1 * A.s, 0, 0.7); A.el.rotation.set(0, 0, 0.9); };
    waveArm(pl.arms[0], t, 5, rest); rest(pl.arms[1]);
    const blink = (t % 3.84) > 3.66; for (const e of pl.eyes) e.scale.y = blink ? 0.15 : 1;
  }
  /** Marker transition only: the hatch on the boarding side, 0 shut … 1 folded down open. */
  function fx({ door = 0, side = 1 }) {
    for (const H of hatches) { H.h.visible = H.s === side && door > 0.02; H.h.rotation.x = H.s * (-0.38 + 2.2 * door); }
  }
  return { root, pose, crew: [pl.P], fx };
}




  // Scene-only mode: the marker transition renders this model inside its own stage.




  if (!canvas) return { model: makeRunner(), kit: { part, fill, M, OUT, OUT_T, BOIL } };




  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(256, 256, false);
  const scene = new THREE.Scene();
  const { root, pose } = makeRunner(); scene.add(root);
  const camera = new THREE.OrthographicCamera(-4.4, 4.4, 4.4, -4.4, 0.1, 100);
  let previewFramed = false;
  let lastColor = null;
  function render(timeMs, heading, mapBearing, pitch, color, preview = false) {
    if (preview && !previewFramed) {
      // Give the turning character room on every side without changing map framing.
      const extent = 4.4;
      camera.left = -extent; camera.right = extent;
      camera.bottom = -extent; camera.top = extent;
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
    camera.position.set(-8 * Math.sin(bearing) * Math.sin(inclination), 8 * Math.cos(inclination) + 1.9, 8 * Math.cos(bearing) * Math.sin(inclination));
    camera.up.set(0, 1, 0); camera.lookAt(0, 1.9, 0); renderer.render(scene, camera);
  }
  function dispose() {
    const geometries = new Set(), materials = new Set();
    root.traverse(obj => { if (obj.geometry) geometries.add(obj.geometry); if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => materials.add(m)); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    plateTex.dispose(); stripeTex.dispose(); renderer.dispose();
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
