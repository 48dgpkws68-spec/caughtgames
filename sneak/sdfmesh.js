// Organische vormen uit code: een vorm is een afstandsfunctie (SDF) van samengesmolten ellipsoïden en
// afgeronde kegels, min uitgesneden holtes (een mond). meshSDF maakt daar één keer een gladde mesh van met
// 'surface nets' op een raster (geen tabellen nodig), normalen uit de gradiënt van de SDF en per hoekpunt de kleur
// van het dichtstbijzijnde onderdeel (tanden wit, tong roze, holte donker). Geen bibliotheek, alleen three.
//   const shape = makeShape(prims, { bump });   meshSDF(shape, n, kleuren, tint, mat, naad, { deco }) -> BufferGeometry
// prims: { t: 'e', c: [x,y,z], r: [rx,ry,rz], col, k, rot: [ax, ay, az], sub, clip }   ellipsoïde (sub = uitsnijden)
//        { t: 'c', a: [x,y,z], b: [x,y,z], ra, rb, col, k }                          afgeronde kegel / capsule
//        { t: 't', c: [x,y,z], R, r, rot, col, k, R2, clip }                          ring (torus om de eigen y-as): oogranden
//                                                                                      R2: tweede hoofdstraal (ovale ring)
//        { t: 'u', pts: [[x,y,z,r], ...], closed, col, k, clip }                      buis langs punten (dikte per punt)
//        { t: 'p', y }                                                                 vloer (als cut: alles eronder weg)
// k = hoe zacht dit onderdeel met de rest versmelt (m), col = sleutel in de kleurentabel.
// clip: [y0, kromming, x0, helling] = alleen boven y0 + kromming (x - x0)^2 + helling x; met een 5e getal -1 alleen
// eronder (halve ring onder een ooglid).
// Snelheid: elk onderdeel wordt één keer omgezet naar een vaste vorm (zelfde velden voor elk type, snel voor de JIT),
// en per blok van de ruimte staat klaar welke onderdelen daar mee kunnen tellen. Overslaan gebeurt alleen waar de
// uitkomst gegarandeerd niet verandert (de smooth-min heeft een compacte drager), dus de mesh blijft bit-gelijk.
import * as THREE from 'three';

const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

// rotatie (Euler XYZ) als inverse 3x3-matrix, om een punt naar de eigen ruimte van een onderdeel te brengen
function invRot(rot) {
  if (!rot) return null;
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0)).invert().elements;
  return [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
}

// (zelfde uitkomst als max(k - |a - b|, 0) / k, alleen zonder deling als de twee ver uit elkaar liggen)
const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const g = k - Math.abs(a - b); if (g <= 0) return Math.min(a, b); const h = g / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

// zachte 3D-waarderuis (deterministisch) voor bobbels en spikkels
function hash3(i, j, k) {
  let h = (i * 374761393 + j * 668265263 + k * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const lerp = (a, b, t) => a + (b - a) * t;
export function noise3(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  const fx = x - i, fy = y - j, fz = z - k;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  return lerp(lerp(lerp(hash3(i, j, k), hash3(i + 1, j, k), u), lerp(hash3(i, j + 1, k), hash3(i + 1, j + 1, k), u), v),
    lerp(lerp(hash3(i, j, k + 1), hash3(i + 1, j, k + 1), u), lerp(hash3(i, j + 1, k + 1), hash3(i + 1, j + 1, k + 1), u), v), w);
}

// ------------------------------------------------------------------ onderdelen in vaste vorm
const T_E = 0, T_C = 1, T_P = 2, T_T = 3, T_U = 4;
// ondergrens van de afstand (voor het overslaan van uitsnijdingen): 0 = geen, 1 = begrenzende bol (exacte SDF),
// 2 = ellipsoïde (benadering van iq: d >= (|p| / rmax - 1) rmin buiten de grootste straal)
const LB_NONE = 0, LB_SPHERE = 1, LB_ELL = 2;
class Prim {
  constructor(p) {
    const t = p.t === 'c' ? T_C : p.t === 'p' ? T_P : p.t === 't' ? T_T : p.t === 'u' ? T_U : T_E;
    this.t = t;
    this.k = p.k ?? 0.04;
    this.sub = !!p.sub; this.cut = !!p.cut; this.post = !!p.post;
    this.pri = p.pri || 0;
    this.col = p.col;
    this.key = p.sub || p.cut ? (p.col || 'mouth') : p.col;
    this.bumpy = false;
    // middelpunt en draaiing (ellipsoïde, ring)
    const c = (t === T_E || t === T_T) && p.c ? p.c : null;
    this.cx = c ? c[0] : 0; this.cy = c ? c[1] : 0; this.cz = c ? c[2] : 0;
    const m = t === T_E || t === T_T ? invRot(p.rot) : null;
    this.hasM = !!m;
    this.m0 = m ? m[0] : 1; this.m1 = m ? m[1] : 0; this.m2 = m ? m[2] : 0;
    this.m3 = m ? m[3] : 0; this.m4 = m ? m[4] : 1; this.m5 = m ? m[5] : 0;
    this.m6 = m ? m[6] : 0; this.m7 = m ? m[7] : 0; this.m8 = m ? m[8] : 1;
    // ellipsoïde
    const r = t === T_E ? p.r : null;
    this.rx = r ? r[0] : 1; this.ry = r ? r[1] : 1; this.rz = r ? r[2] : 1;
    this.rx2 = this.rx * this.rx; this.ry2 = this.ry * this.ry; this.rz2 = this.rz * this.rz;
    this.nmin = -Math.min(this.rx, this.ry, this.rz);
    // ring: hoofdstraal R (en R2 voor een ovale ring), buisstraal tr
    this.R = t === T_T ? p.R : 0; this.tr = t === T_T ? p.r : 0;
    this.R2 = t === T_T && p.R2 ? p.R2 : 0;
    this.Rq = this.R * this.R; this.R2q = this.R2 * this.R2;
    // snijvlak (ellipsoïde, ring, buis)
    const cl = t !== T_C && t !== T_P && p.clip ? p.clip : null;
    this.hasClip = !!cl;
    this.cl0 = cl ? cl[0] : 0; this.cl1 = cl ? cl[1] : 0; this.cl2 = cl ? cl[2] || 0 : 0; this.cl3 = cl ? cl[3] || 0 : 0;
    this.below = !!(cl && cl[4] === -1);
    // kegel
    const a = t === T_C ? p.a : null, b = t === T_C ? p.b : null;
    this.ax = a ? a[0] : 0; this.ay = a ? a[1] : 0; this.az = a ? a[2] : 0;
    this.bx = b ? b[0] : 0; this.by = b ? b[1] : 0; this.bz = b ? b[2] : 0;
    this.ra = t === T_C ? p.ra : 0; this.rb = t === T_C ? p.rb : 0;
    this.l2 = t === T_C ? (this.bx - this.ax) ** 2 + (this.by - this.ay) ** 2 + (this.bz - this.az) ** 2 || 1e-6 : 1;
    this.bax = this.bx - this.ax; this.bay = this.by - this.ay; this.baz = this.bz - this.az;
    this.rr = this.ra - this.rb; this.a2 = this.l2 - this.rr * this.rr; this.il2 = 1 / this.l2;
    this.s3 = Math.sign(this.rr) * this.rr * this.rr;
    // vloer
    this.py = t === T_P ? p.y : 0;
    // buis: per stuk [ax, ay, az, dx, dy, dz, 1/l2, ra, rb - ra]
    this.seg = null; this.ns = 0; this.lip = 1;
    this.fast = t === T_E && !p.clip ? 1 : t === T_C ? 2 : 0;   // snelle weg in ev()
    // begrenzende bol (snel overslaan als het onderdeel te ver weg ligt om mee te tellen)
    this.hasB = false; this.bcx = 0; this.bcy = 0; this.bcz = 0; this.br = 0;
    this.lbKind = LB_NONE; this.emax = 0; this.emin = 0;
    if (t === T_C) {
      this.hasB = true;
      this.bcx = (this.ax + this.bx) / 2; this.bcy = (this.ay + this.by) / 2; this.bcz = (this.az + this.bz) / 2;
      this.br = Math.sqrt(this.l2) / 2 + Math.max(p.ra, p.rb);
      // de formule van iq is exact zolang de ene bol niet in de andere ligt
      if (this.a2 > 1e-9 && this.l2 > 1e-8) this.lbKind = LB_SPHERE;
    } else if (t === T_E) {
      this.hasB = true; this.bcx = this.cx; this.bcy = this.cy; this.bcz = this.cz; this.br = Math.max(...p.r);
      this.lbKind = LB_ELL; this.emax = this.br; this.emin = Math.min(...p.r);
    } else if (t === T_T) {
      this.hasB = true; this.bcx = this.cx; this.bcy = this.cy; this.bcz = this.cz;
      this.br = p.R + p.r + (this.R2 > p.R ? this.R2 - p.R : 0);
      if (!this.R2) this.lbKind = LB_SPHERE;
    } else if (t === T_U) {
      const pts = p.pts, n = pts.length, ns = p.closed ? n : n - 1;
      const S = new Float64Array(Math.max(1, ns) * 9);
      const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (const q of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); }
      this.bcx = (lo[0] + hi[0]) / 2; this.bcy = (lo[1] + hi[1]) / 2; this.bcz = (lo[2] + hi[2]) / 2;
      let br = 0;
      for (const q of pts) br = Math.max(br, Math.hypot(q[0] - this.bcx, q[1] - this.bcy, q[2] - this.bcz) + (q[3] || 0));
      for (let i = 0; i < ns; i++) {
        const A = pts[i], B = pts[(i + 1) % n], o = i * 9;
        const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
        S[o] = A[0]; S[o + 1] = A[1]; S[o + 2] = A[2]; S[o + 3] = dx; S[o + 4] = dy; S[o + 5] = dz;
        S[o + 6] = 1 / (dx * dx + dy * dy + dz * dz || 1e-12); S[o + 7] = A[3] || 0; S[o + 8] = (B[3] || 0) - (A[3] || 0);
        // dikte die meeloopt: de afstand is hooguit (1 + |dr| / lengte)-Lipschitz
        this.lip = Math.max(this.lip, 1 + Math.abs(S[o + 8]) * Math.sqrt(S[o + 6]) * (1 + 1e-9));
      }
      this.seg = S; this.ns = ns;
      this.hasB = true; this.br = br * (1 + 1e-9) + 1e-9;
      this.lbKind = LB_SPHERE;
    }
  }
}

// afstand tot één onderdeel (dezelfde rekenstappen als altijd: de uitkomst is bit-gelijk aan de eerdere versie)
function one(p, x, y, z) {
  const de = raw(p, x, y, z);
  if (!p.hasClip) return de;
  // clip: [y0, kromming, x0, helling] = alleen boven y0 + k (x - x0)^2 + helling x (een mond terugvullen tot een
  // lachboog, eventueel scheef); met below alleen eronder
  const cx = x - p.cl2;
  const g = p.cl0 + p.cl1 * cx * cx + p.cl3 * x - y;
  return smax(de, p.below ? -g : g, 0.012);
}
// snelle wegen voor de twee gewone typen (klein, zodat de JIT ze in de lussen inlinet): ellipsoïde zonder clip
// (benadering van iq: k0 * (k0 - 1) / k1, nauwkeurig vlak bij het oppervlak) en afgeronde kegel (iq, exact)
function ell(p, x, y, z) {
  let lx = x - p.cx, ly = y - p.cy, lz = z - p.cz;
  if (p.hasM) { const tx = p.m0 * lx + p.m1 * ly + p.m2 * lz, ty = p.m3 * lx + p.m4 * ly + p.m5 * lz; lz = p.m6 * lx + p.m7 * ly + p.m8 * lz; lx = tx; ly = ty; }
  const ex = lx / p.rx, ey = ly / p.ry, ez = lz / p.rz;
  const k0 = Math.sqrt(ex * ex + ey * ey + ez * ez);
  const fx = lx / p.rx2, fy = ly / p.ry2, fz = lz / p.rz2;
  const k1 = Math.sqrt(fx * fx + fy * fy + fz * fz);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : p.nmin;
}
function cone(p, x, y, z) {
  const pax = x - p.ax, pay = y - p.ay, paz = z - p.az;
  const bax = p.bax, bay = p.bay, baz = p.baz, l2 = p.l2, il2 = p.il2, a2 = p.a2;
  const yy = pax * bax + pay * bay + paz * baz, zz = yy - l2;
  const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
  const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2;
  const k = p.s3 * x2;
  if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - p.rb;
  if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - p.ra;
  return (Math.sqrt(x2 * a2 * il2) + yy * p.rr) * il2 - p.ra;
}
// afstand met de snelle weg als het kan
const ev = (p, x, y, z) => (p.fast === 1 ? ell(p, x, y, z) : p.fast === 2 ? cone(p, x, y, z) : one(p, x, y, z));
// zonder clip (alle typen)
function raw(p, x, y, z) {
  const t = p.t;
  if (t === T_C) return cone(p, x, y, z);
  if (t === T_P) return y - p.py;   // vloer: alles onder y valt weg (als cut)
  if (t === T_U) return tube(p, x, y, z);
  if (t === T_E) return ell(p, x, y, z);
  // ring (torus om de eigen y-as)
  let lx = x - p.cx, ly = y - p.cy, lz = z - p.cz;
  if (p.hasM) { const tx = p.m0 * lx + p.m1 * ly + p.m2 * lz, ty = p.m3 * lx + p.m4 * ly + p.m5 * lz; lz = p.m6 * lx + p.m7 * ly + p.m8 * lz; lx = tx; ly = ty; }
  if (!p.R2) {
    const q = Math.sqrt(lx * lx + lz * lz) - p.R;
    return Math.sqrt(q * q + ly * ly + 0) - p.tr;
  }
  // ovale ring: afstand tot de ellips in het vlak (benadering van iq, zoals de ellipsoïde), dan de buis eromheen
  const ex = lx / p.R, ez = lz / p.R2, fx = lx / p.Rq, fz = lz / p.R2q;
  const k0 = Math.sqrt(ex * ex + ez * ez), k1 = Math.sqrt(fx * fx + fz * fz);
  const q = k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(p.R, p.R2);
  return Math.sqrt(q * q + ly * ly) - p.tr;
}
// buis langs punten: kleinste afstand tot een stukje min de dikte daar (dikte loopt lineair mee)
function tube(p, x, y, z) {
  const S = p.seg;
  let best = 1e9;
  for (let i = 0, o = 0; i < p.ns; i++, o += 9) {
    const px = x - S[o], py = y - S[o + 1], pz = z - S[o + 2];
    let f = (px * S[o + 3] + py * S[o + 4] + pz * S[o + 5]) * S[o + 6];
    f = f < 0 ? 0 : f > 1 ? 1 : f;
    const qx = px - S[o + 3] * f, qy = py - S[o + 4] * f, qz = pz - S[o + 5] * f;
    const dd = Math.sqrt(qx * qx + qy * qy + qz * qz) - (S[o + 7] + S[o + 8] * f);
    if (dd < best) best = dd;
  }
  return best;
}
// strikte ondergrens van one() in een punt (of -1e9 als die er niet is), voor het overslaan van uitsnijdingen
function lowerBound(p, x, y, z) {
  const k = p.lbKind;
  if (k === LB_NONE) return -1e9;
  const dx = x - p.bcx, dy = y - p.bcy, dz = z - p.bcz;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (k === LB_SPHERE) return dist - p.br;
  return dist > p.emax ? (dist / p.emax - 1) * p.emin : -1e9;
}

// ------------------------------------------------------------------ vorm
// prims -> { d(x,y,z), col(x,y,z), bump, lo, hi }
// opts.bump = { amp, freq, lo, sharp, pit, cols: [kleuren met bobbels], mask(x, y, z) }: bobbelige huid (Gobz, Zeee,
// Glorp); mask (0..1) beperkt de bobbels tot een deel van het lijf (kop en rug)
// Blokken: de ruimte in kubussen; per blok per stadium alleen de onderdelen die daar mee kunnen tellen (in de
// oorspronkelijke volgorde), met per onderdeel de kleinste en grootste afstand van het blok tot zijn begrenzende bol.
// Een onderdeel valt in een blok weg als het daar voor elk punt verder weg ligt dan de bovengrens van de lopende
// waarde plus versmelting en marge: die bovengrens volgt uit de onderdelen ervoor (meegeteld: hooguit hun afstand,
// overgeslagen: hooguit hun ondergrens min k en marge). Exact, dus bit-gelijk.
const EPS = 1e-7, TINY = 1e-9, NB = 7, IDM = [1, 0, 0, 0, 1, 0, 0, 0, 1];   // NB = getallen per onderdeel in een bloklijst
export function makeShape(prims, opts = {}) {
  const P = prims.map((p) => new Prim(p));
  // post: na het uitsnijden erbij (tanden in een mondholte)
  // cut: als laatste uitsnijden (oogkassen: het oog zit in een kuiltje met een randje erom)
  const adds = P.filter((p) => !p.sub && !p.post && !p.cut), subs = P.filter((p) => p.sub), posts = P.filter((p) => p.post && !p.sub), cuts = P.filter((p) => p.cut);
  const B = opts.bump;
  const bLo = B ? B.lo ?? 0.35 : 0, bSharp = B ? B.sharp ?? 1.6 : 1, bMask = B && typeof B.mask === 'function' ? B.mask : null;
  const bumpAt = (x, y, z) => {
    const n = noise3(x * B.freq + 11.3, y * B.freq + 3.1, z * B.freq + 7.7), b = Math.max(0, n - bLo) / (1 - bLo);
    // pow(0, s) = 0 voor s > 0: de dure macht alleen waar er een bobbel is
    const v = b > 0 || !(bSharp > 0) ? Math.pow(b, bSharp) * B.amp : 0 * B.amp;
    return bMask ? v * Math.max(0, Math.min(1, bMask(x, y, z))) : v;
  };
  const bumpy = B ? new Set(B.cols || ['body']) : null;
  for (const p of adds) p.bumpy = !!(bumpy && bumpy.has(p.col));
  const bSign = B && B.pit ? 1 : -1, bUp = B && B.pit ? Math.abs(B.amp) : 0;
  // omhullende uit de onderdelen (plus marge voor bobbels en versmelting)
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const p of [...adds, ...posts].filter((q) => q.t !== T_P)) {
    const pts = p.t === T_C ? [[p.ax, p.ay, p.az, p.ra], [p.bx, p.by, p.bz, p.rb]] : [[p.bcx, p.bcy, p.bcz, p.br]];
    for (const [x, y, z, r] of pts) {
      lo[0] = Math.min(lo[0], x - r); lo[1] = Math.min(lo[1], y - r); lo[2] = Math.min(lo[2], z - r);
      hi[0] = Math.max(hi[0], x + r); hi[1] = Math.max(hi[1], y + r); hi[2] = Math.max(hi[2], z + r);
    }
  }
  const pad = 0.06 + (B ? B.amp : 0);
  const LO = lo.map((v) => v - pad), HI = hi.map((v) => v + pad);

  // ---- blokken (lui opgebouwd; buiten de omhullende één los blok met alles en zonder grenzen)
  const ext = Math.max(HI[0] - LO[0], HI[1] - LO[1], HI[2] - LO[2]);
  const bs = Math.max(0.03, ext / (opts.blocks || 12));
  const gx = Math.max(1, Math.ceil((HI[0] - LO[0]) / bs)), gy = Math.max(1, Math.ceil((HI[1] - LO[1]) / bs)), gz = Math.max(1, Math.ceil((HI[2] - LO[2]) / bs));
  const blocks = new Array(gx * gy * gz).fill(null);
  const pack = (list) => {
    const F = new Float64Array(list.length * NB);
    list.forEach((p, i) => {
      const o = i * NB;
      F[o] = -Infinity; F[o + 1] = p.hasB ? Infinity : -Infinity;   // altijd de echte toets (of nooit overslaan)
      F[o + 2] = p.bcx; F[o + 3] = p.bcy; F[o + 4] = p.bcz; F[o + 5] = p.br; F[o + 6] = p.k;
    });
    return { L: list, F, n: list.length };
  };
  const noLb = (list) => ({ L: list, F: new Float64Array(list.length).fill(-Infinity), n: list.length });
  const ALL = { adds: pack(adds), subs: noLb(subs), posts: pack(posts), cuts: noLb(cuts), all: pack(P) };
  // grenzen van één onderdeel over een blok: lmin/lmax van |p - bc| - br plus onder- en bovengrens van de afstand zelf
  const G = { lmin: 0, lmax: 0, ub: 0, lb: 0 };
  function bounds(p, x0, y0, z0, x1, y1, z1, hd) {
    if (p.hasB) {
      const nx = Math.max(x0 - p.bcx, 0, p.bcx - x1), ny = Math.max(y0 - p.bcy, 0, p.bcy - y1), nz = Math.max(z0 - p.bcz, 0, p.bcz - z1);
      const fx = Math.max(Math.abs(x0 - p.bcx), Math.abs(x1 - p.bcx)), fy = Math.max(Math.abs(y0 - p.bcy), Math.abs(y1 - p.bcy)), fz = Math.max(Math.abs(z0 - p.bcz), Math.abs(z1 - p.bcz));
      const dn = Math.sqrt(nx * nx + ny * ny + nz * nz), df = Math.sqrt(fx * fx + fy * fy + fz * fz);
      G.lmin = dn - p.br - TINY; G.lmax = df - p.br + TINY;
      if (p.t === T_E) ellBounds(p, x0, y0, z0, x1, y1, z1); else if (p.t === T_T && p.R2) { G.ub = Infinity; G.lb = -Infinity; }
      else {
        // exacte afstand (kegel, ring) of buis: Lipschitz L rond het midden van het blok
        const L = p.t === T_U ? p.lip : 1;
        if (p.t === T_C && p.lbKind !== LB_SPHERE) { G.ub = Infinity; G.lb = -Infinity; }
        else {
          const sc = raw(p, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
          G.ub = sc + L * hd; G.lb = sc - L * hd;
        }
      }
      if (p.hasClip) {
        // smax(d, g, 0.012) ligt tussen max(d, g) en max(d, g) + 0.003; g is kwadratisch in x en lineair in y
        const f = (x) => p.cl1 * (x - p.cl2) * (x - p.cl2) + p.cl3 * x;
        let fmax = Math.max(f(x0), f(x1)), fmin = Math.min(f(x0), f(x1));
        if (p.cl1 !== 0) { const xs = p.cl2 - p.cl3 / (2 * p.cl1); if (xs > x0 && xs < x1) { fmax = Math.max(fmax, f(xs)); fmin = Math.min(fmin, f(xs)); } }
        const gmax = p.below ? -p.cl0 - fmin + y1 : p.cl0 + fmax - y0;
        G.ub = Math.max(G.ub, gmax) + 0.003;
      }
    } else {
      G.lmin = -Infinity; G.lmax = -Infinity;
      if (p.t === T_P) { G.ub = y1 - p.py; G.lb = y0 - p.py; } else { G.ub = Infinity; G.lb = -Infinity; }
    }
    G.ub += TINY * 10; G.lb -= TINY * 10;
  }
  // ellipsoïde (benadering van iq): d = k0 (k0 - 1) / k1 met k0 = |l / r|, k1 = |l / r^2| (l = eigen ruimte), dus
  // d = (k0 - 1) k0 / k1 met rmin <= k0 / k1 <= rmax. Grenzen van k0 en k1 over het blok uit intervallen van l.
  function ellBounds(p, x0, y0, z0, x1, y1, z1) {
    const mx = (x0 + x1) / 2 - p.cx, my = (y0 + y1) / 2 - p.cy, mz = (z0 + z1) / 2 - p.cz, hx = (x1 - x0) / 2, hy = (y1 - y0) / 2, hz = (z1 - z0) / 2;
    const M = p.hasM ? [p.m0, p.m1, p.m2, p.m3, p.m4, p.m5, p.m6, p.m7, p.m8] : IDM, R = [p.rx, p.ry, p.rz];
    let a0 = 0, a1 = 0, b0 = 0, b1 = 0;
    for (let i = 0; i < 3; i++) {
      const c = M[i * 3] * mx + M[i * 3 + 1] * my + M[i * 3 + 2] * mz, w = Math.abs(M[i * 3]) * hx + Math.abs(M[i * 3 + 1]) * hy + Math.abs(M[i * 3 + 2]) * hz + TINY;
      const lo = c - w, hi = c + w, n2 = lo > 0 ? lo * lo : hi < 0 ? hi * hi : 0, f2 = Math.max(lo * lo, hi * hi), r = R[i];
      a0 += n2 / (r * r); a1 += f2 / (r * r); b0 += n2 / (r * r * r * r); b1 += f2 / (r * r * r * r);
    }
    const k0a = Math.sqrt(a0) * (1 - 1e-12), k0b = Math.sqrt(a1) * (1 + 1e-12), k1a = Math.sqrt(b0) * (1 - 1e-12), k1b = Math.sqrt(b1) * (1 + 1e-12);
    // ondergrens: buiten (k0 >= 1) de grootste van (k0 - 1) rmin en k0 (k0 - 1) / k1max, binnen (k0 - 1) rmax
    G.lb = k0a >= 1 ? Math.max((k0a - 1) * p.emin, k1b > 0 ? (k0a * (k0a - 1)) / k1b : 0) : (k0a - 1) * p.emax;
    // bovengrens: binnen (k0 <= 1) (k0 - 1) rmin, buiten de kleinste van (k0 - 1) rmax en k0 (k0 - 1) / k1min
    G.ub = k0b <= 1 ? (k0b - 1) * p.emin : Math.min((k0b - 1) * p.emax, k1a > 1e-9 ? (k0b * (k0b - 1)) / k1a : Infinity);
  }
  // één stadium: onderdelen die in dit blok mee kunnen tellen; ub0 = bovengrens van de waarde bij de start
  // single: één lopende waarde (zonder bobbels): dan valt ook weg wat overal een no-op is (afstand >= waarde + k)
  function stage(list, ub0, x0, y0, z0, x1, y1, z1, hd, single) {
    let U = ub0;
    const keep = [], nums = [];
    for (const p of list) {
      bounds(p, x0, y0, z0, x1, y1, z1, hd);
      // weg: voor elk punt in het blok is de ondergrens groter dan (bovengrens + k + 0.08)
      const gone = (p.hasB && G.lmin > U + p.k + 0.08 + TINY) || (single && G.lb >= U + p.k + EPS);
      if (!gone) { keep.push(p); nums.push(G.lmin, G.lmax); }
      // daarna is de waarde hooguit de afstand tot dit onderdeel (meegeteld) of zijn ondergrens min k en marge
      U = Math.min(U, p.hasB ? Math.max(G.ub, G.lmax - p.k - 0.08 + TINY) : G.ub);
    }
    const F = new Float64Array(keep.length * NB);
    keep.forEach((p, i) => {
      const o = i * NB;
      F[o] = nums[i * 2]; F[o + 1] = nums[i * 2 + 1];
      F[o + 2] = p.bcx; F[o + 3] = p.bcy; F[o + 4] = p.bcz; F[o + 5] = p.br; F[o + 6] = p.k;
    });
    return { s: { L: keep, F, n: keep.length }, U };
  }
  // uitsnijden (sub, cut): per blok de ondergrens van de afstand; overslaan als die plus v al >= k (compacte drager)
  const cutList = (list, x0, y0, z0, x1, y1, z1, hd) => {
    const F = new Float64Array(list.length);
    list.forEach((p, i) => { bounds(p, x0, y0, z0, x1, y1, z1, hd); F[i] = G.lb; });
    return { L: list, F, n: list.length };
  };
  function makeBlock(x0, y0, z0, b) {
    const x1 = x0 + b, y1 = y0 + b, z1 = z0 + b, hd = b * 0.8660254037844386 + TINY;
    const A = stage(adds, Infinity, x0, y0, z0, x1, y1, z1, hd, !adds.some((p) => p.bumpy));
    // na de bobbels (putjes: hooguit amp erbij) en het uitsnijden: smax(v, b, k) <= max(v, b + 1,25 k)
    let U = A.U + bUp;
    for (const p of subs) { bounds(p, x0, y0, z0, x1, y1, z1, hd); U = Math.max(U, -G.lb + 1.25 * Math.max(0, p.k)) + TINY; }
    const Ps = stage(posts, U, x0, y0, z0, x1, y1, z1, hd, true);
    return { adds: A.s, subs: cutList(subs, x0, y0, z0, x1, y1, z1, hd), posts: Ps.s, cuts: cutList(cuts, x0, y0, z0, x1, y1, z1, hd), all: null, box: [x0, y0, z0, x1, y1, z1, hd] };
  }
  // kleur: alle onderdelen met hun grenzen (geen weglating), pas bij de eerste kleurvraag in het blok
  function colList(b) {
    if (b === ALL) return ALL.all;
    if (!b.all) {
      const [x0, y0, z0, x1, y1, z1, hd] = b.box, all = pack(P);
      for (let q = 0; q < P.length; q++) { bounds(P[q], x0, y0, z0, x1, y1, z1, hd); all.F[q * NB] = G.lmin; all.F[q * NB + 1] = G.lmax; }
      b.all = all;
    }
    return b.all;
  }
  // een blok wordt pas opgebouwd bij de derde vraag (losse punten ver van het oppervlak, zoals het grove raster: daar
  // loont het niet); tot dan geldt het grote blok eromheen (4 x 4 x 4 blokken)
  const uses = new Uint8Array(gx * gy * gz), g4x = Math.ceil(gx / 4), g4y = Math.ceil(gy / 4), big = new Array(g4x * g4y * Math.ceil(gz / 4)).fill(null);
  const blockAt = (x, y, z) => {
    const i = Math.floor((x - LO[0]) / bs), j = Math.floor((y - LO[1]) / bs), k = Math.floor((z - LO[2]) / bs);
    if (!(i >= 0 && j >= 0 && k >= 0 && i < gx && j < gy && k < gz)) return ALL;   // ook NaN: het losse blok
    const id = i + gx * (j + gy * k);
    const b = blocks[id];
    if (b) return b;
    if (uses[id] < 2) {
      uses[id]++;
      const I = i >> 2, J = j >> 2, K = k >> 2, bid = I + g4x * (J + g4y * K);
      return big[bid] || (big[bid] = makeBlock(LO[0] + I * 4 * bs, LO[1] + J * 4 * bs, LO[2] + K * 4 * bs, 4 * bs));
    }
    return (blocks[id] = makeBlock(LO[0] + i * bs, LO[1] + j * bs, LO[2] + k * bs, bs));
  };

  function d(x, y, z) {
    const blk = blockAt(x, y, z);
    let v = 1e9, vb = 1e9;
    {
      const { L, F, n } = blk.adds;
      for (let i = 0, o = 0; i < n; i++, o += NB) {
        // far: ondergrens van de afstand groter dan de huidige waarde plus versmelting en marge
        const lim = Math.min(v, vb) + F[o + 6] + 0.08;
        if (F[o] > lim) continue;
        const p = L[i];
        if (F[o + 1] > lim) {
          const dx = x - F[o + 2], dy = y - F[o + 3], dz = z - F[o + 4], lb = Math.sqrt(dx * dx + dy * dy + dz * dz) - F[o + 5];
          if (lb > lim) continue;
          // telt toch niet mee: s >= lb >= acc + k geeft smin(acc, s, k) = acc precies (exacte afstand: bol is ondergrens)
          if (p.lbKind === LB_SPHERE && lb >= (p.bumpy ? vb : v) + F[o + 6] + EPS) continue;
        }
        const s = p.fast === 1 ? ell(p, x, y, z) : p.fast === 2 ? cone(p, x, y, z) : one(p, x, y, z);
        if (p.bumpy) vb = smin(vb, s, p.k); else v = smin(v, s, p.k);
      }
    }
    if (bumpy && vb < 0.3) vb += bSign * bumpAt(x, y, z);
    v = smin(v, vb, 0.03);
    // uitsnijden: smax(v, -s, k) is precies v zodra s >= k - v (compacte drager), dan overslaan
    {
      const { L, F, n } = blk.subs;
      for (let i = 0; i < n; i++) {
        const p = L[i];
        if (F[i] + v >= p.k + EPS || (p.lbKind && lowerBound(p, x, y, z) + v >= p.k + EPS)) continue;
        v = smax(v, -ev(p, x, y, z), p.k);
      }
    }
    {
      const { L, F, n } = blk.posts;
      for (let i = 0, o = 0; i < n; i++, o += NB) {
        const lim = v + F[o + 6] + 0.08;
        if (F[o] > lim) continue;
        const p = L[i];
        if (F[o + 1] > lim) {
          const dx = x - F[o + 2], dy = y - F[o + 3], dz = z - F[o + 4], lb = Math.sqrt(dx * dx + dy * dy + dz * dz) - F[o + 5];
          if (lb > lim || (p.lbKind === LB_SPHERE && lb >= v + F[o + 6] + EPS)) continue;
        }
        v = smin(v, p.fast === 1 ? ell(p, x, y, z) : p.fast === 2 ? cone(p, x, y, z) : one(p, x, y, z), p.k);
      }
    }
    {
      const { L, F, n } = blk.cuts;
      for (let i = 0; i < n; i++) {
        const p = L[i];
        if (F[i] + v >= p.k + EPS || (p.lbKind && lowerBound(p, x, y, z) + v >= p.k + EPS)) continue;
        v = smax(v, -ev(p, x, y, z), p.k);
      }
    }
    return v;
  }
  // kleur: het onderdeel waarvan het oppervlak het dichtst bij dit punt ligt (uitsnijdingen tellen met |d|)
  function col(x, y, z) {
    const { L, F, n } = colList(blockAt(x, y, z));
    let best = 1e9, c = 'body';
    for (let i = 0, o = 0; i < n; i++, o += NB) {
      const lim = best + 0.05;
      if (F[o] > lim) continue;
      if (F[o + 1] > lim) {
        const dx = x - F[o + 2], dy = y - F[o + 3], dz = z - F[o + 4];
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) - F[o + 5] > lim) continue;
      }
      const p = L[i];
      let s = Math.abs(ev(p, x, y, z));
      // op de rand wint het lijf (anders springen randpunten om en om van kleur: stippels); diep in een holte de holte
      if (p.sub) s = s * 0.98 + 0.002;
      if (p.cut) s += 0.006;
      if (p.pri) s -= p.pri;
      if (s < best) { best = s; c = p.key; }
    }
    return c;
  }
  return { d, col, bump: B ? bumpAt : null, lo: LO, hi: HI };
}

// surface nets: n = aantal cellen langs de langste as. colors: { sleutel: THREE.Color } (lineair).
// tint(x, y, z, key, color, n) mag de kleur per hoekpunt aanpassen (spikkels, vlekken); n = de normaal (Vector3).
// matte: sleutels die mat moeten (mondholte): attribuut aMatte = 1
// smooth: zoveel keer de kleur middelen op de naad tussen twee onderdelen (anders volgt de naad het raster: zigzag)
// meshSDFSteps is een generator die af en toe pauzeert (yield), zodat het bouwen over beeldjes verdeeld kan worden
// (bijvoorbeeld via runSteps); meshSDF bouwt in één keer. Het echte werk zit in losse kleine functies per
// stap (één laag of 256 hoekpunten): die compileert de JIT één keer voor alle meshes.
// opts.deco: attribuut aDeco = 1 (true: alle hoekpunten, of een Set met kleursleutels) voor een eigen afwerking
export function meshSDF(shape, n, colors, tint = null, matte = null, smooth = 1, opts = null) {
  return runSteps(meshSDFSteps(shape, n, colors, tint, matte, smooth, opts));
}
export function runSteps(it) {
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}
export function* meshSDFSteps(shape, n, colors, tint = null, matte = null, smooth = 1, opts = null) {
  const { lo, hi } = shape;
  const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const h = ext / n;
  const nx = Math.ceil((hi[0] - lo[0]) / h), ny = Math.ceil((hi[1] - lo[1]) / h), nz = Math.ceil((hi[2] - lo[2]) / h);
  // eerst een grof raster (elke 4e punt); ver van het oppervlak (|d| > 9 cellen) blijft die waarde staan, want daar
  // telt alleen het teken. Alleen de schil rond het oppervlak wordt fijn uitgerekend.
  const G4 = 4, qx = Math.ceil(nx / G4) + 1, qy = Math.ceil(ny / G4) + 1, qz = Math.ceil(nz / G4) + 1;
  const M = {
    d: shape.d, col: shape.col, lo0: lo[0], lo1: lo[1], lo2: lo[2], h, nx, ny, nz, px: nx + 1, py: ny + 1,
    V: new Float32Array((nx + 1) * (ny + 1) * (nz + 1)), qx, qy, qz, Q: new Float32Array(qx * qy * qz), band: 9 * h,
    cellV: null, pos: [], idx: [],
  };
  for (let k = 0; k < qz; k++) { for (let j = 0; j < qy; j++) coarseRow(M, j, k); yield; }
  for (let k = 0; k <= nz; k++) { for (let j = 0; j <= ny; j++) fineRow(M, j, k); yield; }
  M.cellV = new Int32Array(nx * ny * nz).fill(-1);
  for (let k = 0; k < nz; k++) { for (let j = 0; j < ny; j++) cellRow(M, j, k); yield; }
  for (let k = 0; k <= nz; k++) { for (let j = 0; j <= ny; j++) quadRow(M, j, k); yield; }
  // normalen uit de gradiënt, kleur per hoekpunt
  const nv = M.pos.length / 3;
  const W = {
    nrm: new Float32Array(nv * 3), colA: new Float32Array(nv * 3), matA: matte ? new Float32Array(nv) : null, matte,
    colors, tint, white: new THREE.Color(1, 1, 1), tmp: new THREE.Color(), nv3: new THREE.Vector3(), keyOf: new Map(), keyA: new Int16Array(nv),
  };
  for (let q = 0; q < nv; q += 256) { if (q) yield; vertexChunk(M, W, q, Math.min(nv, q + 256)); }
  const { nrm, colA, matA, keyOf, keyA } = W, idx = M.idx;
  if (smooth > 0 && keyOf.size > 1) smoothSeams(colA, keyA, idx, nv, smooth);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(M.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colA, 3));
  if (matA) g.setAttribute('aMatte', new THREE.BufferAttribute(matA, 1));
  if (opts && opts.deco) {
    const names = [...keyOf.keys()], set = opts.deco instanceof Set ? opts.deco : null, dec = new Float32Array(nv);
    for (let q = 0; q < nv; q++) dec[q] = !set || set.has(names[keyA[q]]) ? 1 : 0;
    g.setAttribute('aDeco', new THREE.BufferAttribute(dec, 1));
  }
  g.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
function coarseRow(M, j, k) {
  const { d, Q, qx, qy, h, lo0, lo1, lo2 } = M, G4 = 4;
  for (let i = 0; i < qx; i++) Q[i + qx * (j + qy * k)] = d(lo0 + i * G4 * h, lo1 + j * G4 * h, lo2 + k * G4 * h);
}
function fineRow(M, j, k) {
  const { d, Q, V, qx, qy, h, lo0, lo1, lo2, nx, px, py, band } = M, G4 = 4;
  const zk = lo2 + k * h, qj = qx * (Math.round(j / G4) + qy * Math.round(k / G4)), yj = lo1 + j * h, vj = px * (j + py * k);
  for (let i = 0; i <= nx; i++) {
    const c = Q[Math.round(i / G4) + qj];
    V[i + vj] = Math.abs(c) > band ? c : d(lo0 + i * h, yj, zk);
  }
}
// hoekpunt per cel met een tekenwissel: gemiddelde van de snijpunten op de 12 ribben
const EA = [0, 2, 4, 6, 0, 1, 4, 5, 0, 1, 2, 3], EB = [1, 3, 5, 7, 2, 3, 6, 7, 4, 5, 6, 7];
const CO = [0, 1, 0, 1, 0, 1, 0, 1].map((_, c) => [c & 1, (c >> 1) & 1, (c >> 2) & 1]);
const EAX = EA.map((a) => CO[a][0]), EAY = EA.map((a) => CO[a][1]), EAZ = EA.map((a) => CO[a][2]);
const EDX = EA.map((a, e) => CO[EB[e]][0] - CO[a][0]), EDY = EA.map((a, e) => CO[EB[e]][1] - CO[a][1]), EDZ = EA.map((a, e) => CO[EB[e]][2] - CO[a][2]);
const CV = new Float64Array(8);
function cellRow(M, j, k) {
  const { V, px, py, nx, ny, cellV, pos, h, lo0, lo1, lo2 } = M, cv = CV;
  // vier rijen van het raster langs x; de rechterkolom van de ene cel is de linkerkolom van de volgende
  const r0 = px * (j + py * k), r1 = r0 + px, r2 = r0 + px * py, r3 = r2 + px;
  let a0 = V[r0], a1 = V[r1], a2 = V[r2], a3 = V[r3];
  for (let i = 0; i < nx; i++) {
    const b0 = V[r0 + i + 1], b1 = V[r1 + i + 1], b2 = V[r2 + i + 1], b3 = V[r3 + i + 1];
    // hoek c: bit 0 = x, bit 1 = y, bit 2 = z
    const m = (a0 < 0 ? 1 : 0) | (b0 < 0 ? 2 : 0) | (a1 < 0 ? 4 : 0) | (b1 < 0 ? 8 : 0) | (a2 < 0 ? 16 : 0) | (b2 < 0 ? 32 : 0) | (a3 < 0 ? 64 : 0) | (b3 < 0 ? 128 : 0);
    if (m !== 0 && m !== 255) {
      cv[0] = a0; cv[1] = b0; cv[2] = a1; cv[3] = b1; cv[4] = a2; cv[5] = b2; cv[6] = a3; cv[7] = b3;
      let sx = 0, sy = 0, sz = 0, cnt = 0;
      for (let e = 0; e < 12; e++) {
        const va = cv[EA[e]], vb = cv[EB[e]];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        sx += EAX[e] + (EDX[e] * t);
        sy += EAY[e] + (EDY[e] * t);
        sz += EAZ[e] + (EDZ[e] * t);
        cnt++;
      }
      cellV[i + nx * (j + ny * k)] = pos.length / 3;
      pos.push(lo0 + (i + sx / cnt) * h, lo1 + (j + sy / cnt) * h, lo2 + (k + sz / cnt) * h);
    }
    a0 = b0; a1 = b1; a2 = b2; a3 = b3;
  }
}
function quadRow(M, j, k) {
  const { V, px, py, nx, ny, nz, cellV, idx } = M;
  const cell = (i, jj, kk) => (i < 0 || jj < 0 || kk < 0 || i >= nx || jj >= ny || kk >= nz ? -1 : cellV[i + nx * (jj + ny * kk)]);
  const quad = (a, b, c, e, flip) => {
    if (a < 0 || b < 0 || c < 0 || e < 0) return;
    if (flip) idx.push(a, c, b, a, e, c); else idx.push(a, b, c, a, c, e);
  };
  for (let i = 0; i <= nx; i++) {
    const v0 = V[i + px * (j + py * k)], in0 = v0 < 0;
    if (i < nx && (V[i + 1 + px * (j + py * k)] < 0) !== in0) quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), !in0);
    if (j < ny && (V[i + px * (j + 1 + py * k)] < 0) !== in0) quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), !in0);
    if (k < nz && (V[i + px * (j + py * (k + 1))] < 0) !== in0) quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), !in0);
  }
}
function vertexChunk(M, W, q0, q1) {
  const { d, col, pos, h } = M, { nrm, colA, matA, matte, colors, tint, white, tmp, nv3, keyOf, keyA } = W;
  const e = h * 0.5;
  for (let q = q0; q < q1; q++) {
    const x = pos[q * 3], y = pos[q * 3 + 1], z = pos[q * 3 + 2];
    const a1 = d(x + e, y - e, z - e), a2 = d(x - e, y - e, z + e), a3 = d(x - e, y + e, z - e), a4 = d(x + e, y + e, z + e);
    const gx = a1 - a2 - a3 + a4, gy = -a1 - a2 + a3 + a4, gz = -a1 + a2 - a3 + a4;
    const gl = len3(gx, gy, gz) || 1;
    nrm[q * 3] = gx / gl; nrm[q * 3 + 1] = gy / gl; nrm[q * 3 + 2] = gz / gl;
    const key = col(x, y, z);
    if (!keyOf.has(key)) keyOf.set(key, keyOf.size);
    keyA[q] = keyOf.get(key);
    // zachte schaduw in naden, mondhoeken en onder de oogjes (ambient occlusion uit de SDF)
    const nx = nrm[q * 3], ny = nrm[q * 3 + 1], nz = nrm[q * 3 + 2];
    let occ = 0;
    for (let s2 = 1; s2 <= 3; s2++) {
      const hh = s2 * 0.035;
      occ += (hh - d(x + nx * hh, y + ny * hh, z + nz * hh)) / (1 << s2);
    }
    const ao = Math.max(0.45, 1 - occ * 5);
    if (matA && matte.has(key)) matA[q] = 1;
    tmp.copy(colors[key] || white);
    if (tint) tint(x, y, z, key, tmp, nv3.set(nx, ny, nz));
    colA[q * 3] = tmp.r * ao; colA[q * 3 + 1] = tmp.g * ao; colA[q * 3 + 2] = tmp.b * ao;
  }
}

// kleur middelen rond de naad tussen twee onderdelen: alleen hoekpunten met een buur van een ander onderdeel (en bij
// meer rondes hun buren), zelf dubbel gewogen. Kleine vlakjes (stippen, glimpjes) blijven zo heel.
function smoothSeams(colA, keyA, idx, nv, passes) {
  const deg = new Int32Array(nv + 1);
  for (let t = 0; t < idx.length; t++) deg[idx[t] + 1] += 2;
  for (let i = 0; i < nv; i++) deg[i + 1] += deg[i];
  const nb = new Int32Array(deg[nv]), fill = deg.slice(0, nv);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    nb[fill[a]++] = b; nb[fill[a]++] = c; nb[fill[b]++] = c; nb[fill[b]++] = a; nb[fill[c]++] = a; nb[fill[c]++] = b;
  }
  let on = new Uint8Array(nv);
  for (let i = 0; i < nv; i++) for (let j = deg[i]; j < deg[i + 1]; j++) if (keyA[nb[j]] !== keyA[i]) { on[i] = 1; break; }
  const out = new Float32Array(colA.length);
  for (let pass = 0; pass < passes; pass++) {
    out.set(colA);
    for (let i = 0; i < nv; i++) {
      if (!on[i]) continue;
      let r = colA[i * 3] * 2, g = colA[i * 3 + 1] * 2, b = colA[i * 3 + 2] * 2, w = 2;
      for (let j = deg[i]; j < deg[i + 1]; j++) { const q = nb[j] * 3; r += colA[q]; g += colA[q + 1]; b += colA[q + 2]; w++; }
      out[i * 3] = r / w; out[i * 3 + 1] = g / w; out[i * 3 + 2] = b / w;
    }
    colA.set(out);
    if (pass + 1 < passes) {
      const next = on.slice();
      for (let i = 0; i < nv; i++) if (on[i]) for (let j = deg[i]; j < deg[i + 1]; j++) next[nb[j]] = 1;
      on = next;
    }
  }
}
