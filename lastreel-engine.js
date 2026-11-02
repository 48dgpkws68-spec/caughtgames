/* LAST REEL engine: pure math, no DOM. Shared by lastreel.html and the RTP checks (node).
   A 5x3 video slot with 10 fixed lines that pay BOTH WAYS (left to right and right to left, 3 or more in a row).
   Each reel stops uniformly at one of its strip positions: stop = floor(u * strip length), u from the fair messages
   'reel:1' .. 'reel:5' (base spin) and 'fs:n:reel:1' .. 'fs:n:reel:5' (free spin n). The stop is the middle row; the
   rows above and below follow the strip.
   GOLDEN TICKET (scatter) counts anywhere: 3, 4 or 5 on screen pay 1x, 10x or 100x the stake and 3 or more start
   10 FREE SPINS on the bonus strips. Free spin n pays every win x min(n, 20); 3 or more tickets in free spins add 5 spins.
   DOUBLE (base game only): after reels 1 to 4 land, reel 5 still spins. The part of the LINE win that depends on reel 5
   (W5: every right to left win plus the step up from a 4 to a 5 of a kind) has an exact expectation E over the reel 5
   stops. When E > 0 the player may add one extra stake that pays k x W5 with k = RTP / E, so the extra stake returns
   exactly RTP in every state. Tickets and the bonus are paid by the spin stake only, never by the double.
   Amounts are multiples of the stake (line bet = stake / 10). */
(function (root) {
  const RTP = 0.965, MAX_WIN = 10000, WILD = 8, TICKET = 9, NLINES = 10;
  const FS_START = 10, FS_ADD = 5, FS_MULT_MAX = 20;
  const fsMult = (n) => Math.min(n, FS_MULT_MAX);
  const SYMBOLS = [
    { key: 'cherry', name: 'Cherry', color: '#ff3b5c', pays: [3, 10, 30] },
    { key: 'lemon', name: 'Lemon', color: '#ffd23f', pays: [3, 10, 30] },
    { key: 'grapes', name: 'Grapes', color: '#9b5cff', pays: [5, 12, 40] },
    { key: 'melon', name: 'Melon', color: '#3fd36b', pays: [6, 15, 50] },
    { key: 'candy', name: 'Candy', color: '#ff6fc8', pays: [8, 20, 75] },
    { key: 'bell', name: 'Bell', color: '#ffb321', pays: [10, 40, 150] },
    { key: 'gem', name: 'Gem', color: '#2fd6ff', pays: [18, 70, 350] },
    { key: 'seven', name: 'Seven', color: '#ff2a3d', pays: [35, 150, 750] },
    { key: 'wild', name: 'Wild', color: '#ff3fae', pays: [75, 300, 2000] },
    { key: 'ticket', name: 'Golden Ticket', color: '#ffc21f', pays: [0, 0, 0] },
  ];
  const SCATTER_PAYS = [0, 0, 0, 1, 10, 100];   // by number of tickets on screen, x stake
  const STRIPS = [
    [3,2,7,0,3,1,0,2,8,9,4,1,5,6,3,2,5,1,0,5,0,2,1,0,1,4,0,4,3,6,4,1,2],
    [1,2,8,5,2,0,4,2,0,1,2,5,0,4,3,1,3,9,1,2,5,6,0,1,4,7,0,3,4,6,0,1,3],
    [8,3,5,9,2,5,0,6,4,0,1,3,1,0,2,1,0,2,7,1,4,3,4,8,4,2,1,3,5,0,6,2,1,0],
    [1,6,1,2,1,5,3,5,0,2,1,4,0,2,4,1,6,2,5,0,9,0,7,3,4,3,8,0,1,3,2,0,4],
    [4,8,0,3,5,2,6,1,0,1,0,1,7,3,4,5,7,2,5,0,2,0,8,1,9,4,3,1,6,0,4,2,3,1,2],
  ];
  // free spin strips: richer, with stacked wilds
  const FS_STRIPS = [
    [0,3,2,4,0,7,1,2,5,1,8,8,6,4,1,0,1,3,2,3,5,9,6,1,2,6,1,0,4,0,4,3,2,4,2,5,0,1,3,0,5],
    [5,0,1,5,2,3,2,6,4,0,8,8,8,0,5,3,1,2,4,2,5,1,0,1,9,2,7,0,3,6,3,6,4,2,1,0,1,4,1,9,4,0,3],
    [0,1,4,2,1,6,1,2,8,8,8,2,0,5,3,1,6,0,1,4,5,4,3,2,3,5,3,0,4,0,6,4,0,9,2,1,0,5,1,9,7,2,3],
    [2,5,1,7,6,2,3,5,0,9,1,3,6,0,3,1,5,0,6,8,8,8,2,3,4,2,5,1,4,2,0,4,1,0,2,0,3,1,9,4,0,1,4],
    [6,9,2,1,3,1,3,1,6,4,0,1,0,4,0,2,3,2,1,2,5,8,8,5,4,1,6,5,0,2,0,3,1,7,3,4,0,2,4,0,5],
  ];
  // rows: 0 top, 1 middle, 2 bottom
  const LINES = [
    [1,1,1,1,1], [0,0,0,0,0], [2,2,2,2,2], [0,1,2,1,0], [2,1,0,1,2],
    [0,0,1,2,2], [2,2,1,0,0], [1,0,0,0,1], [1,2,2,2,1], [1,2,1,0,1],
  ];
  const PAYS = SYMBOLS.map((s) => s.pays);
  // exact figures from the full enumeration and the free spin recursion (see the RTP notes in the paytable)
  const STATS = {
    total: 0.9650427, baseLines: 0.6093352, tickets: 0.0093769, bonus: 0.3463306,   // RTP parts (total uncapped; the cap costs < 0.0001%)
    baseLinesFrac: '260,582,380 / 427,650,300', triggerFrac: '265,410 / 42,765,030', triggerOneIn: 161.1,
    bonusEV: 55.80, avgSpins: 10.61, retriggerOneIn: 87.2, fsMaxScreen: 1287, baseMaxScreen: 211,
    over50: 0.373, over100: 0.123, over1000: 0.00035,                                   // share of bonuses (4M simulated)
  };

  const stopOf = (u, reel, strips = STRIPS) => Math.floor(u * strips[reel].length);
  function symAt(reel, stop, row, strips = STRIPS) { const s = strips[reel], n = s.length; return s[(((stop + row - 1) % n) + n) % n]; }
  const column = (reel, stop, strips = STRIPS) => [symAt(reel, stop, 0, strips), symAt(reel, stop, 1, strips), symAt(reel, stop, 2, strips)];
  const grid = (stops, strips = STRIPS) => stops.map((st, r) => column(r, st, strips));

  // best pay reading a line in one direction over the first len reels: { sym, count, pay } (pay in line bets)
  function dirPay(a, len) {
    let wc = 0; while (wc < len && a[wc] === WILD) wc++;
    const wp = wc >= 3 ? PAYS[WILD][wc - 3] : 0;
    if (wc === len) return { sym: WILD, count: wc, pay: wp, five: len === 5 };
    const s = a[wc];
    if (s === TICKET) return { sym: WILD, count: wc, pay: wp, five: false };
    let c = wc; while (c < len && (a[c] === s || a[c] === WILD)) c++;
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
  function tickets(g) { const cells = []; g.forEach((col, r) => col.forEach((s, row) => { if (s === TICKET) cells.push([r, row]); })); return cells; }

  // full spin: line wins (both directions), ticket pay and trigger. total = lines + tickets (x stake, before the multiplier)
  function evaluate(g) {
    const wins = []; let lines = 0, locked = 0;
    LINES.forEach((L, i) => {
      const e = lineEval(lineSyms(g, L));
      lines += e.total; locked += e.locked;
      if (e.ltr) wins.push({ line: i, dir: e.five ? 'all' : 'ltr', sym: e.ltr.sym, count: e.ltr.count, pay: e.ltr.pay / NLINES, cells: L.slice(0, e.five ? 5 : e.ltr.count).map((row, reel) => [reel, row]) });
      if (e.rtl) wins.push({ line: i, dir: 'rtl', sym: e.rtl.sym, count: e.rtl.count, pay: e.rtl.pay / NLINES, cells: L.map((row, reel) => [reel, row]).slice(5 - e.rtl.count) });
    });
    lines /= NLINES; locked /= NLINES;
    const tk = tickets(g), scatter = SCATTER_PAYS[tk.length] || 0;
    if (tk.length >= 3) wins.push({ scatter: true, sym: TICKET, count: tk.length, pay: scatter, cells: tk });
    return { wins, lines, scatter, total: lines + scatter, locked, w5: Math.max(0, lines - locked), tickets: tk.length, trigger: tk.length >= 3 };
  }
  // reels 1 to 4 fixed (stops4), reel 5 open: exact expectation of the reel-5 line part over its stops (base game)
  function reel5(stops4, lite) {
    const n = STRIPS[4].length, cols = stops4.map((st, r) => column(r, st));
    const outcomes = []; let sum = 0, hits = 0, best = 0, locked = 0, ticketStops = 0;
    for (let s = 0; s < n; s++) {
      const c5 = column(4, s), ev = evaluate([...cols, c5]);
      locked = ev.locked; outcomes.push(ev.w5); sum += ev.w5; if (ev.w5 > 0) hits++; if (ev.w5 > best) best = ev.w5;
      if (c5.includes(TICKET)) ticketStops++;
    }
    const e = sum / n, tickets4 = cols.filter((c) => c.includes(TICKET)).length;
    const possible = [];
    if (!lite) LINES.forEach((L, i) => {
      const a = lineSyms(cols.concat([[0, 0, 0]]), L), need = [];
      let top = 0;
      for (let sym = 0; sym <= WILD; sym++) { a[4] = sym; const ev = lineEval(a), add = ev.total - ev.locked; if (add > 0) { need.push(sym); top = Math.max(top, add); } }
      if (need.length) possible.push({ line: i, row: L[4], need, best: top / NLINES });
    });
    possible.sort((x, y) => y.best - x.best);
    return { e, locked, hits, n, best, outcomes, possible, k: e > 0 ? RTP / e : 0, tickets4, ticketStops };
  }
  const doubleK = (e) => (e > 0 ? RTP / e : 0);

  const api = { RTP, MAX_WIN, WILD, TICKET, NLINES, FS_START, FS_ADD, FS_MULT_MAX, fsMult, SYMBOLS, SCATTER_PAYS, STRIPS, FS_STRIPS, LINES, PAYS, STATS, stopOf, symAt, column, grid, dirPay, lineEval, tickets, evaluate, reel5, doubleK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LastReelEngine = api;
})(this);
