/* PASS IT engine: pure math, no DOM. Shared by passit.html and the RTP sim (node).
   One crash draw per round for the whole room: c = floor(100 * RTP / (1 - u)) / 100 with u = fair('round'),
   at least 1.00, at most MAX_WIN, so P(c >= x) = RTP / x. The multiplier grows as e^(GROWTH * ms), shown to 2 decimals.
   You win a cash-out at multiplier m when m <= c; the bomb explodes as soon as the multiplier passes c.
   If the multiplier reaches MAX_WIN (only when c = MAX_WIN) the fuse burns out: everyone still in is paid MAX_WIN.
   The bomb's route is a separate fair stream, independent of c: pass k uses u_k = fair('pass:k').
     candidates = every seat except the current holder (pass 0: every seat), weight YOU_W for your seat when you
     play this round, 1 for every other seat. x = u_k * total weight picks the seat whose weight interval holds x,
     and f = (x - start of that interval) / its weight (again uniform on [0,1), independent of the seat) sets the
     hold time: HOLD_YOU[0] + f * HOLD_YOU[1] ms in your hands, HOLD_BOT[0] + f * HOLD_BOT[1] ms for others.
     The bomb flies FLIGHT ms between hands (pass 0 flies in from the middle of the table).
   You can only cash out while you hold the bomb. Because the route never looks at c, any rule for when to cash
   (first catch, first catch above 2x, ...) still returns RTP. */
(function(root){
  const RTP=0.97, MAX_WIN=10000, GROWTH=0.00006, MIN_CASH=1.01;
  const SEATS=8, YOU=0, YOU_W=4, FLIGHT=480, HOLD_YOU=[1500,1000], HOLD_BOT=[800,700];
  const crashOf=u=>Math.min(MAX_WIN,Math.max(1,Math.floor(100*RTP/(1-u))/100));
  const multAt=ms=>Math.min(MAX_WIN,Math.floor(100*Math.exp(GROWTH*Math.max(0,ms)))/100);
  const msTo=m=>Math.log(m)/GROWTH;
  // is the round over at this multiplier? 'boom' (passed c), 'max' (fuse burnt out at MAX_WIN) or null
  const endAt=(m,c)=>c>=MAX_WIN?(m>=MAX_WIN?'max':null):(m>c?'boom':null);
  // one pass: u -> { seat, f }
  function pick(u,prev,youIn){
    const seats=[]; let tot=0;
    for(let s=0;s<SEATS;s++){ if(s===prev) continue; const w=(s===YOU&&youIn)?YOU_W:1; seats.push([s,w]); tot+=w }
    let x=u*tot;
    for(const [s,w] of seats){ if(x<w) return {seat:s,f:x/w}; x-=w }
    const [s]=seats[seats.length-1]; return {seat:s,f:0.999999};
  }
  // the bomb's route until `untilMs`: [{ k, seat, t0 (catch), t1 (throw), u }]; uOf(msg) -> uniform from the fair stream
  function route(uOf,youIn,untilMs,from){
    const out=from?from.slice():[];
    let prev=out.length?out[out.length-1].seat:-1, t=out.length?out[out.length-1].t1+FLIGHT:FLIGHT;
    while(t<untilMs){
      const k=out.length, uk=uOf('pass:'+k), {seat,f}=pick(uk,prev,youIn);
      const h=(seat===YOU&&youIn)?HOLD_YOU:HOLD_BOT, d=Math.round(h[0]+f*h[1]);
      out.push({k,seat,t0:t,t1:t+d,u:uk}); prev=seat; t=t+d+FLIGHT;
    }
    return out;
  }
  // who holds the bomb at time ms (index into route), or -1 while it flies
  function holderAt(r,ms){ for(let i=r.length-1;i>=0;i--){ if(ms>=r[i].t0) return ms<r[i].t1?i:-1 } return -1 }
  const api={RTP,MAX_WIN,GROWTH,MIN_CASH,SEATS,YOU,YOU_W,FLIGHT,HOLD_YOU,HOLD_BOT,crashOf,multAt,msTo,endAt,pick,route,holderAt};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else root.PassItEngine=api;
})(this);
