import * as THREE from 'three';
const rand = (a, b) => a + Math.random() * (b - a);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Little 3D birds that fly in through the open window, perch on the sill and sing.
export function createBirds({ scene, A, addItem, removeItem, getState, toast }) {
  const birds = [];
  const PERCH = [-1.3, -0.45, 0.4, 1.25].map(dx => V(-2.7 + dx, 2.42, -1.88));
  let spawnT = 2, ambT = 3;
  const PAL = [{ back: '#8b5a3c', front: '#e8733a' }, { back: '#4a8fd1', front: '#f2d64a' }, { back: '#8f7554', front: '#e1d3b5' }];
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });

  function model(kind) {
    const K = PAL[kind], g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 12), mat(K.back)); body.scale.set(1, 0.92, 1.4); g.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 12), mat(K.front)); belly.scale.set(0.95, 0.85, 1.2); belly.position.set(0, -0.03, 0.035); g.add(belly);
    const head = new THREE.Group(); head.position.set(0, 0.1, 0.13); head.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 12), mat(K.back)));
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 8), mat('#f2a33a')); beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.005, 0.1); head.add(beak);
    [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), mat('#111')); e.position.set(s * 0.04, 0.02, 0.065); head.add(e); });
    g.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.17), mat(K.back)); tail.position.set(0, 0, -0.2); tail.rotation.x = 0.25; g.add(tail);
    const wings = [-1, 1].map(s => {
      const w = new THREE.Group(); w.position.set(s * 0.1, 0.04, 0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.12), mat(K.back)); m.position.x = s * 0.1; w.add(m); w.userData.s = s; g.add(w); return w;
    });
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), new THREE.MeshBasicMaterial({ visible: false })); g.add(hit);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.scale.setScalar(1.5); g.userData = { head, wings };
    return g;
  }
  const flap = (b, a) => b.g.userData.wings.forEach(w => { w.rotation.z = w.userData.s * a; });

  function spawn() {
    const used = birds.filter(b => b.state !== 'leave').map(b => b.pi);
    const free = PERCH.map((_, i) => i).filter(i => !used.includes(i));
    if (!free.length) return;
    const pi = free[(Math.random() * free.length) | 0], perch = PERCH[pi].clone(), g = model((Math.random() * 3) | 0);
    const start = V(-2.7 + rand(-7, 7), rand(5, 8), -13);
    const curve = new THREE.CatmullRomCurve3([start, V(-2.7 + rand(-0.5, 0.5), 3.5, -2.4), perch.clone().add(V(0, 0.4, 0)), perch]);
    const b = { g, state: 'in', t: 0, dur: rand(3.4, 4.4), curve, pi, perch, sit: rand(16, 34), sing: rand(1, 2.4), singT: 0 };
    g.position.copy(start); b.item = addItem({ id: 'bird', root: g, onClick: () => leave(b, true) });
    birds.push(b);
    const { open } = getState(); A.chirp(0.22, !open, 1);
  }
  function leave(b, clicked) {
    if (b.state === 'leave') return;
    const p = b.g.position.clone();
    b.curve = new THREE.CatmullRomCurve3([p, p.clone().add(V(0, 0.5, -0.1)), V(-2.7 + rand(-0.5, 0.5), 3.6, -2.4), V(-2.7 + rand(-9, 9), rand(8, 11), -15)]);
    b.state = 'leave'; b.t = 0; b.dur = rand(2.4, 3);
    if (clicked) { A.chirp(0.55, false, (Math.random() * 2) | 0); toast('🐦 Tweet!'); }
  }
  function follow(b, tt) {
    const p = b.curve.getPoint(tt), tan = b.curve.getTangent(tt);
    b.g.position.copy(p); b.g.lookAt(p.clone().add(tan));
  }

  return {
    count: () => birds.length,
    update(dt, time) {
      const { open, tod } = getState();
      const welcome = open && (tod === 'morning' || tod === 'golden');
      spawnT -= dt;
      if (welcome && birds.length < 3 && spawnT <= 0) { spawn(); spawnT = rand(5, 11); }
      if (!welcome) birds.forEach(b => { if (b.state !== 'leave') leave(b, false); });
      ambT -= dt;
      if (ambT <= 0) { ambT = rand(3, 8); if (tod === 'morning') A.chirp(open ? 0.25 : 0.07, !open, (Math.random() * 2) | 0); }
      for (let i = birds.length - 1; i >= 0; i--) {
        const b = birds[i], u = b.g.userData;
        if (b.state === 'in') {
          b.t += dt / b.dur; const tt = Math.min(1, 1 - Math.pow(1 - b.t, 2));
          follow(b, tt); flap(b, Math.sin(time * 30) * 0.9 * (1 - tt * 0.4));
          if (b.t >= 1) { b.state = 'sit'; b.g.position.copy(b.perch); b.g.lookAt(b.perch.clone().add(V(rand(-0.6, 0.6), 0, 1))); flap(b, -0.25); }
        } else if (b.state === 'sit') {
          b.sit -= dt; b.sing -= dt;
          b.g.position.y = b.perch.y + Math.sin(time * 3 + i) * 0.004;
          if (b.sing <= 0) { b.singT = 1; b.sing = rand(2.6, 6); A.chirp(0.5, !open, i % 2); }
          if (b.singT > 0) { b.singT -= dt * 0.9; u.head.rotation.x = -0.35 * Math.abs(Math.sin(time * 16)); u.head.rotation.y = Math.sin(time * 5) * 0.3; }
          else { u.head.rotation.x *= 0.8; u.head.rotation.y *= 0.9; }
          if (b.sit <= 0) leave(b, false);
        } else {
          b.t += dt / b.dur; const tt = Math.min(1, b.t * b.t * 0.7 + b.t * 0.3);
          follow(b, tt); flap(b, Math.sin(time * 30) * 0.9);
          if (b.t >= 1) { removeItem(b.item); birds.splice(i, 1); }
        }
      }
    }
  };
}
