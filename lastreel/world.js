// LAST REEL world: a big glossy toy slot cabinet with five spinning drums of 3D vinyl symbols, neon, chasing bulbs,
// glowing win paths and a coin shower. Reel 5 can keep turning slowly inside a glowing frame.
//   const W = createWorld(canvas, { strips, lines, onTick(reel), onButton(name) })
//   W.setStops(stops)                     place all reels at once
//   W.spinAll()                           every reel spins up
//   await W.stopReel(r, stop, { dmin })   decelerate reel r onto that stop with a bounce
//   W.slow5(on) / W.glow5(level)          reel 5 creeps slowly; frame glow 0 off, 1 offer, 2 doubled
//   W.candidates([{ line, row }])         paths of the lines reel 5 can still complete, plus target frames
//   W.showWin(win) / W.clearWins()        one win: glowing path, cell frames, bouncing symbols
//   W.coins(n)  W.celebrate(level)  W.setDisplay(a, b)  W.buttons({ spin, dbl })  W.kit.thumbs()
import { THREE, createStage, canvasTex, radialTex, wait, ease, reduce, mulberry } from '../lib/stage.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createSymbolKit } from './symbols.js';

const R = 2.2, STEP = Math.PI / 6, PITCH = R * Math.sin(STEP), RX = 1.36, WW = 5 * RX + 0.08, WH = 3.5;
const FACE_Z = R + 0.32, FACE_D = 0.3, FRONT = FACE_Z + FACE_D + 0.12, PATH_Z = R + 0.52;
const PANEL_W = 8.7, PANEL_B = -2.15, PANEL_T = 2.15;
export const LINE_COLORS = ['#ffe14d', '#3ff0ff', '#ff5fd2', '#7dff6a', '#ff9a3d', '#a98bff', '#ff4d6d', '#4dffc3', '#ffd0f0', '#5fa8ff'];
const reelX = (r) => (r - 2) * RX;
const rowY = (row) => (1 - row) * PITCH;
const mod = (a, n) => ((a % n) + n) % n;

function rrect(w, h, r, cx = 0, cy = 0, path = new THREE.Shape()) {
  const x = cx - w / 2, y = cy - h / 2;
  path.moveTo(x + r, y); path.lineTo(x + w - r, y); path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r); path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h); path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r); path.quadraticCurveTo(x, y, x + r, y);
  return path;
}
function ringTube(w, h, r, tube, z = 0) {
  const pts = rrect(w, h, r).getSpacedPoints(160).map((p) => new THREE.Vector3(p.x, p.y, z));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 220, tube, 8, true);
}
const glowMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, toneMapped: false, depthWrite: false });

export function createWorld(canvas, opts = {}) {
  const strips = opts.strips, lines = opts.lines;
  const S = createStage(canvas, {
    sky: '#4a22c4', exposure: 1.0, envIntensity: 0.6, hemi: 0.95, hemiSky: '#fff1fb', hemiGround: '#7c4dff', sun: 2.5, shadowSize: 6.5,
    sunColor: '#fff4e0', rim: 1.0, rimColor: '#7ff6ff',
    bloom: [0.32, 0.42, 0.9],
    fov: (a) => (a < 0.8 ? 38 : a < 1.25 ? 34 : 30),
  });
  const { scene, camera } = S;
  const Rnd = mulberry(23);
  const kit = createSymbolKit();

  // ---------------------------------------------------------------- backdrop: glowing lounge wall + bokeh
  const wallTex = canvasTex(512, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2c0f8c'); gr.addColorStop(0.55, '#6a2be0'); gr.addColorStop(1, '#ff4fb0');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const rg = g.createRadialGradient(w / 2, h * 0.5, 10, w / 2, h * 0.5, w * 0.55); rg.addColorStop(0, 'rgba(255,214,120,.55)'); rg.addColorStop(1, 'rgba(255,214,120,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 3; for (let x = -h; x < w; x += 36) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + h, 0); g.stroke(); }
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(70, 42), new THREE.MeshBasicMaterial({ map: wallTex, toneMapped: false }));
  wall.position.set(0, 1, -9); scene.add(wall);
  const rad = radialTex(), bokeh = [];
  const BOKEH = ['#ff5fd2', '#3ff0ff', '#ffe14d', '#7dff6a', '#a98bff', '#ff9a3d'];
  for (let i = 0; i < 46; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: rad, color: BOKEH[i % BOKEH.length], transparent: true, opacity: 0.25 + Rnd() * 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    const s = 0.6 + Rnd() * 1.8; m.scale.set(s, s, 1);
    m.position.set((Rnd() - 0.5) * 30, -5 + Rnd() * 14, -8 + Rnd() * 4); m.userData = { y: m.position.y, ph: Rnd() * 6, sp: 0.2 + Rnd() * 0.4 };
    scene.add(m); bokeh.push(m);
  }
  // floating decor symbols beside the cabinet (seen on wide screens)
  const decor = [];
  for (const [i, x, y, z, s] of [[7, -7.4, 2.4, -1.5, 1.5], [6, -6.3, -1.2, 0, 1.1], [0, -8.6, -0.2, -3, 1.2], [8, 7.3, 2.2, -1.2, 1.5], [4, 6.4, -1.4, 0, 1.15], [5, 8.8, 0.3, -3, 1.2], [2, -9.5, 3.6, -4, 1], [3, 9.8, 3.8, -4, 1]]) {
    const g = kit.make(i); g.scale.setScalar(s); g.position.set(x, y, z); g.userData = { y, ph: Rnd() * 6 }; scene.add(g); decor.push(g);
  }

  // ---------------------------------------------------------------- cabinet
  const pink = S.vinyl('#ff4f9e', { rough: 0.28 }), violet = S.vinyl('#6a35ff', { rough: 0.3 }), deep = S.vinyl('#3a1690', { rough: 0.45, coat: 0.4 });
  const gold = new THREE.MeshPhysicalMaterial({ color: '#ffb81f', metalness: 0.7, roughness: 0.3, clearcoat: 1, envMapIntensity: 0.9 });
  const cab = new THREE.Group(); scene.add(cab);
  // face panel with the reel window cut out
  const faceShape = rrect(PANEL_W, PANEL_T - PANEL_B, 0.55, 0, (PANEL_T + PANEL_B) / 2);
  faceShape.holes.push(rrect(WW + 0.2, WH + 0.2, 0.32, 0, 0, new THREE.Path()));
  const face = new THREE.Mesh(new THREE.ExtrudeGeometry(faceShape, { depth: FACE_D, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 5, curveSegments: 20 }), pink);
  face.position.z = FACE_Z; face.castShadow = face.receiveShadow = true; cab.add(face);
  // gold window trim and neon
  const trimShape = rrect(WW + 0.3, WH + 0.3, 0.36); trimShape.holes.push(rrect(WW + 0.02, WH + 0.02, 0.26, 0, 0, new THREE.Path()));
  const trim = new THREE.Mesh(new THREE.ExtrudeGeometry(trimShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 4, curveSegments: 18 }), gold);
  trim.position.z = FRONT - 0.02; trim.castShadow = true; cab.add(trim);
  const neonMat = glowMat('#5ff6ff');
  const neon = new THREE.Mesh(ringTube(WW + 0.6, WH + 0.6, 0.5, 0.045), neonMat); neon.position.z = FRONT + 0.02; cab.add(neon);
  const neon2Mat = glowMat('#ffe14d');
  const neon2 = new THREE.Mesh(ringTube(PANEL_W - 0.25, PANEL_T - PANEL_B - 0.25, 0.45, 0.04), neon2Mat); neon2.position.set(0, (PANEL_T + PANEL_B) / 2, FRONT + 0.0); cab.add(neon2);
  // the reel well behind the window
  const well = new THREE.Mesh(new THREE.BoxGeometry(WW + 0.3, WH + 0.3, FACE_Z + 1.2), new THREE.MeshStandardMaterial({ color: '#1e0b52', roughness: 0.7, side: THREE.BackSide }));
  well.position.z = (FACE_Z - 1.2) / 2 - 0.3 + 0.25; well.receiveShadow = true; cab.add(well);
  // body, side pillars, topper, console
  const body = new THREE.Mesh(new RoundedBoxGeometry(PANEL_W + 0.2, 12, 3.2, 4, 0.4), violet); body.position.set(0, -2.6, -0.4); body.receiveShadow = true; cab.add(body);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new RoundedBoxGeometry(0.62, PANEL_T - PANEL_B + 0.5, 3.6, 4, 0.28), violet); p.position.set(s * (PANEL_W / 2 + 0.18), (PANEL_T + PANEL_B) / 2, FACE_Z - 1.5); p.castShadow = p.receiveShadow = true; cab.add(p);
  }
  const topper = new THREE.Mesh(new RoundedBoxGeometry(PANEL_W - 0.1, 1.62, 1.3, 5, 0.42), violet); topper.position.set(0, PANEL_T + 0.86, FACE_Z - 0.2); topper.castShadow = true; cab.add(topper);
  const signTex = canvasTex(1024, 180, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#2a0d85'); gr.addColorStop(0.5, '#4b1bc4'); gr.addColorStop(1, '#2a0d85');
    g.fillStyle = gr; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 40); g.fill();
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + Rnd() * 0.4})`; g.beginPath(); g.arc(Rnd() * w, Rnd() * h, 1 + Rnd() * 2.5, 0, 7); g.fill(); }
    g.font = '128px "Lilita One","Arial Rounded MT Bold",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 22; g.strokeStyle = '#1d1640'; g.strokeText('LAST REEL', w / 2, h / 2 + 10);
    const tg = g.createLinearGradient(0, 30, 0, h - 30); tg.addColorStop(0, '#fff3a0'); tg.addColorStop(0.5, '#ffd21f'); tg.addColorStop(1, '#ff8a1f');
    g.fillStyle = tg; g.fillText('LAST REEL', w / 2, h / 2 + 10);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.3, 1.28), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false }));
  sign.position.set(0, PANEL_T + 0.86, FACE_Z + 0.46); cab.add(sign);
  // console ledge with arcade buttons and a little LCD
  const ledge = new THREE.Group(); ledge.position.set(0, PANEL_B - 0.42, FACE_Z + 0.35); ledge.rotation.x = 0.55; cab.add(ledge);
  const ledgeBox = new THREE.Mesh(new RoundedBoxGeometry(PANEL_W + 0.3, 0.42, 2.0, 4, 0.18), violet); ledgeBox.castShadow = ledgeBox.receiveShadow = true; ledge.add(ledgeBox);
  const btnTex = (label, bg, fg) => canvasTex(256, 256, (g, w) => { g.fillStyle = bg; g.fillRect(0, 0, w, w); g.translate(w / 2, w / 2); g.rotate(-Math.PI / 2); g.translate(-w / 2, -w / 2); g.font = (label.length > 4 ? 58 : 84) + 'px "Lilita One","Arial Rounded MT Bold",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.lineJoin = 'round'; g.strokeStyle = '#1d1640'; g.strokeText(label, w / 2, w / 2 + 4); g.fillStyle = fg; g.fillText(label, w / 2, w / 2 + 4); });
  function arcadeButton(label, color, x, r) {
    const g = new THREE.Group(); g.position.set(x, 0.21, 0.1);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.1, r + 0.14, 0.12, 40), gold); ring.position.y = 0.04; g.add(ring);
    const tex = btnTex(label, color, '#ffffff');
    const capMats = [S.vinyl(color, { rough: 0.22 }), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.25, clearcoat: 1, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.12 }), S.vinyl(color)];
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.22, 40), capMats); cap.position.y = 0.18; cap.castShadow = true; g.add(cap);
    g.userData = { cap, mats: capMats, label, color, y0: 0.18 };
    ledge.add(g); return g;
  }
  const spinBtn = arcadeButton('SPIN', '#ff2e63', 2.6, 0.55), dblBtn = arcadeButton('DOUBLE', '#ffb321', 1.0, 0.45);
  const pickables = [spinBtn.userData.cap, dblBtn.userData.cap];
  spinBtn.userData.cap.userData.name = 'spin'; dblBtn.userData.cap.userData.name = 'double';
  let lcdText = ['', ''];
  const lcdCanvas = document.createElement('canvas'); lcdCanvas.width = 512; lcdCanvas.height = 128;
  const lcdTex = new THREE.CanvasTexture(lcdCanvas); lcdTex.colorSpace = THREE.SRGBColorSpace;
  function drawLcd() {
    const g = lcdCanvas.getContext('2d'), w = 512, h = 128;
    g.fillStyle = '#12073a'; g.beginPath(); g.roundRect(0, 0, w, h, 24); g.fill();
    g.strokeStyle = '#5ff6ff'; g.lineWidth = 6; g.beginPath(); g.roundRect(5, 5, w - 10, h - 10, 20); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '800 26px Nunito,system-ui,sans-serif'; g.fillStyle = '#9fe9ff'; g.fillText(lcdText[0], w / 2, 36);
    g.font = '54px "Lilita One","Arial Rounded MT Bold",sans-serif'; g.fillStyle = '#ffe14d'; g.fillText(lcdText[1], w / 2, 84);
    lcdTex.needsUpdate = true;
  }
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: lcdTex, toneMapped: false }));
  lcd.rotation.x = -Math.PI / 2; lcd.position.set(-2.2, 0.215, 0.05); ledge.add(lcd);

  // chasing bulbs: around the sign and up both sides of the face
  const bulbPos = [];
  rrect(PANEL_W - 0.45, 1.5, 0.4, 0, 0).getSpacedPoints(46).slice(0, -1).forEach((p) => bulbPos.push(new THREE.Vector3(p.x, PANEL_T + 0.86 + p.y, FACE_Z + 0.48)));
  for (const s of [-1, 1]) for (let i = 0; i < 12; i++) bulbPos.push(new THREE.Vector3(s * (PANEL_W / 2 + 0.18), PANEL_B + 0.05 + i * ((PANEL_T - PANEL_B - 0.1) / 11), FACE_Z + 0.42));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 12, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbPos.length);
  const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();
  bulbPos.forEach((p, i) => { tmpM.makeTranslation(p.x, p.y, p.z); bulbs.setMatrixAt(i, tmpM); bulbs.setColorAt(i, tmpC.set('#ffffff')); });
  cab.add(bulbs);
  let bulbMode = 0, bulbBoost = 0;   // 0 idle chase, 1 reel-5 window (gold pulse), 2 doubled
  const BULB_COLS = ['#ffe14d', '#ff5fd2', '#3ff0ff'].map((c) => new THREE.Color(c));

  // line number badges on both sides of the window
  const badgeOrder = lines.map((L, i) => i).sort((a, b) => lines[a][0] - lines[b][0] || a - b);
  const badgeOrderR = lines.map((L, i) => i).sort((a, b) => lines[a][4] - lines[b][4] || a - b);
  const badgeGeo = new THREE.CircleGeometry(0.15, 24), badges = [];
  for (const [side, order] of [[-1, badgeOrder], [1, badgeOrderR]]) order.forEach((li, k) => {
    const tex = canvasTex(64, 64, (g, w) => { g.fillStyle = LINE_COLORS[li]; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill(); g.lineWidth = 5; g.strokeStyle = '#1d1640'; g.stroke(); g.fillStyle = '#1d1640'; g.font = '900 30px Nunito,system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(li + 1), 32, 34); });
    const b = new THREE.Mesh(badgeGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    b.position.set(side * (WW / 2 + 0.47), 1.62 - k * 0.36, FRONT + 0.03); b.userData = { li, side }; cab.add(b); badges.push(b);
  });

  // ---------------------------------------------------------------- reels: drums + recycled symbol holders
  const drumTex = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#f3ebff'; g.fillRect(0, 0, w, h);
    const cw = w / 12;
    for (let i = 0; i < 12; i++) { const gr = g.createLinearGradient(i * cw, 0, (i + 1) * cw, 0); gr.addColorStop(0, '#d9c6ff'); gr.addColorStop(0.5, '#f7f1ff'); gr.addColorStop(1, '#d9c6ff'); g.fillStyle = gr; g.fillRect(i * cw, 0, cw, h); g.fillStyle = 'rgba(120,70,200,.25)'; g.fillRect(i * cw - 2, 0, 4, h); }
    g.fillStyle = 'rgba(120,70,200,.18)'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
  });
  const reels = [];
  for (let r = 0; r < 5; r++) {
    const grp = new THREE.Group(); grp.position.x = reelX(r); cab.add(grp);
    const drumPivot = new THREE.Group(); grp.add(drumPivot);
    const drumMat = new THREE.MeshPhysicalMaterial({ map: drumTex, roughness: 0.55, clearcoat: 0.3, envMapIntensity: 0.45, emissive: '#ffcf4a', emissiveIntensity: 0 });
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.18, R - 0.18, RX - 0.12, 72, 1, false), drumMat);
    drum.rotation.z = Math.PI / 2; drum.receiveShadow = true; drumPivot.add(drum);
    const holders = [];
    for (let j = 0; j < 5; j++) {
      const h = new THREE.Group(), wrap = new THREE.Group(); h.add(wrap);
      const syms = []; for (let s = 0; s < 9; s++) { const g = kit.make(s); g.visible = false; wrap.add(g); syms.push(g); }
      grp.add(h); holders.push({ h, wrap, syms, cur: -1, idx: 0 });
    }
    reels.push({ grp, drumPivot, drumMat, holders, pos: 0, speed: 0, want: 0, mode: 'idle', anim: null, lastTick: 0, n: strips[r].length });
  }
  function layoutReel(re, r) {
    const p = re.pos, base = Math.round(p), strip = strips[r];
    const blur = Math.min(0.55, Math.abs(re.speed) * 0.035);
    re.drumPivot.rotation.x = -p * STEP;
    re.holders.forEach((ho, j) => {
      const idx = base + j - 2, off = idx - p, a = off * STEP;
      ho.h.position.set(0, -Math.sin(a) * R, Math.cos(a) * R - 0.02);
      ho.h.rotation.x = a * 0.55; ho.idx = idx;
      const sym = strip[mod(idx, re.n)];
      if (ho.cur !== sym) { if (ho.cur >= 0) ho.syms[ho.cur].visible = false; ho.syms[sym].visible = true; ho.cur = sym; }
      ho.blur = blur;
    });
  }
  const holderAt = (r, row) => { const re = reels[r], base = Math.round(re.pos); return re.holders.find((h) => h.idx === base + row - 1); };

  // ---------------------------------------------------------------- reel-5 spotlight: frame, glow, dimmer over reels 1-4
  const frame5Mat = glowMat('#ffe14d', 0);
  const frame5 = new THREE.Mesh(ringTube(RX + 0.02, WH - 0.06, 0.22, 0.06), frame5Mat); frame5.position.set(reelX(4), 0, PATH_Z + 0.05); cab.add(frame5);
  const glow5 = new THREE.Sprite(new THREE.SpriteMaterial({ map: rad, color: '#ffd84d', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow5.scale.set(3.0, 5.0, 1); glow5.position.set(reelX(4), 0, R + 0.05); cab.add(glow5);
  const dim = new THREE.Mesh(new THREE.PlaneGeometry(RX * 4 + 0.05, WH + 0.1), new THREE.MeshBasicMaterial({ color: '#12052e', transparent: true, opacity: 0, depthWrite: false }));
  dim.position.set(reelX(1.5), 0, PATH_Z - 0.02); dim.renderOrder = 2; cab.add(dim);
  // edge shading inside the window and a glass sheen
  const shadeTex = canvasTex(16, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(20,6,60,.85)'); gr.addColorStop(1, 'rgba(20,6,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  for (const s of [1, -1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(WW, 0.55), new THREE.MeshBasicMaterial({ map: shadeTex, transparent: true, depthWrite: false })); m.position.set(0, s * (WH / 2 - 0.27), PATH_Z - 0.15); if (s < 0) m.rotation.z = Math.PI; cab.add(m); }
  const sheenTex = canvasTex(256, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.42, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const sheen = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), new THREE.MeshBasicMaterial({ map: sheenTex, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false })); sheen.position.z = FRONT - 0.05; cab.add(sheen);
  // reel separators
  for (let i = 1; i < 5; i++) { const b = new THREE.Mesh(new RoundedBoxGeometry(0.07, WH + 0.1, 0.1, 2, 0.03), gold); b.position.set((i - 2.5) * RX, 0, PATH_Z - 0.22); cab.add(b); }

  // ---------------------------------------------------------------- paths, cell frames
  const pathCache = new Map();
  function pathGeo(li, thick) {
    const key = li + ':' + thick; if (pathCache.has(key)) return pathCache.get(key);
    const L = lines[li], pts = [new THREE.Vector3(-WW / 2 - 0.25, rowY(L[0]), PATH_Z)];
    L.forEach((row, r) => pts.push(new THREE.Vector3(reelX(r), rowY(row), PATH_Z)));
    pts.push(new THREE.Vector3(WW / 2 + 0.25, rowY(L[4]), PATH_Z));
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.15), 160, thick, 8, false);
    pathCache.set(key, g); return g;
  }
  const paths = new THREE.Group(); cab.add(paths);
  const cellGeo = ringTube(RX - 0.1, PITCH - 0.06, 0.2, 0.045);
  const cellFrames = [];
  for (let i = 0; i < 15; i++) { const m = new THREE.Mesh(cellGeo, glowMat('#ffffff', 0)); m.visible = false; cab.add(m); cellFrames.push(m); }
  let active = [];   // { mesh, mat, born, kind }
  const bouncing = new Map();   // holder -> start time
  function clearPaths() { for (const a of active) paths.remove(a.mesh); active = []; cellFrames.forEach((c) => { c.visible = false; }); bouncing.clear(); badges.forEach((b) => { b.scale.setScalar(1); }); }
  function addPath(li, color, kind) {
    const halo = new THREE.Mesh(pathGeo(li, 0.13), glowMat(color, 0)), core = new THREE.Mesh(pathGeo(li, 0.045), glowMat('#ffffff', 0));
    halo.geometry.setDrawRange(0, 0); core.geometry.setDrawRange(0, 0);
    paths.add(halo, core); active.push({ mesh: halo, mat: halo.material, born: clock, kind, li, core: false }, { mesh: core, mat: core.material, born: clock, kind, li, core: true });
  }

  // ---------------------------------------------------------------- coins and sparkles
  const COINS = 180;
  const coinGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 28); coinGeo.rotateX(Math.PI / 2);
  const coinMat = new THREE.MeshPhysicalMaterial({ color: '#ffc61f', metalness: 0.9, roughness: 0.2, clearcoat: 1, envMapIntensity: 1.4, emissive: '#7a4a00', emissiveIntensity: 0.3 });
  const coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, COINS); coinMesh.frustumCulled = false; coinMesh.castShadow = true; scene.add(coinMesh);
  const coins = Array.from({ length: COINS }, () => ({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3() }));
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < COINS; i++) coinMesh.setMatrixAt(i, hide);
  const sparkTex = canvasTex(64, 64, (g) => { g.translate(32, 32); g.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 4); g.beginPath(); g.moveTo(0, -30); g.lineTo(4, 0); g.lineTo(0, 30); g.lineTo(-4, 0); g.fill(); } }, false);
  const sparks = Array.from({ length: 50 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, color: '#fff6b0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); s.visible = false; cab.add(s); return { s, t: 1, v: new THREE.Vector3() }; });
  let sparkI = 0;
  function sparkle(x, y, n = 6, color = '#fff6b0') { for (let i = 0; i < n; i++) { const k = sparks[sparkI++ % sparks.length]; k.s.visible = true; k.t = 0; k.s.material.color.set(color); k.s.position.set(x + (Rnd() - 0.5) * 0.6, y + (Rnd() - 0.5) * 0.5, PATH_Z + 0.1); k.v.set((Rnd() - 0.5) * 2.4, (Rnd() - 0.2) * 2.4, 0); } }

  // ---------------------------------------------------------------- frame loop
  let clock = 0, shake = 0, glowLevel = 0, glowCur = 0, cands = [], camX = 0, camXV = 0;
  const tq = new THREE.Quaternion(), ts = new THREE.Vector3(1, 1, 1);
  S.onFrame((dt, t) => {
    clock = t;
    // camera framing: fit the cabinet (desktop) or the reel window (portrait)
    const a = camera.aspect, f = THREE.MathUtils.degToRad(camera.fov) / 2;
    const wReq = a >= 1.25 ? 9.7 : a >= 0.9 ? 7.75 : 7.5, hReq = a >= 1.25 ? 6.95 : 7.4, cy = a >= 1.25 ? 0.42 : 0.5;
    const D = Math.max(hReq / 2 / Math.tan(f), wReq / 2 / (Math.tan(f) * a));
    camXV += (-camX * 8 - camXV * 4) * dt; camX += camXV * dt;
    camera.position.set(Math.sin(t * 0.25) * 0.12 + camX, cy + 0.55, FRONT + D);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 1.2); }
    camera.lookAt(0, cy, FRONT);
    S.sun.position.set(3.5, 8, 13); S.sun.target.position.set(0, 0, 0);

    // reels
    reels.forEach((re, r) => {
      if (re.anim) {
        const A = re.anim; A.t += dt;
        const prev = re.pos;
        if (A.t < A.dA) { const k = A.t / A.dA; re.pos = A.p0 - A.D * (1 - Math.pow(1 - k, 3)); }
        else if (A.t < A.dA + A.dB) { const k = (A.t - A.dA) / A.dB; re.pos = A.p1 - A.over * (1 - ease.inOut(k)); }
        else { re.pos = A.p1; re.anim = null; re.mode = 'idle'; re.speed = 0; A.done(); }
        re.speed = dt > 0 ? (prev - re.pos) / dt : 0;
      } else if (re.mode === 'spin' || re.mode === 'slow') {
        re.speed += (re.want - re.speed) * (1 - Math.exp(-dt * (re.mode === 'slow' ? 3 : 5)));
        re.pos -= re.speed * dt;
      }
      const tick = Math.floor(re.pos + 0.5);
      if (tick !== re.lastTick) { re.lastTick = tick; if (re.mode !== 'spin' || re.speed < 6) opts.onTick?.(r, re.speed); }
      layoutReel(re, r);
      for (const ho of re.holders) {
        const b = bouncing.get(ho);
        if (b !== undefined && ho.idx === Math.round(re.pos) + (b.row - 1)) { const k = (t - b.t0) * 5.5; ho.wrap.scale.setScalar(1 + Math.max(0, Math.sin(k)) * 0.16); ho.wrap.rotation.z = Math.sin(k * 0.5) * 0.08; ho.wrap.position.z = 0.1; }
        else { ho.wrap.scale.set(1, 1 + ho.blur, 1); ho.wrap.rotation.z = 0; ho.wrap.position.z = 0; }
      }
    });
    kit.update(t);

    // reel 5 spotlight
    glowCur += (glowLevel - glowCur) * (1 - Math.exp(-dt * 6));
    const pulse = 0.75 + Math.sin(t * (glowLevel >= 2 ? 14 : 7)) * 0.25;
    frame5Mat.opacity = Math.min(1, glowCur) * pulse; frame5Mat.color.set(glowLevel >= 2 ? (Math.sin(t * 14) > 0 ? '#ff5fd2' : '#ffe14d') : '#ffe14d');
    glow5.material.opacity = Math.min(1, glowCur) * 0.22 * pulse;
    dim.material.opacity = Math.min(1, glowCur) * 0.55;
    reels[4].drumMat.emissiveIntensity = Math.min(1, glowCur) * 0.12 * pulse;
    // paths draw in, then pulse
    for (const p of active) {
      const age = t - p.born, cnt = p.mesh.geometry.index ? p.mesh.geometry.index.count : 0;
      p.mesh.geometry.setDrawRange(0, Math.floor(cnt * Math.min(1, age / 0.35)));
      const base = p.kind === 'cand' ? (0.4 + Math.sin(t * 6) * 0.2) : 0.95;
      p.mat.opacity = (p.core ? (p.kind === 'cand' ? 0.7 : 1) : (p.kind === 'cand' ? 0.3 : 0.55)) * base;
    }
    cellFrames.forEach((c) => { if (c.visible) c.material.opacity = 0.7 + Math.sin(t * 8) * 0.3; });
    for (const c of cands) c.frame.material.opacity = 0.55 + Math.sin(t * 6 + c.row) * 0.4;
    // bulbs
    const n = bulbPos.length; bulbBoost = Math.max(0, bulbBoost - dt * 0.4);
    for (let i = 0; i < n; i++) {
      let c;
      if (bulbBoost > 0) { c = BULB_COLS[(i + Math.floor(t * 16)) % 3]; tmpC.copy(c).multiplyScalar(((i + Math.floor(t * 16)) % 2) ? 1.6 : 0.35); }
      else if (bulbMode >= 1) { tmpC.set(bulbMode >= 2 ? '#ff7ad9' : '#ffd84d').multiplyScalar(0.6 + 0.9 * Math.max(0, Math.sin(t * 9 - i * 0.5))); }
      else { c = BULB_COLS[Math.floor(i / 3) % 3]; tmpC.copy(c).multiplyScalar((i + Math.floor(t * 5)) % 4 === 0 ? 1.5 : 0.5); }
      bulbs.setColorAt(i, tmpC);
    }
    bulbs.instanceColor.needsUpdate = true;
    neonMat.color.setHSL(0.5 + Math.sin(t * 0.6) * 0.04, 1, 0.68);
    // coins
    let any = false;
    coins.forEach((c, i) => {
      if (!c.on) return; any = true;
      c.v.y -= 11 * dt; c.p.addScaledVector(c.v, dt);
      tq.setFromAxisAngle(c.w, c.w.length() ? dt * 9 : 0); c.q.multiply(tq);
      if (c.p.y < -6) { c.on = false; coinMesh.setMatrixAt(i, hide); return; }
      tmpM.compose(c.p, c.q, ts); coinMesh.setMatrixAt(i, tmpM);
    });
    if (any || coinMesh.userData.dirty) { coinMesh.instanceMatrix.needsUpdate = true; coinMesh.userData.dirty = any; }
    for (const k of sparks) { if (!k.s.visible) continue; k.t += dt * 1.6; if (k.t >= 1) { k.s.visible = false; continue; } k.s.position.addScaledVector(k.v, dt); const s = 0.25 + Math.sin(k.t * Math.PI) * 0.4; k.s.scale.set(s, s, 1); k.s.material.opacity = Math.sin(k.t * Math.PI); k.s.material.rotation = k.t * 3; }
    for (const b of bokeh) { const u = b.userData; b.position.y = u.y + Math.sin(t * u.sp + u.ph) * 0.4; }
    for (const d of decor) { const u = d.userData; d.position.y = u.y + Math.sin(t * 0.8 + u.ph) * 0.25; d.rotation.y = Math.sin(t * 0.5 + u.ph) * 0.5; d.rotation.z = Math.sin(t * 0.7 + u.ph) * 0.12; }
    // arcade buttons breathe
    for (const b of [spinBtn, dblBtn]) { const u = b.userData; u.cap.position.y += ((u.down ? u.y0 - 0.1 : u.y0) - u.cap.position.y) * Math.min(1, dt * 18); }
  });

  // ---------------------------------------------------------------- input: the 3D buttons
  canvas.addEventListener('pointermove', (e) => { const h = S.pick(e, pickables); canvas.style.cursor = h && h.object.userData.enabled !== false ? 'pointer' : 'default'; });
  canvas.addEventListener('click', (e) => { const h = S.pick(e, pickables); if (h) { const btn = h.object.userData.name === 'spin' ? spinBtn : dblBtn; press(btn); opts.onButton?.(h.object.userData.name); } });
  function press(btn) { btn.userData.down = true; setTimeout(() => { btn.userData.down = false; }, 140); }
  const btnLabels = {};
  function setBtn(btn, label, on) {
    const key = label + on; if (btnLabels[btn.userData.label + '_'] === key) return; btnLabels[btn.userData.label + '_'] = key;
    const tex = btnTex(label, on ? btn.userData.color : '#9b8fb8', on ? '#ffffff' : '#e8e3f5');
    btn.userData.mats[1].map = tex; btn.userData.mats[1].emissiveMap = tex; btn.userData.mats[1].needsUpdate = true;
    btn.userData.mats[0].color.set(on ? btn.userData.color : '#9b8fb8'); btn.userData.mats[2].color.copy(btn.userData.mats[0].color);
    btn.userData.cap.userData.enabled = on;
  }

  // ---------------------------------------------------------------- API
  function setStops(stops) { stops.forEach((s, r) => { const re = reels[r]; re.pos = s; re.speed = 0; re.mode = 'idle'; re.anim = null; layoutReel(re, r); }); }
  return {
    S, kit,
    setStops,
    spinAll() { clearPaths(); this.candidates([]); reels.forEach((re, r) => { setTimeout(() => { re.anim = null; re.mode = 'spin'; re.want = 15 + r * 0.6; re.speed = -2.5; }, reduce ? 0 : r * 70); }); },
    stopReel(r, stop, o = {}) {
      const re = reels[r];
      return new Promise((done) => {
        const v0 = Math.max(re.mode === 'slow' ? 4 : 8, re.speed), dmin = o.dmin ?? 2.6;
        const frac = re.pos - Math.floor(re.pos);
        // the strip is free to jump while it spins fast: keep the fraction so nothing visibly moves, then glide in
        const k = Math.ceil(dmin - frac);
        if (re.mode === 'slow' || o.honest) { let D = mod(re.pos - stop, re.n); while (D < dmin) D += re.n; re.anim = { p0: re.pos, p1: re.pos - D, D: D + 0.2, over: 0.2, dA: 0, dB: 0.26, t: 0, done }; }
        else { re.pos = stop + k + frac; const D = re.pos - stop; re.anim = { p0: re.pos, p1: stop, D: D + 0.2, over: 0.2, dA: 0, dB: 0.26, t: 0, done }; }
        re.anim.dA = reduce ? 0.12 : Math.max(0.25, (3 * re.anim.D) / v0) * (o.slowmo || 1);
        re.mode = 'stop';
      }).then(() => { re.pos = mod(stop, re.n); layoutReel(re, r); opts.onLand?.(r); });
    },
    slow5(on) { const re = reels[4]; if (on) { re.anim = null; re.mode = 'slow'; re.want = 2.4; } },
    speed5(v) { const re = reels[4]; re.anim = null; re.mode = 'spin'; re.want = v; },
    glow5(level) { glowLevel = level; bulbMode = level; },
    candidates(list) {
      for (const c of cands) cab.remove(c.frame); cands = [];
      for (const a of active.filter((p) => p.kind === 'cand')) paths.remove(a.mesh);
      active = active.filter((p) => p.kind !== 'cand');
      const rows = new Set();
      for (const c of list) { addPath(c.line, LINE_COLORS[c.line], 'cand'); rows.add(c.row); }
      for (const row of rows) { const f = new THREE.Mesh(cellGeo, glowMat('#ffe14d', 0)); f.position.set(reelX(4), rowY(row), PATH_Z + 0.08); f.scale.setScalar(1.04); cab.add(f); cands.push({ frame: f, row }); }
    },
    showWin(win) {
      clearPaths(); const col = LINE_COLORS[win.line];
      addPath(win.line, col, 'win');
      win.cells.forEach(([r, row], i) => {
        const cf = cellFrames[i]; cf.visible = true; cf.material.color.set(col); cf.position.set(reelX(r), rowY(row), PATH_Z + 0.06);
        const ho = holderAt(r, row); if (ho) bouncing.set(ho, { t0: clock + i * 0.06, row });
        sparkle(reelX(r), rowY(row), 4, col);
      });
      badges.forEach((b) => { if (b.userData.li === win.line) b.scale.setScalar(1.5); });
    },
    clearWins: clearPaths,
    coins(n) {
      let k = 0;
      for (const c of coins) { if (k >= n) break; if (c.on) continue; k++; c.on = true; c.p.set((Rnd() - 0.5) * 8, 3.6 + Rnd() * 2.5, FRONT + 0.6 + Rnd() * 1.2); c.v.set((Rnd() - 0.5) * 3, Rnd() * 3, 0.6 + Rnd()); c.q.setFromEuler(new THREE.Euler(Rnd() * 6, Rnd() * 6, 0)); c.w.set(Rnd() - 0.5, Rnd() - 0.5, Rnd() - 0.5).normalize(); }
      coinMesh.userData.dirty = true;
    },
    celebrate(level) { bulbBoost = 1 + level; if (level >= 2 && !reduce) shake = 0.12 + level * 0.05; },
    nudge(d) { camXV += d; },
    setDisplay(a, b) { if (a === lcdText[0] && b === lcdText[1]) return; lcdText = [a, b]; drawLcd(); },
    buttons(st) { setBtn(spinBtn, st.spin || 'SPIN', st.spinOn !== false); setBtn(dblBtn, 'DOUBLE', !!st.dbl); },
    anchor(r, row) { return S.toScreen(new THREE.Vector3(reelX(r), rowY(row), PATH_Z)); },
    sparkle,
    redrawText() { signTex.image && (signTex.needsUpdate = true); drawLcd(); },
  };
}
