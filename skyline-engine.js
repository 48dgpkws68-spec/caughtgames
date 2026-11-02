/* SKYLINE engine: pure math, no DOM. Shared by skyline.html and the RTP sim (node).
   A run is split into segments. Inside a segment the multiplier is m = base × g(t), g(t) = e^(GROWTH × ms), shown
   rounded down to the cent, and the thief is caught (the round crashes) as soon as m passes the segment's crash
   point C.
   - Segment 0 starts at base 1.00 with r0 = floor(100 × RTP ÷ (1 − u)) ÷ 100 (at least 1.00) and C = r0, so
     P(alive at m) = RTP ÷ m for every m from 1.01. The house edge lives here and only here.
   - A rooftop gap opens a JUMP window. A jump at m succeeds when u < 1/3 and pays 3 × m on the spot, then a NEW
     segment starts with base = 3m and a fresh fair factor r = 1 ÷ (1 − u), C = base × r, so P(alive at m) = base ÷ m.
   - A jump that would pass MAX_WIN pays exactly MAX_WIN and succeeds when u < m ÷ MAX_WIN (fair).
   - The curve stops at MAX_WIN with an automatic cash-out.
   Every cash-out at m and every jump at m is worth exactly m given the thief is still running, so every strategy
   (when to jump, when to cash) returns RTP.
   Fair messages per round: 'seg:0', 'seg:1', ... (segment factors) and 'jump:1', 'jump:2', ... (jump draws). */
(function(root){
  const RTP=0.97, MAX_WIN=10000, JUMP_X=3, JUMP_P=1/3;
  const GROWTH=Math.LN2/8000;                                   // 2× in 8 seconds
  // gaps: first window opens GAP_FIRST ms into a segment, then every GAP_EVERY ms, each open for WINDOW ms
  const GAP_FIRST=2100, GAP_EVERY=4600, WINDOW=1800;
  const SPEED=4.5;                                               // lane speed of the 3D view (world units per second), decoration only
  const r2=x=>Math.round(x*100)/100;
  const seg0Factor=u=>Math.max(1,Math.floor(100*RTP/(1-u))/100);
  const segFactor=u=>1/(1-u);
  // a new segment: k = index, base = multiplier at its start, u = the fair draw 'seg:k'
  function newSeg(k,base,u){
    const r=k===0?seg0Factor(u):segFactor(u);
    return {k,base,u,r,crash:k===0?r:base*r};
  }
  const multAt=(base,ms)=>Math.min(MAX_WIN,Math.floor(100*base*Math.exp(GROWTH*ms)+1e-6)/100);
  const msTo=(base,m)=>Math.log(m/base)/GROWTH;
  const alive=(seg,m)=>m<=seg.crash+1e-9;
  // shown crash multiplier (where the searchlight caught the thief)
  const caughtAt=seg=>Math.min(MAX_WIN,Math.max(seg.base,Math.floor(seg.crash*100+1e-6)/100));
  // cash and jump need m above 1.00 in segment 0 (an r0 of 1.00 is an instant catch)
  const canAct=(seg,m)=>alive(seg,m)&&(seg.k>0||m>=1.01)&&m<MAX_WIN;
  function jumpOdds(m){
    const to=r2(m*JUMP_X);
    if(to<MAX_WIN) return {p:JUMP_P,to,max:false};
    return {p:Math.min(1,m/MAX_WIN),to:MAX_WIN,max:true};
  }
  // gap window i of a segment: opens at, closes at (ms of segment time)
  const gapOpen=i=>GAP_FIRST+i*GAP_EVERY;
  function windowAt(ms){
    if(ms<GAP_FIRST) return null;
    const i=Math.floor((ms-GAP_FIRST)/GAP_EVERY), into=ms-gapOpen(i);
    return into<WINDOW?{i,k:into/WINDOW,left:WINDOW-into}:null;
  }
  const api={RTP,MAX_WIN,JUMP_X,JUMP_P,GROWTH,SPEED,GAP_FIRST,GAP_EVERY,WINDOW,r2,seg0Factor,segFactor,newSeg,multAt,msTo,alive,caughtAt,canAct,jumpOdds,gapOpen,windowAt};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else root.SkylineEngine=api;
})(this);
