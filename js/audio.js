// All sound is generated live with WebAudio. No audio files needed.
let fanG, fanLfo, ctx, master, musicG, sfxG, rainG, windG, cricketG, crackleG, noiseBuf, musicBus, padLP, analyser, echoWet;
let timer = null, sleepT = null, sleepEnd = 0, chordIdx = 0, mood = 'golden', melIdx = 3;
const st = { music: false, rain: false, rainLvl: 0.55, wind: 0, windowOpen: false, crickets: false, crackle: false,
  vol: 0.5, tempo: 1, echo: 0.45, warm: 0.5, style: 0, master: 0.9, muted: false };
export const STYLES = ['Lo-fi chill', 'Soft piano', 'Dreamy ambient', 'Raga Yaman', 'Deep focus'];

const CHORDS = [
  [110, 220, 261.63, 329.63, 392],       // Am7
  [87.31, 174.61, 220, 261.63, 329.63],  // Fmaj7
  [130.81, 261.63, 329.63, 392, 493.88], // Cmaj7
  [98, 196, 246.94, 293.66, 392]         // G6
];
const PENT = [440, 523.25, 587.33, 659.25, 783.99, 880, 329.63, 392];
const YAMAN = [261.63, 293.66, 329.63, 369.99, 392, 440, 493.88, 523.25]; // C D E F# G A B C
const ping = () => window.dispatchEvent(new CustomEvent('audiochange'));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- setup ---------- */
export function init() {
  if (ctx) { if (ctx.state !== 'running') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.connect(ctx.destination);
  analyser = ctx.createAnalyser(); analyser.fftSize = 64; analyser.smoothingTimeConstant = 0.75; master.connect(analyser);
  musicG = ctx.createGain(); musicG.gain.value = 0; musicG.connect(master);
  sfxG = ctx.createGain(); sfxG.gain.value = 0.9; sfxG.connect(master);
  rainG = ctx.createGain(); rainG.gain.value = 0; rainG.connect(master);
  windG = ctx.createGain(); windG.gain.value = 0; windG.connect(master);
  cricketG = ctx.createGain(); cricketG.gain.value = 0; cricketG.connect(master);
  crackleG = ctx.createGain(); crackleG.gain.value = 0.9; crackleG.connect(master);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // music bus with an adjustable echo
  musicBus = ctx.createGain(); musicBus.connect(musicG);
  const dl = ctx.createDelay(1); dl.delayTime.value = 0.46;
  const fb = ctx.createGain(); fb.gain.value = 0.38;
  echoWet = ctx.createGain();
  musicBus.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(echoWet); echoWet.connect(musicG);
  padLP = ctx.createBiquadFilter(); padLP.type = 'lowpass'; padLP.connect(musicBus);

  // rain
  const rs = ctx.createBufferSource(); rs.buffer = noiseBuf; rs.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.5;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000;
  rs.connect(bp); bp.connect(lp); lp.connect(rainG); rs.start();

  // wind: slowly swelling filtered noise (open window and the wind slider)
  const ws = ctx.createBufferSource(); ws.buffer = noiseBuf; ws.loop = true; ws.playbackRate.value = 0.6;
  const wb = ctx.createBiquadFilter(); wb.type = 'bandpass'; wb.frequency.value = 520; wb.Q.value = 0.7;
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 0.03;
  lfo.connect(lg); lg.connect(windG.gain); lfo.start();
  ws.connect(wb); wb.connect(windG); ws.start();

  // ceiling fan hum
  fanG = ctx.createGain(); fanG.gain.value = 0; fanG.connect(master);
  const fs = ctx.createBufferSource(); fs.buffer = noiseBuf; fs.loop = true; fs.playbackRate.value = 0.5;
  const fbp = ctx.createBiquadFilter(); fbp.type = 'bandpass'; fbp.frequency.value = 260; fbp.Q.value = 0.9;
  fanLfo = ctx.createOscillator(); fanLfo.frequency.value = 3; const fl = ctx.createGain(); fl.gain.value = 0.02; fanLfo.connect(fl); fl.connect(fanG.gain); fanLfo.start();
  fs.connect(fbp); fbp.connect(fanG); fs.start();

  // crickets: pulsing high tones
  [[4300, 17], [4700, 13], [5100, 21]].forEach(([f, r]) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), l = ctx.createOscillator(), lgn = ctx.createGain();
    o.frequency.value = f; g.gain.value = 0; l.type = 'square'; l.frequency.value = r; lgn.gain.value = 0.5;
    l.connect(lgn); lgn.connect(g.gain); o.connect(g); g.connect(cricketG); o.start(); l.start();
  });
  // fireplace crackle
  setInterval(() => {
    if (!st.crackle || !ctx || ctx.state !== 'running' || Math.random() > 0.45) return;
    burst(ctx.currentTime, 0.02 + Math.random() * 0.05, 2500 + Math.random() * 3000, 'highpass', 0.12 + Math.random() * 0.25, 0, crackleG);
  }, 110);

  applyAll();
}

/* ---------- apply state to the graph ---------- */
const now = () => ctx.currentTime;
function applyFilter() { if (ctx) padLP.frequency.setTargetAtTime(350 * Math.pow(2, st.warm * 3) * (mood === 'night' ? 0.7 : 1), now(), 0.3); }
function applyMusic() { if (ctx) musicG.gain.setTargetAtTime(st.music ? st.vol * 0.9 : 0, now(), 0.4); }
function applyRain() { if (ctx) rainG.gain.setTargetAtTime(st.rain ? st.rainLvl * 0.5 : 0, now(), 0.6); }
function applyWind() { if (ctx) windG.gain.setTargetAtTime(Math.max(st.windowOpen ? 0.07 : 0, st.wind * 0.2), now(), 0.8); }
function applyAll() {
  if (!ctx) return;
  master.gain.value = st.muted ? 0 : st.master; echoWet.gain.value = st.echo * 0.9;
  applyFilter(); applyMusic(); applyRain(); applyWind();
  cricketG.gain.value = st.crickets ? 0.03 : 0;
}

/* ---------- music styles ---------- */
function note(freq, t0, dur, type, gain, dest) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(1.8, dur * 0.35));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.1);
  return o;
}
function pad(ch, t0, dur, type, gRoot, gOther) { ch.forEach((f, i) => { const o = note(f, t0, dur, type, i === 0 ? gRoot : gOther, padLP); o.detune.value = i % 2 ? 7 : -7; }); }
function plucks(t0, len, n, scale, type, gain) { for (let i = 0; i < n; i++) note(scale[(Math.random() * scale.length) | 0], t0 + Math.random() * (len - 0.5), 1.6, type, gain, musicBus); }

function loop() {
  if (!st.music || !ctx) return;
  const t0 = ctx.currentTime + 0.05, ch = CHORDS[chordIdx++ % CHORDS.length], base = (mood === 'night' ? 8 : 6) / st.tempo;
  let len = base;
  switch (st.style) {
    case 0: // lo-fi chill: warm pad + sparkly pentatonic plucks
      pad(ch, t0, len + 2, 'triangle', 0.16, 0.07); plucks(t0, len, mood === 'night' ? 3 : 5, PENT, 'sine', 0.09); break;
    case 1: // soft piano: arpeggiated chords
      len = base * 0.9;
      ch.slice(1).forEach((f, i) => note(f * (i % 2 ? 2 : 1), t0 + i * len / 5, 2.4, 'triangle', 0.14, musicBus));
      note(ch[0], t0, len + 1, 'sine', 0.12, padLP); plucks(t0, len, 2, PENT, 'sine', 0.06); break;
    case 2: // dreamy ambient: long, slow pads
      len = base * 1.4; pad(ch, t0, len + 3, 'sine', 0.12, 0.09);
      if (Math.random() < 0.6) note(PENT[(Math.random() * PENT.length) | 0] * 2, t0 + len * 0.4, 3, 'sine', 0.05, musicBus); break;
    case 3: { // raga Yaman over a tanpura-style drone
      note(130.81, t0, len + 2, 'triangle', 0.11, padLP); note(196, t0, len + 2, 'triangle', 0.08, padLP); note(65.4, t0, len + 2, 'sine', 0.08, padLP);
      const n = 4 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) { melIdx = clamp(melIdx + ((Math.random() * 3) | 0) - 1, 0, YAMAN.length - 1); note(YAMAN[melIdx], t0 + i * len / n + Math.random() * 0.15, 1.8, 'sine', 0.1, musicBus); }
      break; }
    default: // deep focus: low, steady drone
      len = base * 1.5; note(110, t0, len + 3, 'sine', 0.14, padLP); note(164.81, t0, len + 3, 'sine', 0.1, padLP); note(55, t0, len + 3, 'sine', 0.1, padLP);
  }
  timer = setTimeout(loop, len * 1000);
}
function restartLoop() { clearTimeout(timer); if (st.music) loop(); }

/* ---------- public controls ---------- */
const ensure = () => { init(); return !!ctx; };
export const getState = () => ({ ...st, sleepEnd });
export const isMusic = () => st.music;
export const isRain = () => st.rain;
export function getLevels(arr) { if (!analyser) return false; analyser.getByteFrequencyData(arr); return true; }
export function setMood(m) { mood = m; applyFilter(); }
export function setMusic(on) { ensure(); st.music = on; applyMusic(); restartLoop(); ping(); }
export function setStyle(i) { st.style = ((i % STYLES.length) + STYLES.length) % STYLES.length; restartLoop(); ping(); return STYLES[st.style]; }
export function setVolume(v) { st.vol = v; applyMusic(); }
export function setTempo(v) { st.tempo = v; }
export function setEcho(v) { st.echo = v; if (ctx) echoWet.gain.setTargetAtTime(v * 0.9, now(), 0.1); }
export function setWarmth(v) { st.warm = v; applyFilter(); }
export function setRain(on) { ensure(); st.rain = on; applyRain(); ping(); }
export function setRainLevel(v) { st.rainLvl = v; applyRain(); }
export function setWindUser(v) { st.wind = v; applyWind(); }
export function setWindow(open) { ensure(); st.windowOpen = open; applyWind(); }
export function setCrickets(on) { ensure(); st.crickets = on; if (ctx) cricketG.gain.setTargetAtTime(on ? 0.03 : 0, now(), 0.5); ping(); }
export function setCrackle(on) { ensure(); st.crackle = on; ping(); }
export function setMaster(v) { st.master = v; if (ctx && !st.muted) master.gain.setTargetAtTime(v, now(), 0.1); }
export function setMuted(m) { st.muted = m; if (ctx) master.gain.setTargetAtTime(m ? 0 : st.master, now(), 0.1); ping(); }
export function setFan(l) { ensure(); if (ctx) { fanG.gain.setTargetAtTime([0, 0.035, 0.06][l], now(), 0.6); fanLfo.frequency.setTargetAtTime([0.5, 3, 6.5][l], now(), 0.5); } }
export function setSleep(min) {
  clearTimeout(sleepT); sleepEnd = 0;
  if (min > 0) {
    sleepEnd = Date.now() + min * 60000;
    sleepT = setTimeout(() => { sleepEnd = 0; st.music = false; st.rain = false; st.crickets = false; st.crackle = false; applyMusic(); applyRain(); if (ctx) cricketG.gain.setTargetAtTime(0, now(), 1.5); clearTimeout(timer); ping(); }, min * 60000);
  }
  ping();
}

/* ---------- bird song ---------- */
// little sweeps of sine tones, muffled when the window is shut
export function chirp(vol = 0.35, muffled = false, species = 0) {
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = muffled ? 1500 : 14000;
  const out = ctx.createGain(); out.gain.value = vol; lp.connect(out); out.connect(sfxG);
  const n = 3 + ((Math.random() * 6) | 0), base = (species ? 3300 : 2500) + Math.random() * 900;
  let t = t0;
  for (let i = 0; i < n; i++) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = base * (0.85 + Math.random() * 0.5), d = 0.04 + Math.random() * 0.09;
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (Math.random() < 0.5 ? 1.4 : 0.7), t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + d * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(lp); o.start(t); o.stop(t + d + 0.03);
    t += d + 0.03 + Math.random() * 0.09;
  }
}

/* ---------- SFX ---------- */
function burst(t0, dur, freq, type, gain, q, dest) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  s.loop = true; s.connect(f); f.connect(g); g.connect(dest || sfxG);
  s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
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
    case 'pop':     burst(t0, 0.25, 700, 'lowpass', v * 0.8); tone(t0, 380, 70, 0.3, v * 0.35); burst(t0 + 0.06, 0.4, 5000, 'highpass', v * 0.15); break;
    case 'door':    tone(t0, 160, 92, 0.7, 0.1, 'sawtooth'); burst(t0 + 0.62, 0.12, 260, 'lowpass', 0.5); break;
    case 'thunder': burst(t0, 3.2, 160, 'lowpass', v * 1.3); burst(t0 + 0.5, 2.6, 110, 'lowpass', v * 0.8); tone(t0, 70, 26, 2.8, v * 0.55); burst(t0, 0.12, 2500, 'highpass', v * 0.25); break;
    case 'duck':    tone(t0, 700, 1150, 0.12, 0.2, 'square'); tone(t0 + 0.15, 950, 600, 0.12, 0.15, 'square'); break;
    case 'drawer':  burst(t0, 0.4, 600, 'bandpass', 0.25, 0.8); burst(t0 + 0.38, 0.1, 300, 'lowpass', 0.45); break;
    case 'whoosh':  burst(t0, 0.5, 900, 'bandpass', 0.35, 0.7); break;
    case 'marker':  burst(t0, 0.05, 3500, 'highpass', 0.12); break;
    default:        burst(t0, 0.14, 380, 'lowpass', v * 1.1); tone(t0, 120, 55, 0.14, v * 0.5);
  }
}
