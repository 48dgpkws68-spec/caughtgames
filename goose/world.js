// GOOSE 63 world: a candy-coloured 63-square spiral board on a toy table, the vinyl goose pawn, real rolling dice,
// a prop on every special square and the golden goose statue in the middle.
//   const W = createWorld(canvas, { onHover })
//   W.preview(endsSafe, endsTrap)   ring the squares a throw can end on (Map square -> share), or preview(null)
//   await W.roll(dice)              throw and land the dice on these faces
//   await W.play(moves)             walk the pawn along an engine walk() script
//   await W.trap(kind)              inn | well | prison | skull animation     await W.finish()   await W.reset()
import { THREE, createStage, canvasTex, radialTex, tween, wait, ease, reduce, mulberry } from '../lib/stage.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeGoose, makeDie, faceUp } from './models.js';

const CELL = 1.52;
const TILE_COLS = ['#ff6b8b', '#ffc531', '#3fd6a6', '#55b6ff', '#b58cff', '#ff9a4d'];
const TRAP_NAME = { 19: 'INN', 31: 'WELL', 52: 'PRISON', 58: 'SKULL' };

// square spiral on a 9x9 grid, from the bottom-left corner inward
function spiral() {
  const cells = []; let minX = 0, maxX = 8, minY = 0, maxY = 8;
  while (cells.length < 81) {
    for (let x = minX; x <= maxX; x++) cells.push([x, minY]); minY++;
    for (let y = minY; y <= maxY; y++) cells.push([maxX, y]); maxX--;
    for (let x = maxX; x >= minX; x--) cells.push([x, maxY]); maxY--;
    for (let y = maxY; y >= minY; y--) cells.push([minX, y]); minX++;
  }
  return cells;
}

export function createWorld(canvas, opts = {}) {
  const S = createStage(canvas, {
    sky: '#7fcfff', exposure: 0.95, envIntensity: 0.32, hemi: 0.72, sun: 2.2, rim: 0.6, shadowSize: 11,
    bloom: [0.16, 0.4, 0.95],
    fov: (a) => (a < 0.8 ? 60 : a < 1.2 ? 52 : 44),
  });
  const { scene, camera } = S;
  const cells = spiral();
  const posOf = (k) => {
    if (k <= 0) return new THREE.Vector3(-5 * CELL, 0, 4 * CELL);
    const [i, j] = cells[k - 1];
    return new THREE.Vector3((i - 4) * CELL, 0, (4 - j) * CELL);
  };
  const TOP = 0.42;   // height of a tile top

  // ---------------------------------------------------------------- table, board, background
  const R = mulberry(63);
  const floorTex = canvasTex(512, 512, (g, w) => {
    g.fillStyle = '#ff8fc4'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 90; i++) { g.fillStyle = ['#ff6fb0', '#7fd8ff', '#ffd84a', '#a98bff'][i % 4]; g.beginPath(); g.arc(R() * w, R() * w, 6 + R() * 14, 0, 7); g.fill(); }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(10, 10);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.9; floor.receiveShadow = true; scene.add(floor);
  const base = new THREE.Mesh(new RoundedBoxGeometry(9 * CELL + 1.3, 0.5, 9 * CELL + 1.3, 5, 0.22), S.vinyl('#6b4cff', { rough: 0.3 }));
  base.position.y = -0.05; base.receiveShadow = true; base.castShadow = true; scene.add(base);
  const inlay = new THREE.Mesh(new RoundedBoxGeometry(9 * CELL + 0.5, 0.1, 9 * CELL + 0.5, 4, 0.05), new THREE.MeshStandardMaterial({ color: '#ffe3a3', roughness: 0.7 }));
  inlay.position.y = 0.24; inlay.receiveShadow = true; scene.add(inlay);
  const rimMat = new THREE.MeshPhysicalMaterial({ color: '#ffcb3c', metalness: 1, roughness: 0.25, envMapIntensity: 1 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 4), rimMat);   // replaced by 4 bars below
  for (const [x, z, w, d] of [[0, 4.5 * CELL + 0.45, 9 * CELL + 1, 0.1], [0, -4.5 * CELL - 0.45, 9 * CELL + 1, 0.1], [4.5 * CELL + 0.45, 0, 0.1, 9 * CELL + 1], [-4.5 * CELL - 0.45, 0, 0.1, 9 * CELL + 1]]) {
    const b = new THREE.Mesh(new RoundedBoxGeometry(w, 0.1, d, 2, 0.04), rimMat); b.position.set(x, 0.24, z); scene.add(b);
  }
  void rim;

  // ---------------------------------------------------------------- tiles
  const tileGeo = new RoundedBoxGeometry(CELL - 0.1, 0.22, CELL - 0.1, 3, 0.09);
  const topGeo = new THREE.PlaneGeometry(CELL - 0.24, CELL - 0.24);
  const ringGeo = new THREE.RingGeometry(0.5, 0.66, 40);
  const tiles = [];
  const GEESE = new Set([5, 9, 14, 18, 23, 27, 32, 36, 41, 45, 50, 54, 59]);
  function tileFace(k, col) {
    return canvasTex(256, 256, (g, w) => {
      g.clearRect(0, 0, w, w);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '96px "Lilita One", "Arial Rounded MT Bold", sans-serif';
      g.lineWidth = 14; g.strokeStyle = '#1d1640'; g.fillStyle = '#fff';
      const ty = GEESE.has(k) || TRAP_NAME[k] || k === 6 || k === 42 || k === 63 ? 70 : 128;
      g.strokeText(String(k), w / 2, ty); g.fillText(String(k), w / 2, ty);
      if (TRAP_NAME[k] || k === 6 || k === 42) {
        const t = TRAP_NAME[k] || (k === 6 ? 'BRIDGE' : 'MAZE');
        g.font = '44px "Lilita One", sans-serif'; g.lineWidth = 9; g.strokeText(t, w / 2, 200); g.fillStyle = TRAP_NAME[k] ? '#ffe36b' : '#c9fff0'; g.fillText(t, w / 2, 200);
      }
      void col;
    });
  }
  for (let k = 0; k <= 63; k++) {
    const p = posOf(k);
    let col = k === 0 ? '#ffffff' : TILE_COLS[k % TILE_COLS.length];
    if (GEESE.has(k)) col = '#fff6dc';
    if (TRAP_NAME[k]) col = k === 58 ? '#3b2a63' : '#d63a5a';
    if (k === 63) col = '#ffc93c';
    const mat = k === 63 ? new THREE.MeshPhysicalMaterial({ color: col, metalness: 0.9, roughness: 0.25, envMapIntensity: 1.2, emissive: '#ff9d00', emissiveIntensity: 0.15 }) : S.vinyl(col, { rough: 0.3, env: 0.5 });
    const tile = new THREE.Mesh(tileGeo, mat);
    tile.position.set(p.x, 0.31, p.z); tile.castShadow = true; tile.receiveShadow = true; tile.userData.k = k;
    scene.add(tile);
    if (k > 0) {
      const top = new THREE.Mesh(topGeo, new THREE.MeshBasicMaterial({ map: tileFace(k, col), transparent: true, depthWrite: false, toneMapped: false }));
      top.rotation.x = -Math.PI / 2; top.position.set(p.x, TOP + 0.003, p.z); scene.add(top);
    } else {
      const top = new THREE.Mesh(new THREE.PlaneGeometry(CELL - 0.2, (CELL - 0.2) * 0.5), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, map: canvasTex(256, 128, (g, w, h) => { g.font = '64px "Lilita One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = '#1d1640'; g.fillStyle = '#ffc531'; g.strokeText('START', w / 2, h / 2); g.fillText('START', w / 2, h / 2); }) }));
      top.rotation.x = -Math.PI / 2; top.position.set(p.x, TOP + 0.003, p.z + 0.42); scene.add(top);
    }
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, TOP + 0.01, p.z); scene.add(ring);
    tiles[k] = { tile, mat, ring, want: 0, col: '#fff', pulse: 0 };
  }

  // ---------------------------------------------------------------- props on special squares
  const props = {};
  const decorGeese = [];
  for (const k of GEESE) {   // a little white goose sitting on every goose square
    const g = makeGoose(S, { scarf: TILE_COLS[k % TILE_COLS.length] });
    const p = posOf(k); g.root.position.set(p.x + 0.34, TOP, p.z - 0.3); g.root.scale.setScalar(0.46); g.root.rotation.y = -0.5 + R() * 1.0;
    scene.add(g.root); decorGeese.push(g);
  }
  {   // bridge 6 -> 12: a red arch over the board
    const a = posOf(6), b = posOf(12), mid = a.clone().lerp(b, 0.5);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(a.x, TOP, a.z), new THREE.Vector3(mid.x, 3.2, mid.z), new THREE.Vector3(b.x, TOP, b.z));
    const arch = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.12, 10), S.vinyl('#ff4d6d'));
    arch.castShadow = true; scene.add(arch); props.bridge = curve;
    for (let i = 1; i < 10; i++) { const p = curve.getPoint(i / 10); const plank = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.06, 0.16, 2, 0.02), S.vinyl('#ffd36b')); plank.position.copy(p).add(new THREE.Vector3(0, 0.1, 0)); plank.lookAt(curve.getPoint(i / 10 + 0.01).add(new THREE.Vector3(0, 0.1, 0))); scene.add(plank); }
  }
  {   // inn 19: a cottage
    const p = posOf(19), g = new THREE.Group();
    const wall = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.6, 0.7, 3, 0.06), S.vinyl('#fff3d6')); wall.position.y = 0.3;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.66, 0.5, 4), S.vinyl('#ff4d6d')); roof.position.y = 0.85; roof.rotation.y = Math.PI / 4;
    const door = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.34, 0.04, 2, 0.04), S.vinyl('#8a4f2a')); door.position.set(0, 0.18, 0.36);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ color: '#ffe27a', toneMapped: false })); win.position.set(0.24, 0.38, 0.356);
    g.add(wall, roof, door, win); g.position.set(p.x - 0.2, TOP, p.z - 0.15); g.scale.setScalar(0.8); g.children.forEach((m) => { m.castShadow = true; });
    scene.add(g); props.inn = { g, win };
  }
  {   // well 31: stone well with a little roof
    const p = posOf(31), g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.34, 24, 1, true), S.vinyl('#a9b4c8', { rough: 0.6 })); ring.position.y = 0.17; ring.material.side = THREE.DoubleSide;
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), new THREE.MeshPhysicalMaterial({ color: '#2f8cff', roughness: 0.05, clearcoat: 1 })); water.rotation.x = -Math.PI / 2; water.position.y = 0.08;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.06, 10, 28), S.vinyl('#c9d2e3', { rough: 0.5 })); lip.rotation.x = Math.PI / 2; lip.position.y = 0.34;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.35, 4), S.vinyl('#3fd6a6')); roof.position.y = 1.0; roof.rotation.y = Math.PI / 4;
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8), S.vinyl('#8a4f2a')); p1.position.set(-0.4, 0.6, 0);
    const p2 = p1.clone(); p2.position.x = 0.4;
    g.add(ring, water, lip, roof, p1, p2); g.position.set(p.x, TOP, p.z); g.scale.setScalar(0.85); g.children.forEach((m) => { m.castShadow = true; });
    scene.add(g); props.well = g;
  }
  {   // maze 42: little hedge walls
    const p = posOf(42), g = new THREE.Group(), hedge = S.vinyl('#2fbf6a', { rough: 0.6 });
    for (const [x, z, w, d] of [[-0.42, 0, 0.1, 0.9], [0.42, 0, 0.1, 0.9], [0, -0.42, 0.9, 0.1], [-0.1, 0.42, 0.6, 0.1], [0.1, 0, 0.1, 0.5], [-0.16, -0.16, 0.4, 0.1]]) { const m = new THREE.Mesh(new RoundedBoxGeometry(w, 0.26, d, 2, 0.04), hedge); m.position.set(x, 0.13, z); m.castShadow = true; g.add(m); }
    g.position.set(p.x, TOP, p.z); scene.add(g);
  }
  {   // prison 52: barred cell (bars drop on a trapped pawn)
    const p = posOf(52), g = new THREE.Group(), bar = new THREE.MeshPhysicalMaterial({ color: '#8f99b3', metalness: 1, roughness: 0.3 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 8), bar); b.position.set(Math.cos(a) * 0.5, 0.55, Math.sin(a) * 0.5); b.castShadow = true; g.add(b); }
    const lidT = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.08, 24), S.vinyl('#5b6278')); lidT.position.y = 1.12; g.add(lidT);
    g.position.set(p.x, TOP + 3, p.z); g.visible = false; scene.add(g); props.prison = { g, rest: TOP + 3, at: p };
  }
  {   // skull 58
    const p = posOf(58), g = new THREE.Group(), bone = S.vinyl('#f4efe4', { rough: 0.45 }), hole = new THREE.MeshStandardMaterial({ color: '#2a1b40' });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), bone); head.position.y = 0.36; head.scale.set(1, 0.92, 0.95);
    const jaw = new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.16, 0.24, 2, 0.05), bone); jaw.position.set(0, 0.12, 0.08);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), hole); e.position.set(s * 0.11, 0.4, 0.25); e.scale.z = 0.5; g.add(e); }
    g.add(head, jaw); g.children.forEach((m) => { m.castShadow = true; }); g.position.set(p.x + 0.3, TOP, p.z - 0.3); g.scale.setScalar(0.85); g.rotation.y = -0.4;
    scene.add(g); props.skull = g;
  }
  // golden goose statue in the middle of the spiral, next to 63
  const golden = makeGoose(S, { gold: true, idle: true });
  const centre = new THREE.Vector3(0, TOP, 0);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 0.4, 40), S.vinyl('#ff4d7a'));
  plinth.position.set(0, TOP + 0.2, 0); plinth.castShadow = plinth.receiveShadow = true; scene.add(plinth);
  golden.root.position.set(0, TOP + 0.4, 0); golden.root.scale.setScalar(1.55); golden.root.rotation.y = 0.6; scene.add(golden.root);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: radialTex(), color: '#ffd24a', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(0, TOP + 0.42, 0); scene.add(glow);
  void centre;

  // ---------------------------------------------------------------- pawn and dice
  const pawn = makeGoose(S, { scarf: '#ff3d6e' });
  pawn.root.scale.setScalar(0.85);
  const p0 = posOf(0); pawn.root.position.set(p0.x, TOP, p0.z); pawn.root.rotation.y = Math.PI / 2;
  scene.add(pawn.root);
  const shadowBlob = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.6, 40), new THREE.MeshBasicMaterial({ color: '#ff2f6d', transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
  shadowBlob.rotation.x = -Math.PI / 2; scene.add(shadowBlob);
  const dice = [makeDie(S, RoundedBoxGeometry, '#ff3d6e'), makeDie(S, RoundedBoxGeometry, '#6b4cff')];
  dice.forEach((d) => { d.visible = false; d.scale.setScalar(1.45); scene.add(d); });

  // confetti and coins for wins, splash for the well
  const confGeo = new THREE.PlaneGeometry(0.12, 0.2);
  const confMats = TILE_COLS.map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  let parts = [];
  function burst(at, n = 90, kind = 'confetti') {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(confGeo, kind === 'splash' ? new THREE.MeshBasicMaterial({ color: '#55b6ff', transparent: true, opacity: 0.9 }) : confMats[i % confMats.length]);
      if (kind === 'splash') m.scale.setScalar(0.6);
      m.position.copy(at).add(new THREE.Vector3(0, 0.6, 0)); scene.add(m);
      const a = Math.random() * Math.PI * 2, s = kind === 'splash' ? 1 + Math.random() * 1.5 : 1.5 + Math.random() * 3.5;
      parts.push({ m, v: new THREE.Vector3(Math.cos(a) * s, (kind === 'splash' ? 3 : 5) + Math.random() * 4, Math.sin(a) * s), w: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9), life: 3 });
    }
  }

  // ---------------------------------------------------------------- camera
  const camPos = new THREE.Vector3(0, 22, 16), camLook = new THREE.Vector3(0, 0, 0);
  const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
  let shake = 0, focusBoard = 0.55, intro = reduce ? 0 : 1;
  S.onFrame((dt, t) => {
    const p = pawn.root.position, a = camera.aspect;
    wantLook.set(p.x * (1 - focusBoard), 0, p.z * (1 - focusBoard) + 0.6);
    const dist = a < 0.8 ? 1.32 : a < 1.2 ? 1.08 : 0.95;
    wantPos.set(wantLook.x * 0.85, 15.5 * dist, wantLook.z + 8.2 * dist);
    if (intro > 0) { intro = Math.max(0, intro - dt / 2.6); const e = ease.inOut(1 - intro); camPos.lerpVectors(new THREE.Vector3(-14, 18, 20), wantPos, e); camLook.lerpVectors(new THREE.Vector3(0, 0, 0), wantLook, e); }
    else { const f = 1 - Math.exp(-dt * 2.6); camPos.lerp(wantPos, f); camLook.lerp(wantLook, f); }
    camera.position.copy(camPos);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 1.5); }
    camera.lookAt(camLook);
    S.sun.position.set(p.x + 6, 14, p.z + 8); S.sun.target.position.set(p.x * 0.5, 0, p.z * 0.5);
    pawn.update(dt, t); golden.update(dt, t); for (const g of decorGeese) g.update(dt, t * 0.8 + g.root.position.x);
    golden.root.rotation.y = 0.6 + Math.sin(t * 0.6) * 0.35; glow.material.opacity = 0.45 + Math.sin(t * 2) * 0.12;
    shadowBlob.position.set(p.x, TOP + 0.012, p.z); shadowBlob.scale.setScalar(Math.max(0.3, 1 - Math.max(0, p.y - TOP) * 0.35) * (1 + Math.sin(t * 4) * 0.06));
    for (let k = 1; k <= 63; k++) {
      const T = tiles[k];
      const cur = T.ring.material.opacity, target = T.want ? 0.95 : 0;
      T.ring.material.opacity = cur + (target - cur) * (1 - Math.exp(-dt * 12));
      if (T.want) { T.ring.material.color.set(T.col); const s = 0.85 + T.want * 0.6 + Math.sin(t * 6 + k) * 0.04; T.ring.scale.setScalar(s); }
      if (T.pulse > 0) { T.pulse = Math.max(0, T.pulse - dt * 2); T.tile.position.y = 0.31 + Math.sin(T.pulse * Math.PI) * 0.12; }
    }
    if (parts.length) {
      parts = parts.filter((q) => { q.life -= dt; q.v.y -= 9.8 * dt; q.m.position.addScaledVector(q.v, dt); q.v.multiplyScalar(0.99); q.m.rotation.x += q.w.x * dt; q.m.rotation.y += q.w.y * dt; if (q.m.position.y < -0.85) { q.m.position.y = -0.85; q.v.set(0, 0, 0); } if (q.life <= 0) { scene.remove(q.m); return false; } return true; });
    }
  });

  // ---------------------------------------------------------------- picking: hover a tile for a tooltip-free highlight only
  const tileMeshes = tiles.map((t) => t.tile);
  canvas.addEventListener('pointermove', (ev) => { const h = S.pick(ev, tileMeshes); opts.onHover?.(h ? h.object.userData.k : -1); });

  // ---------------------------------------------------------------- animation helpers
  const facing = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
  async function hopTo(k, ms = 150, h = 0.45) {
    const from = pawn.root.position.clone(), to = posOf(k).setY(TOP);
    const yaw0 = pawn.root.rotation.y, yaw1 = facing(from, to);
    let dy = yaw1 - yaw0; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    pawn.bump(-0.12);
    await tween(ms, (k2) => { pawn.root.position.lerpVectors(from, to, k2); pawn.root.position.y = TOP + Math.sin(Math.PI * k2) * h; pawn.root.rotation.y = yaw0 + dy * Math.min(1, k2 * 2); });
    pawn.bump(-0.18); if (tiles[k]) tiles[k].pulse = 1; opts.onHop?.();
  }
  async function flyTo(k, ms = 700, h = 2.2) {
    const from = pawn.root.position.clone(), to = posOf(k).setY(TOP);
    pawn.flap(true); pawn.root.rotation.y = facing(from, to);
    await tween(ms, (k2) => { const e = ease.inOut(k2); pawn.root.position.lerpVectors(from, to, e); pawn.root.position.y = TOP + Math.sin(Math.PI * e) * h; });
    pawn.flap(false); pawn.bump(-0.25); tiles[k].pulse = 1;
  }

  return {
    S, posOf,
    setEvents(onEvent, onHop) { opts.onEvent = onEvent; opts.onHop = onHop; },
    preview(ends) {   // ends: Map square -> { share, trap }
      for (let k = 1; k <= 63; k++) tiles[k].want = 0;
      if (!ends) return;
      for (const [k, v] of ends) { tiles[k].want = Math.min(1, 0.25 + v.share * 2.2); tiles[k].col = v.trap ? '#ff2a4a' : '#21e07a'; }
    },
    async roll(vals) {
      const p = pawn.root.position;
      const n = vals.length;
      const toC = new THREE.Vector3(-p.x, 0, -p.z).normalize().multiplyScalar(p.lengthSq() > 1 ? 1.1 : 0);
      const landing = vals.map((_, i) => new THREE.Vector3(p.x + toC.x + (i - (n - 1) / 2) * 1.15, TOP + 0.45 + 0.6, p.z + toC.z + 1.0));
      const tasks = vals.map((v, i) => {
        const d = dice[i]; d.visible = true;
        const start = landing[i].clone().add(new THREE.Vector3(-3 + i, 3.5, 3.5));
        const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
        const q1 = faceUp(v, (Math.random() - 0.5) * 0.8);
        const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        return tween(950 + i * 120, (k) => {
          const e = ease.out(k);
          d.position.lerpVectors(start, landing[i], e);
          const bounce = Math.abs(Math.sin(e * Math.PI * 2.5)) * (1 - e) * 1.6;
          d.position.y = landing[i].y + bounce;
          const qs = q0.clone().multiply(new THREE.Quaternion().setFromAxisAngle(spin, (1 - e) * 14));
          d.quaternion.slerpQuaternions(qs, q1, Math.min(1, e * 1.25));
        });
      });
      await Promise.all(tasks);
      shake = 0.06;
      opts.onDice?.(vals);
    },
    hideDice() { dice.forEach((d) => { d.visible = false; }); },
    async play(moves) {
      for (const mv of moves) {
        if (mv.kind === 'walk') { for (const k of mv.path) await hopTo(k, 135, 0.42); }
        else if (mv.kind === 'goose') { opts.onEvent?.('goose'); pawn.flap(true); for (const k of mv.path) await hopTo(k, 95, 0.75); pawn.flap(false); }
        else if (mv.kind === 'bridge') { opts.onEvent?.('bridge'); const c = props.bridge; await tween(900, (k) => { const pt = c.getPoint(k); pawn.root.position.set(pt.x, pt.y + 0.08, pt.z); }); pawn.bump(-0.25); }
        else if (mv.kind === 'maze') { opts.onEvent?.('maze'); await tween(500, (k) => { pawn.inner.rotation.y = k * Math.PI * 4; }); pawn.inner.rotation.y = 0; await flyTo(mv.path[0], 800, 1.6); }
        else if (mv.kind === 'lucky') { opts.onEvent?.('lucky'); await flyTo(mv.path[0], 1100, 3.2); }
        await wait(60);
      }
    },
    async trap(kind) {
      shake = 0.3;
      const pp = pawn.root.position.clone();
      if (kind === 'inn') { const target = new THREE.Vector3(props.inn.g.position.x, TOP, props.inn.g.position.z + 0.3); await tween(600, (k) => { pawn.root.position.lerpVectors(pp, target, k); pawn.root.scale.setScalar(0.85 * (1 - k * 0.85)); }); props.inn.win.material.color.set('#3a2f55'); }
      else if (kind === 'well') { burst(pp, 40, 'splash'); await tween(700, (k) => { pawn.root.position.y = TOP - k * 1.4; pawn.root.rotation.y += 0.25; }); }
      else if (kind === 'prison') { const g = props.prison.g; g.visible = true; await tween(420, (k) => { g.position.y = props.prison.rest - k * k * 3; }); shake = 0.35; }
      else { pawn.inner.traverse((m) => { if (m.material && m.material.color) { m.material = m.material.clone(); m.material.color?.set('#8d86a3'); if (m.material.vertexColors) m.material.vertexColors = false; } }); await tween(500, (k) => { pawn.inner.rotation.x = -k * Math.PI / 2; }); }
      await wait(900);
    },
    async finish() {
      const g = golden.root.position.clone();
      await flyTo(63, 500, 1.2);
      burst(new THREE.Vector3(0, TOP + 1.5, 0), 140);
      pawn.flap(true); await wait(1500); pawn.flap(false);
      void g;
    },
    async cash() { burst(pawn.root.position.clone(), 80); pawn.flap(true); await wait(1200); pawn.flap(false); },
    async reset() {
      dice.forEach((d) => { d.visible = false; });
      if (props.prison.g.visible) { await tween(400, (k) => { props.prison.g.position.y = props.prison.rest - 3 + k * 3; }); props.prison.g.visible = false; }
      props.inn.win.material.color.set('#ffe27a');
      // rebuild the pawn so a greyed skull pawn gets its colours back
      scene.remove(pawn.root);
      const fresh = makeGoose(S, { scarf: '#ff3d6e' });
      Object.assign(pawn, fresh); pawn.root.scale.setScalar(0.85);
      const s = posOf(0); pawn.root.position.set(s.x, TOP + 4, s.z); pawn.root.rotation.y = Math.PI / 2; scene.add(pawn.root);
      await tween(600, (k) => { pawn.root.position.y = TOP + 4 * (1 - ease.out(k)); });
      pawn.bump(-0.3);
    },
  };
}
