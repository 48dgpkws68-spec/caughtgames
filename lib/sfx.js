// Tiny WebAudio synth shared by the Caught Games titles: no sound files, starts on the first tap.
//   const S = createSfx();  S.unlock();  S.tone(f1, f2, dur, vol, type, delay);  S.noise(dur, freq, vol, filter, delay)
//   S.notes([0, 4, 7], base, step, vol, type)   S.muted = true | false   S.toggle() -> muted
export function createSfx() {
  let ac = null, muted = false, master = null;
  const S = {
    get ac() { return ac; },
    get muted() { return muted; },
    set muted(v) { muted = !!v; if (master) master.gain.value = muted ? 0 : 1; },
    toggle() { S.muted = !muted; return muted; },
    unlock() {
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } master = ac.createGain(); master.connect(ac.destination); master.gain.value = muted ? 0 : 1; }
      if (ac.state === 'suspended') ac.resume();
    },
    tone(f1, f2, dur, v, type = 'sine', delay = 0) {
      if (!ac || muted || document.hidden) return;   // a hidden tab freezes ac.currentTime: queued sounds would all fire at once on return
      const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
    },
    noise(dur, f, v, type = 'lowpass', delay = 0) {
      if (!ac || muted || document.hidden) return;
      const b = ac.createBuffer(1, Math.max(1, ac.sampleRate * dur), ac.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const s = ac.createBufferSource(); s.buffer = b;
      const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f;
      const g = ac.createGain(), t = ac.currentTime + delay;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(fl).connect(g).connect(master); s.start(t);
    },
    notes(semis, base = 523, step = 0.07, v = 0.08, type = 'triangle') {
      semis.forEach((s, i) => { const f = base * Math.pow(2, s / 12); S.tone(f, f, 0.45, v, type, i * step); });
    },
  };
  document.addEventListener('visibilitychange', () => { if (!ac) return; if (document.hidden) ac.suspend(); else ac.resume(); });
  return S;
}
