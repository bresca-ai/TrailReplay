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
  if (o.hat === 'driver') {
    // bus driver's uniform cap: navy top, track-colour band, black peak, small badge
    const dc = new THREE.Group(); dc.position.y = 0.19; dc.rotation.z = 0.08; head.add(dc);
    const band = part(new THREE.CylinderGeometry(0.365, 0.355, 0.12, 36), M.orange, OUT_T); band.position.y = 0.06; dc.add(band);
    const top = part(new THREE.CylinderGeometry(0.42, 0.37, 0.14, 36), NAVY); top.position.y = 0.19; top.scale.x = 1.05; dc.add(top);
    const peak = halfDisc(0.3, 0.035, M.ink); peak.scale.set(0.6, 1, 1); peak.position.set(0.3, 0.0, 0); peak.rotation.z = -0.35; dc.add(peak);
    const badge = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), GOLD); badge.scale.set(0.4, 1, 1); badge.position.set(0.365, 0.07, 0); dc.add(badge);
  }
  if (o.hat === 'beanie') {
    // knitted beanie with a folded cuff and a pom-pom
    const bm = o.hatMat || M.orange;
    const bn = part(new THREE.SphereGeometry(HR + 0.035, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), bm); bn.rotation.z = 0.3; bn.scale.y = 1.12; head.add(bn);
    const cuff = part(new THREE.TorusGeometry(HR - 0.01, 0.07, 8, 40), bm, OUT_T); cuff.rotation.x = Math.PI / 2; const cg = new THREE.Group(); cg.add(cuff); cg.rotation.z = 0.3; cg.position.y = 0.06; head.add(cg);
    const pom = part(new THREE.SphereGeometry(0.1, 14, 10), M.paper, OUT_T); pom.position.set(-0.13, 0.4, 0); head.add(pom);
  }
  if (o.tie) { const tie = box(0.02, 0.36, 0.08, o.tie, null); tie.position.set(0.215, 0.82, 0); tie.rotation.z = 0.12; P.add(tie); }
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

/* ---------- the bus: retro city bus with see-through windows (faces +X) ---------- */
function makeRunner() {
  const root = new THREE.Group();
  const GLASS = new THREE.MeshBasicMaterial({ color: 0xDCE8EC, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
  const R = 0.42, AX = [1.55, -1.55];
  const wheels = [];
  for (const x of AX) for (const s of [1, -1]) wheels.push(wheel(root, x, R, 0.66 * s, R, 0.28, { face: 0.6 }));
  const body = new THREE.Group(); root.add(body);
  const W = 1.3, HZ = W / 2;
  // lower body (track colour), white belt stripe, white roof with rounded corners
  body.add(extrudeShape(shapeOf((s) => { s.moveTo(-2.55, 0.55); s.quadraticCurveTo(-2.55, 0.3, -2.3, 0.3); s.lineTo(2.3, 0.3); s.quadraticCurveTo(2.55, 0.3, 2.55, 0.55); s.lineTo(2.55, 1.2); s.lineTo(-2.55, 1.2); s.lineTo(-2.55, 0.55); }), W, M.orange, OUT, 0.05));
  const belt = box(5.16, 0.08, W + 0.12, M.paper); belt.position.set(0, 0.98, 0); body.add(belt);
  body.add(extrudeShape(shapeOf((s) => { s.moveTo(-2.55, 1.95); s.lineTo(2.55, 1.95); s.lineTo(2.55, 2.1); s.quadraticCurveTo(2.55, 2.34, 2.3, 2.34); s.lineTo(-2.3, 2.34); s.quadraticCurveTo(-2.55, 2.34, -2.55, 2.1); s.lineTo(-2.55, 1.95); }), W, M.paper, OUT, 0.05));
  const vent = box(0.9, 0.1, 0.7, M.paper); vent.position.set(-0.6, 2.42, 0); body.add(vent);
  // window band: pillars, rails and glass you can see the people through
  for (const y of [1.22, 1.93]) for (const s of [1, -1]) { const r = box(5.1, 0.05, 0.05, M.ink, null); r.position.set(0, y, (HZ + 0.03) * s); body.add(r); }
  const PIL = [-2.47, -1.6, -0.7, 0.2, 1.1, 1.62, 2.47];
  for (const s of [1, -1]) for (const x of PIL) { if (s > 0 && x === 1.62) continue; const p = box(0.13, 0.74, 0.08, M.orange, OUT_T); p.position.set(x, 1.575, (HZ - 0.02) * s); body.add(p); }
  for (const s of [1, -1]) { const g = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 0.7), GLASS); g.position.set(0, 1.575, (HZ - 0.02) * s); body.add(g); }
  for (const x of [2.53, -2.53]) { const g = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, 0.7), GLASS); g.rotation.y = Math.PI / 2; g.position.set(x, 1.575, 0); body.add(g); }
  const mid = box(0.06, 0.74, 0.07, M.orange, OUT_T); mid.position.set(2.5, 1.575, 0); body.add(mid);
  // front door on the right side: tall glass leaves with ink frames
  for (const x of [1.72, 2.0]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 1.45), GLASS); d.position.set(x, 1.2, HZ + 0.06); body.add(d); for (const dy of [-0.72, 0.72]) { const f = box(0.28, 0.03, 0.03, M.ink, null); f.position.set(x, 1.2 + dy, HZ + 0.07); body.add(f); } for (const dx of [-0.13, 0.13]) { const f = box(0.03, 1.45, 0.03, M.ink, null); f.position.set(x + dx, 1.2, HZ + 0.07); body.add(f); } }
  // destination sign
  const signTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d'); g.fillStyle = '#1B2A20'; g.fillRect(0, 0, 512, 96); g.fillStyle = '#F2C14E'; g.font = '800 62px system-ui,sans-serif'; g.textBaseline = 'middle'; g.fillText('42', 22, 52); g.font = '700 50px system-ui,sans-serif'; g.fillText('TRAILHEAD', 118, 52); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.19), new THREE.MeshBasicMaterial({ map: signTex })); sign.rotation.y = Math.PI / 2; sign.position.set(2.61, 2.12, 0); body.add(sign);
  // front: headlights, grille, bumper, mirrors; back: tail lights, bumper
  for (const s of [1, -1]) {
    const hl = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), new THREE.MeshBasicMaterial({ color: 0xFFF3C4 })); hl.rotation.y = Math.PI / 2; hl.position.set(2.61, 0.66, 0.44 * s); body.add(hl);
    const hr = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 24), M.ink); hr.rotation.y = Math.PI / 2; hr.position.copy(hl.position); body.add(hr);
    body.add(seg(V(2.5, 1.88, 0.62 * s), V(2.78, 1.86, 0.78 * s), 0.018, M.ink, null));
    const mr = box(0.05, 0.3, 0.13, M.ink); mr.position.set(2.8, 1.68, 0.8 * s); body.add(mr);
    const tl = box(0.04, 0.22, 0.14, M.orange, OUT_T); tl.position.set(-2.62, 0.75, 0.44 * s); body.add(tl);
  }
  for (const y of [0.78, 0.86, 0.94]) { const g = box(0.03, 0.025, 0.5, M.ink, null); g.position.set(2.61, y, 0); body.add(g); }
  for (const x of [2.62, -2.62]) { const b = box(0.12, 0.16, W + 0.14, M.ink); b.position.set(x, 0.38, 0); body.add(b); }
  // wheel arches and the fleet number
  for (const x of AX) for (const s of [1, -1]) { const a = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 24, Math.PI), M.ink); a.position.set(x, 0.42, (HZ + 0.06) * s); body.add(a); }
  for (const s of [1, -1]) roundel(body, -0.25, 0.64, (HZ + 0.06) * s, 0.15, s < 0);
  // the driver (left seat), steering wheel, and two passengers
  const dv = pilot(body, { x: 1.95, y: 0.72, z: -0.3, s: 0.66, suit: fill(0xBFD4E6, 0), tie: M.ink, hat: 'driver' });
  const sw = new THREE.Group(); sw.position.set(2.32, 1.25, -0.3); sw.rotation.z = 0.9; body.add(sw);
  const swr = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 28), M.ink); swr.rotation.y = Math.PI / 2; sw.add(swr);
  const p1 = pilot(body, { x: -0.25, y: 0.76, z: 0.28, s: 0.66, suit: M.green, hat: 'beanie' });
  const p2 = pilot(body, { x: -1.15, y: 0.76, z: -0.28, s: 0.66, suit: NAVY, hat: 'beanie', hatMat: M.paper });

  function pose(t) {
    for (const w of wheels) w.rotation.z = -t * 14;
    body.position.y = 0.012 * Math.abs(Math.sin(t * 11)); body.rotation.x = 0.008 * Math.sin(t * 1.3); body.rotation.z = 0.004 * Math.sin(t * 5);
    sw.rotation.x = 0.25 * Math.sin(t * 0.7);
    const drive = (A) => { A.up.rotation.set(0, 0.2 * A.s, 1.15 + 0.08 * Math.sin(t * 0.7) * A.s); A.el.rotation.set(0, 0, 0.6); };
    for (const A of dv.arms) drive(A);
    dv.head.rotation.y = -0.15 + 0.3 * Math.sin(t * 0.5);
    const sit = (A) => { A.up.rotation.set(0, 0, 0.35); A.el.rotation.set(0, 0, 1.1); };
    waveArm(p1.arms[0], t + 0.5, 4.5, sit); sit(p1.arms[1]); for (const A of p2.arms) sit(A);
    p1.head.rotation.y = -0.9 + 0.3 * Math.sin(t * 0.6); p2.head.rotation.y = 0.5 * Math.sin(t * 0.4 + 2);
    for (const p of [p1, p2]) p.P.position.y = 0.76 + 0.015 * Math.abs(Math.sin(t * 11 + p.P.position.x));
    const blink = (t % 3.84) > 3.66; for (const p of [dv, p1, p2]) for (const e of p.eyes) e.scale.y = blink ? 0.15 : 1;
  }
  return { root, pose };
}




  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(256, 256, false);
  const scene = new THREE.Scene();
  const { root, pose } = makeRunner(); scene.add(root);
  const camera = new THREE.OrthographicCamera(-4.2, 4.2, 4.2, -4.2, 0.1, 100);
  let previewFramed = false;
  let lastColor = null;
  function render(timeMs, heading, mapBearing, pitch, color, preview = false) {
    if (preview && !previewFramed) {
      // Give the turning character room on every side without changing map framing.
      const extent = 4.2;
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
    camera.position.set(-8 * Math.sin(bearing) * Math.sin(inclination), 8 * Math.cos(inclination) + 1.25, 8 * Math.cos(bearing) * Math.sin(inclination));
    camera.up.set(0, 1, 0); camera.lookAt(0, 1.25, 0); renderer.render(scene, camera);
  }
  function dispose() {
    const geometries = new Set(), materials = new Set();
    root.traverse(obj => { if (obj.geometry) geometries.add(obj.geometry); if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => materials.add(m)); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => { if (m.map && m.map !== plateTex && m.map !== stripeTex) m.map.dispose(); m.dispose(); });
    plateTex.dispose(); stripeTex.dispose(); renderer.dispose();
  }
  return { render, dispose };
}
