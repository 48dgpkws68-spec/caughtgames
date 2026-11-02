// SKYLINE world: candy-coloured city rooftops at sunset, the vinyl thief from SNEAK running along them, a gap between
// buildings every few seconds (a plank slides across unless the player jumps), and a vinyl police helicopter whose
// searchlight ends the run.
//   const W = createWorld(canvas, { engine: SkylineEngine })
//   W.reset()                   thief back on the first roof, helicopter on patrol, planks in
//   W.run(x)                    thief runs at lane position x (called every frame by the page)
//   W.ring(n, k, text)          countdown ring over gap n (k = 0..1 of the window used), n = null hides it
//   await W.jump(n, ok, max)    leap over gap n: lands on the next roof (ok) or misses and falls
//   W.cash(big)                 stop and celebrate (big = max win)
//   await W.caught()            helicopter swoops in, searchlight locks on the thief
//   W.pop(text, cls)            label pop above the thief
//   W.layout                    { SPEED, GAP_W, LAND, PERIOD, E0 } and W.edgeX(n)
import { THREE, createStage, canvasTex, radialTex, ease, reduce, mulberry } from '../lib/stage.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeShape, meshSDF } from '../sneak/sdfmesh.js';
import { createThief } from '../sneak/thief.js';

const Ep = (c, r, col, k = 0.05) => ({ t: 'e', c, r, col, k });
const Cp = (a, b, ra, rb, col, k = 0.04) => ({ t: 'c', a, b, ra, rb, col, k });
const PAL = ['#ff5fa2', '#ffb03a', '#4fc8ff', '#9a7bff', '#3fe0b0', '#ffd84a', '#ff7a5a', '#6f8cff', '#ff8fd0', '#7fe36a'];
const NEON = ['#ff4fd8', '#4ff3ff', '#ffe14f', '#8aff4f', '#ff9a3f', '#ff5a7a'];
const WORDS = ['VINYL', 'RECORDS', 'HOTEL', 'LUCKY', 'DISCO', 'PIZZA', 'ARCADE', 'NOODLES', 'OPEN', 'JAZZ', 'DINER', 'TAXI'];
const THIEF_Z = 0.55, TILE_W = 9.6, TILE_H = 12;

export function createWorld(canvas, opts = {}) {
  const G = opts.engine;
  const SPEED = G.SPEED;
  const D = (SPEED * (G.GAP_EVERY - G.GAP_FIRST - G.WINDOW)) / 1000;   // edge to landing spot
  const LAND = 0.45, GAP_W = D - LAND, PERIOD = (SPEED * G.GAP_EVERY) / 1000, E0 = (SPEED * (G.GAP_FIRST + G.WINDOW)) / 1000;
  const LEN = PERIOD - GAP_W;
  const edgeX = (n) => E0 + n * PERIOD;
  const chunkStart = (n) => edgeX(n - 1) + GAP_W;

  const S = createStage(canvas, {
    sky: '#ff9a6a', fog: ['#ff9f9a', 45, 190], exposure: 0.95, envIntensity: 0.4,
    hemi: 0.75, hemiSky: '#ffe0f0', hemiGround: '#7a5ad0', sun: 2.1, sunColor: '#ffc690', rim: 1.0, rimColor: '#9d8bff',
    shadowSize: 14, bloom: [0.32, 0.4, 0.93],
    fov: (a) => (a < 0.8 ? 60 : a < 1.2 ? 50 : 38),
  });
  const { scene, camera } = S;
  S.sun.shadow.camera.far = 80;
  const host = opts.labelHost || canvas.parentElement;

  // ---------------------------------------------------------------- sky, sun, glow, clouds
  scene.background = canvasTex(8, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#3b2fb0'); gr.addColorStop(0.2, '#7a45d8'); gr.addColorStop(0.4, '#e45bc2');
    gr.addColorStop(0.55, '#ff6f96'); gr.addColorStop(0.7, '#ffa066'); gr.addColorStop(0.85, '#ffd27e'); gr.addColorStop(1, '#ffe8b0');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Group(); scene.add(sky);
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(15, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff0a8').multiplyScalar(1.35), fog: false, toneMapped: false }));
  sunDisc.position.set(-30, 26, -240); sky.add(sunDisc);
  const glowTex = radialTex();
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffb070', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sunGlow.scale.set(150, 150, 1); sunGlow.position.set(-30, 24, -235); sky.add(sunGlow);
  const cityGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ff7aa8', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  cityGlow.scale.set(320, 70, 1); cityGlow.position.set(0, 4, -150); sky.add(cityGlow);
  const R0 = mulberry(5);
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffd0e0', emissive: '#ff8fb0', emissiveIntensity: 0.45, roughness: 1, fog: false });
  const clouds = [];
  for (let i = 0; i < 10; i++) {
    const c = new THREE.Group();
    for (let j = 0; j < 5; j++) { const b = new THREE.Mesh(new THREE.SphereGeometry(3 + R0() * 3, 18, 12), cloudMat); b.position.set(j * 4.2 - 8, R0() * 2, R0() * 2); b.scale.y = 0.6; c.add(b); }
    c.userData.bx = -150 + i * 34 + R0() * 12; c.position.set(c.userData.bx, 40 + R0() * 26, -170 - R0() * 30); c.userData.par = 0.85;
    scene.add(c); clouds.push(c);
  }

  // ---------------------------------------------------------------- facade textures and materials
  function facade(variant) {
    const R = mulberry(31 + variant * 7), cols = variant ? 5 : 8, floors = 8, W = 1024, H = 1024;
    const cw = W / cols, ch = H / floors, ww = variant ? cw * 0.72 : cw * 0.52, wh = ch * 0.56;
    const wins = [];
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      const r = R(); wins.push({ x: c * cw + (cw - ww) / 2, y: f * ch + ch * 0.2, lit: r < 0.55, tone: r < 0.08 ? '#ff9ad8' : r < 0.14 ? '#9ff6ff' : r < 0.3 ? '#ffeaa8' : '#ffd36a', half: R() < 0.3 });
    }
    const map = canvasTex(W, H, (g) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
      for (let f = 0; f < floors; f++) { g.fillStyle = 'rgba(40,20,80,.07)'; g.fillRect(0, f * ch + ch - 14, W, 14); }
      for (let c = 0; c <= cols; c++) { g.fillStyle = 'rgba(40,20,80,.04)'; g.fillRect(c * cw - 3, 0, 6, H); }
      for (const w of wins) {
        g.fillStyle = 'rgba(30,15,70,.28)'; g.beginPath(); g.roundRect(w.x - 7, w.y - 7, ww + 14, wh + 14, 10); g.fill();
        g.fillStyle = w.lit ? '#fff3cf' : '#2a2156'; g.beginPath(); g.roundRect(w.x, w.y, ww, wh, 6); g.fill();
        if (!w.lit) { g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(w.x + 6, w.y + 6, ww * 0.25, wh - 12); }
        g.fillStyle = 'rgba(255,255,255,.95)'; g.fillRect(w.x - 10, w.y + wh + 4, ww + 20, 9);
        if (variant === 0) { g.fillStyle = 'rgba(30,15,70,.35)'; g.fillRect(w.x + ww / 2 - 2, w.y, 4, wh); }
      }
    });
    const emi = canvasTex(W, H, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      for (const w of wins) {
        if (!w.lit) continue;
        const gr = g.createLinearGradient(0, w.y, 0, w.y + wh); gr.addColorStop(0, w.tone); gr.addColorStop(1, '#ff9a3a');
        g.fillStyle = gr; g.beginPath(); g.roundRect(w.x, w.y, ww, wh, 6); g.fill();
        if (w.half) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(w.x, w.y, ww, wh * 0.45); }
        if (variant === 0) { g.fillStyle = '#000'; g.fillRect(w.x + ww / 2 - 2, w.y, 4, wh); }
      }
    });
    for (const t of [map, emi]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return { map, emi };
  }
  const FT = [facade(0), facade(1)];
  const matCache = new Map();
  const tone = (col, mix, k) => new THREE.Color(col).lerp(new THREE.Color(mix), k);
  function facadeMat(col, v, far = 0) {
    const key = col + v + far; if (matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshPhysicalMaterial({
      color: far ? tone(col, '#8a63d8', 0.25 + far * 0.15) : new THREE.Color(col), map: FT[v].map, emissive: '#ffffff', emissiveMap: FT[v].emi,
      emissiveIntensity: far ? 1.0 : 0.85, roughness: 0.5, clearcoat: far ? 0 : 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.4,
    });
    matCache.set(key, m); return m;
  }
  const roofTex = canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(60,30,90,.12)'; g.lineWidth = 4;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, w); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
  });
  roofTex.wrapS = roofTex.wrapT = THREE.RepeatWrapping;
  function roofMat(col) {
    const key = 'roof' + col; if (matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshStandardMaterial({ color: tone(col, '#fff4ea', 0.25), map: roofTex, roughness: 0.8 });
    matCache.set(key, m); return m;
  }
  const vin = (c, x) => { const key = 'v' + c + JSON.stringify(x || {}); if (!matCache.has(key)) matCache.set(key, S.vinyl(c, x)); return matCache.get(key); };
  // a box with facade on the walls and a roof material on top, UVs in world units so floors line up from the top
  function block(w, h, d, col, v, far = 0, R = Math.random) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv, off = Math.floor(R() * 8) / (v ? 5 : 8);
    for (let f = 0; f < 6; f++) for (let j = 0; j < 4; j++) {
      const i = f * 4 + j, u = uv.getX(i), vv = uv.getY(i);
      const across = f < 2 ? d : w, up = f === 2 || f === 3 ? d : h;
      if (f === 2 || f === 3) uv.setXY(i, (u * across) / 4, (vv * up) / 4);
      else uv.setXY(i, (u * across) / TILE_W + off, 10 - ((1 - vv) * up) / TILE_H);
    }
    const fm = facadeMat(col, v, far), rm = far ? facadeMat(col, v, far) : roofMat(col);
    return new THREE.Mesh(geo, [fm, fm, rm, fm, fm, fm]);
  }
  function neonTex(text, color, w = 512, h = 192, vertical = false) {
    return canvasTex(w, h, (g) => {
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      const draw = (t, x, y, size) => {
        g.font = size + 'px "Lilita One", "Arial Rounded MT Bold", sans-serif';
        g.shadowColor = color; g.shadowBlur = size * 0.35; g.strokeStyle = color; g.lineWidth = size * 0.16; g.strokeText(t, x, y);
        g.shadowBlur = size * 0.2; g.strokeText(t, x, y);
        g.shadowBlur = 0; g.fillStyle = '#fffaf2'; g.fillText(t, x, y);
      };
      if (vertical) { const n = text.length, step = h / (n + 0.6); for (let i = 0; i < n; i++) draw(text[i], w / 2, step * (i + 0.8), Math.min(w * 0.7, step * 0.9)); }
      else draw(text, w / 2, h / 2 + 6, Math.min(h * 0.62, (w * 1.5) / Math.max(3, text.length)));
    });
  }
  function neonSign(text, color, w, h, vertical = false) {
    const g = new THREE.Group();
    const back = new THREE.Mesh(new RoundedBoxGeometry(w + 0.2, h + 0.2, 0.18, 3, 0.08), vin('#2a1d4a', { rough: 0.4 }));
    back.castShadow = true;
    const tex = neonTex(text, color, vertical ? 192 : 512, vertical ? Math.round(192 * (h / w)) : Math.round(512 * (h / w)), vertical);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, color: new THREE.Color(1.25, 1.25, 1.25) }));
    face.position.z = 0.1;
    g.add(back, face); g.userData.face = face; return g;
  }

  // ---------------------------------------------------------------- rooftop props
  function waterTower(R) {
    const g = new THREE.Group();
    const wood = vin(R() < 0.5 ? '#d98b4f' : '#ff9a6a', { rough: 0.5 }), legM = vin('#5a3a8a', { rough: 0.5 });
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.4, 8), legM); l.position.set(x, 0.7, z); g.add(l); }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.5, 24), wood); tank.position.y = 2.1; g.add(tank);
    for (const y of [1.6, 2.1, 2.6]) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.87, 0.04, 6, 28), legM); band.rotation.x = Math.PI / 2; band.position.y = y; g.add(band); }
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.75, 24), vin('#7a4bd8', { rough: 0.4 })); cap.position.y = 3.22; g.add(cap);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    return g;
  }
  const blinkers = [];
  function antenna(R) {
    const g = new THREE.Group(), m = vin('#e9e2ff', { rough: 0.4 });
    const hgt = 2 + R() * 1.6;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, hgt, 8), m); pole.position.y = hgt / 2; g.add(pole);
    for (let i = 1; i <= 2; i++) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9 - i * 0.2, 6), m); bar.rotation.z = Math.PI / 2; bar.position.y = hgt * (0.5 + i * 0.18); g.add(bar); }
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff3048', toneMapped: false })); bulb.position.y = hgt + 0.06; g.add(bulb);
    blinkers.push({ m: bulb, ph: R() * 6 });
    pole.castShadow = true; return g;
  }
  function acUnit(R) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.7, 0.8, 3, 0.1), vin(R() < 0.5 ? '#dfe6ff' : '#ffe0ef', { rough: 0.45 })); box.position.y = 0.35; box.castShadow = true;
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 20), vin('#3a2d6a', { rough: 0.5 })); fan.position.set(0, 0.72, 0);
    g.add(box, fan); return g;
  }
  function hut(R, col) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new RoundedBoxGeometry(1.7, 1.6, 1.4, 3, 0.1), vin(tone(col, '#ffffff', 0.35).getStyle(), { rough: 0.45 })); b.position.y = 0.8; b.castShadow = b.receiveShadow = true;
    const door = new THREE.Mesh(new RoundedBoxGeometry(0.6, 1.05, 0.08, 2, 0.04), vin('#3a2d6a')); door.position.set(0.3, 0.55, 0.7);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffe08a', toneMapped: false })); lamp.position.set(0.3, 1.25, 0.76);
    const roof = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.14, 1.6, 2, 0.05), vin('#5a3a8a')); roof.position.y = 1.65;
    g.add(b, door, lamp, roof); void R; return g;
  }
  function plants(R) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.35, 14), vin(PAL[Math.floor(R() * PAL.length)], { rough: 0.4 })); pot.position.set(i * 0.55, 0.17, (R() - 0.5) * 0.3);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.3 + R() * 0.12, 14, 10), vin(R() < 0.5 ? '#3fcf6a' : '#7fe36a', { rough: 0.5 })); leaf.position.set(i * 0.55, 0.55, pot.position.z);
      pot.castShadow = leaf.castShadow = true; g.add(pot, leaf);
    }
    return g;
  }
  function dish(R) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), vin('#e9e2ff')); post.position.y = 0.3;
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), vin('#ffffff', { rough: 0.3, extra: { side: THREE.DoubleSide } }));
    d.rotation.x = -1.0 + R() * 0.3; d.position.y = 0.7; d.castShadow = true;
    g.add(post, d); return g;
  }
  // string of party bulbs across a gap
  const bulbGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const bulbMats = NEON.map((c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.4), toneMapped: false }));
  function stringLights(x0, x1, y, z, sag, R) {
    const g = new THREE.Group(), pts = [];
    for (let i = 0; i <= 16; i++) { const k = i / 16; pts.push(new THREE.Vector3(x0 + (x1 - x0) * k, y - Math.sin(Math.PI * k) * sag, z)); }
    const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.015, 4), vin('#2a1d4a')); g.add(wire);
    for (let i = 1; i < 8; i++) { const k = i / 8, b = new THREE.Mesh(bulbGeo, bulbMats[Math.floor(R() * bulbMats.length)]); b.position.set(x0 + (x1 - x0) * k, y - Math.sin(Math.PI * k) * sag - 0.08, z); g.add(b); }
    return g;
  }
  const hazardTex = canvasTex(32, 256, (g, w, h) => { g.fillStyle = '#ffd23a'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a1d4a'; for (let y = -w; y < h; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(0, y + 18); g.lineTo(w, y + 18 + w); g.lineTo(w, y + w); g.fill(); } });
  hazardTex.wrapT = THREE.RepeatWrapping; hazardTex.repeat.set(1, 4);
  const plankTex = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#d99a5a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,60,20,.35)'; g.lineWidth = 3; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, 8 + i * 10); g.bezierCurveTo(w * 0.3, 4 + i * 11, w * 0.6, 14 + i * 9, w, 8 + i * 10); g.stroke(); }
    g.fillStyle = '#5a3a2a'; for (const x of [14, w - 14]) for (const y of [16, h - 16]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
  });

  // alley floor far below the roofs (seen when the thief falls)
  const alley = new THREE.Mesh(new THREE.PlaneGeometry(400, 40), new THREE.MeshStandardMaterial({ color: '#5a3aa0', roughness: 0.9 }));
  alley.rotation.x = -Math.PI / 2; alley.position.y = -20; scene.add(alley);
  // ---------------------------------------------------------------- lane chunks (recycled slots)
  // chunk n covers [chunkStart(n), edgeX(n)] at roof height 0, followed by gap n of GAP_W
  function buildChunk(seed) {
    const R = mulberry(seed * 977 + 13), g = new THREE.Group();
    const nb = R() < 0.55 ? 3 : 2, ws = [];
    let left = LEN;
    for (let i = 0; i < nb; i++) { const w = i === nb - 1 ? left : Math.max(4.5, Math.min(left - 4.5 * (nb - 1 - i), LEN / nb + (R() - 0.5) * 3)); ws.push(w); left -= w; }
    let x = 0, last = -1;
    const used = [];
    ws.forEach((w, bi) => {
      let ci; do { ci = Math.floor(R() * PAL.length); } while (ci === last); last = ci;
      const col = PAL[ci], v = R() < 0.5 ? 0 : 1;
      const b = block(w, 30, 5.2, col, v, 0, R); b.position.set(x + w / 2, -15, 0); b.receiveShadow = true; g.add(b);
      // front lip with a lighter tone, back parapet
      const lip = new THREE.Mesh(new RoundedBoxGeometry(w, 0.34, 0.5, 2, 0.08), vin(tone(col, '#ffffff', 0.45).getStyle(), { rough: 0.4 })); lip.position.set(x + w / 2, -0.12, 2.62); lip.receiveShadow = true; g.add(lip);
      const par = new THREE.Mesh(new RoundedBoxGeometry(w, 0.6, 0.35, 2, 0.08), vin(tone(col, '#ffffff', 0.3).getStyle(), { rough: 0.4 })); par.position.set(x + w / 2, 0.25, -2.45); par.castShadow = par.receiveShadow = true; g.add(par);
      // a taller tower behind the lane
      if (R() < 0.6) {
        let tc; do { tc = Math.floor(R() * PAL.length); } while (tc === ci);
        const tw = Math.max(3, w * (0.45 + R() * 0.35)), th = 2.2 + R() * 4.5, tx = x + w / 2 + (R() - 0.5) * (w - tw);
        const t = block(tw, th + 30, 4.4, PAL[tc], R() < 0.5 ? 0 : 1, 0, R); t.position.set(tx, th - (th + 30) / 2, -5.6); t.receiveShadow = true; g.add(t);
        const tl = new THREE.Mesh(new RoundedBoxGeometry(tw + 0.2, 0.32, 4.6, 2, 0.08), vin(tone(PAL[tc], '#ffffff', 0.45).getStyle())); tl.position.set(tx, th, -5.6); g.add(tl);
        const r = R();
        if (r < 0.4) { const wt = waterTower(R); wt.position.set(tx + (R() - 0.5) * (tw - 2), th, -5.8); g.add(wt); }
        else if (r < 0.75) { const a = antenna(R); a.position.set(tx + (R() - 0.5) * (tw - 1), th, -5.8); g.add(a); }
        if (R() < 0.75) {
          const word = WORDS[Math.floor(R() * WORDS.length)], sw = Math.min(tw - 0.4, 0.62 * word.length + 0.6), sign = neonSign(word, NEON[Math.floor(R() * NEON.length)], sw, sw * 0.32);
          sign.position.set(tx, th - 1.1 - R() * 1.5, -3.25); g.add(sign); used.push(sign);
        }
      }
      // blade sign on the front facade
      if (R() < 0.45) {
        const word = WORDS[Math.floor(R() * WORDS.length)].slice(0, 5), sh = 0.62 * word.length + 0.3;
        const s = neonSign(word, NEON[Math.floor(R() * NEON.length)], 0.8, sh, true); s.rotation.y = 0.85;
        s.position.set(x + 0.8 + R() * (w - 1.6), -1.2 - sh / 2, 3.1); g.add(s);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.7), vin('#2a1d4a')); arm.position.set(s.position.x, -1.1, 2.8); g.add(arm);
      }
      // props near the back parapet (the running lane in front stays clear)
      const slots = Math.max(1, Math.floor(w / 3.2));
      for (let i = 0; i < slots; i++) {
        const r = R(), px = x + (i + 0.5) * (w / slots) + (R() - 0.5) * 0.6;
        if (bi === 0 && px < 3) continue;   // landing area stays free for the ×3 sign
        if (px > LEN - 2.5) continue;
        let p = null;
        if (r < 0.22) p = acUnit(R); else if (r < 0.4) p = hut(R, col); else if (r < 0.55) p = plants(R); else if (r < 0.68) p = dish(R); else if (r < 0.8) p = antenna(R); else if (r < 0.9) p = waterTower(R);
        if (!p) continue;
        p.position.set(px, 0, -1.55 - R() * 0.35); if (p.userData) p.rotation.y = (R() - 0.5) * 0.4; g.add(p);
      }
      x += w;
    });
    // hazard stripe at the edge, and the plank lying ready
    const haz = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 5.0), new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.6 }));
    haz.position.set(LEN - 0.18, 0.02, 0); g.add(haz);
    const plank = new THREE.Mesh(new RoundedBoxGeometry(3.1, 0.13, 0.95, 2, 0.04), new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.6 }));
    plank.castShadow = plank.receiveShadow = true; g.add(plank);
    // the "×3" neon sign on the landing side of the previous gap
    const x3 = neonSign('×3', '#ffe14f', 1.5, 0.95); x3.position.set(1.5, 1.35, -2.0); x3.rotation.y = 0.12; g.add(x3);
    const x3post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8), vin('#2a1d4a')); x3post.position.set(1.5, 0.45, -2.1); g.add(x3post);
    // party lights across the following gap
    g.add(stringLights(LEN, LEN + GAP_W, -1.0, -1.2, 0.35, R));
    g.add(stringLights(LEN, LEN + GAP_W, -2.3, 1.2, 0.45, R));
    void used;
    return { g, plank, x3, n: null, plankK: 0, plankWant: 0 };
  }
  const K = 5, slots = [];
  for (let s = 0; s < K; s++) { const c = buildChunk(s + 1); scene.add(c.g); slots.push(c); }
  const setPlank = (c) => { const k = ease.out(c.plankK); c.plank.position.set(LEN - 1.6 + k * 2.85, 0.065, THIEF_Z); };
  function placeChunks(camX) {
    const nc = Math.floor((camX - chunkStart(0)) / PERIOD);
    for (let n = nc - 1; n <= nc + 3; n++) {
      const c = slots[((n % K) + K) % K];
      if (c.n !== n) { c.n = n; c.g.position.x = chunkStart(n); c.plankK = 0; c.plankWant = 0; setPlank(c); }
    }
  }
  const slotOf = (n) => { const c = slots[((n % K) + K) % K]; return c.n === n ? c : null; };

  // ---------------------------------------------------------------- background rows (recycled around the camera)
  const bg = [];
  function bgRow(seed, count, span, z0, z1, h0, h1, w0, w1, far) {
    const R = mulberry(seed);
    let x = -span / 2;
    for (let i = 0; i < count; i++) {
      const w = w0 + R() * (w1 - w0), h = h0 + R() * (h1 - h0), d = 4 + R() * 6, z = z0 + R() * (z1 - z0);
      const b = block(w, h + 20, d, PAL[Math.floor(R() * PAL.length)], R() < 0.5 ? 0 : 1, far, R);
      b.position.set(0, h - (h + 20) / 2 - 2, z); scene.add(b);
      if (far === 1 && R() < 0.35) { const a = antenna(R); a.position.set(0, h - 2, z); a.scale.setScalar(1.6); b.userData.extra = a; scene.add(a); }
      if (far === 1 && R() < 0.25) { const wt = waterTower(R); wt.position.set(0, h - 2, z); b.userData.extra2 = wt; scene.add(wt); }
      b.userData.bx = x + w / 2; b.userData.span = span; bg.push(b);
      x += w + 0.4 + R() * (far === 1 ? 2.5 : 4);
      if (x > span / 2) break;
    }
  }
  bgRow(101, 40, 150, -16, -24, -2, 9, 4, 8, 1);
  bgRow(202, 40, 240, -45, -62, 4, 20, 6, 11, 2);
  bgRow(303, 40, 380, -95, -110, 8, 30, 8, 16, 3);
  function placeBg(camX) {
    for (const b of bg) {
      const { bx, span } = b.userData, x = bx + span * Math.round((camX - bx) / span);
      if (b.position.x !== x) { b.position.x = x; if (b.userData.extra) b.userData.extra.position.x = x; if (b.userData.extra2) b.userData.extra2.position.x = x + 0.5; }
    }
    for (const c of clouds) { const span = 340, bx = c.userData.bx; c.position.x = bx + camX * c.userData.par + span * Math.round((camX * (1 - c.userData.par) - bx) / span); }
    sky.position.x = camX;
  }

  // ---------------------------------------------------------------- beam shader (searchlight cones)
  const beamMat = () => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uStr: { value: 0 }, uCol: { value: new THREE.Color('#fff2b8') } },
    vertexShader: 'varying float vH; varying vec3 vN; varying vec3 vV; void main(){ vH = position.y + 0.5; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uStr; uniform vec3 uCol; varying float vH; varying vec3 vN; varying vec3 vV; void main(){ float e = pow(abs(dot(vN, vV)), 1.6); float a = uStr * e * (0.18 + 0.82 * vH * vH); gl_FragColor = vec4(uCol * a, a); }',
  });
  // unit cone: apex at y = +0.5, base at y = -0.5; the pivot's -y points along the beam
  function beam(radius) {
    const pivot = new THREE.Group();
    const m = new THREE.Mesh(new THREE.ConeGeometry(radius, 1, 40, 1, true), beamMat());
    m.position.y = -0.5; pivot.add(m); pivot.userData.cone = m; return pivot;
  }
  const DOWN = new THREE.Vector3(0, -1, 0);
  function aimBeam(pivot, from, to, radiusAtEnd) {
    const dir = new THREE.Vector3().subVectors(to, from), len = dir.length();
    pivot.position.copy(from); pivot.quaternion.setFromUnitVectors(DOWN, dir.normalize());
    const cone = pivot.userData.cone; cone.scale.set(radiusAtEnd, len, radiusAtEnd); cone.position.y = -len / 2;
  }

  // ---------------------------------------------------------------- police helicopter (vinyl toy)
  const heli = new THREE.Group(); scene.add(heli);
  const heliBody = (() => {
    const prims = [
      Ep([0, 0, 0], [1.35, 0.9, 0.85], 'body', 0.12),
      Ep([0.85, 0.1, 0], [0.74, 0.64, 0.68], 'glass', 0.14),
      Cp([-0.9, 0.2, 0], [-3.1, 0.5, 0], 0.36, 0.14, 'body', 0.25),
      Ep([-3.15, 0.95, 0], [0.34, 0.58, 0.08], 'yellow', 0.1),
      Ep([-0.15, 0.82, 0], [0.7, 0.3, 0.5], 'white', 0.12),
      Cp([0, 0.95, 0], [0, 1.25, 0], 0.1, 0.08, 'dark', 0.02),
    ];
    for (const z of [-0.62, 0.62]) {
      prims.push(Cp([0.55, -0.65, z * 0.72], [0.6, -1.08, z], 0.06, 0.06, 'dark', 0.03));
      prims.push(Cp([-0.6, -0.65, z * 0.72], [-0.6, -1.08, z], 0.06, 0.06, 'dark', 0.03));
      prims.push(Cp([-1.15, -1.1, z], [1.25, -1.1, z], 0.08, 0.08, 'dark', 0.02));
      prims.push(Cp([1.25, -1.1, z], [1.5, -0.92, z], 0.08, 0.07, 'dark', 0.02));
    }
    const cols = {}; for (const [k, v] of Object.entries({ body: '#2f6dff', glass: '#8ff1ff', yellow: '#ffc531', white: '#ffffff', dark: '#1d1640' })) cols[k] = new THREE.Color(v);
    const white = new THREE.Color('#ffffff'), gold = new THREE.Color('#ffc531');
    const geo = meshSDF(makeShape(prims), 100, cols, (x, y, z, key, c) => {
      if (key === 'body' && x > -1.6 && Math.abs(y + 0.12) < 0.13) c.copy(white);
      if (key === 'body' && x < -1.0 && x > -1.6 && Math.abs(z) > 0.2) c.copy(gold);
      if (key === 'body' && Math.abs(z) > 0.6 && x > -0.7 && x < 0.1 && y > 0.06 && y < 0.5) { const dx = x + 0.3, dy = y - 0.28, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy); if (r < 0.13 + 0.07 * Math.cos(a * 5)) c.copy(gold); }
      return c;
    }, null, 2);
    const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, envMap: S.env, envMapIntensity: 0.7 }));
    m.castShadow = true; return m;
  })();
  heli.add(heliBody);
  const rotor = new THREE.Group(); rotor.position.set(0, 1.3, 0); heli.add(rotor);
  const bladeM = vin('#1d1640', { rough: 0.3 });
  for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new RoundedBoxGeometry(5.6, 0.06, 0.26, 2, 0.03), bladeM); b.rotation.y = (i * Math.PI) / 2; rotor.add(b); }
  rotor.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), vin('#ffc531')));
  const blur = new THREE.Mesh(new THREE.CircleGeometry(2.8, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
  blur.rotation.x = -Math.PI / 2; rotor.add(blur);
  const tailRotor = new THREE.Group(); tailRotor.position.set(-3.2, 0.95, 0.16); heli.add(tailRotor);
  for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.12, 0.04, 2, 0.02), bladeM); b.rotation.z = (i * Math.PI) / 2; tailRotor.add(b); }
  const sirenR = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff2a4a', toneMapped: false }));
  const sirenB = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshBasicMaterial({ color: '#2a8cff', toneMapped: false }));
  sirenR.position.set(-0.1, 1.08, 0.24); sirenB.position.set(-0.1, 1.08, -0.24); heli.add(sirenR, sirenB);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.26, 14), new THREE.MeshBasicMaterial({ color: '#fff4c0', toneMapped: false }));
  lamp.position.set(1.05, -0.62, 0); heli.add(lamp);
  heli.scale.setScalar(0.85);
  const heliBeam = beam(1); scene.add(heliBeam);
  const spot = new THREE.SpotLight('#fff3c4', 0, 40, 0.3, 0.55, 1); scene.add(spot, spot.target);
  const spotDisc = new THREE.Mesh(new THREE.CircleGeometry(1.3, 40), new THREE.MeshBasicMaterial({ map: glowTex, color: '#fff2b8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  spotDisc.rotation.x = -Math.PI / 2; scene.add(spotDisc);

  // ---------------------------------------------------------------- the thief
  const thief = createThief(S.env);
  scene.add(thief.root);
  thief.root.position.set(0, 0, THIEF_Z);

  // ---------------------------------------------------------------- particles: confetti, coins, dust
  function pool(geo, mat, n) {
    const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.castShadow = false; scene.add(m);
    const items = Array.from({ length: n }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 1, g: 9 }));
    const col = new THREE.Color(); for (let i = 0; i < n; i++) m.setColorAt(i, col.set('#ffffff'));
    let next = 0;
    return {
      m, items,
      spawn(pos, vel, color, s = 1, life = 1.6, g = 9) { const it = items[next]; next = (next + 1) % n; it.life = life; it.max = life; it.p.copy(pos); it.v.copy(vel); it.s = s; it.g = g; it.r.set(Math.random() * 6, Math.random() * 6, 0); it.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, 0); m.setColorAt(next === 0 ? n - 1 : next - 1, col.set(color)); m.instanceColor.needsUpdate = true; },
      update(dt, grow) {
        const o = new THREE.Object3D();
        items.forEach((it, i) => {
          if (it.life > 0) { it.life -= dt; it.v.y -= it.g * dt; it.v.multiplyScalar(1 - dt * 0.6); it.p.addScaledVector(it.v, dt); it.r.x += it.w.x * dt; it.r.y += it.w.y * dt; }
          const k = Math.max(0, it.life / (it.max || 1));
          o.position.copy(it.p); o.rotation.copy(it.r);
          o.scale.setScalar(it.life > 0 ? it.s * (grow ? (1 - k) * 1.6 + 0.2 : Math.min(1, k * 4)) : 0);
          o.updateMatrix(); m.setMatrixAt(i, o.matrix);
        });
        m.instanceMatrix.needsUpdate = true;
      },
    };
  }
  const confetti = pool(new THREE.BoxGeometry(0.16, 0.16, 0.035), new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: '#333333' }), 360);
  const coins = pool(new THREE.CylinderGeometry(0.15, 0.15, 0.045, 18), new THREE.MeshPhysicalMaterial({ color: '#ffc531', metalness: 0.25, roughness: 0.25, clearcoat: 1, emissive: '#a86a00', emissiveIntensity: 0.35, envMapIntensity: 1 }), 120);
  const dust = pool(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff0f6', roughness: 1, transparent: true, opacity: 0.55, depthWrite: false }), 60);
  function burst(pos, n, palette, speed = 6, up = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
      confetti.spawn(pos, new THREE.Vector3(Math.cos(a) * s, up * (0.5 + Math.random()), Math.sin(a) * s * 0.6), palette[i % palette.length], 1, 1.6 + Math.random(), 7);
    }
  }
  function coinShower(pos, n) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2; const s = 1.5 + Math.random() * 2.5; coins.spawn(pos, new THREE.Vector3(Math.cos(a) * s, 4 + Math.random() * 3.5, Math.sin(a) * s * 0.6), '#ffc531', 1, 1.6, 11); }
  }

  // ---------------------------------------------------------------- labels: pops and the countdown ring
  const pops = [];
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  function pop(text, cls = '') {
    const el = document.createElement('div'); el.className = 'plabel pop ' + cls; el.innerHTML = '<b>' + text + '</b>'; host.appendChild(el);
    pops.push({ el, t: 0 });
  }
  const ringEl = document.createElement('div'); ringEl.className = 'jring'; ringEl.hidden = true;
  ringEl.innerHTML = '<svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="42"/><circle class="fg" cx="50" cy="50" r="42" pathLength="100"/></svg><b>×3</b><small>JUMP</small>';
  host.appendChild(ringEl);
  const ringFg = ringEl.querySelector('.fg'), ringB = ringEl.querySelector('b'), ringS = ringEl.querySelector('small');
  let ringN = null;

  // ---------------------------------------------------------------- state and frame loop
  let lastEdge = null, mode = 'idle', tx = 0, ty = 0, prevStep = 0, rootYaw = -Math.PI + 0.6, act = null, slow = 1, dim = 0, dimWant = 0, flip = 0;
  let heliYaw = 0, heliMode = 'patrol', heliT = 0, heliFrom = new THREE.Vector3(), beamAim = new THREE.Vector3(), beamStr = 0.55, spotWant = 0;
  const cam = { p: new THREE.Vector3(3, 4, 13), l: new THREE.Vector3(3.5, 0.7, -1) };
  let snap = true, shake = 0, time = 0, x3Glow = null;
  const baseSun = S.sun.intensity, baseHemi = S.hemi.intensity;

  function camWant(out) {
    const a = camera.aspect, mob = a < 1.05;
    let px = tx + (mob ? 1.6 : 2.6), py = (mob ? 3.5 : 3.3), pz = mob ? 9.8 : 11.0;
    let lx = tx + (mob ? 1.8 : 3.0), ly = mob ? 1.25 : 1.55, lz = -1.4;
    // frame the next gap as the thief gets close to it
    if (mode === 'run' || mode === 'idle') {
      const e = edgeX(Math.ceil((tx - E0) / PERIOD - 1e-6)), de = e - tx;
      const k = Math.max(0, Math.min(1, (11 - de) / 5)), kk = k * k * (3 - 2 * k);
      const cx = tx + (e + GAP_W / 2 - tx) * 0.52;
      px += (cx - 0.3 - px) * kk; lx += (cx - lx) * kk; pz += kk * (mob ? 1.6 : 1.2);
    }
    if (mode === 'jump' && act) { const mid = act.edge + GAP_W / 2; px = mid + (mob ? 0.4 : 1.2); lx = mid + 0.6; pz -= mob ? 0.8 : 1.6; py -= 0.3; ly = 1.7 + Math.max(0, ty) * 0.35; }
    if (mode === 'fall' || (mode === 'jump' && ty < -0.3)) { const yy = Math.max(-8, ty), g = (lastEdge ?? tx) + GAP_W / 2; py = (mob ? 7.5 : 6.4); ly = yy * 0.75 - 0.3; px = g + 0.6; lx = g + 0.2; pz += mob ? 0.5 : 1.0; lz = THIEF_Z - 0.5; }
    if (mode === 'caught') { py += 1.3; pz += mob ? 3.5 : 2.4; ly += 1.6; px -= 0.6; lx += 0.2; }
    if (mode === 'cash') { pz -= 1.6; py -= 0.4; lx -= 1.2; px -= 1.6; ly = 0.9; }
    out.p.set(px, py, pz); out.l.set(lx, ly, lz); return out;
  }
  const want = { p: new THREE.Vector3(), l: new THREE.Vector3() };

  S.onFrame((dtReal) => {
    const dt = dtReal * slow; time += dt;
    // ---- thief motion
    const th = thief.root, inner = thief.inner;
    if (act) act.update(dt);
    th.position.set(tx, ty, THIEF_Z);
    const yawWant = mode === 'run' || mode === 'jump' || mode === 'fall' ? 0.97 : -0.15 - (mode === 'idle' ? 2.39 : 0);
    rootYaw += (yawWant - rootYaw) * (1 - Math.exp(-dt * 8));
    th.rotation.y = rootYaw;
    thief.update(dt, time);
    inner.position.x = 0; inner.position.z = 0;   // the flip pivot below offsets these
    if (mode === 'run') {
      const ph = (tx / 0.95) * Math.PI, step = Math.floor(ph / Math.PI);
      inner.position.y += Math.abs(Math.sin(ph)) * 0.24;
      inner.rotateX(0.24); inner.rotateZ(Math.sin(ph) * 0.13);
      inner.scale.y *= 1 + Math.cos(ph * 2) * 0.05;
      if (step !== prevStep) { prevStep = step; dust.spawn(tmp.set(tx - 0.35, 0.1, THIEF_Z + (Math.random() - 0.5) * 0.3), tmp2.set(-1.2 - Math.random(), 0.5, (Math.random() - 0.5) * 0.5), '#fff0f6', 0.45 + Math.random() * 0.3, 0.4, 0); opts.onStep && opts.onStep(); }
    }
    if (flip) {
      inner.rotateX(flip);
      const c = tmp.set(0, 0.7, 0), r = tmp2.set(0, 0.7, 0).applyQuaternion(inner.quaternion);
      inner.position.add(c.sub(r).multiplyScalar(1));
    }
    // ---- planks: slide across when the thief comes close to an edge without jumping
    for (const c of slots) {
      if (c.n === null) continue;
      const e = edgeX(c.n);
      if (mode === 'run' && tx > e - 1.5 && tx < e + 0.5) c.plankWant = 1;
      const was = c.plankK;
      c.plankK += (c.plankWant - c.plankK) * (1 - Math.exp(-dt * 12));
      if (Math.abs(c.plankK - was) > 1e-4) setPlank(c);
      if (was < 0.9 && c.plankK >= 0.9 && c.plankWant === 1) opts.onPlank && opts.onPlank();
    }
    // ---- ×3 sign glow
    for (const c of slots) {
      const on = x3Glow !== null && c.n === x3Glow + 1;
      const f = c.x3.userData.face.material.color, k = on ? 1.6 + Math.sin(time * 14) * 0.5 : 1.15;
      f.setScalar(f.r + (k - f.r) * (1 - Math.exp(-dt * 10)));
    }
    // ---- helicopter
    heliT += dt;
    rotor.rotation.y += dt * 38; tailRotor.rotation.z += dt * 45;
    const blink = Math.floor(time * 6) % 2;
    sirenR.material.color.setScalar(0).setRGB(blink ? 2 : 0.35, blink ? 0.2 : 0.05, blink ? 0.35 : 0.08);
    sirenB.material.color.setRGB(blink ? 0.05 : 0.2, blink ? 0.12 : 0.6, blink ? 0.35 : 2);
    const patrol = tmp.set(tx + 6 + Math.sin(time * 0.17) * 9, 8.2 + Math.sin(time * 0.8) * 0.4, -20);
    if (heliMode === 'patrol') {
      heli.position.lerp(patrol, 1 - Math.exp(-dt * 1.5));
      const yw = Math.cos(time * 0.17) > 0 ? -0.35 : Math.PI + 0.35; heliYaw += (yw - heliYaw) * (1 - Math.exp(-dt * 1.2)); heli.rotation.set(0.05, heliYaw, Math.sin(time * 0.8) * 0.05);
      beamAim.set(heli.position.x + Math.sin(time * 0.55) * 6, -6, heli.position.z + 6 + Math.sin(time * 0.31) * 3);
      beamStr += (0.5 - beamStr) * (1 - Math.exp(-dt * 3));
    } else {
      const k = Math.min(1, heliT / 1.4), e = ease.inOut(k);
      const hover = tmp2.set(tx + (camera.aspect < 1.05 ? 2.6 : 3.6), 3.7 + Math.sin(time * 1.3) * 0.12, -0.9);
      heli.position.lerpVectors(heliFrom, hover, e);
      heliYaw += (Math.PI + 0.55 - heliYaw) * (1 - Math.exp(-dt * 4)); heli.rotation.set(0.12 - 0.25 * (1 - e) * Math.sin(Math.PI * k), heliYaw, -0.08 + Math.sin(time * 1.1) * 0.03);
      // the light sweeps over the roof, then locks onto the thief
      const sweep = Math.max(0, 1 - heliT / 1.6);
      beamAim.set(tx + sweep * 7 * Math.cos(heliT * 3), 0, THIEF_Z + sweep * 2 * Math.sin(heliT * 4));
      beamStr += (1.1 - beamStr) * (1 - Math.exp(-dt * 5));
    }
    heli.updateMatrixWorld(true);
    const lampW = lamp.getWorldPosition(new THREE.Vector3());
    aimBeam(heliBeam, lampW, beamAim, heliMode === 'patrol' ? 2.6 : 1.25);
    heliBeam.userData.cone.material.uniforms.uStr.value = beamStr;
    spot.position.copy(lampW); spot.target.position.copy(beamAim);
    spot.intensity += (spotWant - spot.intensity) * (1 - Math.exp(-dt * 6));
    spotDisc.position.set(beamAim.x, 0.04, beamAim.z); spotDisc.material.opacity = heliMode === 'patrol' ? 0 : Math.min(0.95, 0.25 + spot.intensity / 60);
    dim += (dimWant - dim) * (1 - Math.exp(-dt * 3));
    S.sun.intensity = baseSun * (1 - dim * 0.5); S.hemi.intensity = baseHemi * (1 - dim * 0.4);
    // ---- blinkers, particles
    for (const b of blinkers) b.m.visible = Math.sin(time * 3 + b.ph) > -0.2;
    confetti.update(dt); coins.update(dt); dust.update(dt, true);
    // ---- world placement and camera
    camWant(want);
    if (snap) { cam.p.copy(want.p); cam.l.copy(want.l); snap = false; }
    else { const k = 1 - Math.exp(-dtReal * (mode === 'run' ? 5 : 3)); cam.p.lerp(want.p, k); cam.l.lerp(want.l, k); }
    placeChunks(cam.p.x); placeBg(cam.p.x); alley.position.x = cam.p.x;
    camera.position.copy(cam.p);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dtReal * 1.2); }
    camera.lookAt(cam.l);
    S.sun.position.set(tx - 8, 13, 10); S.sun.target.position.set(tx + 3, 0, -1);
    S.rim.position.set(tx + 10, 8, -12);
    // ---- labels
    for (let i = pops.length - 1; i >= 0; i--) {
      const q = pops[i]; q.t += dtReal;
      const p = S.toScreen(tmp.set(tx, ty + 1.9 + q.t * 0.7, THIEF_Z));
      q.el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-100%) scale(${Math.min(1, q.t * 5).toFixed(2)})`;
      q.el.style.opacity = String(Math.max(0, Math.min(1, 2.4 - q.t)));
      if (q.t > 2.4) { q.el.remove(); pops.splice(i, 1); }
    }
    if (ringN !== null) {
      const p = S.toScreen(tmp.set(edgeX(ringN) + GAP_W / 2, 2.3, THIEF_Z));
      const m = ringEl.offsetWidth * 0.55 + 6, x = Math.max(m, Math.min(canvas.clientWidth - m, p.x)), y = Math.max(m + 70, Math.min(canvas.clientHeight - m, p.y));
      ringEl.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`;
    }
  });

  // ---------------------------------------------------------------- actions
  function stopAct() { if (act && act.res) act.res(); act = null; }
  const api = {
    S, thief, edgeX, layout: { SPEED, GAP_W, LAND, PERIOD, E0, LEN },
    reset() {
      stopAct(); mode = 'idle'; tx = 0; ty = 0; flip = 0; slow = 1; snap = true; x3Glow = null;
      thief.mood('idle'); rootYaw = -Math.PI + 0.6;
      for (const c of slots) { c.n = null; }
      heliMode = 'patrol'; spotWant = 0; spot.intensity = 0; dimWant = 0; heli.position.set(tx - 2, 10.5, -24);
      api.ring(null); for (const q of pops) q.el.remove(); pops.length = 0;
    },
    run(x) { if (mode !== 'run') { mode = 'run'; thief.mood('happy'); } tx = x; ty = 0; },
    ring(n, k = 0, sub = 'JUMP') {
      if (n === null || n === undefined) { ringN = null; ringEl.hidden = true; x3Glow = null; return; }
      ringN = n; x3Glow = n; ringEl.hidden = false;
      ringFg.style.strokeDashoffset = String(100 * k);
      ringEl.classList.toggle('late', k > 0.7);
      ringB.textContent = '×3'; ringS.textContent = sub;
    },
    jump(n, ok, max) {
      return new Promise((res) => {
        stopAct(); api.ring(null); x3Glow = n;
        const edge = edgeX(n), x0 = tx; lastEdge = edge; const land = edge + GAP_W + LAND, wall = edge + GAP_W - 0.42;
        const c = slotOf(n); if (c) c.plankWant = 0;
        mode = 'jump'; thief.mood('scared');
        const dash = Math.max(0.1, (edge - 0.15 - x0) / 13);
        let t = 0, stage = 'dash', hang = 0, vy = 0, landed = false;
        opts.onJump && opts.onJump();
        act = {
          edge, res,
          update(dt) {
            t += dt;
            if (stage === 'dash') {
              const k = Math.min(1, t / dash); tx = x0 + (edge - 0.15 - x0) * k; ty = 0;
              if (k >= 1) { stage = 'fly'; t = 0; }
            } else if (stage === 'fly') {
              const F = ok ? 1.05 : 0.9, k = Math.min(1, t / F);
              slow = reduce ? 1 : 1 - 0.72 * Math.exp(-Math.pow((k - 0.5) / 0.2, 2));
              if (ok) { tx = edge - 0.15 + (land - edge + 0.15) * k; ty = Math.sin(Math.PI * k) * 2.7; flip = ease.inOut(k) * Math.PI * 2; }
              else { tx = edge - 0.15 + (wall - edge + 0.15) * ease.out(k); ty = -1.0 * k + Math.sin(Math.PI * k * 0.92) * 1.7; flip = 0; }
              if (k >= 1) {
                slow = 1; flip = 0; t = 0;
                if (ok) { stage = 'land'; ty = 0; thief.mood('happy'); shake = 0.18; burst(tmp.set(tx, 0.6, THIEF_Z), max ? 160 : 70, ['#ffc531', '#ff5fa2', '#4fc8ff', '#7fe36a', '#ffffff', '#9a7bff'], max ? 9 : 6, max ? 9 : 6); pop(max ? 'MAX WIN' : '×3!', 'win'); opts.onLand && opts.onLand(); }
                else { stage = 'hang'; shake = 0.25; opts.onBonk && opts.onBonk(); pop('MISSED', 'bad'); }
              }
            } else if (stage === 'land') {
              if (t > 0.5 && !landed) { landed = true; act = null; mode = 'land'; res(); }
            } else if (stage === 'hang') {
              hang += dt; tx = wall + Math.sin(time * 40) * 0.015;
              if (hang > 0.55) { stage = 'drop'; mode = 'fall'; opts.onFall && opts.onFall(); }
            } else if (stage === 'drop') {
              vy -= 16 * dt; ty += vy * dt; tx -= dt * 0.3; flip -= dt * 2.5;
              if (ty < -16) { act = null; res(); }
            }
          },
        };
      });
    },
    cash(big) {
      stopAct(); mode = 'cash'; api.ring(null); thief.mood('happy'); ty = 0;
      coinShower(tmp.set(tx, 1.2, THIEF_Z), big ? 110 : 40);
      if (big) burst(tmp.set(tx, 1, THIEF_Z), 220, ['#ffc531', '#ff5fa2', '#4fc8ff', '#7fe36a', '#ffffff', '#9a7bff'], 9, 10);
    },
    caught() {
      return new Promise((res) => {
        stopAct(); mode = 'caught'; api.ring(null); thief.mood('scared'); ty = 0;
        heliMode = 'chase'; heliT = 0; heliFrom.copy(heli.position); dimWant = 1;
        setTimeout(() => { spotWant = 70; shake = 0.12; pop('CAUGHT', 'bad'); }, reduce ? 50 : 1250);
        setTimeout(res, reduce ? 200 : 1900);
      });
    },
    pop,
    // world position of the thief on screen (for tests and the page)
    thiefScreen() { return S.toScreen(tmp.set(tx, ty + 1, THIEF_Z)); },
  };
  api.reset();
  return api;
}
