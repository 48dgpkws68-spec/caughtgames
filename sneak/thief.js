// The SNEAK thief: a glossy vinyl toy built from one smooth SDF body (same surface-nets mesher as sdfmesh.js),
// black eye mask, striped jumper, beanie and a loot sack. Eyes are separate so they can look around and pop.
//   const t = createThief(envMap);  scene.add(t.root);  t.update(dt, time);  t.hop(from, to, ms) -> Promise
//   t.mood('idle' | 'scared' | 'happy')   t.look(x, z)   t.root.position
import * as THREE from 'three';
import { makeShape, meshSDF } from './sdfmesh.js';

const E = (c, r, col, k = 0.05, x = {}) => ({ t: 'e', c, r, col, k, ...x });
const C = (a, b, ra, rb, col, k = 0.04) => ({ t: 'c', a, b, ra, rb, col, k });

const COLORS = {
  shirt: '#1a2150', stripe: '#d8cdb4', skin: '#f2b38a', mask: '#121018', hat: '#c8283f', pom: '#f2d27a',
  glove: '#16131c', pants: '#16131c', shoe: '#2a2233', sack: '#b98a4e', knot: '#8a5f2c', cheek: '#ff8a8a', nose: '#e8977a',
};

export function createThief(env) {
  const prims = [
    // body (pear shape) and head melted together
    E([0, 0.52, 0], [0.44, 0.46, 0.4], 'shirt', 0.05),
    E([0, 0.98, 0.02], [0.37, 0.34, 0.35], 'skin', 0.16),
    // mask band around the eyes, beanie with a fold and a pom
    E([0, 1.03, 0.05], [0.415, 0.125, 0.395], 'mask', 0.02),
    E([0, 1.18, -0.01], [0.36, 0.2, 0.345], 'hat', 0.03),
    E([0, 1.12, -0.01], [0.375, 0.06, 0.36], 'hat', 0.02),
    E([0, 1.4, -0.04], [0.09, 0.09, 0.09], 'pom', 0.03),
    E([0, 0.94, 0.37], [0.06, 0.05, 0.05], 'nose', 0.04),
    // arms: sneaking pose, gloves near the chest
    C([-0.36, 0.7, 0.02], [-0.44, 0.48, 0.2], 0.1, 0.09, 'shirt'),
    C([0.36, 0.7, 0.02], [0.44, 0.48, 0.2], 0.1, 0.09, 'shirt'),
    E([-0.43, 0.45, 0.27], [0.1, 0.1, 0.1], 'glove', 0.04),
    E([0.43, 0.45, 0.27], [0.1, 0.1, 0.1], 'glove', 0.04),
    // legs and big shoes
    C([-0.17, 0.2, 0], [-0.19, 0.06, 0.02], 0.12, 0.1, 'pants'),
    C([0.17, 0.2, 0], [0.19, 0.06, 0.02], 0.12, 0.1, 'pants'),
    E([-0.2, 0.05, 0.08], [0.13, 0.08, 0.18], 'shoe', 0.03),
    E([0.2, 0.05, 0.08], [0.13, 0.08, 0.18], 'shoe', 0.03),
    // loot sack on the back with a knot
    E([0, 0.72, -0.42], [0.33, 0.36, 0.26], 'sack', 0.06),
    E([0, 1.06, -0.4], [0.1, 0.08, 0.09], 'knot', 0.04),
  ];
  const shape = makeShape(prims);
  const cols = {};
  for (const k in COLORS) cols[k] = new THREE.Color(COLORS[k]);
  // stripes on the jumper, a dollar patch on the sack, rosy cheeks
  const tint = (x, y, z, key, c) => {
    if (key === 'shirt' && Math.sin(y * 34) > 0.35) c.copy(cols.stripe);
    if (key === 'sack' && z < -0.55 && Math.abs(x) < 0.12 && Math.abs(y - 0.72) < 0.12) c.set('#7a5426');
    if (key === 'skin' && z > 0.25 && Math.abs(Math.abs(x) - 0.22) < 0.07 && Math.abs(y - 0.88) < 0.05) c.lerp(cols.cheek, 0.55);
    return c;
  };
  const geo = meshSDF(shape, 110, cols, tint, null, 2);
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.38, metalness: 0, clearcoat: 0.85, clearcoatRoughness: 0.1,
    envMap: env, envMapIntensity: 0.45,
  });
  const body = new THREE.Mesh(geo, mat);
  body.castShadow = true;

  // eyes: white glossy balls with a pupil and a tiny highlight
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.1, clearcoat: 1, envMap: env, envMapIntensity: 0.8 });
  const pupMat = new THREE.MeshPhysicalMaterial({ color: '#0b0a10', roughness: 0.15, clearcoat: 1, envMap: env, envMapIntensity: 0.6 });
  const glintMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const eyes = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * 0.15, 1.035, 0.37);
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 16), eyeMat);
    w.scale.set(1, 1.1, 0.7);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.052, 16, 12), pupMat);
    p.position.z = 0.062;
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), glintMat);
    gl.position.set(0.02, 0.025, 0.1);
    g.add(w, p, gl);
    eyes.push({ g, p, base: g.position.clone() });
  }

  const inner = new THREE.Group();   // squash, stretch and tilt happen here (pivot at the feet)
  inner.add(body, ...eyes.map((e) => e.g));
  const root = new THREE.Group();
  root.add(inner);

  let mood = 'idle', lookX = 0, lookY = 0, blinkT = 2, hopState = null, squash = 0, sv = 0, wob = 0, yawNow = Math.PI - 0.6;
  const api = {
    root, inner,
    mood(m) { mood = m; if (m === 'scared') { squash = -0.25; } if (m === 'happy') { sv = 3; } },
    look(x, y) { lookX = x; lookY = y; },
    hop(to, ms = 560) {
      return new Promise((res) => { hopState = { from: root.position.clone(), to: to.clone(), t: 0, ms, res, pre: 120 }; });
    },
    update(dt, time) {
      // spring for squash/stretch
      sv += (-squash * 140 - sv * 12) * dt; squash += sv * dt;
      let y = 0, lean = 0, yaw = 0;
      if (hopState) {
        const h = hopState; h.t += dt * 1000;
        if (h.t < h.pre) { squash = Math.min(squash, -0.18 * (h.t / h.pre)); }
        else {
          const k = Math.min(1, (h.t - h.pre) / h.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          root.position.lerpVectors(h.from, h.to, e);
          y = Math.sin(Math.PI * k) * 0.85;
          lean = Math.sin(Math.PI * k) * 0.25;
          const dx = h.to.x - h.from.x;
          yaw = -dx * 0.18 * Math.sin(Math.PI * k);
          if (k < 0.15) squash = 0.12;
          if (k >= 1) { root.position.copy(h.to); squash = -0.22; sv = 0; const r = h.res; hopState = null; r(); }
        }
      }
      // idle: sneaky sway and breathing, scared: trembling
      const breathe = Math.sin(time * 2.2) * 0.015;
      wob = mood === 'scared' ? Math.sin(time * 48) * 0.035 : Math.sin(time * 1.3) * 0.05;
      inner.position.y = y;
      const s = 1 + squash + breathe;
      inner.scale.set(1 / Math.sqrt(Math.max(0.5, s)), s, 1 / Math.sqrt(Math.max(0.5, s)));
      // facing: away from the camera while hopping (loot sack in view), glancing back over the shoulder when idle,
      // turned to the camera when caught or escaping
      const yawT = hopState ? Math.PI : mood === 'idle' ? Math.PI - 0.75 - Math.sin(time * 0.7) * 0.3 : 0.15;
      yawNow += (yawT - yawNow) * (1 - Math.exp(-dt * (hopState ? 10 : 5)));
      inner.rotation.set(0, yaw + yawNow, 0);
      inner.rotateX(lean); inner.rotateZ(wob);
      // eyes: look direction, blink, scared = big pupils wide eyes
      blinkT -= dt;
      const blink = blinkT < 0.12 && blinkT > 0 ? 0.1 : 1;
      if (blinkT < 0) blinkT = 2 + Math.random() * 3;
      const lx = mood === 'idle' ? Math.sin(time * 0.9) * 0.6 + lookX : lookX, ly = lookY;
      for (const e of eyes) {
        e.p.position.x = THREE.MathUtils.clamp(lx, -1, 1) * 0.035;
        e.p.position.y = THREE.MathUtils.clamp(ly, -1, 1) * 0.03;
        const big = mood === 'scared' ? 1.35 : mood === 'happy' ? 1.08 : 1;
        e.g.scale.set(big, big * blink * (mood === 'happy' ? 0.75 : 1), big);
        e.p.scale.setScalar(mood === 'scared' ? 0.6 : 1);
      }
    },
  };
  return api;
}
