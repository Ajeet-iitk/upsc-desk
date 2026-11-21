import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import * as A from './audio.js';
import { t, apply, setLang, nextLang } from './i18n.js';
import { BOOKS } from './books.js';
import { initOS, openOS, closeOS, isOpen as osOpen, showApp } from './os.js';

const $ = (s) => document.querySelector(s);
const V3 = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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

/* ---------- window with live sky ---------- */
const sky = canvasTex(512, 400);
const win = new THREE.Group(); win.position.set(-2.7, 3.5, -2.2);
win.add(new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.2), new THREE.MeshBasicMaterial({ map: sky.tex, toneMapped: false })));
{
  const fm = std('#5a3b22', { roughness: 0.7 });
  [[3.0, 0.16, 0, 1.18], [3.0, 0.16, 0, -1.18], [0.16, 2.5, -1.46, 0], [0.16, 2.5, 1.46, 0], [0.07, 2.2, 0, 0], [2.8, 0.07, 0, 0.1]].forEach(([w, h, x, y]) => { const m = mesh(new THREE.BoxGeometry(w, h, 0.12), fm, x, y, 0.05); win.add(m); });
  win.add(mesh(new THREE.BoxGeometry(3.3, 0.12, 0.5), fm, 0, -1.3, 0.22));
}
addItem({ id: 'window', root: win, onClick: () => { const o = ['morning', 'golden', 'night']; setTime(o[(o.indexOf(todName) + 1) % 3]); } });

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
const _hp = new V3(); bulb.getWorldPosition(_hp); lampLight.position.copy(_hp);

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
  addItem({ id: 'cup', root: g, body: dyn(new CANNON.Cylinder(0.3, 0.22, 0.45, 14), 2.45, 0.24, 1.0, 0.5), sfx: 'ceramic', onClick: () => { A.sfx('ceramic', 0.5); toast('☕ Chai break?'); } });
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
let todName = 'golden', skyAnim = 3;
const cur = { sky1: C('#fff'), sky2: C('#fff'), sun: C('#fff'), hemiS: C('#fff'), hemiG: C('#fff'), celCol: C('#fff'), sil: C('#fff'), sunPos: new V3(), sunI: 0, hemiI: 0, exp: 1, celX: 0, celY: 0, stars: 0, lights: 0 };
const COLS = ['sky1', 'sky2', 'sun', 'hemiS', 'hemiG', 'celCol', 'sil'], NUMS = ['sunI', 'hemiI', 'exp', 'celX', 'celY', 'stars', 'lights'];
function snapTime() { const T = TOD[todName]; COLS.forEach(k => cur[k].set(T[k])); NUMS.forEach(k => cur[k] = T[k]); cur.sunPos.set(...T.sunPos); }
function stepTime(dt) {
  const T = TOD[todName], k = 1 - Math.exp(-dt * 2.4);
  COLS.forEach(c => cur[c].lerp(C(T[c]), k)); NUMS.forEach(n => cur[n] += (T[n] - cur[n]) * k); cur.sunPos.lerp(new V3(...T.sunPos), k);
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
  g.fillStyle = hex(cur.sil); bld.forEach(b => g.fillRect(b.x, h - b.h, b.w, b.h));
  g.beginPath(); g.arc(60, h - 60, 56, 0, 7); g.fill(); g.fillRect(56, h - 60, 8, 60); // tree
  g.fillStyle = `rgba(255,214,120,${cur.lights})`; bld.forEach((b, bi) => { for (let y = h - b.h + 14; y < h - 10; y += 22) for (let x = b.x + 6; x < b.x + b.w - 8; x += 14) if (((x * 7 + y * 13 + bi) | 0) % 3 === 0) g.fillRect(x, y, 6, 9); });
  sky.tex.needsUpdate = true;
}
let lampOn = false, lampK = 0;
function setTime(name, quiet) {
  todName = name; skyAnim = 4;
  document.body.dataset.theme = TOD[name].ui;
  document.querySelectorAll('#todSeg button').forEach(b => b.classList.toggle('on', b.dataset.tod === name));
  $('meta[name=theme-color]').content = { morning: '#d9c9a8', golden: '#3a2218', night: '#0b0f1f' }[name];
  if (name === 'night') setLamp(true); else if (name === 'morning') setLamp(false);
  if (A.setMood) { try { A.setMood(name); } catch (e) {} }
  if (!quiet) { toast(t('t_' + name)); A.sfx('whoosh'); }
}
function setLamp(on) { lampOn = on; $('#lampBtn').classList.toggle('on', on); }
function toggleLamp() { setLamp(!lampOn); A.sfx('click'); toast(t(lampOn ? 't_lamp_on' : 't_lamp_off')); }

function envUpdate(dt, time) {
  stepTime(dt);
  if (skyAnim > 0) { skyAnim -= dt; drawSky(time); } else if (cur.stars > 0.5 && ((time * 4) | 0) % 2 === 0 && ((time * 30) | 0) % 6 === 0) drawSky(time);
  sun.color.copy(cur.sun); sun.intensity = cur.sunI; sun.position.copy(cur.sunPos);
  hemi.color.copy(cur.hemiS); hemi.groundColor.copy(cur.hemiG); hemi.intensity = cur.hemiI;
  renderer.toneMappingExposure = cur.exp;
  lampK += ((lampOn ? 1 : 0) - lampK) * (1 - Math.exp(-dt * 7));
  lampLight.intensity = lampK * (30 + cur.lights * 150);
  bulbMat.color.set('#4a4a4a').lerp(C('#fff0c4'), lampK).multiplyScalar(1 + lampK * 0.6);
  screenGlow.intensity = 1.2 + cur.lights * 7;
  screenMesh.material.color.setScalar(0.85 + 0.15 * (1 - cur.lights));
}

/* ================= camera & input ================= */
let mode = 'desk', ready = false;
const camPos = new V3(), lookCur = new V3(), goalPos = new V3(), goalLook = new V3(), par = new V3(), parGoal = new V3();
function framing(a) { return clamp(3.5 / (0.384 * a) / 9.3, 1, 3); }
function setGoal() {
  const a = innerWidth / innerHeight, k = framing(a);
  if (mode === 'desk') { goalPos.set(0, 4.9 + (k - 1) * 1.3, 9.3 * k); goalLook.set(0, 1.75 - (k - 1) * 0.45, -0.6); }
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
  for (const h of ray.intersectObjects(pickRoots, true)) { let o = h.object; while (o && !o.userData.item) o = o.parent; if (o) return { item: o.userData.item, point: h.point }; }
  return null;
}
let panX = 0, panning = null;
function panLimit() { const d = goalPos.z - goalLook.z; return Math.max(0, 4.6 - d * 0.384 * (innerWidth / innerHeight)); }
let down = null, drag = null, dragOff = new V3(), dragLift = 1;
const modalOpen = () => osOpen() || !!document.querySelector('.modal.open') || !$('#intro').classList.contains('gone');
canvas.addEventListener('pointerdown', (ev) => {
  if (modalOpen() || mode !== 'desk') return;
  A.init(); setNdc(ev);
  const h = pick(); down = { x: ev.clientX, y: ev.clientY, t: performance.now(), item: h && h.item };
  closeDrawer();
  if (!h) panning = { x: ev.clientX, p: panX, pid: ev.pointerId };
  if (h && h.item.body) {
    drag = h.item; dragLift = 1.0 + (h.item.lift || 0);
    dragOff.set(h.item.body.position.x - h.point.x, 0, h.item.body.position.z - h.point.z);
    canvas.setPointerCapture(ev.pointerId); canvas.classList.add('grabbing'); A.sfx(h.item.sfx === 'paper' ? 'paper' : 'click', 0.4);
  }
});
canvas.addEventListener('pointermove', (ev) => {
  setNdc(ev); parGoal.set(ndc.x * 0.45, ndc.y * 0.25, 0);
  if (panning) { const d = goalPos.z - goalLook.z, wpp = (2 * d * 0.384 * (innerWidth / innerHeight)) / innerWidth; panX = clamp(panning.p - (ev.clientX - panning.x) * wpp, -panLimit(), panLimit()); canvas.classList.add('grabbing'); }
  if (!drag && ev.pointerType === 'mouse' && mode === 'desk' && !modalOpen()) canvas.classList.toggle('pointer', !!pick());
});
function endPointer(ev) {
  const was = drag; drag = null; panning = null; canvas.classList.remove('grabbing');
  if (!down) return;
  const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y), dt = performance.now() - down.t;
  if (moved < 9 && dt < 450 && down.item && down.item.onClick && !modalOpen()) down.item.onClick();
  else if (was && moved > 9) A.sfx(was.sfx === 'paper' ? 'paper' : 'wood', 0.25);
  down = null;
}
canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);

/* ================= UI helpers ================= */
let toastT;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600); }
function setActive(name) { document.querySelectorAll('.nav-links button').forEach(b => b.classList.toggle('active', b.dataset.go === name)); }
function closeDrawer() { $('#explore').classList.remove('open'); }
function closeModals() { document.querySelectorAll('.modal.open').forEach(m => { m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); }); }
function showModal(id) { closeModals(); closeDrawer(); const m = $('#' + id); m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); }
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
  items.forEach(o => { if (!o.body) return; o.body.position.copy(o.home.p); o.body.quaternion.copy(o.home.q); o.body.velocity.setZero(); o.body.angularVelocity.setZero(); });
  if (!quiet) toast(t('t_reset'));
}
function quake() {
  items.forEach(o => { if (!o.body) return; o.body.velocity.x += rand(-4, 4); o.body.velocity.y += rand(6, 11); o.body.velocity.z += rand(-3, 3); o.body.angularVelocity.set(rand(-5, 5), rand(-5, 5), rand(-5, 5)); });
  A.sfx('wood', 1); toast(t('t_quake'));
}
function tossBottle() { const o = items.find(i => i.id === 'bottle'); o.body.velocity.set(rand(-7, 7), 10, rand(2, 6)); o.body.angularVelocity.set(rand(-6, 6), 0, rand(-6, 6)); A.sfx('plastic', 0.8); }
function syncMusicUI() { $('#mPlay').textContent = A.isMusic() ? '❚❚' : '▶'; $('#mPlay').classList.toggle('on', A.isMusic()); $('#mRain').classList.toggle('on', A.isRain()); }

/* ---------- explore drawer ---------- */
const EX = [
  ['💻', 1, () => zoomLaptop()], ['🌙', 2, () => setTime('night')], ['🌇', 3, () => setTime('golden')], ['📚', 4, () => openShelf()],
  ['⏱️', 5, () => openPomo()], ['🌧', 6, () => { A.init(); A.setMusic(true); A.setRain(true); syncMusicUI(); toast(t('t_rain')); }], ['🌋', 7, () => quake()], ['🧴', 8, () => tossBottle()],
  ['✅', 9, () => zoomLaptop('syll')], ['🖼️', 10, () => quote()], ['🌐', 11, () => nextLang()], ['🧹', 12, () => resetDesk()]
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

/* ---------- wire up the chrome ---------- */
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { closeModals(); closeDrawer(); setActive('desk'); });
document.querySelectorAll('.modal').forEach(m => m.addEventListener('pointerdown', (e) => { if (e.target === m) { closeModals(); setActive('desk'); } }));
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
  A.init(); const g = b.dataset.go;
  if (g === 'desk') goDesk(); else if (g === 'laptop') zoomLaptop(); else if (g === 'books') openShelf(); else if (g === 'pomo') openPomo();
  else if (g === 'explore') { closeModals(); if (osOpen()) closeOS(); const d = $('#explore'); d.classList.toggle('open'); setActive(d.classList.contains('open') ? 'explore' : 'desk'); }
});
$('#brand').onclick = (e) => { e.preventDefault(); goDesk(); };
document.querySelectorAll('#langSeg button').forEach(b => b.onclick = () => { setLang(b.dataset.lang); A.sfx('click'); });
document.querySelectorAll('#todSeg button').forEach(b => b.onclick = () => { A.init(); setTime(b.dataset.tod); });
$('#lampBtn').onclick = () => { A.init(); toggleLamp(); };
$('#resetBtn').onclick = () => { A.init(); resetDesk(); };
$('#mPlay').onclick = () => { A.init(); A.setMusic(!A.isMusic()); syncMusicUI(); if (A.isMusic()) toast(t('t_music')); };
$('#mRain').onclick = () => { A.init(); A.setRain(!A.isRain()); syncMusicUI(); if (A.isRain()) toast(t('t_rain')); };
$('#mVol').oninput = (e) => A.setVolume(+e.target.value);
addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (osOpen()) closeOS(); closeModals(); closeDrawer(); setActive('desk'); } });
window.addEventListener('langchange', () => { buildCards(); if (curBook && $('#reader').classList.contains('show')) renderPage(); if ($('#shelf').classList.contains('show')) openShelf(); pmRender(); });
$('#enter').onclick = () => {
  A.init(); $('#intro').classList.add('gone');
  if (!A.isMusic()) { A.setMusic(true); syncMusicUI(); }
  A.sfx('click'); setTimeout(() => $('#hint').classList.add('hide'), 10000);
};

/* ================= go ================= */
apply(); buildCards(); setTime('golden', true); snapTime(); drawSky(0); drawClock();
setGoal(); resize(); camPos.copy(goalPos); lookCur.copy(goalLook);
for (let i = 0; i < 260; i++) world.step(1 / 60); // let the stacks settle
items.forEach(o => { if (o.body) { o.home = { p: o.body.position.clone(), q: o.body.quaternion.clone() }; o.root.position.copy(o.body.position); o.root.quaternion.copy(o.body.quaternion); } });
ready = true;
const url = new URLSearchParams(location.search);
if (url.get('t') && TOD[url.get('t')]) { setTime(url.get('t'), true); snapTime(); drawSky(0); if (url.get('lamp') === '1') { setLamp(true); lampK = 1; } }
if (url.get('skip')) { $('#intro').classList.add('gone'); }
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
  for (const o of items) {
    if (!o.body) continue;
    o.root.position.copy(o.body.position); o.root.quaternion.copy(o.body.quaternion);
    if (o.body.position.y < -4 && o !== drag) { o.body.position.copy(o.home.p); o.body.position.y += 2; o.body.velocity.setZero(); o.body.angularVelocity.setZero(); }
  }
  envUpdate(dt, time); drawClock();
  const k = 1 - Math.exp(-dt * 3.2);
  const px = mode === 'desk' ? panX : 0; camPos.lerp(tmp.copy(goalPos).setX(px), k); lookCur.lerp(tmp.copy(goalLook).setX(px), k);
  par.lerp(mode === 'desk' ? parGoal : tmp.set(0, 0, 0), 1 - Math.exp(-dt * 3));
  camera.position.copy(camPos).add(par); camera.lookAt(lookCur);
  renderer.render(scene, camera);
}
frame();
window.__desk = { setTime, setLamp, openBook, zoomLaptop, quake, THREE, scene, camera };
