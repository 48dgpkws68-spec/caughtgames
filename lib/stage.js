// Shared 3D stage for the Caught Games toy-style titles (GOOSE 63, FREEZE, WOBBLE): renderer, sunny toy lighting,
// studio reflections, gentle bloom, resize, a frame loop that pauses in hidden tabs and raycast picking.
//   const S = createStage(canvas, { sky, fog, fov: (aspect) => deg, bloom: [strength, radius, threshold] })
//   S.onFrame((dt, t) => ...)   S.pick(event, meshes) -> intersection | null   S.vinyl('#ff5a7a', { rough })
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export { THREE };
export const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? Math.min(ms, 120) : ms));
export const ease = { out: (k) => 1 - Math.pow(1 - k, 3), inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2), back: (k) => { const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); } };
// run fn(k) for ms milliseconds, k from 0 to 1; resolves when done
export function tween(ms, fn) {
  return new Promise((res) => {
    const t0 = performance.now(), d = reduce ? Math.min(ms, 120) : ms;
    const step = () => { const k = Math.min(1, (performance.now() - t0) / d); fn(k); if (k < 1) requestAnimationFrame(step); else res(); };
    step();
  });
}
export function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
export function radialTex() {
  return canvasTex(256, 256, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }, false);
}
// seeded random for decor (the same scene every visit)
export function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function createStage(canvas, o = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.NeutralToneMapping;   // keeps toy colours saturated
  renderer.toneMappingExposure = o.exposure ?? 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(o.sky || '#8fd3ff');
  if (o.fog) scene.fog = new THREE.Fog(o.fog[0], o.fog[1], o.fog[2]);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environment = env; scene.environmentIntensity = o.envIntensity ?? 0.55;
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);

  // sunny toy lighting: sky fill, warm key sun with soft shadows, cool rim from behind
  const hemi = new THREE.HemisphereLight(o.hemiSky || '#dff3ff', o.hemiGround || '#f3d9b0', o.hemi ?? 1.1);
  const sun = new THREE.DirectionalLight(o.sunColor || '#fff1d6', o.sun ?? 2.4);
  sun.position.set(6, 14, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = o.shadowSize ?? 12;
  Object.assign(sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc, near: 1, far: 60 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 5;
  const rim = new THREE.DirectionalLight(o.rimColor || '#b9c8ff', o.rim ?? 0.8);
  rim.position.set(-8, 6, -10);
  scene.add(hemi, sun, sun.target, rim);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const [bs, br, bt] = o.bloom || [0.35, 0.4, 0.9];
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), bs, br, bt);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); composer.setSize(w, h); bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h; camera.fov = o.fov ? o.fov(camera.aspect) : 45; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas); resize();

  const frames = [];
  const clock = new THREE.Clock();
  let running = true;
  let raf = 0;
  // a hidden tab keeps the last requested frame pending: cancel it before starting again, or every tab switch adds one more render loop
  document.addEventListener('visibilitychange', () => { running = !document.hidden; cancelAnimationFrame(raf); if (running) { clock.getDelta(); raf = requestAnimationFrame(loop); } });
  function loop() {
    if (!running) return;
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
    for (const f of frames) f(dt, t);
    composer.render(dt);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(ev, objs) {
    const b = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(objs, true)[0] || null;
  }
  // screen position (CSS px inside the canvas) of a world point, for HTML labels
  const tmp = new THREE.Vector3();
  function toScreen(v) { tmp.copy(v).project(camera); return { x: (tmp.x * 0.5 + 0.5) * canvas.clientWidth, y: (-tmp.y * 0.5 + 0.5) * canvas.clientHeight, behind: tmp.z > 1 }; }
  const vinyl = (color, x = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: x.rough ?? 0.34, metalness: 0, clearcoat: x.coat ?? 1, clearcoatRoughness: 0.08, envMapIntensity: x.env ?? 0.7, ...x.extra });
  return { THREE, renderer, scene, camera, env, composer, bloom, hemi, sun, rim, onFrame: (f) => frames.push(f), resize, pick, toScreen, vinyl };
}
