/* WOBBLE engine: pure math, no DOM. Shared by wobble.html and the RTP sim (node).
   A tower of LAYERS layers with 3 blocks each. The top two layers stay put. Each turn the player pulls one block.
   The fall chance of a pull depends on what is left in that layer, how much tower rests on it and how weak the rest of
   the tower already is. A pull that stands pays 1/(1 - risk); the first pull also carries the house edge (RTP), so
   every pulling order returns RTP. A pull that would pass MAX_WIN pays exactly MAX_WIN with risk 1 - mult/MAX_WIN. */
(function(root){
  const RTP=0.97, MAX_WIN=10000, LAYERS=16, LOCKED=2;
  const newTower=()=>Array.from({length:LAYERS},()=>[1,1,1]);
  const count=l=>l[0]+l[1]+l[2];
  // base fall chance of taking block i out of layer l, from the layer that stays behind
  function base(l,i){
    if(!l[i]) return null;
    const after=l.slice(); after[i]=0;
    const n=count(after);
    if(n===0) return null;                      // the last block of a layer never comes out
    if(n===2) return after[1]?0.05:0.13;        // full layer: edge out leaves an L (steady), centre out leaves two rails
    // one block left behind
    if(after[1]) return 0.24;                   // only the centre carries the layer
    return l[1]?0.46:0.42;                      // only one edge carries the layer
  }
  function risk(t,layer,i){
    if(layer>=LAYERS-LOCKED) return null;
    const b=base(t[layer],i); if(b===null) return null;
    const above=(LAYERS-1-layer)/(LAYERS-1);
    let weak=0, single=0;
    t.forEach((l,k)=>{ if(k===layer) return; const n=count(l); if(n<3) weak++; if(n===1) single++ });
    return Math.min(0.92,b*(0.75+0.5*above)*(1+0.035*weak+0.12*single));
  }
  function option(t,layer,i,mult,first){
    const p=risk(t,layer,i); if(p===null) return null;
    const f=first?RTP:1, m=mult*f/(1-p);
    if(m<MAX_WIN) return {layer,i,p,m,max:false};
    return {layer,i,p:Math.max(0,1-mult*f/MAX_WIN),m:MAX_WIN,max:true};
  }
  function options(t,mult,first){ const out=[]; for(let L=0;L<LAYERS;L++) for(let i=0;i<3;i++){ const o=option(t,L,i,mult,first); if(o) out.push(o) } return out }
  const pull=(t,layer,i)=>{ const c=t.map(l=>l.slice()); c[layer][i]=0; return c };
  const api={RTP,MAX_WIN,LAYERS,LOCKED,newTower,count,risk,option,options,pull};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else root.WobbleEngine=api;
})(this);
