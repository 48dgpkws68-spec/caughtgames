// SONAR 3D world: a sunny tropical seabed with a 6x6 bed of vinyl clams on a sand bank, a coral reef, kelp, fish,
// bubbles and light caustics. A friendly yellow submarine dives to every clam you pick.
// The world is reactive: every frame it reads the page's tile array (rev, n, mine, boom, ping, proven, t0) and
// animates toward it, so flood reveals, mine reveals and new boards need no extra calls.
//   const W = createWorld(canvas, { labels, getTiles, getUi, onPick(i), onHover(i) })
//   await W.dive(i)       sub glides to the clam and dips      await W.ping(i, warm)   sonar orb + coloured pulse
//   W.boom(i)             splash, puff and shake                W.cash(mult)            coins and bubbles
import { THREE, createStage, canvasTex, radialTex, tween, wait, ease, reduce, mulberry } from '../lib/stage.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeSub, shellGeos, makeMine, makeFish } from './models.js';

const N = 6, CELL = 1.32, TOP = 0.1, HALF = (N * CELL) / 2;
export const NUMC = ['#ffffff', '#2fb8ff', '#21c46b', '#ff6a3d', '#a259ff', '#ff3b6b', '#ff9f1a', '#14b8a6', '#ff4fc8'];
const SHELL = ['#ff6f9f', '#ff9a3d', '#9d7bff', '#22d0a8', '#ffc22e', '#47adff'];
const WARM = '#ff8a1f', COLD = '#2f9dff', CLEARED = new THREE.Color('#a8efe6');

export function createWorld(canvas, opts) {
  const S = createStage(canvas, {
    sky: '#2fc3dc', fog: ['#34c6de', 15, 40], exposure: 0.92, envIntensity: 0.4, hemi: 0.95, hemiSky: '#bff6ff', hemiGround: '#ffc98a',
    sun: 1.9, sunColor: '#fff0cf', rim: 0.8, rimColor: '#6fe6ff', shadowSize: 8.5, bloom: [0.22, 0.45, 0.88],
    fov: (a) => (a < 0.85 ? 46 : a < 1.25 ? 42 : 38),
  });
  const { scene, camera } = S;
  const R = mulberry(36);
  const tp = (i) => new THREE.Vector3(((i % N) - 2.5) * CELL, 0, (((i / N) | 0) - 2.5) * CELL);

  // ---------------------------------------------------------------- water, seabed, bank, caustics
  scene.background = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#b8f7ff'); gr.addColorStop(0.35, '#5ad8ec'); gr.addColorStop(1, '#34c6de'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const sandTex = canvasTex(512, 512, (g, w) => {
    g.fillStyle = '#f8cf8c'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 46; i++) { g.strokeStyle = `rgba(226,160,84,${0.1 + R() * 0.12})`; g.lineWidth = 3 + R() * 5; g.beginPath(); const y = R() * w; for (let x = -10; x <= w + 10; x += 16) { const yy = y + Math.sin(x * 0.035 + i) * 6; x < 0 ? g.moveTo(x, yy) : g.lineTo(x, yy); } g.stroke(); }
    for (let i = 0; i < 1600; i++) { g.fillStyle = ['rgba(255,248,224,.8)', 'rgba(222,150,80,.35)', 'rgba(255,170,190,.5)', 'rgba(150,120,255,.25)'][i % 4]; g.beginPath(); g.arc(R() * w, R() * w, 0.8 + R() * 2.2, 0, 7); g.fill(); }
  });
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
  const seaTex = sandTex.clone(); seaTex.repeat.set(16, 16); seaTex.needsUpdate = true;
  const seabed = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardMaterial({ map: seaTex, color: '#f2d3a0', roughness: 0.95 }));
  seabed.rotation.x = -Math.PI / 2; seabed.position.y = -0.62; seabed.receiveShadow = true; scene.add(seabed);
  const bankTex = sandTex.clone(); bankTex.repeat.set(2.4, 2.4); bankTex.needsUpdate = true;
  const bank = new THREE.Mesh(new RoundedBoxGeometry(N * CELL + 1.0, 0.7, N * CELL + 1.0, 5, 0.3), new THREE.MeshStandardMaterial({ map: bankTex, color: '#ffe6bd', roughness: 0.9 }));
  bank.position.y = -0.35; bank.receiveShadow = true; bank.castShadow = true; scene.add(bank);

  function causticTex(seed) {
    return canvasTex(256, 256, (g, W) => {
      const r = mulberry(seed), pts = []; for (let i = 0; i < 14; i++) pts.push([r(), r()]);
      const img = g.createImageData(W, W), d = img.data;
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const u = x / W, v = y / W; let f1 = 9, f2 = 9;
        for (const p of pts) for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) { const dx = u - p[0] - ox, dy = v - p[1] - oy, q = dx * dx + dy * dy; if (q < f1) { f2 = f1; f1 = q; } else if (q < f2) f2 = q; }
        const e = Math.sqrt(f2) - Math.sqrt(f1), val = Math.pow(Math.max(0, 1 - e / 0.05), 2.4) * 255, k = (y * W + x) * 4;
        d[k] = d[k + 1] = d[k + 2] = val; d[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, false);
  }
  const cA = causticTex(7), cB = causticTex(11);
  const caustics = [];
  for (const [tex, size, y, rep, op] of [[cA, 140, -0.6, 22, 0.22], [cB, 140, -0.598, 17, 0.15], [cA, N * CELL + 0.9, 0.006, 3.2, 0.16], [cB, N * CELL + 0.9, 0.008, 2.5, 0.11]]) {
    const t = tex.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: t, color: '#c8fbff', transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = y; scene.add(m); caustics.push({ t, sp: (caustics.length % 2 ? -1 : 1) * (0.006 + caustics.length * 0.002) });
  }
  // light shafts from the surface
  const shaftTex = canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, w, h); }, false);
  const shafts = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4 + R() * 2, 30), new THREE.MeshBasicMaterial({ map: shaftTex, color: '#fffbe0', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.position.set(-14 + i * 5.5 + R() * 2, 10, -13 - R() * 6); m.rotation.z = 0.32; scene.add(m); shafts.push({ m, ph: R() * 6 });
  }

  // ---------------------------------------------------------------- reef decor
  const vin = (c, x) => S.vinyl(c, { rough: 0.38, env: 0.55, ...x });
  const decorSway = [];
  const ringSpot = (a, r) => new THREE.Vector3(Math.cos(a) * r, -0.62, Math.sin(a) * r);
  function brainCoral(col, s) {
    const g = new THREE.IcosahedronGeometry(1, 5), p = g.attributes.position, v = new THREE.Vector3();
    for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k).normalize(); const d = 1 + 0.05 * Math.sin(v.x * 11 + Math.sin(v.z * 9) * 2.2 + v.y * 6); p.setXYZ(k, v.x * d, v.y * d * 0.72, v.z * d); }
    g.computeVertexNormals(); const m = new THREE.Mesh(g, vin(col, { rough: 0.5 })); m.scale.setScalar(s); m.castShadow = true; m.receiveShadow = true; return m;
  }
  function branchCoral(col, s) {
    const parts = [];
    const rec = (from, dir, len, rad, depth) => {
      const to = from.clone().addScaledVector(dir, len);
      const c = new THREE.CapsuleGeometry(rad, len, 4, 10); c.translate(0, len / 2, 0);
      c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)); c.translate(from.x, from.y, from.z); parts.push(c);
      if (depth <= 0) { const tip = new THREE.SphereGeometry(rad * 1.5, 10, 8); tip.translate(to.x, to.y, to.z); parts.push(tip); return; }
      const n = 2 + (R() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) { const a = R() * Math.PI * 2, d2 = dir.clone().add(new THREE.Vector3(Math.cos(a) * 0.7, 0.2, Math.sin(a) * 0.7)).normalize(); rec(to, d2, len * 0.72, rad * 0.75, depth - 1); }
    };
    rec(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 0.7, 0.11, 3);
    const m = new THREE.Mesh(mergeGeometries(parts.map((q) => q.toNonIndexed())), vin(col)); m.scale.setScalar(s); m.castShadow = true; return m;
  }
  function tubeCoral(col, rimCol, s) {
    const g = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const h = 0.5 + R() * 0.9, r = 0.12 + R() * 0.08, a = k * 1.3, d = k ? 0.22 + R() * 0.12 : 0;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, h, 18, 1, true), vin(col, { extra: { side: THREE.DoubleSide } })); t.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d); t.castShadow = true;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 8, 20), vin(rimCol)); rim.rotation.x = Math.PI / 2; rim.position.set(t.position.x, h, t.position.z);
      g.add(t, rim);
    }
    g.scale.setScalar(s); return g;
  }
  const latticeTex = canvasTex(256, 256, (g, w) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, w); g.fillStyle = '#000'; for (let y = 6; y < w; y += 22) for (let x = 6 + ((y / 22) % 2) * 11; x < w; x += 22) { g.beginPath(); g.ellipse(x, y, 7, 6, 0, 0, 7); g.fill(); } }, false);
  function fanCoral(col, s) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40, 0, Math.PI), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.45, clearcoat: 0.6, alphaMap: latticeTex, alphaTest: 0.5, side: THREE.DoubleSide }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 8, 40, Math.PI), vin(col)); m.add(rim);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.4, 8), vin(col)); stem.position.y = -0.1; m.add(stem);
    m.castShadow = true; m.scale.setScalar(s); return m;
  }
  function anemone(col, tipCol, s) {
    const parts = [], tips = [];
    for (let k = 0; k < 22; k++) { const a = k * 2.399, r = Math.sqrt(k / 22) * 0.35, h = 0.45 + R() * 0.35; const dir = new THREE.Vector3(Math.cos(a) * r * 1.4, 1, Math.sin(a) * r * 1.4).normalize(); const c = new THREE.CapsuleGeometry(0.045, h, 3, 8); c.translate(0, h / 2, 0); c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)); c.translate(Math.cos(a) * r, 0, Math.sin(a) * r); parts.push(c); const tip = new THREE.SphereGeometry(0.07, 8, 6); const tpnt = dir.clone().multiplyScalar(h + 0.04); tip.translate(Math.cos(a) * r + tpnt.x, tpnt.y, Math.sin(a) * r + tpnt.z); tips.push(tip); }
    const base = new THREE.CylinderGeometry(0.42, 0.5, 0.25, 20); base.translate(0, 0.05, 0); parts.push(base);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(mergeGeometries(parts.map((q) => q.toNonIndexed())), vin(col)), new THREE.Mesh(mergeGeometries(tips.map((q) => q.toNonIndexed())), vin(tipCol)));
    g.children.forEach((m) => { m.castShadow = true; }); g.scale.setScalar(s); return g;
  }
  function starfish(col, s) {
    const sh = new THREE.Shape(); for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI * 2 + Math.PI / 2, r = k % 2 ? 0.17 : 0.42; k ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 4, curveSegments: 4 }); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, vin(col)); m.castShadow = true; m.scale.setScalar(s); return m;
  }
  function rock(col, s) { const g = new THREE.DodecahedronGeometry(1, 1); const m = new THREE.Mesh(g, vin(col, { rough: 0.6, coat: 0.3 })); m.scale.set(s, s * 0.6, s * 0.9); m.castShadow = true; m.receiveShadow = true; return m; }
  function kelp(h, col) {
    const root = new THREE.Group(); let parent = root; const segs = [], n = Math.round(h / 0.45);
    const segMat = vin(col), leafMat = vin(col === '#3fcf6a' ? '#7fe05a' : '#3fcf6a', { extra: { side: THREE.DoubleSide } });
    for (let k = 0; k < n; k++) {
      const seg = new THREE.Group(); seg.position.y = k ? 0.45 : 0; parent.add(seg);
      const st = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.4, 3, 8), segMat); st.position.y = 0.22; st.castShadow = true; seg.add(st);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), leafMat); leaf.scale.set(0.18, 1, 0.55); leaf.position.set((k % 2 ? 1 : -1) * 0.16, 0.3, 0); leaf.rotation.z = (k % 2 ? -1 : 1) * 0.8; leaf.castShadow = true; seg.add(leaf);
      segs.push(seg); parent = seg;
    }
    return { root, segs, ph: R() * 6 };
  }
  const reef = new THREE.Group(); scene.add(reef);
  const PINK = '#ff5fa2', ORANGE = '#ff8a3d', PURPLE = '#a46bff', YELLOW = '#ffd23a', TEAL = '#2fd0b0', RED = '#ff4d5e', LILAC = '#b9a8ff';
  const place = (m, a, r, rotY = R() * 6) => { const p = ringSpot(a, r); m.position.copy(p); m.rotation.y = rotY; reef.add(m); return m; };
  // back and sides: big pieces; front: low pieces only (keeps the clams in view)
  const plan = [
    ['brain', PINK, 0.9, -1.75, 7.0], ['branch', ORANGE, 1.25, -1.35, 7.4], ['fan', PURPLE, 1.6, -2.05, 7.8], ['tube', PURPLE, 1.2, -1.05, 7.0], ['anem', TEAL, 1.2, -2.35, 6.8],
    ['brain', YELLOW, 0.75, -0.75, 7.2], ['branch', RED, 1.1, -2.6, 7.4], ['fan', PINK, 1.3, -0.5, 8.2], ['rock', LILAC, 1.1, -1.55, 8.6], ['anem', PINK, 1.0, -0.25, 7.0],
    ['tube', ORANGE, 1.0, -2.85, 6.8], ['brain', TEAL, 0.8, 0.1, 7.4], ['branch', PURPLE, 1.0, 0.45, 7.1], ['rock', '#7fd8ff', 0.8, -3.1, 7.6], ['fan', ORANGE, 1.1, -3.4, 8.1],
    ['anem', ORANGE, 0.9, 0.85, 6.9], ['brain', PURPLE, 0.7, 3.5, 7.0], ['tube', TEAL, 0.9, -3.75, 6.9], ['star', ORANGE, 1.1, 1.3, 6.2], ['star', PINK, 1.0, 1.85, 6.4],
    ['brain', ORANGE, 0.55, 1.6, 6.6], ['rock', LILAC, 0.6, 2.2, 6.4], ['anem', PURPLE, 0.7, 2.6, 6.4], ['star', YELLOW, 0.9, 2.9, 6.1], ['brain', TEAL, 0.5, 2.0, 6.0],
    ['rock', '#ffb3c7', 0.7, 1.0, 6.2], ['branch', YELLOW, 0.75, 3.15, 7.2], ['star', PURPLE, 0.8, 0.6, 6.0],
  ];
  for (const [k, col, s, a, r] of plan) {
    if (k === 'brain') place(brainCoral(col, s), a, r).position.y = -0.62 + s * 0.15;
    else if (k === 'branch') place(branchCoral(col, s), a, r);
    else if (k === 'tube') place(tubeCoral(col, YELLOW, s), a, r);
    else if (k === 'fan') { const m = place(fanCoral(col, s), a, r, -a - Math.PI / 2 + (R() - 0.5) * 0.4); m.position.y += 0.15; decorSway.push({ m, ph: R() * 6, amp: 0.06 }); }
    else if (k === 'anem') { const m = place(anemone(col, YELLOW, s), a, r); decorSway.push({ m, ph: R() * 6, amp: 0.05 }); }
    else if (k === 'star') place(starfish(col, s), a, r).position.y = -0.58;
    else if (k === 'rock') place(rock(col, s), a, r).position.y = -0.62 + s * 0.2;
  }
  // starfish and shells on the sand bank rim
  for (const [x, z, c, s] of [[-HALF - 0.25, HALF - 0.6, ORANGE, 0.5], [HALF + 0.22, -HALF + 1.0, PINK, 0.45], [HALF + 0.2, HALF - 1.6, YELLOW, 0.4]]) { const m = starfish(c, s); m.position.set(x, 0.0, z); m.rotation.y = R() * 6; scene.add(m); }
  const kelps = [];
  for (const [x, z, h, col] of [[-7.4, -3.5, 4.4, '#3fcf6a'], [-6.4, -6.8, 5.2, '#2fb86a'], [-3.2, -8.2, 4.6, '#3fcf6a'], [2.6, -8.6, 5.4, '#2fb86a'], [6.0, -6.2, 4.8, '#3fcf6a'], [7.6, -2.6, 4.0, '#2fb86a'], [-8.6, 1.6, 3.4, '#3fcf6a'], [8.8, 1.8, 3.2, '#3fcf6a'], [0.2, -9.6, 5.0, '#3fcf6a']]) {
    const k = kelp(h, col); k.root.position.set(x, -0.62, z); scene.add(k.root); kelps.push(k);
  }
  // treasure chest peeking from the reef, its gold glints when you cash out
  const chest = new THREE.Group();
  { const box = new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.6, 0.7, 3, 0.08), vin('#b5651d')); box.position.y = 0.3;
    const lid = new THREE.Group(); lid.position.set(0, 0.6, -0.35); const lm = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.1, 20, 1, false, 0, Math.PI), vin('#c97a2c')); lm.rotation.z = Math.PI / 2; lm.rotation.x = Math.PI / 2; lm.position.z = 0.35; lid.add(lm); lid.rotation.x = -0.9;
    const gold = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#ffcf3a', metalness: 1, roughness: 0.25, emissive: '#ff9d00', emissiveIntensity: 0.25 })); gold.scale.set(1.2, 0.45, 0.72); gold.position.y = 0.58;
    const band = new THREE.Mesh(new RoundedBoxGeometry(1.14, 0.1, 0.74, 2, 0.04), vin('#ffd23a')); band.position.y = 0.42;
    chest.add(box, lid, gold, band); chest.children.forEach((m) => { m.castShadow = true; }); chest.position.set(-6.3, -0.62, -5.0); chest.rotation.y = 0.7; chest.scale.setScalar(1.1); scene.add(chest); chest.userData.gold = gold; }

  // ---------------------------------------------------------------- clams
  const geos = shellGeos();
  const padGeo = new RoundedBoxGeometry(CELL - 0.1, 0.12, CELL - 0.1, 3, 0.05);
  const pearlGeo = new THREE.SphereGeometry(0.13, 24, 16);
  const pearlMat = new THREE.MeshPhysicalMaterial({ color: '#fff4fb', roughness: 0.12, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.6, sheen: 1, sheenColor: '#ffd1ef', envMapIntensity: 1.1, emissive: '#ffe6f6', emissiveIntensity: 0.15 });
  const ringGeo = new THREE.RingGeometry(0.5, 0.62, 48);
  const hitGeo = new THREE.BoxGeometry(CELL * 0.98, 1.0, CELL * 0.98);
  const shellMat = (col) => {
    const m = new THREE.MeshPhysicalMaterial({ color: col, vertexColors: true, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.6, side: THREE.DoubleSide, emissive: '#ffffff', emissiveIntensity: 0 });
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include color_fragment', '#include color_fragment\n if(!gl_FrontFacing) diffuseColor.rgb = vec3(1.0, 0.93, 0.95);'); };
    m.customProgramCacheKey = () => 'shell-inside';
    return m;
  };
  const tiles = [], hits = [];
  for (let i = 0; i < N * N; i++) {
    const g = new THREE.Group(); g.position.copy(tp(i)); scene.add(g);
    const x = i % N, y = (i / N) | 0;
    const padMat = new THREE.MeshStandardMaterial({ color: (x + y) % 2 ? '#ffe2b0' : '#f6c886', roughness: 0.85, emissive: '#ffffff', emissiveIntensity: 0 });
    const pad = new THREE.Mesh(padGeo, padMat); pad.position.y = 0.04; pad.receiveShadow = true; g.add(pad);
    const clam = new THREE.Group(); clam.position.y = TOP + 0.13; clam.rotation.y = (R() - 0.5) * 0.25; g.add(clam);
    const mat = shellMat(SHELL[(x + 2 * y) % SHELL.length]);
    const bottom = new THREE.Mesh(geos.bottom, mat); bottom.castShadow = true; bottom.receiveShadow = true; clam.add(bottom);
    const pivot = new THREE.Group(); pivot.position.set(0, 0, -0.42); clam.add(pivot);
    const top = new THREE.Mesh(geos.top, mat); top.position.z = 0.42; top.castShadow = true; top.receiveShadow = true; pivot.add(top);
    const pearl = new THREE.Mesh(pearlGeo, pearlMat); pearl.position.set(0, 0.06, 0.04); pearl.visible = false; clam.add(pearl);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: WARM, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.105; ring.visible = false; g.add(ring);
    const hit = new THREE.Mesh(hitGeo); hit.visible = false; hit.position.y = 0.45; hit.userData.i = i; g.add(hit); hits.push(hit);
    // number and tag labels (HTML, crisp at any size)
    const num = document.createElement('div'); num.className = 'num'; num.hidden = true; opts.labels.appendChild(num);
    const tag = document.createElement('div'); tag.className = 'tag'; tag.hidden = true; opts.labels.appendChild(tag);
    tiles.push({ g, pad, padMat, padBase: padMat.color.clone(), clam, pivot, mat, pearl, ring, num, tag, mine: null, flag: null, open: 0, ov: 0, mk: 0, mv: 0, hov: 0, flash: 0, flashCol: new THREE.Color(), shown: false, numTxt: '', tagTxt: '', ph: R() * 6 });
  }
  // keyboard cursor ring
  const cursor = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.7, 4, 1), new THREE.MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
  cursor.rotation.x = -Math.PI / 2; cursor.rotation.z = Math.PI / 4; cursor.scale.setScalar(Math.SQRT2 * 0.98); cursor.position.y = 0.12; cursor.visible = false; scene.add(cursor);

  function makeFlag() {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 8), vin('#ffffff')); pole.position.y = 0.42; pole.castShadow = true;
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.36, -0.1); sh.lineTo(0, -0.22);
    const cloth = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false }), vin('#ff3b4f', { extra: { side: THREE.DoubleSide } })); cloth.position.set(0.02, 0.84, 0); cloth.castShadow = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), vin('#ffd23a')); knob.position.y = 0.86;
    const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), vin('#ff3b4f')); buoy.scale.y = 0.75; buoy.position.y = 0.06;
    g.add(pole, cloth, knob, buoy); g.userData.cloth = cloth; return g;
  }

  // ---------------------------------------------------------------- submarine
  const sub = makeSub(S); sub.root.scale.setScalar(1.25); scene.add(sub.root);
  const subShadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32), new THREE.MeshBasicMaterial({ map: radialTex(), color: '#0b5a6a', transparent: true, opacity: 0.35, depthWrite: false }));
  subShadow.rotation.x = -Math.PI / 2; scene.add(subShadow);
  const park = new THREE.Vector3(0, 2.2, -HALF - 1.4);
  const subPos = park.clone(), subVel = new THREE.Vector3(), subWant = park.clone();
  let subMode = 'free', subIdle = 99, subYaw = 0, subBank = 0;
  sub.root.position.copy(subPos);

  // ---------------------------------------------------------------- fish
  const fish = [];
  const kinds = ['clown', 'tang', 'pink', 'lemon', 'mint', 'clown', 'tang', 'lemon', 'pink'];
  kinds.forEach((k, n) => {
    const f = makeFish(S, k); f.root.scale.setScalar(0.9 + R() * 0.6); scene.add(f.root);
    // loops behind and beside the reef so they never cover the clams
    const side = n % 3, path = side === 0 ? { cx: 0, cz: -10.5, rx: 11, rz: 2.5, y: 1.2 + R() * 3.2 } : { cx: side === 1 ? -9 : 9, cz: -2.5, rx: 2.2, rz: 5.5, y: 0.6 + R() * 2.5 };
    fish.push({ f, path, sp: (0.12 + R() * 0.1) * (R() < 0.5 ? -1 : 1), ph: R() * 6 });
  });

  // ---------------------------------------------------------------- bubbles (instanced)
  const BUB = 160;
  const bubMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, roughness: 0.05, clearcoat: 1, emissive: '#bff7ff', emissiveIntensity: 0.25, envMapIntensity: 1.2 }), BUB);
  bubMesh.frustumCulled = false; scene.add(bubMesh);
  const bubs = [...Array(BUB)].map(() => ({ p: new THREE.Vector3(0, -99, 0), v: 0, r: 0, ph: 0, life: 0 }));
  let bubNext = 0;
  function bubble(at, n = 6, spread = 0.3, size = 1) { for (let k = 0; k < n; k++) { const b = bubs[bubNext]; bubNext = (bubNext + 1) % BUB; b.p.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * 0.2, (Math.random() - 0.5) * spread)); b.v = 0.9 + Math.random() * 1.2; b.r = (0.035 + Math.random() * 0.06) * size; b.ph = Math.random() * 6; b.life = 4 + Math.random() * 3; } }
  const vents = [ringSpot(-1.5, 7.2), ringSpot(-0.4, 7.4), ringSpot(-2.7, 7.0), new THREE.Vector3(-6.3, 0, -5.0)];
  const dummy = new THREE.Object3D();

  // ---------------------------------------------------------------- fx: sweep rings, orbs, particles
  const fxRings = [];
  const ringFxGeo = new THREE.RingGeometry(0.92, 1.0, 64);
  function sweep(at, color, maxR, ms = 1100, y = 0.13, delay = 0) {
    const m = new THREE.Mesh(ringFxGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(at.x, y, at.z); scene.add(m); fxRings.push({ m, t0: performance.now() + delay, ms, maxR });
  }
  let parts = [];
  const dropGeo = new THREE.SphereGeometry(0.06, 8, 6), coinGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.03, 20);
  const dropMat = new THREE.MeshBasicMaterial({ color: '#e9fdff', transparent: true, opacity: 0.9 });
  const coinMat = new THREE.MeshPhysicalMaterial({ color: '#ffcf3a', metalness: 1, roughness: 0.22, emissive: '#ff9d00', emissiveIntensity: 0.25, envMapIntensity: 1.3 });
  const puffMats = ['#ffffff', '#ffd23a', '#ff8a3d', '#ff5a7a'].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1, toneMapped: false }));
  const puffGeo = new THREE.SphereGeometry(0.25, 14, 10);
  function spawn(kind, at, n) {
    for (let k = 0; k < n; k++) {
      let m, v, life, grav = 9.8, w = new THREE.Vector3();
      const a = Math.random() * Math.PI * 2;
      if (kind === 'drop') { m = new THREE.Mesh(dropGeo, dropMat); const s = 1 + Math.random() * 2.6; v = new THREE.Vector3(Math.cos(a) * s, 4 + Math.random() * 4, Math.sin(a) * s); life = 1.6; m.scale.setScalar(0.6 + Math.random() * 1.2); }
      else if (kind === 'coin') { m = new THREE.Mesh(coinGeo, coinMat); const s = 0.8 + Math.random() * 2.4; v = new THREE.Vector3(Math.cos(a) * s, 5 + Math.random() * 4, Math.sin(a) * s); life = 2.6; grav = 6; w.set(Math.random() * 12, Math.random() * 6, Math.random() * 12); m.castShadow = true; }
      else { m = new THREE.Mesh(puffGeo, puffMats[k % puffMats.length].clone()); const s = 0.6 + Math.random() * 1.6; v = new THREE.Vector3(Math.cos(a) * s, 1.2 + Math.random() * 2.2, Math.sin(a) * s); life = 0.9 + Math.random() * 0.4; grav = -1; }
      m.position.copy(at); scene.add(m); parts.push({ m, v, w, life, max: life, grav, kind });
    }
  }

  // ---------------------------------------------------------------- camera fit (whole grid plus the parked sub)
  const look = new THREE.Vector3(0, 0, 0.2), camDir = new THREE.Vector3();
  const fitPts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, 0.8]) fitPts.push(new THREE.Vector3(sx * (HALF + 0.15), y, sz * (HALF + 0.15)));
  let fitAspect = 0, dist = 14, pitch = 0.95, shake = 0, intro = reduce ? 0 : 1, flashK = 0;
  const v3 = new THREE.Vector3();
  function placeCam(d, extra) { camDir.set(0, Math.sin(pitch), Math.cos(pitch)); camera.position.copy(look).addScaledVector(camDir, d); if (extra) camera.position.add(extra); camera.lookAt(look); camera.updateMatrixWorld(); }
  function bounds(pts) { let x0 = 9, x1 = -9, y0 = 9, y1 = -9; for (const p of pts) { v3.copy(p).project(camera); x0 = Math.min(x0, v3.x); x1 = Math.max(x1, v3.x); y0 = Math.min(y0, v3.y); y1 = Math.max(y1, v3.y); } return { x0, x1, y0, y1 }; }
  function fit() {
    const a = camera.aspect; fitAspect = a;
    pitch = a < 0.85 ? 1.2 : a < 1.25 ? 1.12 : 0.84;
    park.set(a > 1.25 ? HALF + 1.55 : 0, a > 1.25 ? 1.3 : 1.5, a > 1.25 ? 1.2 : -HALF - 1.05);
    const pts = [...fitPts, park.clone().add(new THREE.Vector3(0, 0.5, 0)), park.clone().add(new THREE.Vector3(a > 1.25 ? 0.9 : 0, 0, 0))];
    look.set(0, 0, 0.2);
    for (let pass = 0; pass < 4; pass++) {
      let lo = 4, hi = 60;
      for (let it = 0; it < 24; it++) { const mid = (lo + hi) / 2; placeCam(mid); const b = bounds(pts); if (b.x0 > -0.95 && b.x1 < 0.95 && b.y0 > -0.93 && b.y1 < 0.86) hi = mid; else lo = mid; }
      dist = hi; placeCam(dist); const b = bounds(pts);
      // centre the box on screen: shift the look point along the ground
      const cy = (b.y0 + b.y1) / 2 - (-0.93 + 0.86) / 2, cx = (b.x0 + b.x1) / 2;
      look.z -= cy * dist * 0.35; look.x += cx * dist * 0.3;
    }
  }

  // ---------------------------------------------------------------- input
  let hover = -1;
  const pickTile = (e) => { const h = S.pick(e, hits); return h ? h.object.userData.i : -1; };
  canvas.addEventListener('pointermove', (e) => { const i = pickTile(e); if (i !== hover) { hover = i; opts.onHover?.(i); } canvas.style.cursor = i >= 0 ? 'pointer' : 'default'; });
  canvas.addEventListener('pointerleave', () => { hover = -1; opts.onHover?.(-1); });
  canvas.addEventListener('click', (e) => { const i = pickTile(e); if (i >= 0) opts.onPick?.(i); });

  // ---------------------------------------------------------------- per-frame
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  function label(el, p, scale) { const s = S.toScreen(p); el.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px) translate(-50%,-50%) scale(${scale.toFixed(3)})`; }
  function tilePx(i) { const c = tp(i); tmpA.set(c.x - 0.5, TOP + 0.3, c.z); tmpB.set(c.x + 0.5, TOP + 0.3, c.z); const a = S.toScreen(tmpA), b = S.toScreen(tmpB); return Math.hypot(b.x - a.x, b.y - a.y); }
  const neighbours = (i) => { const x = i % N, y = (i / N) | 0, a = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < N && Y < N) a.push(Y * N + X); } return a; };

  function onReveal(i, T) {
    const c = tp(i);
    if (T.mine) return;
    const col = T.n ? NUMC[T.n] : '#e9fffd';
    sweep(c, '#ffffff', T.free ? 1.6 : 2.3, T.free ? 800 : 1100);
    if (!T.free) sweep(c, col, 2.0, 1200, 0.135, 140);
    if (T.n) for (const j of neighbours(i)) { const V = tiles[j]; V.flash = 1; V.flashCol.set(col); }
    bubble(c.clone().setY(0.4), T.free ? 2 : 6, 0.5);
  }

  S.onFrame((dt, t) => {
    const nowMs = performance.now(), model = opts.getTiles(), ui = opts.getUi();
    if (camera.aspect !== fitAspect) fit();
    // camera with intro swoop, gentle drift and shake
    let extra = new THREE.Vector3(Math.sin(t * 0.21) * 0.18, Math.sin(t * 0.17) * 0.1, 0);
    if (intro > 0) { intro = Math.max(0, intro - dt / 2.4); const e = ease.inOut(1 - intro); extra.add(new THREE.Vector3(-7 * (1 - e), 5 * (1 - e), 4 * (1 - e))); }
    if (shake > 0) { extra.x += (Math.random() - 0.5) * shake; extra.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 1.3); }
    placeCam(dist, extra);
    S.sun.position.set(5, 14, 7); S.sun.target.position.set(0, 0, 0);
    for (const c of caustics) { c.t.offset.x += c.sp * dt; c.t.offset.y += c.sp * 0.6 * dt; }
    for (const s of shafts) s.m.material.opacity = 0.1 + 0.07 * Math.sin(t * 0.5 + s.ph);
    for (const d of decorSway) d.m.rotation.z = Math.sin(t * 0.9 + d.ph) * d.amp;
    for (const k of kelps) k.segs.forEach((s, n) => { s.rotation.z = Math.sin(t * 1.1 + k.ph + n * 0.45) * 0.09; s.rotation.x = Math.sin(t * 0.8 + k.ph * 1.3 + n * 0.4) * 0.06; });
    chest.userData.gold.material.emissiveIntensity += ((ui.phase === 'done' ? 1.1 : 0.25) - chest.userData.gold.material.emissiveIntensity) * (1 - Math.exp(-dt * 3));
    // fish
    for (const F of fish) { const a = t * F.sp + F.ph, P = F.path; const x = P.cx + Math.cos(a) * P.rx, z = P.cz + Math.sin(a) * P.rz, y = P.y + Math.sin(t * 0.7 + F.ph) * 0.3; const dx = -Math.sin(a) * P.rx * F.sp, dz = Math.cos(a) * P.rz * F.sp; F.f.root.position.set(x, y, z); F.f.root.rotation.y = Math.atan2(-dz, dx); F.f.update(dt, t); }
    // ambient bubbles
    if (!reduce && Math.random() < dt * 3) bubble(vents[(Math.random() * vents.length) | 0].clone().add(new THREE.Vector3(0, 0.5, 0)), 1 + (Math.random() * 2 | 0), 0.3);
    for (let k = 0; k < BUB; k++) {
      const b = bubs[k];
      if (b.life > 0) { b.life -= dt; b.p.y += b.v * dt; b.p.x += Math.sin(t * 3 + b.ph) * 0.2 * dt; b.v = Math.min(2.4, b.v + dt * 0.4); if (b.p.y > 9) b.life = 0; }
      dummy.position.copy(b.p); dummy.scale.setScalar(b.life > 0 ? b.r * (1 + 0.1 * Math.sin(t * 8 + b.ph)) : 0.0001); dummy.updateMatrix(); bubMesh.setMatrixAt(k, dummy.matrix);
    }
    bubMesh.instanceMatrix.needsUpdate = true;
    // sweep rings
    for (let k = fxRings.length - 1; k >= 0; k--) { const r = fxRings[k], a = (nowMs - r.t0) / r.ms; if (a < 0) continue; if (a >= 1) { scene.remove(r.m); r.m.material.dispose(); fxRings.splice(k, 1); continue; } const e = 1 - Math.pow(1 - a, 3); r.m.scale.setScalar(0.3 + e * r.maxR); r.m.material.opacity = (1 - a) * 0.85; }
    // particles
    if (parts.length) parts = parts.filter((q) => {
      q.life -= dt; q.v.y -= q.grav * dt; q.m.position.addScaledVector(q.v, dt);
      if (q.kind === 'puff') { const k = 1 - q.life / q.max; q.m.scale.setScalar(0.6 + k * 2.4); q.m.material.opacity = Math.max(0, 1 - k); q.v.multiplyScalar(0.94); }
      else { q.m.rotation.x += q.w.x * dt; q.m.rotation.z += q.w.z * dt; if (q.m.position.y < 0.05) { q.m.position.y = 0.05; q.v.multiplyScalar(0.3); q.v.y = Math.abs(q.v.y) * 0.3; } }
      if (q.life <= 0) { scene.remove(q.m); if (q.kind === 'puff') q.m.material.dispose(); return false; } return true;
    });

    // clams
    const canPlay = ui.phase === 'run' || ui.phase === 'idle';
    for (let i = 0; i < N * N; i++) {
      const V = tiles[i], T = model[i] || {};
      const active = !!T.rev && nowMs >= (T.t0 || 0);
      if (active && !V.shown) { V.shown = true; onReveal(i, T); if (T.mine) { V.mv = 7; } }
      if (!T.rev && V.shown) V.shown = false;
      const wantOpen = active ? (T.mine ? 1.15 : 1) : 0;
      V.ov += ((wantOpen - V.open) * 170 - V.ov * 13) * dt; V.open += V.ov * dt;
      const breath = !active ? 0.05 * (0.5 + 0.5 * Math.sin(t * 1.4 + V.ph)) * (reduce ? 0 : 1) : 0;
      V.pivot.rotation.x = -Math.max(0, V.open) * 1.3 - breath;
      V.pearl.visible = V.open > 0.08 && !T.mine; V.pearl.scale.setScalar(Math.min(1, Math.max(0.01, V.open)));
      const hv = hover === i && !T.rev && canPlay && !ui.busy ? 1 : 0;
      V.hov += (hv - V.hov) * (1 - Math.exp(-dt * 14));
      V.clam.position.y = TOP + 0.13 + V.hov * 0.12 + (T.boom && active ? Math.max(0, Math.sin((nowMs - T.t0) * 0.03)) * 0.05 * Math.max(0, 1 - (nowMs - T.t0) / 800) : 0);
      V.clam.scale.setScalar((1 + V.hov * 0.07) * (1 - 0.12 * Math.min(1, Math.max(0, V.open))));
      V.padMat.color.copy(V.padBase).lerp(CLEARED, Math.min(1, Math.max(0, V.open)) * (T.mine ? 0 : 0.75));
      const provenMine = T.proven === 1 && ui.phase === 'run' && !T.rev;
      const armed = provenMine && ui.mineArm === i;
      V.mat.emissive.set(ui.pingArm && hv ? WARM : provenMine ? '#ff2a3a' : '#ffffff');
      V.mat.emissiveIntensity = V.hov * (ui.pingArm ? 0.35 : 0.2) + (provenMine ? (armed ? 0.35 + 0.2 * Math.sin(t * 12) : 0.14) : 0);
      // neighbour flash on the pads when a number lands
      if (V.flash > 0) { V.flash = Math.max(0, V.flash - dt * 1.4); }
      V.padMat.emissive.copy(V.flashCol); V.padMat.emissiveIntensity = V.flash * 0.55;
      // mine
      if (T.mine && active) {
        if (!V.mine) { V.mine = makeMine(S); V.mine.root.position.copy(tp(i)); V.mine.root.rotation.x = -0.35; scene.add(V.mine.root); V.mine.angry(!!T.boom); V.mk = 0; V.mv = 7; if (!T.boom) bubble(tp(i).setY(0.4), 5, 0.4); }
      }
      if (V.mine) {
        const want = T.mine && active ? 1 : 0;
        V.mv += ((want - V.mk) * 160 - V.mv * 11) * dt; V.mk += V.mv * dt;
        const s = Math.max(0.001, V.mk); V.mine.root.scale.setScalar(s * (T.boom ? 1.25 : 1));
        V.mine.root.position.y = TOP + 0.1 + Math.max(0, V.mk) * 0.62 + Math.sin(t * 2 + V.ph) * 0.05;
        V.mine.root.rotation.y = Math.sin(t * 0.9 + V.ph) * 0.25;
        V.mine.update(dt, t);
        if (!want && V.mk < 0.02) { scene.remove(V.mine.root); V.mine = null; }
      }
      // proven-mine flag
      if (provenMine && !V.flag) { V.flag = makeFlag(); V.flag.position.copy(tp(i)).add(new THREE.Vector3(0.44, 0.05, 0.36)); V.flag.scale.setScalar(0.01); scene.add(V.flag); V.flagK = 0; }
      if (V.flag) {
        V.flagK += ((provenMine ? 1 : 0) - V.flagK) * (1 - Math.exp(-dt * 10)); V.flag.scale.setScalar(Math.max(0.01, V.flagK));
        V.flag.userData.cloth.rotation.y = Math.sin(t * (armed ? 16 : 4) + V.ph) * 0.35; V.flag.rotation.z = armed ? Math.sin(t * 20) * 0.12 : 0;
        if (!provenMine && V.flagK < 0.03) { scene.remove(V.flag); V.flag = null; }
      }
      // ping ring
      const pinged = T.ping !== null && T.ping !== undefined && !T.rev;
      V.ring.visible = pinged;
      if (pinged) { V.ring.material.color.set(T.ping ? WARM : COLD); V.ring.material.opacity = 0.65 + 0.3 * Math.sin(t * 4 + V.ph); V.ring.scale.setScalar(1 + 0.05 * Math.sin(t * 4 + V.ph)); }
      // labels
      const showNum = active && !T.mine && T.n > 0 && V.open > 0.35;
      const numTxt = showNum ? String(T.n) : '';
      if (numTxt !== V.numTxt) { V.numTxt = numTxt; V.num.hidden = !showNum; if (showNum) { V.num.textContent = numTxt; V.num.style.color = NUMC[T.n]; V.num.classList.remove('pop'); void V.num.offsetWidth; V.num.classList.add('pop'); } }
      const tagTxt = provenMine ? 'MINE' : pinged ? (T.ping ? 'WARM' : 'COLD') : '';
      if (tagTxt !== V.tagTxt) { V.tagTxt = tagTxt; V.tag.hidden = !tagTxt; V.tag.textContent = tagTxt; V.tag.className = 'tag ' + tagTxt.toLowerCase(); }
      if (showNum || tagTxt) {
        const px = tilePx(i), c = tp(i);
        if (showNum) label(V.num, c.clone().setY(TOP + 0.62 + Math.sin(t * 2 + V.ph) * 0.03), px / 64);
        if (tagTxt) label(V.tag, c.clone().add(new THREE.Vector3(0, 0.42 + V.hov * 0.12, 0.05)), Math.min(1.15, px / 66));
      }
    }
    // keyboard cursor
    cursor.visible = ui.kbOn && ui.kb >= 0;
    if (cursor.visible) { const c = tp(ui.kb); cursor.position.x = c.x; cursor.position.z = c.z; cursor.material.opacity = 0.7 + 0.3 * Math.sin(t * 6); }

    // submarine
    subIdle += dt;
    if (subMode === 'free') {
      if (subIdle > 1.6) subWant.copy(park);
      const f = 1 - Math.exp(-dt * 2.4); const prev = subPos.clone(); subPos.lerp(subWant, f); subVel.copy(subPos).sub(prev).divideScalar(Math.max(dt, 1e-3));
    }
    const sp = Math.hypot(subVel.x, subVel.z);
    const wantYaw = sp > 0.6 ? Math.atan2(subVel.x, subVel.z) : (subWant.equals(park) && fitAspect > 1.25 ? -0.55 : 0);
    let dy = wantYaw - subYaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    subYaw += dy * (1 - Math.exp(-dt * 6)); subBank += (Math.max(-0.4, Math.min(0.4, -dy * 0.8)) - subBank) * (1 - Math.exp(-dt * 5));
    sub.root.position.copy(subPos); sub.root.position.y += Math.sin(t * 1.6) * 0.06;
    sub.root.rotation.set(Math.sin(t * 1.3) * 0.04, subYaw, subBank + Math.sin(t * 1.1) * 0.03);
    sub.update(dt, t);
    subShadow.position.set(subPos.x, Math.abs(subPos.x) < HALF + 0.5 && Math.abs(subPos.z) < HALF + 0.5 ? 0.115 : -0.6, subPos.z);
    subShadow.material.opacity = Math.max(0.08, 0.38 - subPos.y * 0.08);
    if (!reduce && Math.random() < dt * 4) { const back = new THREE.Vector3(-Math.sin(subYaw) * 0.65, 0, -Math.cos(subYaw) * 0.65); bubble(subPos.clone().add(back), 1, 0.1, 0.7); }
  });

  // ---------------------------------------------------------------- actions
  async function travel(to, ms) {
    subMode = 'tween'; const from = subPos.clone();
    await tween(ms, (k) => { const e = ease.inOut(k); const prev = subPos.clone(); subPos.lerpVectors(from, to, e); subPos.y += Math.sin(Math.PI * e) * 0.35; subVel.copy(subPos).sub(prev).multiplyScalar(60); });
    subVel.set(0, 0, 0);
  }
  return {
    S, NUMC,
    tileScreen(i) { const c = tp(i); return S.toScreen(c.setY(TOP + 0.3)); },
    async dive(i) {
      const c = tp(i), above = new THREE.Vector3(c.x, 1.25, c.z + 0.05);
      subIdle = 0;
      const d = subPos.distanceTo(above);
      sub.spin(26);
      await travel(above, Math.max(200, Math.min(520, d * 75)));
      await tween(140, (k) => { subPos.y = 1.25 - ease.out(k) * 0.42; });
      sub.bump(-0.22); bubble(c.clone().setY(0.6), 8, 0.6);
      subWant.copy(above).setY(1.45); subMode = 'free'; subIdle = 0;
    },
    async ping(i, warm) {
      subIdle = 0; sub.bump(-0.15); sub.spin(20);
      const c = tp(i), from = subPos.clone(), col = warm ? WARM : COLD;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: radialTex(), color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); orb.add(glow);
      scene.add(orb);
      const to = c.clone().setY(0.45);
      await tween(380, (k) => { const e = ease.inOut(k); orb.position.lerpVectors(from, to, e); orb.position.y += Math.sin(Math.PI * e) * 0.8; glow.lookAt(camera.position); });
      scene.remove(orb);
      for (let k = 0; k < 3; k++) sweep(c, col, 1.5, 900, 0.14, k * 160);
      bubble(c.clone().setY(0.5), 5, 0.5);
    },
    boom(i) {
      const c = tp(i);
      shake = reduce ? 0 : 0.55;
      spawn('drop', c.clone().setY(0.6), 46); spawn('puff', c.clone().setY(0.7), 16);
      sweep(c, '#ff4a5a', 4.2, 1300, 0.15); sweep(c, '#ffffff', 3.2, 900, 0.16, 80);
      bubble(c.clone().setY(0.5), 26, 1.2, 1.4);
      // the sub gets knocked back and spins its prop in panic
      sub.bump(-0.35); sub.spin(-30); sub.worry(1);
      subMode = 'free'; subWant.copy(subPos).add(new THREE.Vector3(0, 1.0, -0.6)); subIdle = -0.6;
      setTimeout(() => sub.worry(0), 2600);
    },
    cash(mult) {
      const at = subPos.clone();
      spawn('coin', at, Math.min(70, 18 + Math.round(mult * 5)));
      bubble(at, 20, 0.8, 1.2);
      sub.bump(-0.3); sub.spin(40);
      const ch = chest.position.clone().add(new THREE.Vector3(0, 0.8, 0)); spawn('coin', ch, 16);
      // every opened clam flicks a coin out of its pearl, in a quick wave across the reef
      const model = opts.getTiles(); let k = 0;
      model.forEach((T, i) => { if (T.rev && !T.mine && k < 24) { const d = k++ * 45; setTimeout(() => { spawn('coin', tp(i).setY(0.5), 1 + (mult > 3 ? 1 : 0)); tiles[i].flash = 1; tiles[i].flashCol.set('#ffd23a'); }, d); } });
    },
  };
}
