// LAST REEL symbols: glossy vinyl fruit, candy and gems as real 3D objects, each about one unit tall, facing +z.
//   const K = createSymbolKit()     K.make(i) -> Group (shares geometry and materials)    K.update(t) idle spin
//   K.thumbs(size) -> [dataURL x 9] small renders for the paytable and the reel-5 hints
// Order matches LastReelEngine.SYMBOLS: cherry, lemon, grapes, melon, candy, bell, gem, seven, wild.
import { THREE, canvasTex } from '../lib/stage.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const vinyl = (color, x = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: x.rough ?? 0.3, metalness: x.metal ?? 0, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: x.env ?? 0.8, ...x.extra });

function roundShape(pts) { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); return s; }
function starShape(ro, ri, n = 5) { const s = new THREE.Shape(); for (let i = 0; i <= n * 2; i++) { const a = Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? ri : ro; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); } return s; }
function sevenShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.34, 0.45); s.lineTo(0.37, 0.45); s.lineTo(0.37, 0.3);
  s.quadraticCurveTo(0.06, -0.02, 0.02, -0.45); s.lineTo(-0.22, -0.45);
  s.quadraticCurveTo(-0.16, 0.0, 0.13, 0.26); s.lineTo(-0.34, 0.26); s.lineTo(-0.34, 0.45);
  return s;
}
const extrude = (shape, depth, bevel, size, seg = 4) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: size, bevelSegments: seg, curveSegments: 18 }); g.center(); return g; };

export function createSymbolKit() {
  const M = {
    red: vinyl('#ff2747'), stem: vinyl('#3c9b3f', { rough: 0.45 }), leaf: vinyl('#45d36a'),
    lemon: vinyl('#ffd21f'), grape: vinyl('#8b3dff'), grape2: vinyl('#a965ff'), brown: vinyl('#8a5a32', { rough: 0.5 }),
    rind: vinyl('#22b34a'), pith: vinyl('#f1ffe6'), flesh: vinyl('#ff3e62'), seed: vinyl('#2a1630'),
    wrap: vinyl('#ff8fd2'), gold: vinyl('#ffc21f', { metal: 0.45, rough: 0.25, env: 1.1, extra: { emissive: '#7a4a00', emissiveIntensity: 0.25 } }), bow: vinyl('#ff2e63'),
    gem: new THREE.MeshPhysicalMaterial({ color: '#33d9ff', metalness: 0.15, roughness: 0.06, clearcoat: 1, iridescence: 0.9, iridescenceIOR: 1.7, flatShading: true, envMapIntensity: 1.4, emissive: '#0b78a8', emissiveIntensity: 0.35 }),
    seven: vinyl('#ff1e3c'), star: vinyl('#ff3fae'),
  };
  // candy: pink and white swirl stripes
  M.candy = vinyl('#ffffff', { extra: { map: canvasTex(256, 128, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff3fa0'; for (let i = -4; i < 12; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 16, 0); g.lineTo(i * 32 + 16 + 48, h); g.lineTo(i * 32 + 48, h); g.fill(); } }) } });
  // WILD lettering on the star
  const wildTex = canvasTex(256, 96, (g, w, h) => {
    g.font = '78px "Lilita One","Arial Rounded MT Bold",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 18; g.strokeStyle = '#1d1640'; g.strokeText('WILD', w / 2, h / 2 + 4);
    g.fillStyle = '#ffffff'; g.fillText('WILD', w / 2, h / 2 + 4);
  });
  M.wildText = new THREE.MeshBasicMaterial({ map: wildTex, transparent: true, depthWrite: false });
  M.wildTex = wildTex;

  const G = {
    ball: new THREE.SphereGeometry(0.24, 32, 22),
    stem1: new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.17, -0.06, 0), V(-0.12, 0.2, -0.02), V(0.03, 0.42, -0.04)]), 16, 0.032, 8),
    stem2: new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0.21, -0.1, 0.06), V(0.17, 0.18, 0.0), V(0.03, 0.42, -0.04)]), 16, 0.032, 8),
    leaf: new THREE.SphereGeometry(0.2, 20, 12),
    lemon: (() => { const p = []; for (let i = 0; i <= 28; i++) { const t = -1 + (2 * i) / 28; let r = 0.31 * Math.pow(Math.max(0, 1 - t * t), 0.5); if (Math.abs(t) > 0.86) r = Math.max(r, 0.055 * (1 - (Math.abs(t) - 0.86) / 0.14)); p.push(new THREE.Vector2(Math.max(r, 0.0005), t * 0.47)); } return new THREE.LatheGeometry(p, 40); })(),
    grape: new THREE.SphereGeometry(0.135, 24, 16),
    stick: new THREE.CylinderGeometry(0.03, 0.04, 0.2, 8),
    rind: extrude(roundShape([...Array(33)].map((_, i) => { const a = Math.PI + (i / 32) * Math.PI; return [Math.cos(a) * 0.5, Math.sin(a) * 0.5]; })), 0.12, 0.05, 0.04),
    pith: extrude(roundShape([...Array(33)].map((_, i) => { const a = Math.PI + (i / 32) * Math.PI; return [Math.cos(a) * 0.44, Math.sin(a) * 0.44]; })), 0.12, 0.05, 0.03),
    flesh: extrude(roundShape([...Array(33)].map((_, i) => { const a = Math.PI + (i / 32) * Math.PI; return [Math.cos(a) * 0.39, Math.sin(a) * 0.39]; })), 0.12, 0.06, 0.03),
    seed: new THREE.SphereGeometry(0.035, 10, 8),
    candy: new THREE.SphereGeometry(0.27, 32, 22),
    wrapper: new THREE.ConeGeometry(0.2, 0.3, 9),
    bell: (() => { const p = [[0.0005, 0.34], [0.07, 0.335], [0.13, 0.3], [0.165, 0.22], [0.18, 0.1], [0.2, -0.02], [0.24, -0.14], [0.31, -0.25], [0.36, -0.31], [0.365, -0.34], [0.0005, -0.34]].map(([x, y]) => new THREE.Vector2(x, y)); return new THREE.LatheGeometry(p, 44); })(),
    rim: new THREE.TorusGeometry(0.35, 0.04, 12, 44),
    clapper: new THREE.SphereGeometry(0.085, 16, 12),
    knob: new THREE.TorusGeometry(0.07, 0.03, 10, 20),
    gem: (() => { const p = [[0.0005, -0.44], [0.44, 0.04], [0.44, 0.1], [0.28, 0.3], [0.0005, 0.3]].map(([x, y]) => new THREE.Vector2(x, y)); const g = new THREE.LatheGeometry(p, 8); g.computeVertexNormals(); return g; })(),
    seven: extrude(sevenShape(), 0.14, 0.05, 0.035),
    sevenBack: extrude(sevenShape(), 0.08, 0.04, 0.085),
    star: extrude(starShape(0.5, 0.235), 0.14, 0.06, 0.04),
    starBack: extrude(starShape(0.5, 0.235), 0.08, 0.04, 0.09),
    wildPlate: new THREE.PlaneGeometry(0.86, 0.32),
  };
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };

  const makers = [
    () => { // cherry
      const g = new THREE.Group();
      g.add(mesh(G.ball, M.red, -0.18, -0.24, 0), mesh(G.ball, M.red, 0.21, -0.28, 0.07), mesh(G.stem1, M.stem), mesh(G.stem2, M.stem));
      const lf = mesh(G.leaf, M.leaf, 0.17, 0.42, -0.02); lf.scale.set(1, 0.36, 0.55); lf.rotation.z = -0.5; g.add(lf);
      return g;
    },
    () => { // lemon
      const g = new THREE.Group(), l = mesh(G.lemon, M.lemon); l.rotation.z = Math.PI / 2 - 0.4; g.add(l);
      const lf = mesh(G.leaf, M.leaf, 0.3, 0.27, -0.05); lf.scale.set(0.85, 0.32, 0.5); lf.rotation.z = 0.5; g.add(lf);
      return g;
    },
    () => { // grapes
      const g = new THREE.Group(); let k = 0;
      for (const [y, xs] of [[0.22, [-0.3, -0.1, 0.1, 0.3]], [0.01, [-0.2, 0, 0.2]], [-0.2, [-0.1, 0.1]], [-0.39, [0]]]) for (const x of xs) g.add(mesh(G.grape, k++ % 3 ? M.grape : M.grape2, x, y, (k % 2) * 0.06));
      const st = mesh(G.stick, M.brown, 0.02, 0.43, 0); st.rotation.z = -0.3; g.add(st);
      const lf = mesh(G.leaf, M.leaf, -0.2, 0.43, -0.05); lf.scale.set(0.9, 0.34, 0.5); lf.rotation.z = 0.35; g.add(lf);
      return g;
    },
    () => { // watermelon slice
      const g = new THREE.Group(), s = new THREE.Group();
      s.add(mesh(G.rind, M.rind, 0, 0, -0.05), mesh(G.pith, M.pith, 0, 0.0, 0.02), mesh(G.flesh, M.flesh, 0, 0.02, 0.08));
      for (let i = 0; i < 5; i++) { const a = Math.PI * (1.18 + i * 0.16); const sd = mesh(G.seed, M.seed, Math.cos(a) * 0.22, 0.13 + Math.sin(a) * 0.22, 0.19); sd.scale.set(0.8, 1.4, 0.5); sd.rotation.z = a + Math.PI / 2; s.add(sd); }
      s.position.y = 0.1; s.rotation.z = 0.22; g.add(s);
      return g;
    },
    () => { // wrapped candy
      const g = new THREE.Group(), c = mesh(G.candy, M.candy); c.rotation.z = 0.3; g.add(c);
      const l = mesh(G.wrapper, M.wrap, -0.4, 0, 0); l.rotation.z = -Math.PI / 2; const r = mesh(G.wrapper, M.wrap, 0.4, 0, 0); r.rotation.z = Math.PI / 2;
      g.add(l, r); g.rotation.z = 0.32; g.scale.setScalar(1.05);
      return g;
    },
    () => { // bell with a bow
      const g = new THREE.Group();
      g.add(mesh(G.bell, M.gold, 0, 0.02, 0));
      const rim = mesh(G.rim, M.gold, 0, -0.32, 0); rim.rotation.x = Math.PI / 2; g.add(rim);
      g.add(mesh(G.clapper, M.gold, 0, -0.4, 0.02));
      const kn = mesh(G.knob, M.gold, 0, 0.4, 0); g.add(kn);
      for (const s of [-1, 1]) { const b = mesh(G.leaf, M.bow, s * 0.12, 0.33, 0.08); b.scale.set(0.6, 0.38, 0.3); b.rotation.z = s * 0.4; g.add(b); }
      g.rotation.z = -0.12;
      return g;
    },
    () => { // gem
      const g = new THREE.Group(), m = mesh(G.gem, M.gem); m.userData.spin = 1; g.add(m); g.position.y = 0.04;
      const w = new THREE.Group(); w.add(g); return w;
    },
    () => { // seven
      const g = new THREE.Group();
      g.add(mesh(G.sevenBack, M.gold, 0, 0, -0.06), mesh(G.seven, M.seven, 0, 0, 0.03));
      g.rotation.z = -0.05; g.scale.setScalar(1.06);
      return g;
    },
    () => { // wild star
      const g = new THREE.Group();
      g.add(mesh(G.starBack, M.gold, 0, 0, -0.05), mesh(G.star, M.star, 0, 0, 0.03));
      const t = new THREE.Mesh(G.wildPlate, M.wildText); t.position.set(0, -0.02, 0.16); g.add(t);
      g.scale.setScalar(1.08);
      return g;
    },
  ];
  const spinners = [];
  function make(i) { const g = makers[i](); g.traverse((o) => { if (o.userData.spin) spinners.push(o); }); return g; }

  // small renders of each symbol for the HTML (paytable, hints). Uses a separate little renderer.
  function thumbs(size = 96) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    let r; try { r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch (e) { return null; }
    r.toneMapping = THREE.NeutralToneMapping; r.setPixelRatio(1); r.setSize(size, size, false);
    const sc = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture; sc.environmentIntensity = 0.6;
    sc.add(new THREE.HemisphereLight('#fff6ec', '#c7a8ff', 1.4));
    const d = new THREE.DirectionalLight('#ffffff', 2.4); d.position.set(2, 3, 4); sc.add(d);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20); cam.position.set(0, 0.15, 2.3); cam.lookAt(0, 0, 0);
    const out = [];
    for (let i = 0; i < makers.length; i++) { const g = makers[i](); sc.add(g); r.render(sc, cam); out.push(c.toDataURL('image/png')); sc.remove(g); }
    pm.dispose(); r.dispose(); r.forceContextLoss?.();
    return out;
  }
  return { make, thumbs, M, update(t) { for (const s of spinners) s.rotation.y = t * 0.9; } };
}
