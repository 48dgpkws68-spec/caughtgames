// WOBBLE world: a rainbow tower of glossy painted blocks on a play table. Hover or tap a block to select it, pull it
// out, watch the tower sway. When it falls, every block tumbles across the table.
//   const W = createWorld(canvas, { onSelect(layer, i) })
//   W.build(tower)                        (re)build from the engine tower
//   W.select(layer, i) / W.select(null)   highlight one block; W.anchor() -> screen point for its label
//   await W.pull(layer, i, risk, fall)    slide the block out; fall = true topples the tower
//   W.hint(list)                          [{ layer, i, kind: 'safe' | 'bold' }] small markers
import { THREE, createStage, canvasTex, radialTex, tween, wait, ease, reduce, mulberry } from '../lib/stage.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const BL = 1.5, BH = 0.3, BW = 0.49, TABLE_Y = 0.9;
const RAINBOW = ['#ff4d6d', '#ff8a3d', '#ffc531', '#7fdc4a', '#2fd0b0', '#4fa8ff', '#8a6bff', '#ff6fb0'];

export function createWorld(canvas, opts = {}) {
  const S = createStage(canvas, {
    sky: '#ffd9ec', exposure: 0.97, envIntensity: 0.4, hemi: 0.8, hemiSky: '#fff3e6', hemiGround: '#c9b6ff', sun: 2.4, shadowSize: 7,
    bloom: [0.18, 0.4, 0.94],
    fov: (a) => (a < 0.8 ? 50 : a < 1.2 ? 42 : 36),
  });
  const { scene, camera } = S;
  const R = mulberry(5);

  // ---------------------------------------------------------------- room: floor, wall, window light, table, toys
  const floorTex = canvasTex(512, 512, (g, w) => { const n = 8, s = w / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? '#ffe1f0' : '#d9f1ff'; g.fillRect(i * s, j * s, s, s); } });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(6, 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const wallTex = canvasTex(512, 512, (g, w) => { g.fillStyle = '#ffd1e6'; g.fillRect(0, 0, w, w); g.fillStyle = '#ffc2dd'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 28, w); });
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(6, 2);
  for (const [x, z, ry] of [[0, -10, 0], [-10, 0, Math.PI / 2]]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(40, 14), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 })); w.position.set(x, 7, z); w.rotation.y = ry; w.receiveShadow = true; scene.add(w); }
  const win = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshBasicMaterial({ color: '#bfe9ff', toneMapped: false })); win.position.set(2, 6, -9.95); scene.add(win);
  const winGlow = new THREE.Mesh(new THREE.PlaneGeometry(11, 8), new THREE.MeshBasicMaterial({ map: radialTex(), color: '#fff6d6', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })); winGlow.position.set(2, 6, -9.9); scene.add(winGlow);
  for (const x of [-1, 5]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.2, 0.1), S.vinyl('#ffffff')); b.position.set(x, 6, -9.9); scene.add(b); }
  const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.25, 64), S.vinyl('#3fd6a6', { rough: 0.6, coat: 0.25, env: 0.3 }));
  tableTop.position.y = TABLE_Y - 0.125; tableTop.receiveShadow = true; tableTop.castShadow = true; scene.add(tableTop);
  const tableRim = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.08, 10, 80), S.vinyl('#ffffff')); tableRim.rotation.x = Math.PI / 2; tableRim.position.y = TABLE_Y - 0.02; scene.add(tableRim);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, TABLE_Y - 0.25, 24), S.vinyl('#ff6fb0')); leg.position.y = (TABLE_Y - 0.25) / 2; leg.castShadow = true; scene.add(leg);
  // toys on the floor
  const toyCols = ['#ff4d6d', '#ffc531', '#4fa8ff', '#7fdc4a', '#8a6bff'];
  for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.35 + R() * 0.35, 24, 16), S.vinyl(toyCols[i % 5])); const a = R() * Math.PI * 2, r = 5.5 + R() * 3; b.position.set(Math.cos(a) * r, 0.35, Math.sin(a) * r); b.castShadow = true; scene.add(b); }
  { const g = new THREE.Group(); for (let i = 0; i < 5; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.7 - i * 0.11, 0.17, 14, 36), S.vinyl(toyCols[i])); t.rotation.x = Math.PI / 2; t.position.y = 0.17 + i * 0.3; t.castShadow = true; g.add(t); } const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 10), S.vinyl('#fff')); pole.position.y = 0.9; g.add(pole); g.position.set(-5.5, 0, -3.5); scene.add(g); }

  // ---------------------------------------------------------------- blocks
  const grain = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(120,90,60,.13)'; for (let i = 0; i < 26; i++) { g.lineWidth = 1 + R() * 2; g.beginPath(); const y = R() * h; g.moveTo(0, y); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 3); g.stroke(); } });
  const blockGeo = new RoundedBoxGeometry(BL, BH * 0.96, BW * 0.96, 3, 0.045);
  const tower = new THREE.Group(); tower.position.y = TABLE_Y; scene.add(tower);
  let blocks = [];   // blocks[layer][i] = { mesh, mat, out }
  const pile = [];
  const dynamic = [];   // tumbling blocks after a fall
  function slot(layer, i) {
    const y = layer * BH + BH / 2, off = (i - 1) * BW;
    return layer % 2 === 0 ? { pos: new THREE.Vector3(0, y, off), rotY: 0, axis: new THREE.Vector3(1, 0, 0) } : { pos: new THREE.Vector3(off, y, 0), rotY: Math.PI / 2, axis: new THREE.Vector3(0, 0, 1) };
  }
  const pickables = [];
  function build(t) {
    for (const row of blocks) for (const b of row) if (b) tower.remove(b.mesh);
    for (const d of dynamic) scene.remove(d.mesh); dynamic.length = 0;
    for (const p of pile) scene.remove(p); pile.length = 0;
    pickables.length = 0; tower.rotation.set(0, 0, 0);
    blocks = t.map((layer, L) => layer.map((has, i) => {
      if (!has) return null;
      const col = new THREE.Color(RAINBOW[L % RAINBOW.length]).offsetHSL((R() - 0.5) * 0.03, 0, (R() - 0.5) * 0.06);
      const mat = new THREE.MeshPhysicalMaterial({ color: col, map: grain, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.55, emissive: '#ffffff', emissiveIntensity: 0 });
      const mesh = new THREE.Mesh(blockGeo, mat); const s = slot(L, i);
      mesh.position.copy(s.pos); mesh.rotation.y = s.rotY; mesh.castShadow = mesh.receiveShadow = true; mesh.userData = { layer: L, i };
      tower.add(mesh); pickables.push(mesh);
      return { mesh, mat, base: s.pos.clone() };
    }));
  }
  let selected = null, hover = null, hints = [];
  function paint() {
    for (const row of blocks) for (const b of row) if (b) b.mat.emissiveIntensity = 0;
    for (const h of hints) { const b = blocks[h.layer]?.[h.i]; if (b) b.mat.emissiveIntensity = 0.05; }
    if (hover) { const b = blocks[hover.layer]?.[hover.i]; if (b) b.mat.emissiveIntensity = 0.12; }
    if (selected) { const b = blocks[selected.layer]?.[selected.i]; if (b) b.mat.emissiveIntensity = 0.2; }
  }

  // ---------------------------------------------------------------- camera orbit with drag
  let yaw = Math.PI / 4, yawWant = yaw, pitch = 0.28, dragging = null, sway = 0, swayV = 0, swayDir = new THREE.Vector2(1, 0), shake = 0, intro = reduce ? 0 : 1;
  canvas.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, y: e.clientY, yaw: yawWant, moved: false }; });
  addEventListener('pointerup', () => { setTimeout(() => { dragging = null; }, 0); });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging && (dragging.moved || Math.abs(e.clientX - dragging.x) > 6)) { dragging.moved = true; yawWant = dragging.yaw - (e.clientX - dragging.x) * 0.008; return; }
    const h = S.pick(e, pickables); const nh = h ? h.object.userData : null;
    if ((nh?.layer ?? -1) !== (hover?.layer ?? -1) || (nh?.i ?? -1) !== (hover?.i ?? -1)) { hover = nh; paint(); canvas.style.cursor = h ? 'pointer' : 'grab'; opts.onHover?.(hover); }
  });
  canvas.addEventListener('click', (e) => { if (dragging?.moved) return; const h = S.pick(e, pickables); opts.onSelect?.(h ? h.object.userData : null); });

  const camLook = new THREE.Vector3(0, TABLE_Y + 2.3, 0), tmp = new THREE.Vector3();
  S.onFrame((dt, t) => {
    yaw += (yawWant - yaw) * (1 - Math.exp(-dt * 8));
    const a = camera.aspect, dist = a < 0.8 ? 11.5 : a < 1.2 ? 10.5 : 9.6;
    const top = TABLE_Y + 2.3;
    let y = yaw;
    if (intro > 0) { intro = Math.max(0, intro - dt / 2.2); y = yaw - (1 - ease.out(1 - intro)) * 1.6; }
    camera.position.set(Math.sin(y) * dist * Math.cos(pitch), top + Math.sin(pitch) * dist, Math.cos(y) * dist * Math.cos(pitch));
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 1.4); }
    camera.lookAt(camLook);
    // sway: damped spring on a lean of the whole tower (pivot at the base)
    swayV += (-sway * 60 - swayV * 4.5) * dt; sway += swayV * dt;
    tower.rotation.x = swayDir.y * sway; tower.rotation.z = -swayDir.x * sway;
    // tumbling blocks
    for (const d of dynamic) {
      if (d.rest) continue;
      d.v.y -= 9.8 * dt; d.mesh.position.addScaledVector(d.v, dt);
      d.mesh.rotation.x += d.w.x * dt; d.mesh.rotation.y += d.w.y * dt; d.mesh.rotation.z += d.w.z * dt;
      const r = Math.hypot(d.mesh.position.x, d.mesh.position.z), ground = r < 4.1 ? TABLE_Y + 0.15 : 0.15;
      if (d.mesh.position.y < ground) { d.mesh.position.y = ground; d.v.y *= -0.35; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.5); if (Math.abs(d.v.y) < 0.4 && d.v.length() < 0.5) { d.rest = true; d.mesh.rotation.x = Math.round(d.mesh.rotation.x / (Math.PI / 2)) * (Math.PI / 2); d.mesh.rotation.z = Math.round(d.mesh.rotation.z / (Math.PI / 2)) * (Math.PI / 2); } }
    }
    S.sun.position.set(5, 12, 6); S.sun.target.position.set(0, TABLE_Y, 0);
    void t;
  });

  function anchor(sel) {
    const b = sel && blocks[sel.layer]?.[sel.i]; if (!b) return null;
    b.mesh.updateWorldMatrix(true, false);
    const p = new THREE.Vector3(); b.mesh.getWorldPosition(p);
    // label above the block's end that faces the camera
    const s = slot(sel.layer, sel.i), axis = s.axis.clone();
    const camDir = new THREE.Vector3().subVectors(camera.position, p); if (axis.dot(camDir) < 0) axis.negate();
    p.addScaledVector(axis, BL * 0.42).add(new THREE.Vector3(0, BH * 0.6, 0));
    return S.toScreen(p);
  }

  return {
    S, build,
    select(sel) { selected = sel; paint(); },
    hint(list) { hints = list || []; paint(); },
    anchor,
    rotate(d) { yawWant += d; },
    async pull(layer, i, risk, fall) {
      const b = blocks[layer][i]; if (!b) return;
      const s = slot(layer, i), axis = s.axis.clone();
      const camDir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)); if (axis.dot(camDir) < 0) axis.negate();
      selected = null; paint();
      const from = b.base.clone();
      // slow slide with a tremble that grows with the risk
      await tween(900 + risk * 700, (k) => {
        const e = ease.inOut(k);
        b.mesh.position.copy(from).addScaledVector(axis, e * BL * 1.05);
        const tr = Math.sin(k * 60) * risk * 0.012 * (1 - k * 0.4);
        tower.rotation.z += tr; tower.rotation.x -= tr * 0.6;
      });
      tower.remove(b.mesh); pickables.splice(pickables.indexOf(b.mesh), 1); blocks[layer][i] = null;
      if (fall) {
        scene.add(b.mesh); b.mesh.position.add(new THREE.Vector3(0, TABLE_Y, 0));
        swayDir.set(axis.x || (R() - 0.5), axis.z || (R() - 0.5)).normalize();
        // lean further and further, then everything comes down
        swayV = 0; await tween(650, (k) => { sway = ease.out(k) * 0.35; });
        shake = 0.4;
        const dir = new THREE.Vector3(swayDir.x, 0, swayDir.y);
        for (const row of blocks) for (const bb of row) {
          if (!bb) continue;
          bb.mesh.updateWorldMatrix(true, false);
          const wp = new THREE.Vector3(), wq = new THREE.Quaternion(); bb.mesh.getWorldPosition(wp); bb.mesh.getWorldQuaternion(wq);
          tower.remove(bb.mesh); scene.add(bb.mesh); bb.mesh.position.copy(wp); bb.mesh.quaternion.copy(wq);
          const h = wp.y - TABLE_Y;
          dynamic.push({ mesh: bb.mesh, v: dir.clone().multiplyScalar(1 + h * 0.9 + R()).add(new THREE.Vector3((R() - 0.5) * 2, R() * 1.5, (R() - 0.5) * 2)), w: new THREE.Vector3((R() - 0.5) * 8, (R() - 0.5) * 6, (R() - 0.5) * 8), rest: false });
        }
        dynamic.push({ mesh: b.mesh, v: dir.clone().multiplyScalar(2).add(new THREE.Vector3(0, 1, 0)), w: new THREE.Vector3(4, 2, 1), rest: false });
        blocks = blocks.map((row) => row.map(() => null)); pickables.length = 0;
        sway = 0; swayV = 0; tower.rotation.set(0, 0, 0);
        await wait(1700);
        return;
      }
      // safe: the block hops onto the pile beside the tower, the tower sways and settles
      const n = pile.length, target = new THREE.Vector3(-2.6 + (n % 3) * 0.55, TABLE_Y + BH / 2 + Math.floor(n / 3) * BH, 2.0);
      scene.add(b.mesh);
      const startW = new THREE.Vector3(); startW.copy(b.mesh.position).add(new THREE.Vector3(0, TABLE_Y, 0)); b.mesh.position.copy(startW);
      const ry0 = b.mesh.rotation.y;
      swayDir.set(axis.x, axis.z); swayV = 0.9 + risk * 2.2;
      await tween(520, (k) => { const e = ease.inOut(k); b.mesh.position.lerpVectors(startW, target, e); b.mesh.position.y += Math.sin(Math.PI * e) * 1.4; b.mesh.rotation.y = ry0 + (Math.PI / 2 - ry0) * e; });
      pile.push(b.mesh);
    },
    async rebuild(t) {
      build(t);
      const all = blocks.flat().filter(Boolean);
      all.forEach((b) => { b.mesh.position.y += 6; });
      await Promise.all(all.map((b, k) => wait(k * 18).then(() => tween(380, (q) => { b.mesh.position.y = b.base.y + 6 * (1 - ease.out(q)); }))));
    },
  };
}
