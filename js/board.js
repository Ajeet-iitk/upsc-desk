// A small whiteboard: hand-drawn UPSC plan, doodles, sticky notes and clips.
// You can draw on it, wipe it clean, and pin handwritten sticky notes that other visitors see too.
const FONT = '"Segoe Print","Bradley Hand","Comic Sans MS","Chalkboard SE",cursive';
const $ = (s) => document.querySelector(s);

function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }
export const BLANK = '#fbfbf8';

export function drawArt(g, w, h) {
  const r = rng(42), j = (n) => (r() - 0.5) * n;
  g.fillStyle = BLANK; g.fillRect(0, 0, w, h);
  const sh = g.createLinearGradient(0, 0, w, h); sh.addColorStop(0, 'rgba(255,255,255,.7)'); sh.addColorStop(1, 'rgba(0,0,0,.05)'); g.fillStyle = sh; g.fillRect(0, 0, w, h);
  g.lineCap = 'round'; g.lineJoin = 'round';

  const line = (x1, y1, x2, y2, col, wd) => { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); g.moveTo(x1 + j(3), y1 + j(3)); g.quadraticCurveTo((x1 + x2) / 2 + j(10), (y1 + y2) / 2 + j(10), x2 + j(3), y2 + j(3)); g.stroke(); };
  const arrow = (x1, y1, x2, y2, col) => { line(x1, y1, x2, y2, col, 4); const a = Math.atan2(y2 - y1, x2 - x1); line(x2, y2, x2 - 18 * Math.cos(a - 0.5), y2 - 18 * Math.sin(a - 0.5), col, 4); line(x2, y2, x2 - 18 * Math.cos(a + 0.5), y2 - 18 * Math.sin(a + 0.5), col, 4); };
  const text = (t, x, y, size, col, rot = 0, align = 'left') => { g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = col; g.font = `${size}px ${FONT}`; g.textAlign = align; g.fillText(t, 0, 0); g.restore(); };
  const circle = (x, y, rad, col, wd = 4, fill) => { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); for (let a = 0; a <= 6.5; a += 0.2) { const rr = rad + j(3); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.stroke(); if (fill) { g.fillStyle = fill; g.fill(); } };
  const star = (x, y, rad, col) => { g.strokeStyle = col; g.lineWidth = 3.5; g.beginPath(); for (let i = 0; i <= 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? rad * 0.45 : rad; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.stroke(); };
  const wavy = (x, y, len, col) => { g.strokeStyle = col; g.lineWidth = 4; g.beginPath(); for (let i = 0; i <= len; i += 6) g.lineTo(x + i, y + Math.sin(i / 8) * 4); g.stroke(); };
  const clip = (x, y, rot) => { g.save(); g.translate(x, y); g.rotate(rot); g.strokeStyle = '#8b94a1'; g.lineWidth = 4; g.beginPath(); g.moveTo(-8, 22); g.lineTo(-8, -18); g.arc(0, -18, 8, Math.PI, 0); g.lineTo(8, 14); g.arc(0, 14, 8, 0, Math.PI); g.lineTo(-4, -8); g.stroke(); g.restore(); };
  const note = (x, y, wd, ht, col, rot, lines, ink = '#222') => {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 10; g.shadowOffsetY = 5; g.fillStyle = col; g.fillRect(0, 0, wd, ht); g.shadowColor = 'transparent';
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(wd / 2 - 38, -10, 76, 22);
    lines.forEach((t, i) => text(t, 14, 42 + i * 34, 27, ink)); g.restore();
  };

  text('UPSC ROADMAP', w / 2, 92, 76, '#1d4ed8', -0.02, 'center'); wavy(w / 2 - 280, 112, 560, '#1d4ed8');
  star(150, 70, 30, '#ea580c'); star(w - 150, 72, 26, '#16a34a'); star(w - 210, 40, 14, '#dc2626');

  text('TOPICS', 70, 190, 46, '#dc2626'); wavy(70, 206, 170, '#dc2626');
  [['Polity', 1], ['History', 1], ['Geography', 0], ['Economy', 0], ['Environment', 0], ['Ethics', 0], ['CSAT', 1], ['Current Affairs', 0]].forEach(([t, done], i) => {
    const y = 262 + i * 52; g.strokeStyle = '#111827'; g.lineWidth = 3.5; g.strokeRect(70 + j(2), y - 28 + j(2), 30, 30);
    if (done) { g.strokeStyle = '#16a34a'; g.lineWidth = 6; g.beginPath(); g.moveTo(74, y - 12); g.lineTo(86, y); g.lineTo(112, y - 36); g.stroke(); }
    text(t, 120, y, 36, done ? '#6b7280' : '#111827'); if (done) line(118, y - 12, 118 + t.length * 17, y - 12, '#6b7280', 3);
  });

  circle(w / 2 + 40, 360, 78, '#dc2626', 5); text('UPSC', w / 2 + 40, 372, 44, '#dc2626', 0, 'center');
  [['Prelims', w / 2 - 110, 250, '#1d4ed8'], ['Mains', w / 2 + 200, 250, '#16a34a'], ['Interview', w / 2 + 40, 520, '#7c3aed']].forEach(([t, x, y, c]) => { circle(x, y, 56, c, 4); text(t, x, y + 10, 30, c, 0, 'center'); });
  arrow(w / 2 - 6, 305, w / 2 - 80, 285, '#1d4ed8'); arrow(w / 2 + 100, 308, w / 2 + 160, 285, '#16a34a'); arrow(w / 2 + 40, 440, w / 2 + 40, 462, '#7c3aed');
  text('Answer writing daily!', w / 2 - 20, 600, 34, '#ea580c', -0.03, 'center'); wavy(w / 2 - 200, 616, 360, '#ea580c');

  const bx = w - 190, by = 230; circle(bx, by, 36, '#ca8a04', 4, 'rgba(250,204,21,.45)'); line(bx - 14, by + 40, bx + 14, by + 40, '#374151', 5); line(bx - 10, by + 54, bx + 10, by + 54, '#374151', 5);
  [[-60, -28], [60, -28], [0, -64], [-48, 20], [48, 20]].forEach(([dx, dy]) => line(bx + dx * 0.75, by + dy * 0.75, bx + dx * 1.05, by + dy * 1.05, '#ca8a04', 4));
  text('IDEAS!', bx, by + 100, 32, '#ca8a04', 0.04, 'center');
  const cx = w - 190, cy = 440; g.strokeStyle = '#7c2d12'; g.lineWidth = 5; g.beginPath(); g.moveTo(cx - 40, cy - 30); g.lineTo(cx - 30, cy + 30); g.lineTo(cx + 30, cy + 30); g.lineTo(cx + 40, cy - 30); g.closePath(); g.stroke(); circle(cx + 56, cy, 16, '#7c2d12', 4);
  [-14, 6, 26].forEach(dx => { g.strokeStyle = '#9ca3af'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx + dx, cy - 44); g.bezierCurveTo(cx + dx - 10, cy - 60, cx + dx + 10, cy - 72, cx + dx, cy - 92); g.stroke(); });
  text('chai > coffee', cx, cy + 74, 28, '#7c2d12', -0.04, 'center');
  const hx = 640, hy = h - 62; circle(hx, hy, 34, '#374151', 4); line(hx, hy, hx, hy - 22, '#374151', 4); line(hx, hy, hx + 16, hy + 6, '#374151', 4); text('6 AM', hx + 52, hy + 10, 30, '#374151');
  [26, 44, 62, 40].forEach((bh, i) => { g.fillStyle = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6'][i]; g.fillRect(w - 330 + i * 34, h - 52 - bh, 26, bh); }); text('progress ↑', w - 290, h - 20, 26, '#374151');
  g.strokeStyle = '#e11d48'; g.lineWidth = 5; g.beginPath(); g.moveTo(w - 80, 360); g.bezierCurveTo(w - 130, 320, w - 140, 380, w - 80, 420); g.bezierCurveTo(w - 20, 380, w - 30, 320, w - 80, 360); g.stroke();
  g.strokeStyle = '#0ea5e9'; g.lineWidth = 4; g.beginPath(); for (let a = 0; a < 12; a += 0.2) g.lineTo(80 + Math.cos(a) * a * 3.2, h - 90 + Math.sin(a) * a * 3.2); g.stroke();
  text('Consistency > Intensity', 130, h - 28, 34, '#16a34a', -0.01); wavy(130, h - 18, 420, '#16a34a');

  arrow(520, h - 142, 790, h - 142, '#374151'); ['Jan', 'Prelims', 'Mains'].forEach((t, i) => { circle(560 + i * 105, h - 142, 7, '#374151', 3, '#374151'); text(t, 560 + i * 105, h - 162, 22, '#374151', 0, 'center'); });

  note(w - 330, 60, 210, 150, '#fde047', 0.05, ['Revise', 'Art. 14 to 32', 'before Sunday']);
  note(300, h - 235, 200, 140, '#f9a8d4', -0.06, ['The Hindu', 'at 7 AM', 'no excuses']);
  note(w - 280, h - 260, 190, 130, '#86efac', 0.04, ['Mock test', 'Sunday 10 AM']);
  note(24, 250 + 8 * 52 - 20, 150, 110, '#93c5fd', -0.03, ['150 words', 'a day']);
  clip(w - 60, 48, 0.4); clip(240, h - 250, -0.3); clip(w / 2 + 330, 160, 0.2);
  [['#dc2626', 54, 54], ['#2563eb', w - 54, h - 54]].forEach(([c, x, y]) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, 16, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(x - 5, y - 5, 5, 0, 7); g.fill(); });
}

/* ---------------------------------------------------------------------------------------
   Board: a base layer (art + your drawing) and a notes layer (pinned sticky notes) are
   composited into the canvas that the 3D whiteboard shows.
   --------------------------------------------------------------------------------------- */
const NW = 260, NH = 190;
const NOTE_COLORS = ['#fde047', '#f9a8d4', '#86efac', '#93c5fd', '#fdba74'];
const INKS = ['#1d4ed8', '#dc2626', '#111827', '#16a34a'];

export function setupBoard(tex, A, cfg = {}) {
  const c = tex.c, g = tex.g, W = c.width, H = c.height;
  const base = document.createElement('canvas'); base.width = W; base.height = H; const bg = base.getContext('2d');
  const KEY = 'deskBoard2', NKEY = 'deskNotes', api = (cfg.api || '').replace(/\/+$/, '');
  const toast = cfg.toast || (() => {});
  let color = '#1d4ed8', size = 5, erase = false, drawing = false, last = null;
  let notes = []; const imgs = new Map();

  /* ----- base layer ----- */
  drawArt(bg, W, H);
  try { const d = localStorage.getItem(KEY); if (d) { const im = new Image(); im.onload = () => { bg.drawImage(im, 0, 0); compose(); }; im.src = d; } } catch (e) {}
  const saveBase = () => { try { localStorage.setItem(KEY, base.toDataURL('image/jpeg', 0.72)); } catch (e) {} };

  /* ----- notes layer ----- */
  function drawNote(n) {
    let im = imgs.get(n.id);
    if (!im) { im = new Image(); im.onload = compose; im.src = n.img; imgs.set(n.id, im); }
    if (!im.complete || !im.naturalWidth) return;
    g.save(); g.translate(n.x * W, n.y * H); g.rotate(n.rot * Math.PI / 180);
    g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 12; g.shadowOffsetY = 6; g.drawImage(im, -NW / 2, -NH / 2, NW, NH); g.shadowColor = 'transparent';
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(-36, -NH / 2 - 8, 72, 18); // tape
    g.restore();
  }
  function compose() { g.drawImage(base, 0, 0); notes.forEach(drawNote); tex.tex.needsUpdate = true; }
  const validNote = (n) => n && typeof n.img === 'string' && n.img.startsWith('data:image/jpeg;base64,') && n.img.length < 60000 && Number.isFinite(+n.x) && Number.isFinite(+n.y);
  async function loadNotes() {
    if (!api) { try { return JSON.parse(localStorage.getItem(NKEY) || '[]'); } catch (e) { return []; } }
    try {
      const r = await fetch(api + '/notes.json?orderBy=%22%24key%22&limitToLast=80'); const j = await r.json();
      return Object.entries(j || {}).map(([id, v]) => ({ id, img: v.img, x: Math.min(0.92, Math.max(0.08, +v.x)), y: Math.min(0.92, Math.max(0.1, +v.y)), rot: Math.max(-12, Math.min(12, +v.rot || 0)), t: v.t })).filter(validNote);
    } catch (e) { return notes; }
  }
  async function refresh() { notes = await loadNotes(); compose(); }
  async function saveNote(n) {
    if (api) { const r = await fetch(api + '/notes.json', { method: 'POST', body: JSON.stringify({ img: n.img, color: n.color, x: n.x, y: n.y, rot: n.rot, t: n.t }) }); const j = await r.json(); if (!j || !j.name) throw new Error('save failed'); n.id = j.name; notes.push(n); }
    else { n.id = 'l' + Date.now(); notes.push(n); try { localStorage.setItem(NKEY, JSON.stringify(notes.slice(-40))); } catch (e) {} }
  }
  function freeSpot() { // pick the spot that overlaps existing notes the least
    let best = null, bd = -1;
    for (let i = 0; i < 40; i++) {
      const x = 0.14 + Math.random() * 0.72, y = 0.18 + Math.random() * 0.66, d = notes.reduce((m, n) => Math.min(m, Math.hypot(n.x - x, n.y - y)), 9);
      if (d > bd) { bd = d; best = [x, y]; }
    }
    return best;
  }
  compose(); refresh();
  setInterval(() => { if (api && document.visibilityState === 'visible') refresh(); }, 60000);

  /* ----- drawing on the board ----- */
  const pos = (ev) => { const r = c.getBoundingClientRect(); return { x: (ev.clientX - r.left) * W / r.width, y: (ev.clientY - r.top) * H / r.height }; };
  const style = () => { bg.lineCap = 'round'; bg.lineJoin = 'round'; bg.strokeStyle = erase ? BLANK : color; bg.fillStyle = bg.strokeStyle; bg.lineWidth = erase ? size * 4 : size; };
  const dot = (p) => { style(); bg.beginPath(); bg.arc(p.x, p.y, bg.lineWidth / 2, 0, 7); bg.fill(); compose(); };
  const stroke = (a, b) => { style(); bg.beginPath(); bg.moveTo(a.x, a.y); bg.lineTo(b.x, b.y); bg.stroke(); compose(); };
  c.addEventListener('pointerdown', (ev) => { if (!c.dataset.live) return; drawing = true; last = pos(ev); c.setPointerCapture(ev.pointerId); dot(last); A.sfx('marker'); });
  c.addEventListener('pointermove', (ev) => { if (!drawing) return; const p = pos(ev); stroke(last, p); last = p; });
  const end = () => { if (drawing) { drawing = false; saveBase(); } };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);

  document.querySelectorAll('#boardTools [data-col]').forEach(b => { b.style.background = b.dataset.col; b.onclick = () => { color = b.dataset.col; erase = false; mark(); A.sfx('click'); }; });
  const mark = () => { document.querySelectorAll('#boardTools [data-col]').forEach(b => b.classList.toggle('on', !erase && b.dataset.col === color)); $('#bErase').classList.toggle('on', erase); };
  $('#bErase').onclick = () => { erase = !erase; mark(); A.sfx('click'); };
  $('#bSize').oninput = (e) => { size = +e.target.value; };
  $('#bReset').onclick = () => { bg.fillStyle = BLANK; bg.fillRect(0, 0, W, H); saveBase(); compose(); A.sfx('paper', 0.6); toast('Board wiped. A blank slate.'); };
  $('#bRestore').onclick = () => { drawArt(bg, W, H); saveBase(); compose(); A.sfx('paper', 0.6); };
  $('#bSave').onclick = () => { const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'my-upsc-whiteboard.png'; a.click(); };
  mark();

  /* ----- sticky note editor ----- */
  const ed = $('#noteEd'), nc = $('#neC'), ng = nc.getContext('2d');
  let ncol = NOTE_COLORS[0], nink = INKS[0], nsize = 3, strokes = [], ntext = '', ndraw = false, nlast = null, cur = null;
  const redraw = () => {
    ng.fillStyle = ncol; ng.fillRect(0, 0, NW, NH);
    ng.fillStyle = 'rgba(0,0,0,.06)'; ng.fillRect(0, 0, NW, 18);
    if (ntext) {
      ng.fillStyle = nink; ng.font = `26px ${FONT}`; ng.textAlign = 'center';
      const words = ntext.split(' '), lines = []; let ln = '';
      words.forEach(w => { if ((ln + ' ' + w).trim().length > 14) { lines.push(ln); ln = w; } else ln = (ln + ' ' + w).trim(); }); lines.push(ln);
      lines.slice(0, 5).forEach((t, i) => ng.fillText(t, NW / 2, 56 + i * 32 - (Math.min(lines.length, 5) - 1) * 10));
    }
    strokes.forEach(s => { ng.strokeStyle = s.ink; ng.lineWidth = s.size; ng.lineCap = 'round'; ng.lineJoin = 'round'; ng.beginPath(); s.pts.forEach(([x, y], i) => i ? ng.lineTo(x, y) : ng.moveTo(x, y)); if (s.pts.length === 1) ng.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]); ng.stroke(); });
  };
  const npos = (ev) => { const r = nc.getBoundingClientRect(); return [(ev.clientX - r.left) * NW / r.width, (ev.clientY - r.top) * NH / r.height]; };
  nc.addEventListener('pointerdown', (ev) => { ndraw = true; nc.setPointerCapture(ev.pointerId); cur = { ink: nink, size: nsize, pts: [npos(ev)] }; strokes.push(cur); redraw(); A.sfx('marker'); });
  nc.addEventListener('pointermove', (ev) => { if (!ndraw) return; cur.pts.push(npos(ev)); redraw(); });
  const nend = () => { ndraw = false; };
  nc.addEventListener('pointerup', nend); nc.addEventListener('pointercancel', nend);
  NOTE_COLORS.forEach(col => { const b = document.createElement('button'); b.style.background = col; b.setAttribute('aria-label', 'Note colour ' + col); b.onclick = () => { ncol = col; markN(); redraw(); A.sfx('click'); }; $('#neCols').append(b); });
  INKS.forEach(col => { const b = document.createElement('button'); b.style.background = col; b.setAttribute('aria-label', 'Ink ' + col); b.onclick = () => { nink = col; markN(); redraw(); A.sfx('click'); }; $('#nePens').append(b); });
  const markN = () => { [...$('#neCols').children].forEach((b, i) => b.classList.toggle('on', NOTE_COLORS[i] === ncol)); [...$('#nePens').children].forEach((b, i) => b.classList.toggle('on', INKS[i] === nink)); };
  $('#neSize').oninput = (e) => { nsize = +e.target.value; };
  $('#neType').onclick = () => { ntext = $('#neText').value.trim(); redraw(); A.sfx('marker'); };
  $('#neText').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ntext = e.target.value.trim(); redraw(); } });
  $('#neClear').onclick = () => { strokes = []; ntext = ''; $('#neText').value = ''; redraw(); A.sfx('paper', 0.4); };
  function openEditor() { strokes = []; ntext = ''; $('#neText').value = ''; markN(); redraw(); ed.classList.add('open'); $('#neHint').textContent = api ? 'Everyone who visits will see it, forever.' : 'Saved on this device (the shared board is not connected yet).'; }
  $('#bPin').onclick = () => { ed.classList.contains('open') ? ed.classList.remove('open') : openEditor(); A.sfx('click'); };
  $('#nePost').onclick = async () => {
    if (!strokes.length && !ntext) { toast('Write or draw something first'); return; }
    let lastT = 0; try { lastT = +localStorage.getItem('deskNoteT') || 0; } catch (e) {}
    if (Date.now() - lastT < 20000) { toast('One note at a time. Try again in a few seconds.'); return; }
    const [x, y] = freeSpot(), n = { img: nc.toDataURL('image/jpeg', 0.72), color: ncol, x, y, rot: Math.round((Math.random() * 12 - 6) * 10) / 10, t: Date.now() };
    $('#nePost').disabled = true;
    try { await saveNote(n); try { localStorage.setItem('deskNoteT', String(Date.now())); } catch (e) {} compose(); ed.classList.remove('open'); A.sfx('paper', 0.8); toast(api ? '📌 Pinned. Everyone can see it now.' : '📌 Pinned on this device.'); }
    catch (e) { toast('Could not pin the note. Check the connection.'); }
    $('#nePost').disabled = false;
  };

  return {
    mount(host) { c.dataset.live = '1'; c.style.cssText = 'width:100%;height:auto;display:block;touch-action:none;cursor:crosshair;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35)'; host.innerHTML = ''; host.append(c); refresh(); },
    unmount() { delete c.dataset.live; },
    openEditor
  };
}
