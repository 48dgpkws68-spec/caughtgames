/* GOOSE 63 engine: pure math, no DOM. Shared by goose.html and the RTP sim (node).
   The classic Game of the Goose: 63 squares, geese move you again by the same throw, the bridge (6) jumps to 12,
   the maze (42) sends you back to 30, overshooting 63 bounces back. Landing on the inn (19), the well (31),
   the prison (52) or the skull (58) ends the run. Before every throw the player picks one die or two dice.
   Classic start rule: a first throw of 9 does not ride the geese to 63, 6+3 goes to 26 and 5+4 goes to 53.
   Risk of a throw = share of dice results that end on a trap. A safe throw pays 1/(1-risk). The house edge (RTP) is
   charged once, on the first throw that carries risk, and cash-out unlocks after it; throws without risk pay x1.00.
   No route reaches 63 without a risky throw (checked in the sim), so every strategy returns RTP. A throw that
   would pass MAX_WIN pays exactly MAX_WIN and its risk drops to 1 - mult/MAX_WIN, so it stays fair too. */
(function(root){
  const RTP=0.97, MAX_WIN=10000, LAST=63;
  const GEESE=[5,9,14,18,23,27,32,36,41,45,50,54,59];
  const JUMPS={6:12,42:30};
  const TRAPS={19:'inn',31:'well',52:'prison',58:'skull'};
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
    const all=faces(d).map(f=>{ const n=f.reduce((s,x)=>s+x,0), w=walk(pos,n,f); return {dice:f,n,end:w.end,moves:w.moves,trap:TRAPS[w.end]||null} });
    const traps=all.filter(o=>o.trap), safe=all.filter(o=>!o.trap);
    const p=traps.length/all.length, edge=!charged&&p>0, f=edge?RTP:1;
    if(!safe.length) return {d,p:1,m:0,max:false,edge,traps,safe,all,blocked:true};
    let m=mult*f/(1-p), pe=p, max=false;
    if(m>=MAX_WIN){ m=MAX_WIN; pe=Math.max(0,1-mult*f/MAX_WIN); max=true }
    return {d,p:pe,m,max,edge,traps,safe,all,blocked:false};
  }
  // resolve a throw with the fair draw u in [0,1)
  function resolve(opt,u){
    if(u<opt.p&&opt.traps.length){ const o=opt.traps[Math.min(opt.traps.length-1,Math.floor(u/opt.p*opt.traps.length))]; return {...o,caught:true} }
    const k=opt.p<1?(u-opt.p)/(1-opt.p):0, o=opt.safe[Math.min(opt.safe.length-1,Math.max(0,Math.floor(k*opt.safe.length)))];
    return {...o,caught:false};
  }
  const api={RTP,MAX_WIN,LAST,GEESE,JUMPS,TRAPS,walk,faces,option,resolve};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else root.GooseEngine=api;
})(this);
