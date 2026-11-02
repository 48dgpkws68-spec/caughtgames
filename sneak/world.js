// SNEAK 3D world: a night museum hall with a path of pressure plates (3 per row), laser fences, paintings,
// security cameras that track the thief, light cones over the SPOT plates and the diamond at the end.
//   const W = await createWorld(canvas, { rows, onPick })
//   W.setRows(layouts)            layouts[r] = [kind for column 0, 1, 2] (0 shadow, 1 dim, 2 spot), r = 1..rows
//   W.showNext(row, labels)       labels[col] = { mult: '×2.16', risk: '55%' } for the next row (or null to hide)
//   await W.moveTo(row, col)      hop the thief onto a plate          W.plate(row, col, 'scan' | 'safe' | 'caught')
//   await W.caught(row, col, rowSafe)   alarm + cage drop; rowSafe[col] = would that plate have been safe
//   await W.escape(isMax)         rope out through the skylight with the loot
//   await W.reset()               back to the start plate
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createThief } from './thief.js';

export const ROW_GAP = 2.7, COL_GAP = 2.25;
const KIND_COL = [new THREE.Color('#4f6bff'), new THREE.Color('#ffae42'), new THREE.Color('#fff3d6')];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function radialTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, inner); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, false);
}
// seeded random for the decor (the same museum every visit)
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// volumetric light cone: additive, fades to the bottom edge and at grazing angles
function coneMat(color, strength) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uCol: { value: color.clone() }, uStr: { value: strength } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uCol; uniform float uStr; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float a = f * mix(0.25, 1.0, vY) * smoothstep(0.0, 0.25, vY) * uStr; gl_FragColor = vec4(uCol * a, a); }`,
  });
}

export async function createWorld(canvas, opts) {
  const ROWS = opts.rows;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#07050d');
  scene.fog = new THREE.FogExp2('#0a0714', 0.042);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 140);
  const hemi = new THREE.HemisphereLight('#6b5aa8', '#120c1c', 0.45);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight('#9fb4ff', 1.1);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 30 });
  moon.shadow.bias = -0.0008; moon.shadow.radius = 4;
  scene.add(moon, moon.target);
  // light that follows the thief and takes the colour of the plate he stands on
  const halo = new THREE.PointLight('#ffffff', 0, 6, 1.6);
  scene.add(halo);

  let hoverCol = -1;
  const zOf = (r) => -r * ROW_GAP, xOf = (c) => (c - 1) * COL_GAP;
  const END = zOf(ROWS + 1.4);

  // ---------------------------------------------------------------- floor: dark marble checker
  const floorTex = canvasTex(1024, 1024, (g, w, h) => {
    const n = 8, s = w / n, R = mulberry(7);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? '#141020' : '#1d1830'; g.fillRect(i * s, j * s, s, s); }
    g.globalAlpha = 0.18; g.strokeStyle = '#8a7cc0';
    for (let k = 0; k < 40; k++) { g.lineWidth = 0.5 + R() * 1.5; g.beginPath(); let x = R() * w, y = R() * h; g.moveTo(x, y); for (let m = 0; m < 6; m++) { x += (R() - 0.5) * 160; y += (R() - 0.3) * 120; g.lineTo(x, y); } g.stroke(); }
    g.globalAlpha = 1; g.strokeStyle = 'rgba(233,196,106,.22)'; g.lineWidth = 2;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(4, 16);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 80), new THREE.MeshPhysicalMaterial({ map: floorTex, roughness: 0.22, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.15, envMap: env, envMapIntensity: 0.25 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -30); floor.receiveShadow = true;
  scene.add(floor);

  // red carpet runner under the path
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(COL_GAP * 3 + 0.6, -END + 6), new THREE.MeshStandardMaterial({ color: '#3a0d1c', roughness: 0.9 }));
  carpet.rotation.x = -Math.PI / 2; carpet.position.set(0, 0.005, END / 2 + 2); carpet.receiveShadow = true;
  scene.add(carpet);

  // ---------------------------------------------------------------- walls with paintings, sconces and cameras
  const R = mulberry(42);
  const wallMat = new THREE.MeshStandardMaterial({ color: '#1a1226', roughness: 0.85 });
  const trimMat = new THREE.MeshPhysicalMaterial({ color: '#c9a24a', metalness: 1, roughness: 0.3, envMap: env, envMapIntensity: 0.55 });
  const glow = radialTex();
  const cams = [];
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 9, 80), wallMat);
    wall.position.set(s * 7.6, 4.5, -30); wall.receiveShadow = true; scene.add(wall);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 80), trimMat); rail.position.set(s * 7.38, 1.1, -30); scene.add(rail);
    for (let i = 0; i < 9; i++) {
      const z = 2 - i * 6.2, pw = 2 + R() * 1.4, ph = 1.6 + R() * 1.1;
      const art = canvasTex(256, 200, (g, w, h) => {
        const hue = Math.floor(R() * 360);
        const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, `hsl(${hue},45%,22%)`); bg.addColorStop(1, `hsl(${(hue + 50) % 360},55%,12%)`);
        g.fillStyle = bg; g.fillRect(0, 0, w, h);
        const kind = i % 3;
        if (kind === 0) { // portrait silhouette
          g.fillStyle = `hsl(${(hue + 180) % 360},35%,55%)`; g.beginPath(); g.ellipse(w / 2, h * 0.42, 34, 42, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(w / 2, h * 1.02, 80, 70, 0, 0, 7); g.fill();
        } else if (kind === 1) { // landscape
          g.fillStyle = `hsl(${(hue + 30) % 360},60%,62%)`; g.beginPath(); g.arc(w * 0.72, h * 0.3, 22, 0, 7); g.fill();
          for (let k = 0; k < 3; k++) { g.fillStyle = `hsl(${(hue + 140) % 360},30%,${18 + k * 9}%)`; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 16) g.lineTo(x, h * (0.55 + k * 0.12) + Math.sin(x * 0.03 + k * 2) * 14); g.lineTo(w, h); g.fill(); }
        } else { // abstract blocks
          for (let k = 0; k < 7; k++) { g.fillStyle = `hsla(${(hue + k * 47) % 360},70%,${45 + R() * 20}%,.85)`; g.fillRect(R() * w * 0.8, R() * h * 0.8, 30 + R() * 80, 20 + R() * 70); }
        }
      });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshStandardMaterial({ map: art, roughness: 0.6, emissive: '#ffffff', emissiveMap: art, emissiveIntensity: 0.18 }));
      p.position.set(s * 7.38, 3.6, z); p.rotation.y = -s * Math.PI / 2; scene.add(p);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.1, ph + 0.3, pw + 0.3), trimMat); fr.position.set(s * 7.43, 3.6, z); scene.add(fr);
      // warm wash from a picture light
      const wash = new THREE.Mesh(new THREE.PlaneGeometry(pw * 1.8, ph * 1.9), new THREE.MeshBasicMaterial({ map: glow, color: '#ffb36b', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
      wash.position.set(s * 7.36, 3.9, z); wash.rotation.y = -s * Math.PI / 2; scene.add(wash);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, pw * 0.6, 8), new THREE.MeshBasicMaterial({ color: '#ffd59a' }));
      lamp.rotation.x = Math.PI / 2; lamp.position.set(s * 7.2, 3.6 + ph / 2 + 0.3, z); scene.add(lamp);
      // security camera between paintings
      if (i % 2 === 0) {
        const cam = new THREE.Group();
        const bodyM = new THREE.MeshPhysicalMaterial({ color: '#d9d6e2', roughness: 0.35, clearcoat: 0.6, envMap: env, envMapIntensity: 0.6 });
        const box = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.26, 0.62, 3, 0.06), bodyM); box.position.z = 0.22;
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 20), new THREE.MeshPhysicalMaterial({ color: '#05050a', roughness: 0.05, clearcoat: 1, envMap: env }));
        lens.rotation.x = Math.PI / 2; lens.position.z = 0.54;
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2a4a' })); led.position.set(0.1, 0.1, 0.5);
        cam.add(box, lens, led);
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), trimMat); arm.rotation.z = Math.PI / 2; arm.position.set(s * 7.15, 6, z - 3.1); scene.add(arm);
        cam.position.set(s * 6.85, 6, z - 3.1); scene.add(cam);
        cams.push({ cam, led, ph: R() * 6 });
      }
    }
  }

  // ---------------------------------------------------------------- laser fences left and right of the path
  const laserMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.25, 0.5) });
  const postMat = new THREE.MeshPhysicalMaterial({ color: '#202030', metalness: 0.9, roughness: 0.3, envMap: env, envMapIntensity: 0.8 });
  const fenceX = COL_GAP * 1.5 + 0.55;
  for (const s of [-1, 1]) {
    for (let r = -1; r <= ROWS + 1; r += 2) {
      const z = zOf(r) + ROW_GAP / 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 12), postMat); post.position.set(s * fenceX, 0.55, z); post.castShadow = true; scene.add(post);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), laserMat); cap.position.set(s * fenceX, 1.12, z); scene.add(cap);
    }
    for (const h of [0.38, 0.82]) {
      const len = -END + 6, beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 6), laserMat);
      beam.rotation.x = Math.PI / 2; beam.position.set(s * fenceX, h, END / 2 + 3); scene.add(beam);
    }
  }

  // ---------------------------------------------------------------- treasures on pedestals beyond the fence
  const pedMat = new THREE.MeshPhysicalMaterial({ color: '#2a2140', roughness: 0.3, clearcoat: 0.8, envMap: env, envMapIntensity: 0.35 });
  const goldMat = new THREE.MeshPhysicalMaterial({ color: '#f2c14e', metalness: 1, roughness: 0.22, envMap: env, envMapIntensity: 0.75 });
  const gemMats = ['#ff3b8d', '#3be8ff', '#9d6bff', '#47ff9a'].map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.02, metalness: 0, transmission: 0.6, thickness: 0.8, ior: 2.2, clearcoat: 1, envMap: env, envMapIntensity: 2, emissive: c, emissiveIntensity: 0.35 }));
  const vasePts = [[0, 0], [0.18, 0.02], [0.26, 0.2], [0.3, 0.45], [0.2, 0.7], [0.12, 0.85], [0.17, 0.98], [0.16, 1.0]].map(([x, y]) => new THREE.Vector2(x, y));
  const spinners = [];
  for (let r = 1; r <= ROWS; r += 2) {
    for (const s of [-1, 1]) {
      const z = zOf(r) - (s > 0 ? ROW_GAP * 0.5 : 0);
      const ped = new THREE.Mesh(new RoundedBoxGeometry(0.9, 1.2, 0.9, 3, 0.06), pedMat); ped.position.set(s * 5.4, 0.6, z); ped.castShadow = ped.receiveShadow = true; scene.add(ped);
      const k = Math.floor(R() * 3); let item;
      if (k === 0) { item = new THREE.Mesh(new THREE.LatheGeometry(vasePts, 32), goldMat); item.scale.setScalar(1.15); item.position.set(s * 5.4, 1.2, z); }
      else if (k === 1) { item = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), gemMats[Math.floor(R() * 4)]); item.scale.y = 1.4; item.position.set(s * 5.4, 1.75, z); spinners.push(item); }
      else { item = new THREE.Group(); const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 16), goldMat); head.position.y = 0.62; const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.32, 0.45, 24), goldMat); neck.position.y = 0.25; item.add(head, neck); item.position.set(s * 5.4, 1.2, z); }
      item.castShadow = true; scene.add(item);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: glow, color: '#7d6bff', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(s * 5.4, 0.02, z); scene.add(pool);
    }
  }

  // ---------------------------------------------------------------- the diamond at the end
  const dPts = [[0, -0.9], [0.62, 0], [0.5, 0.22], [0.25, 0.32], [0, 0.32]].map(([x, y]) => new THREE.Vector2(x, y));
  const dGeo = new THREE.LatheGeometry(dPts, 16); dGeo.computeVertexNormals();
  const diamond = new THREE.Mesh(dGeo, new THREE.MeshPhysicalMaterial({ color: '#e8fbff', roughness: 0, metalness: 0, transmission: 0.85, thickness: 1.2, ior: 2.4, dispersion: 4, iridescence: 1, clearcoat: 1, envMap: env, envMapIntensity: 3, emissive: '#7fd8ff', emissiveIntensity: 0.25, flatShading: true }));
  diamond.scale.setScalar(1.25);
  const dPed = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.3, 40), new THREE.MeshPhysicalMaterial({ color: '#2a1f3d', roughness: 0.2, clearcoat: 1, envMap: env, envMapIntensity: 0.8 }));
  dPed.position.set(0, 0.65, END); dPed.castShadow = dPed.receiveShadow = true;
  const dRing = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.05, 12, 64), goldMat); dRing.rotation.x = Math.PI / 2; dRing.position.set(0, 1.31, END);
  diamond.position.set(0, 2.6, END);
  const dCone = new THREE.Mesh(new THREE.ConeGeometry(1.8, 9, 40, 1, true), coneMat(new THREE.Color('#bfe9ff'), 0.6)); dCone.position.set(0, 5.8, END);
  const dLight = new THREE.PointLight('#bfe9ff', 6, 9, 1.5); dLight.position.set(0, 3.4, END);
  scene.add(dPed, dRing, diamond, dCone, dLight);

  // ---------------------------------------------------------------- plates
  const plateGeo = new RoundedBoxGeometry(1.75, 0.16, 1.75, 4, 0.06);
  const ringGeo = new THREE.RingGeometry(0.7, 0.8, 48);
  const plates = [];   // plates[r][c] = { mesh, mat, pool, cone, ring, kind }
  const start = new THREE.Mesh(new RoundedBoxGeometry(COL_GAP * 3, 0.16, 1.9, 4, 0.06), new THREE.MeshPhysicalMaterial({ color: '#2b2140', roughness: 0.3, clearcoat: 1, envMap: env, envMapIntensity: 0.5 }));
  start.position.set(0, 0.08, 0); start.receiveShadow = true; scene.add(start);
  const startText = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.4), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: canvasTex(512, 86, (g, w, h) => { g.font = '800 44px Unbounded, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(233,196,106,.85)'; g.fillText('START', w / 2, h / 2 + 2); }) }));
  startText.rotation.x = -Math.PI / 2; startText.position.set(0, 0.17, 0.55); scene.add(startText);
  for (let r = 1; r <= ROWS; r++) {
    plates[r] = [];
    for (let c = 0; c < 3; c++) {
      const mat = new THREE.MeshPhysicalMaterial({ color: '#222', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08, envMap: env, envMapIntensity: 0.5, emissive: '#000' });
      const mesh = new THREE.Mesh(plateGeo, mat);
      mesh.position.set(xOf(c), 0.08, zOf(r)); mesh.receiveShadow = true; mesh.userData = { r, c };
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(xOf(c), 0.17, zOf(r));
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.05, 8, 32, 1, true), coneMat(KIND_COL[2], 0));
      cone.position.set(xOf(c), 4.2, zOf(r)); cone.visible = false;
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(xOf(c), 0.18, zOf(r));
      scene.add(mesh, pool, cone, ring);
      plates[r][c] = { mesh, mat, pool, cone, ring, kind: 0, state: null, hover: 0, pulse: 0 };
    }
  }
  const pickables = plates.flat().filter(Boolean).map((p) => p.mesh);

  function styleKind(P, kind) {
    P.kind = kind; P.coneStr = 0; const col = KIND_COL[kind];
    if (kind === 0) { P.mat.color.set('#10132a'); P.mat.emissive.set('#2438b0'); P.mat.emissiveIntensity = 0.18; P.pool.material.color.set('#3550ff'); P.pool.material.opacity = 0.14; P.cone.visible = false; }
    if (kind === 1) { P.mat.color.set('#3d2812'); P.mat.emissive.set('#ff8a1e'); P.mat.emissiveIntensity = 0.16; P.pool.material.color.set('#ff9a30'); P.pool.material.opacity = 0.28; P.cone.visible = true; P.cone.material.uniforms.uCol.value.set('#ffa040'); P.coneStr = 0.07; }
    if (kind === 2) { P.mat.color.set('#cfc6ae'); P.mat.emissive.set('#fff1c8'); P.mat.emissiveIntensity = 0.22; P.pool.material.color.set('#fff3d6'); P.pool.material.opacity = 0.5; P.cone.visible = true; P.cone.material.uniforms.uCol.value.copy(col); P.coneStr = 0.16; }
    P.baseEm = P.mat.emissiveIntensity;
  }
  function setRows(layouts) {
    for (let r = 1; r <= ROWS; r++) for (let c = 0; c < 3; c++) { const P = plates[r][c]; P.state = null; P.ring.material.opacity = 0; styleKind(P, layouts[r][c]); }
  }

  // ---------------------------------------------------------------- labels over the next row (HTML: crisp, no bloom, clickable)
  const host = opts.labelHost || canvas.parentElement;
  const KIND_NAME = ['SHADOW', 'DIM', 'SPOT'];
  const labels = [0, 1, 2].map((c) => {
    const el = document.createElement('button');
    el.className = 'plabel'; el.type = 'button'; el.hidden = true;
    el.addEventListener('click', () => opts.onPick(c));
    el.addEventListener('pointerenter', () => { hoverCol = c; opts.onHover?.(c); });
    el.addEventListener('pointerleave', () => { hoverCol = -1; opts.onHover?.(-1); });
    host.appendChild(el);
    return { el, a: 0 };
  });
  let nextRow = 0, lastRow = 0;
  const nextRowOr = () => nextRow || lastRow + 1;
  function showNext(row, lab) {
    nextRow = lab ? row : 0;
    labels.forEach((L, c) => {
      if (!lab) { L.el.hidden = true; return; }
      const k = plates[row][c].kind;
      L.el.className = 'plabel k' + k;
      L.el.innerHTML = '<b>' + lab[c].mult + '</b><small><i>' + KIND_NAME[k] + ' · </i>' + lab[c].risk + '</small>';
      L.el.setAttribute('aria-label', KIND_NAME[k] + ' plate, ' + lab[c].risk + ' alarm, pays ' + lab[c].mult);
      L.el.hidden = false;
    });
  }
  const lp = new THREE.Vector3();
  function placeLabels(t) {
    if (!nextRow) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    labels.forEach((L, c) => {
      const P = plates[nextRow][c];
      lp.set(xOf(c), 0.42 + P.hover * 0.1 + Math.sin(t * 2.4 + c) * 0.03, zOf(nextRow) + 0.35).project(camera);
      L.el.style.transform = 'translate(' + ((lp.x * 0.5 + 0.5) * w).toFixed(1) + 'px,' + ((-lp.y * 0.5 + 0.5) * h).toFixed(1) + 'px) translate(-50%,-100%) scale(' + (1 + P.hover * 0.08).toFixed(3) + ')';
    });
  }

  // ---------------------------------------------------------------- thief, cage, rope, coins
  const thief = createThief(env);
  thief.root.scale.setScalar(1.15);
  scene.add(thief.root);
  const cage = new THREE.Group();
  const barMat = new THREE.MeshPhysicalMaterial({ color: '#9aa0b4', metalness: 1, roughness: 0.3, envMap: env, envMapIntensity: 0.55 });
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.1, 8), barMat); b.position.set(Math.cos(a) * 0.82, 1.05, Math.sin(a) * 0.82); b.castShadow = true; cage.add(b); }
  for (const y of [0.04, 2.1]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.06, 10, 48), barMat); t.rotation.x = Math.PI / 2; t.position.y = y; cage.add(t); }
  const capTop = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.5, 48), barMat); capTop.position.y = 2.35; cage.add(capTop);
  cage.visible = false; scene.add(cage);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 12, 8), new THREE.MeshStandardMaterial({ color: '#d8c39a', roughness: 0.8 }));
  rope.visible = false; scene.add(rope);
  const coinGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.025, 20);
  const coins = new THREE.InstancedMesh(coinGeo, goldMat, 80); coins.count = 0; coins.frustumCulled = false; scene.add(coins);
  let coinParts = [];
  // alarm beacons
  const alarmLight = new THREE.PointLight('#ff1f3d', 0, 14, 1.2); scene.add(alarmLight);
  const search = new THREE.SpotLight('#ff3048', 0, 18, 0.35, 0.5, 1.2); search.castShadow = false; scene.add(search, search.target);

  // ---------------------------------------------------------------- camera rig
  const camPos = new THREE.Vector3(0, 14, 10), camLook = new THREE.Vector3(0, 0, -12);
  const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
  let shake = 0, intro = reduce ? 0 : 1, alarm = 0, haloCol = new THREE.Color('#ffffff'), haloI = 0, escapeT = -1;
  function frameCam(dt) {
    const p = thief.root.position, a = camera.aspect;
    const back = a < 0.8 ? 6.4 : 5.8, up = a < 0.8 ? 6 : 5.3;
    wantPos.set(p.x * 0.35, up, p.z + back);
    wantLook.set(p.x * 0.25, 0.5, p.z - (a < 0.8 ? 5 : 3.9));
    if (intro > 0) { // fly in from above the diamond
      const k = 1 - intro, e = 1 - Math.pow(1 - k, 3);
      const iPos = new THREE.Vector3(0, 11, END + 10), iLook = new THREE.Vector3(0, 1.5, END);
      wantPos.lerpVectors(iPos, wantPos, e); wantLook.lerpVectors(iLook, wantLook, e);
      intro = Math.max(0, intro - dt / 3.2);
      camPos.copy(wantPos); camLook.copy(wantLook);
    } else {
      const f = 1 - Math.exp(-dt * 3.2);
      camPos.lerp(wantPos, f); camLook.lerp(wantLook, f);
    }
    camera.position.copy(camPos);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 1.6); }
    camera.lookAt(camLook);
  }

  // ---------------------------------------------------------------- post
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.45, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); composer.setSize(w, h); bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.8 ? 62 : camera.aspect < 1.2 ? 54 : 46;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas); resize();

  // ---------------------------------------------------------------- picking
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let hoverP = null;
  function pickAt(ev) {
    const b = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (!hit) return null;
    const { r, c } = hit.object.userData;
    return r === nextRow ? { r, c } : null;
  }
  canvas.addEventListener('pointermove', (ev) => { const h = pickAt(ev); hoverP = h ? plates[h.r][h.c] : null; canvas.style.cursor = h ? 'pointer' : 'default'; if (h) opts.onHover?.(h.c); });
  canvas.addEventListener('pointerleave', () => { hoverP = null; opts.onHover?.(-1); });
  canvas.addEventListener('click', (ev) => { const h = pickAt(ev); if (h) opts.onPick(h.c); });

  // ---------------------------------------------------------------- loop
  const clock = new THREE.Clock();
  const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? Math.min(ms, 150) : ms));
  let running = true;
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { clock.getDelta(); requestAnimationFrame(loop); } });
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(1, 1, 1), tmpP = new THREE.Vector3();
  function loop() {
    if (!running) return;
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
    thief.update(dt, t);
    const tp = thief.root.position;
    // halo light takes the colour of the plate under the thief
    halo.position.set(tp.x, 2.6 + thief.inner.position.y, tp.z + 0.6);
    halo.color.lerp(haloCol, 1 - Math.exp(-dt * 6)); halo.intensity += (haloI - halo.intensity) * (1 - Math.exp(-dt * 6));
    moon.position.set(tp.x + 3, 12, tp.z + 4); moon.target.position.set(tp.x, 0, tp.z);
    // plates: hover, scan ring, result glow, labels fade
    for (let r = 1; r <= ROWS; r++) for (let c = 0; c < 3; c++) {
      const P = plates[r][c], isHover = (P === hoverP || (r === nextRow && c === hoverCol));
      P.hover += ((isHover ? 1 : 0) - P.hover) * (1 - Math.exp(-dt * 14));
      const nextGlow = r === nextRow ? 0.25 + Math.sin(t * 3 + c) * 0.08 : 0;
      P.mesh.position.y = 0.08 + P.hover * 0.07;
      let em = P.baseEm + nextGlow + P.hover * 0.5;
      if (P.state === 'scan') { P.pulse += dt; P.ring.material.color.set('#ffffff'); P.ring.material.opacity = 0.6 + Math.sin(P.pulse * 24) * 0.3; P.ring.scale.setScalar(1 + Math.sin(P.pulse * 6) * 0.06); }
      else if (P.state === 'safe') { P.ring.material.color.set('#3dff9a'); P.ring.material.opacity += (0.7 - P.ring.material.opacity) * 0.1; P.ring.scale.setScalar(1); }
      else if (P.state === 'caught') { P.ring.material.color.set('#ff2a4a'); P.ring.material.opacity = 0.8 + Math.sin(t * 16) * 0.2; em += 0.6; P.mat.emissive.set('#ff2a4a'); }
      else if (P.state === 'wouldSafe') { P.ring.material.color.set('#3dff9a'); P.ring.material.opacity = 0.55; }
      else if (P.state === 'wouldCaught') { P.ring.material.color.set('#ff5a70'); P.ring.material.opacity = 0.55; }
      else P.ring.material.opacity *= 0.9;
      P.mat.emissiveIntensity = em;
      if (P.cone.visible) { const d = r - nextRowOr(); const f = d < 0 ? 0.25 : d > 5 ? 0 : 1 - d / 6; P.cone.material.uniforms.uStr.value = P.coneStr * f; P.cone.rotation.y = t * 0.2; }
    }
    placeLabels(t);
    // cameras follow the thief, LEDs blink faster as the alarm rings
    for (const k of cams) { k.cam.lookAt(tp.x, 0.8, tp.z); k.led.visible = Math.sin(t * (alarm > 0 ? 20 : 3) + k.ph) > 0; }
    for (const s of spinners) s.rotation.y = t * 0.8;
    diamond.rotation.y = t * 0.6; diamond.position.y = 2.6 + Math.sin(t * 1.6) * 0.12;
    // alarm: red rotating wash
    if (alarm > 0) { alarmLight.position.set(tp.x + Math.cos(t * 7) * 3, 3.5, tp.z + Math.sin(t * 7) * 3); alarmLight.intensity = 30 * (0.6 + 0.4 * Math.sin(t * 14)) * Math.min(1, alarm); hemi.color.set('#a8304a'); }
    else { alarmLight.intensity = 0; hemi.color.set('#6b5aa8'); }
    search.position.set(tp.x, 9, tp.z + 2); search.target.position.copy(tp);
    // escape rope + coins
    if (escapeT >= 0) { escapeT += dt; }
    if (coinParts.length) {
      let n = 0;
      for (const c of coinParts) { c.v.y -= 9.8 * dt; c.p.addScaledVector(c.v, dt); if (c.p.y < 0.03) { c.p.y = 0.03; c.v.y *= -0.35; c.v.x *= 0.7; c.v.z *= 0.7; } c.rx += c.w * dt;
        tmpQ.setFromEuler(new THREE.Euler(c.rx, c.rx * 0.6, 0)); tmpM.compose(c.p, tmpQ, tmpS); coins.setMatrixAt(n++, tmpM); }
      coins.count = n; coins.instanceMatrix.needsUpdate = true;
    }
    frameCam(dt);
    composer.render(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function setHalo(kind) { if (kind < 0) { haloCol.set('#9b8cff'); haloI = 1.2; return; } haloCol.copy(KIND_COL[kind]); haloI = [1.2, 3, 5][kind]; }
  setHalo(-1);
  function burstCoins(at, n = 60) {
    coinParts = [];
    for (let i = 0; i < Math.min(80, n); i++) { const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3; coinParts.push({ p: at.clone().add(new THREE.Vector3(0, 1, 0)), v: new THREE.Vector3(Math.cos(a) * s, 4 + Math.random() * 4, Math.sin(a) * s), rx: Math.random() * 6, w: 5 + Math.random() * 10 }); }
  }

  return {
    renderer, scene, setRows, showNext,
    hover(c) { hoverCol = c; },
    plate(r, c, st) { const P = plates[r]?.[c]; if (P) { P.state = st; P.pulse = 0; } },
    async moveTo(r, c) {
      showNext(0, null);
      thief.mood('idle'); thief.look((c - 1) * 0.8, -0.3);
      await thief.hop(new THREE.Vector3(xOf(c), 0.16, zOf(r)), 520);
      lastRow = r;
      setHalo(plates[r][c].kind);
      shake = 0.04;
    },
    async caught(r, c, rowSafe) {
      showNext(0, null); alarm = 1; thief.mood('scared'); thief.look(0, 1);
      search.intensity = 55; shake = 0.25;
      cage.visible = true; cage.position.set(xOf(c), 7, zOf(r));
      const t0 = performance.now();
      await new Promise((res) => { const step = () => { const k = Math.min(1, (performance.now() - t0) / (reduce ? 100 : 380)); cage.position.y = 7 * (1 - k * k) + 0.16; if (k < 1) requestAnimationFrame(step); else { shake = 0.35; res(); } }; step(); });
      for (let cc = 0; cc < 3; cc++) if (cc !== c) plates[r][cc].state = rowSafe[cc] ? 'wouldSafe' : 'wouldCaught';
      await wait(1500);
    },
    async escape(isMax) {
      showNext(0, null); thief.mood('happy'); setHalo(1);
      const p = thief.root.position.clone();
      if (isMax) { // dash to the diamond and grab it
        await thief.hop(new THREE.Vector3(0, 1.3, END + 0.2), 700);
        diamond.visible = false;
      }
      burstCoins(thief.root.position, isMax ? 80 : 45);
      rope.visible = true; rope.position.set(thief.root.position.x, thief.root.position.y + 7.5, thief.root.position.z);
      await wait(450);
      const from = thief.root.position.clone(), t0 = performance.now(), dur = reduce ? 150 : 1300;
      await new Promise((res) => { const step = () => { const k = Math.min(1, (performance.now() - t0) / dur), e = k * k; thief.root.position.set(from.x, from.y + e * 10, from.z); rope.position.y = thief.root.position.y + 7.5; thief.inner.rotation.y += 0.15; if (k < 1) requestAnimationFrame(step); else res(); }; step(); });
      rope.visible = false; void p;
      await wait(400);
    },
    async reset() {
      alarm = 0; search.intensity = 0; showNext(0, null); lastRow = 0;
      if (cage.visible) { const y0 = cage.position.y, t0 = performance.now(); await new Promise((res) => { const step = () => { const k = Math.min(1, (performance.now() - t0) / (reduce ? 100 : 500)); cage.position.y = y0 + k * k * 9; thief.root.position.y = cage.position.y; if (k < 1) requestAnimationFrame(step); else res(); }; step(); }); cage.visible = false; }
      for (let r = 1; r <= ROWS; r++) for (let c = 0; c < 3; c++) plates[r][c].state = null;
      diamond.visible = true;
      thief.root.position.set(0, 9, 0.2); thief.mood('idle'); setHalo(-1);
      const t0 = performance.now();
      await new Promise((res) => { const step = () => { const k = Math.min(1, (performance.now() - t0) / (reduce ? 100 : 700)), e = 1 - Math.pow(1 - k, 3); thief.root.position.y = 9 * (1 - e) + 0.16; if (k < 1) requestAnimationFrame(step); else { thief.mood('scared'); setTimeout(() => thief.mood('idle'), 120); res(); } }; step(); });
      coinParts = []; coins.count = 0;
    },
    place() { thief.root.position.set(0, 0.16, 0.2); },
  };
}
