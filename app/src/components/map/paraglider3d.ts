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

/* ---------- paraglider: wing, lines, risers, pod harness and pilot (flies towards +X) ---------- */
function line(a, b, r = 0.007, mat = M.ink) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 5), mat); setLine(m, a, b); return m; }
function setLine(m, a, b) { m.position.copy(a).lerp(b, 0.5); m.scale.y = a.distanceTo(b); m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); }
function makeRunner() {
  const root = new THREE.Group();
  const glider = new THREE.Group(); root.add(glider);     // everything sways together, so the lines stay attached
  const KIT = M.orange, SUIT = M.green, SKIN = M.paper;

  /* ---------------- wing: arched canopy of cells, alternating track colour and white, open cell mouths ---------------- */
  const wing = new THREE.Group(); glider.add(wing);
  const N = 15, R = 3.4, CY = 3.5, A0 = THREE.MathUtils.degToRad(68);
  const cells = [], attach = [];
  for (let i = 0; i < N; i++) {
    const th = -A0 + (i + 0.5) * (2 * A0 / N);
    const k = 1 - Math.pow(Math.abs(th) / A0, 2) * 0.42;           // chord + thickness taper to the tips
    const c = 1.55 * k, tk = 0.24 * k, w = (R + tk) * (2 * A0 / N) * 1.04;
    const s = new THREE.Shape();
    s.moveTo(0.42 * c, -0.02 * c);
    s.quadraticCurveTo(0.5 * c, tk * 0.7, 0.15 * c, tk);
    s.quadraticCurveTo(-0.2 * c, tk * 0.95, -0.58 * c, 0.02);
    s.quadraticCurveTo(-0.1 * c, -0.03, 0.42 * c, -0.02 * c);
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false, curveSegments: 14 }); g.translate(0, 0, -w / 2);
    const cell = new THREE.Group();
    cell.add(part(g, i % 2 ? M.paper : KIT, OUT_T));
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(1, 16), M.ink); mouth.scale.set(tk * 0.38, tk * 0.32, 1); mouth.rotation.y = Math.PI / 2; mouth.position.set(0.44 * c, tk * 0.32, 0); cell.add(mouth);
    cell.position.set(0, CY + R * Math.cos(th), R * Math.sin(th));
    cell.rotation.x = th;
    wing.add(cell); cells.push({ cell, th, c });
    // line attachment points under the cell (front A-line, rear C-line, trailing edge brake)
    const down = V(0, -Math.cos(th), -Math.sin(th));
    const base = V(0, CY + R * Math.cos(th), R * Math.sin(th)).addScaledVector(down, 0.01);
    attach.push({ th, a: base.clone().add(V(0.3 * c, 0, 0)), b: base.clone().add(V(-0.22 * c, 0, 0)), te: base.clone().add(V(-0.56 * c, 0.02, 0)) });
  }

  /* ---------------- pilot in a pod harness ---------------- */
  const PS = 1.6; const pilot = new THREE.Group(); pilot.position.set(0, 1.2, 0); pilot.scale.setScalar(PS); glider.add(pilot);
  // pod: long cocoon from the hips to the feet, track-colour flank stripe, reserve handle, speed bar
  const podG = new THREE.CapsuleGeometry(0.3, 1.25, 8, 20); podG.rotateZ(Math.PI / 2); podG.translate(0.55, 0, 0);
  const pod = part(podG, SUIT); pod.scale.set(1, 0.82, 1.12); pilot.add(pod);
  for (const s of [1, -1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.012), KIT); st.position.set(0.55, 0.02, 0.335 * s); pilot.add(st); }
  const toe = part(new THREE.SphereGeometry(0.2, 18, 14), M.ink, OUT_T); toe.position.set(1.48, 0.0, 0); toe.scale.set(0.6, 0.95, 1.3); pilot.add(toe);
  const back = part(new THREE.CapsuleGeometry(0.3, 0.42, 8, 18), M.ink); back.position.set(-0.36, 0.42, 0); back.scale.set(0.62, 1, 1.15); pilot.add(back);
  const resH = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 16), KIT); resH.position.set(0.05, 0.1, 0.36); pilot.add(resH);
  pilot.add(seg(V(1.25, -0.32, 0.3), V(1.25, -0.32, -0.3), 0.022, M.ink, OUT_T));
  for (const s of [1, -1]) pilot.add(line(V(1.25, -0.32, 0.28 * s), V(0.05, 0.36, 0.24 * s), 0.006));
  // cockpit with a vario/GPS on top, angled to the pilot
  const ck = part(new THREE.BoxGeometry(0.42, 0.14, 0.42), M.ink); ck.position.set(0.48, 0.3, 0); ck.rotation.z = -0.15; pilot.add(ck);
  const vario = part(new THREE.BoxGeometry(0.3, 0.035, 0.2), M.paper, OUT_T); vario.position.set(0.47, 0.39, 0); vario.rotation.z = 0.35; pilot.add(vario);
  for (const [dx, w] of [[-0.06, 0.12], [0.02, 0.08], [0.08, 0.1]]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.005, w), M.ink); bar.position.set(0.47 + dx, 0.41 + dx * 0.36, 0); bar.rotation.z = 0.35; pilot.add(bar); }
  // torso in a flight jacket, chest strap, shoulder straps
  const torso = seg(V(-0.02, 0.2), V(-0.08, 0.86), 0.26, SUIT); torso.scale.set(1, 1, 1.05); pilot.add(torso);
  pilot.add(seg(V(0.2, 0.52, 0.22), V(0.2, 0.52, -0.22), 0.018, M.ink, null));
  for (const s of [1, -1]) pilot.add(seg(V(0.12, 0.9, 0.2 * s), V(0.22, 0.3, 0.22 * s), 0.03, M.ink, null));
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 6, 22), KIT); collar.rotation.x = Math.PI / 2; collar.position.set(-0.07, 0.98, 0); pilot.add(collar);
  // carabiners + risers (webbing in the track colour)
  const RISER = [];
  for (const s of [1, -1]) {
    const cb = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 6, 16), M.ink); cb.position.set(0.05, 0.36, 0.25 * s); pilot.add(cb);
    pilot.add(seg(V(0.05, 0.4, 0.25 * s), V(0.05, 1.3, 0.3 * s), 0.024, KIT, OUT_T));
    pilot.add(seg(V(0.12, 0.4, 0.25 * s), V(0.12, 1.3, 0.3 * s), 0.02, KIT, null));
    RISER.push(V(0.08 * PS, 1.2 + 1.3 * PS, 0.3 * PS * s));
  }
  // head: icon face, open-face helmet with ear covers, sunglasses
  const head = new THREE.Group(); head.position.set(-0.04, 1.22, 0); pilot.add(head);
  pilot.add(seg(V(-0.07, 0.95), V(-0.05, 1.05), 0.075, SKIN, OUT_T));
  const HR = 0.34;
  head.add(part(new THREE.SphereGeometry(HR, 34, 24), SKIN));
  const shell = part(new THREE.SphereGeometry(HR + 0.05, 36, 22, 0, Math.PI * 2, 0, Math.PI * 0.6), M.paper); shell.rotation.z = 0.45; head.add(shell);
  const hs = new THREE.Mesh(new THREE.TorusGeometry(HR + 0.055, 0.03, 6, 48, Math.PI * 0.9), KIT); hs.rotation.z = 0.5; head.add(hs);
  for (const s of [1, -1]) { const ear = part(new THREE.SphereGeometry(0.13, 16, 12), M.paper, OUT_T); ear.scale.set(1, 1.1, 0.45); ear.position.set(-0.06, -0.06, (HR + 0.02) * s); head.add(ear); head.add(seg(V(-0.02, -0.15, 0.3 * s), V(0.1, -0.36, 0.2 * s), 0.011, M.ink, null)); }
  const onHead = (obj, yaw, pitch, lift = 0) => { const y = THREE.MathUtils.degToRad(yaw), p = THREE.MathUtils.degToRad(pitch); const d = V(Math.cos(p) * Math.cos(y), Math.sin(p), Math.cos(p) * Math.sin(y)); obj.position.copy(d).multiplyScalar(HR + lift); obj.quaternion.setFromUnitVectors(V(0, 0, 1), d); head.add(obj); return obj; };
  const WHITE = new THREE.MeshBasicMaterial({ color: PAPER });
  const eyes = [];
  for (const s of [1, -1]) { const e = new THREE.Group(); const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), M.ink); ball.scale.set(0.066, 0.09, 0.03); e.add(ball); const sl = new THREE.Mesh(new THREE.CircleGeometry(1, 16), WHITE); sl.scale.set(0.012, 0.028, 1); sl.position.set(0.01 * s, 0.008, 0.032); e.add(sl); onHead(e, 26 * s, 2, 0.032); eyes.push(e); }
  const lens = new THREE.Mesh(new THREE.SphereGeometry(HR + 0.018, 40, 16, -1.1, 2.2, Math.PI * 0.43, Math.PI * 0.15), LENS); lens.rotation.y = Math.PI; head.add(lens);
  const fr = new THREE.Mesh(new THREE.SphereGeometry(HR + 0.024, 40, 4, -1.15, 2.3, Math.PI * 0.415, Math.PI * 0.03), M.ink); fr.rotation.y = Math.PI; head.add(fr);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.016, 8, 24, 1.6), M.ink); const sm = new THREE.Group(); smile.rotation.z = Math.PI + (Math.PI - 1.6) / 2 + 0.2; smile.position.y = 0.06; sm.add(smile); onHead(sm, 12, -24, -0.004);
  // arms: jacket sleeves, gloves holding the brake toggles up by the risers
  const arms = [];
  for (const s of [1, -1]) {
    const S = V(-0.05, 0.8, 0.3 * s);
    const sh = new THREE.Group(); sh.position.copy(S); pilot.add(sh);
    const up = new THREE.Group(); sh.add(up); up.add(bone(0.4, 0.085, SUIT));
    const el = new THREE.Group(); el.position.y = -0.4; up.add(el); el.add(bone(0.36, 0.078, SUIT));
    const glove = part(new THREE.SphereGeometry(0.09, 16, 12), M.ink, OUT_T); glove.position.y = -0.38; el.add(glove);
    const toggle = part(new THREE.CapsuleGeometry(0.03, 0.12, 4, 8), KIT, OUT_T); toggle.position.set(0.04, -0.4, 0); toggle.rotation.z = Math.PI / 2; el.add(toggle);
    const hand = new THREE.Object3D(); hand.position.y = -0.4; el.add(hand);
    arms.push({ s, sh, up, el, hand });
  }

  /* ---------------- suspension lines: A and C lines to the risers, brake lines to the hands ---------------- */
  const LINES = new THREE.Group(); glider.add(LINES);
  for (const P of attach) {
    const rz = P.th > 0 ? RISER[0] : RISER[1];
    LINES.add(line(P.a, rz)); LINES.add(line(P.b, rz.clone().add(V(-0.04, 0, 0))));
  }
  const brakes = [];
  for (const P of attach) { if (Math.abs(P.th) < A0 * 0.35) continue; const m = line(P.te, V(0, 0, 0), 0.006); m.userData.te = P.te; m.userData.side = P.th > 0 ? 0 : 1; LINES.add(m); brakes.push(m); }

  const tmp = V(0, 0, 0);
  function pose(t) {
    // slow pendulum + gentle bank, a breathing wing, small brake inputs, pilot looking around
    glider.rotation.x = 0.07 * Math.sin(t * 0.7);
    glider.rotation.z = 0.025 * Math.sin(t * 0.9 + 1);
    glider.position.y = 0.12 * Math.sin(t * 0.6);
    for (const C of cells) C.cell.scale.y = 1 + 0.05 * Math.sin(t * 2.2 + C.th * 3);
    for (const A of arms) {
      const brake = 0.12 + 0.1 * Math.sin(t * 0.8 + (A.s > 0 ? 0 : 1.8));
      A.up.rotation.z = Math.PI - 0.25 - brake * 0.8; A.up.rotation.x = -0.32 * A.s;
      A.el.rotation.z = 0.55 + brake;
    }
    head.rotation.y = 0.45 * Math.sin(t * 0.45); head.rotation.z = 0.05 * Math.sin(t * 0.9);
    pilot.updateMatrixWorld(true); glider.updateMatrixWorld(true);
    for (const m of brakes) { arms[m.userData.side].hand.getWorldPosition(tmp); glider.worldToLocal(tmp); setLine(m, m.userData.te, tmp); }
    const blink = (t % 3.84) > 3.66; for (const e of eyes) e.scale.y = blink ? 0.15 : 1;
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
      const extent = 4.3;
      camera.left = -extent; camera.right = extent;
      camera.bottom = -extent; camera.top = extent;
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
    camera.position.set(-8 * Math.sin(bearing) * Math.sin(inclination), 8 * Math.cos(inclination) + 3.4, 8 * Math.cos(bearing) * Math.sin(inclination));
    camera.up.set(0, 1, 0); camera.lookAt(0, 3.4, 0); renderer.render(scene, camera);
  }
  function dispose() {
    const geometries = new Set(), materials = new Set();
    root.traverse(obj => { if (obj.geometry) geometries.add(obj.geometry); if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => materials.add(m)); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    bibTex.dispose(); renderer.dispose();
  }
  return { render, dispose };
}
