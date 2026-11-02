// SONAR 3D models: the vinyl submarine (one smooth SDF hull with eyes, portholes and a spinning propeller), the
// scallop clam shell halves, the cartoon sea mine and the reef fish.
//   const sub = makeSub(S)     -> { root, inner, prop, update(dt, t), bump(v), look(on) }
//   const g = shellGeos()      -> { top, bottom } BufferGeometry for a clam (hinge at z = -0.42)
//   const m = makeMine(S)      -> { root, angry(on), update(dt, t) }
//   const f = makeFish(S, kind) -> { root, update(dt, t) }   swims along its local +x
import { THREE } from '../lib/stage.js';
import { makeShape, meshSDF } from '../sneak/sdfmesh.js';

const E = (c, r, col, k = 0.05, x = {}) => ({ t: 'e', c, r, col, k, ...x });
const C = (a, b, ra, rb, col, k = 0.04) => ({ t: 'c', a, b, ra, rb, col, k });

// ------------------------------------------------------------------ submarine
let subGeo = null;
function subGeometry() {
  if (subGeo) return subGeo;
  const prims = [
    E([0, 0, 0], [0.36, 0.34, 0.62], 'hull', 0.05),               // round hull, nose toward +z
    E([0, 0.32, 0.0], [0.16, 0.18, 0.25], 'hull', 0.08),          // conning tower
    E([0, 0.47, 0.0], [0.15, 0.035, 0.24], 'trim', 0.03),         // tower cap
    C([0.06, 0.48, 0.06], [0.06, 0.7, 0.06], 0.032, 0.032, 'trim', 0.02),   // periscope
    C([0.06, 0.7, 0.06], [0.06, 0.7, 0.17], 0.034, 0.034, 'trim', 0.02),
    E([0, 0, -0.6], [0.34, 0.03, 0.12], 'trim', 0.04),            // tail fins
    E([0, 0, -0.6], [0.03, 0.3, 0.12], 'trim', 0.04),
    E([0.37, -0.07, 0.16], [0.16, 0.025, 0.08], 'trim', 0.04),    // side fins
    E([-0.37, -0.07, 0.16], [0.16, 0.025, 0.08], 'trim', 0.04),
  ];
  const cols = { hull: new THREE.Color('#ffc531'), trim: new THREE.Color('#ff5a3d'), band: new THREE.Color('#ff5a3d'), nose: new THREE.Color('#ff7a4d') };
  const tint = (x, y, z, key, c) => {
    if (key === 'hull' && z > 0.5) c.copy(cols.nose);
    if (key === 'hull' && Math.abs(z + 0.3) < 0.05 && y < 0.25) c.copy(cols.band);
    return c;
  };
  subGeo = meshSDF(makeShape(prims), 84, cols, tint, null, 2);
  return subGeo;
}

export function makeSub(S) {
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.65 });
  const body = new THREE.Mesh(subGeometry(), mat); body.castShadow = true;
  const inner = new THREE.Group(); inner.add(body);
  // portholes along both sides
  const rimMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.2, metalness: 0.2, clearcoat: 1 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#7fe8ff', roughness: 0.05, clearcoat: 1, emissive: '#3fd0ff', emissiveIntensity: 0.35 });
  for (const s of [-1, 1]) for (const z of [0.18, -0.08]) {
    const g = new THREE.Group(); g.position.set(s * 0.345, 0.03, z); g.rotation.y = s * Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 10, 24), rimMat);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), glassMat); glass.position.z = 0.004;
    g.add(rim, glass); inner.add(g);
  }
  // big friendly eyes on the nose
  const white = new THREE.MeshPhysicalMaterial({ color: '#fff', roughness: 0.1, clearcoat: 1 });
  const black = new THREE.MeshPhysicalMaterial({ color: '#141022', roughness: 0.12, clearcoat: 1 });
  const eyes = [-1, 1].map((s) => {
    const g = new THREE.Group(); g.position.set(s * 0.12, 0.13, 0.52);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 14), white); e.scale.z = 0.55;
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.046, 14, 10), black); p.position.z = 0.04;
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff' })); gl.position.set(0.016, 0.02, 0.078);
    g.add(e, p, gl); inner.add(g); return g;
  });
  // cheeks
  const cheekMat = new THREE.MeshBasicMaterial({ color: '#ff7aa0', transparent: true, opacity: 0.55 });
  for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), cheekMat); c.position.set(s * 0.22, 0.02, 0.535); c.rotation.y = s * 0.55; inner.add(c); }
  // propeller
  const prop = new THREE.Group(); prop.position.set(0, 0, -0.7);
  const bladeMat = new THREE.MeshPhysicalMaterial({ color: '#ff5a3d', roughness: 0.3, clearcoat: 1 });
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), bladeMat); prop.add(hub);
  for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 8), bladeMat); b.scale.set(0.45, 1, 0.12); b.position.set(Math.cos(k * 2.094) * 0.09, Math.sin(k * 2.094) * 0.09, 0); b.rotation.z = k * 2.094 - Math.PI / 2; b.rotation.y = 0.5; prop.add(b); }
  inner.add(prop);
  // headlight on the tower front
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff7c2', toneMapped: false })); lamp.position.set(0, 0.36, 0.25); inner.add(lamp);
  const root = new THREE.Group(); root.add(inner);
  let blink = 2, squash = 0, sv = 0, spin = 4, worried = 0;
  return {
    root, inner, prop, eyes,
    bump(v = -0.18) { squash = v; },
    spin(v) { spin = v; },
    worry(v) { worried = v; },
    update(dt, t) {
      sv += (-squash * 150 - sv * 12) * dt; squash += sv * dt;
      const s = 1 + squash; inner.scale.set(1 / Math.sqrt(Math.max(0.5, s)), s, 1 / Math.sqrt(Math.max(0.5, s)));
      prop.rotation.z += dt * spin; spin += (4 - spin) * (1 - Math.exp(-dt * 1.5));
      blink -= dt; const b = blink < 0.12 && blink > 0 ? 0.15 : 1; if (blink < 0) blink = 2 + Math.random() * 3;
      for (const e of eyes) e.scale.y = b;
      for (const e of eyes) e.children[1].position.y = -0.018 * worried;
    },
  };
}

// ------------------------------------------------------------------ clam shells
export function shellGeos() {
  // scallop: a low fan with ribs radiating from the hinge, a wavy lip and two small "ears" at the hinge.
  // Vertex colours are a light/dark factor (rib crests light, grooves darker) that multiplies the shell colour.
  const make = (top) => {
    const g = new THREE.SphereGeometry(0.5, 72, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = g.attributes.position, v = new THREE.Vector3(), col = new Float32Array(p.count * 3);
    const sc = top ? 1 : 0.965;                                     // bottom half a hair smaller: no z-fighting at the lips
    for (let k = 0; k < p.count; k++) {
      v.fromBufferAttribute(p, k);
      const h = Math.min(1, Math.hypot(v.x, v.z) / 0.5);            // 0 crown, 1 rim
      const th = Math.atan2(v.x, v.z + 0.5);                          // fan angle from the hinge
      const c = Math.cos(th * 13), rib = Math.pow(0.5 + 0.5 * c, 1.5);
      let x = v.x * sc * (1 + 0.05 * rib * h * h), z = (v.z * 0.84 + 0.02) * sc * (1 + 0.05 * rib * h * h);
      const back = Math.max(0, -z / 0.42); x *= 1 - 0.42 * back * back;   // narrow toward the hinge
      if (z < -0.3 && Math.abs(x) < 0.32) x *= 1 + 0.6 * Math.max(0, (-z - 0.3) / 0.12) * (1 - h * 0.2);   // ears
      let y = v.y * (top ? 0.4 : 0.3) * (1 + 0.42 * rib * Math.min(1, h * 1.2));
      y += top ? 0.004 : 0; if (!top) y = -y;
      p.setXYZ(k, x, y, z);
      const f = (0.78 + 0.22 * rib) * (0.95 + 0.05 * Math.cos(h * 26)) * (1 + 0.12 * (1 - h));
      col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = Math.min(1.1, f);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!top) { const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; } }
    g.computeVertexNormals();
    return g;
  };
  return { top: make(true), bottom: make(false) };
}

// ------------------------------------------------------------------ sea mine
const HORNS = (() => { const a = [], n = 11; for (let i = 0; i < n; i++) { const y = 1 - (i / (n - 1)) * 1.6, r = Math.sqrt(Math.max(0, 1 - y * y)), th = i * 2.399; a.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r).normalize()); } return a; })();
let MG = null;
function mineGeos() {
  if (MG) return MG;
  MG = { body: new THREE.SphereGeometry(0.3, 32, 24), stem: new THREE.CylinderGeometry(0.035, 0.045, 0.14, 10), tip: new THREE.SphereGeometry(0.058, 12, 10), belt: new THREE.TorusGeometry(0.3, 0.032, 10, 40),
    lamp: new THREE.SphereGeometry(0.06, 14, 10), eye: new THREE.SphereGeometry(0.075, 16, 12), pupil: new THREE.SphereGeometry(0.04, 12, 8), brow: new THREE.BoxGeometry(0.12, 0.028, 0.03), mouth: new THREE.TorusGeometry(0.05, 0.014, 8, 16, Math.PI) };
  return MG;
}
export function makeMine(S) {
  const G = mineGeos();
  const root = new THREE.Group(), inner = new THREE.Group(); root.add(inner);
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: '#4a35a0', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.7, emissive: '#ff2a3a', emissiveIntensity: 0 });
  const body = new THREE.Mesh(G.body, bodyMat); body.castShadow = true; inner.add(body);
  const hornMat = new THREE.MeshPhysicalMaterial({ color: '#ffc531', roughness: 0.3, clearcoat: 1 });
  const stemMat = new THREE.MeshPhysicalMaterial({ color: '#c9c2e8', roughness: 0.35, clearcoat: 1 });
  const up = new THREE.Vector3(0, 1, 0);
  for (const d of HORNS) {
    if (d.z > 0.55 && Math.abs(d.y) < 0.6) continue;   // keep the face clear
    const stem = new THREE.Mesh(G.stem, stemMat);
    stem.quaternion.setFromUnitVectors(up, d); stem.position.copy(d).multiplyScalar(0.33); inner.add(stem);
    const tip = new THREE.Mesh(G.tip, hornMat); tip.position.copy(d).multiplyScalar(0.41); tip.castShadow = true; inner.add(tip);
  }
  const belt = new THREE.Mesh(G.belt, new THREE.MeshPhysicalMaterial({ color: '#ff5a7a', roughness: 0.3, clearcoat: 1 }));
  belt.rotation.x = Math.PI / 2; belt.position.y = -0.06; inner.add(belt);
  const lamp = new THREE.Mesh(G.lamp, new THREE.MeshBasicMaterial({ color: '#ff3048', toneMapped: false })); lamp.position.y = 0.31; inner.add(lamp);
  // face
  const white = new THREE.MeshPhysicalMaterial({ color: '#fff', roughness: 0.1, clearcoat: 1 });
  const black = new THREE.MeshPhysicalMaterial({ color: '#141022', roughness: 0.12, clearcoat: 1 });
  const eyes = [-1, 1].map((s) => {
    const g = new THREE.Group(); g.position.set(s * 0.1, 0.06, 0.255);
    const e = new THREE.Mesh(G.eye, white); e.scale.z = 0.55;
    const p = new THREE.Mesh(G.pupil, black); p.position.z = 0.035;
    const brow = new THREE.Mesh(G.brow, black); brow.position.set(0, 0.085, 0.03); brow.rotation.z = -s * 0.5; brow.visible = false;
    g.add(e, p, brow); inner.add(g); return { g, brow, p };
  });
  const mouth = new THREE.Mesh(G.mouth, black); mouth.position.set(0, -0.06, 0.29); mouth.rotation.z = Math.PI; inner.add(mouth);
  let isAngry = false, blink = 1 + Math.random() * 2;
  return {
    root, inner, bodyMat,
    angry(on) { isAngry = on; for (const e of eyes) e.brow.visible = on; mouth.rotation.z = on ? 0 : Math.PI; mouth.position.y = on ? -0.1 : -0.06; },
    update(dt, t) {
      const on = Math.sin(t * (isAngry ? 14 : 4)) > 0;
      lamp.material.color.set(on ? '#ff3048' : '#5a0f1a');
      bodyMat.emissiveIntensity = isAngry ? 0.12 + 0.12 * Math.sin(t * 14) : 0;
      blink -= dt; const b = blink < 0.12 && blink > 0 ? 0.15 : 1; if (blink < 0) blink = 2 + Math.random() * 3;
      for (const e of eyes) e.g.scale.y = isAngry ? 1 : b;
    },
  };
}

// ------------------------------------------------------------------ fish
const FISH = {
  clown: { body: '#ff7a1f', stripe: '#ffffff', fin: '#ff5a1a', stripes: 3 },
  tang: { body: '#2f7bff', stripe: '#ffd23a', fin: '#ffd23a', stripes: 0 },
  pink: { body: '#ff6fb0', stripe: '#ffd1e8', fin: '#b55cff', stripes: 2 },
  lemon: { body: '#ffd84a', stripe: '#ff9a3d', fin: '#ff9a3d', stripes: 1 },
  mint: { body: '#3fe0b0', stripe: '#ffffff', fin: '#2fa8ff', stripes: 2 },
};
const fishGeoCache = new Map();
export function makeFish(S, kind = 'clown') {
  const c = FISH[kind];
  let geo = fishGeoCache.get(kind);
  if (!geo) {
    geo = new THREE.SphereGeometry(0.5, 28, 18); geo.scale(0.5, 0.34, 0.17);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), a = new THREE.Color(c.body), b = new THREE.Color(c.stripe), tmp = new THREE.Color();
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k);
      let isStripe = false;
      if (c.stripes === 3) isStripe = Math.abs(x - 0.12) < 0.025 || Math.abs(x + 0.04) < 0.025 || Math.abs(x + 0.18) < 0.02;
      else if (c.stripes === 2) isStripe = Math.abs(x - 0.08) < 0.03 || Math.abs(x + 0.1) < 0.03;
      else if (c.stripes === 1) isStripe = p.getY(k) < -0.06;
      tmp.copy(isStripe ? b : a); col.set([tmp.r, tmp.g, tmp.b], k * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    fishGeoCache.set(kind, geo);
  }
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 1, envMapIntensity: 0.6 });
  const finMat = new THREE.MeshPhysicalMaterial({ color: c.fin, roughness: 0.35, clearcoat: 1, side: THREE.DoubleSide });
  const root = new THREE.Group(), inner = new THREE.Group(); root.add(inner);
  const body = new THREE.Mesh(geo, mat); body.castShadow = true; inner.add(body);
  const tail = new THREE.Group(); tail.position.x = -0.22; inner.add(tail);
  const tm = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.2, 3), finMat); tm.rotation.z = Math.PI / 2; tm.scale.z = 0.25; tm.position.x = -0.08; tail.add(tm);
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 3), finMat); dorsal.position.set(-0.02, 0.17, 0); dorsal.scale.z = 0.25; dorsal.rotation.z = 0.5; inner.add(dorsal);
  const white = new THREE.MeshPhysicalMaterial({ color: '#fff', roughness: 0.1, clearcoat: 1 }), black = new THREE.MeshBasicMaterial({ color: '#141022' });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), white); e.position.set(0.15, 0.04, s * 0.06); const pp = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), black); pp.position.set(0.17, 0.04, s * 0.085); inner.add(e, pp); }
  const ph = Math.random() * 6;
  return { root, update(dt, t) { tail.rotation.y = Math.sin(t * 9 + ph) * 0.5; inner.rotation.y = Math.sin(t * 9 + ph + 1) * 0.06; } };
}
