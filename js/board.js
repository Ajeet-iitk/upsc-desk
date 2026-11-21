// A small whiteboard: hand-drawn UPSC plan, doodles, sticky notes and clips. You can draw on it too.
const FONT = '"Segoe Print","Bradley Hand","Comic Sans MS","Chalkboard SE",cursive';

function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

export function drawArt(g, w, h) {
  const r = rng(42), j = (n) => (r() - 0.5) * n;
  g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, w, h);
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
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(wd / 2 - 38, -10, 76, 22); // tape
    lines.forEach((t, i) => text(t, 14, 42 + i * 34, 27, ink)); g.restore();
  };

  // title
  text('UPSC ROADMAP', w / 2, 92, 76, '#1d4ed8', -0.02, 'center'); wavy(w / 2 - 280, 112, 560, '#1d4ed8');
  star(150, 70, 30, '#ea580c'); star(w - 150, 72, 26, '#16a34a'); star(w - 210, 40, 14, '#dc2626');

  // topic checklist
  text('TOPICS', 70, 190, 46, '#dc2626'); wavy(70, 206, 170, '#dc2626');
  [['Polity', 1], ['History', 1], ['Geography', 0], ['Economy', 0], ['Environment', 0], ['Ethics', 0], ['CSAT', 1], ['Current Affairs', 0]].forEach(([t, done], i) => {
    const y = 262 + i * 52; g.strokeStyle = '#111827'; g.lineWidth = 3.5; g.strokeRect(70 + j(2), y - 28 + j(2), 30, 30);
    if (done) { g.strokeStyle = '#16a34a'; g.lineWidth = 6; g.beginPath(); g.moveTo(74, y - 12); g.lineTo(86, y); g.lineTo(112, y - 36); g.stroke(); }
    text(t, 120, y, 36, done ? '#6b7280' : '#111827'); if (done) line(118, y - 12, 118 + t.length * 17, y - 12, '#6b7280', 3);
  });

  // mind map
  circle(w / 2 + 40, 360, 78, '#dc2626', 5); text('UPSC', w / 2 + 40, 372, 44, '#dc2626', 0, 'center');
  [['Prelims', w / 2 - 110, 250, '#1d4ed8'], ['Mains', w / 2 + 200, 250, '#16a34a'], ['Interview', w / 2 + 40, 520, '#7c3aed']].forEach(([t, x, y, c]) => {
    circle(x, y, 56, c, 4); text(t, x, y + 10, 30, c, 0, 'center');
  });
  arrow(w / 2 - 6, 305, w / 2 - 80, 285, '#1d4ed8'); arrow(w / 2 + 100, 308, w / 2 + 160, 285, '#16a34a'); arrow(w / 2 + 40, 440, w / 2 + 40, 462, '#7c3aed');
  text('Answer writing daily!', w / 2 - 20, 600, 34, '#ea580c', -0.03, 'center'); wavy(w / 2 - 200, 616, 360, '#ea580c');

  // doodles: bulb, cup, clock, bars, heart, spiral
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

  // timeline
  arrow(520, h - 142, 790, h - 142, '#374151'); ['Jan', 'Prelims', 'Mains'].forEach((t, i) => { circle(560 + i * 105, h - 142, 7, '#374151', 3, '#374151'); text(t, 560 + i * 105, h - 162, 22, '#374151', 0, 'center'); });

  // sticky notes + clips + magnets
  note(w - 330, 60, 210, 150, '#fde047', 0.05, ['Revise', 'Art. 14 to 32', 'before Sunday']);
  note(300, h - 235, 200, 140, '#f9a8d4', -0.06, ['The Hindu', 'at 7 AM', 'no excuses']);
  note(w - 280, h - 260, 190, 130, '#86efac', 0.04, ['Mock test', 'Sunday 10 AM']);
  note(24, 250 + 8 * 52 - 20, 150, 110, '#93c5fd', -0.03, ['150 words', 'a day']);
  clip(w - 60, 48, 0.4); clip(240, h - 250, -0.3); clip(w / 2 + 330, 160, 0.2);
  [['#dc2626', 54, 54], ['#2563eb', w - 54, h - 54]].forEach(([c, x, y]) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, 16, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(x - 5, y - 5, 5, 0, 7); g.fill(); });
}

/* ---------- drawing on the board ---------- */
export function setupBoard(tex, A) {
  const c = tex.c, g = tex.g, KEY = 'deskBoard';
  let color = '#1d4ed8', size = 5, erase = false, drawing = false, last = null;
  try { const d = localStorage.getItem(KEY); if (d) { const im = new Image(); im.onload = () => { g.drawImage(im, 0, 0); tex.tex.needsUpdate = true; }; im.src = d; } } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, c.toDataURL('image/jpeg', 0.7)); } catch (e) {} };
  const pos = (ev) => { const r = c.getBoundingClientRect(); return { x: (ev.clientX - r.left) * c.width / r.width, y: (ev.clientY - r.top) * c.height / r.height }; };
  c.addEventListener('pointerdown', (ev) => { if (!c.dataset.live) return; drawing = true; last = pos(ev); c.setPointerCapture(ev.pointerId); dot(last); A.sfx('marker'); });
  c.addEventListener('pointermove', (ev) => { if (!drawing) return; const p = pos(ev); stroke(last, p); last = p; });
  const end = () => { if (drawing) { drawing = false; save(); } };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  const style = () => { g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = erase ? '#fbfbf8' : color; g.fillStyle = g.strokeStyle; g.lineWidth = erase ? size * 4 : size; };
  const dot = (p) => { style(); g.beginPath(); g.arc(p.x, p.y, g.lineWidth / 2, 0, 7); g.fill(); tex.tex.needsUpdate = true; };
  const stroke = (a, b) => { style(); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); tex.tex.needsUpdate = true; };

  document.querySelectorAll('#boardTools [data-col]').forEach(b => { b.style.background = b.dataset.col; b.onclick = () => { color = b.dataset.col; erase = false; mark(); A.sfx('click'); }; });
  const mark = () => { document.querySelectorAll('#boardTools [data-col]').forEach(b => b.classList.toggle('on', !erase && b.dataset.col === color)); document.getElementById('bErase').classList.toggle('on', erase); };
  document.getElementById('bErase').onclick = () => { erase = !erase; mark(); A.sfx('click'); };
  document.getElementById('bSize').oninput = (e) => { size = +e.target.value; };
  document.getElementById('bReset').onclick = () => { drawArt(g, c.width, c.height); tex.tex.needsUpdate = true; try { localStorage.removeItem(KEY); } catch (e) {} A.sfx('paper', 0.6); };
  document.getElementById('bSave').onclick = () => { const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'my-upsc-whiteboard.png'; a.click(); };
  mark();
  return {
    mount(host) { c.dataset.live = '1'; c.style.cssText = 'width:100%;height:auto;display:block;touch-action:none;cursor:crosshair;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35)'; host.innerHTML = ''; host.append(c); },
    unmount() { delete c.dataset.live; }
  };
}
