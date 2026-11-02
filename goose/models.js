// GOOSE 63 models: the vinyl goose (pawn, decor geese, golden statue) from one smooth SDF body, and the dice.
//   const g = makeGoose(S, { body, scarf, gold })   -> { root, inner, wings: [l, r], eyes, update(dt, t), flap(on) }
//   const d = makeDie(S)                            -> Mesh; showFace(mesh, value, yaw) orients it with value on top
import { THREE } from '../lib/stage.js';
import { makeShape, meshSDF } from '../sneak/sdfmesh.js';

const E = (c, r, col, k = 0.05) => ({ t: 'e', c, r, col, k });
const C = (a, b, ra, rb, col, k = 0.04) => ({ t: 'c', a, b, ra, rb, col, k });

const geoCache = new Map();
function gooseGeo(key, cols) {
  if (geoCache.has(key)) return geoCache.get(key);
  const prims = [
    E([0, 0.42, -0.05], [0.36, 0.3, 0.46], 'body', 0.06),          // round body
    E([0, 0.52, -0.42], [0.16, 0.14, 0.16], 'body', 0.12),         // tail bump
    C([0, 0.6, 0.22], [0, 1.0, 0.3], 0.14, 0.11, 'body', 0.1),     // neck
    E([0, 1.08, 0.31], [0.17, 0.16, 0.17], 'body', 0.08),          // head
    E([0, 1.04, 0.5], [0.075, 0.05, 0.12], 'beak', 0.03),          // beak
    E([0, 0.76, 0.27], [0.165, 0.06, 0.15], 'scarf', 0.02),        // scarf around the neck
    E([0.07, 0.69, 0.4], [0.05, 0.12, 0.03], 'scarf', 0.02),       // scarf tail
    C([-0.12, 0.16, 0], [-0.12, 0.05, 0.02], 0.04, 0.035, 'beak'),  // legs
    C([0.12, 0.16, 0], [0.12, 0.05, 0.02], 0.04, 0.035, 'beak'),
    E([-0.13, 0.03, 0.09], [0.1, 0.03, 0.13], 'beak', 0.02),       // webbed feet
    E([0.13, 0.03, 0.09], [0.1, 0.03, 0.13], 'beak', 0.02),
  ];
  const colors = {}; for (const k in cols) colors[k] = new THREE.Color(cols[k]);
  const geo = meshSDF(makeShape(prims), 88, colors, null, null, 2);
  geoCache.set(key, geo);
  return geo;
}

export function makeGoose(S, o = {}) {
  const cols = { body: o.body || '#fbfbff', beak: o.beak || '#ff9a1f', scarf: o.scarf || '#ff4d7a' };
  const key = cols.body + cols.beak + cols.scarf;
  const mat = o.gold
    ? new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 1, roughness: 0.22, clearcoat: 1, envMapIntensity: 1.3 })
    : new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.6 });
  const body = new THREE.Mesh(gooseGeo(key, o.gold ? { body: '#ffc93c', beak: '#ff9f1a', scarf: '#ffe07a' } : cols), mat);
  body.castShadow = true; body.receiveShadow = !o.gold;
  const inner = new THREE.Group(); inner.add(body);
  // wings: separate so they can flap
  const wingMat = mat.clone(); wingMat.vertexColors = false; wingMat.color.set(o.gold ? '#ffcf4a' : cols.body);
  const wings = [-1, 1].map((s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.3, 0.52, -0.02);
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), wingMat);
    w.scale.set(0.35, 0.75, 1.35); w.position.set(s * 0.05, -0.04, -0.06); w.rotation.x = 0.35; w.castShadow = true;
    pivot.add(w); inner.add(pivot); return pivot;
  });
  // eyes
  const white = new THREE.MeshPhysicalMaterial({ color: '#fff', roughness: 0.1, clearcoat: 1 });
  const black = new THREE.MeshPhysicalMaterial({ color: o.gold ? '#7a4a00' : '#141022', roughness: 0.12, clearcoat: 1 });
  const eyes = [-1, 1].map((s) => {
    const g = new THREE.Group(); g.position.set(s * 0.1, 1.13, 0.43);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), white); e.scale.z = 0.6;
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 8), black); p.position.z = 0.035;
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff' })); gl.position.set(0.012, 0.015, 0.058);
    g.add(e, p, gl); inner.add(g); return g;
  });
  const root = new THREE.Group(); root.add(inner);
  let flapping = 0, blink = 2, idle = o.idle !== false, squash = 0, sv = 0;
  return {
    root, inner, wings, eyes,
    flap(on) { flapping = on ? 1 : 0; },
    bump(v = -0.2) { squash = v; },
    update(dt, t) {
      sv += (-squash * 160 - sv * 13) * dt; squash += sv * dt;
      const s = 1 + squash;
      inner.scale.set(1 / Math.sqrt(Math.max(0.4, s)), s, 1 / Math.sqrt(Math.max(0.4, s)));
      const fl = flapping ? Math.sin(t * 28) * 0.9 : (idle ? Math.sin(t * 2.1) * 0.06 : 0);
      wings[0].rotation.z = -0.15 - Math.max(0, fl); wings[1].rotation.z = 0.15 + Math.max(0, fl);
      if (idle && !flapping) inner.rotation.z = Math.sin(t * 1.7) * 0.04;
      blink -= dt; const b = blink < 0.12 && blink > 0 ? 0.15 : 1; if (blink < 0) blink = 2 + Math.random() * 3;
      for (const e of eyes) e.scale.y = b;
    },
  };
}

// dice: rounded white cube with coloured pips. Faces: 1 +z, 6 -z, 2 +x, 5 -x, 3 +y, 4 -y
const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
const FACE = { 1: [0, 0, 1], 6: [0, 0, -1], 2: [1, 0, 0], 5: [-1, 0, 0], 3: [0, 1, 0], 4: [0, -1, 0] };
export function makeDie(S, RoundedBoxGeometry, pipColor = '#ff3d6e') {
  const size = 0.62, h = size / 2;
  const die = new THREE.Mesh(new RoundedBoxGeometry(size, size, size, 4, 0.11), new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.8 }));
  die.castShadow = true;
  const pipGeo = new THREE.CircleGeometry(0.058, 20);
  const pipMat = new THREE.MeshPhysicalMaterial({ color: pipColor, roughness: 0.3, clearcoat: 1 });
  for (const v in PIPS) {
    const n = new THREE.Vector3(...FACE[v]);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    // two in-plane axes for this face
    const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(q), ay = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    for (const [a, b] of PIPS[v]) {
      const p = new THREE.Mesh(pipGeo, pipMat);
      p.position.copy(n).multiplyScalar(h + 0.002).addScaledVector(ax, a * 0.17).addScaledVector(ay, b * 0.17);
      p.quaternion.copy(q);
      die.add(p);
    }
  }
  return die;
}
// quaternion that puts face `value` on top, then turns it by yaw around the vertical
export function faceUp(value, yaw = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...FACE[value]), new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q);
}
