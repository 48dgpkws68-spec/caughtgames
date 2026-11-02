/* FREEZE engine: pure math, no DOM. Shared by freeze.html and the RTP sim (node).
   One crash draw per round for the whole room: c = floor(100 * RTP / (1 - u)) / 100, at least 1.00, at most MAX_WIN,
   so P(c >= x) = RTP / x and any freeze moment returns RTP (same curve as PEEK! and Vault Heist).
   The multiplier grows as e^(GROWTH * ms). Runners move toward the owl: progress = 1 - mult^-0.5. */
(function(root){
  const RTP=0.97, MAX_WIN=10000, GROWTH=0.00008;
  const crashOf=u=>Math.min(MAX_WIN,Math.max(1,Math.floor(100*RTP/(1-u))/100));
  const multAt=ms=>Math.min(MAX_WIN,Math.floor(100*Math.exp(GROWTH*ms))/100);
  const msTo=m=>Math.log(m)/GROWTH;
  const progress=m=>1-Math.pow(m,-0.5);
  const api={RTP,MAX_WIN,GROWTH,crashOf,multAt,msTo,progress};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else root.FreezeEngine=api;
})(this);
