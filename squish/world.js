// SQUISH JAR world: a big glass jar on a candy counter, a dispenser nozzle on a rail above it and the vinyl blobs.
// The world never decides anything: it replays the frames of the engine's deterministic sim (2D, z = 0 plane of the
// jar) as 3D blobs, and fires effects at the drop and merge steps the sim reported.
//   const W = createWorld(canvas, { onDrop(d), onMerge(m, screen), onLand(tier) })
//   await W.play(result, speedFn)   replay engine.simulate(drops, true)
//   await W.clear()                 pop every blob out of the jar
//   W.showStill(result)             show the last frame at once (idle decoration)
//   W.screen(x, y) -> CSS px point of a jar point
import { THREE, createStage, canvasTex, radialTex, tween, wait, ease, reduce, mulberry } from '../lib/stage.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { blobFactory, TIER } from './blobs.js';

const JAR_R = 3.16, JAR_H = 7.4, DT = 1 / 120, SPAWN_Y = (globalThis.SquishEngine && globalThis.SquishEngine.SPAWN_Y) || 8.2;

export function createWorld(canvas, opts = {}) {
  const S = createStage(canvas, {
    sky: '#ffc6e6', exposure: 1.0, envIntensity: 0.5, hemi: 0.95, hemiSky: '#fff4fb', hemiGround: '#ffd9a8', sun: 2.3, rim: 0.9, rimColor: '#c9b8ff', shadowSize: 9,
    bloom: [0.2, 0.45, 0.93],
    fov: (a) => (a < 0.8 ? 46 : a < 1.2 ? 40 : 34),
  });
  const { scene, camera } = S;
  const R = mulberry(77);
  const TOP = -0.7;   // counter top; the jar's glass bottom sits on a coaster, the sim floor is y = 0
  const F = blobFactory(S);

  // ---------------------------------------------------------------- candy room: wall, counter, decor
  scene.background = canvasTex(16, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ff9fd6'); gr.addColorStop(0.55, '#ffc4e4'); gr.addColorStop(1, '#ffe7b8'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const wallTex = canvasTex(1024, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ff9ad3'); gr.addColorStop(1, '#ffd0ea'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.save(); g.globalAlpha = 0.22; g.fillStyle = '#ffffff';
    for (let x = -h; x < w + h; x += 90) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 45, 0); g.lineTo(x + 45 - h, h); g.lineTo(x - h, h); g.closePath(); g.fill(); }
    g.restore();
    const dots = ['#7fd8ff', '#ffe066', '#9dffb0', '#c7a6ff', '#ffffff', '#ff6fa8'];
    for (let i = 0; i < 70; i++) { g.globalAlpha = 0.5 + R() * 0.4; g.fillStyle = dots[i % dots.length]; g.beginPath(); g.arc(R() * w, R() * h, 6 + R() * 20, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(70, 34), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 }));
  wall.position.set(0, 10, -14); wall.receiveShadow = true; scene.add(wall);
  // soft bokeh glows on the wall
  const glowTex = radialTex();
  for (let i = 0; i < 9; i++) {
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, color: ['#fff3a8', '#bff0ff', '#ffd6f4'][i % 3], transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    const s = 3 + R() * 6; gl.scale.set(s, s, 1); gl.position.set((R() - 0.5) * 34, 2 + R() * 16, -13.8); scene.add(gl);
  }
  // counter with a candy-stripe front edge
  const stripe = canvasTex(512, 64, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff4f86'; for (let x = -h; x < w + h; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 24, 0); g.lineTo(x + 24 - h, h); g.lineTo(x - h, h); g.closePath(); g.fill(); } });
  stripe.wrapS = THREE.RepeatWrapping; stripe.repeat.set(8, 1);
  const counter = new THREE.Mesh(new RoundedBoxGeometry(44, 1.2, 22, 4, 0.3), [
    S.vinyl('#ffffff', { rough: 0.5, coat: 0.4 }), S.vinyl('#ffffff', { rough: 0.5, coat: 0.4 }),
    new THREE.MeshPhysicalMaterial({ color: '#7ee8d0', roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15, envMapIntensity: 0.4 }), S.vinyl('#ffffff'),
    new THREE.MeshPhysicalMaterial({ map: stripe, roughness: 0.35, clearcoat: 1 }), S.vinyl('#ffffff'),
  ]);
  counter.position.set(0, TOP - 0.6, -3); counter.receiveShadow = true; scene.add(counter);
  // coaster under the jar
  const coaster = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 4.05, 0.34, 64), S.vinyl('#ff6fae', { rough: 0.4 }));
  coaster.position.y = TOP + 0.17; coaster.receiveShadow = true; coaster.castShadow = true; scene.add(coaster);
  // sprinkles on the counter
  {
    const geo = new THREE.CapsuleGeometry(0.045, 0.2, 4, 8), mat = new THREE.MeshPhysicalMaterial({ roughness: 0.35, clearcoat: 1 });
    const n = 160, im = new THREE.InstancedMesh(geo, mat, n), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const cols = ['#ff4f86', '#ffcc1f', '#38a8ff', '#2fcf7f', '#9a62ff', '#ffffff', '#ff8a2b'];
    let k = 0;
    while (k < n) {
      const x = (R() - 0.5) * 26, z = -8 + R() * 12; if (Math.hypot(x, z) < 4.6) continue;
      e.set(Math.PI / 2, 0, R() * Math.PI); q.setFromEuler(e); m.compose(new THREE.Vector3(x, TOP + 0.05, z), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(k, m); im.setColorAt(k, new THREE.Color(cols[k % cols.length])); k++;
    }
    im.receiveShadow = true; scene.add(im);
  }
  // lollipops behind, gumdrops and wrapped sweets beside the jar
  const swirl = (a, b) => canvasTex(256, 256, (g, w) => { g.fillStyle = a; g.fillRect(0, 0, w, w); g.strokeStyle = b; g.lineWidth = 16; g.beginPath(); for (let t = 0; t < 26; t += 0.05) { const r = t * 4.6; g.lineTo(w / 2 + Math.cos(t) * r, w / 2 + Math.sin(t) * r); } g.stroke(); });
  function lolly(x, z, h, s, a, b) {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, h, 12), S.vinyl('#ffffff', { rough: 0.5 })); stick.position.y = h / 2; stick.castShadow = true; g.add(stick);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(s, s, 0.35, 48), [new THREE.MeshPhysicalMaterial({ color: a, roughness: 0.3, clearcoat: 1 }), new THREE.MeshPhysicalMaterial({ map: swirl(a, b), roughness: 0.25, clearcoat: 1 }), new THREE.MeshPhysicalMaterial({ map: swirl(a, b), roughness: 0.25, clearcoat: 1 })]);
    disc.rotation.x = Math.PI / 2; disc.position.y = h + s * 0.85; disc.castShadow = true; g.add(disc);
    g.position.set(x, TOP, z); scene.add(g); return g;
  }
  const lollies = [lolly(-7.4, -5.5, 6.5, 1.6, '#ff6fa8', '#ffffff'), lolly(7.6, -6.2, 7.6, 1.8, '#5cc8ff', '#ffe066'), lolly(-10.5, -8, 9, 2.0, '#ffcc1f', '#ff4f86'), lolly(11, -9, 5.5, 1.5, '#9dffb0', '#9a62ff')];
  lollies.forEach((l, i) => { l.rotation.z = (i % 2 ? -1 : 1) * 0.08; });
  const gumGeo = new THREE.LatheGeometry(Array.from({ length: 14 }, (_, i) => { const t = i / 13; return new THREE.Vector2(Math.max(0.001, Math.sin((1 - t) * Math.PI * 0.5) * (1 - t * 0.35)) * 0.6, t * 0.85); }), 32);
  for (const [x, z, c] of [[-4.8, 1.6, '#2fcf7f'], [-5.6, 0.2, '#ff4f86'], [5.2, 1.2, '#ffcc1f'], [6.0, -0.4, '#9a62ff'], [4.6, 2.6, '#38a8ff']]) {
    const g = new THREE.Mesh(gumGeo, new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.55, clearcoat: 0.5, sheen: 1, sheenColor: new THREE.Color('#ffffff') }));
    g.position.set(x, TOP, z); g.castShadow = true; g.receiveShadow = true; scene.add(g);
  }
  // the jar lid, leaning on the counter
  {
    const lid = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(3.35, 3.35, 0.7, 64), S.vinyl('#ff4f86', { rough: 0.3 })); top.castShadow = true; lid.add(top);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 16), S.vinyl('#ffcc1f')); knob.position.y = 0.55; knob.scale.y = 0.7; lid.add(knob);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.35, 0.12, 10, 64), S.vinyl('#ffffff')); ring.rotation.x = Math.PI / 2; ring.position.y = -0.3; lid.add(ring);
    lid.position.set(-7.6, TOP + 0.2, 1.4); lid.rotation.set(0.08, 0.5, -0.05); lid.scale.setScalar(0.5); scene.add(lid);
  }

  // ---------------------------------------------------------------- the glass jar
  const jar = new THREE.Group(); scene.add(jar);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#e6f7ff', roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.05, envMapIntensity: 1.2, side: THREE.DoubleSide, depthWrite: false });
  // fresnel: the glass gets whiter and more solid towards its silhouette, so the jar reads as thick glass
  const fresnel = (mat, amt, tint) => { mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `float frs = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.2);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(${tint}), frs * 0.55); gl_FragColor.a = clamp(gl_FragColor.a + frs * ${amt}, 0.0, 1.0);
    #include <dithering_fragment>`); }; };
  fresnel(glass, '0.55', '0.92, 0.98, 1.0');
  const wallM = new THREE.Mesh(new THREE.CylinderGeometry(JAR_R, JAR_R, JAR_H, 96, 1, true), glass); wallM.position.y = JAR_H / 2; wallM.renderOrder = 2; jar.add(wallM);
  const thick = new THREE.MeshPhysicalMaterial({ color: '#bfeaff', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.22, envMapIntensity: 1.6, depthWrite: false });
  fresnel(thick, '0.4', '1.0, 1.0, 1.0');
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(JAR_R + 0.05, JAR_R - 0.05, 0.36, 96), thick); bottom.position.y = -0.18; bottom.renderOrder = 1; jar.add(bottom);
  const lipMat = new THREE.MeshPhysicalMaterial({ color: '#d9f4ff', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.5, envMapIntensity: 1.8, depthWrite: false });
  fresnel(lipMat, '0.5', '1.0, 1.0, 1.0');
  const lip = new THREE.Mesh(new THREE.TorusGeometry(JAR_R + 0.02, 0.2, 18, 96), lipMat); lip.rotation.x = Math.PI / 2; lip.position.y = JAR_H; lip.scale.z = 1.4; lip.renderOrder = 3; jar.add(lip);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(JAR_R + 0.09, JAR_R + 0.09, 0.55, 96, 1, true), lipMat); neck.position.y = JAR_H - 0.5; neck.renderOrder = 3; jar.add(neck);
  // painted highlights on the front of the glass
  const hiTex = canvasTex(256, 16, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.35, 'rgba(255,255,255,.95)'); gr.addColorStop(0.55, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
  const vfade = canvasTex(16, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.12, '#fff'); gr.addColorStop(0.8, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
  for (const [a0, len, op] of [[-0.95, 0.32, 0.55], [-0.5, 0.08, 0.5], [0.72, 0.16, 0.35]]) {
    const geo = new THREE.CylinderGeometry(JAR_R + 0.03, JAR_R + 0.03, JAR_H - 0.9, 12, 1, true, a0 - len / 2, len);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: hiTex, alphaMap: vfade, color: '#ffffff', transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide }));
    m.position.y = JAR_H / 2 - 0.1; m.renderOrder = 4; jar.add(m);
  }
  // a glossy floor reflection strip inside the jar bottom
  const shine = new THREE.Mesh(new THREE.CircleGeometry(JAR_R - 0.05, 64), new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.15, clearcoat: 1, transparent: true, opacity: 0.35 }));
  shine.rotation.x = -Math.PI / 2; shine.position.y = 0.002; shine.receiveShadow = true; jar.add(shine);

  // ---------------------------------------------------------------- dispenser rail and nozzle
  const RAIL_Y = 9.85;
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 8.6, 16), S.vinyl('#ffffff')); rail.rotation.z = Math.PI / 2; rail.position.y = RAIL_Y; rail.castShadow = true; scene.add(rail);
  for (const s of [-1, 1]) { const cap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), S.vinyl('#ff4f86')); cap.position.set(s * 4.3, RAIL_Y, 0); scene.add(cap); }
  const nozzle = new THREE.Group(); scene.add(nozzle);
  const nzStripe = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff4f86'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 16, h); });
  const nzBody = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.95, 32), new THREE.MeshPhysicalMaterial({ map: nzStripe, roughness: 0.3, clearcoat: 1 })); nzBody.position.y = RAIL_Y - 0.15; nzBody.castShadow = true; nozzle.add(nzBody);
  const nzTop = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), S.vinyl('#ff4f86')); nzTop.position.y = RAIL_Y + 0.32; nozzle.add(nzTop);
  const nzTip = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.3, 0.6, 32), S.vinyl('#ffcc1f')); nzTip.position.y = RAIL_Y - 0.92; nzTip.castShadow = true; nozzle.add(nzTip);
  const nzRing = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.08, 10, 24), S.vinyl('#ff4f86')); nzRing.rotation.x = Math.PI / 2; nzRing.position.y = RAIL_Y - 1.22; nozzle.add(nzRing);
  let nozzleX = 0, nozzleWant = 0, nozzlePulse = 0;

  // ---------------------------------------------------------------- effects: splash droplets, pop rings, sparkles
  const dropGeo = new THREE.SphereGeometry(1, 12, 8);
  const NP = 220, parts = new THREE.InstancedMesh(dropGeo, new THREE.MeshPhysicalMaterial({ roughness: 0.25, clearcoat: 1 }), NP);
  parts.frustumCulled = false; parts.count = NP; const pState = Array.from({ length: NP }, () => ({ life: 0 }));
  const zeroM = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < NP; i++) { parts.setMatrixAt(i, zeroM); parts.setColorAt(i, new THREE.Color('#fff')); }
  scene.add(parts); let pNext = 0;
  function splash(x, y, z, col, n, speed, size) {
    const c = new THREE.Color(col);
    for (let k = 0; k < n; k++) {
      const p = pState[pNext]; parts.setColorAt(pNext, c); pNext = (pNext + 1) % NP;
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, sp = speed * (0.5 + Math.random() * 0.7);
      p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * Math.sqrt(1 - u * u) * sp; p.vy = Math.abs(u) * sp + 2; p.vz = Math.sin(a) * Math.sqrt(1 - u * u) * sp * 0.5 + 1.2;
      p.life = 0.55 + Math.random() * 0.4; p.max = p.life; p.s = size * (0.6 + Math.random() * 0.6);
    }
    parts.instanceColor.needsUpdate = true;
  }
  const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
  const rings = [];
  function popRing(x, y, r, col) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.position.set(x, y, 0.4); m.renderOrder = 5; scene.add(m); rings.push({ m, t: 0, r });
  }
  const starTex = canvasTex(128, 128, (g, w) => { g.translate(w / 2, w / 2); const gr = g.createRadialGradient(0, 0, 0, 0, 0, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,240,170,.9)'); gr.addColorStop(1, 'rgba(255,200,60,0)'); g.fillStyle = gr; g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r = i % 2 ? 12 : 64; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); }, false);
  const stars = [];
  function sparkle(x, y, n, spread, col = '#ffe27a') {
    for (let k = 0; k < n; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      s.position.set(x + Math.cos(a) * r, y + Math.sin(a) * r, 1 + Math.random()); s.scale.setScalar(0.01); s.renderOrder = 6; scene.add(s);
      stars.push({ s, t: -Math.random() * 0.5, life: 0.8 + Math.random() * 0.6, size: 0.4 + Math.random() * 0.7, vy: 0.6 + Math.random() });
    }
  }
  const goldLight = new THREE.PointLight('#ffcf4a', 0, 14, 1.6); goldLight.position.set(0, 4, 3); scene.add(goldLight);
  let goldFlash = 0, shake = 0, zoom = 0;

  // ---------------------------------------------------------------- blobs and the replay player
  const live = new Map();   // id -> { b, x, y, vy, born, tier }
  const ghosts = [];        // merging blobs flying into each other
  const fading = [];        // blobs popping out of the jar
  const zOf = (id) => 0;
  function spawn(id, tier, x, y, kind) {
    const b = F.make(tier);
    const r = radiusOf(tier);
    b.root.position.set(x, y, zOf(id)); b.root.scale.setScalar(0.001); scene.add(b.root);
    const o = { b, x, y, vy: 0, r, tier, born: 0, kind, grow: 0 };
    live.set(id, o);
    if (kind === 'merge') { b.happy(0.9); b.poke(0.25); }
    return o;
  }
  function radiusOf(tier) { return 0.32 * Math.pow(Math.SQRT2, tier); }
  let play = null;   // { res, time, di, mi, done, hold, speed, resolve }
  function frameAt(fr, id) { for (let i = 0; i < fr.length; i += 3) if (fr[i] === id) return i; return -1; }
  function stepPlayer(dt) {
    const P = play; if (!P) return;
    const res = P.res, frames = res.frames, last = frames.length - 1;
    P.time += dt * P.speed();
    let f = P.time / DT; if (f >= last) f = last;
    // events up to this sim step
    while (P.di < res.dropsAt.length && res.dropsAt[P.di].step <= f) {
      const d = res.dropsAt[P.di++];
      const o = spawn(d.id, d.tier, d.x, SPAWN_Y, 'drop'); o.grow = 0;
      nozzleX = d.x; nozzlePulse = 1; o.b.surprise(0.5);
      opts.onDrop?.(d);
    }
    while (P.mi < res.merges.length && res.merges[P.mi].step <= f) {
      const m = res.merges[P.mi++];
      for (const id of [m.a, m.b]) { const o = live.get(id); if (o) { live.delete(id); ghosts.push({ o, t: 0, tx: m.x, ty: m.y }); } }
      const o = spawn(m.id, m.tier, m.x, m.y, 'merge'); o.grow = 0;
      const col = TIER[m.tier].col, r = radiusOf(m.tier);
      splash(m.x, m.y, 0.6, col, 10 + m.tier * 3, 3 + m.tier * 0.8, 0.06 + m.tier * 0.02);
      popRing(m.x, m.y, r * 1.5, col);
      if (m.tier >= 4) shake = Math.max(shake, 0.05 * (m.tier - 3));
      if (m.tier === 6) { goldFlash = 1; shake = 0.5; zoom = 1; sparkle(m.x, m.y, 40, r * 1.6); goldLight.position.set(m.x, m.y + 1, 3.5); }
      opts.onMerge?.(m, S.toScreen(new THREE.Vector3(m.x, m.y + r + 0.3, 0)));
    }
    // move blobs to the interpolated frame
    const f0 = Math.floor(f), a = f - f0, A = frames[f0], B = frames[Math.min(last, f0 + 1)];
    for (let i = 0; i < A.length; i += 3) {
      const id = A[i], o = live.get(id); if (!o) continue;
      const j = frameAt(B, id);
      const x = j < 0 ? A[i + 1] : A[i + 1] + (B[j + 1] - A[i + 1]) * a, y = j < 0 ? A[i + 2] : A[i + 2] + (B[j + 2] - A[i + 2]) * a;
      const vy = j < 0 ? 0 : (B[j + 2] - A[i + 2]) / DT;
      // landing: a fast fall that suddenly stops squashes the jelly
      if (o.vy < -2.2 && vy - o.vy > 2.2) { const imp = Math.min(0.42, (vy - o.vy) * 0.035 * (1 + o.tier * 0.04)); o.b.hit(imp); if (imp > 0.12) opts.onLand?.(o.tier, imp); }
      o.vy = vy; o.x = x; o.y = y;
    }
    if (f >= last) { P.hold += dt; if (P.hold > 0.25) { play = null; P.resolve(); } }
  }

  // ---------------------------------------------------------------- camera
  const look = new THREE.Vector3(0, 4.55, 0);
  let intro = reduce ? 0 : 1;
  S.onFrame((dt, t) => {
    stepPlayer(dt);
    const a = camera.aspect, th = Math.tan((camera.fov * Math.PI) / 360);
    const H = a < 1.25 ? 11.5 : 10.9, W = 9.4;
    let dist = Math.max(H / 2 / th, W / 2 / (th * a)) * 1.02;
    if (intro > 0) { intro = Math.max(0, intro - dt / 1.8); dist *= 1 + ease.inOut(intro) * 0.35; }
    zoom = Math.max(0, zoom - dt * 0.35); dist *= 1 - 0.12 * Math.sin(Math.min(1, zoom) * Math.PI);
    const sway = Math.sin(t * 0.35) * 0.06;
    camera.position.set(Math.sin(sway) * dist, look.y + dist * 0.2, Math.cos(sway) * dist);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 1.6); }
    camera.lookAt(look);
    S.sun.position.set(6, 16, 9); S.sun.target.position.set(0, 3, 0);

    // nozzle glides above the next drop
    if (play) { const nx = play.res.dropsAt[play.di]; nozzleWant = nx ? nx.x : nozzleWant; }
    nozzleX += (nozzleWant - nozzleX) * (1 - Math.exp(-dt * 7)); nozzle.position.x = nozzleX;
    nozzlePulse = Math.max(0, nozzlePulse - dt * 5); const np = Math.sin(nozzlePulse * Math.PI) * 0.18; nzBody.scale.set(1 + np, 1 - np, 1 + np); nzTip.scale.set(1 + np * 1.4, 1, 1 + np * 1.4);

    // blobs
    for (const o of live.values()) {
      o.grow = Math.min(1, o.grow + dt * (o.kind === 'merge' ? 4.2 : 7));
      const g = o.kind === 'merge' ? ease.back(o.grow) : ease.out(o.grow);
      o.b.root.position.set(o.x, o.y, zOf(0));
      o.b.root.scale.setScalar(Math.max(0.001, o.r * 1.06 * g));
      o.b.update(dt, t);
    }
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const gh = ghosts[i]; gh.t += dt * 7;
      const k = Math.min(1, gh.t), o = gh.o;
      o.b.root.position.set(o.x + (gh.tx - o.x) * ease.inOut(k), o.y + (gh.ty - o.y) * ease.inOut(k), 0.05);
      const sq = 1 - k * 0.7; o.b.root.scale.set(o.r * 1.03 * (1 + k * 0.25) * sq, o.r * 1.03 * (1 - k * 0.4) * sq, o.r * 1.03 * sq);
      if (k >= 1) { scene.remove(o.b.root); ghosts.splice(i, 1); }
    }
    for (let i = fading.length - 1; i >= 0; i--) {
      const fd = fading[i]; fd.t += dt; const k = Math.max(0, fd.t) * 3.2;
      if (k <= 0) continue;
      const s = k < 0.35 ? 1 + k * 0.6 : Math.max(0, 1.21 * (1 - (k - 0.35) / 0.65));
      fd.o.b.root.scale.setScalar(Math.max(0.001, fd.o.r * s));
      if (!fd.popped && k > 0.35) { fd.popped = true; splash(fd.o.x, fd.o.y, 0.6, TIER[fd.o.tier].col, 6, 2.5, 0.05 + fd.o.tier * 0.015); }
      fd.o.b.update(dt, t);
      if (k >= 1) { scene.remove(fd.o.b.root); fading.splice(i, 1); }
    }
    // particles
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < NP; i++) {
      const p = pState[i]; if (p.life <= 0) continue;
      p.life -= dt; p.vy -= 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05 && Math.abs(p.x) < JAR_R) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.6; }
      const s = p.life > 0 ? p.s * Math.min(1, p.life / p.max * 2) : 0;
      m4.makeScale(s, s, s).setPosition(p.x, p.y, p.z); parts.setMatrixAt(i, p.life > 0 ? m4 : zeroM);
    }
    parts.instanceMatrix.needsUpdate = true;
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.t += dt * 2.6; const s = r.r * (0.6 + ease.out(Math.min(1, r.t)) * 0.9); r.m.scale.setScalar(s); r.m.material.opacity = Math.max(0, 0.9 * (1 - r.t)); r.m.lookAt(camera.position); if (r.t >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); } }
    for (let i = stars.length - 1; i >= 0; i--) { const st = stars[i]; st.t += dt; if (st.t < 0) continue; const k = st.t / st.life; st.s.scale.setScalar(st.size * Math.sin(Math.min(1, k) * Math.PI)); st.s.position.y += st.vy * dt; st.s.material.rotation += dt * 2; if (k >= 1) { scene.remove(st.s); st.s.material.dispose(); stars.splice(i, 1); } }
    // gold glow
    goldFlash = Math.max(0, goldFlash - dt * 0.4); goldLight.intensity = goldFlash * 40;
    let gold = null; for (const o of live.values()) if (o.tier === 6) gold = o;
    if (gold) { goldLight.position.set(gold.x, gold.y + 0.5, 3.6); goldLight.intensity = Math.max(goldLight.intensity, 10 + Math.sin(t * 4) * 3); if (Math.random() < dt * 6) sparkle(gold.x, gold.y, 1, gold.r * 1.1); }
  });

  return {
    S,
    hasBlobs: () => live.size > 0,
    screen: (x, y) => S.toScreen(new THREE.Vector3(x, y, 0)),
    play(res, speed = () => 1) {
      return new Promise((resolve) => { play = { res, time: 0, di: 0, mi: 0, hold: 0, speed, resolve }; nozzleWant = res.dropsAt[0] ? res.dropsAt[0].x : 0; });
    },
    // skip the replay to the end (for auto / tests): fast forward the player
    finishNow() { if (play) play.speed = () => 1000; },
    async clear() {
      const all = [...live.values()].sort((a, b) => b.y - a.y);
      live.clear();
      all.forEach((o, i) => { o.b.surprise(0.6); fading.push({ o, t: -i * 0.035, popped: false }); });
      await wait(all.length ? 320 + all.length * 35 : 0);
    },
    showStill(res) {
      for (const o of live.values()) scene.remove(o.b.root); live.clear();
      const fr = res.frames[res.frames.length - 1];
      const tierOf = new Map(); res.dropsAt.forEach((d) => tierOf.set(d.id, d.tier)); res.merges.forEach((m) => tierOf.set(m.id, m.tier));
      for (let i = 0; i < fr.length; i += 3) { const o = spawn(fr[i], tierOf.get(fr[i]), fr[i + 1], fr[i + 2], 'still'); o.grow = 1; }
    },
    nudge(t = 0.3) { for (const o of live.values()) o.b.poke(t * (0.5 + Math.random())); },
  };
}
