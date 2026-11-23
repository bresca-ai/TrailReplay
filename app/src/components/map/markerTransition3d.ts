// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- Procedural choreography shared with the 3D marker models.
// @ts-nocheck
// Marker transitions: when the 3D marker changes model between journey segments the
// person gets off the old one (Finish), stands in a neutral pose, then gets on the next
// one (Get ready). Puffs mean gear on/off; vehicles pop in and out.
import * as THREE from 'three';
import { markerClipDurations } from '@/utils/markerTransitions';

const TV = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const c01 = (x) => Math.max(0, Math.min(1, x));
const sm = (x) => { x = c01(x); return x * x * (3 - 2 * x); };
const sp = (t, a, b) => c01((t - a) / (b - a));
const es = (t, a, b) => sm(sp(t, a, b));
const lerp = (a, b, k) => a + (b - a) * k;
const PI = Math.PI, FV = PI / 2;
let FC = -PI / 2;          // yaw that faces the camera / faces the vehicle from the near side
function mix(A, B, k) { if (typeof A === 'number') return A + (B - A) * k; if (Array.isArray(A)) return A.map((x, i) => mix(x, B[i], k)); const o = {}; for (const key in A) o[key] = mix(A[key], B[key], k); return o; }
const clone = (p) => JSON.parse(JSON.stringify(p));
function W(p, o) { const q = clone(p); const rec = (a, b) => { for (const k in b) { const v = b[k]; if (Array.isArray(v)) v.forEach((x, i) => { if (x) Object.assign(a[k][i], x); }); else if (v && typeof v === 'object') rec(a[k], v); else a[k] = v; } }; rec(q, o); return q; }
function keys(k, list) { if (k <= list[0][0]) return list[0][1]; for (let i = 1; i < list.length; i++) if (k <= list[i][0]) { const [ka, pa] = list[i - 1], [kb, pb] = list[i]; return mix(pa, pb, sm((k - ka) / (kb - ka))); } return list[list.length - 1][1]; }
const popIn = (k) => k <= 0 ? 0.001 : k >= 1 ? 1 : 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
const popOut = (k) => k >= 1 ? 0.001 : popIn(1 - k);
// model clock: speeds up from standstill / rolls to a stop
const rampUp = (t, a, D) => t < a ? 0 : t < a + D ? (t - a) * (t - a) / (2 * D) : (t - a) - D / 2;
const rampDown = (t, a, D) => t < a ? t : t < a + D ? a + (t - a) - (t - a) * (t - a) / (2 * D) : a + D / 2;

/* ---------- per-model staging: where the seat is, how big the person is, how they get on ---------- */
const BIKE_R = { lean: -0.97, L: [{ f: 0.85, a: 0.08, k: 1.35, n: -0.25 }, { f: 0.35, a: 0.08, k: 0.75, n: -0.25 }], A: [{ f: 1.85, a: 0.2, e: 0.15 }, { f: 1.85, a: 0.2, e: 0.15 }] };
const BIKE_P = { s: 0.857, legK: 1.93, torsoK: 1.5, armK: 1.9 };
const JETTY = { into: 'step', prop: 'jetty' };
export const MODEL_STAGING = {
  '3d-runner': { group: 'foot', noun: 'runner', T: 0.64, person: { s: 1 } },
  '3d-trail-runner': { group: 'foot', noun: 'trail runner', T: 0.68, person: { s: 1 } },
  '3d-road-runner': { group: 'foot', noun: 'road runner', T: 0.58, person: { s: 1 } },
  '3d-hiker': { group: 'foot', noun: 'hiker', T: 1.1, gaitA: 0.5, person: { s: 1 } },
  // road and gravel shoes clip into the pedals
  '3d-road-bike': { group: 'ride', noun: 'bike', clip: true, seat: { x: -0.58, y: 1.94, z: 0 }, stand: { x: -0.45, z: 0.8 }, person: BIKE_P, R: BIKE_R },
  '3d-gravel-bike': { group: 'ride', noun: 'bike', clip: true, seat: { x: -0.58, y: 1.94, z: 0 }, stand: { x: -0.45, z: 0.8 }, person: BIKE_P, R: BIKE_R },
  '3d-mountain-bike': { group: 'ride', noun: 'bike', seat: { x: -0.58, y: 1.94, z: 0 }, stand: { x: -0.45, z: 0.85 }, person: BIKE_P, R: { ...BIKE_R, lean: -0.85, A: [{ f: 1.75, a: 0.35, e: 0.2 }, { f: 1.75, a: 0.35, e: 0.2 }] } },
  // motorbikes: helmet on, leg over, kick-start
  '3d-motorbike': { group: 'ride', noun: 'motorbike', helmet: true, kick: true, seat: { x: -0.42, y: 1.38, z: 0 }, stand: { x: -0.3, z: 0.9 }, person: { s: 0.88, legK: 1.28, torsoK: 1.2, armK: 1.2 },
    R: { lean: -0.71, L: [{ f: 1.23, a: 0.25, k: 1.63, n: 0.3 }, { f: 1.23, a: 0.25, k: 1.63, n: 0.3 }], A: [{ f: 1.72, a: 0.15, e: 0.4 }, { f: 1.72, a: 0.15, e: 0.4 }] } },
  '3d-race-motorbike': { group: 'ride', noun: 'superbike', helmet: true, kick: true, seat: { x: -0.52, y: 1.36, z: 0 }, stand: { x: -0.4, z: 0.95 }, person: { s: 0.71, legK: 1.62, torsoK: 1.4, armK: 1.5 },
    R: { lean: -1.34, L: [{ f: 1.18, a: 0.3, k: 2.4, n: 0.3 }, { f: 1.18, a: 0.3, k: 2.4, n: 0.3 }], A: [{ f: 2.5, a: 0.2, e: 0.3 }, { f: 2.5, a: 0.2, e: 0.3 }] } },
  '3d-motocross': { group: 'ride', noun: 'dirt bike', helmet: true, kick: true, seat: { x: -0.36, y: 1.74, z: 0 }, stand: { x: -0.3, z: 0.9 }, person: { s: 0.71, legK: 2.0, torsoK: 1.2, armK: 1.5 },
    R: { lean: -0.76, L: [{ f: 0.95, a: 0.2, k: 1.59, n: 0.3 }, { f: 0.95, a: 0.2, k: 1.59, n: 0.3 }], A: [{ f: 1.87, a: 0.5, e: 0.3 }, { f: 1.87, a: 0.5, e: 0.3 }] } },
  // cars: over the halo and down into the cockpit / feet first through the window
  '3d-race-car': { group: 'climb', kind: 'race-car', noun: 'race car', into: 'drop', dropH: 1.25, seat: { x: -0.1, y: 0.3, z: 0 }, person: { s: 0.57, torsoK: 1.1, armK: 1.15 } },
  '3d-rally': { group: 'climb', kind: 'rally', noun: 'rally car', into: 'window', sill: 0.34, winZ: 0.62, seat: { x: -0.55, y: 0.92, z: 0.3 }, person: { s: 0.476, torsoK: 1.1, armK: 1.15 } },
  // bus: the doors fold open and they step up through them
  '3d-bus': { group: 'climb', kind: 'bus', noun: 'bus', into: 'walk', seat: 'auto', person: { s: 0.44 } },
  // train: up onto the platform, then up into the cab
  '3d-train': { group: 'climb', kind: 'train', noun: 'train', prop: 'platform', seat: 'auto', seatPose: { lean: -0.1 } },
  // plane: up the stairs, into the cockpit, the hatch shuts
  '3d-plane': { group: 'climb', kind: 'plane', noun: 'plane', prop: 'stairs', seat: 'auto', air: 'plane' },
  // boats: along the jetty, a leg over the side, and the boat rocks
  '3d-boat': { group: 'climb', kind: 'boat', noun: 'boat', ...JETTY, floor: 0.76, seat: 'auto' },
  '3d-sailboat': { group: 'climb', kind: 'sailboat', noun: 'sailboat', ...JETTY, floor: 0.7, seat: 'auto' },
  // kayak: along a low jetty, sit on the edge, slide down into the cockpit, take the paddle
  '3d-kayak': { group: 'climb', kind: 'kayak', noun: 'kayak', into: 'sit', prop: 'jetty', seat: 'auto', seatPose: { lean: 0, L: [{ f: 1.5, a: 0.1, k: 0.12, n: 0.3 }, { f: 1.5, a: 0.1, k: 0.12, n: 0.3 }], A: [{ f: 0.9, a: 0.25, e: 0.9 }, { f: 0.9, a: 0.25, e: 0.9 }] } },
  '3d-swimmer': { group: 'swim', noun: 'swimmer', seat: { x: -0.55, y: 0.06, z: 0 }, stand: { x: -1.45, z: 0 }, person: { s: 0.81, legK: 1.3, torsoK: 1.5, armK: 1.4 } },
  '3d-paraglider': { group: 'glide', noun: 'wing', seat: 'auto', stand: { x: 0, z: 0 }, air: { g: 0, f: 1.3 } },
};
// Each model's own marker framing (orthographic frustum + look-at height), copied from its renderer.
const FRAMES = {
  '3d-runner': [-1.75, 1.75, 2.6, -0.9, 1], '3d-trail-runner': [-1.75, 1.75, 2.6, -0.9, 1], '3d-road-runner': [-1.75, 1.75, 2.6, -0.9, 1], '3d-hiker': [-1.75, 1.75, 2.6, -0.9, 1],
  '3d-road-bike': [-3.3, 3.3, 4.15, -2.45, 1], '3d-gravel-bike': [-3.3, 3.3, 4.15, -2.45, 1], '3d-mountain-bike': [-3.3, 3.3, 4.15, -2.45, 1],
  '3d-motorbike': [-2.9, 2.9, 3.75, -2.05, 1], '3d-motocross': [-2.9, 2.9, 3.75, -2.05, 1], '3d-race-motorbike': [-2.9, 2.9, 3.75, -2.05, 1],
  '3d-race-car': [-2.9, 2.9, 3.75, -2.05, 1], '3d-rally': [-2.9, 2.9, 3.75, -2.05, 1],
  '3d-bus': [-4.2, 4.2, 4.2, -4.2, 1.25], '3d-train': [-4.8, 4.8, 4.8, -4.8, 1.3], '3d-plane': [-4.4, 4.4, 4.4, -4.4, 1.9],
  '3d-boat': [-4.2, 4.2, 4.2, -4.2, 1.5], '3d-sailboat': [-4.5, 4.5, 4.5, -4.5, 2.2], '3d-kayak': [-2.9, 2.9, 2.9, -2.9, 0.5], '3d-swimmer': [-2.4, 2.4, 2.4, -2.4, 0], '3d-paraglider': [-4.2, 4.2, 4.2, -4.2, 3.4],
};

/* ---------- kit-bound pieces: the neutral person and the poofs use the model module's own materials ---------- */
function kitTools(kit) {
  const { part, fill, M, OUT, OUT_T } = kit;
  const PAPER = 0xffffff;
  const TEE = fill(0xD9D2C3, 0), HAIRM = fill(0x3A2A20, 0), SKINM = M.paper, PWHITE = new THREE.MeshBasicMaterial({ color: PAPER });
  const VISOR = new THREE.MeshBasicMaterial({ color: 0x2C3A40, transparent: true, opacity: 0.45, depthWrite: false });
  const GOGGLE = new THREE.MeshBasicMaterial({ color: 0x8EC5D6, transparent: true, opacity: 0.7, depthWrite: false });
  const WOOD = fill(0xB98A5A, 0), STONE = fill(0xD6CFC1, 0);
  const pBone = (len, r, mat) => { const g = new THREE.CapsuleGeometry(r, len, 6, 16); g.translate(0, -len / 2, 0); return part(g, mat, OUT); };
  const pTaper = (len, r0, r1, mat, out, y0 = 0) => { const g = new THREE.CylinderGeometry(r0, r1, len, 20); g.translate(0, y0 - len / 2, 0); return part(g, mat, out); };
  function makePerson(o) {
    const s = o.s, LK = o.legK || 1, TK = o.torsoK || 1, AK = o.armK || 1, TH = 0.5 * LK, SH = 0.48 * LK;
    const P = new THREE.Group(); P.scale.setScalar(s);
    const hips = new THREE.Group(); P.add(hips);
    const upper = new THREE.Group(); hips.add(upper);
    const waist = part(new THREE.CylinderGeometry(0.27, 0.29, 0.2, 24), M.green); waist.position.y = 0.02; waist.scale.set(1, 1, 0.92); hips.add(waist);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.272, 0.022, 6, 32), M.ink); band.rotation.x = PI / 2; band.position.y = 0.12; band.scale.set(1, 0.92, 1); hips.add(band);
    const shirtG = new THREE.LatheGeometry([[0, -0.02], [0.27, -0.02], [0.3, 0.06], [0.29, 0.3], [0.31, 0.56], [0.27, 0.72], [0.14, 0.8], [0, 0.8]].map(([x, y]) => new THREE.Vector2(x, y * TK)), 28);
    const shirt = part(shirtG, TEE); shirt.scale.set(1, 1, 0.9); shirt.position.y = 0.08; upper.add(shirt);
    const SHY = 0.7 * TK, HY = SHY + 0.6;
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 24), M.ink); collar.rotation.x = PI / 2; collar.position.y = 0.07 + 0.8 * TK; upper.add(collar);
    upper.add(pTaper(0.22, 0.075, 0.085, SKINM, OUT_T, HY - 0.28));
    const head = new THREE.Group(); head.position.y = HY; upper.add(head);
    head.add(part(new THREE.SphereGeometry(0.42, 36, 26), SKINM));
    // hair: short and tidy, no wind in it
    const capH = part(new THREE.SphereGeometry(0.44, 36, 18, 0, PI * 2, 0, PI * 0.4), HAIRM, OUT_T); capH.rotation.z = 0.32; head.add(capH);
    const backH = part(new THREE.SphereGeometry(0.436, 32, 14, 0, PI * 2, 0, PI * 0.36), HAIRM, null); backH.rotation.z = 0.9; head.add(backH);
    const fr = part(new THREE.CapsuleGeometry(0.07, 0.12, 4, 10), HAIRM, OUT_T); fr.position.set(0.3, 0.3, 0.08); fr.rotation.set(0.3, 0, -1.05); head.add(fr);
    const HR = 0.42;
    const onHead = (obj, yaw, pitch, lift = 0) => { const y = THREE.MathUtils.degToRad(yaw), p = THREE.MathUtils.degToRad(pitch); const d = TV(Math.cos(p) * Math.cos(y), Math.sin(p), Math.cos(p) * Math.sin(y)); obj.position.copy(d).multiplyScalar(HR + lift); obj.quaternion.setFromUnitVectors(TV(0, 0, 1), d); head.add(obj); return obj; };
    const eyes = [];
    for (const sd of [1, -1]) {
      const eye = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), M.ink); ball.scale.set(0.085, 0.12, 0.034); eye.add(ball);
      const slit = new THREE.Mesh(new THREE.CircleGeometry(1, 20), PWHITE); slit.scale.set(0.014, 0.036, 1); slit.position.set(0.012 * sd, 0.01, 0.036); eye.add(slit);
      onHead(eye, 26 * sd, 1, -0.008); eyes.push(eye);
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.08, 4, 8), M.ink); const h = new THREE.Group(); b.rotation.z = PI / 2 - 0.12 * sd; h.add(b); onHead(h, 27 * sd, 15, 0);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 8, 24, 1.6), M.ink);
    const smg = new THREE.Group(); smile.rotation.z = PI + (PI - 1.6) / 2 + 0.2; smile.position.y = 0.07; smg.add(smile); onHead(smg, 10, -20, -0.004);
    // gear put on during a transition: a helmet (motorbikes) and swim goggles
    const helmet = new THREE.Group(); helmet.visible = false; head.add(helmet);
    // shell: a crown, plus a lower band with an opening at the front for the visor
    const crown = part(new THREE.SphereGeometry(0.5, 32, 12, 0, PI * 2, 0, PI * 0.38), M.orange); crown.rotation.z = 0.28; helmet.add(crown);
    const brim = part(new THREE.SphereGeometry(0.5, 32, 10, PI + 0.95, PI * 2 - 1.9, PI * 0.37, PI * 0.27), M.orange); brim.rotation.z = 0.28; helmet.add(brim);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 6, 40, PI), M.paper); stripe.rotation.z = 0.28; helmet.add(stripe);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.505, 32, 8, PI - 0.95, 1.9, PI * 0.37, PI * 0.22), VISOR); visor.rotation.z = 0.28; helmet.add(visor);
    const rimV = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 6, 32, 1.9), M.ink); rimV.rotation.set(PI / 2, 0, -0.95); rimV.position.y = 0.5 * Math.cos(PI * 0.37); rimV.scale.setScalar(Math.sin(PI * 0.37)); helmet.add(rimV);
    const goggles = new THREE.Group(); goggles.visible = false; head.add(goggles);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.028, 6, 40), M.ink); strap.rotation.x = PI / 2; strap.position.y = 0.05; goggles.add(strap);
    for (const sd of [1, -1]) {
      const lens = new THREE.Group();
      lens.add(new THREE.Mesh(new THREE.CircleGeometry(0.105, 24), GOGGLE));
      lens.add(new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.03, 6, 24), M.orange));
      onHead(lens, 26 * sd, 3, 0.035); goggles.add(lens);
    }
    const legs = [], arms = [];
    for (const side of [1, -1]) {
      const hip = new THREE.Group(); hip.position.set(0, -0.04, 0.15 * side); hips.add(hip);
      hip.add(pBone(TH, 0.105, SKINM));
      hip.add(pTaper(0.27, 0.165, 0.185, M.green, OUT, 0.06));
      const knee = new THREE.Group(); knee.position.y = -TH; hip.add(knee);
      knee.add(pBone(SH - 0.01, 0.095, SKINM));
      knee.add(pTaper(0.12, 0.1, 0.105, M.paper, OUT_T, -(SH - 0.12)));
      const ankle = new THREE.Group(); ankle.position.y = -SH; knee.add(ankle);
      const upG = new THREE.CapsuleGeometry(0.1, 0.2, 6, 14); upG.rotateZ(PI / 2); upG.scale(1, 0.95, 0.95); upG.translate(0.1, -0.04, 0);
      ankle.add(part(upG, M.paper));
      const soleG = new THREE.CapsuleGeometry(0.06, 0.32, 4, 14); soleG.rotateZ(PI / 2); soleG.scale(1, 0.75, 1.55); soleG.translate(0.11, -0.13, 0);
      ankle.add(part(soleG, M.ink, OUT_T));
      legs.push({ hip, knee, ankle, side });
      const sh = new THREE.Group(); sh.position.set(0.02, SHY, 0.25 * side); upper.add(sh);
      const cap = part(new THREE.SphereGeometry(0.15, 22, 16), TEE); cap.position.set(0.02, SHY, 0.245 * side); cap.scale.set(1, 0.95, 0.9); upper.add(cap);
      sh.add(pBone(0.34 * AK, 0.082, SKINM));
      sh.add(pTaper(0.24, 0.142, 0.13, TEE, OUT, 0.05));
      const el = new THREE.Group(); el.position.y = -0.34 * AK; sh.add(el);
      el.add(pBone(0.3 * AK, 0.078, SKINM));
      const hand = part(new THREE.SphereGeometry(0.095, 18, 14), SKINM, OUT_T); hand.position.y = -0.3 * AK - 0.02; el.add(hand);
      arms.push({ sh, el, side });
    }
    // height of the hips when the lowest sole touches the floor (model units)
    const autoHip = (p) => { let h = 0; for (const q of p.L) h = Math.max(h, 0.04 + (TH * Math.cos(q.f) + SH * Math.cos(q.f - q.k)) * Math.cos(q.a) + 0.2); return h * s; };
    function apply(p, t) {
      P.position.set(p.x, p.y, p.z); P.rotation.y = p.yaw;
      legs.forEach((L, i) => { const q = p.L[i]; L.hip.rotation.set(-q.a * L.side, 0, q.f); L.knee.rotation.z = -q.k; L.ankle.rotation.z = q.n; });
      arms.forEach((A, i) => { const q = p.A[i]; A.sh.rotation.set(-q.a * A.side, 0, q.f); A.el.rotation.z = q.e; });
      hips.position.y = (lerp(autoHip(p), p.hipY, p.fix) + p.bob) / s;
      hips.rotation.set(p.roll, 0, p.tilt); upper.rotation.set(0, p.twist, p.lean); head.rotation.set(0, p.headY, p.headZ);
      const blink = (t % 3.84) > 3.66; for (const e of eyes) e.scale.y = blink ? 0.14 : 1;
      helmet.visible = (p.hv || 0) > 0.01; helmet.scale.setScalar(popIn(c01(p.hv || 0))); helmet.position.y = 0.9 * (p.hy || 0);
      goggles.visible = (p.gv || 0) > 0.01; goggles.scale.setScalar(popIn(c01(p.gv || 0))); goggles.rotation.z = 0.55 * (p.gy || 0);
    }
    // world position of the head ('head') or an ankle ('foot0' / 'foot1')
    const locate = (at, out) => (at === 'head' ? head : legs[at === 'foot1' ? 1 : 0].ankle).getWorldPosition(out);
    return { P, s, apply, autoHip, locate, HY: (HY + 0.08) * s, SHY: SHY * s };
  }
  function makePuffs(parent, n = 4) {
    const pool = [];
    for (let j = 0; j < n; j++) { const g = new THREE.Group(); parent.add(g); const balls = []; for (let i = 0; i < 10; i++) { const b = part(new THREE.SphereGeometry(0.25, 16, 12), M.paper, OUT_T); g.add(b); balls.push(b); } g.visible = false; pool.push({ g, balls }); }
    return (t, events) => {
      for (const P of pool) P.g.visible = false;
      let j = 0;
      for (const e of events) {
        const k = (t - e.t) / (e.d || 0.42); if (k < 0 || k > 1 || j >= pool.length) continue;
        const P = pool[j++]; P.g.visible = true; P.g.position.set(e.x, e.y, e.z);
        P.balls.forEach((b, i) => {
          const a = i / 10 * PI * 2 + 0.3, d = TV(Math.cos(a), Math.sin(a) * 0.85, 0.5 * Math.sin(a * 2 + 1));
          const sz = e.r * (0.42 + 0.16 * (i % 3));
          b.position.copy(d).multiplyScalar(e.r * (0.2 + 0.9 * Math.pow(k, 0.55)));
          b.scale.setScalar(Math.max(0.001, sz / 0.25 * Math.pow(Math.sin(PI * Math.min(1, k * 1.08)), 0.7)));
        });
      }
    };
  }
  // ground-side props that come with a vehicle: a station platform, a jetty, a rolling airstair
  function makeProp(o) {
    const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
    const bx = (w, h, d, mat, out = OUT) => part(new THREE.BoxGeometry(w, h, d), mat, out);
    const add = (m, x, y, z) => { m.position.set(x, y, z); inner.add(m); return m; };
    let cx = 0, cz = 0;
    if (o.kind === 'platform' || o.kind === 'jetty') {
      const { x0, x1, z0, z1, y } = o; cx = (x0 + x1) / 2; cz = (z0 + z1) / 2;
      if (o.kind === 'platform') {
        add(bx(x1 - x0, y, z1 - z0, STONE), cx, y / 2, cz);
        add(bx(x1 - x0, 0.015, 0.1, M.orange, null), cx, y + 0.01, z0 + 0.16);       // keep-back line by the edge
        add(bx(0.95, y / 2, 0.32, STONE), o.sx, y / 4, z1 + 0.16);                    // step
      } else {
        const n = Math.max(3, Math.round((x1 - x0) / 0.3)), w = (x1 - x0) / n;
        for (let i = 0; i < n; i++) add(bx(w - 0.035, 0.08, z1 - z0, WOOD, OUT_T), x0 + w * (i + 0.5), y - 0.04, cz);
        for (const x of [x0 + 0.1, x1 - 0.1]) for (const z of [z0 + 0.1, z1 - 0.1]) add(part(new THREE.CylinderGeometry(0.07, 0.07, y + 0.35, 10), M.ink, OUT_T), x, (y - 0.35) / 2, z);
        add(bx(0.85, y / 2, 0.32, WOOD), o.sx, y / 4, z1 + 0.16);                     // step
      }
    } else if (o.kind === 'stairs') {
      const { x, zTop, zBot, h, n } = o, dz = (zBot - zTop) / (n - 1); cx = x; cz = (zTop + zBot) / 2;
      for (let i = 1; i <= n; i++) { const top = i === n, zi = zBot - (i - 1) * dz; add(bx(0.62, 0.05, top ? dz * 1.4 : dz * 0.9, M.paper, OUT_T), x, i * h / n - 0.025, top ? zi - dz * 0.2 : zi); }
      const L = Math.hypot(zBot - zTop + dz * 0.6, h), ang = Math.atan2(h, zBot - zTop + dz * 0.6);
      for (const sd of [1, -1]) {
        const st = add(bx(0.05, 0.12, L, M.orange, OUT_T), x + 0.31 * sd, h / 2 - 0.08, (zTop + zBot) / 2 + dz * 0.3); st.rotation.x = ang;
        const rl = add(bx(0.035, 0.035, L, M.ink, null), x + 0.31 * sd, h / 2 + 0.5, (zTop + zBot) / 2 + dz * 0.3); rl.rotation.x = ang;
        add(bx(0.035, 0.55, 0.035, M.ink, null), x + 0.31 * sd, h + 0.25, zTop - dz * 0.2);
        add(bx(0.06, h, 0.06, M.ink, null), x + 0.28 * sd, h / 2, zTop + 0.1);
        add(part(new THREE.SphereGeometry(0.09, 12, 10), M.ink, OUT_T), x + 0.31 * sd, 0.09, zBot + dz * 0.3);
        add(part(new THREE.SphereGeometry(0.09, 12, 10), M.ink, OUT_T), x + 0.28 * sd, 0.09, zTop + 0.1);
      }
    }
    g.position.set(cx, 0, cz); inner.position.set(-cx, 0, -cz);
    // st: { v: pop scale 0…1, x / z: slide }
    const set = (st) => { const v = st?.v ?? 0; g.visible = v > 0.01; g.scale.setScalar(Math.max(0.001, v)); g.position.set(cx + (st?.x || 0), 0, cz + (st?.z || 0)); };
    set(null);
    return { g, set };
  }
  return { makePerson, makePuffs, makeProp };
}

const base = () => ({ x: 0, y: 0, z: 0, yaw: 0, fix: 0, hipY: 0, bob: 0, tilt: 0, roll: 0, lean: 0, twist: 0, headY: 0, headZ: 0, hv: 0, hy: 0, gv: 0, gy: 0,
  L: [{ f: 0.03, a: 0.04, k: 0.06, n: 0 }, { f: -0.03, a: 0.04, k: 0.06, n: 0 }],
  A: [{ f: 0.06, a: 0.14, e: 0.22 }, { f: -0.04, a: 0.14, e: 0.22 }] });
// run / walk cycle on top of any pose (same curves as the runner), A = 0 still … 1 full run
function gait(p, ph, A) {
  const q = clone(p);
  q.L.forEach((L, i) => {
    const pp = ph + (i ? PI : 0);
    const thigh = 0.62 * Math.sin(pp) + 0.08;
    const kneeB = 0.18 + 1.6 * Math.pow(Math.max(0, Math.sin(pp - 3.75)), 1.25) + 0.22 * Math.max(0, Math.sin(pp + 0.35));
    const foot = -(thigh - kneeB) + 0.08 - 0.55 * Math.pow(Math.max(0, Math.sin(pp - 3.2)), 2) + 0.25 * Math.max(0, Math.sin(pp - 0.2));
    L.f += A * thigh; L.k += A * kneeB; L.n += A * foot;
  });
  q.A.forEach((R, i) => { const pp = ph + (i ? 0 : PI); R.f = lerp(R.f, 0.75 * Math.sin(pp) + 0.1, A); R.e = lerp(R.e, 1.45 + 0.3 * Math.sin(pp), A); });
  q.lean += -0.22 * A; q.bob += 0.03 * A * Math.max(0, Math.cos(2 * ph)) * (q.fix < 0.5 ? 1 : 0);
  return q;
}
const breathe = (p, t) => W(p, { headZ: p.headZ + 0.03 * Math.sin(t * 2.2), A: [{ e: p.A[0].e + 0.05 * Math.sin(t * 2.2) }, { e: p.A[1].e + 0.05 * Math.sin(t * 2.2) }] });
const wave = (p, t, k = 1) => mix(p, W(p, { headZ: 0.08, A: [{ f: 0.25, a: 2.55, e: 0.5 + 0.45 * Math.sin(t * 14) }, null] }), k);
// walk from a to b between ta and tb; feet keep stepping, body turns to the direction of travel
function walk(p, t, ta, tb, a, b, period = 0.42, amp = 0.45) {
  const k = sp(t, ta, tb), kk = 0.65 * k + 0.35 * sm(k);
  const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
  const q = W(p, { x: lerp(a.x, b.x, kk), z: lerp(a.z, b.z, kk), yaw });
  return gait(q, 2 * PI * (t - ta) / period, amp * Math.sin(PI * k) ** 0.4);
}
function turnTo(p, yaw, k) { let d = yaw - p.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); return W(p, { yaw: p.yaw + d * k }); }
const yawOf = (a, b) => (Math.abs(b.x - a.x) + Math.abs(b.z - a.z) < 1e-6 ? 0 : Math.atan2(-(b.z - a.z), b.x - a.x));
const damped = (t, t0, amp, f = 9, decay = 2.2) => (t < t0 ? 0 : amp * Math.exp(-decay * (t - t0)) * Math.sin(f * (t - t0)));

/* ---------- gear overlays: both hands go to the head while a helmet or goggles go on or come off ---------- */
const handsAt = (f, a, e) => ({ A: [{ f, a, e }, { f, a, e }] });
function helmetOn(p, t, a) {          // 0.65 s: it appears above the head, then comes down onto it
  const w = es(t, a, a + 0.15) * (1 - es(t, a + 0.5, a + 0.65)), hy = 1 - es(t, a + 0.22, a + 0.5);
  const q = mix(p, W(p, handsAt(lerp(2.05, 2.7, hy), 0.5, lerp(1.75, 1.0, hy))), w);
  q.hv = sp(t, a, a + 0.22); q.hy = hy; return q;
}
function helmetOff(p, t, a) {         // 0.65 s: lifted off, then it pops away
  const w = es(t, a, a + 0.15) * (1 - es(t, a + 0.5, a + 0.65)), hy = es(t, a + 0.15, a + 0.42);
  const q = mix(p, W(p, handsAt(lerp(2.05, 2.7, hy), 0.5, lerp(1.75, 1.0, hy))), w);
  q.hv = 1 - sp(t, a + 0.45, a + 0.62); q.hy = hy; return q;
}
function gogglesOn(p, t, a) {         // 0.65 s: on the forehead, pulled down over the eyes, strap snapped
  const w = es(t, a, a + 0.15) * (1 - es(t, a + 0.52, a + 0.65)), snap = Math.sin(PI * sp(t, a + 0.42, a + 0.56));
  const q = mix(p, W(p, handsAt(2.15, 0.35 + 0.45 * snap, 2.05 - 0.4 * snap)), w);
  q.gv = sp(t, a, a + 0.15); q.gy = 1 - es(t, a + 0.18, a + 0.42); return q;
}
function gogglesOff(p, t, a) {        // 0.6 s: pushed up onto the forehead, then they pop away
  const w = es(t, a, a + 0.15) * (1 - es(t, a + 0.45, a + 0.6));
  const q = mix(p, W(p, handsAt(2.15, 0.35, 2.05)), w);
  q.gv = 1 - sp(t, a + 0.42, a + 0.58); q.gy = es(t, a + 0.12, a + 0.34); return q;
}

function choreography(c, X) {
  const S = X.seat, B = X.stand, C = { x: 0, z: 0 }, s = X.person.s, autoHip = X.person.autoHip;
  const D = markerClipDurations(c.icon);
  const idle = (t, at = C) => breathe(W(base(), { x: at.x, z: at.z, yaw: FC }), t);
  const chest = (p) => ({ x: p.x, y: p.fix > 0.5 ? p.hipY + X.person.SHY * 0.6 : X.person.HY * 0.62, z: p.z });
  const vPuff = (t) => ({ t, x: X.vc.x, y: X.vc.y, z: X.vc.z, r: X.vr, d: 0.5 });
  const pPuff = (t, p) => ({ t, ...chest(p), r: 1.0 * s, d: 0.42 });
  const gPuff = (t, at, r = 0.5) => ({ t, at, r: r * s, d: 0.32 });       // small poof on the head or a foot
  const standAt = (A, yaw) => W(base(), { x: A.x, z: A.z, yaw, fix: 1, hipY: autoHip(base()) + (A.y || 0) });
  // walk a path of {x, z, y} points; the body rises onto a step as it arrives, and drops as it leaves one
  const route = (t, ta, tb, pts, period = 0.46, amp = 0.5) => {
    const seg = []; let tot = 0;
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); seg.push(d); tot += d; }
    if (tot < 1e-6) return standAt(pts[0], 0);
    const k = sp(t, ta, tb);
    let u = (0.7 * k + 0.3 * sm(k)) * tot, i = 0;
    while (i < seg.length - 1 && u > seg[i]) { u -= seg[i]; i++; }
    const a = pts[i], b = pts[i + 1], f = seg[i] ? Math.min(1, u / seg[i]) : 1;
    let q = W(base(), { x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), yaw: yawOf(a, b) });
    q = gait(q, 2 * PI * (t - ta) / period, amp * Math.sin(PI * k) ** 0.35);
    const up = (b.y || 0) > (a.y || 0);
    q.fix = 1; q.hipY = autoHip(q) + lerp(a.y || 0, b.y || 0, sm(up ? sp(f, 0.4, 0.95) : sp(f, 0.05, 0.6)));
    return q;
  };
  // back to the middle, turn to the camera and wave (exits)
  const homeward = (t, a, P, yaw0) => {
    const dir = yawOf(P, C);
    let p = turnTo(standAt({ x: P.x, z: P.z }, yaw0), dir, es(t, a - 0.25, a));
    if (t > a) p = route(t, a, a + 0.6, [{ x: P.x, z: P.z, y: 0 }, { x: C.x, z: C.z, y: 0 }]);
    if (t > a + 0.6) { p = turnTo(W(base(), { x: C.x, z: C.z, yaw: dir }), FC, es(t, a + 0.6, a + 0.8)); p = wave(breathe(p, t), t, es(t, a + 0.75, a + 0.9)); }
    return p;
  };

  if (c.group === 'foot') {
    const T = c.T, A1 = c.gaitA ?? 1;
    const tS = 2.2, t0 = 1.4;
    const enterP = (t) => {
      let p = idle(t);
      p = mix(p, W(p, { headZ: 0.3, A: [{ f: 0.15, a: 2.85, e: 0.1 }, { f: 0.15, a: 2.85, e: 0.1 }] }), es(t, 0.45, 0.8) * (1 - es(t, 1.0, 1.3)));
      p = turnTo(p, 0, es(t, 1.1, 1.45)); p.headY = lerp(0, -0.15, es(t, 1.1, 1.45));
      const A = A1 * es(t, t0, 2.05); return A > 0 ? gait(p, 2 * PI * (t - t0) / T, A) : p;
    };
    const enter = { dur: D.enter,
      at(t) { const pz = [pPuff(tS, enterP(tS))]; return t < tS ? { pv: 1, pose: enterP(t), cv: 0, mt: 0, puffs: pz } : { pv: 0, cv: 1, cpop: sp(t, tS, tS + 0.3), mt: t - t0, puffs: pz }; } };
    const xS = 0.8;
    const exitP = (t, off) => {
      const u = Math.min(t - xS, 1.3), ph = 2 * PI * (xS + off + u - 0.5 * u * u / (2 * 1.3)) / T;
      const A = A1 * (1 - es(t, xS, 2.05));
      let p = W(base(), { headY: -0.15 });
      const knees = W(p, { lean: -0.8, headZ: 0.55, headY: -0.45, bob: 0, L: [{ f: 0.45, k: 0.6, n: 0.12 }, { f: 0.4, k: 0.55, n: 0.12 }], A: [{ f: 1.45, a: 0.3, e: 0.05 }, { f: 1.45, a: 0.3, e: 0.05 }] });
      knees.lean += 0.05 * Math.sin(t * 9); knees.A[0].f -= 0.04 * Math.sin(t * 9);
      p = mix(p, knees, es(t, 2.0, 2.3) * (1 - es(t, 2.75, 3.05)));
      p = turnTo(p, FC, es(t, 2.75, 3.05)); p.headY = lerp(p.headY, 0, es(t, 2.75, 3.05));
      p = wave(p, t, es(t, 3.0, 3.15));
      return A > 0.002 ? gait(p, ph, A) : p;
    };
    const exit = { dur: D.exit,
      at(t, off = 0) { const pz = [pPuff(xS, exitP(xS, off))]; return t < xS ? { pv: 0, cv: 1, mt: t + off, puffs: pz } : { pv: 1, ppop: sp(t, xS, xS + 0.3), pose: exitP(t, off), cv: 0, mt: xS + off, puffs: pz }; } };
    return { enter, exit, popIn: null, popOut: null };
  }

  if (c.group === 'ride') {
    const R = W(base(), { x: S.x, z: S.z, yaw: 0, fix: 1, hipY: S.y, headY: -0.1, ...c.R });
    R.headZ = -R.lean * 0.7;
    const standB = W(base(), { x: B.x, z: B.z, yaw: 0, headY: -0.25 });
    const reach = W(standB, { lean: -0.3, headZ: 0.25, A: [{ f: 1.25, a: 0.12, e: 0.35 }, { f: 1.25, a: 0.12, e: 0.35 }] });
    reach.hipY = autoHip(reach);
    const lift = W(reach, { z: lerp(B.z, S.z, 0.2), lean: -0.45, L: [{ k: 0.15 }, { f: -0.75, a: 0.55, k: 0.75, n: 0.3 }] });
    const over = W(reach, { z: lerp(B.z, S.z, 0.8), fix: 1, hipY: S.y + 0.08, lean: lerp(-0.45, R.lean, 0.5), headZ: 0.4, L: [{ f: 0.1, a: 0.1, k: 0.3 }, { f: -0.15, a: 1.3, k: 0.95, n: 0.3 }] });
    const mount = (k) => keys(k, [[0, reach], [0.35, lift], [0.7, over], [1, R]]);
    // helmet on before mounting, kick-start or clip in after
    const hT = c.helmet ? 0.8 : 0, kT = c.kick ? 0.75 : c.clip ? 0.6 : 0;
    const m0 = 1.45 + hT, m1 = 2.25 + hT, tS = 2.4 + hT + kT;
    const kickAt = [m1 + 0.1, m1 + 0.45], clipAt = [m1 + 0.08, m1 + 0.33];
    const KU = W(R, { hipY: R.hipY + 0.12, L: [{ f: 1.8, k: 2.15, n: 0.2 }, null] }), KD = W(R, { hipY: R.hipY - 0.03, L: [{ f: 0.5, k: 0.12, n: -0.1 }, null] });
    const kickP = (t, a) => keys(sp(t, a, a + 0.32), [[0, R], [0.45, KU], [0.7, KD], [1, R]]);
    const tapP = (t, a, i, field, amt) => { const q = clone(R), k = Math.sin(PI * sp(t, a, a + 0.22)); if (field === 'lift') { q.L[i].f += 0.3 * k; q.L[i].k += 0.4 * k; } else q.L[i].a += amt * k; return q; };
    const engineOn = c.kick ? kickAt[1] + 0.2 : null;
    const enterP = (t) => {
      let p = idle(t);
      if (t > 0.4) p = walk(p, t, 0.4, 1.0, C, B);
      if (t > 1.0) p = turnTo(W(standB, { x: B.x, z: B.z }), 0, 1);
      if (t > 1.0 + hT) p = mix(p, reach, es(t, 1.15 + hT, 1.45 + hT));
      if (t > m0) p = mount(sp(t, m0, m1));
      if (t > m1) p = W(R, { bob: -0.05 * Math.sin(PI * sp(t, m1, m1 + 0.15)) });
      if (c.kick) for (const a of kickAt) if (t > a && t < a + 0.32) p = kickP(t, a);
      if (c.clip) clipAt.forEach((a, i) => { if (t > a && t < a + 0.22) p = tapP(t, a, i, 'lift'); });
      return c.helmet ? helmetOn(p, t, 1.2) : p;
    };
    const enterPuffs = [vPuff(0.9), pPuff(tS, R)];
    if (c.kick) enterPuffs.push({ t: engineOn, x: S.x - 1.15, y: 0.55, z: 0, r: 0.42, d: 0.5 });
    if (c.clip) clipAt.forEach((a, i) => enterPuffs.push(gPuff(a + 0.16, `foot${i}`, 0.28)));
    const enter = { dur: D.enter,
      at(t) {
        const vs = popIn(sp(t, 0.9, 1.25)), shake = engineOn != null && t > engineOn ? 1 - 0.7 * es(t, tS + 0.3, tS + 0.8) : 0;
        return t < tS ? { pv: 1, pose: enterP(t), cv: 0, vs, mt: 0, shake, puffs: enterPuffs } : { pv: 0, cv: 1, cpop: sp(t, tS, tS + 0.3), vs: 1, mt: rampUp(t, tS + 0.05, 0.8), shake, puffs: enterPuffs };
      } };
    const xS = 1.25, u = c.clip ? 0.4 : 0, hO = c.helmet ? 0.65 : 0;
    const l0 = 1.35 + u, l1 = 2.1 + u, hA = l1 + 0.2, pop = 2.3 + u + hO;
    const unclipAt = [xS + 0.08, xS + 0.25];
    const exitP = (t) => {
      let p = R;
      if (c.clip) unclipAt.forEach((a, i) => { if (t > a && t < a + 0.22) p = tapP(t, a, i, 'twist', 0.45); });
      if (t > l0) p = mount(1 - sp(t, l0, l1));
      if (t > l1) p = mix(reach, standB, es(t, l1, hA));
      if (c.helmet) p = helmetOff(p, t, hA);
      if (t > pop + 0.3) p = walk(standB, t, pop + 0.3, pop + 0.9, B, C);
      if (t > pop + 0.9) p = turnTo(W(standB, { x: C.x, z: C.z, yaw: Math.atan2(B.z - C.z, C.x - B.x) }), FC, es(t, pop + 0.9, pop + 1.1));
      if (t > pop + 0.9) p = wave(breathe(W(p, { headY: 0 }), t), t, es(t, pop + 1.05, pop + 1.2));
      return p;
    };
    const exitPuffs = [pPuff(xS, R), vPuff(pop)];
    if (c.clip) unclipAt.forEach((a, i) => exitPuffs.push(gPuff(a + 0.11, `foot${i}`, 0.28)));
    if (c.helmet) exitPuffs.push(gPuff(hA + 0.45, 'head', 0.9));
    const exit = { dur: D.exit,
      at(t, off = 0) {
        const vs = t < pop ? 1 : popOut(sp(t, pop, pop + 0.35)), shake = c.kick ? 1 - es(t, xS - 0.1, xS + 0.05) : 0;
        return t < xS ? { pv: 0, cv: 1, vs: 1, mt: rampDown(t, 0.4, 0.8) + off, shake, puffs: exitPuffs } : { pv: 1, ppop: sp(t, xS, xS + 0.3), pose: exitP(t), cv: 0, vs, mt: 0.8 + off, shake, puffs: exitPuffs };
      } };
    return { enter, exit, popIn: 0.9, popOut: pop };
  }

  if (c.group === 'climb') {
    const air = X.air, g = air ? air.g : 0, fl = air ? air.f : 0;
    const Sy = S.y + g;                                               // seat height while parked on the ground
    const seat = W(base(), { x: S.x, z: S.z, yaw: 0, fix: 1, hipY: Sy, lean: 0.08, headY: -0.25, L: [{ f: 1.45, a: 0.12, k: 0.35, n: 0.3 }, { f: 1.45, a: 0.12, k: 0.35, n: 0.3 }], A: [{ f: 1.0, a: 0.2, e: 0.65 }, { f: 1.0, a: 0.2, e: 0.65 }], ...(c.seatPose || {}) });
    const crouch = W(base(), { yaw: FV, lean: -0.35, headZ: 0.3, L: [{ f: 0.8, k: 1.45, n: -0.55 }, { f: 0.8, k: 1.45, n: -0.55 }], A: [{ f: -0.75, e: 0.3 }, { f: -0.75, e: 0.3 }] });
    const tuck = W(base(), { yaw: FV, fix: 1, lean: -0.1, L: [{ f: 1.1, k: 1.7, n: 0 }, { f: 1.0, k: 1.6, n: 0 }], A: [{ f: 2.3, a: 0.6, e: 0.3 }, { f: 2.3, a: 0.6, e: 0.3 }] });
    const hC = autoHip(crouch), hS = autoHip(base());
    const crouchAt = (A, yaw) => W(crouch, { x: A.x, z: A.z, yaw, fix: 1, hipY: hC + (A.y || 0) });

    // ways in: k 0 → 1 from standing at A (floor A.y) to the seat; exits play them backwards
    const hopFrom = (k, A, yaw, H = 0.45 * s + Math.max(0, Sy - hS - (A.y || 0)) * 0.35) => {
      const x = lerp(A.x, S.x, sm(k)), z = lerp(A.z, S.z, sm(k)), h = lerp(hC + (A.y || 0), Sy, k) + H * Math.sin(PI * k);
      const limbs = keys(k, [[0, crouch], [0.35, tuck], [0.7, tuck], [1, seat]]);
      return W(limbs, { x, z, fix: 1, hipY: h, yaw: lerp(yaw, 0, sm(sp(k, 0.15, 0.9))) });
    };
    // over the halo and straight down into the cockpit
    const drop = (k, A, yaw) => {
      const top = Sy + c.dropH, kx = sm(sp(k, 0.1, 0.5));
      const h = k < 0.5 ? lerp(hC + (A.y || 0), top, Math.sin(PI / 2 * sp(k, 0, 0.5))) : lerp(top, Sy, sp(k, 0.5, 0.92) ** 2) - 0.05 * Math.sin(PI * sp(k, 0.92, 1));
      const tall = W(base(), { A: [{ f: 0.55, a: 0.9, e: 0.3 }, { f: 0.55, a: 0.9, e: 0.3 }] });
      const limbs = keys(k, [[0, crouch], [0.3, tuck], [0.55, tall], [0.68, tall], [0.9, seat]]);
      return W(limbs, { x: lerp(A.x, S.x, kx), z: lerp(A.z, S.z, kx), fix: 1, hipY: h, yaw: lerp(yaw, 0, sm(sp(k, 0.55, 0.95))) });
    };
    // up to the sill, lie back and slide in feet first, then sit up
    const windowIn = (k, A, yaw) => {
      const hy = Sy + c.sill, zw = c.winZ + 0.2;
      const flat = W(base(), { tilt: 1.35, headZ: -0.55, L: [{ f: 0.15, k: 0.1, n: 0.4 }, { f: 0.05, k: 0.15, n: 0.4 }], A: [{ f: 2.6, a: 0.25, e: 0.4 }, { f: 2.6, a: 0.25, e: 0.4 }] });
      const limbs = keys(k, [[0, crouch], [0.28, flat], [0.75, flat], [1, seat]]);
      const z = k < 0.28 ? lerp(A.z, zw, sm(k / 0.28)) : lerp(zw, S.z, sm(sp(k, 0.28, 0.75)));
      const h = k < 0.28 ? lerp(hC + (A.y || 0), hy, Math.sin(PI / 2 * k / 0.28)) : lerp(hy, Sy, sm(sp(k, 0.7, 1)));
      return W(limbs, { x: lerp(A.x, S.x, sm(k)), z, fix: 1, hipY: h, yaw: lerp(yaw, 0, sm(sp(k, 0.75, 1))) });
    };
    // a leg over the side, the other one after it, then sit down
    const stepOver = (k, A, yaw) => {
      const F = c.floor + g;
      const lift = W(base(), { lean: 0.1, L: [{ f: 1.5, k: 1.6, n: 0.3 }, { f: -0.1, k: 0.1 }], A: [{ f: 0.3, a: 0.9, e: 0.3 }, { f: 0.3, a: 0.9, e: 0.3 }] });
      const strad = W(base(), { lean: -0.15, L: [{ f: 0.25, k: 0.3 }, { f: -0.7, a: 0.2, k: 1.4, n: 0.4 }], A: [{ f: 0.3, a: 0.7, e: 0.3 }, { f: 0.3, a: 0.7, e: 0.3 }] });
      const limbs = keys(k, [[0, base()], [0.3, lift], [0.6, strad], [0.8, base()], [1, seat]]);
      const kx = sm(sp(k, 0.15, 0.85));
      const h = k < 0.8 ? lerp(hS + (A.y || 0), hS + F, sm(sp(k, 0.3, 0.62))) + 0.12 * s * Math.sin(PI * sp(k, 0.2, 0.62)) : lerp(hS + F, Sy, sm(sp(k, 0.8, 1)));
      return W(limbs, { x: lerp(A.x, S.x, kx), z: lerp(A.z, S.z, kx), fix: 1, hipY: h, yaw: lerp(yaw, 0, sm(sp(k, 0.75, 1))) });
    };
    // crouch, sit on the jetty edge with the legs over the boat, then slide down into the cockpit facing forward
    const sitIn = (k, A, yaw) => {
      const edgeZ = A.z - 0.16, eH = (A.y || 0) + 0.1 * s;
      const edge = W(base(), { lean: 0.12, headZ: 0.1, L: [{ f: 1.35, a: 0.12, k: 1.25, n: 0.2 }, { f: 1.4, a: 0.12, k: 1.1, n: 0.2 }], A: [{ f: -0.55, a: 0.35, e: 0.15 }, { f: -0.55, a: 0.35, e: 0.15 }] });
      const reachIn = W(edge, { lean: -0.05, L: [{ f: 1.5, k: 0.4 }, { f: 1.5, k: 0.35 }], A: [{ f: -0.2, a: 0.6, e: 0.4 }, { f: -0.2, a: 0.6, e: 0.4 }] });
      const limbs = keys(k, [[0, base()], [0.25, crouch], [0.48, edge], [0.62, edge], [0.8, reachIn], [1, seat]]);
      const kz = sm(sp(k, 0.62, 0.95));
      const x = lerp(A.x, S.x, kz), z = k < 0.62 ? lerp(A.z, edgeZ, sm(sp(k, 0.15, 0.48))) : lerp(edgeZ, S.z, kz);
      const h = k < 0.25 ? lerp(hS, hC, sm(k / 0.25)) + (A.y || 0) : k < 0.62 ? lerp(hC + (A.y || 0), eH, sm(sp(k, 0.25, 0.48))) : lerp(eH, Sy, sm(sp(k, 0.62, 1))) + 0.07 * s * Math.sin(PI * sp(k, 0.62, 0.92));
      return W(limbs, { x, z, fix: 1, hipY: h, yaw: k < 0.62 ? yaw : lerp(yaw, 0, sm(sp(k, 0.62, 0.95))) });
    };
    const into = c.into === 'drop' ? drop : c.into === 'window' ? windowIn : c.into === 'step' ? stepOver : c.into === 'sit' ? sitIn : c.into === 'walk' ? null : hopFrom;
    const ownCrouch = c.into === 'step' || c.into === 'sit';

    /* ---- per vehicle: the path from the ground to where they get in, the timeline, the extras ---- */
    let P, T, prop = null, fxIn = () => ({}), fxOut = () => ({});
    const depart = (t, tS) => ({ mt: rampUp(t, tS + 0.05, 0.8) }), arrive = (t, off) => ({ mt: rampDown(t, 0.3, 0.75) + off });
    let dep = depart, arr = arrive, arrEnd = 0.675;
    if (c.kind === 'bus') {
      const dx = 1.86, Z0 = 0.71;
      P = [{ x: dx, z: 1.6, y: 0 }, { x: dx, z: 0.95, y: 0.25 }, { x: dx, z: 0.5, y: 0.47 }, { x: S.x, z: 0.12, y: 0.47 }];
      T = { walk: [0.4, 1.0], pop: 0.95, climb: [1.6, 2.5], tS: 2.75, xS: 1.4, down: [1.55, 2.45], vpop: 2.85, home: 3.05 };
      fxIn = (t) => ({ door: es(t, 1.2, 1.6) * (1 - es(t, 2.5, 2.8)) });
      fxOut = (t) => ({ door: es(t, 0.95, 1.35) * (1 - es(t, 2.45, 2.75)) });
      void Z0;
    } else if (c.kind === 'train') {
      const x = S.x, plat = { kind: 'platform', x0: x - 1.6, x1: x + 2.4, z0: 0.95, z1: 2.3, y: 0.55, sx: x };
      P = [{ x, z: 2.95, y: 0 }, { x, z: 2.45, y: 0.28 }, { x, z: 2.1, y: 0.55 }, { x, z: 1.22, y: 0.55 }];
      T = { walk: [0.35, 1.15], pop: 1.15, climb: [1.35, 2.15], into: [2.3, 2.85], tS: 3.0, xS: 1.2, out: [1.35, 1.9], down: [2.1, 2.8], vpop: 2.9, home: 3.1 };
      prop = plat;
      const v0 = (t) => popIn(sp(t, T.pop, T.pop + 0.35));
      fxIn = (t) => ({ prop: { v: v0(t) * (1 - sp(t, T.tS + 0.85, T.tS + 1.15)), x: -4.3 * rampUp(t, T.tS + 0.05, 0.8) } });
      fxOut = (t) => ({ prop: { v: es(t, 0, 0.3) * (t < T.vpop ? 1 : popOut(sp(t, T.vpop, T.vpop + 0.35))), x: 4.3 * (arrEnd - rampDown(Math.min(t, 2), 0.3, 0.75)) } });
    } else if (c.kind === 'plane') {
      const x = S.x - 0.6, zTop = 0.72, zBot = 2.1, n = 5, h = Math.max(0.6, Sy - 0.2);
      P = [{ x, z: 2.65, y: 0 }]; for (let i = 1; i <= n; i++) P.push({ x, z: zBot - (i - 1) * (zBot - zTop) / (n - 1), y: i * h / n });
      prop = { kind: 'stairs', x, zTop, zBot, h, n };
      T = { walk: [0.4, 1.0], pop: 0.95, climb: [1.25, 2.25], into: [2.35, 2.8], tS: 2.9, xS: 2.0, out: [2.15, 2.6], down: [2.75, 3.55], vpop: 3.65, home: 3.85 };
      fxIn = (t) => ({ door: 1 - es(t, 3.25, 3.5), prop: { v: popIn(sp(t, 1.0, 1.35)) * (t < 3.85 ? 1 : popOut(sp(t, 3.85, 4.15))), z: 1.6 * es(t, 3.45, 3.95) } });
      fxOut = (t) => ({ door: es(t, 1.45, 1.7), prop: { v: popIn(sp(t, 1.45, 1.75)) * (t < T.vpop ? 1 : popOut(sp(t, T.vpop, T.vpop + 0.35))), z: 1.6 * (1 - es(t, 1.5, 1.95)) } });
      dep = (t, tS) => { const k = es(t, 3.75, 4.8); return { mt: rampUp(t, tS + 0.05, 0.8), airY: lerp(g, fl, k), pitch: 0.14 * Math.sin(PI * k) }; };
      arr = (t, off) => { const k = 1 - es(t, 0.1, 1.3); return { mt: rampDown(t, 0.3, 1.0) + off, airY: lerp(g, fl, k), pitch: -0.08 * Math.sin(PI * k) }; };
      arrEnd = 0.8;
    } else if (c.kind === 'boat' || c.kind === 'sailboat') {
      const sail = c.kind === 'sailboat', x = S.x, hw = sail ? 0.95 : 1.0;
      prop = { kind: 'jetty', x0: x - 0.95, x1: x + 0.85, z0: hw, z1: hw + 1.4, y: 0.48, sx: x };
      P = [{ x, z: hw + 1.95, y: 0 }, { x, z: hw + 1.55, y: 0.24 }, { x, z: hw + 1.2, y: 0.48 }, { x, z: hw + 0.14, y: 0.48 }];
      T = { walk: [0.35, 1.1], pop: 1.1, climb: [1.3, 2.0], into: [2.05, 2.85], tS: 3.0, xS: 1.2, out: [1.35, 2.1], down: [2.25, 2.95], vpop: 3.05, home: 3.25 };
      const landIn = T.into[0] + 0.62 * (T.into[1] - T.into[0]), landOut = T.out[0] + 0.45 * (T.out[1] - T.out[0]);
      fxIn = (t) => ({ rock: damped(t, landIn, 0.13), sail: sail ? es(t, T.tS + 0.15, T.tS + 1.0) : 1,
        prop: { v: popIn(sp(t, T.pop, T.pop + 0.35)) * (1 - sp(t, T.tS + 0.85, T.tS + 1.15)), x: -2.6 * rampUp(t, T.tS + 0.05, 0.8) } });
      fxOut = (t) => ({ rock: damped(t, 1.0, 0.05) + damped(t, landOut, 0.11), sail: sail ? 1 - es(t, 0.15, 0.9) : 1,
        prop: { v: es(t, 0, 0.3) * (t < T.vpop ? 1 : popOut(sp(t, T.vpop, T.vpop + 0.35))), x: 2.6 * (arrEnd - rampDown(Math.min(t, 2), 0.3, 0.75)) } });
    } else if (c.kind === 'kayak') {
      const x = S.x, hw = 0.62;
      prop = { kind: 'jetty', x0: x - 0.95, x1: x + 0.85, z0: hw, z1: hw + 1.4, y: 0.3, sx: x };
      P = [{ x, z: hw + 1.95, y: 0 }, { x, z: hw + 1.55, y: 0.15 }, { x, z: hw + 1.2, y: 0.3 }, { x, z: hw + 0.24, y: 0.3 }];
      T = { walk: [0.35, 1.1], pop: 1.1, climb: [1.3, 2.0], into: [2.05, 3.1], tS: 3.25, xS: 1.2, out: [1.35, 2.4], down: [2.5, 3.15], vpop: 3.25, home: 3.45 };
      const tip = (a, b, f) => a + f * (b - a);
      const landIn = tip(T.into[0], T.into[1], 0.9), feetIn = tip(T.into[0], T.into[1], 0.62), landOut = tip(T.out[0], T.out[1], 0.12);
      // a kayak is tippy: it wobbles as the legs go in, rocks hard when they drop into the seat
      fxIn = (t) => ({ stow: t < T.tS ? 1 : 0, rock: damped(t, feetIn, 0.07) + damped(t, landIn, 0.17),
        prop: { v: popIn(sp(t, T.pop, T.pop + 0.35)) * (1 - sp(t, T.tS + 0.85, T.tS + 1.15)), x: -2.0 * rampUp(t, T.tS + 0.05, 0.8) } });
      fxOut = (t) => ({ stow: t >= T.xS ? 1 : 0, rock: damped(t, 1.0, 0.05) + damped(t, landOut, 0.15),
        prop: { v: es(t, 0, 0.3) * (t < T.vpop ? 1 : popOut(sp(t, T.vpop, T.vpop + 0.35))), x: 2.0 * (arrEnd - rampDown(Math.min(t, 2), 0.3, 0.75)) } });
    } else if (c.kind === 'race-car') {
      P = [{ x: S.x, z: 1.75, y: 0 }, { x: S.x, z: 1.25, y: 0 }];
      T = { walk: [0.4, 1.0], pop: 0.95, climb: [1.05, 1.3], into: [1.4, 2.2], tS: 2.4, xS: 1.1, out: [1.3, 2.0], down: [2.2, 2.45], vpop: 2.5, home: 2.7 };
    } else {                                                          // rally
      P = [{ x: S.x + 0.25, z: 1.75, y: 0 }, { x: S.x + 0.25, z: 1.3, y: 0 }];
      T = { walk: [0.4, 1.0], pop: 0.95, climb: [1.05, 1.3], into: [1.35, 2.35], tS: 2.5, xS: 1.1, out: [1.25, 2.15], down: [2.35, 2.6], vpop: 2.65, home: 2.85 };
    }
    const A = P[P.length - 1], yIn = yawOf(P[P.length - 2], A), yOut = yawOf(A, P[P.length - 2]);
    const enterP = (t) => {
      let p = idle(t);
      if (t > T.walk[0]) p = route(t, T.walk[0], T.walk[1], [{ x: C.x, z: C.z, y: 0 }, P[0]]);
      if (t > T.walk[1]) p = turnTo(standAt(P[0], yawOf(C, P[0])), yawOf(P[0], P[1]), es(t, T.walk[1], T.walk[1] + 0.2));
      if (t > T.climb[0]) p = route(t, T.climb[0], T.climb[1], P, 0.5);
      if (into) {
        if (t > T.climb[1]) p = mix(standAt(A, yIn), crouchAt(A, yIn), es(t, T.climb[1], T.into[0]) * (ownCrouch ? 0 : 1));
        if (t > T.into[0]) p = into(sp(t, T.into[0], T.into[1]), A, yIn);
        if (t > T.into[1]) p = W(seat, { hipY: Sy - 0.06 * Math.sin(PI * sp(t, T.into[1], T.into[1] + 0.2)) });
      } else if (t > T.climb[1]) p = turnTo(standAt(A, yIn), 0, es(t, T.climb[1], T.climb[1] + 0.2));
      return p;
    };
    const exitP = (t) => {
      let p;
      if (into) {
        p = seat;
        if (t > T.xS + 0.1) p = mix(seat, W(seat, { hipY: Sy + 0.08, lean: -0.2, L: [{ f: 1.0, k: 1.1 }, { f: 1.0, k: 1.1 }] }), es(t, T.xS + 0.1, T.out[0]));
        if (t > T.out[0]) p = into(1 - sp(t, T.out[0], T.out[1]), A, yIn);
        if (t > T.out[1]) p = turnTo(mix(ownCrouch ? standAt(A, yIn) : crouchAt(A, yIn), standAt(A, yIn), es(t, T.out[1], T.down[0])), yOut, es(t, T.out[1], T.down[0]));
      } else p = turnTo(standAt(A, 0), yOut, es(t, T.xS, T.xS + 0.2));
      if (t > T.down[0]) p = route(t, T.down[0], T.down[1], P.slice().reverse(), 0.5);
      if (t > T.down[1]) p = homeward(t, T.home, P[0], yawOf(P[1], P[0]));
      return p;
    };
    const inPuffs = [vPuff(T.pop), pPuff(T.tS, enterP(T.tS))], outPuffs = [pPuff(T.xS, exitP(T.xS)), vPuff(T.vpop)];
    const enter = { dur: D.enter,
      at(t) {
        const vs = popIn(sp(t, T.pop, T.pop + 0.35)), fx = fxIn(t);
        if (t < T.tS) return { pv: 1, pose: enterP(t), cv: 0, vs, mt: 0, airY: g, puffs: inPuffs, ...fx };
        return { pv: 0, cv: 1, cpop: sp(t, T.tS, T.tS + 0.3), vs: 1, airY: g, ...dep(t, T.tS), puffs: inPuffs, ...fx };
      } };
    const exit = { dur: D.exit,
      at(t, off = 0) {
        const vs = t < T.vpop ? 1 : popOut(sp(t, T.vpop, T.vpop + 0.35)), fx = fxOut(t);
        if (t < T.xS) return { pv: 0, cv: 1, vs: 1, airY: g, ...arr(t, off), puffs: outPuffs, ...fx };
        return { pv: 1, ppop: sp(t, T.xS, T.xS + 0.3), pose: exitP(t), cv: 0, vs, airY: g, mt: arrEnd + off, puffs: outPuffs, ...fx };
      } };
    return { enter, exit, popIn: T.pop, popOut: T.vpop, prop };
  }

  if (c.group === 'swim') {
    const prone = W(base(), { x: S.x, z: S.z, fix: 1, hipY: S.y, tilt: -PI / 2 + 0.04, headZ: 0.5, L: [{ f: 0.05, k: 0.1, n: -0.9 }, { f: -0.05, k: 0.1, n: -0.9 }], A: [{ f: PI - 0.15, a: 0.15, e: 0.05 }, { f: PI - 0.1, a: 0.15, e: 0.05 }] });
    const standB = W(base(), { x: B.x, z: B.z, yaw: 0 });
    const crouch = W(standB, { lean: -0.6, headZ: 0.3, L: [{ f: 0.75, k: 1.3, n: -0.5 }, { f: 0.75, k: 1.3, n: -0.5 }], A: [{ f: -0.9, e: 0.2 }, { f: -0.9, e: 0.2 }] });
    const hC = autoHip(crouch);
    const dive = (k) => { const limbs = keys(k, [[0, crouch], [0.3, W(prone, { tilt: -0.6, headZ: 0.2 })], [1, prone]]);
      return W(limbs, { x: lerp(B.x, S.x, sm(k)), z: lerp(B.z, S.z, k), fix: 1, hipY: lerp(hC, S.y, k) + 0.55 * s * Math.sin(PI * k), tilt: lerp(0, -PI / 2 + 0.04, sm(sp(k, 0.1, 0.85))) }); };
    // goggles on in the middle, facing the camera; then out to the edge, turn to the water and dive
    const gA = 0.3, w0 = 1.0, w1 = 1.5, bp = 1.2, tT = 1.5, tC = 1.7, tD = 1.95, tS = 2.6;
    const enterP = (t) => {
      let p = idle(t);
      if (t > w0) p = walk(idle(t), t, w0, w1, C, B);
      if (t > w1) p = turnTo(W(standB, { yaw: PI }), 0, es(t, tT, tT + 0.2));
      if (t > tC) p = mix(standB, crouch, es(t, tC, tD));
      if (t > tD) p = dive(sp(t, tD, tD + 0.6));
      if (t > tD + 0.6) p = prone;
      return gogglesOn(p, t, gA);
    };
    const splash = (t) => ({ t, x: S.x, y: 0.15, z: 0, r: 1.3 * s, d: 0.5 });
    const inPuffs = [vPuff(bp), splash(tS - 0.05)];
    const enter = { dur: D.enter,
      at(t) { const vs = popIn(sp(t, bp, bp + 0.35));
        return t < tS ? { pv: 1, pose: enterP(t), cv: 0, vs, mt: 0, puffs: inPuffs } : { pv: 0, cv: 1, cpop: sp(t, tS, tS + 0.3), vs: 1, mt: rampUp(t, tS, 0.6), puffs: inPuffs }; } };
    // stand up, shake off the water, back to the middle, goggles off, wave
    const xS = 1.05, bpop = xS + 1.3, h0 = xS + 1.45, gO = xS + 2.15;
    const upright = W(base(), { x: S.x + 0.3, z: S.z, yaw: 0 });
    const exitP = (t) => {
      let p = prone;
      if (t > xS + 0.1) { const k = sp(t, xS + 0.1, xS + 0.8); p = mix(prone, W(upright, { fix: 1, hipY: autoHip(upright) }), sm(k)); p.fix = 1 - sm(sp(k, 0.6, 1)); p.hipY = lerp(S.y, autoHip(upright), sm(k)) + 0.25 * s * Math.sin(PI * k); p.x = lerp(S.x, S.x + 0.3, k); }
      if (t > xS + 0.8) { p = upright; const k = sp(t, xS + 0.8, xS + 1.25); p = W(p, { headY: 0.35 * Math.sin(t * 34) * (1 - k), headZ: 0.1, A: [{ a: 0.5 + 0.2 * Math.sin(t * 30) * (1 - k) }, { a: 0.5 + 0.2 * Math.sin(t * 30 + 1) * (1 - k) }] }); }
      if (t > h0) p = walk(upright, t, h0, h0 + 0.5, { x: S.x + 0.3, z: S.z }, C);
      if (t > h0 + 0.5) p = turnTo(W(base(), { x: C.x, z: C.z, yaw: Math.atan2(0, C.x - S.x - 0.3) }), FC, es(t, h0 + 0.5, h0 + 0.7));
      if (t > gO + 0.6) p = wave(breathe(p, t), t, es(t, gO + 0.6, gO + 0.75));
      return gogglesOff(W(p, { gv: 1 }), t, gO);
    };
    const outPuffs = [splash(xS - 0.05), gPuff(gO + 0.42, 'head', 0.7), vPuff(bpop)];
    const exit = { dur: D.exit,
      at(t, off = 0) { const vs = t < bpop ? 1 : popOut(sp(t, bpop, bpop + 0.35));
        return t < xS ? { pv: 0, cv: 1, vs: 1, mt: rampDown(t, 0.2, 0.8) + off, puffs: outPuffs } : { pv: 1, ppop: sp(t, xS, xS + 0.3), pose: exitP(t), cv: 0, vs, mt: 0.6 + off, puffs: outPuffs }; } };
    return { enter, exit, popIn: bp, popOut: bpop, zoomIn: [w0, 2.3] };
  }

  if (c.group === 'glide') {
    const fl = X.air.f;
    const hold = { A: [{ f: 0.6, a: 1.2, e: 1.1 }, { f: 0.6, a: 1.2, e: 1.1 }] };
    const pod = W(base(), { x: S.x, z: S.z, yaw: 0, fix: 1, hipY: S.y, lean: 0.3, headZ: -0.1, headY: -0.2, L: [{ f: 1.45, k: 0.25, n: 0.4 }, { f: 1.45, k: 0.25, n: 0.4 }], ...hold });
    // the wing lies on the ground behind them; a forward launch run pulls it up overhead
    const X0 = { x: -1.1, z: 0 }, r0 = 1.3, r1 = 2.65, tS = 2.95;
    const enterP = (t) => {
      let p = idle(t);
      if (t > 0.35) p = walk(p, t, 0.35, 0.85, C, X0);
      if (t > 0.85) p = turnTo(W(base(), { x: X0.x, z: X0.z, yaw: PI, headY: -0.2 }), 0, es(t, 0.85, 1.1));
      if (t > 1.1) p = mix(p, W(p, hold), es(t, 1.1, 1.3));
      if (t > r0) {
        const k = sp(t, r0, r1), A = 0.9 * es(t, r0, r0 + 0.15) * (1 - es(t, r1 - 0.15, r1));
        p = W(base(), { x: lerp(X0.x, S.x, 0.3 * k + 0.7 * k * k), yaw: 0, headY: -0.2, lean: -0.15 - 0.45 * (1 - es(t, r0 + 0.3, r0 + 1.0)) });
        p = W(gait(p, 2 * PI * (t - r0) / 0.48, A), hold);
      }
      if (t > r1) { const k = sp(t, r1, tS); const st = W(base(), { x: S.x, yaw: 0, ...hold }); p = mix(st, pod, sm(k)); p.fix = 1; p.hipY = lerp(autoHip(st), S.y, k) + 0.2 * s * Math.sin(PI * k); }
      return p;
    };
    const inPuffs = [vPuff(0.8), pPuff(tS, pod)];
    const enter = { dur: D.enter,
      at(t) { const vs = popIn(sp(t, 0.8, 1.2)), inflate = es(t, r0 + 0.1, r0 + 1.15);
        if (t < tS) { const pose = enterP(t); return { pv: 1, pose, cv: 0, vs, mt: 0, airY: 0, inflate, inflateX: pose.x, puffs: inPuffs }; }
        const k = es(t, tS + 0.1, tS + 1.3); return { pv: 0, cv: 1, cpop: sp(t, tS, tS + 0.3), vs: 1, mt: rampUp(t, tS, 0.8), airY: lerp(0, fl, k), puffs: inPuffs }; } };
    const xS = 1.45, wpop = xS + 1.3;
    const flare = W(base(), { x: S.x, yaw: 0, headY: -0.2, A: [{ f: 0.3, a: 2.4, e: 0.4 }, { f: 0.3, a: 2.4, e: 0.4 }] });
    const exitP = (t) => {
      let p = pod;
      if (t > xS + 0.1) { const k = sp(t, xS + 0.1, xS + 0.45); p = mix(pod, flare, sm(k)); p.fix = 1 - sm(k); p.hipY = lerp(S.y, autoHip(flare), sm(k)); }
      if (t > xS + 0.45) { const A = 0.6 * (1 - es(t, xS + 0.5, xS + 1.0)); p = W(flare, { x: lerp(S.x, C.x, es(t, xS + 0.45, xS + 1.0)) }); if (A > 0.01) p = W(gait(p, 2 * PI * (t - xS - 0.45) / 0.46, A), { A: flare.A }); }
      if (t > xS + 1.0) p = mix(W(flare, { x: C.x }), W(base(), { x: C.x, yaw: 0 }), es(t, xS + 1.0, xS + 1.25));
      if (t > xS + 1.55) p = turnTo(W(base(), { x: C.x, yaw: 0 }), FC, es(t, xS + 1.55, xS + 1.8));
      if (t > xS + 1.75) p = wave(breathe(p, t), t, es(t, xS + 1.75, xS + 1.9));
      return p;
    };
    const outPuffs = [pPuff(xS, pod), vPuff(wpop)];
    const exit = { dur: D.exit,
      at(t, off = 0) { const vs = t < wpop ? 1 : popOut(sp(t, wpop, wpop + 0.35));
        if (t < xS) return { pv: 0, cv: 1, vs: 1, mt: rampDown(t, 0.3, 1.0) + off, airY: lerp(fl, 0, es(t, 0.2, 1.35)), puffs: outPuffs };
        const pose = exitP(t);
        return { pv: 1, ppop: sp(t, xS, xS + 0.3), pose, cv: 0, vs, mt: 0.8 + off, airY: 0, inflate: 1 - es(t, xS + 0.5, xS + 1.2), inflateX: pose.x, puffs: outPuffs }; } };
    return { enter, exit, popIn: 0.8, popOut: wpop, zoomIn: [0.8, 1.25] };
  }
}

/* ---------- one stage per side of the transition ---------- */
function buildStage(icon, mod, role) {
  const CFG = { ...MODEL_STAGING[icon], icon };
  const { model, kit } = mod.createModelScene();
  const { makePerson, makePuffs, makeProp } = kitTools(kit);
  const crew = (model.crew || []).filter(Boolean);
  model.pose(0); model.root.updateMatrixWorld(true);
  const X = { air: null };
  const wp = TV(0, 0, 0), ws = TV(1, 1, 1);
  if (CFG.seat === 'auto') { crew[0].getWorldPosition(wp); crew[0].getWorldScale(ws); X.seat = { x: wp.x, y: wp.y + 0.04 * ws.x, z: wp.z }; }
  else X.seat = CFG.seat || { x: 0, y: 1, z: 0 };
  const person = makePerson(Object.assign({ s: 0.81 * ws.x, torsoK: 1.1, armK: 1.15 }, CFG.person || {})); X.person = person;
  X.stand = { x: CFG.stand?.x ?? X.seat.x, z: CFG.stand?.z ?? CFG.side ?? 1.2 };
  for (const o of crew) o.visible = false;
  const bb = new THREE.Box3().setFromObject(model.root);
  for (const o of crew) o.visible = true;
  if (CFG.air === 'plane') X.air = { g: -bb.min.y, f: 0 };
  else if (CFG.air) X.air = CFG.air;
  const g0 = X.air ? X.air.g : 0;
  const ctr = bb.getCenter(TV(0, 0, 0)), size = bb.getSize(TV(0, 0, 0));
  X.vc = { x: ctr.x, y: ctr.y + g0, z: ctr.z }; X.vr = Math.max(0.5, Math.min(2.2, 0.32 * Math.max(size.x, size.y)));
  if (CFG.group === 'foot') X.vc = { x: 0, y: 1, z: 0 };

  const world = new THREE.Group();
  const pivot = new THREE.Group(); pivot.position.set(X.vc.x, X.vc.y, X.vc.z); world.add(pivot);
  const inner = new THREE.Group(); inner.position.set(-X.vc.x, -X.vc.y, -X.vc.z); pivot.add(inner);
  const airG = new THREE.Group(); inner.add(airG); airG.add(model.root);
  // The person, their props and poofs live in a group that can be mirrored, so they always board on the side facing the camera.
  const side = new THREE.Group(); world.add(side); side.add(person.P);
  const puffs = makePuffs(side);
  const crewBase = crew.map((o) => o.scale.clone());
  const G = choreography(CFG, X);
  const clip = role === 'exit' ? G.exit : G.enter;
  const prop = G.prop ? makeProp(G.prop) : null;
  if (prop) side.add(prop.g);
  const s = person.s;
  // Neutral framing: the runner's own framing, scaled to this person's standing height (≈3.02 for the runner).
  const k = (person.autoHip(base()) + person.HY + 0.42 * s) / 3.02;
  const f = FRAMES[icon], neutral = [-1.75 * k, 1.75 * k, 2.6 * k, -0.9 * k, 1 * k];
  const zoomIn = G.zoomIn ?? (G.popIn == null ? null : [0.4, 1.0]);
  const tmp = TV(0, 0, 0);
  function apply(t, mirrored) {
    const st = clip.at(t, 0);
    side.scale.z = mirrored ? -1 : 1;
    person.P.visible = !!st.pv;
    if (st.pv) { person.apply(st.pose, t); const k = st.ppop ?? 1; person.P.scale.setScalar(s * (k < 1 ? 0.55 + 0.45 * popInK(k) : 1)); }
    crew.forEach((o, i) => { o.visible = !!st.cv; const k = st.cpop ?? 1; o.scale.copy(crewBase[i]).multiplyScalar(st.cv && k < 1 ? 0.55 + 0.45 * popInK(k) : 1); });
    const vs = st.vs ?? 1; pivot.scale.setScalar(Math.max(0.001, vs)); pivot.visible = vs > 0.01;
    // engine running: the whole vehicle buzzes a little
    const buzz = st.shake ? 0.03 * st.shake * (Math.floor(t * 12) % 2 ? 1 : -1) : 0;
    airG.position.y = (st.airY ?? g0) + buzz; airG.rotation.z = st.pitch ?? 0; airG.rotation.x = st.rock ?? 0;
    model.pose(st.mt ?? 0);
    model.fx?.({ door: st.door ?? 0, sail: st.sail ?? 1, stow: st.stow ?? 0, inflate: st.inflate ?? 1, inflateX: st.inflateX ?? 0, side: mirrored ? -1 : 1 });
    if (prop) prop.set(st.prop);
    // poofs on the head or a foot follow the person
    let events = st.puffs || [];
    if (events.some((e) => e.at)) {
      world.updateMatrixWorld(true);
      events = events.map((e) => { if (!e.at) return e; person.locate(e.at, tmp); side.worldToLocal(tmp); return { ...e, x: tmp.x, y: tmp.y, z: tmp.z }; });
    }
    puffs(t, events);
    // framing: 0 = the model's own marker framing, 1 = framed on the neutral person
    // zoom in on the person only once they are back in the middle, and out as they step aside to make room
    const n = role === 'exit' ? (G.popOut == null ? 0 : es(t, G.popOut + 0.3, G.popOut + 0.9))
      : (zoomIn == null ? 0 : 1 - es(t, zoomIn[0], zoomIn[1]));
    return f.map((v, i) => lerp(v, neutral[i], n));
  }
  function dispose() {
    const geometries = new Set(), materials = new Set();
    world.traverse((obj) => { if (obj.geometry) geometries.add(obj.geometry); if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => materials.add(m)); });
    geometries.forEach((g) => g.dispose()); materials.forEach((m) => { m.map?.dispose?.(); m.dispose(); });
  }
  return { world, apply, kit, dur: clip.dur, dispose };
}
const popInK = popIn;

/**
 * Render a transition into `canvas`: Finish of `fromIcon` then Get ready of `toIcon`.
 * `modules` are the loaded model modules for both icons.
 */
export function createMarkerTransitionRenderer(canvas, fromIcon, toIcon, fromModule, toModule) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(256, 256, false);
  const scene = new THREE.Scene();
  const A = buildStage(fromIcon, fromModule, 'exit'), B = buildStage(toIcon, toModule, 'enter');
  scene.add(A.world, B.world);
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
  let mirrored = null;
  /** `clipSeconds` runs from 0 to exitDuration + enterDuration. */
  function render(clipSeconds, heading, mapBearing, pitch, color) {
    const R = Math.PI / 2 - THREE.MathUtils.degToRad(heading);
    const b = THREE.MathUtils.degToRad(mapBearing);
    const inclination = THREE.MathUtils.degToRad(Math.max(1, Math.min(85, pitch)));
    // camera direction in the model's frame decides which side the person steps out on (locked per transition)
    const dx = -Math.sin(b), dz = Math.cos(b);
    const lx = dx * Math.cos(R) - dz * Math.sin(R), lz = dx * Math.sin(R) + dz * Math.cos(R);
    if (mirrored === null) mirrored = lz < 0;
    FC = Math.atan2(-(mirrored ? -lz : lz), lx);
    const useA = clipSeconds < A.dur;
    const stage = useA ? A : B, t = useA ? clipSeconds : clipSeconds - A.dur;
    A.world.visible = useA; B.world.visible = !useA;
    stage.world.rotation.y = R;
    stage.kit.M.orange.uniforms.col.value.set(color || 0xC1652F);
    stage.kit.BOIL.value = Math.floor(clipSeconds * 8) % 3;
    const [l, r, top, bottom, ly] = stage.apply(Math.floor(t * 12) / 12, mirrored);
    camera.left = l; camera.right = r; camera.top = top; camera.bottom = bottom; camera.updateProjectionMatrix();
    camera.position.set(-8 * Math.sin(b) * Math.sin(inclination), 8 * Math.cos(inclination) + ly, 8 * Math.cos(b) * Math.sin(inclination));
    camera.up.set(0, 1, 0); camera.lookAt(0, ly, 0);
    renderer.render(scene, camera);
  }
  function dispose() { A.dispose(); B.dispose(); renderer.dispose(); }
  return { render, dispose, duration: A.dur + B.dur };
}
