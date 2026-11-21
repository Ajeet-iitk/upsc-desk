// The music panel: styles, transport, mixer, ambience layers, sleep timer and a live visualizer.
import * as A from './audio.js';
const $ = (s) => document.querySelector(s);

export function initMusicPanel({ toast }) {
  const pop = $('#musicPop'), viz = $('#mpViz'), vg = viz.getContext('2d'), buf = new Uint8Array(32);
  const chips = $('#mpStyles');
  A.STYLES.forEach((n, i) => { const b = document.createElement('button'); b.textContent = n; b.onclick = () => { A.init(); A.setStyle(i); if (!A.isMusic()) A.setMusic(true); A.sfx('click'); sync(); }; chips.append(b); });

  const bind = (id, fn) => { $(id).oninput = (e) => { A.init(); fn(+e.target.value); }; };
  bind('#mpVol', A.setVolume); bind('#mpTempo', A.setTempo); bind('#mpEcho', A.setEcho); bind('#mpWarm', A.setWarmth);
  bind('#mpRainV', (v) => { A.setRainLevel(v); if (!A.isRain()) A.setRain(true); }); bind('#mpWind', A.setWindUser);

  const toggle = () => { A.init(); A.setMusic(!A.isMusic()); sync(); if (A.isMusic()) toast('Now playing: ' + A.STYLES[A.getState().style]); };
  $('#mPlay').onclick = toggle; $('#mpPlay').onclick = toggle;
  $('#mpNext').onclick = () => { A.init(); const s = A.getState(); A.setStyle(s.style + 1); if (!s.music) A.setMusic(true); sync(); };
  $('#mpPrev').onclick = () => { A.init(); const s = A.getState(); A.setStyle(s.style - 1); if (!s.music) A.setMusic(true); sync(); };
  $('#mpMute').onclick = () => { A.init(); A.setMuted(!A.getState().muted); sync(); };
  $('#mpRain').onclick = () => { A.init(); A.setRain(!A.isRain()); sync(); };
  $('#mpCrick').onclick = () => { A.init(); A.setCrickets(!A.getState().crickets); sync(); };
  $('#mpFire').onclick = () => { A.init(); A.setCrackle(!A.getState().crackle); sync(); };
  $('#mpSleep').onchange = (e) => { A.init(); const m = +e.target.value; A.setSleep(m); toast(m ? 'Sound will fade out in ' + m + ' minutes' : 'Sleep timer off'); sync(); };
  $('#mCfg').onclick = () => { A.init(); $('#lampPop').classList.remove('open'); pop.classList.toggle('open'); sync(); A.sfx('click'); };
  window.addEventListener('audiochange', () => sync());

  function sync() {
    const s = A.getState();
    $('#mPlay').textContent = s.music ? '❚❚' : '▶'; $('#mPlay').classList.toggle('on', s.music);
    $('#mpPlay').textContent = s.music ? '❚❚' : '▶';
    $('#mpName').textContent = A.STYLES[s.style];
    let sub = s.music ? 'Playing' : 'Paused';
    if (s.sleepEnd) sub += ' · fades out at ' + new Date(s.sleepEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $('#mpSub').textContent = sub;
    [...chips.children].forEach((b, i) => b.classList.toggle('on', i === s.style));
    $('#mpMute').textContent = s.muted ? '🔇' : '🔊'; $('#mpMute').classList.toggle('on', s.muted);
    $('#mpRain').classList.toggle('on', s.rain); $('#mpCrick').classList.toggle('on', s.crickets); $('#mpFire').classList.toggle('on', s.crackle);
    const set = (id, v) => { const e = $(id); if (document.activeElement !== e) e.value = v; };
    set('#mpVol', s.vol); set('#mpTempo', s.tempo); set('#mpEcho', s.echo); set('#mpWarm', s.warm); set('#mpRainV', s.rainLvl); set('#mpWind', s.wind);
    if (!s.sleepEnd) set('#mpSleep', 0);
  }
  let t = 0;
  function draw() {
    if (!pop.classList.contains('open')) return;
    const w = viz.width, h = viz.height; vg.clearRect(0, 0, w, h);
    const live = A.getLevels(buf), n = 16, bw = w / n;
    const gr = vg.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#ff8a3d'); gr.addColorStop(1, '#ffd479'); vg.fillStyle = gr;
    t += 0.1;
    for (let i = 0; i < n; i++) {
      const v = live ? buf[i + 1] / 255 : 0, bh = Math.max(3, (v * 0.95 + 0.05 + (A.isMusic() ? 0 : 0)) * h);
      vg.beginPath(); vg.roundRect ? vg.roundRect(i * bw + 2, h - bh, bw - 4, bh, 3) : vg.rect(i * bw + 2, h - bh, bw - 4, bh); vg.fill();
    }
  }
  sync();
  return { sync, draw };
}
