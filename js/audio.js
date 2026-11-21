// All sound is generated live with WebAudio — no audio files needed.
let ctx, master, musicG, sfxG, rainG, noiseBuf, musicBus, padLP;
let musicOn = false, rainOn = false, vol = 0.5, chordIdx = 0, mood = 'golden', timer = null;

const CHORDS = [
  [110, 220, 261.63, 329.63, 392],      // Am7
  [87.31, 174.61, 220, 261.63, 329.63], // Fmaj7
  [130.81, 261.63, 329.63, 392, 493.88],// Cmaj7
  [98, 196, 246.94, 293.66, 392]        // G6
];
const PENT = [440, 523.25, 587.33, 659.25, 783.99, 880, 329.63, 392];

export function init() {
  if (ctx) { if (ctx.state !== 'running') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  musicG = ctx.createGain(); musicG.gain.value = 0; musicG.connect(master);
  sfxG = ctx.createGain(); sfxG.gain.value = 0.9; sfxG.connect(master);
  rainG = ctx.createGain(); rainG.gain.value = 0; rainG.connect(master);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // music bus with a soft echo
  musicBus = ctx.createGain(); musicBus.connect(musicG);
  const dl = ctx.createDelay(1); dl.delayTime.value = 0.46;
  const fb = ctx.createGain(); fb.gain.value = 0.38;
  const wet = ctx.createGain(); wet.gain.value = 0.45;
  musicBus.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(musicG);
  padLP = ctx.createBiquadFilter(); padLP.type = 'lowpass'; padLP.frequency.value = 1300; padLP.connect(musicBus);

  // rain: filtered looping noise
  const rs = ctx.createBufferSource(); rs.buffer = noiseBuf; rs.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.5;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000;
  rs.connect(bp); bp.connect(lp); lp.connect(rainG); rs.start();
}

export function setMood(m) {
  mood = m;
  if (padLP) padLP.frequency.setTargetAtTime(m === 'night' ? 650 : m === 'golden' ? 1000 : 1500, ctx.currentTime, 1.2);
}

function note(freq, t0, dur, type, gain, dest) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(1.8, dur * 0.35));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.1);
  return o;
}
function loop() {
  if (!musicOn || !ctx) return;
  const t0 = ctx.currentTime + 0.05, ch = CHORDS[chordIdx++ % CHORDS.length];
  const len = mood === 'night' ? 8 : 6;
  ch.forEach((f, i) => {
    const o = note(f, t0, len + 2, 'triangle', i === 0 ? 0.16 : 0.07, padLP);
    o.detune.value = (i % 2 ? 7 : -7);
  });
  const n = mood === 'night' ? 3 : 5;
  for (let i = 0; i < n; i++) {
    const at = t0 + Math.random() * (len - 0.5);
    note(PENT[(Math.random() * PENT.length) | 0], at, 1.6, 'sine', 0.09, musicBus);
  }
  timer = setTimeout(loop, len * 1000);
}
export function setMusic(on) {
  init(); if (!ctx) return;
  musicOn = on;
  musicG.gain.setTargetAtTime(on ? vol * 0.9 : 0, ctx.currentTime, 0.4);
  clearTimeout(timer);
  if (on) loop();
}
export const isMusic = () => musicOn;
export function setVolume(v) { vol = v; if (ctx && musicOn) musicG.gain.setTargetAtTime(v * 0.9, ctx.currentTime, 0.1); }
export function setRain(on) {
  init(); if (!ctx) return;
  rainOn = on;
  rainG.gain.setTargetAtTime(on ? 0.28 : 0, ctx.currentTime, 0.6);
}
export const isRain = () => rainOn;

// ---------- SFX ----------
function burst(t0, dur, freq, type, gain, q) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(sfxG);
  s.start(t0, Math.random() * 1.5, dur + 0.05);
}
function tone(t0, f0, f1, dur, gain, type = 'sine') {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(sfxG); o.start(t0); o.stop(t0 + dur + 0.02);
}
export function sfx(kind = 'wood', v = 0.5) {
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime; v = Math.max(0.05, Math.min(1, v));
  switch (kind) {
    case 'plastic': burst(t0, 0.12, 650, 'bandpass', v * 0.9, 1.2); tone(t0, 320, 180, 0.1, v * 0.35); break;
    case 'paper':   burst(t0, 0.28, 2600, 'highpass', v * 0.35); burst(t0 + 0.05, 0.18, 4000, 'highpass', v * 0.2); break;
    case 'glass':   tone(t0, 2100, 2000, 0.6, v * 0.18); tone(t0, 3150, 3100, 0.4, v * 0.1); burst(t0, 0.04, 3000, 'highpass', v * 0.3); break;
    case 'cube':    burst(t0, 0.05, 1800, 'bandpass', v, 2); tone(t0, 900, 500, 0.05, v * 0.2, 'square'); break;
    case 'ceramic': burst(t0, 0.08, 1200, 'bandpass', v * 0.8, 3); tone(t0, 1300, 900, 0.18, v * 0.2); break;
    case 'key':     burst(t0, 0.03, 3200, 'highpass', 0.35); tone(t0, 1300, 700, 0.03, 0.05, 'square'); break;
    case 'click':   burst(t0, 0.025, 2500, 'highpass', 0.6); tone(t0, 1500, 900, 0.04, 0.12, 'square'); break;
    case 'ding':    tone(t0, 880, 880, 0.9, 0.22); tone(t0 + 0.12, 1320, 1320, 1.0, 0.18); break;
    case 'whoosh':  burst(t0, 0.5, 900, 'bandpass', 0.35, 0.7); break;
    default:        burst(t0, 0.14, 380, 'lowpass', v * 1.1); tone(t0, 120, 55, 0.14, v * 0.5);
  }
}
