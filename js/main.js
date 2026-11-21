import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import * as A from './audio.js';
import { t, apply, setLang, nextLang } from './i18n.js';
import { BOOKS } from './books.js';
import { createBirds } from './birds.js';
import { drawArt, setupBoard } from './board.js';
import { initMusicPanel } from './musicpanel.js';
import { initGadgets, resetPhone, buildNews } from './gadgets.js';
import { initOS, openOS, closeOS, isOpen as osOpen, showApp } from './os.js';

const $ = (s) => document.querySelector(s);
const V3 = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SET0 = { wall: '#d9cdb8', curtain: '#e9d9b8', desk: '#ffffff', floor: '#3a2b22', sheer: 0.95, autohide: true, low: false, master: 0.9 };
const SET = { ...SET0 };
try { Object.assign(SET, JSON.parse(localStorage.getItem('deskSettings') || '{}')); } catch (e) {}

/* ================= renderer / scene ================= */
const canvas = $('#scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('.intro-card p').textContent = 'WebGL is not available in this browser.';
  throw e;
}
const small = Math.min(innerWidth, innerHeight) < 700;
renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#150f0c');
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

/* ================= helpers ================= */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); if (draw) draw(g, w, h);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { c, g, w, h, tex };
}
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
const hex = (c) => '#' + c.getHexString();
const rgba = (c, a) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/* ================= physics world ================= */
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
world.allowSleep = false;
world.solver.iterations = 14;
world.defaultContactMaterial.friction = 0.45;
world.defaultContactMaterial.restitution = 0.15;

function staticBox(hx, hy, hz, x, y, z, q) {
  const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), position: new CANNON.Vec3(x, y, z) });
  if (q) b.quaternion.copy(q);
  world.addBody(b); return b;
}
staticBox(4.5, 0.15, 2.2, 0, -0.15, 0); // desk top
{ // invisible walls: back + sides keep things on the desk; the front is open
  const mk = (px, py, pz, ax, ang) => { const b = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), position: new CANNON.Vec3(px, py, pz) }); b.quaternion.setFromAxisAngle(new CANNON.Vec3(...ax), ang); world.addBody(b); };
  mk(0, 0, -2.12, [0, 1, 0], 0);
  mk(-4.35, 0, 0, [0, 1, 0], Math.PI / 2);
  mk(4.35, 0, 0, [0, 1, 0], -Math.PI / 2);
}

/* ================= items (pickable things) ================= */
const items = [], pickRoots = [];
function addItem(o) {
  o.last = 0;
  o.root.userData.item = o;
  o.root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  scene.add(o.root); pickRoots.push(o.root); items.push(o);
  if (o.body) {
    world.addBody(o.body);
    o.home = { p: o.body.position.clone(), q: o.body.quaternion.clone() };
    o.body.addEventListener('collide', (e) => {
      if (!ready) return;
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal()), now = performance.now();
      if (v > 1.4 && now - o.last > 90) { o.last = now; A.sfx(o.sfx || 'wood', Math.min(1, v / 12)); }
    });
  }
  return o;
}
function removeItem(o) {
  scene.remove(o.root); const i = items.indexOf(o); if (i >= 0) items.splice(i, 1);
  const j = pickRoots.indexOf(o.root); if (j >= 0) pickRoots.splice(j, 1);
}
function dyn(shape, x, y, z, mass, yaw = 0) {
  const b = new CANNON.Body({ mass, shape, position: new CANNON.Vec3(x, y, z), linearDamping: 0.12, angularDamping: 0.3 });
  b.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw); return b;
}

/* ---------- room: desk, wall ---------- */
const wood = canvasTex(1024, 512, (g, w, h) => {
  g.fillStyle = '#8b5a32'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 320; i++) {
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,20,5' : '210,150,90'},${rand(0.04, 0.14)})`; g.lineWidth = rand(0.6, 3);
    const y = rand(0, h), a = rand(2, 8); g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * a); g.stroke();
  }
  g.fillStyle = 'rgba(30,15,5,.55)'; for (let x = 0; x < w; x += 256) g.fillRect(x, 0, 3, h);
});
wood.tex.wrapS = wood.tex.wrapT = THREE.RepeatWrapping; wood.tex.repeat.set(1.6, 1);
const desk = new THREE.Group();
desk.add(mesh(new THREE.BoxGeometry(9, 0.3, 4.4), std('#ffffff', { map: wood.tex, roughness: 0.55 }), 0, -0.15, 0));
[[-4.2, 1.9], [4.2, 1.9], [-4.2, -1.9], [4.2, -1.9]].forEach(([x, z]) => desk.add(mesh(new THREE.BoxGeometry(0.3, 3.6, 0.3), std('#5a3a20'), x, -2.1, z)));
scene.add(desk);

const wall = mesh(new THREE.PlaneGeometry(60, 22), std('#d9cdb8', { roughness: 0.95 }), 0, 5, -2.25);
wall.castShadow = false; scene.add(wall);
const skirting = mesh(new THREE.BoxGeometry(60, 0.5, 0.12), std('#efe7d8'), 0, -0.05, -2.2); skirting.castShadow = false; scene.add(skirting);
const shells = [];
{ // the rest of the room, for first-person view
  const shell = (w, h, x, y, z, ry, rx, color) => { const m = mesh(new THREE.PlaneGeometry(w, h), std(color, { roughness: 0.95 }), x, y, z); m.rotation.y = ry; m.rotation.x = rx; m.castShadow = false; scene.add(m); shells.push([m, color]); };
  shell(40, 30, 0, -3.9, 0, 0, -Math.PI / 2, '#3a2b22'); shell(40, 30, 0, 6.0, 0, 0, Math.PI / 2, '#e9e1d2');
  shell(30, 22, -9, 5, 0, Math.PI / 2, 0, '#d3c7b2'); shell(30, 22, 9, 5, 0, -Math.PI / 2, 0, '#d3c7b2'); shell(40, 22, 0, 5, 13, Math.PI, 0, '#cfc3ae');
  const shelf = new THREE.Group(); shelf.position.set(-8.55, 0, 3.5);
  shelf.add(mesh(new THREE.BoxGeometry(0.5, 6.2, 4.6), std('#5a3b22'), 0, 2.5, 0));
  const bk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.9, 0.18), std('#ffffff', { roughness: 0.8 }), 4 * 18), m4 = new THREE.Matrix4(), col = new THREE.Color();
  let n = 0; for (let r = 0; r < 4; r++) for (let c = 0; c < 18; c++) { const hh = rand(0.75, 1.05); m4.compose(new V3(0.3, 0.75 + r * 1.3 + (hh - 0.9) * 0.45, -2 + c * 0.23), new THREE.Quaternion(), new V3(1, hh, 1)); bk.setMatrixAt(n, m4); bk.setColorAt(n++, col.setHSL(rand(0, 1), 0.5, 0.38)); }
  shelf.add(bk); scene.add(shelf);
}

/* ---------- window: live sky, opening sashes, curtains ---------- */
const sky = canvasTex(512, 400);
let winOpen = false, winK = 0, skySince = 0, wave = 0, curtainDrag = null;
let weather = 'auto', flash = 0, bolt = null, boltT = 5, fanLvl = 0, fanK = 0, fanAngle = 0;
const wx = { fog: 0, rain: 0, oc: 0 };
const fw = [], flock = Array.from({ length: 5 }, () => ({ x: Math.random(), y: rand(0.12, 0.45), v: rand(0.03, 0.07), p: rand(0, 6) }));
function burst(x, y) { const n = 28; fw.push({ x, y, age: 0, hue: rand(0, 360), parts: Array.from({ length: n }, (_, i) => ({ a: i / n * 6.283 + rand(-0.1, 0.1), s: rand(40, 95) })) }); A.sfx('pop', 0.7); }
const skyMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.2), new THREE.MeshBasicMaterial({ map: sky.tex, toneMapped: false }));
skyMesh.position.set(-2.7, 3.5, -2.215);
addItem({ id: 'outside', root: skyMesh, onClick: (h) => {
  if (!h || !h.uv) return; const u = h.uv.x, v = 1 - h.uv.y;
  if (Math.hypot(u - cur.celX, v - cur.celY) < 0.1) { const o = ['morning', 'golden', 'night']; setTime(o[(o.indexOf(todName) + 1) % 3]); } else burst(u * sky.w, v * sky.h);
} });
skyMesh.castShadow = false;
const win = new THREE.Group(); win.position.set(-2.7, 3.5, -2.2);
{
  const fm = std('#5a3b22', { roughness: 0.7 });
  [[3.0, 0.16, 0, 1.18], [3.0, 0.16, 0, -1.18], [0.16, 2.5, -1.46, 0], [0.16, 2.5, 1.46, 0]].forEach(([w, h, x, y]) => win.add(mesh(new THREE.BoxGeometry(w, h, 0.14), fm, x, y, 0.05)));
  win.add(mesh(new THREE.BoxGeometry(3.3, 0.12, 0.5), fm, 0, -1.3, 0.22));
}
function makeSash(side) {
  const hinge = new THREE.Group(); hinge.position.set(side * 1.4, 0, 0.1);
  const fm = std('#6a4a2c', { roughness: 0.7 }), sg = new THREE.Group(); sg.position.x = -side * 0.7;
  [[1.4, 0.1, 0, 1.05], [1.4, 0.1, 0, -1.05], [0.1, 2.2, 0.65, 0], [0.1, 2.2, -0.65, 0], [1.4, 0.05, 0, 0.1]].forEach(([w, h, x, y]) => sg.add(mesh(new THREE.BoxGeometry(w, h, 0.07), fm, x, y, 0)));
  sg.add(new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.1), new THREE.MeshPhysicalMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.1, roughness: 0.05, depthWrite: false })));
  sg.add(mesh(new THREE.SphereGeometry(0.05, 10, 10), std('#d8b45a', { metalness: 0.8, roughness: 0.3 }), -side * 0.58, 0, 0.07));
  hinge.add(sg); return hinge;
}
const sashL = makeSash(-1), sashR = makeSash(1); win.add(sashL, sashR);
// raindrops that cling to the glass and slide down, leaving trails
const dropC = canvasTex(256, 200), drops = [];
const dropMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.0), new THREE.MeshBasicMaterial({ map: dropC.tex, transparent: true, depthWrite: false, opacity: 0 }));
dropMesh.position.set(-2.7, 3.5, -2.2 + 0.15); dropMesh.visible = false; scene.add(dropMesh);
function updateDrops(dt) {
  const op = clamp(wx.rain * 1.6, 0, 1) * (1 - winK); dropMesh.material.opacity = op; dropMesh.visible = op > 0.01;
  if (!dropMesh.visible && !drops.length) return;
  const g = dropC.g, w = 256, h = 200;
  g.clearRect(0, 0, w, h);
  if (Math.random() < wx.rain * dt * 14 && drops.length < 60) drops.push({ x: rand(8, w - 8), y: rand(0, h * 0.7), r: rand(0.7, 1.4), vy: 0, grow: rand(0.35, 0.9), trail: [] });
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (!d.vy) { d.r += d.grow * dt * Math.max(wx.rain, 0.2); if (d.r > 2.3) d.vy = rand(25, 70); }
    else { d.trail.push([d.x, d.y]); if (d.trail.length > 26) d.trail.shift(); d.y += d.vy * dt; d.vy *= 1 + dt * 0.5; d.x += Math.sin(d.y * 0.2) * 0.12; }
    if (d.trail.length > 1) { g.lineCap = 'round'; for (let t = 1; t < d.trail.length; t++) { g.strokeStyle = `rgba(200,222,250,${0.16 * t / d.trail.length})`; g.lineWidth = d.r * 0.55 * (t / d.trail.length) + 0.3; g.beginPath(); g.moveTo(d.trail[t - 1][0], d.trail[t - 1][1]); g.lineTo(d.trail[t][0], d.trail[t][1]); g.stroke(); } }
    g.fillStyle = 'rgba(200,222,250,0.38)'; g.beginPath(); g.arc(d.x, d.y, d.r, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.3, 0, 7); g.fill();
    if (d.y > h + 6 || (wx.rain < 0.03 && Math.random() < 0.05)) drops.splice(i, 1);
  }
  dropC.tex.needsUpdate = true;
}
function strike() {
  const pts = []; let x = rand(60, 450), y = 0; while (y < 260) { pts.push([x, y]); x += rand(-26, 26); y += rand(18, 38); }
  bolt = { pts, t0: performance.now() };
  flash = 1; setTimeout(() => { flash = 0.7; }, 90); setTimeout(() => { flash = 1; }, 170);
  setTimeout(() => A.sfx('thunder', 1), rand(500, 2000));
}
win.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 4.4, 8), std('#b8963f', { metalness: 0.8, roughness: 0.3 }), 0, 1.4, 0.32)); win.children[win.children.length - 1].rotation.z = Math.PI / 2;
const curtains = [-1, 1].map((sd, k) => {
  const geo = new THREE.PlaneGeometry(1.9, 2.6, 22, 14); geo.translate(-sd * 0.95, -1.3, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#e9d9b8', roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }));
  m.position.set(-2.7 + sd * 1.8, 3.5 + 1.34, -2.2 + 0.34 + k * 0.01); m.userData.base = geo.attributes.position.array.slice();
  const c = addItem({ id: 'curtain', root: m, onClick: () => { c.goal = c.goal > 0.5 ? 0 : 1; wave += 1.2; A.sfx('paper', 0.5); } });
  c.sd = sd; c.k = k; c.open = 0.85; c.goal = 0.85; return c;
});
function updateWindow(dt, time) {
  winK += ((winOpen ? 1 : 0) - winK) * (1 - Math.exp(-dt * 3.2));
  sashL.rotation.y = -winK * 1.35; sashR.rotation.y = winK * 1.35;
  wave = Math.min(2.2, wave) * Math.exp(-dt * 1.4);
  const amp = 0.03 + winK * 0.2 + wave * 0.14 + fanK * 0.07;
  curtains.forEach(c => {
    c.open += (c.goal - c.open) * (1 - Math.exp(-dt * 4)); const m = c.root; m.scale.x = 1 - 0.8 * c.open;
    const pos = m.geometry.attributes.position, base = m.userData.base, pleat = 0.025 + 0.11 * c.open;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], f = -y / 2.6;
      pos.array[i * 3 + 2] = Math.sin(time * 1.8 + y * 2.2 + c.k) * amp * f * 1.2 + winK * 0.12 * f + Math.sin(x * 16 + c.k) * pleat * (0.3 + 0.7 * f);
      pos.array[i * 3] = x + Math.sin(time * 1.3 + y * 1.5 + c.k) * amp * 0.4 * f;
    }
    pos.needsUpdate = true; if (((time * 20) | 0) % 3 === 0) m.geometry.computeVertexNormals();
  });
}
function setWindow(open, quiet) {
  winOpen = open; A.setWindow(open); $('#winBtn').classList.toggle('on', open);
  if (!quiet) { A.sfx('whoosh'); toast(t(open ? 't_win_open' : 't_win_close')); if (open && todName === 'morning') setTimeout(() => { if (winOpen) toast(t('t_birds')); }, 2800); }
}
addItem({ id: 'window', root: win, onClick: () => setWindow(!winOpen) });

/* ---------- posters + clock ---------- */
function poster1() {
  return canvasTex(512, 690, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1d2b6b'); gr.addColorStop(1, '#5b2a7a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffd479'; g.lineWidth = 6; g.strokeRect(18, 18, w - 36, h - 36);
    g.fillStyle = '#ffd479'; g.textAlign = 'center'; g.font = 'bold 120px Georgia'; g.fillText('UPSC', w / 2, 160);
    g.font = '28px Georgia'; g.fillStyle = '#fff'; g.fillText('IAS · IPS · IFS', w / 2, 210);
    g.save(); g.translate(w / 2, 400); g.strokeStyle = '#7fb4ff'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 100, 0, 7); g.stroke();
    for (let i = 0; i < 24; i++) { g.rotate(Math.PI / 12); g.beginPath(); g.moveTo(0, 0); g.lineTo(100, 0); g.lineWidth = 3; g.stroke(); } g.restore();
    g.fillStyle = '#fff'; g.font = 'italic bold 40px Georgia'; g.fillText('Never give up.', w / 2, 590);
    g.font = '22px Georgia'; g.fillStyle = '#ffd479'; g.fillText('Satyameva Jayate', w / 2, 630);
  });
}
function poster2() {
  return canvasTex(540, 360, (g, w, h) => {
    g.fillStyle = '#f7f0dc'; g.fillRect(0, 0, w, h); g.fillStyle = '#c0392b'; g.fillRect(0, 0, w, 58);
    g.fillStyle = '#fff'; g.font = 'bold 32px Georgia'; g.textAlign = 'center'; g.fillText('DAILY ROUTINE', w / 2, 40);
    g.textAlign = 'left'; g.fillStyle = '#2b2418'; g.font = '22px Georgia';
    [['05:30', 'Wake · Revise'], ['07:00', 'Newspaper (The Hindu)'], ['09:00', 'GS Study'], ['14:00', 'Answer Writing'], ['19:00', 'Current Affairs'], ['22:00', 'Revision']].forEach((r, i) => {
      g.fillStyle = '#c0392b'; g.fillText(r[0], 28, 96 + i * 42); g.fillStyle = '#2b2418'; g.fillText(r[1], 130, 96 + i * 42);
    });
  });
}
const quote = () => { const q = t('quotes'); toast(q[(Math.random() * q.length) | 0]); A.sfx('paper', 0.5); };
function addPoster(tex, w, h, x, y, rot) {
  const g = new THREE.Group(); g.position.set(x, y, -2.22); g.rotation.z = rot;
  g.add(mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.04), std('#2a1d12'), 0, 0, 0));
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })));
  g.children[1].position.z = 0.025; g.children[1].receiveShadow = true;
  addItem({ id: 'poster', root: g, onClick: quote });
}
addPoster(poster1().tex, 1.7, 2.3, 2.9, 3.55, 0.03);
addPoster(poster2().tex, 1.9, 1.27, 0.35, 3.95, -0.02);

const clock = canvasTex(256, 256); let lastSec = -1;
{
  const g = new THREE.Group(); g.position.set(5.0, 3.7, -2.2);
  g.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 40), std('#3a2a1c'), 0, 0, 0.04)); g.children[0].rotation.x = Math.PI / 2;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.54, 40), new THREE.MeshBasicMaterial({ map: clock.tex })); face.position.z = 0.1; g.add(face);
  addItem({ id: 'clock', root: g, onClick: () => toast(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ⏰') });
}
function drawClock() {
  const d = new Date(); if (d.getSeconds() === lastSec) return; lastSec = d.getSeconds();
  const g = clock.g; g.clearRect(0, 0, 256, 256); g.fillStyle = '#fbf6e9'; g.fillRect(0, 0, 256, 256);
  g.translate(128, 128); g.strokeStyle = '#2b2418';
  for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.lineWidth = 5; g.beginPath(); g.moveTo(0, -112); g.lineTo(0, -96); g.stroke(); }
  const hand = (a, len, wd, col) => { g.save(); g.rotate(a); g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 10); g.lineTo(0, -len); g.stroke(); g.restore(); };
  hand(((d.getHours() % 12) + d.getMinutes() / 60) * Math.PI / 6, 62, 9, '#2b2418'); hand((d.getMinutes() + d.getSeconds() / 60) * Math.PI / 30, 92, 6, '#2b2418'); hand(d.getSeconds() * Math.PI / 30, 100, 3, '#c0392b');
  g.setTransform(1, 0, 0, 1, 0, 0); clock.tex.needsUpdate = true;
}

/* ---------- laptop ---------- */
const laptop = new THREE.Group(); laptop.position.set(0, 0, -0.6);
const alu = std('#a7adb6', { metalness: 0.85, roughness: 0.32 });
laptop.add(mesh(new THREE.BoxGeometry(2.4, 0.08, 1.6), alu, 0, 0.04, 0));
{
  const keys = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.03, 0.13), std('#1c1f26', { roughness: 0.5 }), 14 * 5);
  const m4 = new THREE.Matrix4(); let n = 0;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 14; c++) { m4.setPosition(-1.0 + c * 0.154, 0.095, -0.5 + r * 0.16); keys.setMatrixAt(n++, m4); }
  keys.castShadow = true; laptop.add(keys);
  laptop.add(mesh(new THREE.BoxGeometry(0.85, 0.01, 0.5), std('#8c929b', { metalness: 0.7, roughness: 0.4 }), 0, 0.085, 0.52));
}
const hinge = new THREE.Group(); hinge.position.set(0, 0.08, -0.8); hinge.rotation.x = -0.2; laptop.add(hinge);
const bezel = mesh(new THREE.BoxGeometry(2.4, 1.5, 0.06), std('#111317', { metalness: 0.6, roughness: 0.4 }), 0, 0.75, 0); hinge.add(bezel);
const screenTex = canvasTex(896, 536, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#1c2a5c'); gr.addColorStop(0.55, '#3b1f55'); gr.addColorStop(1, '#7a2f4a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, 0, w, 34); g.fillStyle = '#ffd479'; g.font = 'bold 20px sans-serif'; g.fillText('◆ AjeetOS', 14, 24);
  g.fillStyle = 'rgba(255,255,255,.95)'; g.textAlign = 'center'; g.font = 'bold 54px sans-serif'; g.fillText('Aspirant Search', w / 2, 230);
  g.fillStyle = 'rgba(255,255,255,.18)'; roundRect(g, w / 2 - 260, 262, 520, 54, 27); g.fill();
  g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '24px sans-serif'; g.fillText('🔍  click to open the laptop…', w / 2, 298);
  ['🌐', '📝', '✅'].forEach((e, i) => { g.fillStyle = 'rgba(255,255,255,.16)'; roundRect(g, w / 2 - 130 + i * 90, h - 90, 70, 60, 16); g.fill(); g.fillStyle = '#fff'; g.font = '34px sans-serif'; g.fillText(e, w / 2 - 95 + i * 90, h - 48); });
});
const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.24, 1.34), new THREE.MeshBasicMaterial({ map: screenTex.tex, toneMapped: false }));
screenMesh.position.set(0, 0.76, 0.032); hinge.add(screenMesh);
const screenGlow = new THREE.PointLight('#9cc3ff', 0, 7, 1.6); screenGlow.position.set(0, 1.3, 0.4); laptop.add(screenGlow);
addItem({ id: 'laptop', root: laptop, onClick: () => zoomLaptop() });
laptop.updateMatrixWorld(true);
staticBox(1.2, 0.04, 0.8, 0, 0.04, -0.6);
{
  const p = new V3(), q = new THREE.Quaternion(); bezel.getWorldPosition(p); bezel.getWorldQuaternion(q);
  staticBox(1.2, 0.75, 0.03, p.x, p.y, p.z, new CANNON.Quaternion(q.x, q.y, q.z, q.w));
}

/* ---------- lamp ---------- */
const lamp = new THREE.Group(); lamp.position.set(3.4, 0, -1.45);
const metal = std('#2a2d34', { metalness: 0.7, roughness: 0.35 });
lamp.add(mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.14, 32), metal, 0, 0.07, 0));
lamp.add(mesh(new THREE.BoxGeometry(0.16, 0.08, 0.1), std('#d94a3a'), 0.0, 0.17, 0.32));
lamp.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.98, 12), metal, 0, 1.13, 0));
lamp.add(mesh(new THREE.SphereGeometry(0.09, 16, 16), metal, 0, 2.12, 0));
const armDir = new V3(-0.95, -0.25, 0.3).normalize();
const arm2 = mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.35, 12), metal, 0, 0, 0);
arm2.quaternion.setFromUnitVectors(new V3(0, 1, 0), armDir); arm2.position.copy(new V3(0, 2.12, 0)).addScaledVector(armDir, 0.675); lamp.add(arm2);
const head = new THREE.Group(); head.position.copy(new V3(0, 2.12, 0)).addScaledVector(armDir, 1.35);
head.quaternion.setFromUnitVectors(new V3(0, -1, 0), new V3(-0.5, -1, 0.25).normalize()); lamp.add(head);
const shade = mesh(new THREE.ConeGeometry(0.46, 0.55, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#2f6b57', side: THREE.DoubleSide, metalness: 0.4, roughness: 0.45 }), 0, -0.27, 0); head.add(shade);
const bulbMat = new THREE.MeshBasicMaterial({ color: '#555' });
const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), bulbMat); bulb.position.y = -0.4; head.add(bulb);
const lampLight = new THREE.SpotLight('#ffc67a', 0, 20, 0.9, 0.6, 1.5);
lampLight.castShadow = true; lampLight.shadow.mapSize.set(small ? 512 : 1024, small ? 512 : 1024); lampLight.shadow.bias = -0.0004; lampLight.shadow.normalBias = 0.02;
scene.add(lampLight); scene.add(lampLight.target); lampLight.target.position.set(0.4, 0, -0.2);
addItem({ id: 'lamp', root: lamp, onClick: () => toggleLamp() });
lamp.updateMatrixWorld(true);
staticBox(0.5, 0.1, 0.5, 3.4, 0.1, -1.45);
const lampAim = new V3(0.4, 0, -0.2), lampAimGoal = lampAim.clone(), _hp = new V3(), _hw = new V3(), _d = new V3();
let lampBright = 1, lampWarm = 0.35, aimingLamp = false;
function updateLampAim(dt) {
  lampAim.lerp(lampAimGoal, 1 - Math.exp(-dt * 9));
  _hw.copy(lamp.position).add(head.position);
  _d.copy(lampAim).sub(_hw).normalize();
  head.quaternion.setFromUnitVectors(new V3(0, -1, 0), _d);
  lamp.updateMatrixWorld(true);
  bulb.getWorldPosition(_hp); lampLight.position.copy(_hp); lampLight.target.position.copy(lampAim);
}
updateLampAim(1);

/* ---------- books ---------- */
function bookLabel(def) {
  return canvasTex(512, 384, (g, w, h) => {
    g.fillStyle = def.color; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,215,130,.9)'; g.lineWidth = 6; g.strokeRect(24, 24, w - 48, h - 48);
    g.fillStyle = '#ffe3a3'; g.textAlign = 'center'; g.font = 'bold 56px Georgia'; g.fillText(def.title.split(' ')[0], w / 2, 180);
    g.font = '34px Georgia'; g.fillText(def.title.split(' ').slice(1).join(' ') || 'Notes', w / 2, 230);
    g.font = '22px Georgia'; g.fillText('UPSC · CSE', w / 2, 320);
  }).tex;
}
function makeBook(def, x, y, z, yaw) {
  const g = new THREE.Group();
  const cov = std(def.color, { roughness: 0.7 });
  g.add(mesh(new THREE.BoxGeometry(1.5, 0.03, 1.1), cov, 0, -0.085, 0));
  g.add(mesh(new THREE.BoxGeometry(1.5, 0.03, 1.1), [cov, cov, std('#ffffff', { map: bookLabel(def), roughness: 0.6 }), cov, cov, cov], 0, 0.085, 0));
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.2, 1.1), cov, -0.725, 0, 0));
  g.add(mesh(new THREE.BoxGeometry(1.42, 0.14, 1.04), std('#f4ecd6', { roughness: 0.9 }), 0.02, 0, 0));
  const body = dyn(new CANNON.Box(new CANNON.Vec3(0.75, 0.1, 0.55)), x, y, z, 1.5, yaw);
  addItem({ id: def.id, root: g, body, sfx: 'paper', onClick: () => { A.sfx('paper', 0.6); openBook(def.id); } });
}
BOOKS.slice(0, 3).forEach((d, i) => makeBook(d, -3.1 + rand(-0.06, 0.06), 0.12 + i * 0.22, -0.85, rand(-0.25, 0.25)));
BOOKS.slice(3).forEach((d, i) => makeBook(d, -3.0 + rand(-0.06, 0.06), 0.12 + i * 0.22, 0.95, rand(-0.25, 0.25)));

/* ---------- notebooks ("copies") ---------- */
function makeNotebook(color, x, z, yaw, label, onClick) {
  const g = new THREE.Group();
  const tex = canvasTex(256, 360, (c, w, h) => { c.fillStyle = color; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.fillRect(30, 60, w - 60, 90); c.fillStyle = '#222'; c.font = 'bold 36px Georgia'; c.textAlign = 'center'; c.fillText(label, w / 2, 118); c.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 12; i++) c.fillRect(0, 12 + i * 30, 14, 10); }).tex;
  const cov = std(color, { roughness: 0.75 });
  g.add(mesh(new THREE.BoxGeometry(1.1, 0.07, 1.5), [cov, cov, std('#fff', { map: tex }), cov, cov, cov], 0, 0, 0));
  g.add(mesh(new THREE.BoxGeometry(1.04, 0.04, 1.44), std('#f7f1df'), 0.02, -0.01, 0));
  g.children[1].position.y = 0.005;
  const body = dyn(new CANNON.Box(new CANNON.Vec3(0.55, 0.04, 0.75)), x, 0.2, z, 0.5, yaw);
  addItem({ id: 'nb-' + label, root: g, body, sfx: 'paper', onClick });
}
makeNotebook('#c0473a', -1.9, 1.15, 0.25, 'FOCUS', () => openPomo());
makeNotebook('#2e6fb0', -1.1, 1.6, -0.2, 'NOTES', () => { zoomLaptop('notes'); });

/* ---------- water bottle ---------- */
{
  const g = new THREE.Group();
  const glass = new THREE.MeshPhysicalMaterial({ color: '#9bd8ff', transparent: true, opacity: 0.42, roughness: 0.08, clearcoat: 1, depthWrite: false });
  g.add(mesh(new THREE.CylinderGeometry(0.27, 0.27, 1.1, 28), glass, 0, -0.2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.8, 24), std('#2f9bff', { transparent: true, opacity: 0.6, roughness: 0.1 }), 0, -0.34, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.27, 0.2, 24), glass, 0, 0.45, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.14, 20), std('#0d3b7a'), 0, 0.62, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.34, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide }), 0, -0.2, 0));
  addItem({ id: 'bottle', root: g, body: dyn(new CANNON.Cylinder(0.27, 0.27, 1.44, 16), 1.6, 0.75, -1.45, 1), sfx: 'plastic', lift: 0.3, onClick: () => A.sfx('plastic', 0.4) });
}
/* ---------- pen stand ---------- */
{
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.35, 0.32, 0.6, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#2b3a55', side: THREE.DoubleSide, roughness: 0.5, metalness: 0.2 }), 0, 0, 0));
  g.add(mesh(new THREE.CircleGeometry(0.32, 24), std('#1a2236'), 0, -0.29, 0)); g.children[1].rotation.x = -Math.PI / 2;
  ['#e63946', '#2a9d8f', '#f4a261', '#264653', '#e9c46a', '#6a4c93'].forEach((c, i) => {
    const p = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 8), std(c), 0, 0.2, 0);
    const a = i / 6 * Math.PI * 2, tilt = rand(0.1, 0.3); p.position.set(Math.cos(a) * 0.12, 0.2, Math.sin(a) * 0.12); p.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt); g.add(p);
  });
  addItem({ id: 'penstand', root: g, body: dyn(new CANNON.Cylinder(0.34, 0.32, 0.6, 14), 2.5, 0.32, -0.25, 0.8), sfx: 'plastic', onClick: () => A.sfx('plastic', 0.4) });
}
/* ---------- Rubik's cube ---------- */
{
  const cols = ['#ffffff', '#ffd500', '#c41e3a', '#ff5800', '#009e60', '#0051ba'];
  const face = (c) => new THREE.MeshStandardMaterial({ roughness: 0.4, map: canvasTex(96, 96, (g, w, h) => { g.fillStyle = '#0b0b0b'; g.fillRect(0, 0, w, h); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { g.fillStyle = Math.random() < 0.4 ? c : cols[(Math.random() * 6) | 0]; roundRect(g, 5 + i * 30, 5 + j * 30, 26, 26, 4); g.fill(); } }).tex });
  const cube = mesh(new THREE.BoxGeometry(0.52, 0.52, 0.52), cols.map(face));
  addItem({ id: 'cube', root: cube, body: dyn(new CANNON.Box(new CANNON.Vec3(0.26, 0.26, 0.26)), 1.2, 0.3, 1.0, 0.6, 0.5), sfx: 'cube', onClick: () => { A.sfx('cube', 0.7); } });
}
/* ---------- glass paperweight ---------- */
{
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.31, 32, 24), new THREE.MeshPhysicalMaterial({ color: '#d6ecff', transparent: true, opacity: 0.5, roughness: 0.03, clearcoat: 1, depthWrite: false }), 0, 0, 0));
  g.add(mesh(new THREE.SphereGeometry(0.12, 16, 12), std('#ff9f1c', { emissive: '#ff6a00', emissiveIntensity: 0.35 }), 0, -0.03, 0));
  addItem({ id: 'weight', root: g, body: dyn(new CANNON.Sphere(0.31), -0.6, 0.35, 1.5, 2.5), sfx: 'glass', onClick: () => A.sfx('glass', 0.6) });
}
/* ---------- chai cup ---------- */
{
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.45, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#f5f1e8', side: THREE.DoubleSide, roughness: 0.25 }), 0, 0, 0));
  g.add(mesh(new THREE.CircleGeometry(0.26, 24), std('#8a4b1f', { roughness: 0.2 }), 0, 0.17, 0)); g.children[1].rotation.x = -Math.PI / 2;
  g.add(mesh(new THREE.CircleGeometry(0.22, 24), std('#f5f1e8'), 0, -0.22, 0)); g.children[2].rotation.x = -Math.PI / 2;
  const h = mesh(new THREE.TorusGeometry(0.13, 0.03, 8, 16), std('#f5f1e8'), 0.34, 0, 0); g.add(h);
  addItem({ id: 'cup', root: g, body: dyn(new CANNON.Cylinder(0.3, 0.22, 0.45, 14), 2.0, 0.24, 0.8, 0.5), sfx: 'ceramic', onClick: () => { A.sfx('ceramic', 0.5); toast('☕ Chai break?'); } });
}

/* ---------- smartphone ---------- */
const phoneTex = canvasTex(256, 512);
function drawPhone() {
  const g = phoneTex.g, d = new Date(), gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#1b2a5c'); gr.addColorStop(1, '#7a2f4a'); g.fillStyle = gr; g.fillRect(0, 0, 256, 512);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 62px sans-serif'; g.fillText(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 128, 150);
  g.font = '20px sans-serif'; g.fillStyle = 'rgba(255,255,255,.8)'; g.fillText(d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }), 128, 185);
  [260, 320, 380].forEach(y => { g.fillStyle = 'rgba(255,255,255,.15)'; roundRect(g, 20, y, 216, 48, 14); g.fill(); });
  g.fillStyle = '#fff'; g.font = '16px sans-serif'; g.textAlign = 'left'; g.fillText('Revision · 6 PM', 34, 290); g.fillText('Daily Aspirant ready', 34, 350); g.fillText('Streak: keep going', 34, 410);
  phoneTex.tex.needsUpdate = true;
}
drawPhone(); setInterval(drawPhone, 30000);
{
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.52, 0.06, 1.08), std('#14161c', { metalness: 0.6, roughness: 0.35 })));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.98), new THREE.MeshBasicMaterial({ map: phoneTex.tex, toneMapped: false })); scr.rotation.x = -Math.PI / 2; scr.position.y = 0.032; g.add(scr);
  addItem({ id: 'phone', root: g, body: dyn(new CANNON.Box(new CANNON.Vec3(0.26, 0.03, 0.54)), 0.4, 0.1, 1.55, 0.3, 0.35), sfx: 'plastic', onClick: () => { A.sfx('click'); openPhoneUI(); } });
}
/* ---------- newspaper ---------- */
{
  const tex = canvasTex(512, 384, (g, w, h) => {
    g.fillStyle = '#e9e3d2'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1a'; g.textAlign = 'center'; g.font = 'bold 44px Georgia'; g.fillText('THE DAILY ASPIRANT', w / 2, 62); g.fillRect(20, 76, w - 40, 3);
    g.font = '13px Georgia'; g.fillText('PRACTICE EDITION · EDITORIAL · FACT FILE', w / 2, 98); g.fillStyle = '#bbb3a0'; g.fillRect(24, 116, 230, 150);
    g.fillStyle = '#1a1a1a'; g.font = 'bold 22px Georgia'; g.textAlign = 'left'; g.fillText('Term of the Day', 270, 138); g.fillStyle = '#8a8372';
    for (let i = 0; i < 9; i++) g.fillRect(270, 152 + i * 13, w - 290 - (i % 3) * 18, 5); for (let i = 0; i < 10; i++) g.fillRect(24, 284 + i * 10, w - 48 - (i % 4) * 30, 4);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(w / 2 - 1, 110, 2, h);
  }).tex;
  const g = new THREE.Group(), top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), sd = std('#e2dccb', { roughness: 0.95 });
  g.add(mesh(new THREE.BoxGeometry(1.6, 0.035, 1.15), [sd, sd, top, sd, sd, sd]));
  addItem({ id: 'news', root: g, body: dyn(new CANNON.Box(new CANNON.Vec3(0.8, 0.02, 0.575)), 3.3, 0.12, 1.7, 0.3, -0.2), sfx: 'paper', onClick: () => { A.sfx('paper', 0.7); openNewsUI(); } });
}
/* ---------- loose pens & a pencil ---------- */
[['#e63946', -0.5, 0.75, 0.5], ['#1d3557', 0.3, 0.65, -0.4], ['#222222', 0.9, 0.5, 1.1], ['#f4c20d', -1.2, 0.5, -0.2]].forEach(([c, x, z, yaw], i) => {
  const g = new THREE.Group(), pencil = i === 3, seg = pencil ? 6 : 14;
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, seg), std(c, { roughness: 0.4 })));
  const tip = mesh(new THREE.ConeGeometry(0.05, 0.16, seg), std(pencil ? '#e9c995' : '#c9ccd1', { metalness: pencil ? 0 : 0.8, roughness: 0.3 }), 0, -0.53, 0); tip.rotation.x = Math.PI; g.add(tip);
  g.add(mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.12, seg), std(pencil ? '#f08fa0' : '#111'), 0, 0.5, 0));
  if (!pencil) g.add(mesh(new THREE.BoxGeometry(0.02, 0.4, 0.03), std('#c9ccd1', { metalness: 0.8 }), 0.055, 0.2, 0));
  const body = dyn(new CANNON.Cylinder(0.05, 0.05, 1.05, 8), x, 0.08, z, 0.1, 0);
  const qz = new CANNON.Quaternion(); qz.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2);
  const qy = new CANNON.Quaternion(); qy.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw); qy.mult(qz, body.quaternion);
  addItem({ id: 'pen' + i, root: g, body, sfx: 'plastic', lift: 0.15, onClick: () => { A.sfx('click'); body.velocity.y += 3.2; body.angularVelocity.set(rand(-1, 1), rand(9, 15) * (Math.random() < 0.5 ? -1 : 1), rand(-1, 1)); } });
});

/* ---------- whiteboard (on the left) ---------- */
const boardTex = canvasTex(1152, 810, drawArt);
const boardCtl = setupBoard(boardTex, A);
{
  const g = new THREE.Group(); g.position.set(-3.4, 0.82, -2.02); g.rotation.x = -0.09;
  const alu = std('#c9ced6', { metalness: 0.7, roughness: 0.35 });
  g.add(mesh(new THREE.BoxGeometry(2.0, 1.45, 0.06), alu, 0, 0, 0));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.335), new THREE.MeshStandardMaterial({ map: boardTex.tex, roughness: 0.3 })); face.position.z = 0.032; g.add(face);
  g.add(mesh(new THREE.BoxGeometry(1.9, 0.05, 0.16), alu, 0, -0.75, 0.1));
  [['#2563eb', -0.5], ['#dc2626', -0.3], ['#16a34a', -0.1]].forEach(([c, x]) => { const m = mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.24, 10), std(c), x, -0.71, 0.14); m.rotation.z = Math.PI / 2; g.add(m); });
  addItem({ id: 'board', root: g, onClick: () => openBoardUI() });
}
staticBox(1.0, 0.75, 0.06, -3.4, 0.82, -2.02);

/* ---------- ceiling fan ---------- */
const fan = new THREE.Group(); fan.position.set(0.4, 6.0, 1.2);
const fanRotor = new THREE.Group(); fanRotor.position.y = -0.72;
{
  const dark = std('#2b2d33', { metalness: 0.6, roughness: 0.4 }), blade = std('#6a4a2c', { roughness: 0.6 });
  fan.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), dark, 0, -0.25, 0));
  fan.add(mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.28, 20), dark, 0, -0.62, 0));
  fan.add(mesh(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#fff3d0', emissive: '#fff0c0', emissiveIntensity: 0.5 }), 0, -0.76, 0));
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group(); arm.rotation.y = i * Math.PI / 2;
    const bl = mesh(new THREE.BoxGeometry(1.3, 0.025, 0.32), blade, 0.9, 0, 0); bl.rotation.z = 0.1; arm.add(bl);
    arm.add(mesh(new THREE.BoxGeometry(0.3, 0.04, 0.08), dark, 0.3, 0.01, 0)); fanRotor.add(arm);
  }
  fan.add(fanRotor);
}
addItem({ id: 'fan', root: fan, onClick: () => cycleFan() });
function cycleFan() { fanLvl = (fanLvl + 1) % 3; A.init(); A.setFan(fanLvl); A.sfx('click'); toast(['Fan off', 'Fan: low', 'Fan: high'][fanLvl]); syncExtras(); }
function lookAtFan() { closeModals(); closeDrawer(); mode = 'desk'; setFP(true, true); pitchG = 0.9; yawG = 0; if (fanLvl === 0) cycleFan(); toast('Look up: the ceiling fan is spinning'); }

/* ---------- desk drawer with surprise items ---------- */
const DR = { x: 2.5, zClosed: 1.625, slide: 1.05, k: 0, goal: 0, spawned: false, nudged: false };
const drawer = new THREE.Group(); drawer.position.set(DR.x, 0, DR.zClosed);
{
  const front = std('#9a6a3a', { roughness: 0.55 }), felt = std('#3a2a20', { roughness: 0.95 }), inner = std('#7a4e2a', { roughness: 0.7 });
  drawer.add(mesh(new THREE.BoxGeometry(1.8, 0.24, 0.05), front, 0, -0.15, 0.6));
  drawer.add(mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), std('#d8b45a', { metalness: 0.85, roughness: 0.3 }), 0, -0.15, 0.65));
  drawer.add(mesh(new THREE.BoxGeometry(1.7, 0.03, 1.15), felt, 0, -0.27, 0));
  [-0.85, 0.85].forEach(x => drawer.add(mesh(new THREE.BoxGeometry(0.03, 0.2, 1.15), inner, x, -0.17, 0)));
  drawer.add(mesh(new THREE.BoxGeometry(1.7, 0.2, 0.03), inner, 0, -0.17, -0.58));
}
addItem({ id: 'drawer', root: drawer, onClick: () => toggleDrawer() });
const drawerBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, position: new CANNON.Vec3(DR.x, 0, DR.zClosed) });
[[0.85, 0.015, 0.575, 0, -0.27, 0], [0.015, 0.1, 0.575, -0.85, -0.17, 0], [0.015, 0.1, 0.575, 0.85, -0.17, 0], [0.85, 0.1, 0.015, 0, -0.17, -0.58], [0.9, 0.12, 0.025, 0, -0.15, 0.6]]
  .forEach(([hx, hy, hz, ox, oy, oz]) => drawerBody.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), new CANNON.Vec3(ox, oy, oz)));
world.addBody(drawerBody);
function dropItem(o) { world.removeBody(o.body); removeItem(o); }
const NOTES = ['Discipline beats motivation.', 'One more answer today.', 'You are closer than yesterday.', 'Revise, then rest.', 'Small steps, every day.', 'Chai first. Then Polity.'];
const SURP = [
  { make: () => { const g = new THREE.Group(); g.add(mesh(new THREE.BoxGeometry(0.5, 0.08, 0.26), std('#4a2415'))); g.add(mesh(new THREE.BoxGeometry(0.42, 0.085, 0.22), std('#c0392b'))); g.add(mesh(new THREE.BoxGeometry(0.3, 0.09, 0.04), std('#f4c20d'))); return { g, shape: new CANNON.Box(new CANNON.Vec3(0.25, 0.04, 0.13)), mass: 0.15, sfx: 'paper', click: (o) => { A.sfx('paper', 0.7); dropItem(o); toast('🍫 Chocolate! Brain fuel +10'); } }; } },
  { make: () => { const g = new THREE.Group(), y = std('#f4c20d', { roughness: 0.4 }); const b = mesh(new THREE.SphereGeometry(0.17, 14, 12), y); b.scale.set(1, 0.85, 1.2); g.add(b); g.add(mesh(new THREE.SphereGeometry(0.1, 12, 10), y, 0, 0.17, 0.12)); const bk = mesh(new THREE.BoxGeometry(0.1, 0.03, 0.08), std('#ff8a00'), 0, 0.16, 0.24); g.add(bk); return { g, shape: new CANNON.Sphere(0.19), mass: 0.12, sfx: 'plastic', click: (o) => { A.sfx('duck'); o.body.velocity.y = 2.5; toast('Quack! Explain it to the duck, then write it.'); } }; } },
  { make: () => { const g = new THREE.Group(), au = std('#d8b45a', { metalness: 0.85, roughness: 0.3 }); const r = mesh(new THREE.TorusGeometry(0.07, 0.022, 8, 14), au, -0.14, 0, 0); r.rotation.x = Math.PI / 2; g.add(r); g.add(mesh(new THREE.BoxGeometry(0.26, 0.03, 0.03), au, 0.04, 0, 0)); g.add(mesh(new THREE.BoxGeometry(0.04, 0.03, 0.07), au, 0.15, 0, 0.03)); return { g, shape: new CANNON.Box(new CANNON.Vec3(0.2, 0.025, 0.08)), mass: 0.08, sfx: 'glass', click: () => { A.sfx('glass', 0.6); toast('A mystery key. It opens nothing. Yet.'); } }; } },
  { make: () => { const g = new THREE.Group(), au = std('#e0b43a', { metalness: 0.9, roughness: 0.25 }); [0, 1, 2].forEach(i => g.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 18), au, 0, i * 0.032, 0))); return { g, shape: new CANNON.Cylinder(0.14, 0.14, 0.09, 12), mass: 0.1, sfx: 'glass', click: (o) => { A.sfx('glass', 0.5); o.body.velocity.y = 5; o.body.angularVelocity.set(rand(-8, 8), 0, rand(-8, 8)); toast(Math.random() < 0.5 ? 'Heads: revise Polity first.' : 'Tails: practise answer writing.'); } }; } },
  { make: () => { const q = NOTES[(Math.random() * NOTES.length) | 0], tex = canvasTex(256, 160, (c, w, h) => { c.fillStyle = '#fff6d6'; c.fillRect(0, 0, w, h); c.fillStyle = '#c0392b'; c.fillRect(0, 0, w, 14); c.fillStyle = '#2b2418'; c.font = '24px "Segoe Print","Comic Sans MS",cursive'; c.textAlign = 'center'; const words = q.split(' '); let line = '', y = 62; words.forEach(wd => { if ((line + wd).length > 16) { c.fillText(line, w / 2, y); line = ''; y += 32; } line += wd + ' '; }); c.fillText(line, w / 2, y); }).tex; const g = new THREE.Group(), m = std('#fff6d6'); g.add(mesh(new THREE.BoxGeometry(0.7, 0.02, 0.44), [m, m, std('#ffffff', { map: tex }), m, m, m])); return { g, shape: new CANNON.Box(new CANNON.Vec3(0.35, 0.012, 0.22)), mass: 0.05, sfx: 'paper', click: () => { A.sfx('paper', 0.6); toast('📝 ' + q); } }; } },
  { make: () => { const g = new THREE.Group(); g.add(mesh(new THREE.SphereGeometry(0.2, 18, 14), std('#e63946', { roughness: 0.5 }))); return { g, shape: new CANNON.Sphere(0.2), mass: 0.1, sfx: 'plastic', click: (o) => { A.sfx('plastic', 0.8); o.body.velocity.y = 7; toast('Boing! Squeeze away the stress.'); } }; } },
  { make: () => { const g = new THREE.Group(); g.add(mesh(new THREE.BoxGeometry(0.4, 0.05, 0.14), std('#1b1d24', { roughness: 0.4 }))); g.add(mesh(new THREE.BoxGeometry(0.12, 0.052, 0.12), std('#c9ccd1', { metalness: 0.8 }), 0.22, 0, 0)); return { g, shape: new CANNON.Box(new CANNON.Vec3(0.26, 0.025, 0.07)), mass: 0.06, sfx: 'plastic', click: () => { A.sfx('click'); toast('USB drive: "UPSC_notes_FINAL_v7.pdf"'); } }; } }
];
function spawnSurprises() {
  DR.spawned = true; const picks = SURP.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, 3), zc = DR.zClosed + DR.slide;
  picks.forEach((idx, i) => {
    const d = SURP[idx].make(), body = dyn(d.shape, DR.x + (i - 1) * 0.55 + rand(-0.1, 0.1), -0.05, zc + rand(-0.2, 0.2), d.mass, rand(0, 6.28));
    const o = addItem({ id: 'surprise', root: d.g, body, sfx: d.sfx, lift: 0.3, onClick: () => d.click(o) }); o.drawerItem = true;
  });
}
function toggleDrawer() {
  A.init(); A.sfx('drawer');
  if (!DR.goal) { DR.goal = 1; DR.spawned = false; if (!fp && mode === 'desk' && pitchG > -0.3) { pitchG = -0.32; DR.nudged = true; } toast('Drawer open: take what you like'); }
  else { items.slice().forEach(o => { if (o.drawerItem && o.body.position.z > 2.22 && o.body.position.y < 0.4) dropItem(o); }); DR.goal = 0; if (DR.nudged) { pitchG = 0; DR.nudged = false; } }
}

/* ---------- weather controls ---------- */
const WX = [['auto', '🌦', 'Auto'], ['clear', '☀️', 'Clear'], ['rain', '🌧', 'Rain'], ['storm', '⛈', 'Storm'], ['fog', '🌫', 'Fog']];
function setWeather(w, quiet) {
  weather = w; boltT = 1.5; const e = WX.find(x => x[0] === w);
  if (!quiet) { A.init(); A.setRain(w === 'rain' || w === 'storm'); toast('Weather: ' + e[2]); }
  syncExtras();
}
function syncExtras() {
  const e = WX.find(x => x[0] === weather); $('#wxBtn').textContent = e[1]; $('#wxBtn').title = 'Weather: ' + e[2]; $('#wxBtn').classList.toggle('on', weather !== 'auto');
  document.querySelectorAll('#wxChips button').forEach(b => b.classList.toggle('on', b.dataset.w === weather));
  document.querySelectorAll('#fanChips button').forEach(b => b.classList.toggle('on', +b.dataset.f === fanLvl));
}
function buildExtras() {
  WX.forEach(([k, ic, name]) => { const b = document.createElement('button'); b.dataset.w = k; b.textContent = ic + ' ' + name; b.onclick = () => setWeather(k); $('#wxChips').append(b); });
  ['Off', 'Low', 'High'].forEach((n, i) => { const b = document.createElement('button'); b.dataset.f = i; b.textContent = n; b.onclick = () => { fanLvl = i; A.init(); A.setFan(i); A.sfx('click'); syncExtras(); }; $('#fanChips').append(b); });
  $('#drawerBtn').onclick = () => toggleDrawer();
  $('#wxBtn').onclick = () => { const i = WX.findIndex(x => x[0] === weather); setWeather(WX[(i + 1) % WX.length][0]); };
  syncExtras();
}

/* ---------- doors ---------- */
const doors = [];
function makeDoor(x, z, ry) {
  const g = new THREE.Group(); g.position.set(x, -3.9, z); g.rotation.y = ry;
  const hall = canvasTex(64, 256, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0a0810'); gr.addColorStop(1, '#4a3320'); c.fillStyle = gr; c.fillRect(0, 0, w, h); }).tex;
  const hm = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 4.2), new THREE.MeshBasicMaterial({ map: hall })); hm.position.set(0, 2.1, 0.02); g.add(hm);
  const fm = std('#efe7d8', { roughness: 0.6 });
  [[0.16, 4.5, -1.0, 2.25], [0.16, 4.5, 1.0, 2.25], [2.16, 0.16, 0, 4.3]].forEach(([w, h, px, py]) => g.add(mesh(new THREE.BoxGeometry(w, h, 0.12), fm, px, py, 0.06)));
  const hinge = new THREE.Group(); hinge.position.set(-0.9, 0, 0.1);
  const pm = std('#7a4a26', { roughness: 0.55 });
  hinge.add(mesh(new THREE.BoxGeometry(1.8, 4.2, 0.1), pm, 0.9, 2.1, 0));
  [1.1, 3.1].forEach(y => hinge.add(mesh(new THREE.BoxGeometry(1.2, 1.5, 0.04), std('#8d5b30', { roughness: 0.5 }), 0.9, y, 0.06)));
  hinge.add(mesh(new THREE.SphereGeometry(0.07, 12, 12), std('#d8b45a', { metalness: 0.8, roughness: 0.3 }), 1.55, 2.0, 0.1));
  g.add(hinge);
  const d = { k: 0, goal: 0, hinge };
  addItem({ id: 'door', root: g, onClick: () => { d.goal = d.goal ? 0 : 1; A.sfx('door'); toast(d.goal ? 'Door open' : 'Door closed'); } });
  doors.push(d);
}
makeDoor(-6.0, -2.2, 0);
function toggleDoors() { const o = !doors[0].goal; doors.forEach(d => { d.goal = o ? 1 : 0; }); A.sfx('door'); toast(o ? 'Door open' : 'Door closed'); }

/* ---------- roller chair ---------- */
const chair = new THREE.Group(); chair.position.set(-2.4, -3.9, 3.8); chair.rotation.y = -0.55;
const swivel = new THREE.Group(); let chairSpin = 0, chairVx = 0, chairVz = 0;
{
  const dark = std('#1b1d24', { roughness: 0.5, metalness: 0.4 }), fab = std('#1f3a5f', { roughness: 0.9 }), fab2 = std('#2c4f80', { roughness: 0.9 });
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2, leg = new THREE.Group(); leg.rotation.y = a;
    leg.add(mesh(new THREE.BoxGeometry(0.9, 0.08, 0.13), dark, 0.45, 0.3, 0)); leg.add(mesh(new THREE.SphereGeometry(0.11, 10, 10), std('#0a0a0c'), 0.88, 0.12, 0)); chair.add(leg);
  }
  chair.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.9, 12), std('#9aa0a8', { metalness: 0.8, roughness: 0.3 }), 0, 1.25, 0));
  swivel.add(mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.28, 28), fab, 0, 2.3, 0), mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.1, 28), fab2, 0, 2.46, 0));
  const back = mesh(new THREE.BoxGeometry(1.4, 1.7, 0.22), fab, 0, 3.45, -0.72); back.rotation.x = -0.12; swivel.add(back);
  const back2 = mesh(new THREE.BoxGeometry(1.2, 1.5, 0.1), fab2, 0, 3.45, -0.6); back2.rotation.x = -0.12; swivel.add(back2);
  [-1, 1].forEach(sd => { swivel.add(mesh(new THREE.BoxGeometry(0.12, 0.1, 0.9), dark, sd * 0.85, 3.0, -0.05)); swivel.add(mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), dark, sd * 0.85, 2.72, 0.2)); });
  chair.add(swivel);
}
addItem({ id: 'chair', root: chair, onClick: () => spinChair() });
function spinChair() { chairSpin = (Math.random() < 0.5 ? -1 : 1) * rand(10, 16); chairVx = rand(-1.3, 1.3); chairVz = rand(-1.1, 1.1); A.sfx('whoosh'); A.sfx('click'); }
function updateRoom(dt) {
  fanK += ([0, 0.45, 1][fanLvl] - fanK) * (1 - Math.exp(-dt * 0.8)); fanAngle += fanK * 11 * dt; fanRotor.rotation.y = fanAngle;
  DR.k += (DR.goal - DR.k) * (1 - Math.exp(-dt * 4.5));
  const dz = DR.zClosed + DR.k * DR.slide; drawerBody.velocity.set(0, 0, clamp((dz - drawerBody.position.z) / Math.max(dt, 1 / 120), -12, 12)); drawer.position.z = drawerBody.position.z;
  if (DR.goal && !DR.spawned && DR.k > 0.9) spawnSurprises();
  doors.forEach(d => { d.k += (d.goal - d.k) * (1 - Math.exp(-dt * 3)); d.hinge.rotation.y = -d.k * 1.5; });
  chairSpin *= Math.exp(-dt * 1.1); swivel.rotation.y += chairSpin * dt;
  chair.position.x = clamp(chair.position.x + chairVx * dt, -6.5, 6.5); chair.position.z = clamp(chair.position.z + chairVz * dt, 3.0, 11.5);
  const f = Math.exp(-dt * 1.6); chairVx *= f; chairVz *= f;
}

/* ================= lights ================= */
const hemi = new THREE.HemisphereLight('#ffffff', '#886644', 1);
const sun = new THREE.DirectionalLight('#ffffff', 2);
sun.castShadow = true; sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4;
scene.add(hemi, sun, sun.target);

/* ================= time of day ================= */
const C = (h) => new THREE.Color(h);
const TOD = {
  morning: { sky1: '#4a9cf0', sky2: '#d4ecff', sun: '#fff3dc', sunI: 2.7, sunPos: [-5, 8, 4], hemiS: '#d9ecff', hemiG: '#9d8668', hemiI: 1.35, exp: 1.0, celX: 0.72, celY: 0.26, celCol: '#fff7cf', stars: 0, lights: 0, sil: '#7f93b2', ui: 'day' },
  golden:  { sky1: '#ff6a3d', sky2: '#ffd48a', sun: '#ffa85a', sunI: 3.2, sunPos: [-8, 3.2, 3], hemiS: '#ffc58f', hemiG: '#6a4637', hemiI: 0.95, exp: 1.0, celX: 0.28, celY: 0.74, celCol: '#fff0b0', stars: 0, lights: 0.15, sil: '#5b3340', ui: 'golden' },
  night:   { sky1: '#03050f', sky2: '#1d2755', sun: '#8aa4ff', sunI: 0.55, sunPos: [-5, 7, 4], hemiS: '#2b3b78', hemiG: '#0c0c18', hemiI: 0.42, exp: 1.2, celX: 0.7, celY: 0.24, celCol: '#eef2ff', stars: 1, lights: 1, sil: '#080b17', ui: 'night' }
};
TOD.dawn = { ...TOD.golden, sky1: '#ff9a6a', sky2: '#ffe0b0', sunI: 2.2, sunPos: [-9, 2.2, 3], hemiI: 0.8, lights: 0.5, stars: 0.15 };
TOD.noon = { ...TOD.morning, sky1: '#2f8ae6', sunI: 3.1, sunPos: [-2, 10, 3], hemiI: 1.45 };
TOD.dusk = { ...TOD.golden, sky1: '#2b2766', sky2: '#ff7b6e', sun: '#ff7a5a', sunI: 0.9, sunPos: [-8, 2.5, 3], hemiS: '#6a5aa0', hemiG: '#2a1a28', hemiI: 0.5, exp: 1.1, stars: 0.5, lights: 0.8, sil: '#1c1426', ui: 'golden' };
let todName = 'golden', skyAnim = 3;
const cur = { sky1: C('#fff'), sky2: C('#fff'), sun: C('#fff'), hemiS: C('#fff'), hemiG: C('#fff'), celCol: C('#fff'), sil: C('#fff'), sunPos: new V3(), sunI: 0, hemiI: 0, exp: 1, celX: 0, celY: 0, stars: 0, lights: 0 };
const COLS = ['sky1', 'sky2', 'sun', 'hemiS', 'hemiG', 'celCol', 'sil'], NUMS = ['sunI', 'hemiI', 'exp', 'celX', 'celY', 'stars', 'lights'];
const KF = [[0, 'night'], [5, 'night'], [6.3, 'dawn'], [8.2, 'morning'], [12, 'noon'], [16, 'morning'], [17.8, 'golden'], [19.3, 'dusk'], [21, 'night'], [24, 'night']];
let hour = 17.8, dayRun = false, target = null;
const smooth = (x) => x * x * (3 - 2 * x);
function sample(h) {
  let i = 0; while (i < KF.length - 2 && h >= KF[i + 1][0]) i++;
  const [h0, n0] = KF[i], [h1, n1] = KF[i + 1], A0 = TOD[n0], B0 = TOD[n1], u = smooth(clamp((h - h0) / (h1 - h0), 0, 1));
  const o = { sunPos: new V3(...A0.sunPos).lerp(new V3(...B0.sunPos), u) };
  COLS.forEach(c => { o[c] = C(A0[c]).lerp(C(B0[c]), u); }); NUMS.forEach(n => { o[n] = A0[n] + (B0[n] - A0[n]) * u; });
  const day = h >= 6 && h < 18, uu = day ? (h - 6) / 12 : ((h + 6) % 24) / 12;
  o.celX = 0.12 + 0.76 * uu; o.celY = 0.8 - 0.55 * Math.sin(Math.PI * uu);
  o.celCol = day ? C('#ff9c4a').lerp(C('#fff7cf'), Math.sin(Math.PI * uu)) : C('#eef2ff');
  return o;
}
const nameOf = (h) => (h < 5.3 || h >= 19.6 ? 'night' : h < 7.2 || h >= 16.8 ? 'golden' : 'morning');
function snapTime() { target = sample(hour); COLS.forEach(k => cur[k].copy(target[k])); NUMS.forEach(k => { cur[k] = target[k]; }); cur.sunPos.copy(target.sunPos); }
function stepTime(dt) {
  if (!target) return; const k = 1 - Math.exp(-dt * 2.6);
  COLS.forEach(c => cur[c].lerp(target[c], k)); NUMS.forEach(n => { cur[n] += (target[n] - cur[n]) * k; }); cur.sunPos.lerp(target.sunPos, k);
}
function applyHour() {
  hour = ((hour % 24) + 24) % 24; target = sample(hour);
  const n = nameOf(hour);
  if (n !== todName) {
    todName = n; document.body.dataset.theme = TOD[n].ui;
    $('meta[name=theme-color]').content = { morning: '#d9c9a8', golden: '#3a2218', night: '#0b0f1f' }[n];
    if (n === 'night') setLamp(true); else if (n === 'morning') setLamp(false);
    try { A.setMood(n); } catch (e) {}
  }
  skyAnim = 4;
  const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
  $('#dayLbl').textContent = ((hh + 11) % 12 + 1) + ':' + String(mm).padStart(2, '0') + (hh < 12 ? ' AM' : ' PM');
  $('#dayIc').textContent = n === 'night' ? '🌙' : n === 'golden' ? '🌇' : '☀️';
  const r = $('#dayR'); if (Math.abs(+r.value - hour) > 0.001) r.value = hour;
}
const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random() * 0.7, r: rand(0.6, 1.8), p: rand(0, 6) }));
const bld = Array.from({ length: 12 }, (_, i) => ({ x: i * 46 - 10, w: rand(34, 52), h: rand(70, 190) }));
function drawSky(time) {
  const { g, w, h } = sky;
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, hex(cur.sky1)); gr.addColorStop(1, hex(cur.sky2)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  stars.forEach(s => { g.fillStyle = `rgba(255,255,255,${cur.stars * (0.55 + 0.45 * Math.sin(time * 1.5 + s.p))})`; g.beginPath(); g.arc(s.x * w, s.y * h, s.r, 0, 7); g.fill(); });
  const cx = cur.celX * w, cy = cur.celY * h, rg = g.createRadialGradient(cx, cy, 4, cx, cy, 120);
  rg.addColorStop(0, rgba(cur.celCol, 0.9)); rg.addColorStop(1, rgba(cur.celCol, 0)); g.fillStyle = rg; g.fillRect(0, 0, w, h);
  g.fillStyle = hex(cur.celCol); g.beginPath(); g.arc(cx, cy, 26, 0, 7); g.fill();
  if (cur.stars > 0.3) { g.fillStyle = `rgba(150,160,190,${0.35 * cur.stars})`; [[-8, -6, 7], [9, 5, 5], [-3, 11, 4]].forEach(([dx, dy, r]) => { g.beginPath(); g.arc(cx + dx, cy + dy, r, 0, 7); g.fill(); }); } // craters
  g.fillStyle = `rgba(255,255,255,${0.55 * (1 - cur.stars)})`;
  [[110, 90, 56], [330, 140, 44], [420, 70, 38]].forEach(([x, y, r]) => { const dx = (time * 3 + x) % (w + 160) - 80; g.beginPath(); g.ellipse(dx, y, r, r * 0.38, 0, 0, 7); g.ellipse(dx + r * 0.5, y - 8, r * 0.6, r * 0.3, 0, 0, 7); g.fill(); });
  if (wx.oc > 0.02) { // overcast: grey veil + dark clouds
    const gc = C('#7a8696').lerp(C('#0c0f1a'), cur.stars);
    g.fillStyle = rgba(gc, wx.oc * 0.78); g.fillRect(0, 0, w, h);
    g.fillStyle = rgba(gc.clone().multiplyScalar(0.55), wx.oc * 0.9);
    [[60, 40, 120], [200, 70, 150], [350, 35, 130], [470, 80, 110], [130, 110, 90]].forEach(([x, y, r], i) => { const dx = (time * (4 + i) + x) % (w + 240) - 120; g.beginPath(); g.ellipse(dx, y, r, r * 0.32, 0, 0, 7); g.fill(); });
  }
  g.fillStyle = hex(cur.sil); bld.forEach(b => g.fillRect(b.x, h - b.h, b.w, b.h));
  g.beginPath(); g.arc(60, h - 60, 56, 0, 7); g.fill(); g.fillRect(56, h - 60, 8, 60); // tree
  g.fillStyle = `rgba(255,214,120,${cur.lights})`; bld.forEach((b, bi) => { for (let y = h - b.h + 14; y < h - 10; y += 22) for (let x = b.x + 6; x < b.x + b.w - 8; x += 14) if (((x * 7 + y * 13 + bi) | 0) % 3 === 0) g.fillRect(x, y, 6, 9); });
  if (wx.fog > 0.02) { // fog: a veil plus drifting mist bands
    const fc = C('#e4e9ee').lerp(C('#4a5578'), cur.stars);
    g.fillStyle = rgba(fc, 0.5 * wx.fog); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      const y = h * (0.42 + 0.13 * i) + Math.sin(time * 0.3 + i) * 8, gr = g.createLinearGradient(0, y - 42, 0, y + 42);
      gr.addColorStop(0, rgba(fc, 0)); gr.addColorStop(0.5, rgba(fc, 0.8 * wx.fog)); gr.addColorStop(1, rgba(fc, 0));
      g.fillStyle = gr; g.fillRect(((time * 7 * (i % 2 ? 1 : -1)) % 40) - 20, y - 42, w + 40, 84);
    }
  }
  for (let i = 0; i < 3; i++) { // street traffic
    const cx = ((time * (26 + i * 9) + i * 190) % (w + 80)) - 40, cy = h - 5, night = cur.lights > 0.4;
    g.fillStyle = night ? '#ffe9a0' : ['#c0392b', '#2e6fb0', '#f4c20d'][i]; g.fillRect(cx, cy, 14, 5);
    if (night) { g.fillStyle = 'rgba(255,233,160,.25)'; g.fillRect(cx + 14, cy - 1, 22, 7); }
  }
  if (cur.stars < 0.6) { // flock of birds
    g.strokeStyle = hex(cur.sil); g.lineWidth = 2;
    flock.forEach(b => { const x = b.x * w, y = b.y * h + Math.sin(time * 1.6 + b.p) * 7, fl = Math.sin(time * 13 + b.p) * 5; g.beginPath(); g.moveTo(x - 9, y + fl * 0.6); g.quadraticCurveTo(x - 4, y - fl, x, y); g.quadraticCurveTo(x + 4, y - fl, x + 9, y + fl * 0.6); g.stroke(); });
  }
  if (wx.rain > 0.03) { // rain (weather or the rain button)
    g.fillStyle = 'rgba(30,40,60,.28)'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(200,220,255,.55)'; g.lineWidth = 1.2;
    for (let i = 0, n = Math.round(110 * wx.rain); i < n; i++) { const rx = (i * 53 + time * 60) % (w + 40) - 20, ry = (i * 97 + time * 380) % h; g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx - 4, ry + 14); g.stroke(); }
  }
  if (bolt) { const age = (performance.now() - bolt.t0) / 380; if (age < 1) { g.strokeStyle = `rgba(255,255,255,${1 - age})`; g.lineWidth = 3; g.shadowColor = '#bcd4ff'; g.shadowBlur = 18; g.beginPath(); bolt.pts.forEach(([bx, by], i) => i ? g.lineTo(bx, by) : g.moveTo(bx, by)); g.stroke(); g.shadowBlur = 0; } else bolt = null; }
  if (flash > 0.02) { g.fillStyle = `rgba(235,240,255,${Math.min(0.85, flash * 0.8)})`; g.fillRect(0, 0, w, h); }
  fw.forEach(f => f.parts.forEach(p => { g.fillStyle = `hsla(${f.hue + p.a * 20},95%,65%,${Math.max(0, 1 - f.age / 1.4)})`; g.beginPath(); g.arc(f.x + Math.cos(p.a) * p.s * f.age, f.y + Math.sin(p.a) * p.s * f.age + 50 * f.age * f.age, 2.4, 0, 7); g.fill(); }));
  sky.tex.needsUpdate = true;
}
let lampOn = false, lampK = 0;
function setTime(name, quiet) {
  hour = { morning: 9, golden: 17.8, night: 1.5 }[name] ?? hour; applyHour();
  if (!quiet) { toast(t('t_' + name)); A.sfx('whoosh'); }
}
function setLamp(on) { lampOn = on; $('#lpOn').checked = on; $('#lampBtn').classList.toggle('on', on); $('.brand-lamp').classList.toggle('lit', on); }
function toggleLamp() { setLamp(!lampOn); A.sfx('click'); toast(t(lampOn ? 't_lamp_on' : 't_lamp_off')); }

function envUpdate(dt, time) {
  if (dayRun) { hour += dt * 0.25; applyHour(); }
  stepTime(dt);
  { // weather
    const dawnFog = clamp(1 - Math.abs(hour - 6.3) / 2.4, 0, 1), rainy = weather === 'rain' || weather === 'storm' || A.isRain();
    const fogT = weather === 'fog' ? 1 : weather === 'auto' ? dawnFog * 0.9 : 0, rainT = weather === 'storm' ? 1 : rainy ? 0.6 : 0;
    const ocT = weather === 'storm' ? 0.8 : rainy ? 0.5 : fogT * 0.35, kw = 1 - Math.exp(-dt * 1.2);
    wx.fog += (fogT - wx.fog) * kw; wx.rain += (rainT - wx.rain) * kw; wx.oc += (ocT - wx.oc) * kw;
    if (weather === 'storm') { boltT -= dt; if (boltT <= 0) { strike(); boltT = rand(5, 14); } }
    flash *= Math.exp(-dt * 6);
  }
  flock.forEach(b => { b.x += b.v * dt; if (b.x > 1.1) { b.x = -0.1; b.y = rand(0.1, 0.45); } });
  for (let i = fw.length - 1; i >= 0; i--) { fw[i].age += dt; if (fw[i].age > 1.5) fw.splice(i, 1); }
  skySince += dt; if (skySince > 0.04) { updateDrops(skySince); skySince = 0; drawSky(time); }
  updateWindow(dt, time);
  sun.color.copy(cur.sun); sun.intensity = cur.sunI * (1 - 0.65 * wx.oc); sun.position.copy(cur.sunPos);
  hemi.color.copy(cur.hemiS); hemi.groundColor.copy(cur.hemiG); hemi.intensity = cur.hemiI * (1 - 0.15 * wx.oc) + flash * 2.4;
  renderer.toneMappingExposure = cur.exp + flash * 0.25;
  lampK += ((lampOn ? 1 : 0) - lampK) * (1 - Math.exp(-dt * 7));
  lampLight.intensity = lampK * lampBright * (30 + cur.lights * 150);
  lampLight.color.set('#ff9a45').lerp(C('#fff3dc'), lampWarm);
  bulbMat.color.set('#4a4a4a').lerp(C('#fff0c4'), lampK).multiplyScalar(1 + lampK * 0.6);
  screenGlow.intensity = 1.2 + cur.lights * 7;
  screenMesh.material.color.setScalar(0.85 + 0.15 * (1 - cur.lights));
}

const birds = createBirds({ scene, A, addItem, removeItem, getState: () => ({ open: winOpen, tod: todName }), toast });

/* ================= camera & input ================= */
let mode = 'desk', ready = false, fp = false;
const _gp = new V3(), _z = new V3(), _dir = new V3(), _right = new V3(), _tgt = new V3(), _up = new V3(0, 1, 0);
const camPos = new V3(), lookCur = new V3(), goalPos = new V3(), goalLook = new V3(), par = new V3(), parGoal = new V3();
function framing(a) { return clamp(3.5 / (0.384 * a) / 9.3, 1, 3); }
function setGoal() {
  const a = innerWidth / innerHeight, k = framing(a);
  if (mode === 'desk' && fp) { goalPos.set(0, 3.1, 5.6); goalLook.set(0, 1.5, -1.6); }
  else if (mode === 'desk') { goalPos.set(0, 4.9 + (k - 1) * 1.3, 9.3 * k); goalLook.set(0, 1.75 - (k - 1) * 0.45, -0.6); }
  else { const kk = Math.max(1, 1.8 / a); goalPos.set(0, 1.05 + (kk - 1) * 0.5, 1.0 + (kk - 1) * 2.5); goalLook.set(0, 0.82, -1.55); }
}
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); setGoal();
}
addEventListener('resize', resize);

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tmp = new V3(), plane = new THREE.Plane(new V3(0, 1, 0), 0);
function setNdc(ev) { ndc.set(ev.clientX / innerWidth * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1); }
function pick() {
  ray.setFromCamera(ndc, camera);
  for (const h of ray.intersectObjects(pickRoots, true)) { let o = h.object; while (o && !o.userData.item) o = o.parent; if (o) return { item: o.userData.item, point: h.point, uv: h.uv }; }
  return null;
}
let yaw = 0, pitch = 0, yawG = 0, pitchG = 0, looking = null, zoomK = 1;
const lim = () => (fp ? { y: 2.6, p0: -1.2, p1: 1.0 } : { y: 0.6, p0: -0.6, p1: 0.45 });
function zoomSet(z) { zoomK = clamp(z, 0.4, 2.0); $('#zLbl').textContent = Math.round(100 / zoomK) + '%'; }
const pts = new Map(); let pinch0 = 1, pinchZ = 1;
let down = null, drag = null, dragOff = new V3(), dragLift = 1;
const modalOpen = () => osOpen() || !!document.querySelector('.modal.open') || !$('#intro').classList.contains('gone');
canvas.addEventListener('pointerdown', (ev) => {
  if (modalOpen() || mode !== 'desk') return;
  pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pts.size === 2) { drag = null; looking = null; curtainDrag = null; aimingLamp = false; const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); pinchZ = zoomK; return; }
  A.init(); setNdc(ev);
  const h = pick(); down = { x: ev.clientX, y: ev.clientY, t: ev.timeStamp, item: h && h.item, hit: h };
  closeDrawer();
  aimingLamp = !!(h && h.item.id === 'lamp');
  curtainDrag = h && h.item.id === 'curtain' ? { c: h.item, x: ev.clientX, open: h.item.goal } : null;
  if (!h) looking = { x: ev.clientX, y: ev.clientY, yaw: yawG, pitch: pitchG };
  if (h && h.item.body) {
    drag = h.item; dragLift = 1.0 + (h.item.lift || 0);
    dragOff.set(h.item.body.position.x - h.point.x, 0, h.item.body.position.z - h.point.z);
    canvas.setPointerCapture(ev.pointerId); canvas.classList.add('grabbing'); A.sfx(h.item.sfx === 'paper' ? 'paper' : 'click', 0.4);
  }
});
canvas.addEventListener('pointermove', (ev) => {
  if (pts.has(ev.pointerId)) pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pts.size === 2) { const [a, b] = [...pts.values()]; zoomSet(pinchZ * pinch0 / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))); return; }
  setNdc(ev);
  if (curtainDrag) { const dx = ev.clientX - curtainDrag.x; if (Math.abs(dx) > 6) { const c = curtainDrag.c; c.goal = clamp(curtainDrag.open + c.sd * dx / (innerWidth * 0.2), 0, 1); wave += Math.abs(ev.movementX || 0) * 0.03 + 0.02; canvas.classList.add('grabbing'); } } parGoal.set(ndc.x * 0.45, ndc.y * 0.25, 0);
  if (aimingLamp && down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 7) {
    ray.setFromCamera(ndc, camera); plane.constant = 0;
    if (ray.ray.intersectPlane(plane, tmp)) { lampAimGoal.set(clamp(tmp.x, -4, 4), 0, clamp(tmp.z, -1.8, 3)); syncAimUI(); if (!lampOn) setLamp(true); }
    canvas.classList.add('grabbing');
  }
  if (looking) { const L = lim(), sn = fp ? 0.0042 : 0.003; yawG = clamp(looking.yaw + (ev.clientX - looking.x) * sn, -L.y, L.y); pitchG = clamp(looking.pitch + (ev.clientY - looking.y) * sn, L.p0, L.p1); canvas.classList.add('grabbing'); }
  if (!drag && ev.pointerType === 'mouse' && mode === 'desk' && !modalOpen()) canvas.classList.toggle('pointer', !!pick());
});
function endPointer(ev) {
  pts.delete(ev.pointerId); curtainDrag = null;
  const was = drag; drag = null; looking = null; aimingLamp = false; canvas.classList.remove('grabbing');
  if (!down) return;
  const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y), dt = ev.timeStamp - down.t;
  if (moved < 9 && dt < 700 && down.item && down.item.onClick && !modalOpen()) down.item.onClick(down.hit);
  else if (was && moved > 9) A.sfx(was.sfx === 'paper' ? 'paper' : 'wood', 0.25);
  down = null;
}
canvas.addEventListener('wheel', (e) => { if (mode !== 'desk' || modalOpen()) return; e.preventDefault(); zoomSet(zoomK * (1 + e.deltaY * 0.0012)); }, { passive: false });
canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);

/* ================= UI helpers ================= */
let toastT;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600); }
function setActive(name) { document.querySelectorAll('.nav-links button').forEach(b => b.classList.toggle('active', b.dataset.go === name)); }
function closeDrawer() { $('#explore').classList.remove('open'); $('#lampPop').classList.remove('open'); $('#musicPop').classList.remove('open'); }
function closeModals() { document.body.classList.remove('dim'); document.querySelectorAll('.modal.open').forEach(m => { m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); }); }
function showModal(id) { closeModals(); closeDrawer(); document.body.classList.add('dim'); const m = $('#' + id); m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); }
function setFP(on, quiet) { fp = on; yawG = pitchG = 0; zoomSet(1); setGoal(); $('#fpBtn').classList.toggle('on', on); if (!quiet) toast(t(on ? 'fp_on' : 'fp_off')); }
function openPhoneUI() { showModal('phone'); setActive('phone'); resetPhone(); }
function openNewsUI() { showModal('news'); setActive('news'); buildNews(); }
function flickPens() { items.filter(o => /^pen/.test(o.id)).forEach(o => { o.body.velocity.y += 3; o.body.angularVelocity.set(0, rand(8, 14) * (Math.random() < 0.5 ? -1 : 1), 0); }); A.sfx('plastic', 0.6); }
function goDesk() { closeModals(); closeDrawer(); if (osOpen()) closeOS(); mode = 'desk'; setGoal(); setActive('desk'); }
function zoomLaptop(app = 'chrome') {
  closeModals(); closeDrawer(); mode = 'laptop'; setGoal(); setActive('laptop'); A.sfx('whoosh');
  setTimeout(() => { if (mode === 'laptop') openOS(app); }, 700);
}
initOS(() => { mode = 'desk'; setGoal(); setActive('desk'); });

/* ---------- books UI ---------- */
let curBook = null, page = 0;
function openShelf() {
  showModal('book'); setActive('books');
  const sh = $('#shelf'); sh.innerHTML = ''; sh.classList.add('show'); $('#reader').classList.remove('show');
  BOOKS.forEach(b => { const e = document.createElement('button'); e.className = 'spineb'; e.style.background = `linear-gradient(135deg,${b.color},#000a)`; e.textContent = t(b.key); e.onclick = () => openBook(b.id); sh.append(e); });
}
function openBook(id) {
  curBook = BOOKS.find(b => b.id === id); page = 0; showModal('book'); setActive('books');
  $('#shelf').classList.remove('show'); $('#reader').classList.add('show'); renderPage();
}
function renderPage() {
  const p = curBook.pages[page];
  $('#bTitle').textContent = `${t(curBook.key)} · ${curBook.title}`; $('#bHead').textContent = p.h;
  const ul = $('#bList'); ul.innerHTML = ''; p.l.forEach(x => { const li = document.createElement('li'); li.textContent = x; ul.append(li); });
  $('#bPg').textContent = `${page + 1} / ${curBook.pages.length}`;
  const pa = $('.paper'); pa.style.animation = 'none'; void pa.offsetWidth; pa.style.animation = '';
}
$('#bNext').onclick = () => { page = (page + 1) % curBook.pages.length; renderPage(); A.sfx('paper', 0.5); };
$('#bPrev').onclick = () => { page = (page + curBook.pages.length - 1) % curBook.pages.length; renderPage(); A.sfx('paper', 0.5); };
$('#bShelf').onclick = openShelf;

/* ---------- pomodoro ---------- */
let pmMin = 25, pmLeft = 25 * 60, pmTimer = null;
const fmt = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
function pmRender() { $('#pomoTime').textContent = fmt(pmLeft); document.title = pmTimer ? `${fmt(pmLeft)} · Ajeet's Desk` : "Ajeet's UPSC Desk — a 3D study room"; $('#pomoGo').textContent = t(pmTimer ? 'pause' : 'start'); }
function pmStop() { clearInterval(pmTimer); pmTimer = null; }
function openPomo() { showModal('pomo'); setActive('pomo'); const q = t('quotes'); $('#pomoQ').textContent = q[(Math.random() * q.length) | 0]; pmRender(); }
$('#pomoGo').onclick = () => {
  A.sfx('click');
  if (pmTimer) { pmStop(); return pmRender(); }
  pmTimer = setInterval(() => { pmLeft--; if (pmLeft <= 0) { pmStop(); pmLeft = 0; A.sfx('ding'); setTimeout(() => A.sfx('ding'), 700); toast('⏰ Time!'); } pmRender(); }, 1000); pmRender();
};
$('#pomoReset').onclick = () => { pmStop(); pmLeft = pmMin * 60; pmRender(); };
document.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => { document.querySelectorAll('[data-pm]').forEach(x => x.classList.remove('active')); b.classList.add('active'); pmMin = +b.dataset.pm; pmStop(); pmLeft = pmMin * 60; pmRender(); });

/* ---------- desk actions ---------- */
function resetDesk(quiet) {
  lampAimGoal.set(0.4, 0, -0.2); lampBright = 1; lampWarm = 0.35; sl.b.value = 1; sl.w.value = 0.35; syncAimUI();
  DR.goal = 0; DR.nudged = false;
  items.slice().forEach(o => { if (!o.body) return; if (o.drawerItem) { dropItem(o); return; } o.body.position.copy(o.home.p); o.body.quaternion.copy(o.home.q); o.body.velocity.setZero(); o.body.angularVelocity.setZero(); });
  if (!quiet) toast(t('t_reset'));
}
function quake() {
  items.forEach(o => { if (!o.body) return; o.body.velocity.x += rand(-4, 4); o.body.velocity.y += rand(6, 11); o.body.velocity.z += rand(-3, 3); o.body.angularVelocity.set(rand(-5, 5), rand(-5, 5), rand(-5, 5)); });
  A.sfx('wood', 1); toast(t('t_quake'));
}
function tossBottle() { const o = items.find(i => i.id === 'bottle'); o.body.velocity.set(rand(-7, 7), 10, rand(2, 6)); o.body.angularVelocity.set(rand(-6, 6), 0, rand(-6, 6)); A.sfx('plastic', 0.8); }
function syncMusicUI() { mp.sync(); }

/* ---------- explore drawer ---------- */
const EX = [
  ['💻', 1, () => zoomLaptop()], ['🌙', 2, () => setTime('night')], ['🌇', 3, () => setTime('golden')], ['📚', 4, () => openShelf()],
  ['⏱️', 5, () => openPomo()], ['🌧', 6, () => { A.init(); A.setMusic(true); A.setRain(true); syncMusicUI(); toast(t('t_rain')); }], ['🌋', 7, () => quake()], ['🧴', 8, () => tossBottle()],
  ['✅', 9, () => zoomLaptop('syll')], ['🖼️', 10, () => quote()], ['🧹', 12, () => resetDesk()],
  ['📱', 13, () => openPhoneUI()], ['📰', 14, () => openNewsUI()], ['🪟', 15, () => setWindow(!winOpen)], ['🐦', 16, () => { setTime('morning'); setWindow(true); }], ['👁', 17, () => setFP(!fp)], ['🖊️', 18, () => flickPens()],
  ['🪟', 19, () => { curtains.forEach(c => { c.goal = c.goal > 0.5 ? 0 : 1; }); wave += 1.5; A.sfx('paper', 0.5); }], ['🪑', 20, () => spinChair()], ['🚪', 21, () => toggleDoors()], ['🌅', 22, () => { dayRun = !dayRun; toast(dayRun ? 'The day is running' : 'Day paused'); }], ['🔍', 23, () => zoomSet(zoomK * 1.4)], ['🖍️', 24, () => openBoardUI()], ['🎚️', 25, () => { closeModals(); $('#musicPop').classList.add('open'); mp.sync(); }], ['⚙️', 26, () => openSettings()], ['🌦️', 27, () => setWeather(weather === 'storm' ? 'auto' : 'storm')], ['🌀', 28, () => lookAtFan()], ['🗄️', 29, () => toggleDrawer()]
];
function buildCards() {
  const box = $('#cards'); box.innerHTML = '';
  EX.forEach(([ic, n, fn], i) => {
    const b = document.createElement('button'); b.className = 'card'; b.style.animationDelay = i * 40 + 'ms';
    b.innerHTML = `<div class="ic">${ic}</div><b></b><span></span>`; b.querySelector('b').textContent = t(`ex${n}_t`); b.querySelector('span').textContent = t(`ex${n}_d`);
    b.onclick = () => { A.init(); if (n !== 7 && n !== 8) closeDrawer(); else if (n === 7 || n === 8) closeDrawer(); fn(); };
    box.append(b);
  });
}

/* ---------- settings: colours, curtains, interface ---------- */
const SWATCH = {
  wall: ['#d9cdb8', '#b9c9b0', '#b7cfe3', '#e8c4c4', '#cfc3e3', '#e0c27a', '#4a4f5c', '#f1efe9'],
  desk: ['#ffffff', '#a9815f', '#6e5a4c', '#ffe0a8'],
  floor: ['#3a2b22', '#6b5a48', '#2b3340', '#8a8f98'],
  curtain: ['#e9d9b8', '#d98a96', '#4fa3a5', '#2d4a7a', '#2f7d5a', '#8c2f39', '#a08cc9', '#454a54']
};
const GROUPS = [['wall', '#swWall', '#cWall'], ['desk', '#swDesk', '#cDesk'], ['floor', '#swFloor', '#cFloor'], ['curtain', '#swCur', '#cCur']];
function saveSettings() { try { localStorage.setItem('deskSettings', JSON.stringify(SET)); } catch (e) {} }
function applySettings() {
  const wc = new THREE.Color(SET.wall);
  wall.material.color.copy(wc);
  shells.forEach(([m, c]) => { if (c === '#d3c7b2' || c === '#cfc3ae') m.material.color.copy(wc).multiplyScalar(0.96); if (c === '#3a2b22') m.material.color.set(SET.floor); });
  desk.children[0].material.color.set(SET.desk);
  curtains.forEach(c => { c.root.material.color.set(SET.curtain); c.root.material.opacity = SET.sheer; });
  A.setMaster(SET.master);
  renderer.setPixelRatio(SET.low ? 1 : Math.min(devicePixelRatio, small ? 1.5 : 2));
  const ss = SET.low ? 512 : small ? 1024 : 2048;
  if (sun.shadow.mapSize.x !== ss) { sun.shadow.mapSize.set(ss, ss); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  resize();
  GROUPS.forEach(([key, boxSel, inSel]) => { [...$(boxSel).children].forEach(b => b.classList.toggle('on', b.dataset.c.toLowerCase() === String(SET[key]).toLowerCase())); $(inSel).value = SET[key]; });
  $('#sSheer').value = SET.sheer; $('#sAuto').checked = SET.autohide; $('#sLow').checked = SET.low; $('#sMaster').value = SET.master;
}
function buildSettings() {
  GROUPS.forEach(([key, boxSel, inSel]) => {
    SWATCH[key].forEach(c => { const b = document.createElement('button'); b.className = 'swatch'; b.style.background = c; b.title = c; b.dataset.c = c; b.onclick = () => { SET[key] = c; saveSettings(); applySettings(); A.sfx('click'); }; $(boxSel).append(b); });
    $(inSel).oninput = (e) => { SET[key] = e.target.value; saveSettings(); applySettings(); };
  });
  $('#sSheer').oninput = (e) => { SET.sheer = +e.target.value; saveSettings(); applySettings(); };
  $('#sAuto').onchange = (e) => { SET.autohide = e.target.checked; saveSettings(); if (window.__showUI) window.__showUI(); };
  $('#sLow').onchange = (e) => { SET.low = e.target.checked; saveSettings(); applySettings(); };
  $('#sMaster').oninput = (e) => { SET.master = +e.target.value; saveSettings(); A.setMaster(SET.master); };
  $('#setReset').onclick = () => { Object.assign(SET, SET0); saveSettings(); applySettings(); A.sfx('paper', 0.6); toast('Settings reset'); };
}
function openSettings() { showModal('settings'); setActive('settings'); }
function openBoardUI() { showModal('board'); boardCtl.mount($('#boardHost')); }

/* ---------- wire up the chrome ---------- */
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { closeModals(); closeDrawer(); setActive('desk'); });
document.querySelectorAll('.modal').forEach(m => m.addEventListener('pointerdown', (e) => { if (e.target === m) { closeModals(); setActive('desk'); } }));
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
  A.init(); const g = b.dataset.go;
  if (g === 'desk') goDesk(); else if (g === 'laptop') zoomLaptop(); else if (g === 'books') openShelf(); else if (g === 'pomo') openPomo(); else if (g === 'phone') openPhoneUI(); else if (g === 'news') openNewsUI(); else if (g === 'settings') openSettings();
  else if (g === 'explore') { closeModals(); if (osOpen()) closeOS(); const d = $('#explore'); d.classList.toggle('open'); setActive(d.classList.contains('open') ? 'explore' : 'desk'); }
});
$('#brand').onclick = (e) => { e.preventDefault(); goDesk(); };
document.querySelectorAll('#langSeg button').forEach(b => b.onclick = () => { if (b.classList.contains('on') && innerWidth < 760) nextLang(); else setLang(b.dataset.lang); A.sfx('click'); });
document.querySelectorAll('#todSeg button').forEach(b => b.onclick = () => { A.init(); setTime(b.dataset.tod); });
const sl = { b: $('#lpB'), w: $('#lpW'), x: $('#lpX'), z: $('#lpZ') };
function syncAimUI() { sl.x.value = lampAimGoal.x; sl.z.value = lampAimGoal.z; }
sl.b.oninput = () => { lampBright = +sl.b.value; if (!lampOn) setLamp(true); };
sl.w.oninput = () => { lampWarm = +sl.w.value; };
sl.x.oninput = sl.z.oninput = () => { lampAimGoal.set(+sl.x.value, 0, +sl.z.value); if (!lampOn) setLamp(true); };
$('#lampBtn').onclick = () => { A.init(); $('#musicPop').classList.remove('open'); const pop = $('#lampPop'); pop.classList.toggle('open'); if (pop.classList.contains('open')) { closeModals(); $('#explore').classList.remove('open'); syncAimUI(); } A.sfx('click'); };
$('#lpOn').onchange = (e) => { A.init(); setLamp(e.target.checked); A.sfx('click'); toast(t(lampOn ? 't_lamp_on' : 't_lamp_off')); };
$('#dayR').oninput = (e) => { hour = +e.target.value; applyHour(); };
$('#dayIc').onclick = () => { A.init(); dayRun = !dayRun; toast(dayRun ? 'The day is running. Click the sun to pause.' : 'Day paused'); };
$('#zIn').onclick = () => zoomSet(zoomK / 1.2); $('#zOut').onclick = () => zoomSet(zoomK * 1.2);
$('.brand-lamp').onclick = (e) => { e.preventDefault(); e.stopPropagation(); A.init(); toggleLamp(); };
$('#winBtn').onclick = () => { A.init(); setWindow(!winOpen); };
$('#fpBtn').onclick = () => { A.init(); closeModals(); closeDrawer(); if (osOpen()) closeOS(); mode = 'desk'; setFP(!fp); };
window.addEventListener('desk:news', openNewsUI); window.addEventListener('desk:pomo', () => openPomo()); window.addEventListener('desk:lamp', toggleLamp);
window.addEventListener('desk:laptop', () => zoomLaptop()); window.addEventListener('desk:window', () => setWindow(!winOpen)); window.addEventListener('audiochange', () => syncMusicUI());
$('#resetBtn').onclick = () => { A.init(); resetDesk(); };
const mp = initMusicPanel({ toast });
addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (osOpen()) closeOS(); closeModals(); closeDrawer(); setActive('desk'); } });
window.addEventListener('langchange', () => { buildCards(); if (curBook && $('#reader').classList.contains('show')) renderPage(); if ($('#shelf').classList.contains('show')) openShelf(); pmRender(); });
$('#enter').onclick = () => {
  A.init(); $('#intro').classList.add('gone');
  if (!A.isMusic()) { A.setMusic(true); syncMusicUI(); }
  A.sfx('click'); setTimeout(() => $('#hint').classList.add('hide'), 10000);
};

/* ---------- ribbon navbar + sliding segments ---------- */
function initNav() {
  const rails = $('.ribbons'), ribs = [...rails.querySelectorAll('.rib')];
  rails.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; ribs.forEach(b => { const r = b.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), f = Math.exp(-(dx * dx) / 9000); b.style.setProperty('--rot', (-Math.sign(dx) * f * 9 * Math.min(1, Math.abs(dx) / 26 + 0.2)).toFixed(2) + 'deg'); }); });
  rails.addEventListener('pointerleave', () => ribs.forEach(b => b.style.setProperty('--rot', '0deg')));
  ribs.forEach(b => b.addEventListener('click', () => { b.classList.remove('swing'); void b.offsetWidth; b.classList.add('swing'); }));
  document.querySelectorAll('.seg').forEach(seg => {
    const th = document.createElement('span'); th.className = 'thumb'; seg.classList.add('slide'); seg.prepend(th);
    const upd = () => { const on = seg.querySelector('button.on'); if (!on) { th.style.opacity = 0; return; } th.style.opacity = 1; th.style.width = on.offsetWidth + 'px'; th.style.transform = `translateX(${on.offsetLeft}px)`; };
    new MutationObserver(upd).observe(seg, { attributes: true, subtree: true, attributeFilter: ['class'] });
    addEventListener('resize', upd); window.addEventListener('langchange', () => setTimeout(upd, 60)); setTimeout(upd, 120); setTimeout(upd, 600);
  });
}
initNav();
function initAutoHide() {
  const body = document.body; let tmr = 0;
  const busy = () => !SET.autohide || $('.nav').matches(':hover') || $('.dockbar').matches(':hover') || $('#lampPop').classList.contains('open') || $('#explore').classList.contains('open') || !!document.querySelector('.modal.open') || osOpen() || !$('#intro').classList.contains('gone');
  const hide = () => { if (busy()) { tmr = setTimeout(hide, 1500); return; } body.classList.add('ui-hidden'); };
  const show = () => { body.classList.remove('ui-hidden'); clearTimeout(tmr); tmr = setTimeout(hide, 4500); };
  addEventListener('pointermove', (e) => { if (e.clientY < 90 || e.clientY > innerHeight - 90) show(); });
  addEventListener('pointerdown', (e) => { if (e.clientY < 90 || e.clientY > innerHeight - 90) show(); else if (e.target === canvas) { clearTimeout(tmr); tmr = setTimeout(hide, 700); } });
  addEventListener('keydown', show); $('#tabTop').onclick = show; $('#tabBot').onclick = show;
  window.__showUI = show; show();
}
initAutoHide();

/* ================= go ================= */
apply(); initGadgets(); buildCards(); buildSettings(); buildExtras(); applySettings(); setTime('golden', true); snapTime(); drawSky(0); drawClock();
setGoal(); resize(); camPos.copy(goalPos); lookCur.copy(goalLook);
for (let i = 0; i < 260; i++) world.step(1 / 60); // let the stacks settle
items.forEach(o => { if (o.body) { o.home = { p: o.body.position.clone(), q: o.body.quaternion.clone() }; o.root.position.copy(o.body.position); o.root.quaternion.copy(o.body.quaternion); } });
ready = true;
const url = new URLSearchParams(location.search);
if (url.get('t') && TOD[url.get('t')]) { setTime(url.get('t'), true); snapTime(); drawSky(0); if (url.get('lamp') === '1') { setLamp(true); lampK = 1; } }
if (url.get('ax')) { lampAimGoal.set(+url.get('ax'), 0, +url.get('az') || 0); lampAim.copy(lampAimGoal); }
if (url.get('skip')) { $('#intro').classList.add('gone'); }
if (url.get('h')) { hour = +url.get('h'); applyHour(); snapTime(); drawSky(0); }
if (url.get('wx')) setWeather(url.get('wx'), true);
if (url.get('fan')) { fanLvl = +url.get('fan'); fanK = fanLvl ? 1 : 0; }
if (url.get('drawer')) setTimeout(() => toggleDrawer(), 400);
if (url.get('win') === '1') setWindow(true, true);
if (url.get('fp')) setFP(true, true);
if (url.get('open') === 'phone') setTimeout(() => openPhoneUI(), 300);
if (url.get('open') === 'news') setTimeout(() => openNewsUI(), 300);
if (url.get('open') === 'settings') setTimeout(() => openSettings(), 300);
if (url.get('open') === 'board') setTimeout(() => openBoardUI(), 300);
if (url.get('open') === 'music') setTimeout(() => { $('#musicPop').classList.add('open'); mp.sync(); }, 300);
if (url.get('open') === 'laptop') setTimeout(() => zoomLaptop(), 300);
if (url.get('open') === 'book') setTimeout(() => openBook('polity'), 300);

const clk = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clk.getDelta(), 0.05), time = clk.elapsedTime;
  if (drag) {
    ray.setFromCamera(ndc, camera); plane.constant = -dragLift;
    if (ray.ray.intersectPlane(plane, tmp)) {
      const b = drag.body, tx = clamp(tmp.x + dragOff.x, -4.1, 4.1), tz = clamp(tmp.z + dragOff.z, -1.9, 3.6);
      b.velocity.set((tx - b.position.x) * 14, (dragLift - b.position.y) * 14, (tz - b.position.z) * 14);
      const sp = b.velocity.length(); if (sp > 45) b.velocity.scale(45 / sp, b.velocity);
      b.angularVelocity.scale(0.9, b.angularVelocity); b.wakeUp();
    }
  }
  world.step(1 / 60, dt, 3);
  for (const o of items.slice()) {
    if (!o.body) continue;
    o.root.position.copy(o.body.position); o.root.quaternion.copy(o.body.quaternion);
    if (o.body.position.y < -4 && o !== drag) { if (o.drawerItem) { dropItem(o); continue; } o.body.position.copy(o.home.p); o.body.position.y += 2; o.body.velocity.setZero(); o.body.angularVelocity.setZero(); }
  }
  updateLampAim(dt); envUpdate(dt, time); birds.update(dt, time); updateRoom(dt); mp.draw(); drawClock();
  const k = 1 - Math.exp(-dt * 3.2);
  const zk = mode === 'desk' && !fp ? zoomK : 1;
  _gp.copy(goalLook).lerp(goalPos, zk); camPos.lerp(_gp, k); lookCur.lerp(goalLook, k);
  par.lerp(mode === 'desk' ? parGoal : _z.set(0, 0, 0), 1 - Math.exp(-dt * 3));
  const ky = 1 - Math.exp(-dt * 8); yaw += ((mode === 'desk' ? yawG : 0) - yaw) * ky; pitch += ((mode === 'desk' ? pitchG : 0) - pitch) * ky;
  camera.position.copy(camPos).add(par);
  _dir.copy(lookCur).sub(camPos).applyAxisAngle(_up, yaw); _right.crossVectors(_dir, _up).normalize(); _dir.applyAxisAngle(_right, pitch);
  camera.lookAt(_tgt.copy(camera.position).add(_dir));
  const fovG = fp && mode === 'desk' ? clamp(68 * zoomK, 25, 105) : 42; if (Math.abs(camera.fov - fovG) > 0.05) { camera.fov += (fovG - camera.fov) * k; camera.updateProjectionMatrix(); }
  renderer.render(scene, camera);
}
frame();
window.__desk = { setWeather, strike, toggleDrawer, cycleFan, items,  applyHour, curtains, doors, setHour: (h) => { hour = h; applyHour(); }, pickAt: (x, y) => { setNdc({ clientX: x, clientY: y }); const h = pick(); return h && h.item.id; }, setWindow, setFP, birds, setTime, setLamp, openBook, zoomLaptop, quake, THREE, scene, camera };
