/* LAST REEL engine: pure math, no DOM. Shared by lastreel.html and the RTP checks (node).
   A 5x3 video slot with 10 fixed lines that pay BOTH WAYS (left to right and right to left, 3 or more in a row).
   Each reel stops uniformly at one of its strip positions (stop = floor(u * strip length), u from the fair messages
   'reel:1' .. 'reel:5'). The stop is the symbol on the middle row; the row above and below follow the strip.
   Base game RTP is exact by enumeration of every stop combination: BASE_RTP below.
   DOUBLE: after reels 1 to 4 land, reel 5 still spins. The part of the win that depends on reel 5 (W5: every right to
   left win plus the step up from a 4 to a 5 of a kind) has an exact expectation E = mean of W5 over the reel 5 stops.
   When E > 0 the player may add one extra stake that pays k x W5 with k = RTP / E, so the extra stake returns exactly
   RTP in every state. Wins are in multiples of the total bet (line bet = total bet / 10). */
(function (root) {
  const RTP = 0.965, MAX_WIN = 10000, WILD = 8, NLINES = 10;
  // exact base RTP from the full enumeration of 32 x 32 x 33 x 32 x 34 stop combinations (see BASE_RTP_FRACTION)
  const BASE_RTP = 260873 / 270336;   // = 354,787,280 / 367,656,960 line-bet units = 96.49954%
  const BASE_RTP_FRACTION = '260,873 / 270,336';
  const SYMBOLS = [
    { key: 'cherry', name: 'Cherry', color: '#ff3b5c', pays: [4, 15, 40] },
    { key: 'lemon', name: 'Lemon', color: '#ffd23f', pays: [4, 15, 40] },
    { key: 'grapes', name: 'Grapes', color: '#9b5cff', pays: [7, 18, 60] },
    { key: 'melon', name: 'Melon', color: '#3fd36b', pays: [9, 24, 80] },
    { key: 'candy', name: 'Candy', color: '#ff6fc8', pays: [12, 30, 100] },
    { key: 'bell', name: 'Bell', color: '#ffb321', pays: [15, 50, 250] },
    { key: 'gem', name: 'Gem', color: '#2fd6ff', pays: [25, 100, 500] },
    { key: 'seven', name: 'Seven', color: '#ff2a3d', pays: [50, 200, 1000] },
    { key: 'wild', name: 'Wild', color: '#ff8a1f', pays: [100, 400, 2500] },
  ];
  const STRIPS = [
    [0,1,6,1,3,5,4,5,1,6,2,0,4,2,0,1,7,0,5,2,0,1,0,3,8,4,1,3,2,3,2,4],
    [0,4,3,1,3,0,1,2,4,0,6,2,3,1,0,7,1,3,2,1,5,4,0,1,2,5,6,2,4,8,0,5],
    [3,4,0,4,3,0,5,0,1,0,2,4,1,8,5,0,2,1,3,0,8,2,1,2,1,7,1,3,6,4,2,5,6],
    [0,4,5,3,2,1,6,1,0,3,0,1,3,2,7,2,1,8,5,0,5,4,3,2,1,0,6,0,2,4,1,4],
    [1,2,0,1,7,3,2,0,2,0,4,6,2,1,3,5,4,8,2,4,5,8,5,1,4,3,6,0,1,7,0,1,3,0],
  ];
  // rows: 0 top, 1 middle, 2 bottom
  const LINES = [
    [1,1,1,1,1], [0,0,0,0,0], [2,2,2,2,2], [0,1,2,1,0], [2,1,0,1,2],
    [0,0,1,2,2], [2,2,1,0,0], [1,0,0,0,1], [1,2,2,2,1], [1,2,1,0,1],
  ];
  const PAYS = SYMBOLS.map((s) => s.pays);

  const stopOf = (u, reel) => Math.floor(u * STRIPS[reel].length);
  function symAt(reel, stop, row) { const s = STRIPS[reel], n = s.length; return s[(((stop + row - 1) % n) + n) % n]; }
  const column = (reel, stop) => [symAt(reel, stop, 0), symAt(reel, stop, 1), symAt(reel, stop, 2)];
  const grid = (stops) => stops.map((st, r) => column(r, st));

  // best pay reading a line in one direction over the first len reels: { sym, count, pay } (pay in line bets)
  function dirPay(a, len) {
    let wc = 0; while (wc < len && a[wc] === WILD) wc++;
    const wp = wc >= 3 ? PAYS[WILD][wc - 3] : 0;
    if (wc === len) return { sym: WILD, count: wc, pay: wp, five: len === 5 };
    const s = a[wc]; let c = wc; while (c < len && (a[c] === s || a[c] === WILD)) c++;
    const sp = c >= 3 ? PAYS[s][c - 3] : 0;
    if (wp > sp) return { sym: WILD, count: wc, pay: wp, five: c === 5 };
    return { sym: s, count: c, pay: sp, five: c === 5 };
  }
  // one line, symbols a[0..4] from reel 1 to reel 5. A 5 of a kind pays once.
  function lineEval(a) {
    const l = dirPay(a, 5), r = dirPay([a[4], a[3], a[2], a[1], a[0]], 5), lock = dirPay(a, 4).pay;
    if (l.five) { const best = l.pay >= r.pay ? l : r; return { total: best.pay, locked: lock, ltr: best.pay ? best : null, rtl: null, five: true }; }
    return { total: l.pay + r.pay, locked: lock, ltr: l.pay ? l : null, rtl: r.pay ? r : null, five: false };
  }
  const lineSyms = (g, L) => L.map((row, reel) => g[reel][row]);

  // full spin: wins per line and direction, total and its reel-5 part (bet multiples), capped at MAX_WIN
  function evaluate(g) {
    const wins = []; let total = 0, locked = 0;
    LINES.forEach((L, i) => {
      const e = lineEval(lineSyms(g, L));
      total += e.total; locked += e.locked;
      if (e.ltr) wins.push({ line: i, dir: e.five ? 'all' : 'ltr', sym: e.ltr.sym, count: e.ltr.count, pay: e.ltr.pay / NLINES, cells: L.slice(0, e.five ? 5 : e.ltr.count).map((row, reel) => [reel, row]) });
      if (e.rtl) wins.push({ line: i, dir: 'rtl', sym: e.rtl.sym, count: e.rtl.count, pay: e.rtl.pay / NLINES, cells: L.map((row, reel) => [reel, row]).slice(5 - e.rtl.count) });
    });
    total /= NLINES; locked /= NLINES;
    const capped = total > MAX_WIN; if (capped) total = MAX_WIN;
    return { wins, total, locked, w5: Math.max(0, total - locked), capped };
  }
  // reels 1 to 4 fixed (stops4), reel 5 open: exact expectation of the reel-5 part over its stops
  function reel5(stops4, lite) {
    const n = STRIPS[4].length, cols = stops4.map((st, r) => column(r, st));
    const outcomes = []; let sum = 0, hits = 0, best = 0, locked = 0;
    for (let s = 0; s < n; s++) {
      const ev = evaluate([...cols, column(4, s)]);
      locked = ev.locked; outcomes.push(ev.w5); sum += ev.w5; if (ev.w5 > 0) hits++; if (ev.w5 > best) best = ev.w5;
    }
    const e = sum / n;
    // what each line still needs on reel 5 (any symbol on that line's reel-5 row that adds a win)
    const possible = [];
    if (!lite) LINES.forEach((L, i) => {
      const a = lineSyms(cols.concat([[0, 0, 0]]), L), need = [];
      let top = 0;
      for (let sym = 0; sym <= WILD; sym++) { a[4] = sym; const ev = lineEval(a), add = ev.total - ev.locked; if (add > 0) { need.push(sym); top = Math.max(top, add); } }
      if (need.length) possible.push({ line: i, row: L[4], need, best: top / NLINES });
    });
    possible.sort((x, y) => y.best - x.best);
    return { e, locked, hits, n, best, outcomes, possible, k: e > 0 ? RTP / e : 0 };
  }
  const doubleK = (e) => (e > 0 ? RTP / e : 0);

  const api = { RTP, BASE_RTP, BASE_RTP_FRACTION, MAX_WIN, WILD, NLINES, SYMBOLS, STRIPS, LINES, PAYS, stopOf, symAt, column, grid, dirPay, lineEval, evaluate, reel5, doubleK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LastReelEngine = api;
})(this);
