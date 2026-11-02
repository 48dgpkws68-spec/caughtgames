// Provably fair helpers shared by the Caught Games titles (same SHA-256/HMAC as PEEK!, SONAR and SNEAK).
// Pure JS so it also works on http:// (crypto.subtle needs https).
//   const F = createFair('goose-demo-client');
//   F.hash (SHA-256 of the current server seed), F.nonce, F.u('throw:3') -> uniform [0,1) from HMAC(seed, client:nonce:msg)
//   const rev = F.reveal()  -> { seed, hash, nonce, client } of the finished round, then a fresh seed and nonce + 1
const K256 = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
export function sha256js(m) {
  const l = m.length, n = ((l + 9 + 63) >> 6) << 6, b = new Uint8Array(n); b.set(m); b[l] = 0x80;
  const dv = new DataView(b.buffer); dv.setUint32(n - 4, l * 8); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
  const h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]), w = new Uint32Array(64);
  const r = (x, k) => (x >>> k) | (x << (32 - k));
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const a = w[i - 15], c = w[i - 2]; w[i] = (w[i - 16] + (r(a, 7) ^ r(a, 18) ^ (a >>> 3)) + w[i - 7] + (r(c, 17) ^ r(c, 19) ^ (c >>> 10))) | 0; }
    let [A, B, Cc, D, Ee, F, G, H] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (H + (r(Ee, 6) ^ r(Ee, 11) ^ r(Ee, 25)) + ((Ee & F) ^ (~Ee & G)) + K256[i] + w[i]) | 0, t2 = ((r(A, 2) ^ r(A, 13) ^ r(A, 22)) + ((A & B) ^ (A & Cc) ^ (B & Cc))) | 0;
      H = G; G = F; F = Ee; Ee = (D + t1) | 0; D = Cc; Cc = B; B = A; A = (t1 + t2) | 0;
    }
    h[0] += A; h[1] += B; h[2] += Cc; h[3] += D; h[4] += Ee; h[5] += F; h[6] += G; h[7] += H;
  }
  const out = new Uint8Array(32), od = new DataView(out.buffer); h.forEach((v, i) => od.setUint32(i * 4, v)); return out;
}
export function hmacjs(key, msg) {
  const k = key.length > 64 ? sha256js(key) : key, kb = new Uint8Array(64); kb.set(k);
  const ip = new Uint8Array(64 + msg.length), op = new Uint8Array(96);
  for (let i = 0; i < 64; i++) { ip[i] = kb[i] ^ 0x36; op[i] = kb[i] ^ 0x5c; }
  ip.set(msg, 64); op.set(sha256js(ip), 64); return sha256js(op);
}
export const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
export const enc = (s) => new TextEncoder().encode(s);
// 52 bits of the HMAC as a uniform number in [0,1), the same read-out as PEEK!'s crash point
export const uOf = (seed, msg) => parseInt(hex(hmacjs(enc(seed), enc(msg))).slice(0, 13), 16) / 2 ** 52;

export function createFair(client) {
  let seed, hash, nonce = 1;
  const fresh = () => { seed = hex(crypto.getRandomValues(new Uint8Array(32))); hash = hex(sha256js(enc(seed))); };
  fresh();
  return {
    client,
    get hash() { return hash; },
    get nonce() { return nonce; },
    u(msg) { return uOf(seed, client + ':' + nonce + ':' + msg); },
    reveal() { const r = { seed, hash, nonce, client }; fresh(); nonce++; return r; },
  };
}
