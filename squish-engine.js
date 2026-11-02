/* SQUISH JAR engine: pure math, no DOM. Shared by squish.html and the RTP sim (node).

   BASE SPIN: DROPS squishy blobs fall into an empty glass jar. Blob k comes from the fair draw u = fair.u('drop:k'):
     cell = floor(u * 100000) picks the blob from DROP_TABLE (per 100,000), frac = u * 100000 - cell picks the x position.
   A DETERMINISTIC 2D circle physics sim (fixed timestep, fixed iteration counts and order, only + - * / and Math.sqrt,
   so every IEEE-754 JavaScript engine gives bit-identical results) drops them one by one. Two blobs of the same tier
   that touch melt into one blob of the next tier (area is kept: radius x sqrt 2). The merge pays PAY[new tier] x stake.
   A merge whose input was itself made by a merge within 0.5 s is the next link of a chain: link n pays x n.
   Tier GOLD is the golden blob; a golden blob floats out of the jar LIFT steps after it is made (it is banked).

   RAINBOW BLOB (rare drop): melts into the first normal blob it touches and grows it one size (that merge pays like any
   other). A rainbow in the base spin triggers GOLD RUSH.

   GOLD RUSH: BONUS_POURS free pours of BONUS_DROPS blobs each, drawn from fair.u('rush:p:k') (pour p, blob k). The jar is
   NOT emptied: the base jar carries on and every pour lands on what is already there. Pour p pays BONUS_PAY x chain link
   x MULTS[p] (the multiplier grows every pour). A rainbow during GOLD RUSH adds RETRIGGER pours (at most MAX_POURS).
   The whole round (base + rush) is capped at MAX_WIN; the rush stops at the pour that reaches it.
   Everything is a pure function of the fair draws, so the page replays exactly the sim that decided it. */
(function (root) {
  const RTP = 0.96, MAX_WIN = 10000;
  const TIERS = 7, GOLD = 6, RAIN = 7;          // tiers 0..6 (6 = golden blob), 7 = rainbow blob
  const R0 = 0.32, SQ2 = Math.sqrt(2);
  const RADII = []; { let r = R0; for (let t = 0; t < TIERS; t++) { RADII.push(r); r = r * SQ2; } RADII.push(0.42); }
  const DROPS = 12, BONUS_DROPS = 6, BONUS_POURS = 5, RETRIGGER = 2, MAX_POURS = 15;
  // drop table per 100,000: tiers 0..4, then the rainbow blob (index RAIN)
  const DROP_TABLE = [39944, 32000, 20000, 6800, 1200];
  const RAIN_CELLS = 56;
  // GOLD RUSH pours drop smaller blobs (lots of small merges and chains), same rainbow share
  const BONUS_TABLE = [60000, 30000, 9944, 0, 0];
  // pay for CREATING a blob of tier t (x stake, times the chain link). Base spin and GOLD RUSH have their own table.
  const PAY = [0, 0, 0, 0, 0, 2.2, 400];
  const BONUS_PAY = [0, 0, 0, 0, 0.3, 1.3, 20];
  // GOLD RUSH multiplier for pour p (0-based); later pours (after a retrigger) keep the last value
  const MULTS = [1, 2, 3, 5, 10, 20, 30, 50, 75, 100, 100, 100, 100, 100, 100];

  // jar and physics constants (sim units, the jar is HALF*2 wide, the floor is y = 0)
  const HALF = 3.0, SPAWN_Y = 8.2, DT = 1 / 120, GRAV = 30, ITER = 6, DAMP = 0.994, VMAX = 14, FLOOR_FRIC = 0.9;
  const DROP_GAP = 30, COOLDOWN = 14, TOUCH = 0.03, POP = 2.2, QUIET_V2 = 0.25 * 0.25, QUIET_STEPS = 24, SETTLE_MAX = 600, CHAIN_STEPS = 60;
  const LIFT = 72, CAP = 200;

  function dropFromU(u, table = DROP_TABLE) {
    const a = u * 100000, cell = Math.floor(a), frac = a - cell;
    let tier = RAIN, acc = 0;
    for (let t = 0; t < table.length; t++) { acc += table[t]; if (cell < acc) { tier = t; break; } }
    const r = RADII[tier];
    return { tier, x: -HALF + r + frac * (2 * (HALF - r)), u };
  }
  // the drop list of the base spin ('drop:k') or of GOLD RUSH pour p ('rush:p:k') from a uniform source u(msg)
  function drawDrops(uOf) { const out = []; for (let k = 0; k < DROPS; k++) out.push(dropFromU(uOf('drop:' + k))); return out; }
  function drawPour(uOf, p) { const out = []; for (let k = 0; k < BONUS_DROPS; k++) out.push(dropFromU(uOf('rush:' + p + ':' + k), BONUS_TABLE)); return out; }

  // ------------------------------------------------------------------ deterministic circle physics in a jar that persists
  // const jar = createJar();  jar.pour(drops, { record, pay, mult }) -> pour result (see below). The jar keeps its blobs.
  function createJar() {
    let n = 0, nextId = 0;
    const X = new Float64Array(CAP), Y = new Float64Array(CAP), VX = new Float64Array(CAP), VY = new Float64Array(CAP);
    const OX = new Float64Array(CAP), OY = new Float64Array(CAP), R = new Float64Array(CAP);
    const T = new Int32Array(CAP), ID = new Int32Array(CAP), BORN = new Int32Array(CAP), LIFTAT = new Int32Array(CAP), USED = new Uint8Array(CAP);
    function pour(drops, o = {}) {
      const record = !!o.record, table = o.pay || PAY, mult = o.mult || 1;
      const merges = [], lifts = [], counts = new Array(TIERS).fill(0), links = new Array(TIERS).fill(0), frames = record ? [] : null, dropsAt = [];
      let raw = 0, step = 0, quiet = 0, nextDrop = 0, rainbows = 0;
      // a new pour: everything already in the jar is old (no cooldowns, no chains into this pour)
      for (let i = 0; i < n; i++) { BORN[i] = -100000; if (LIFTAT[i] > 0) LIFTAT[i] = 0; }
      const add = (x, y, vx, vy, t) => { X[n] = x; Y[n] = y; VX[n] = vx; VY[n] = vy; R[n] = RADII[t]; T[n] = t; ID[n] = nextId++; BORN[n] = step; LIFTAT[n] = t === GOLD ? step + LIFT : -1; n++; return ID[n - 1]; };
      const compact = () => {
        let w = 0;
        for (let i = 0; i < n; i++) {
          if (USED[i]) continue;
          if (w !== i) { X[w] = X[i]; Y[w] = Y[i]; VX[w] = VX[i]; VY[w] = VY[i]; R[w] = R[i]; T[w] = T[i]; ID[w] = ID[i]; BORN[w] = BORN[i]; LIFTAT[w] = LIFTAT[i]; }
          w++;
        }
        n = w;
      };
      const lastDropStep = (drops.length - 1) * DROP_GAP;
      const maxStep = lastDropStep + SETTLE_MAX;
      while (step <= maxStep) {
        // 1. drops
        if (nextDrop < drops.length && step === nextDrop * DROP_GAP && n < CAP - 2) {
          const d = drops[nextDrop];
          const id = add(d.x, SPAWN_Y, 0, -3, d.tier);
          if (d.tier === RAIN) rainbows++;
          dropsAt.push({ k: nextDrop, step, id, tier: d.tier, x: d.x });
          nextDrop++;
        }
        // 2. golden blobs float out (banked) LIFT steps after they were made
        let lifted = false;
        for (let i = 0; i < n; i++) USED[i] = 0;
        for (let i = 0; i < n; i++) if (LIFTAT[i] >= 0 && step >= LIFTAT[i]) { USED[i] = 1; lifted = true; lifts.push({ step, id: ID[i], x: X[i], y: Y[i] }); }
        if (lifted) compact();
        // 3. integrate (semi-implicit Euler on positions, velocities rebuilt from the corrected positions)
        for (let i = 0; i < n; i++) {
          VY[i] -= GRAV * DT; VX[i] *= DAMP; VY[i] *= DAMP;
          OX[i] = X[i]; OY[i] = Y[i];
          X[i] += VX[i] * DT; Y[i] += VY[i] * DT;
        }
        // 4. constraints: fixed number of Gauss-Seidel passes in slot order
        for (let it = 0; it < ITER; it++) {
          for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
              let dx = X[j] - X[i], dy = Y[j] - Y[i];
              const rs = R[i] + R[j], d2 = dx * dx + dy * dy;
              if (d2 >= rs * rs) continue;
              let d = Math.sqrt(d2);
              if (d < 1e-9) { dx = 0; dy = 1; d = 1; }   // exactly on top of each other: push straight up
              const pen = rs - (d2 < 1e-18 ? 0 : d), mi = R[i] * R[i], mj = R[j] * R[j];
              const nx = dx / d, ny = dy / d, wi = mj / (mi + mj), wj = mi / (mi + mj);
              X[i] -= nx * pen * wi; Y[i] -= ny * pen * wi;
              X[j] += nx * pen * wj; Y[j] += ny * pen * wj;
            }
          }
          for (let i = 0; i < n; i++) {
            const r = R[i];
            if (X[i] - r < -HALF) X[i] = -HALF + r; else if (X[i] + r > HALF) X[i] = HALF - r;
            if (Y[i] - r < 0) Y[i] = r;
          }
        }
        // 5. velocities from the moved positions, floor friction, speed cap
        let still = true;
        for (let i = 0; i < n; i++) {
          let vx = (X[i] - OX[i]) / DT, vy = (Y[i] - OY[i]) / DT;
          if (Y[i] - R[i] <= 1e-9) vx *= FLOOR_FRIC;
          const s2 = vx * vx + vy * vy;
          if (s2 > VMAX * VMAX) { const f = VMAX / Math.sqrt(s2); vx *= f; vy *= f; }
          VX[i] = vx; VY[i] = vy;
          if (s2 > QUIET_V2 || step - BORN[i] < COOLDOWN || LIFTAT[i] >= 0) still = false;
        }
        // 6. merges in slot order, each blob merges at most once per step: equal tiers, or a rainbow with any normal blob
        let merged = false;
        for (let i = 0; i < n; i++) USED[i] = 0;
        const born = [];
        for (let i = 0; i < n; i++) {
          if (USED[i] || T[i] >= GOLD && T[i] !== RAIN || step - BORN[i] < COOLDOWN) continue;
          for (let j = i + 1; j < n; j++) {
            if (USED[j] || step - BORN[j] < COOLDOWN) continue;
            const ti = T[i], tj = T[j];
            let into = -1, keep = -1;   // into = tier made, keep = slot whose position the new blob takes (-1 = midpoint)
            if (ti === RAIN || tj === RAIN) {
              if (ti === RAIN && tj === RAIN) continue;
              const other = ti === RAIN ? j : i;
              if (T[other] >= GOLD) continue;
              into = T[other] + 1; keep = other;
            } else if (ti === tj) into = ti + 1; else continue;
            const dx = X[j] - X[i], dy = Y[j] - Y[i], rs = R[i] + R[j] + TOUCH;
            if (dx * dx + dy * dy > rs * rs) continue;
            USED[i] = 1; USED[j] = 1;
            const bx = keep < 0 ? (X[i] + X[j]) / 2 : X[keep], by = keep < 0 ? (Y[i] + Y[j]) / 2 : Y[keep];
            born.push([bx, by, (VX[i] + VX[j]) / 2, (VY[i] + VY[j]) / 2 + POP, into, ID[i], ID[j], ti === RAIN || tj === RAIN]);
            break;
          }
        }
        if (born.length) {
          merged = true;
          compact();
          for (const b of born) {
            const t = b[4], id = add(b[0], b[1], b[2], b[3], t);
            // chain: one of the two inputs was itself made by a merge in the last CHAIN_STEPS steps (0.5 s)
            const chain = merges.filter((m) => (m.id === b[5] || m.id === b[6]) && step - m.step <= CHAIN_STEPS).reduce((a, m) => Math.max(a, m.chain + 1), 1);
            const pay = table[t] * chain * mult;
            raw += pay; counts[t]++; links[t] += chain;
            merges.push({ step, a: b[5], b: b[6], id, tier: t, x: b[0], y: b[1], pay, chain, rainbow: b[7] });
          }
        }
        if (record) {
          const f = new Float64Array(n * 3);
          for (let i = 0; i < n; i++) { f[i * 3] = ID[i]; f[i * 3 + 1] = X[i]; f[i * 3 + 2] = Y[i]; }
          frames.push(f);
        }
        // 7. done when every blob is dropped and the jar has been still (no merges, cooldowns or lifts) for a while
        if (step >= lastDropStep) { quiet = still && !merged && !lifted ? quiet + 1 : 0; if (quiet >= QUIET_STEPS) break; }
        step++;
      }
      let top = 0; for (const m of merges) if (m.tier > top) top = m.tier; for (const d of drops) if (d.tier !== RAIN && d.tier > top) top = d.tier;
      let height = 0; for (let i = 0; i < n; i++) if (Y[i] + R[i] > height) height = Y[i] + R[i];
      return { merges, lifts, counts, links, raw, mult, top, gold: counts[GOLD] > 0, rainbows, steps: step, dropsAt, frames, height, tiers: Array.from(T.subarray(0, n)), ids: Array.from(ID.subarray(0, n)) };
    }
    return { pour, get size() { return n; } };
  }
  // one base spin into an empty jar (kept for tests and tools)
  function simulate(drops, record) { return createJar().pour(drops, { record }); }

  // ------------------------------------------------------------------ a whole round: base spin, then GOLD RUSH if triggered
  // playRound(uOf, record) -> { drops, base, rush: null | { pours: [{ p, mult, drops, res, total }], win }, baseWin, rushWin, win, capped }
  function playRound(uOf, record) {
    const jar = createJar(), drops = drawDrops(uOf);
    const base = jar.pour(drops, { record, pay: PAY, mult: 1 });
    let total = base.raw, capped = false, rush = null;
    if (total >= MAX_WIN) { total = MAX_WIN; capped = true; }
    if (base.rainbows > 0 && !capped) {
      rush = { pours: [], win: 0, retriggers: 0 };
      let pours = BONUS_POURS;
      for (let p = 0; p < pours; p++) {
        const mult = MULTS[Math.min(p, MULTS.length - 1)], pd = drawPour(uOf, p);
        const res = jar.pour(pd, { record, pay: BONUS_PAY, mult });
        rush.win += res.raw; total += res.raw;
        if (res.rainbows > 0 && pours < MAX_POURS) { const add = Math.min(RETRIGGER * res.rainbows, MAX_POURS - pours); pours += add; rush.retriggers += add; }
        rush.pours.push({ p, mult, drops: pd, res, total: Math.min(MAX_WIN, total) });
        if (total >= MAX_WIN) { total = MAX_WIN; capped = true; break; }
      }
      rush.total = pours;
    }
    const win = Math.round(total * 1e6) / 1e6;
    return { drops, base, rush, baseWin: base.raw, rushWin: rush ? rush.win : 0, win, capped };
  }

  // Monte Carlo estimate of this exact game (node sim, stratified: RTP = (1 - P) E[win | no rainbow] + P E[win | rainbow],
  // P = 1 - (1 - 56/100000)^12 exact). Tuning set 95.91% +- 0.47%, independent validation set 95.74% +- 0.46%, together:
  const SIM = { spins: '8.1 million spins plus 306,000 extra GOLD RUSH rounds', rtp: '95.83%', se: '0.33%', hit: '11.4%', rush: '1 in 149', rushAvg: '×61', rushShare: '43%' };

  const api = { SIM, RTP, MAX_WIN, TIERS, GOLD, RAIN, RADII, DROPS, BONUS_DROPS, BONUS_POURS, RETRIGGER, MAX_POURS, DROP_TABLE, BONUS_TABLE, RAIN_CELLS, PAY, BONUS_PAY, MULTS,
    HALF, SPAWN_Y, DT, DROP_GAP, COOLDOWN, LIFT, dropFromU, drawDrops, drawPour, createJar, simulate, playRound };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SquishEngine = api;
})(this);
