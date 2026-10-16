/* SONAR engine: exact mine probabilities from sonar readings + payout table.
   Shared by sonar.html (game, replay analysis) and the RTP calibration sim. */
(function(root){
const N=6, CELLS=N*N;
const NB=[]; for(let i=0;i<CELLS;i++){ const x=i%N,y=(i/N)|0,a=[]; for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; const X=x+dx,Y=y+dy; if(X>=0&&Y>=0&&X<N&&Y<N) a.push(Y*N+X) } NB.push(a) }
const LC=[0]; for(let i=1;i<=64;i++) LC[i]=LC[i-1]+Math.log(i);
const lnC=(n,k)=>k<0||k>n?-Infinity:LC[n]-LC[k]-LC[n-k];

/* revealed: Map(idx -> sonar number). Returns Float64Array P(mine) per cell (revealed cells = 0). */
function mineProbs(revealed,m,pings){
  pings=pings||new Map(); const ACC=.8;
  const P=new Float64Array(CELLS), unknown=[], cons=[], consOf=new Map();
  for(let i=0;i<CELLS;i++) if(!revealed.has(i)) unknown.push(i);
  for(const [i,v] of revealed){ const u=NB[i].filter(j=>!revealed.has(j)); if(!u.length) continue; const id=cons.length; cons.push({need:v}); u.forEach(j=>{ if(!consOf.has(j)) consOf.set(j,[]); consOf.get(j).push(id) }) }
  // group frontier cells by identical constraint sets
  const cls=new Map(), interior=[];
  for(const j of unknown){ const c=consOf.get(j)||[]; if(!c.length&&!pings.has(j)){ interior.push(j); continue } const k=c.join(',')+(pings.has(j)?'#'+j:''); if(!cls.has(k)) cls.set(k,{cells:[],cons:c}); cls.get(k).cells.push(j) }
  for(const [k,c] of cls){ const pj=c.cells.find(j=>pings.has(j)); if(pj!==undefined) c.ping=pings.get(pj) }
  const classes=[...cls.values()], K=classes.length, I=interior.length;
  const need=cons.map(c=>c.need), left=cons.map(()=>0); classes.forEach(c=>c.cons.forEach(id=>left[id]+=c.cells.length));
  const acc=new Float64Array(K); let accI=0, total=0, base=null; const cnt=new Int32Array(K);
  // log-weights rescaled by a running max to stay in float range
  const terms=[];
  (function rec(ci,f,lw){
    if(f>m) return;
    if(ci===K){ for(let i=0;i<need.length;i++) if(need[i]!==0) return; const r=m-f; if(r<0||r>I) return; terms.push([lw+lnC(I,r),cnt.slice(),r]); return }
    const c=classes[ci], s=c.cells.length; let hi=s, lo=0;
    for(const id of c.cons){ hi=Math.min(hi,need[id]); lo=Math.max(lo,need[id]-(left[id]-s)) }
    for(const id of c.cons) left[id]-=s;
    for(let k=lo;k<=hi;k++){ for(const id of c.cons) need[id]-=k; cnt[ci]=k; rec(ci+1,f+k,lw+lnC(s,k)+(c.ping===undefined?0:Math.log(k?(c.ping?ACC:1-ACC):(c.ping?1-ACC:ACC)))); for(const id of c.cons) need[id]+=k }
    for(const id of c.cons) left[id]+=s;
  })(0,0,0);
  if(!terms.length){ unknown.forEach(j=>P[j]=m/unknown.length); return P }
  const mx=Math.max(...terms.map(t=>t[0]));
  for(const [lw,cs,r] of terms){ const w=Math.exp(lw-mx); total+=w; for(let i=0;i<K;i++) acc[i]+=w*cs[i]; accI+=w*r }
  classes.forEach((c,i)=>{ const p=acc[i]/total/c.cells.length; c.cells.forEach(j=>P[j]=p) });
  if(I) interior.forEach(j=>P[j]=accI/total/I);
  return P;
}
const sonarAt=(mines,i)=>NB[i].reduce((s,j)=>s+(mines.has(j)?1:0),0);

/* Payout: every tile pays its TRUE odds (1/p, p = exact chance it is safe given everything
   on the board) times a risk fee exp(-H*ln(p)^2) that grows with the square of the risk.
   Certain tiles pay exactly x1.00. The first, blind dive carries the base fee FIRST.
   Every step has EV ratio <= 1, so no strategy can beat RTP = FIRST (97.5%); reading the
   sonar well lets you climb on cheap, low-risk tiles instead of expensive guesses. */
const H=(typeof SONAR_H!=="undefined"?SONAR_H:.25), FIRST=.975, MAX_WIN=5000;
function stepGain(p,first){ if(p>=1-1e-12) return 1; const l=-Math.log(p); return (first?FIRST:Math.exp(-H*l*l))/p }
root.SonarEngine={N,CELLS,NB,mineProbs,sonarAt,stepGain,get H(){return H},FIRST,MAX_WIN,lnC};
})(typeof window!=='undefined'?window:globalThis);
