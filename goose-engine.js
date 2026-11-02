/* GOOSE 63 engine: pure math, no DOM. Shared by goose.html and the RTP sim (node).
   The classic Game of the Goose: 63 squares, geese move you again by the same throw, the bridge (6) jumps to 12,
   the maze (42) sends you back to 30, overshooting 63 bounces back. Landing on the inn (19), the well (31),
   the prison (52) or the skull (58) ends the run, and so do the nine foxes (11, 16, 25, 29, 38, 43, 47, 56, 61).
   Golden egg squares (22, 44) and square 63 (the golden goose) crack an egg worth x2, x3, x5 or x10 on top.
   Before every throw the player picks one die or two dice.
   Classic start rule: a first throw of 9 does not ride the geese to 63, 6+3 goes to 26 and 5+4 goes to 53.
   Pricing of a throw: every dice result gets a weight, 0 for a trap, EGG_MEAN for an egg square or 63, 1 otherwise.
   A normal landing pays g = f / (average weight), an egg landing pays g x (egg value), so every throw is worth
   exactly f on average: f = RTP on the first throw that carries risk (cash-out unlocks after it), 1 afterwards.
   Every strategy therefore returns RTP below the MAX_WIN cap. */
(function(root){
  const RTP=0.97, MAX_WIN=10000, LAST=63;
  const GEESE=[5,9,14,18,23,27,32,36,41,45,50,54,59];
  const JUMPS={6:12,42:30};
  const TRAPS={19:'inn',31:'well',52:'prison',58:'skull',11:'fox',16:'fox',25:'fox',29:'fox',38:'fox',43:'fox',47:'fox',56:'fox',61:'fox'};
  const EGGS=[22,44];
  const EGG_TABLE=[[2,0.6],[3,0.25],[5,0.1],[10,0.05]];
  const EGG_MEAN=EGG_TABLE.reduce((s,[v,p])=>s+v*p,0);
  const isBonus=e=>e===LAST||EGGS.includes(e);
  const eggValue=u=>{ let a=0; for(const [v,p] of EGG_TABLE){ a+=p; if(u<a) return v } return EGG_TABLE[EGG_TABLE.length-1][0] };
  const G=new Set(GEESE);
  // walk n squares from pos, with bounce at 63, geese and jumps. Returns the end square and the animation script:
  // moves: [{ kind: 'walk' | 'goose' | 'bridge' | 'maze', path: [squares visited in order] }]
  function walk(pos,n,dice){
    const moves=[]; let p=pos;
    const go=(kind)=>{ const path=[]; let dir=1; for(let i=0;i<n;i++){ if(p===LAST) dir=-1; p+=dir; path.push(p) } moves.push({kind,path}) };
    go('walk');
    if(pos===0&&n===9&&dice&&dice.length===2){ const to=dice.includes(6)?26:53; moves.push({kind:'lucky',path:[to]}); return {end:to,moves} }
    for(let guard=0;guard<20;guard++){
      if(G.has(p)&&p!==LAST){ go('goose'); continue }
      if(JUMPS[p]!==undefined){ const to=JUMPS[p]; moves.push({kind:p===6?'bridge':'maze',path:[to]}); p=to; continue }
      break;
    }
    return {end:p,moves};
  }
  // all dice results for d dice, as [d1] or [d1, d2]
  function faces(d){ const out=[]; if(d===1) for(let a=1;a<=6;a++) out.push([a]); else for(let a=1;a<=6;a++) for(let b=1;b<=6;b++) out.push([a,b]); return out }
  // option for d dice from pos: the trap results first, then the safe ones (so a draw u < risk means a trap)
  // charged: the house edge was already taken earlier this round
  function option(pos,d,mult,charged){
    const all=faces(d).map(f=>{ const n=f.reduce((s,x)=>s+x,0), w=walk(pos,n,f), trap=TRAPS[w.end]||null; return {dice:f,n,end:w.end,moves:w.moves,trap,bonus:!trap&&isBonus(w.end)} });
    const traps=all.filter(o=>o.trap), safe=all.filter(o=>!o.trap);
    const q=1/all.length, p=traps.length*q, bonus=safe.filter(o=>o.bonus).length*q, edge=!charged&&p>0, f=edge?RTP:1;
    if(!safe.length) return {d,p:1,m:0,g:0,bonus:0,max:false,edge,traps,safe,all,blocked:true};
    const sw=(safe.length-safe.filter(o=>o.bonus).length)*q+bonus*EGG_MEAN, g=f/sw;
    return {d,p,g,m:Math.min(MAX_WIN,mult*g),bonus,max:false,edge,traps,safe,all,blocked:false};
  }
  // resolve a throw with the fair draw u in [0,1): the trap results first, then the safe ones in order
  function resolve(opt,u){
    if(u<opt.p&&opt.traps.length){ const o=opt.traps[Math.min(opt.traps.length-1,Math.floor(u/opt.p*opt.traps.length))]; return {...o,caught:true} }
    const k=opt.p<1?(u-opt.p)/(1-opt.p):0, o=opt.safe[Math.min(opt.safe.length-1,Math.max(0,Math.floor(k*opt.safe.length)))];
    return {...o,caught:false};
  }
  const api={RTP,MAX_WIN,LAST,GEESE,JUMPS,TRAPS,EGGS,EGG_TABLE,EGG_MEAN,isBonus,eggValue,walk,faces,option,resolve};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else root.GooseEngine=api;
})(this);
