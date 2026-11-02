// PASS IT world: a backyard party at sunset. Eight glossy vinyl critters sit on poufs around a round party table,
// a cartoon bomb with a fizzing fuse hops from hands to hands, and when it goes off: soot, confetti and comic smoke.
//   const W = createWorld(canvas, { labelHost })
//   W.seats(list)              list[8]: { name, you } for seats 0..7 (seat 0 sits closest to the camera)
//   W.ready()                  bomb back on the table, fuse unlit, everybody clean
//   W.light()                  the fuse is lit (round starts)
//   W.setRoute(route)          the engine route [{ seat, t0, t1 }] (times in round ms)
//   W.setTime(ms, mult)        place the bomb for this round time; fuse length and glow follow the multiplier
//   W.tag(seat, text, cls)     status line on a seat's name tag ('' hides it), cls: 'hot' | 'safe' | 'bad' | ''
//   W.cashed(seat, m)          that critter is safe: bubble, shades and a "×m" pop
//   await W.explode()          the bomb goes off where it is; every critter not cashed out gets sooted
//   await W.burnOut()          the fuse burns out at the max win: the bomb pops into confetti, everybody cheers
import { THREE, createStage, canvasTex, radialTex, tween, wait, ease, reduce, mulberry } from '../lib/stage.js';
import { makeShape, meshSDF } from '../sneak/sdfmesh.js';

const E = (c, r, col, k = 0.05, x = {}) => ({ t: 'e', c, r, col, k, ...x });
const C = (a, b, ra, rb, col, k = 0.04) => ({ t: 'c', a, b, ra, rb, col, k });
const SEAT_R = 2.6, POUF_H = 0.46, TABLE_Y = 0.8, N = 8, FLIGHT = 480;
export const SEAT_COLORS = ['#ffcf33', '#ff4d7a', '#4fb3ff', '#2fd39a', '#a46bff', '#ff8a3d', '#8be04a', '#ff6fd8'];
const HAT_COLORS = ['#4fb3ff', '#ffd23f', '#ff4d7a', '#ff8a3d', '#ffd23f', '#4fb3ff', '#ff4d7a', '#2fd39a'];
const VARIANT = ['bear', 'cat', 'bunny', 'antenna', 'bear', 'cat', 'antenna', 'bunny'];
const seatAngle = (i) => (i / N) * Math.PI * 2;
const seatPos = (i, r = SEAT_R) => new THREE.Vector3(Math.sin(seatAngle(i)) * r, 0, Math.cos(seatAngle(i)) * r);

function shade(hex, f) { return '#' + new THREE.Color(hex).multiplyScalar(f).getHexString(); }
function critterGeo(variant, body) {
  const prims = [
    E([0, 0.42, 0], [0.44, 0.44, 0.4], 'body', 0.06),
    E([0, 0.9, 0.02], [0.38, 0.34, 0.35], 'body', 0.18),
    E([0, 0.4, 0.2], [0.31, 0.3, 0.22], 'belly', 0.12),
    E([0, 0.78, 0.3], [0.17, 0.11, 0.08], 'belly', 0.1),          // muzzle
    E([0, 0.83, 0.38], [0.055, 0.04, 0.04], 'nose', 0.02),
    E([-0.18, 0.06, 0.3], [0.13, 0.08, 0.17], 'foot', 0.04),
    E([0.18, 0.06, 0.3], [0.13, 0.08, 0.17], 'foot', 0.04),
  ];
  if (variant === 'bear') for (const s of [-1, 1]) prims.push(E([s * 0.27, 1.17, -0.02], [0.12, 0.12, 0.08], 'body', 0.06), E([s * 0.27, 1.17, 0.03], [0.07, 0.07, 0.05], 'belly', 0.02));
  if (variant === 'cat') for (const s of [-1, 1]) prims.push(E([s * 0.22, 1.2, 0], [0.1, 0.17, 0.07], 'body', 0.07, { rot: [0, 0, s * -0.45] }));
  if (variant === 'bunny') for (const s of [-1, 1]) prims.push(E([s * 0.13, 1.38, -0.04], [0.075, 0.27, 0.06], 'body', 0.08, { rot: [0, 0, s * -0.18] }), E([s * 0.135, 1.38, 0.0], [0.04, 0.19, 0.03], 'nose', 0.02, { rot: [0, 0, s * -0.18] }));
  if (variant === 'antenna') for (const s of [-1, 1]) prims.push(C([s * 0.11, 1.15, 0], [s * 0.2, 1.43, 0.02], 0.03, 0.022, 'foot', 0.05), E([s * 0.2, 1.45, 0.02], [0.065, 0.065, 0.065], 'nose', 0.03));
  const cols = { body: new THREE.Color(body), belly: new THREE.Color('#fff3dc'), foot: new THREE.Color(shade(body, 0.62)), nose: new THREE.Color('#ff7fa8') };
  const cheek = new THREE.Color('#ff8fb0');
  return meshSDF(makeShape(prims), 76, cols, (x, y, z, key, c) => {
    if (key === 'body' && z > 0.2 && Math.abs(Math.abs(x) - 0.25) < 0.07 && Math.abs(y - 0.8) < 0.05) c.lerp(cheek, 0.6);
    return c;
  }, null, 2);
}
function stripeTex(a, b) {
  return canvasTex(128, 128, (g, w, h) => { g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; for (let i = -h; i < w; i += 32) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + 16, h); g.lineTo(i + 16 + h, 0); g.lineTo(i + h, 0); g.fill(); } });
}

export function createWorld(canvas, opts = {}) {
  const S = createStage(canvas, {
    sky: '#ff9a6a', fog: ['#ff9f7a', 30, 70], exposure: 0.94, envIntensity: 0.38, hemi: 0.78, hemiSky: '#ffd7f0', hemiGround: '#7a5cc8',
    sunColor: '#ffd29a', sun: 2.5, rimColor: '#9a7cff', rim: 1.0, shadowSize: 7,
    bloom: [0.2, 0.35, 0.96],
    fov: (a) => (a < 0.8 ? 52 : a < 1.15 ? 44 : 34),
  });
  const { scene, camera } = S;
  const R = mulberry(23);
  S.sun.position.set(-7, 9, 6);

  // ---------------------------------------------------------------- sunset sky, lawn, hedges, balloons, lights
  scene.background = canvasTex(16, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#5a2fc0'); gr.addColorStop(0.35, '#c645c8'); gr.addColorStop(0.62, '#ff6f8f'); gr.addColorStop(0.8, '#ffa36a'); gr.addColorStop(1, '#ffcf73');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const grass = canvasTex(512, 512, (g, w) => {
    g.fillStyle = '#4cc867'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 2600; i++) { g.fillStyle = ['#43bb5d', '#58d470', '#3fae58', '#66dc78'][i % 4]; g.fillRect(R() * w, R() * w, 2, 5 + R() * 6); }
  });
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(24, 24);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 64), new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  // round rug with rings under the party
  const rug = new THREE.Mesh(new THREE.CircleGeometry(4.3, 72), new THREE.MeshStandardMaterial({ roughness: 0.85, map: canvasTex(512, 512, (g, w) => {
    const cols = ['#ffd23f', '#ff6f8f', '#7a5cff', '#2fd39a', '#4fb3ff', '#ff8a3d'];
    for (let i = 0; i < 12; i++) { g.fillStyle = cols[i % cols.length]; g.beginPath(); g.arc(w / 2, w / 2, (w / 2) * (1 - i / 12), 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 5; g.setLineDash([10, 12]);
    for (let i = 1; i < 12; i += 2) { g.beginPath(); g.arc(w / 2, w / 2, (w / 2) * (1 - i / 12) - 4, 0, Math.PI * 2); g.stroke(); }
  }) }));
  rug.rotation.x = -Math.PI / 2; rug.position.y = 0.01; rug.receiveShadow = true; scene.add(rug);
  // hedges and trees around the yard
  const hedgeMats = ['#2fae62', '#3cc46e', '#27a05a'].map((c) => S.vinyl(c, { rough: 0.6, env: 0.25 }));
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + R() * 0.2, r = 11 + R() * 3;
    const b = new THREE.Mesh(new THREE.SphereGeometry(1.4 + R() * 1.1, 20, 14), hedgeMats[i % 3]);
    b.position.set(Math.sin(a) * r, 0.6, Math.cos(a) * r); b.scale.y = 0.8; b.castShadow = true; scene.add(b);
  }
  const trunkMat = S.vinyl('#9a5a3a', { rough: 0.6 });
  const leafMats = ['#2fbf6a', '#ff8fc4', '#7fdc4a', '#3fd6a6'].map((c) => S.vinyl(c, { rough: 0.5 }));
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i - 4) * 0.33 + R() * 0.1, r = 13 + R() * 4, g = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 2.4, 10), trunkMat); tr.position.y = 1.2;
    const top = new THREE.Mesh(new THREE.SphereGeometry(1.6 + R() * 0.8, 22, 16), leafMats[i % 4]); top.position.y = 3.3;
    g.add(tr, top); g.children.forEach((m) => { m.castShadow = true; });
    g.position.set(Math.sin(a) * r, 0, Math.cos(a) * r); scene.add(g);
  }
  // balloon bunches
  const balloonCols = ['#ff4d7a', '#ffd23f', '#4fb3ff', '#a46bff', '#2fd39a', '#ff8a3d', '#ff6fd8'];
  const balloons = [];
  const strMat = new THREE.LineBasicMaterial({ color: '#ffffff' });
  for (const [bx, bz, n] of [[-5.6, -3.2, 5], [5.4, -3.6, 5], [-6.4, 2.4, 3], [6.6, 1.8, 4]]) {
    for (let i = 0; i < n; i++) {
      const m = S.vinyl(balloonCols[(i * 3 + n + Math.round(bx + 7)) % 7], { rough: 0.15, env: 1 });
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 18), m); b.scale.set(1, 1.18, 1); b.castShadow = true;
      const top = new THREE.Vector3(bx + (R() - 0.5) * 1.2, 2.6 + R() * 1.1, bz + (R() - 0.5) * 1.2);
      b.position.copy(top); scene.add(b);
      const knot = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.1, 8), m); knot.position.set(0, -0.5, 0); knot.rotation.x = Math.PI; b.add(knot);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.52, 0), new THREE.Vector3(bx - top.x, -top.y + 0.05, bz - top.z)]), strMat); b.add(line);
      balloons.push({ b, base: top.clone(), ph: R() * 6 });
    }
    const weight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), S.vinyl('#ffffff')); weight.position.set(bx, 0.1, bz); weight.castShadow = true; scene.add(weight);
  }
  // poles with string lights and bunting in a ring around the party
  const poleMat = S.vinyl('#ffffff');
  const bulbCols = ['#ffd23f', '#ff5f8f', '#5fd0ff', '#8bff6a', '#ffa64d', '#c78bff'];
  const bulbMats = bulbCols.map((c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.6), toneMapped: false }));
  const bulbGeo = new THREE.SphereGeometry(0.08, 10, 8);
  const flagGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.16, 0, 0), new THREE.Vector3(0.16, 0, 0), new THREE.Vector3(0, -0.34, 0)]); flagGeo.computeVertexNormals();
  const flagMats = balloonCols.map((c) => new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.6 }));
  const lineMat = new THREE.LineBasicMaterial({ color: '#3a2a5a' });
  const POLES = 6, PR = 5.6, PH = 3.6;
  const polePos = [];
  for (let i = 0; i < POLES; i++) { const a = ((i + 0.5) / POLES) * Math.PI * 2; const p = new THREE.Vector3(Math.sin(a) * PR, 0, Math.cos(a) * PR); polePos.push(p); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, PH, 10), poleMat); m.position.set(p.x, PH / 2, p.z); m.castShadow = true; scene.add(m); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), S.vinyl('#ffd23f')); cap.position.set(p.x, PH, p.z); scene.add(cap); }
  let bi = 0;
  for (let i = 0; i < POLES - 1; i++) {   // the segment in front of the camera stays open
    const a = polePos[i], b = polePos[(i + 1) % POLES];
    for (const [h, sag, kind] of [[PH - 0.05, 0.55, 'bulb'], [PH - 0.35, 0.75, 'flag']]) {
      const pts = [];
      for (let k = 0; k <= 16; k++) { const f = k / 16; pts.push(new THREE.Vector3().lerpVectors(a, b, f).setY(h - Math.sin(f * Math.PI) * sag)); }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
      for (let k = 1; k < 16; k += kind === 'bulb' ? 2 : 1) {
        if (kind === 'bulb') { const m = new THREE.Mesh(bulbGeo, bulbMats[bi++ % bulbMats.length]); m.position.copy(pts[k]).y -= 0.08; scene.add(m); }
        else { const m = new THREE.Mesh(flagGeo, flagMats[(k + i) % flagMats.length]); m.position.copy(pts[k]); m.lookAt(0, pts[k].y, 0); scene.add(m); }
      }
    }
  }

  // ---------------------------------------------------------------- table, cake, cups, poufs
  const clothTex = canvasTex(512, 512, (g, w) => { g.fillStyle = '#ffe2b8'; g.fillRect(0, 0, w, w); const cs = ['#ff4d7a', '#4fb3ff', '#ffd23f', '#2fd39a', '#a46bff']; for (let i = 0; i < 110; i++) { g.fillStyle = cs[i % cs.length]; g.beginPath(); g.arc(R() * w, R() * w, 7 + R() * 5, 0, Math.PI * 2); g.fill(); } });
  clothTex.wrapS = clothTex.wrapT = THREE.RepeatWrapping;
  const clothMat = new THREE.MeshPhysicalMaterial({ map: clothTex, roughness: 0.7, clearcoat: 0.2, envMapIntensity: 0.3 });
  const cloth = new THREE.Mesh(new THREE.CylinderGeometry(1.78, 1.92, 0.42, 72, 1, true), clothMat); cloth.position.y = TABLE_Y - 0.2; cloth.castShadow = true; cloth.receiveShadow = true; scene.add(cloth);
  const top = new THREE.Mesh(new THREE.CircleGeometry(1.78, 72), clothMat); top.rotation.x = -Math.PI / 2; top.position.y = TABLE_Y + 0.01; top.receiveShadow = true; scene.add(top);
  const scallop = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.05, 8, 96), S.vinyl('#ff4d7a')); scallop.rotation.x = Math.PI / 2; scallop.position.y = TABLE_Y - 0.41; scene.add(scallop);
  const tleg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, TABLE_Y - 0.4, 20), S.vinyl('#a46bff')); tleg.position.y = (TABLE_Y - 0.4) / 2; tleg.castShadow = true; scene.add(tleg);
  // the bomb's cushion in the middle
  const cushion = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.1, 14, 32), S.vinyl('#ff4d7a')); cushion.rotation.x = Math.PI / 2; cushion.position.y = TABLE_Y + 0.08; cushion.castShadow = true; scene.add(cushion);
  // cupcakes with candles and party cups around the edge
  const flames = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc04a').multiplyScalar(2), toneMapped: false });
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) / 6) * Math.PI * 2 + 0.2, r = 1.25, g = new THREE.Group();
    if (i % 2 === 0) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.16, 16), S.vinyl(['#4fb3ff', '#ffd23f', '#2fd39a'][i / 2])); cup.position.y = 0.08;
      const icing = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 12), S.vinyl(['#ffd1e6', '#fff3dc', '#e2d2ff'][i / 2])); icing.position.y = 0.2; icing.scale.y = 0.7;
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), S.vinyl('#ffffff')); candle.position.y = 0.36;
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), flameMat); fl.scale.y = 1.7; fl.position.y = 0.48;
      g.add(cup, icing, candle, fl); flames.push(fl);
    } else {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.26, 18, 1, true), new THREE.MeshPhysicalMaterial({ map: stripeTex(['#ff4d7a', '#a46bff', '#ff8a3d'][(i - 1) / 2], '#ffffff'), roughness: 0.4, clearcoat: 1, side: THREE.DoubleSide }));
      cup.position.y = 0.13; const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 6), S.vinyl('#ffd23f')); straw.position.set(0.03, 0.3, 0); straw.rotation.z = -0.25;
      g.add(cup, straw);
    }
    g.children.forEach((m) => { m.castShadow = true; });
    g.position.set(Math.sin(a) * r, TABLE_Y, Math.cos(a) * r); scene.add(g);
  }
  const poufMats = SEAT_COLORS.map((c) => S.vinyl(shade(c, 0.78), { rough: 0.45 }));
  const poufGeo = new THREE.CylinderGeometry(0.46, 0.5, POUF_H, 32);
  const poufTopGeo = new THREE.TorusGeometry(0.42, 0.07, 12, 36);
  // glowing seat rings: hot (holder), next (incoming), you (gold)
  const ringGeo = new THREE.RingGeometry(0.62, 0.78, 48);
  const ringMat = { hot: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3b3b').multiplyScalar(1.6), toneMapped: false, transparent: true }), next: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd23f').multiplyScalar(1.3), toneMapped: false, transparent: true, opacity: 0.8 }), you: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe066'), toneMapped: false, transparent: true, opacity: 0.85 }) };
  const youRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.9, 48), ringMat.you); youRing.rotation.x = -Math.PI / 2; youRing.position.copy(seatPos(0)).setY(0.025); youRing.visible = false; scene.add(youRing);
  const hotRing = new THREE.Mesh(ringGeo, ringMat.hot); hotRing.rotation.x = -Math.PI / 2; hotRing.visible = false; scene.add(hotRing);
  const nextRing = new THREE.Mesh(ringGeo, ringMat.next); nextRing.rotation.x = -Math.PI / 2; nextRing.visible = false; scene.add(nextRing);

  // ---------------------------------------------------------------- critters
  const host = opts.labelHost || canvas.parentElement;
  const white = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.1, clearcoat: 1 });
  const black = new THREE.MeshPhysicalMaterial({ color: '#141022', roughness: 0.12, clearcoat: 1 });
  const glint = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const mouthMat = new THREE.MeshPhysicalMaterial({ color: '#4a1530', roughness: 0.3, clearcoat: 1 });
  const shadesMat = new THREE.MeshPhysicalMaterial({ color: '#15121f', roughness: 0.05, clearcoat: 1, envMapIntensity: 1.4 });
  const bubbleMat = new THREE.MeshPhysicalMaterial({ color: '#bff6ff', roughness: 0.02, transmission: 0.6, thickness: 0.2, transparent: true, opacity: 0.35, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.3, depthWrite: false });
  const crownMat = new THREE.MeshPhysicalMaterial({ color: '#ffc531', metalness: 1, roughness: 0.22, clearcoat: 1, envMapIntensity: 1.4 });
  const critters = [];
  for (let i = 0; i < N; i++) {
    const p = seatPos(i);
    const pouf = new THREE.Mesh(poufGeo, poufMats[i]); pouf.position.set(p.x, POUF_H / 2, p.z); pouf.castShadow = pouf.receiveShadow = true; scene.add(pouf);
    const pt = new THREE.Mesh(poufTopGeo, poufMats[i]); pt.rotation.x = Math.PI / 2; pt.position.set(p.x, POUF_H, p.z); scene.add(pt);
    const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.6 });
    const body = new THREE.Mesh(critterGeo(VARIANT[i], SEAT_COLORS[i]), mat); body.castShadow = true;
    const inner = new THREE.Group(); inner.add(body);
    const armMat = new THREE.MeshPhysicalMaterial({ color: SEAT_COLORS[i], roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.6 });
    const handMat = new THREE.MeshPhysicalMaterial({ color: '#fff3dc', roughness: 0.34, clearcoat: 1, envMapIntensity: 0.6 });
    const arms = [-1, 1].map((s) => {
      const piv = new THREE.Group(); piv.position.set(s * 0.37, 0.62, 0.04);
      const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.36, 6, 12), armMat); a.position.y = -0.22; a.castShadow = true;
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), handMat); h.position.y = -0.46; h.castShadow = true;
      piv.add(a, h); inner.add(piv); return piv;
    });
    const eyes = [-1, 1].map((s) => {
      const g = new THREE.Group(); g.position.set(s * 0.14, 0.96, 0.31);
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 12), white); e.scale.z = 0.6;
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), black); pu.position.z = 0.045;
      const gl = new THREE.Mesh(new THREE.SphereGeometry(0.017, 6, 4), glint); gl.position.set(0.02, 0.025, 0.07);
      g.add(e, pu, gl); inner.add(g); return { g, pu };
    });
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 16, Math.PI), mouthMat); smile.position.set(0, 0.74, 0.39); smile.rotation.z = Math.PI; smile.rotation.x = -0.25; inner.add(smile);
    const oh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), mouthMat); oh.position.set(0, 0.71, 0.37); oh.scale.set(0.9, 1.25, 0.5); oh.visible = false; inner.add(oh);
    const shades = new THREE.Group();
    for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 20), shadesMat); l.rotation.x = Math.PI / 2; l.position.set(s * 0.14, 0, 0); shades.add(l); }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.025), shadesMat); shades.add(bridge);
    shades.position.set(0, 0.97, 0.37); shades.visible = false; inner.add(shades);
    // party hat (bots) or gold crown (you)
    const hat = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 26), new THREE.MeshPhysicalMaterial({ map: stripeTex(HAT_COLORS[i], '#ffffff'), roughness: 0.35, clearcoat: 1 })); cone.position.y = 0.21; cone.castShadow = true;
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), S.vinyl('#ffffff')); pom.position.y = 0.44;
    hat.add(cone, pom);
    const hatBase = new THREE.Vector3(VARIANT[i] === 'bunny' ? 0 : 0.05, VARIANT[i] === 'bunny' ? 1.18 : 1.16, -0.02);
    hat.position.copy(hatBase); hat.rotation.z = VARIANT[i] === 'bunny' ? 0 : -0.25; inner.add(hat);
    const crown = new THREE.Group();
    { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.12, 24, 1, true), crownMat); band.material.side = THREE.DoubleSide; crown.add(band); for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 8), crownMat); sp.position.set(Math.sin(a) * 0.16, 0.12, Math.cos(a) * 0.16); crown.add(sp); const gem = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3b6b' })); gem.position.set(Math.sin(a) * 0.17, 0.0, Math.cos(a) * 0.17); crown.add(gem); } }
    crown.position.set(0, 1.2, 0); crown.rotation.z = 0.12; crown.visible = false; inner.add(crown);
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.95, 32, 24), bubbleMat); bubble.position.y = 0.75; bubble.visible = false; bubble.renderOrder = 5;
    const root = new THREE.Group(); root.add(inner, bubble);
    root.position.set(p.x, POUF_H, p.z);
    const face = seatAngle(i) + Math.PI; root.rotation.y = face;
    scene.add(root);
    const tag = document.createElement('div'); tag.className = 'plabel ptag'; tag.innerHTML = '<b></b><small></small>'; host.appendChild(tag);
    critters.push({ i, root, inner, body, mat, armMat, arms, eyes, smile, oh, shades, hat, hatBase, crown, bubble, tag, face, yaw: 0, hold: 0, squash: 0, sv: 0, soot: 0, safe: false, hatVel: null, blink: 1 + R() * 3, knock: 0, cheer: 0, ph: R() * 6, you: false });
  }
  const hand = (c) => c.root.localToWorld(new THREE.Vector3(0, 1.72, 0.1));

  // ---------------------------------------------------------------- the bomb
  const bombRoot = new THREE.Group(); bombRoot.scale.setScalar(1.3); scene.add(bombRoot);
  const bombSpin = new THREE.Group(); bombRoot.add(bombSpin);
  const bombSq = new THREE.Group(); bombSpin.add(bombSq);
  const bombMat = new THREE.MeshPhysicalMaterial({ color: '#1c1a2a', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.3, emissive: '#ff2a1a', emissiveIntensity: 0 });
  const bomb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 40, 28), bombMat); bomb.castShadow = true; bombSq.add(bomb);
  const capMat = new THREE.MeshPhysicalMaterial({ color: '#8f8aa8', metalness: 0.9, roughness: 0.3, clearcoat: 1 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 20), capMat); cap.position.y = 0.3; bombSq.add(cap);
  const capRim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 20), capMat); capRim.rotation.x = Math.PI / 2; capRim.position.y = 0.35; bombSq.add(capRim);
  // a white shine stripe so it reads glossy even on dark backgrounds
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 })); shine.scale.set(1.5, 0.7, 0.4); shine.position.set(-0.13, 0.15, 0.22); shine.rotation.z = 0.7; bombSq.add(shine);
  const fuseCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.33, 0), new THREE.Vector3(0.02, 0.45, 0.02), new THREE.Vector3(0.1, 0.56, 0.01), new THREE.Vector3(0.2, 0.6, -0.03), new THREE.Vector3(0.28, 0.55, -0.06), new THREE.Vector3(0.31, 0.47, -0.08)]);
  const FSEG = 48, FRAD = 8;
  const fuseGeo = new THREE.TubeGeometry(fuseCurve, FSEG, 0.028, FRAD, false);
  const fuse = new THREE.Mesh(fuseGeo, new THREE.MeshPhysicalMaterial({ map: stripeTex('#e9c27a', '#b9864a'), roughness: 0.7 })); fuse.castShadow = true; bombSq.add(fuse);
  const glow = radialTex();
  const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffcf5a', blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  spark.scale.setScalar(0.4); bombSq.add(spark);
  const sparkCore = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2b0').multiplyScalar(3), toneMapped: false })); bombSq.add(sparkCore);
  const sparkLight = new THREE.PointLight('#ff9a3a', 0, 4, 1.6); bombRoot.add(sparkLight);
  // spark particles (world space)
  const SPK = 70, spk = [];
  const spkGeo = new THREE.SphereGeometry(0.022, 6, 4);
  const spkMats = ['#fff2a0', '#ffc94a', '#ff8a3a'].map((c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2), toneMapped: false, transparent: true }));
  for (let i = 0; i < SPK; i++) { const m = new THREE.Mesh(spkGeo, spkMats[i % 3]); m.visible = false; scene.add(m); spk.push({ m, v: new THREE.Vector3(), life: 0 }); }
  let spkI = 0, spkAcc = 0;

  let lit = false, fuseFrac = 1, heat = 0, route = [], rt = 0, bombSquash = 0, bombSv = 0, lastHold = -2, bombHidden = false, exploding = false;
  const restPos = new THREE.Vector3(0, TABLE_Y + 0.45, 0);
  bombRoot.position.copy(restPos);
  function setFuse(f) {
    fuseFrac = Math.max(0.04, Math.min(1, f));
    const segs = Math.max(1, Math.ceil(fuseFrac * FSEG));
    fuseGeo.setDrawRange(0, segs * FRAD * 6);
    const tip = fuseCurve.getPointAt(Math.min(1, segs / FSEG));
    spark.position.copy(tip); sparkCore.position.copy(tip);
  }
  setFuse(1);

  // ---------------------------------------------------------------- explosion pieces
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#fff3c0', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false })); scene.add(flash);
  const fireMats = ['#fff3a0', '#ffb030', '#ff6a2a'].map((c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.8), toneMapped: false, transparent: true }));
  const fireGeo = new THREE.IcosahedronGeometry(0.5, 2);
  const fires = Array.from({ length: 9 }, (_, i) => { const m = new THREE.Mesh(fireGeo, fireMats[i % 3].clone()); m.visible = false; scene.add(m); return { m, v: new THREE.Vector3(), life: 0, max: 1 }; });
  const smokeMat = new THREE.MeshStandardMaterial({ color: '#6a6378', roughness: 1, transparent: true, envMapIntensity: 0.25, depthWrite: false });
  const smokes = Array.from({ length: 26 }, () => { const m = new THREE.Mesh(fireGeo, smokeMat.clone()); m.visible = false; m.castShadow = false; scene.add(m); return { m, v: new THREE.Vector3(), life: 0, max: 1, s: 1 }; });
  const shock = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff0b0').multiplyScalar(1.5), toneMapped: false, transparent: true, side: THREE.DoubleSide, depthWrite: false })); shock.rotation.x = -Math.PI / 2; shock.visible = false; scene.add(shock);
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(20,16,26,.9)'); gr.addColorStop(0.6, 'rgba(30,24,36,.55)'); gr.addColorStop(1, 'rgba(30,24,36,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }), transparent: true, depthWrite: false, opacity: 0 }));
  scorch.rotation.x = -Math.PI / 2; scorch.position.y = TABLE_Y + 0.02; scene.add(scorch);
  // confetti: instanced little rectangles
  const CN = 320;
  const conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.12), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0.12 }), CN);
  conf.instanceMatrix.setUsage(THREE.DynamicDrawUsage); conf.frustumCulled = false; conf.castShadow = false;
  const confCols = ['#ff4d7a', '#ffd23f', '#4fb3ff', '#2fd39a', '#a46bff', '#ff8a3d', '#ffffff', '#ff6fd8'].map((c) => new THREE.Color(c));
  const cps = Array.from({ length: CN }, (_, i) => { conf.setColorAt(i, confCols[i % confCols.length]); return { p: new THREE.Vector3(0, -5, 0), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), on: false, rest: false }; });
  scene.add(conf);
  const dummy = new THREE.Object3D();
  function confettiBurst(at, n, power) {
    let c = 0;
    for (const q of cps) {
      if (c >= n) break; if (q.on && !q.rest) continue; c++;
      const a = Math.random() * Math.PI * 2, up = 0.4 + Math.random();
      q.p.copy(at); q.v.set(Math.cos(a) * power * (0.3 + Math.random()), up * power * 1.3, Math.sin(a) * power * (0.3 + Math.random()));
      q.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); q.w.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
      q.on = true; q.rest = false;
    }
  }
  function clearConfetti() { for (const q of cps) { q.on = false; q.p.set(0, -5, 0); } }

  // ---------------------------------------------------------------- camera
  let shake = 0, intro = reduce ? 0 : 1, focus = 0;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  function camWant() {
    const a = camera.aspect;
    if (a < 0.8) return [new THREE.Vector3(0, 9.6, 9.6), new THREE.Vector3(0, 0.75, 0.15)];
    if (a < 1.15) return [new THREE.Vector3(0, 7.9, 9.6), new THREE.Vector3(0, 1.45, 0.5)];
    return [new THREE.Vector3(0, 6.2, 9.6), new THREE.Vector3(0, 1.0, 0.1)];
  }
  { const [p, l] = camWant(); camPos.copy(p); camLook.copy(l); }

  // ---------------------------------------------------------------- frame
  let holder = -1, nextSeat = -1, youSeat = false;
  S.onFrame((dt, t) => {
    // bomb placement from the route
    let held = -1;
    if (!exploding) {
      if (!lit) {
        bombRoot.position.lerp(restPos, 1 - Math.exp(-dt * 8)); bombSpin.rotation.set(0, t * 0.4, 0);
        holder = -1; nextSeat = -1;
      } else {
        let i = -1; for (let k = route.length - 1; k >= 0; k--) if (rt >= route[k].t0) { i = k; break; }
        if (i >= 0 && rt < route[i].t1) {
          held = route[i].seat; nextSeat = route[i + 1] ? route[i + 1].seat : -1;
          const c = critters[held]; const hp = hand(c);
          const jig = c.safe ? 0 : Math.abs(Math.sin(t * 15 + c.ph)) * 0.09;
          bombRoot.position.copy(hp).y += jig;
          bombSpin.rotation.y += dt * 0.6; bombSpin.rotation.x *= 0.85; bombSpin.rotation.z *= 0.85;
          if (lastHold !== i) { lastHold = i; bombSquash = -0.3; c.squash = -0.2; opts.onCatch?.(held); }
        } else {
          const from = i < 0 ? restPos.clone() : hand(critters[route[i].seat]);
          const to = route[i + 1] ? hand(critters[route[i + 1].seat]) : restPos;
          const t0 = i < 0 ? 0 : route[i].t1, k = Math.max(0, Math.min(1, (rt - t0) / FLIGHT));
          nextSeat = route[i + 1] ? route[i + 1].seat : -1;
          const d = from.distanceTo(to), h = 0.9 + d * 0.32;
          bombRoot.position.lerpVectors(from, to, k).y += Math.sin(k * Math.PI) * h;
          bombSpin.rotation.x += dt * 9; bombSpin.rotation.z += dt * 4;
          if (lastHold !== -1 - i) { lastHold = -1 - i; opts.onThrow?.(nextSeat); }
        }
      }
    }
    holder = held;
    bombSv += (-bombSquash * 220 - bombSv * 14) * dt; bombSquash += bombSv * dt;
    const bs = 1 + bombSquash; bombSq.scale.set(1 / Math.sqrt(Math.max(0.3, bs)), bs, 1 / Math.sqrt(Math.max(0.3, bs)));
    // fuse fizz
    const pulse = 0.5 + 0.5 * Math.sin(t * (5 + heat * 18));
    bombMat.emissiveIntensity = lit ? (0.04 + heat * 0.4) * pulse : 0;
    spark.visible = sparkCore.visible = lit && !bombHidden;
    sparkLight.intensity = lit && !bombHidden ? 2.2 + Math.random() * 1.6 : 0;
    spark.scale.setScalar(0.32 + Math.random() * 0.22 + heat * 0.15);
    sparkLight.position.copy(spark.position);
    if (lit && !bombHidden && !reduce) {
      spkAcc += dt * (55 + heat * 60);
      const tipW = spark.getWorldPosition(tmp2);
      while (spkAcc > 1) { spkAcc--; const q = spk[spkI++ % SPK]; q.m.visible = true; q.m.position.copy(tipW); q.v.set((Math.random() - 0.5) * 2.4, 0.6 + Math.random() * 1.8, (Math.random() - 0.5) * 2.4); q.life = 0.25 + Math.random() * 0.3; }
    }
    for (const q of spk) { if (!q.m.visible) continue; q.life -= dt; if (q.life <= 0) { q.m.visible = false; continue; } q.v.y -= 6 * dt; q.m.position.addScaledVector(q.v, dt); q.m.scale.setScalar(Math.max(0.2, q.life * 3)); }
    // seat rings
    hotRing.visible = holder >= 0 && !exploding; if (hotRing.visible) { hotRing.position.copy(seatPos(holder)).setY(0.03); hotRing.scale.setScalar(1 + 0.08 * Math.sin(t * 14)); }
    nextRing.visible = lit && holder < 0 && nextSeat >= 0 && !exploding; if (nextRing.visible) nextRing.position.copy(seatPos(nextSeat)).setY(0.028);
    youRing.visible = youSeat; youRing.material.opacity = 0.55 + 0.3 * Math.sin(t * 3);
    // critters
    const bombW = bombRoot.position;
    for (const c of critters) {
      const holding = c.i === holder;
      c.hold += ((holding ? 1 : 0) - c.hold) * (1 - Math.exp(-dt * 16));
      c.sv += (-c.squash * 170 - c.sv * 12) * dt; c.squash += c.sv * dt;
      const s = 1 + c.squash + Math.sin(t * 2 + c.ph) * 0.015;
      c.inner.scale.set(1 / Math.sqrt(Math.max(0.4, s)), s, 1 / Math.sqrt(Math.max(0.4, s)));
      // look at the bomb (turn the body a bit toward it)
      let want = 0;
      if (lit || exploding) { tmp.copy(bombW).sub(c.root.position); const ang = Math.atan2(tmp.x, tmp.z) - c.face; want = Math.atan2(Math.sin(ang), Math.cos(ang)); want = Math.max(-0.9, Math.min(0.9, want)) * (holding ? 0 : 0.8); }
      c.yaw += (want - c.yaw) * (1 - Math.exp(-dt * 7));
      const hop = holding && !c.safe ? Math.abs(Math.sin(t * 15 + c.ph)) * 0.07 : 0;
      const ch = c.cheer > 0 ? Math.abs(Math.sin(c.cheer * 9)) * 0.35 : 0; if (c.cheer > 0) c.cheer -= dt;
      c.knock = Math.max(0, c.knock - dt * 0.35);
      c.inner.rotation.set(-c.knock * 0.5 + (holding ? Math.sin(t * 22) * 0.04 : 0), c.yaw, holding && !c.safe ? Math.sin(t * 19 + c.ph) * 0.07 : Math.sin(t * 1.3 + c.ph) * 0.03);
      c.inner.position.y = hop + ch;
      // arms: rest down and forward, up over the head while holding, wave when cheering
      const up = Math.max(c.hold, c.cheer > 0 ? 1 : 0);
      c.arms.forEach((a, k) => { const sgn = k ? 1 : -1; a.rotation.z = sgn * (0.35 + up * 2.45 + (c.cheer > 0 ? Math.sin(c.cheer * 14) * 0.25 : 0)); a.rotation.x = -0.55 * (1 - up) + up * 0.15; });
      // face
      c.blink -= dt; const bl = c.blink < 0.12 && c.blink > 0 ? 0.12 : 1; if (c.blink < 0) c.blink = 1.5 + Math.random() * 3;
      const wide = 1 + c.hold * 0.35;
      for (const e of c.eyes) { e.g.scale.set(wide, wide * bl, wide); e.pu.scale.setScalar(1 - c.hold * 0.35); }
      const scared = (holding && !c.safe) || c.soot > 0.5;
      c.smile.visible = !scared; c.oh.visible = scared;
      if (c.soot > 0) { const k = 1 - c.soot * 0.8; c.mat.color.setRGB(k, k * 0.96, k); c.armMat.color.copy(new THREE.Color(SEAT_COLORS[c.i]).multiplyScalar(k)); }
      // hat flying off
      if (c.hatVel) { c.hatVel.y -= 9 * dt; c.hat.position.addScaledVector(c.hatVel, dt); c.hat.rotation.x += dt * 8; c.hat.rotation.z += dt * 5; if (c.hat.position.y < -POUF_H + 0.05) { c.hat.position.y = -POUF_H + 0.05; c.hatVel = null; c.hat.rotation.set(Math.PI / 2, 0, 0.4); } }
      c.bubble.scale.setScalar(1 + Math.sin(t * 3 + c.ph) * 0.02);
      // name tag
      const above = c.root.localToWorld(tmp.set(0, holding ? 2.35 : 1.95, 0));
      const sp = S.toScreen(above);
      c.tag.style.transform = `translate(${sp.x.toFixed(1)}px,${sp.y.toFixed(1)}px) translate(-50%,-100%)`;
      c.tag.classList.toggle('hot', holding && !c.safe);
    }
    // explosion bits
    for (const f of fires) { if (!f.m.visible) continue; f.life += dt; const k = f.life / f.max; if (k >= 1) { f.m.visible = false; continue; } f.m.position.addScaledVector(f.v, dt); f.v.multiplyScalar(1 - dt * 3); f.m.scale.setScalar((0.5 + ease.out(k) * 1.5) * f.s); f.m.material.opacity = k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6; }
    for (const f of smokes) { if (!f.m.visible) continue; f.life += dt; const k = f.life / f.max; if (k >= 1) { f.m.visible = false; continue; } f.m.position.addScaledVector(f.v, dt); f.v.multiplyScalar(1 - dt * 1.6); f.v.y += dt * 0.5; f.m.scale.setScalar((0.3 + ease.out(Math.min(1, k * 2.5)) * 0.75) * f.s * (1 - k * 0.35)); f.m.material.opacity = k < 0.6 ? 0.95 : 0.95 * (1 - (k - 0.6) / 0.4); }
    let any = false;
    for (let i = 0; i < CN; i++) {
      const q = cps[i]; if (!q.on) continue; any = true;
      if (!q.rest) {
        q.v.y -= 7 * dt; q.v.multiplyScalar(1 - dt * 1.4); q.p.addScaledVector(q.v, dt);
        q.r.x += q.w.x * dt; q.r.y += q.w.y * dt; q.r.z += q.w.z * dt;
        const floorY = Math.hypot(q.p.x, q.p.z) < 1.8 ? TABLE_Y + 0.02 : 0.02;
        if (q.p.y < floorY) { q.p.y = floorY; q.rest = true; q.r.x = -Math.PI / 2; q.r.y = 0; }
      }
      dummy.position.copy(q.p); dummy.rotation.copy(q.r); dummy.updateMatrix(); conf.setMatrixAt(i, dummy.matrix);
    }
    if (any) conf.instanceMatrix.needsUpdate = true;
    // decor
    for (const b of balloons) b.b.position.set(b.base.x + Math.sin(t * 0.8 + b.ph) * 0.06, b.base.y + Math.sin(t * 1.1 + b.ph) * 0.08, b.base.z);
    for (const f of flames) f.scale.set(1 + Math.random() * 0.2, 1.6 + Math.random() * 0.5, 1);
    // camera: gentle push toward the holder, a bigger push when it's you
    const [wp, wl] = camWant();
    const fwant = holder === 0 && youSeat ? 1 : 0; focus += (fwant - focus) * (1 - Math.exp(-dt * 4));
    if (holder >= 0) wl.lerp(critters[holder].root.position.clone().setY(1.1), 0.12);
    wp.lerp(new THREE.Vector3(0, 4.8, 7.4), focus * 0.35); wl.lerp(critters[0].root.position.clone().setY(1.4), focus * 0.35);
    if (intro > 0) { intro = Math.max(0, intro - dt / 2.2); const e = ease.inOut(1 - intro); camPos.lerpVectors(new THREE.Vector3(5, 3.2, 6), wp, e); camLook.copy(wl); }
    else { camPos.lerp(wp, 1 - Math.exp(-dt * 3)); camLook.lerp(wl, 1 - Math.exp(-dt * 3)); }
    camera.position.copy(camPos);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; camera.position.z += (Math.random() - 0.5) * shake * 0.5; shake = Math.max(0, shake - dt * 1.6); }
    camera.lookAt(camLook);
  });

  function spawnFire(at, n, pow) { let c = 0; for (const f of fires) { if (c >= n) break; c++; f.m.visible = true; f.m.position.copy(at); f.v.set((Math.random() - 0.5) * pow, Math.random() * pow * 0.8, (Math.random() - 0.5) * pow); f.life = 0; f.max = 0.4 + Math.random() * 0.35; f.s = 0.7 + Math.random() * 0.8; } }
  function spawnSmoke(at, n, pow, dark) { let c = 0; for (const f of smokes) { if (f.m.visible) continue; if (c >= n) break; c++; f.m.visible = true; f.m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.3, (Math.random() - 0.5) * 0.4)); const a = Math.random() * Math.PI * 2; f.v.set(Math.cos(a) * pow * (0.4 + Math.random()), 0.6 + Math.random() * pow * 0.6, Math.sin(a) * pow * (0.4 + Math.random())); f.life = 0; f.max = 1.1 + Math.random() * 0.8; f.s = 0.45 + Math.random() * 0.5; f.m.material.color.set(dark ? ['#3a3446', '#4f485e', '#2c2736', '#625a72'][c % 4] : ['#ffffff', '#f2eefb', '#e6e0f5'][c % 3]); } }

  return {
    S,
    seats(list) {
      youSeat = !!list[0]?.you;
      list.forEach((p, i) => {
        const c = critters[i]; c.you = !!p.you;
        c.tag.querySelector('b').textContent = p.you ? 'YOU' : p.name;
        c.tag.classList.toggle('you', !!p.you);
        c.crown.visible = !!p.you; c.hat.visible = !p.you;
      });
    },
    ready() {
      lit = false; exploding = false; bombHidden = false; bombRoot.visible = true; route = []; rt = 0; lastHold = -2; heat = 0; setFuse(1);
      scorch.material.opacity = 0; clearConfetti(); for (const f of fires) f.m.visible = false; for (const f of smokes) f.m.visible = false;
      for (const c of critters) { c.soot = 0; c.mat.color.set('#ffffff'); c.armMat.color.set(SEAT_COLORS[c.i]); c.safe = false; c.bubble.visible = false; c.shades.visible = false; c.hatVel = null; c.hat.position.copy(c.hatBase); c.hat.rotation.set(0, 0, VARIANT[c.i] === 'bunny' ? 0 : -0.25); c.knock = 0; c.cheer = 0; c.tag.classList.remove('safe', 'bad'); }
    },
    light() { lit = true; bombSquash = -0.25; },
    setRoute(r) { route = r; },
    setTime(ms, m) { rt = ms; heat = Math.min(1, Math.log(m) / Math.log(25)); setFuse(0.12 + 0.88 * Math.pow(m, -0.5)); },
    get holder() { return holder; },
    get next() { return nextSeat; },
    tag(seat, text, cls) {
      const c = critters[seat]; const sm = c.tag.querySelector('small'); sm.textContent = text || ''; sm.hidden = !text;
      c.tag.classList.toggle('safe', cls === 'safe'); c.tag.classList.toggle('bad', cls === 'bad');
    },
    cashed(seat, m) {
      const c = critters[seat]; c.safe = true; c.bubble.visible = true; c.shades.visible = true; c.cheer = 1.1; c.squash = 0.25;
      c.bubble.scale.setScalar(0.2); tween(380, (k) => { c.bubble.scale.setScalar(0.2 + ease.back(k) * 0.8); });
      confettiBurst(c.root.position.clone().setY(1.8), 26, 2.2);
    },
    async explode() {
      exploding = true; const at = bombRoot.position.clone();
      bombHidden = true; bombRoot.visible = false;
      shake = reduce ? 0 : 0.75;
      flash.position.copy(at); flash.material.opacity = 1; flash.scale.setScalar(1);
      tween(520, (k) => { flash.scale.setScalar(1 + ease.out(k) * 9); flash.material.opacity = 1 - k; });
      shock.visible = true; shock.position.set(at.x, Math.max(TABLE_Y + 0.05, Math.min(at.y, TABLE_Y + 0.05)), at.z); shock.material.opacity = 1;
      tween(600, (k) => { shock.scale.setScalar(0.3 + ease.out(k) * 5.5); shock.material.opacity = 1 - k; }).then(() => { shock.visible = false; });
      spawnFire(at, 9, 3.5); spawnSmoke(at, 18, 2.4, true);
      confettiBurst(at, 240, 5.5);
      if (Math.hypot(at.x, at.z) < 1.7) { scorch.position.set(at.x, TABLE_Y + 0.02, at.z); scorch.material.opacity = 0.9; }
      for (const c of critters) {
        if (c.safe) { c.squash = 0.15; continue; }
        const d = c.root.position.distanceTo(at);
        setTimeout(() => {
          c.soot = 1; c.knock = 1; c.squash = -0.3;
          c.hatVel = new THREE.Vector3((Math.random() - 0.5) * 1.5, 4 + Math.random() * 2, -1.5 - Math.random());
          spawnSmoke(c.root.position.clone().setY(POUF_H + 1.3), 1, 0.3, true);
        }, reduce ? 0 : 40 + d * 45);
      }
      await wait(1500);
      for (const c of critters) if (!c.safe) spawnSmoke(c.root.position.clone().setY(POUF_H + 1.4), 1, 0.15, false);
      await wait(600);
    },
    async burnOut() {
      exploding = true; const at = bombRoot.position.clone();
      spawnSmoke(at.clone().add(new THREE.Vector3(0.3, 0.5, 0)), 4, 0.4, false);
      await wait(350);
      bombHidden = true; bombRoot.visible = false; shake = reduce ? 0 : 0.2;
      confettiBurst(at, 300, 6.5);
      flash.position.copy(at); tween(500, (k) => { flash.scale.setScalar(1 + ease.out(k) * 5); flash.material.opacity = 0.8 * (1 - k); });
      for (const c of critters) if (!c.safe) { c.cheer = 2.2; c.squash = 0.2; }
      await wait(1800);
    },
  };
}
