/* SNEAK engine: pure math, no DOM. Shared by sneak.html and the RTP sim (node).
   Every row has three tiles: SHADOW, DIM, SPOT. The player picks one per row.
   One draw u in [0,1) per row decides: caught when u < p of the chosen tile.
   A safe step pays the fair factor 1/(1-p); the first step also carries the house edge (RTP),
   so every strategy (any tile at any row, any cash-out moment) returns RTP, capped at MAX_WIN. */
(function(root){
  const RTP=0.97, MAX_WIN=10000, ROWS=16;
  const KINDS=[
    {id:'shadow', name:'SHADOW', p:0.10},
    {id:'dim',    name:'DIM',    p:0.30},
    {id:'spot',   name:'SPOT',   p:0.55}
  ];
  const stepGain=(p,first)=>(first?RTP:1)/(1-p);
  // one step on tile kind k: { p: chance of being caught, m: multiplier if safe, max: true when it lands on MAX_WIN }.
  // A step that would cross MAX_WIN becomes the diamond dash: it pays exactly MAX_WIN and its risk drops to
  // 1 - mult/MAX_WIN, so this step stays fair too and the RTP holds for every strategy, also the ones that hit the cap.
  function step(mult,k,first){
    const p=KINDS[k].p, m=mult*stepGain(p,first);
    if(m<MAX_WIN) return {p,m,max:false};
    return {p:Math.max(0,1-mult*(first?RTP:1)/MAX_WIN),m:MAX_WIN,max:true};
  }
  // tile order per row (which column holds which kind) from a draw v in [0,1): one of 6 permutations
  const PERMS=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  const layout=v=>PERMS[Math.min(5,Math.floor(v*6))];
  const api={RTP,MAX_WIN,ROWS,KINDS,stepGain,step,layout,PERMS};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else root.SneakEngine=api;
})(this);
