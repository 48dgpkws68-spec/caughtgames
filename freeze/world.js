// FREEZE world: a sunny meadow, a giant vinyl owl on a tree stump with its back to the field, and one little vinyl
// runner per bettor in the round. The owl's head turns round when the round crashes.
//   const W = createWorld(canvas, { labelHost })
//   W.lineUp(players)          players: [{ id, name, color, you }] at the start line
//   W.setMult(m)               every running runner moves to its spot for this multiplier
//   W.freeze(id, m)            that runner stops as an ice statue with a "×m" pop
//   W.peek(level)              cosmetic half-turn of the owl's head (0..1), no effect on the round
//   await W.crash()            head turns, eye beams sweep, every runner still moving is caught
//   W.clear()                  remove the runners, owl looks away again
import { THREE, createStage, canvasTex, radialTex, tween, wait, ease, reduce, mulberry } from '../lib/stage.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeShape, meshSDF } from '../sneak/sdfmesh.js';

const E = (c, r, col, k = 0.05) => ({ t: 'e', c, r, col, k });
const C = (a, b, ra, rb, col, k = 0.04) => ({ t: 'c', a, b, ra, rb, col, k });
const FIELD = 30, START_Z = 9, OWL_Z = START_Z - FIELD - 2.5;
const zFor = (prog) => START_Z - prog * FIELD;

function colorsOf(o) { const c = {}; for (const k in o) c[k] = new THREE.Color(o[k]); return c; }
let runnerGeo = null;
function runnerGeometry() {
  if (runnerGeo) return runnerGeo;
  // white body so the material colour tints it; dark feet and cheeks stay dark
  const prims = [
    E([0, 0.5, 0], [0.3, 0.38, 0.27], 'body', 0.08),
    E([0, 0.84, 0.02], [0.24, 0.22, 0.23], 'body', 0.14),
    E([-0.13, 0.07, 0.04], [0.09, 0.07, 0.13], 'shoe', 0.04),
    E([0.13, 0.07, 0.04], [0.09, 0.07, 0.13], 'shoe', 0.04),
    C([-0.28, 0.6, 0], [-0.4, 0.42, 0.06], 0.07, 0.06, 'body'),
    C([0.28, 0.6, 0], [0.4, 0.42, 0.06], 0.07, 0.06, 'body'),
    E([0, 0.24, 0], [0.31, 0.12, 0.28], 'shorts', 0.04),
  ];
  runnerGeo = meshSDF(makeShape(prims), 64, colorsOf({ body: '#ffffff', shoe: '#3a3150', shorts: '#e8e4f2' }), (x, y, z, key, c) => {
    if (key === 'body' && z > 0.18 && Math.abs(Math.abs(x) - 0.12) < 0.05 && Math.abs(y - 0.76) < 0.035) c.set('#ffb3c7');
    return c;
  }, null, 2);
  return runnerGeo;
}

export function createWorld(canvas, opts = {}) {
  const S = createStage(canvas, {
    sky: '#7fd3ff', fog: ['#bfe9ff', 40, 95], exposure: 0.98, envIntensity: 0.35, hemi: 0.85, hemiGround: '#9fdc6a', sun: 2.3, shadowSize: 14,
    bloom: [0.3, 0.45, 0.88],
    fov: (a) => (a < 0.8 ? 64 : a < 1.2 ? 54 : 46),
  });
  const { scene, camera } = S;
  const R = mulberry(11);

  // ---------------------------------------------------------------- meadow, track, hills, flowers
  const grassTex = canvasTex(512, 512, (g, w) => {
    g.fillStyle = '#57cf5b'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 2500; i++) { g.fillStyle = ['#4dc455', '#63da62', '#48b94f', '#6fe06a'][i % 4]; g.fillRect(R() * w, R() * w, 2, 6 + R() * 6); }
  });
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(30, 30);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  // the running field: striped lawn with chalk lines
  const fieldTex = canvasTex(256, 1024, (g, w, h) => {
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#7be06c' : '#6bd660'; g.fillRect(0, (i * h) / 16, w, h / 16); }
    g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h);
  });
  const field = new THREE.Mesh(new THREE.PlaneGeometry(14, FIELD + 6), new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 0.9 }));
  field.rotation.x = -Math.PI / 2; field.position.set(0, 0.01, START_Z - FIELD / 2 - 1); field.receiveShadow = true; scene.add(field);
  const lineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const startLine = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.25), lineMat); startLine.rotation.x = -Math.PI / 2; startLine.position.set(0, 0.02, START_Z + 0.5); scene.add(startLine);
  // distance markers with the multiplier they stand for
  for (const m of [1.5, 2, 3, 5, 10, 25, 100]) {
    const z = zFor(1 - Math.pow(m, -0.5));
    const l = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.08), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 })); l.rotation.x = -Math.PI / 2; l.position.set(0, 0.02, z); scene.add(l);
    for (const s of [-1, 1]) {
      const flag = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8), S.vinyl('#ffffff')); pole.position.y = 0.7;
      const t = canvasTex(256, 128, (g, w, h) => { g.fillStyle = ['#ff4d7a', '#ffc531', '#55b6ff', '#b58cff', '#3fd6a6', '#ff9a4d', '#ff4d7a'][[1.5, 2, 3, 5, 10, 25, 100].indexOf(m)]; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 26); g.fill(); g.lineWidth = 8; g.strokeStyle = '#1d1640'; g.stroke(); g.font = '72px "Lilita One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeText('×' + m, w / 2, h / 2 + 4); g.fillStyle = '#fff'; g.fillText('×' + m, w / 2, h / 2 + 4); });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, toneMapped: false })); sign.position.set(0, 1.35, 0);
      flag.add(pole, sign); flag.position.set(s * 7.6, 0, z); pole.castShadow = true; scene.add(flag);
    }
  }
  // rolling hills, trees and flowers around
  const hillMat = S.vinyl('#4cc35a', { rough: 0.7, env: 0.3 });
  for (let i = 0; i < 14; i++) { const h = new THREE.Mesh(new THREE.SphereGeometry(6 + R() * 8, 24, 16), hillMat); const s = i % 2 ? 1 : -1; h.position.set(s * (22 + R() * 25), -3, 10 - i * 7); h.scale.y = 0.45; h.receiveShadow = true; scene.add(h); }
  const trunkMat = S.vinyl('#a8693a', { rough: 0.6 });
  const leafMats = ['#2fbf6a', '#3fd6a6', '#7fdc4a', '#ff8fc4'].map((c) => S.vinyl(c, { rough: 0.5 }));
  for (let i = 0; i < 26; i++) {
    const s = i % 2 ? 1 : -1, g = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.6, 10), trunkMat); tr.position.y = 0.8;
    const top = new THREE.Mesh(new THREE.SphereGeometry(1 + R() * 0.6, 20, 14), leafMats[Math.floor(R() * leafMats.length)]); top.position.y = 2.2; top.scale.y = 0.9;
    g.add(tr, top); g.children.forEach((m) => { m.castShadow = true; });
    g.position.set(s * (10 + R() * 9), 0, START_Z + 4 - i * 2.2 - R() * 2); scene.add(g);
  }
  const petal = ['#ffffff', '#ffd84a', '#ff6fb0', '#b58cff', '#55b6ff'];
  const flowerGeo = new THREE.SphereGeometry(0.09, 8, 6);
  for (let i = 0; i < 260; i++) { const f = new THREE.Mesh(flowerGeo, new THREE.MeshStandardMaterial({ color: petal[i % petal.length], roughness: 0.6 })); const s = R() < 0.5 ? -1 : 1; f.position.set(s * (7.4 + R() * 14), 0.08, START_Z + 6 - R() * (FIELD + 18)); scene.add(f); }
  // clouds
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.35 });
  const clouds = [];
  for (let i = 0; i < 9; i++) { const c = new THREE.Group(); for (let j = 0; j < 4; j++) { const b = new THREE.Mesh(new THREE.SphereGeometry(1.2 + R() * 1.2, 16, 12), cloudMat); b.position.set(j * 1.6 - 2.4, R() * 0.6, R() * 0.8); c.add(b); } c.position.set(-40 + R() * 80, 16 + R() * 8, -50 - R() * 40); scene.add(c); clouds.push(c); }

  // ---------------------------------------------------------------- the owl on its stump
  const owl = new THREE.Group(); owl.position.set(0, 0, OWL_Z); scene.add(owl);
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 2.2, 28), S.vinyl('#b0713e', { rough: 0.55 }));
  stump.position.y = 1.1; stump.castShadow = stump.receiveShadow = true; owl.add(stump);
  const ringTop = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.05, 28), S.vinyl('#e9b878', { rough: 0.5 })); ringTop.position.y = 2.22; owl.add(ringTop);
  const owlBodyGeo = meshSDF(makeShape([
    E([0, 1.5, 0], [1.25, 1.45, 1.1], 'feather', 0.1),
    E([0, 1.35, 0.55], [0.85, 1.05, 0.6], 'belly', 0.15),
    E([-1.05, 1.6, -0.15], [0.35, 0.95, 0.75], 'wing', 0.12),
    E([1.05, 1.6, -0.15], [0.35, 0.95, 0.75], 'wing', 0.12),
    E([-0.4, 0.1, 0.45], [0.28, 0.12, 0.3], 'claw', 0.04),
    E([0.4, 0.1, 0.45], [0.28, 0.12, 0.3], 'claw', 0.04),
  ]), 96, colorsOf({ feather: '#8a5cf0', belly: '#ffd9a8', wing: '#6b44d6', claw: '#ff9a1f' }), (x, y, z, key, c) => {
    if (key === 'belly' && Math.sin(y * 18 + Math.cos(x * 9) * 1.2) > 0.6) c.lerp(new THREE.Color('#f2b97a'), 0.6);
    return c;
  }, null, 2);
  const owlMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.6 });
  const owlBody = new THREE.Mesh(owlBodyGeo, owlMat); owlBody.position.y = 2.2; owlBody.castShadow = true; owl.add(owlBody);
  // head: separate so it can turn. Built facing +z (toward the runners); at rest it turns to face away.
  const headPivot = new THREE.Group(); headPivot.position.set(0, 5.0, 0); owl.add(headPivot);
  const headGeo = meshSDF(makeShape([
    E([0, 0.35, 0], [1.15, 0.95, 1.0], 'feather', 0.08),
    E([-0.75, 1.15, -0.05], [0.22, 0.45, 0.2], 'feather', 0.15),
    E([0.75, 1.15, -0.05], [0.22, 0.45, 0.2], 'feather', 0.15),
    E([-0.45, 0.4, 0.62], [0.48, 0.48, 0.3], 'disc', 0.12),
    E([0.45, 0.4, 0.62], [0.48, 0.48, 0.3], 'disc', 0.12),
    E([0, 0.05, 0.92], [0.13, 0.2, 0.16], 'beak', 0.05),
    E([0, -0.1, -0.85], [0.6, 0.45, 0.25], 'back', 0.2),
  ]), 96, colorsOf({ feather: '#8a5cf0', disc: '#fff1d6', beak: '#ff9a1f', back: '#6b44d6' }), (x, y, z, key, c) => {
    if (key === 'back' || (key === 'feather' && z < -0.4)) { if (Math.sin(x * 9) * Math.sin(y * 9) > 0.25) c.lerp(new THREE.Color('#b58cff'), 0.55); }
    return c;
  }, null, 2);
  const head = new THREE.Mesh(headGeo, owlMat); head.castShadow = true; headPivot.add(head);
  const eyeWhite = new THREE.MeshPhysicalMaterial({ color: '#ffd84a', roughness: 0.15, clearcoat: 1, emissive: '#ffb300', emissiveIntensity: 0.25 });
  const pupilMat = new THREE.MeshPhysicalMaterial({ color: '#1a1030', roughness: 0.1, clearcoat: 1 });
  const owlEyes = [-1, 1].map((s) => {
    const g = new THREE.Group(); g.position.set(s * 0.45, 0.45, 0.86);
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), eyeWhite); w.scale.z = 0.5;
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), pupilMat); p.position.z = 0.12;
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff' })); gl.position.set(0.07, 0.08, 0.2);
    g.add(w, p, gl); headPivot.add(g); return g;
  });
  // eye beams that sweep the field when the owl looks
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uStr: { value: 0 } },
    vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uStr; varying float vY; void main(){ float a = uStr * pow(vY, 1.5); gl_FragColor = vec4(vec3(1.0,0.85,0.25) * a, a); }',
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(5, 30, 32, 1, true), beamMat);
  beam.rotation.x = -Math.PI / 2; beam.position.set(0, 0.4, 15.5);   // apex at the eyes, opening toward the field
  headPivot.add(beam);
  headPivot.rotation.y = Math.PI;   // looking away
  let headWant = Math.PI, beamWant = 0;

  // ---------------------------------------------------------------- runners
  const host = opts.labelHost || canvas.parentElement;
  const runners = new Map();   // id -> { root, inner, mat, frozen, caught, x, z, want, phase, tag }
  const eyeWhiteR = new THREE.MeshPhysicalMaterial({ color: '#fff', roughness: 0.1, clearcoat: 1 });
  const eyeBlackR = new THREE.MeshPhysicalMaterial({ color: '#141022', roughness: 0.1, clearcoat: 1 });
  const iceMat = new THREE.MeshPhysicalMaterial({ color: '#bfefff', roughness: 0.05, transmission: 0.5, thickness: 0.5, transparent: true, opacity: 0.55, clearcoat: 1 });
  const pops = [];
  function lineUp(players) {
    clear();
    const n = players.length, span = Math.min(12, n * 0.9);
    players.forEach((p, i) => {
      const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, color: p.color, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.6 });
      const body = new THREE.Mesh(runnerGeometry(), mat); body.castShadow = true;
      const inner = new THREE.Group(); inner.add(body);
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), eyeWhiteR); e.position.set(s * 0.09, 0.88, 0.22); e.scale.z = 0.6; const pu = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 6), eyeBlackR); pu.position.set(s * 0.09, 0.88, 0.255); inner.add(e, pu); }
      if (p.you) { const crown = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.24, 5), new THREE.MeshPhysicalMaterial({ color: '#ffc531', metalness: 1, roughness: 0.2 })); crown.position.y = 1.18; inner.add(crown); }
      const ice = new THREE.Mesh(new RoundedBoxGeometry(0.95, 1.35, 0.85, 3, 0.2), iceMat); ice.position.y = 0.62; ice.visible = false; inner.add(ice);
      const root = new THREE.Group(); root.add(inner);
      const x = n === 1 ? 0 : -span / 2 + (span * i) / (n - 1) + (R() - 0.5) * 0.25;
      root.position.set(x, 0, START_Z); root.rotation.y = Math.PI;   // facing the owl
      scene.add(root);
      let tag = null;
      if (p.you) { tag = document.createElement('div'); tag.className = 'plabel you'; tag.innerHTML = '<b>YOU</b>'; host.appendChild(tag); }
      runners.set(p.id, { root, inner, mat, ice, frozen: false, caught: false, x, z: START_Z, want: START_Z, phase: R() * 6, speed: 0.9 + R() * 0.25, tag, you: !!p.you, vel: null });
    });
  }
  function clear() {
    for (const r of runners.values()) { scene.remove(r.root); r.tag?.remove(); }
    runners.clear(); pops.forEach((p) => p.el.remove()); pops.length = 0;
    headWant = Math.PI; beamWant = 0;
  }
  function popLabel(r, text, cls) {
    const el = document.createElement('div'); el.className = 'plabel pop ' + (cls || ''); el.innerHTML = '<b>' + text + '</b>'; host.appendChild(el);
    pops.push({ el, r, t: 0 });
  }

  // ---------------------------------------------------------------- camera follows the pack
  const camPos = new THREE.Vector3(0, 9, START_Z + 12), camLook = new THREE.Vector3(0, 0, START_Z - 6);
  let packZ = START_Z, shake = 0, intro = reduce ? 0 : 1;
  const tmp = new THREE.Vector3();
  S.onFrame((dt, t) => {
    // runners
    let lead = START_Z, sum = 0, cnt = 0;
    for (const r of runners.values()) {
      if (r.vel) {   // caught: tumble back
        r.vel.y -= 14 * dt; r.root.position.addScaledVector(r.vel, dt); r.inner.rotation.x += 9 * dt; r.inner.rotation.z += 4 * dt;
        if (r.root.position.y < 0) { r.root.position.y = 0; r.vel.y *= -0.3; r.vel.x *= 0.7; r.vel.z *= 0.7; if (Math.abs(r.vel.z) < 0.3) r.vel = null; }
        continue;
      }
      if (!r.frozen && !r.caught) {
        const dz = r.want - r.z; r.z += dz * (1 - Math.exp(-dt * 6));
        const moving = Math.abs(dz) > 0.002 || running;
        r.phase += dt * 13 * r.speed * (moving ? 1 : 0.15);
        r.root.position.set(r.x, Math.abs(Math.sin(r.phase)) * (moving ? 0.22 : 0.02), r.z);
        r.inner.rotation.z = Math.sin(r.phase) * (moving ? 0.14 : 0.03);
        r.inner.rotation.x = moving ? -0.18 : 0;
        const sq = 1 + Math.cos(r.phase * 2) * (moving ? 0.06 : 0.02); r.inner.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      }
      if (!r.caught) { lead = Math.min(lead, r.root.position.z); sum += r.root.position.z; cnt++; }
      if (r.tag) { const p = S.toScreen(tmp.copy(r.root.position).add(new THREE.Vector3(0, 1.6, 0))); r.tag.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-100%)`; }
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const q = pops[i]; q.t += dt;
      const p = S.toScreen(tmp.copy(q.r.root.position).add(new THREE.Vector3(0, 1.7 + q.t * 0.6, 0)));
      q.el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-100%) scale(${Math.min(1, q.t * 5).toFixed(2)})`;
      q.el.style.opacity = String(Math.max(0, Math.min(1, 2.2 - q.t)));
      if (q.t > 2.2) { q.el.remove(); pops.splice(i, 1); }
    }
    const avg = cnt ? sum / cnt : START_Z;
    packZ += (Math.min(avg, START_Z) - packZ) * (1 - Math.exp(-dt * 2));
    // owl head and beams
    headPivot.rotation.y += (headWant - headPivot.rotation.y) * (1 - Math.exp(-dt * 9));
    beamMat.uniforms.uStr.value += (beamWant - beamMat.uniforms.uStr.value) * (1 - Math.exp(-dt * 8));
    owlBody.scale.y = 1 + Math.sin(t * 1.6) * 0.012;
    for (const e of owlEyes) e.scale.y = Math.sin(t * 0.7) > 0.985 ? 0.15 : 1;
    for (const c of clouds) { c.position.x += dt * 0.6; if (c.position.x > 50) c.position.x = -50; }
    // camera
    const a = camera.aspect, back = a < 0.8 ? 13 : 11, up = a < 0.8 ? 10 : 7.5;
    const wantPos = tmp.set(0, up, packZ + back);
    if (intro > 0) { intro = Math.max(0, intro - dt / 2.4); const e = ease.inOut(1 - intro); camPos.lerpVectors(new THREE.Vector3(0, 9, OWL_Z + 10), wantPos, e); camLook.set(0, 2 * (1 - e) + 0.5, OWL_Z * (1 - e) + (packZ - 9) * e); }
    else { camPos.lerp(wantPos, 1 - Math.exp(-dt * 2.5)); camLook.lerp(new THREE.Vector3(0, 1.2, Math.max(OWL_Z + 4, packZ - 12)), 1 - Math.exp(-dt * 2.5)); }
    camera.position.copy(camPos);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 1.4); }
    camera.lookAt(camLook);
    S.sun.position.set(6, 16, packZ + 6); S.sun.target.position.set(0, 0, packZ - 6);
    void lead;
  });
  let running = false;

  return {
    S,
    lineUp,
    clear,
    run(on) { running = on; },
    setMult(m) {
      const z = zFor(1 - Math.pow(m, -0.5));
      for (const r of runners.values()) if (!r.frozen && !r.caught) r.want = z;
    },
    freeze(id, m) {
      const r = runners.get(id); if (!r || r.frozen || r.caught) return;
      r.frozen = true; r.ice.visible = true; r.root.position.y = 0; r.inner.rotation.set(0, 0, 0); r.inner.scale.set(1, 1, 1);
      r.inner.rotation.z = (R() - 0.5) * 0.3;   // a frozen pose
      popLabel(r, '×' + (m >= 1000 ? Math.round(m).toLocaleString('en-US') : m.toFixed(2)), r.you ? 'you' : '');
    },
    peek(level) {   // cosmetic: the owl starts to turn, then looks away again
      headWant = Math.PI - level * 1.3 * (R() < 0.5 ? -1 : 1);
      setTimeout(() => { headWant = Math.PI; }, 380 + level * 400);
    },
    async crash() {
      running = false;
      headWant = 0; await wait(260); beamWant = 0.9; shake = 0.3;
      for (const r of runners.values()) {
        if (r.frozen || r.caught) continue;
        r.caught = true; r.mat.color.multiplyScalar(0.45);
        r.vel = new THREE.Vector3((R() - 0.5) * 3, 5 + R() * 3, 6 + R() * 5);
        popLabel(r, 'CAUGHT', 'bad');
      }
      await wait(1400); beamWant = 0;
    },
  };
}
