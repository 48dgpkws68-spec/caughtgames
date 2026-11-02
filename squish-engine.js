/* SQUISH JAR engine: pure math, no DOM. Shared by squish.html and the RTP sim (node).
   Every spin drops DROPS squishy blobs into an empty glass jar. Blob k comes from the fair draw u = fair.u('drop:k'):
     cell = floor(u * 1000) picks the tier from the drop table (per mille), frac = u * 1000 - cell picks the x position.
   A DETERMINISTIC 2D circle physics sim (fixed timestep, fixed iteration counts and order, only + - * / and Math.sqrt,
   so every IEEE-754 JavaScript engine gives bit-identical results) drops them one by one. Two blobs of the same tier
   that touch melt into one blob of the next tier (area is kept: radius x sqrt 2) and the merge pays PAY[new tier] x
   stake. A merge whose input was itself made by a merge within 0.5 s is the next link of a chain: link n pays x n. Tier GOLD is the golden jackpot blob. Total win per spin is capped at
   MAX_WIN. The outcome is a pure function of the drop list, so the page replays exactly the sim that decided it. */
(function (root) {
  const RTP = 0.96, MAX_WIN = 10000;
  const TIERS = 7, GOLD = 6;                    // tiers 0..6, tier 6 is the golden blob
  const R0 = 0.32, SQ2 = Math.sqrt(2);
  const RADII = []; { let r = R0; for (let t = 0; t < TIERS; t++) { RADII.push(r); r = r * SQ2; } }
  const DROPS = 12;
  // drop table in per mille per tier (sums to 1000)
  const DROP_TABLE = [400, 320, 200, 68, 12];
  // pay for CREATING a blob of tier t (x stake). PAY[0] is unused (tier 0 only comes from drops).
  const PAY = [0, 0, 0, 0, 0.35, 2.2, 500];

  // jar and physics constants (sim units, the jar is HALF*2 wide, the floor is y = 0)
  const HALF = 3.0, SPAWN_Y = 8.2, DT = 1 / 120, GRAV = 30, ITER = 6, DAMP = 0.994, VMAX = 14, FLOOR_FRIC = 0.9;
  const DROP_GAP = 30, COOLDOWN = 14, TOUCH = 0.03, POP = 2.2, QUIET_V2 = 0.25 * 0.25, QUIET_STEPS = 24, SETTLE_MAX = 600, CHAIN_STEPS = 60;

  function dropFromU(u) {
    const a = u * 1000, cell = Math.floor(a), frac = a - cell;
    let tier = 0, acc = 0;
    for (let t = 0; t < DROP_TABLE.length; t++) { acc += DROP_TABLE[t]; if (cell < acc) { tier = t; break; } }
    const r = RADII[tier];
    return { tier, x: -HALF + r + frac * (2 * (HALF - r)), u };
  }
  // the whole drop list of one spin from a uniform source u(msg) (fair.u in the page, a PRNG in the sim)
  function drawDrops(uOf) { const out = []; for (let k = 0; k < DROPS; k++) out.push(dropFromU(uOf('drop:' + k))); return out; }

  // ------------------------------------------------------------------ deterministic circle physics
  // simulate(drops, record) -> { merges, counts, win, raw, steps, frames? }
  // frames (record = true): one Float64Array per step with [id, x, y, ...] of every live blob.
  function simulate(drops, record) {
    // struct of arrays, slot order = creation order (deterministic iteration order)
    let n = 0, nextId = 0;
    const cap = DROPS * 2 + 4;
    const X = new Float64Array(cap), Y = new Float64Array(cap), VX = new Float64Array(cap), VY = new Float64Array(cap);
    const OX = new Float64Array(cap), OY = new Float64Array(cap), R = new Float64Array(cap);
    const T = new Int32Array(cap), ID = new Int32Array(cap), BORN = new Int32Array(cap), USED = new Uint8Array(cap);
    const merges = [], counts = new Array(TIERS).fill(0), links = new Array(TIERS).fill(0), frames = record ? [] : null, dropsAt = [];
    let raw = 0, step = 0, quiet = 0, nextDrop = 0, lastMergeStep = -1;
    const add = (x, y, vx, vy, t) => { X[n] = x; Y[n] = y; VX[n] = vx; VY[n] = vy; R[n] = RADII[t]; T[n] = t; ID[n] = nextId++; BORN[n] = step; n++; return ID[n - 1]; };
    const lastDropStep = (DROPS - 1) * DROP_GAP;
    const maxStep = lastDropStep + SETTLE_MAX;
    while (step <= maxStep) {
      // 1. drops
      if (nextDrop < drops.length && step === nextDrop * DROP_GAP) {
        const d = drops[nextDrop];
        const id = add(d.x, SPAWN_Y, 0, -3, d.tier);
        dropsAt.push({ k: nextDrop, step, id, tier: d.tier, x: d.x });
        nextDrop++;
      }
      // 2. integrate (semi-implicit Euler on positions, velocities rebuilt from the corrected positions)
      for (let i = 0; i < n; i++) {
        VY[i] -= GRAV * DT; VX[i] *= DAMP; VY[i] *= DAMP;
        OX[i] = X[i]; OY[i] = Y[i];
        X[i] += VX[i] * DT; Y[i] += VY[i] * DT;
      }
      // 3. constraints: fixed number of Gauss-Seidel passes in slot order
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
      // 4. velocities from the moved positions, floor friction, speed cap
      let still = true;
      for (let i = 0; i < n; i++) {
        let vx = (X[i] - OX[i]) / DT, vy = (Y[i] - OY[i]) / DT;
        if (Y[i] - R[i] <= 1e-9) vx *= FLOOR_FRIC;
        const s2 = vx * vx + vy * vy;
        if (s2 > VMAX * VMAX) { const f = VMAX / Math.sqrt(s2); vx *= f; vy *= f; }
        VX[i] = vx; VY[i] = vy;
        if (s2 > QUIET_V2 || step - BORN[i] < COOLDOWN) still = false;
      }
      // 5. merges: equal tiers that touch, scanned in slot order, each blob merges at most once per step
      let merged = false;
      for (let i = 0; i < n; i++) USED[i] = 0;
      const born = [];
      for (let i = 0; i < n; i++) {
        if (USED[i] || T[i] >= GOLD || step - BORN[i] < COOLDOWN) continue;
        for (let j = i + 1; j < n; j++) {
          if (USED[j] || T[j] !== T[i] || step - BORN[j] < COOLDOWN) continue;
          const dx = X[j] - X[i], dy = Y[j] - Y[i], rs = R[i] + R[j] + TOUCH;
          if (dx * dx + dy * dy > rs * rs) continue;
          USED[i] = 1; USED[j] = 1;
          born.push([(X[i] + X[j]) / 2, (Y[i] + Y[j]) / 2, (VX[i] + VX[j]) / 2, (VY[i] + VY[j]) / 2 + POP, T[i] + 1, ID[i], ID[j]]);
          break;
        }
      }
      if (born.length) {
        merged = true;
        // compact the survivors (order kept), then append the new blobs in scan order
        let w = 0;
        for (let i = 0; i < n; i++) {
          if (USED[i]) continue;
          if (w !== i) { X[w] = X[i]; Y[w] = Y[i]; VX[w] = VX[i]; VY[w] = VY[i]; R[w] = R[i]; T[w] = T[i]; ID[w] = ID[i]; BORN[w] = BORN[i]; }
          w++;
        }
        n = w;
        for (const b of born) {
          const t = b[4], id = add(b[0], b[1], b[2], b[3], t);
          // chain: one of the two inputs was itself made by a merge in the last CHAIN_STEPS steps (0.5 s);
          // link n of a chain pays the table times n
          const chain = merges.filter((m) => (m.id === b[5] || m.id === b[6]) && step - m.step <= CHAIN_STEPS).reduce((a, m) => Math.max(a, m.chain + 1), 1);
          const pay = PAY[t] * chain;
          raw += pay; counts[t]++; links[t] += chain;
          merges.push({ step, a: b[5], b: b[6], id, tier: t, x: b[0], y: b[1], pay, chain });
        }
        lastMergeStep = step;
      }
      if (record) {
        const f = new Float64Array(n * 3);
        for (let i = 0; i < n; i++) { f[i * 3] = ID[i]; f[i * 3 + 1] = X[i]; f[i * 3 + 2] = Y[i]; }
        frames.push(f);
      }
      // 6. done when every blob is dropped and the jar has been still (no merges, no cooldowns) for a while
      if (step >= lastDropStep) { quiet = still && !merged ? quiet + 1 : 0; if (quiet >= QUIET_STEPS) break; }
      step++;
    }
    const win = Math.min(MAX_WIN, Math.round(raw * 1e6) / 1e6);
    const top = merges.reduce((a, m) => Math.max(a, m.tier), drops.reduce((a, d) => Math.max(a, d.tier), 0));
    return { merges, counts, links, raw, win, capped: raw > MAX_WIN, top, gold: counts[GOLD] > 0, steps: step, dropsAt, frames, lastMergeStep };
  }
  // payout from the chain-weighted merge counts (links[t] = sum of chain numbers of the merges that made tier t)
  const payout = (links, pay = PAY) => { let s = 0; for (let t = 0; t < links.length; t++) s += links[t] * pay[t]; return Math.min(MAX_WIN, s); };

  // Monte Carlo estimate of this exact paytable (filled in from the node sim, see the report)
  // (tuned on 5.04M spins: 96.12% +- 0.40%; independent 5.04M validation: 95.74% +- 0.37%; both together below)
  const SIM = { spins: '10,080,000', rtp: '95.93%', se: '0.27%', hit: '63.5%', gold: '1 in 10,400' };

  const api = { SIM, RTP, MAX_WIN, TIERS, GOLD, RADII, DROPS, DROP_TABLE, PAY, HALF, SPAWN_Y, DT, DROP_GAP, COOLDOWN, dropFromU, drawDrops, simulate, payout };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SquishEngine = api;
})(this);
