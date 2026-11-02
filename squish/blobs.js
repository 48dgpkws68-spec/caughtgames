// SQUISH JAR blobs: glossy vinyl jelly blobs with cute faces, one smooth SDF body per tier (little top features that
// grow with the tier), a jelly spring for squash and wobble, blinking eyes and a happy face after a merge.
//   const F = blobFactory(S)   const b = F.make(tier)   b.root (scale it to the sim radius)   b.update(dt, t)
//   b.hit(amount)  jelly squash      b.happy(seconds)  ^ ^ eyes      F.TIER  names and colours per tier
import { THREE } from '../lib/stage.js';
import { makeShape, meshSDF } from '../sneak/sdfmesh.js';

export const TIER = [
  { name: 'Drop', col: '#ff4f86', blush: '#ff9fbf' },
  { name: 'Nubbin', col: '#ff8a2b', blush: '#ffc39a' },
  { name: 'Sprout', col: '#ffcc1f', blush: '#ffa36b' },
  { name: 'Kitty', col: '#2fcf7f', blush: '#ff8fb0' },
  { name: 'Bunny', col: '#38a8ff', blush: '#ff9ccf' },
  { name: 'Curly', col: '#9a62ff', blush: '#ff9de0' },
  { name: 'Golden', col: '#ffd447', blush: '#ff9a5a', gold: true },
  { name: 'Rainbow', col: '#ffffff', blush: '#ff8ad8', rainbow: true },
];

const E = (c, r, col, k = 0.08, rot) => ({ t: 'e', c, r, col, k, rot });
const C = (a, b, ra, rb, col, k = 0.08) => ({ t: 'c', a, b, ra, rb, col, k });

// body of radius ~1 around the origin, the face looks at +z
function prims(tier) {
  const p = [E([0, 0, 0], [1, 0.97, 1], 'b', 0.1)];
  if (tier === 0) p.push(C([0, 0.78, 0], [0, 1.2, 0], 0.32, 0.05, 'b', 0.28));                       // droplet tip
  if (tier === 1) for (const s of [-1, 1]) p.push(E([s * 0.56, 0.78, -0.05], [0.27, 0.27, 0.22], 'b', 0.2));   // round nubs
  if (tier === 2) {                                                                                    // a sprout
    p.push(C([0, 0.9, 0], [0, 1.22, 0], 0.07, 0.055, 'leaf', 0.05));
    for (const s of [-1, 1]) p.push(E([s * 0.22, 1.27, 0], [0.24, 0.085, 0.14], 'leaf', 0.04, [0, 0, s * 0.45]));
  }
  if (tier === 3) for (const s of [-1, 1]) {                                                           // kitty ears
    p.push(C([s * 0.5, 0.72, 0], [s * 0.68, 1.17, 0.02], 0.28, 0.05, 'b', 0.14));
    p.push(E([s * 0.6, 0.98, 0.17], [0.09, 0.15, 0.04], 'in', 0.02));
  }
  if (tier === 4) for (const s of [-1, 1]) {                                                           // short bunny ears
    p.push(C([s * 0.32, 0.82, -0.04], [s * 0.46, 1.32, -0.04], 0.17, 0.14, 'b', 0.12));
    p.push(E([s * 0.41, 1.12, 0.09], [0.075, 0.2, 0.05], 'in', 0.02));
  }
  if (tier === 5) {                                                                                    // curly antenna with a ball
    p.push(C([0, 0.9, 0], [0.12, 1.2, 0], 0.07, 0.05, 'b', 0.08));
    p.push(C([0.12, 1.2, 0], [0.3, 1.3, 0], 0.05, 0.05, 'b', 0.05));
    p.push(E([0.36, 1.34, 0], [0.15, 0.15, 0.15], 'in', 0.04));
  }
  if (tier === 7) p.push(C([0, 0.8, 0], [0.05, 1.22, 0], 0.3, 0.06, 'b', 0.26));                    // rainbow: a curly tip
  if (tier === 6) {                                                                                    // a crown of five nubs
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2, x = Math.cos(a) * 0.36, z = Math.sin(a) * 0.36;
      p.push(C([x * 0.9, 0.86, z * 0.9], [x * 1.25, 1.26, z * 1.25], 0.13, 0.06, 'crown', 0.05));
      p.push(E([x * 1.28, 1.3, z * 1.28], [0.08, 0.08, 0.08], 'gem', 0.02));
    }
    p.push({ t: 't', c: [0, 0.88, 0], R: 0.42, r: 0.07, col: 'crown', k: 0.05 });
  }
  return p;
}

const geoCache = new Map();
function bodyGeo(tier) {
  if (geoCache.has(tier)) return geoCache.get(tier);
  const T = TIER[tier], base = new THREE.Color(T.col);
  const cols = {
    b: base, leaf: new THREE.Color('#3fcf5a'), in: new THREE.Color(tier === 5 ? '#ff7ac8' : '#ffb3cf'),
    crown: new THREE.Color('#ffe27a'), gem: new THREE.Color('#ff4f86'),
  };
  const geo = meshSDF(makeShape(prims(tier)), tier === 6 ? 84 : 60, cols, null, null, 2);
  if (T.rainbow) {   // rainbow stripes running round the body, by height and angle
    const pos = geo.attributes.position, col = geo.attributes.color, c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { const h = (pos.getY(i) + 1) * 0.36 + Math.atan2(pos.getZ(i), pos.getX(i)) / (Math.PI * 2) * 0.25; c.setHSL(((h % 1) + 1) % 1, 0.95, 0.62); col.setXYZ(i, c.r, c.g, c.b); }
    col.needsUpdate = true;
  }
  geoCache.set(tier, geo);
  return geo;
}

export function blobFactory(S) {
  const mats = TIER.map((T) => (T.rainbow
    ? new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.1, iridescence: 1, iridescenceIOR: 1.6, emissive: '#ffffff', emissiveIntensity: 0.12 })
    : T.gold
    ? new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.6, emissive: '#ffb000', emissiveIntensity: 0.28 })
    : new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.75, sheen: 0.4, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.4 })));
  const black = new THREE.MeshPhysicalMaterial({ color: '#1a1030', roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 });
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const blushMats = TIER.map((T) => new THREE.MeshBasicMaterial({ color: T.blush, transparent: true, opacity: 0.75, depthWrite: false }));
  const eyeGeo = new THREE.SphereGeometry(1, 18, 14), glintGeo = new THREE.SphereGeometry(1, 8, 6);
  const happyGeo = new THREE.TorusGeometry(0.1, 0.026, 8, 16, Math.PI);
  const mouthGeo = new THREE.TorusGeometry(0.1, 0.028, 8, 18, Math.PI);
  const blushGeo = new THREE.CircleGeometry(0.13, 20);
  const oGeo = new THREE.TorusGeometry(0.075, 0.03, 8, 18);
  // a point on the unit body surface (front) and its outward normal
  const surf = (x, y) => { const z = Math.sqrt(Math.max(0, 1.02 - x * x - y * y * 1.05)); return new THREE.Vector3(x, y, z); };
  const face = (o, n) => { o.position.copy(n); o.lookAt(n.clone().multiplyScalar(2)); };

  function make(tier) {
    const T = TIER[tier];
    const root = new THREE.Group(), jelly = new THREE.Group(); root.add(jelly);
    const body = new THREE.Mesh(bodyGeo(tier), mats[tier]); body.castShadow = true; body.receiveShadow = true; jelly.add(body);
    const eyes = [], happy = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); face(g, surf(s * 0.31, 0.14));
      const e = new THREE.Mesh(eyeGeo, black); e.scale.set(0.115, 0.15, 0.06);
      const gl = new THREE.Mesh(glintGeo, white); gl.scale.setScalar(0.04); gl.position.set(0.035, 0.055, 0.05);
      const gl2 = new THREE.Mesh(glintGeo, white); gl2.scale.setScalar(0.02); gl2.position.set(-0.03, -0.05, 0.05);
      g.add(e, gl, gl2); jelly.add(g); eyes.push(g);
      const h = new THREE.Mesh(happyGeo, black); face(h, surf(s * 0.31, 0.1)); h.translateZ(0.01); h.visible = false; jelly.add(h); happy.push(h);
      const bl = new THREE.Mesh(blushGeo, blushMats[tier]); face(bl, surf(s * 0.55, -0.1)); bl.translateZ(0.012); bl.scale.set(1, 0.7, 1); jelly.add(bl);
    }
    const mouth = new THREE.Mesh(mouthGeo, black); face(mouth, surf(0, -0.12)); mouth.translateZ(0.012); mouth.rotateZ(Math.PI); jelly.add(mouth);
    const oh = new THREE.Mesh(oGeo, black); face(oh, surf(0, -0.15)); oh.translateZ(0.01); oh.visible = false; jelly.add(oh);
    // jelly spring: s = vertical squash (negative = flatter), w = sideways wobble
    let s = 0, sv = 0, w = 0, wv = 0, blink = 1 + Math.random() * 3, happyT = 0, ohT = 0;
    const seed = Math.random() * 10;
    return {
      root, jelly, tier, gold: !!T.gold,
      hit(a) { sv -= a * 9; wv += (Math.random() - 0.5) * a * 6; },
      poke(a) { sv += a * 9; },
      happy(sec = 0.8) { happyT = sec; },
      surprise(sec = 0.5) { ohT = sec; },
      update(dt, t) {
        sv += (-s * 190 - sv * 7.5) * dt; s += sv * dt; s = Math.max(-0.45, Math.min(0.45, s));
        wv += (-w * 120 - wv * 6) * dt; w += wv * dt;
        const br = Math.sin(t * 2.4 + seed) * 0.015;
        const sy = 1 + s + br, sx = 1 / Math.sqrt(Math.max(0.3, sy));
        jelly.scale.set(sx, sy, sx); jelly.position.y = (sy - 1) * 0.6;   // squash towards the bottom
        jelly.rotation.z = w * 0.5;
        if (T.rainbow) body.rotation.y += dt * 1.8;
        blink -= dt; const closed = blink < 0.11 && blink > 0; if (blink < 0) blink = 1.8 + Math.random() * 3.2;
        happyT -= dt; ohT -= dt;
        const hp = happyT > 0;
        for (const e of eyes) { e.visible = !hp; e.scale.y = closed ? 0.12 : 1; }
        for (const h of happy) h.visible = hp;
        mouth.visible = ohT <= 0; oh.visible = ohT > 0;
      },
    };
  }
  return { make, TIER, mats };
}
