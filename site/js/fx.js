import * as THREE from 'three';
import { rayCylinder } from './arena.js';

const Z = new THREE.Vector3(0, 0, 1);
const Y = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _col = new THREE.Color();

const VS = `
attribute vec3 pcolor; attribute float palpha; attribute float psize;
uniform float scale;
varying vec3 vColor; varying float vAlpha;
void main() {
  vColor = pcolor; vAlpha = palpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = psize * scale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
varying vec3 vColor; varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor, a * vAlpha);
}`;

class Particles {
  constructor(scene, max, blending) {
    this.max = max;
    this.n = 0;
    const F = (k) => new Float32Array(max * k);
    this.p = F(3); this.v = F(3); this.c = F(3);
    this.a = F(1); this.sz = F(1); this.life = F(1); this.ml = F(1);
    this.s0 = F(1); this.s1 = F(1); this.g = F(1); this.dr = F(1); this.a0 = F(1);
    const geo = new THREE.BufferGeometry();
    const attr = (arr, k) => new THREE.BufferAttribute(arr, k).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [attr(this.p, 3), attr(this.c, 3), attr(this.a, 1), attr(this.sz, 1)];
    geo.setAttribute('position', this.attrs[0]);
    geo.setAttribute('pcolor', this.attrs[1]);
    geo.setAttribute('palpha', this.attrs[2]);
    geo.setAttribute('psize', this.attrs[3]);
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({ uniforms: { scale: { value: 600 } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = blending === THREE.AdditiveBlending ? 3 : 2;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, grav = 0, drag = 0, a0 = 1) {
    if (this.n >= this.max) return;
    const i = this.n++, i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.c[i3] = r; this.c[i3 + 1] = g; this.c[i3 + 2] = b;
    this.life[i] = life; this.ml[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.g[i] = grav; this.dr[i] = drag; this.a0[i] = a0; this.a[i] = a0; this.sz[i] = s0;
  }

  kill(i) {
    const j = --this.n;
    if (i === j) return;
    const i3 = i * 3, j3 = j * 3;
    for (const arr of [this.p, this.v, this.c]) { arr[i3] = arr[j3]; arr[i3 + 1] = arr[j3 + 1]; arr[i3 + 2] = arr[j3 + 2]; }
    for (const arr of [this.a, this.sz, this.life, this.ml, this.s0, this.s1, this.g, this.dr, this.a0]) arr[i] = arr[j];
  }

  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); continue; }
      const k = 1 - this.life[i] / this.ml[i];
      const i3 = i * 3;
      const dmp = Math.max(0, 1 - this.dr[i] * dt);
      this.v[i3] *= dmp; this.v[i3 + 1] = (this.v[i3 + 1] - this.g[i] * dt) * dmp; this.v[i3 + 2] *= dmp;
      this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
      if (this.p[i3 + 1] < 0.05 && this.g[i] > 0) { this.p[i3 + 1] = 0.05; this.v[i3 + 1] *= -0.3; }
      this.sz[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      this.a[i] = this.a0[i] * (1 - k * k);
      i++;
    }
    for (const a of this.attrs) a.needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  }
}

const rnd = (a, b) => a + Math.random() * (b - a);

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.glow = new Particles(scene, 4000, THREE.AdditiveBlending);
    this.smoke = new Particles(scene, 1200, THREE.NormalBlending);
    this.projectiles = [];
    this.pools = { bullet: [], shell: [], rocket: [] };
    this.geo = {
      bullet: new THREE.BoxGeometry(0.1, 0.1, 1.9),
      shell: new THREE.SphereGeometry(0.28, 10, 8),
      rocket: new THREE.CylinderGeometry(0.1, 0.14, 0.9, 8).rotateX(Math.PI / 2),
    };
    this.projMats = new Map();
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 30, 2);
      l.position.set(0, -50, 0);
      scene.add(l);
      this.lights.push({ l, t: 0, dur: 1, peak: 0 });
    }
    this.pulses = [];
    const ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
    const coreGeo = new THREE.SphereGeometry(1, 16, 12);
    for (let i = 0; i < 8; i++) {
      for (const [geo, kind] of [[ringGeo, 'ring'], [coreGeo, 'core']]) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        m.visible = false;
        m.renderOrder = 4;
        scene.add(m);
        this.pulses.push({ m, kind, t: 0, dur: 1, s0: 0, s1: 1, active: false });
      }
    }
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    this.beams = new Map();
  }

  setViewport(heightPx, fovDeg) {
    const s = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.glow.mat.uniforms.scale.value = s;
    this.smoke.mat.uniforms.scale.value = s;
  }

  projMat(kind, hex) {
    const key = kind + hex;
    let m = this.projMats.get(key);
    if (!m) {
      const k = kind === 'bullet' ? 4 : 3;
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) });
      this.projMats.set(key, m);
    }
    return m;
  }

  spawnProjectile(kind, pos, dir, speed, o) {
    let mesh = this.pools[kind].pop();
    if (!mesh) {
      mesh = new THREE.Mesh(this.geo[kind], this.projMat(kind, o.color));
      this.scene.add(mesh);
    }
    mesh.material = this.projMat(kind, o.color);
    mesh.visible = true;
    mesh.position.copy(pos);
    mesh.quaternion.setFromUnitVectors(Z, dir);
    this.projectiles.push({
      kind, mesh, speed, pos: pos.clone(), vel: dir.clone().multiplyScalar(speed),
      owner: o.owner, damage: o.damage, splash: o.splash || 0, homing: o.homing || 0,
      target: o.target || null, color: o.color, life: o.life,
    });
  }

  removeProjectile(i) {
    const p = this.projectiles[i];
    p.mesh.visible = false;
    this.pools[p.kind].push(p.mesh);
    this.projectiles[i] = this.projectiles[this.projectiles.length - 1];
    this.projectiles.pop();
  }

  flash(pos, hex, peak, dur) {
    let best = this.lights[0];
    for (const L of this.lights) if (L.t < best.t) best = L;
    best.l.position.copy(pos);
    best.l.color.set(hex);
    best.peak = peak; best.dur = dur; best.t = dur;
    best.l.intensity = peak;
  }

  pulse(kind, pos, hex, s0, s1, dur, opacity = 1) {
    const P = this.pulses.find((q) => !q.active && q.kind === kind) || this.pulses.find((q) => q.kind === kind);
    P.active = true; P.t = 0; P.dur = dur; P.s0 = s0; P.s1 = s1; P.op = opacity;
    P.m.position.copy(pos);
    P.m.material.color.set(hex).multiplyScalar(2.5);
    P.m.visible = true;
  }

  muzzleFlash(pos, dir, hex, kind) {
    _col.set(hex);
    const n = kind === 'shell' ? 16 : kind === 'bullet' ? 4 : 7;
    const hotK = 3.5;
    for (let i = 0; i < n; i++) {
      const sp = rnd(3, kind === 'shell' ? 16 : 10);
      this.glow.emit(pos.x, pos.y, pos.z,
        dir.x * sp + rnd(-2, 2), dir.y * sp + rnd(-2, 2), dir.z * sp + rnd(-2, 2),
        rnd(0.05, 0.12), kind === 'shell' ? 1.6 : 0.8, 0.1, _col.r * hotK, _col.g * hotK, _col.b * hotK, 0, 4);
    }
    if (kind === 'shell') {
      for (let i = 0; i < 6; i++) this.smoke.emit(pos.x, pos.y, pos.z, dir.x * rnd(2, 5) + rnd(-1, 1), rnd(0.5, 2), dir.z * rnd(2, 5) + rnd(-1, 1), rnd(0.6, 1.1), 0.8, 2.6, 0.25, 0.25, 0.28, 0, 2, 0.45);
    }
    this.flash(pos, hex, kind === 'shell' ? 160 : kind === 'bullet' ? 30 : 50, kind === 'shell' ? 0.12 : 0.05);
  }

  sparks(pos, n, hex, speed = 10) {
    _col.set(hex);
    for (let i = 0; i < n; i++) {
      _d.set(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.3, 1) * speed);
      this.glow.emit(pos.x, pos.y, pos.z, _d.x, _d.y, _d.z, rnd(0.18, 0.45), 0.35, 0.05, _col.r * 4, _col.g * 4, _col.b * 4, 22, 1.5);
    }
  }

  explosion(pos, scale = 1, hex = 0xff7a2e) {
    const n = Math.round(26 * scale);
    for (let i = 0; i < n; i++) {
      _d.set(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(3, 10) * scale);
      const w = Math.random();
      this.glow.emit(pos.x, pos.y, pos.z, _d.x, _d.y + 2, _d.z, rnd(0.35, 0.75), rnd(1.6, 2.8) * scale, 0.4, 4.5, 1.6 + w, 0.35 + w * 0.3, -2, 3.5);
    }
    this.sparks(pos, Math.round(18 * scale), 0xffc070, 16 * Math.sqrt(scale));
    for (let i = 0; i < Math.round(12 * scale); i++) {
      this.smoke.emit(pos.x + rnd(-1, 1) * scale, pos.y + rnd(0, 1), pos.z + rnd(-1, 1) * scale, rnd(-2, 2), rnd(1.5, 4), rnd(-2, 2), rnd(1.2, 2.2), 2 * scale, 5.5 * scale, 0.11, 0.11, 0.13, -0.6, 1.2, 0.6);
    }
    this.pulse('core', pos, hex, 0.4 * scale, 3.2 * scale, 0.22);
    _t.set(pos.x, Math.max(0.1, pos.y < 3 ? 0.1 : pos.y), pos.z);
    this.pulse('ring', _t, hex, 0.5, 7 * scale, 0.4);
    this.flash(pos, 0xff9a50, 700 * scale, 0.35);
  }

  heal(pos) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = rnd(0.5, 2.2);
      this.glow.emit(pos.x + Math.cos(a) * r, pos.y + rnd(0, 1), pos.z + Math.sin(a) * r, 0, rnd(3, 7), 0, rnd(0.5, 1), 0.5, 0.1, 0.8, 4, 2, 0, 1);
    }
    this.pulse('ring', pos, 0x3dffa0, 0.5, 5, 0.5);
  }

  setBeam(key, a, b, hex) {
    let bm = this.beams.get(key);
    if (!bm) {
      const g = new THREE.Group();
      const core = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      const outer = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(2.5), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.add(core, outer);
      g.renderOrder = 4;
      this.scene.add(g);
      bm = { g, core, outer, used: false };
      this.beams.set(key, bm);
    }
    const len = a.distanceTo(b);
    bm.g.position.copy(a).add(b).multiplyScalar(0.5);
    bm.g.quaternion.setFromUnitVectors(Y, _t.subVectors(b, a).normalize());
    const j = 0.8 + Math.random() * 0.4;
    bm.core.scale.set(0.05 * j, len, 0.05 * j);
    bm.outer.scale.set(0.18 * j, len, 0.18 * j);
    bm.g.visible = true;
    bm.used = true;
    _col.set(hex);
    this.glow.emit(b.x, b.y, b.z, rnd(-3, 3), rnd(0, 4), rnd(-3, 3), 0.15, 0.9, 0.1, _col.r * 4, _col.g * 4, _col.b * 4, 10, 2);
    this.glow.emit(a.x, a.y, a.z, 0, 0, 0, 0.05, 0.7, 0.3, _col.r * 3, _col.g * 3, _col.b * 3);
  }

  update(dt, world) {
    // Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.splash) world.onProjectileHit(p, p.pos, null);
        this.removeProjectile(i);
        continue;
      }
      if (p.target && p.target.alive && p.homing) {
        const want = p.target.center(_c).sub(p.pos).normalize();
        const cur = _d.copy(p.vel).divideScalar(p.speed);
        if (cur.dot(want) > 0) {
          cur.lerp(want, Math.min(1, p.homing * dt)).normalize();
          p.vel.copy(cur).multiplyScalar(p.speed);
        }
      }
      const step = p.speed * dt;
      const dir = _d.copy(p.vel).divideScalar(p.speed);
      let tHit = world.arena.raycast(p.pos, dir, step);
      let hitBot = null;
      for (const r of world.robots) {
        if (r === p.owner || !r.alive) continue;
        const t = rayCylinder(p.pos, dir, r.pos.x, r.pos.z, r.radius, r.pos.y + 0.1, r.pos.y + r.height, step);
        if (t >= 0 && t < tHit) { tHit = t; hitBot = r; }
      }
      if (tHit <= step) {
        const pt = _c.copy(p.pos).addScaledVector(dir, tHit);
        world.onProjectileHit(p, pt, hitBot);
        this.removeProjectile(i);
        continue;
      }
      p.pos.addScaledVector(dir, step);
      p.mesh.position.copy(p.pos);
      p.mesh.quaternion.setFromUnitVectors(Z, dir);
      if (p.kind === 'rocket') {
        this.smoke.emit(p.pos.x, p.pos.y, p.pos.z, rnd(-0.4, 0.4), rnd(0.2, 0.8), rnd(-0.4, 0.4), rnd(0.5, 0.9), 0.35, 1.5, 0.3, 0.3, 0.33, 0, 1, 0.45);
        this.glow.emit(p.pos.x, p.pos.y, p.pos.z, -dir.x * 4, -dir.y * 4, -dir.z * 4, 0.1, 0.8, 0.2, 4, 2, 0.8);
      } else if (p.kind === 'shell') {
        this.glow.emit(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.18, 0.7, 0.1, 3.5, 1.4, 0.4);
      }
    }

    this.glow.update(dt);
    this.smoke.update(dt);

    for (const L of this.lights) {
      if (L.t <= 0) { L.l.intensity = 0; continue; }
      L.t -= dt;
      const k = Math.max(0, L.t / L.dur);
      L.l.intensity = L.peak * k * k;
    }

    for (const P of this.pulses) {
      if (!P.active) continue;
      P.t += dt;
      const k = P.t / P.dur;
      if (k >= 1) { P.active = false; P.m.visible = false; continue; }
      const e = 1 - (1 - k) * (1 - k);
      P.m.scale.setScalar(P.s0 + (P.s1 - P.s0) * e);
      P.m.material.opacity = (1 - k) * (P.op ?? 1);
    }

    for (const bm of this.beams.values()) {
      bm.g.visible = bm.used;
      bm.used = false;
    }
  }

  clear() {
    while (this.projectiles.length) this.removeProjectile(this.projectiles.length - 1);
    this.glow.n = 0;
    this.smoke.n = 0;
    this.glow.geo.setDrawRange(0, 0);
    this.smoke.geo.setDrawRange(0, 0);
    for (const L of this.lights) { L.t = 0; L.l.intensity = 0; }
    for (const P of this.pulses) { P.active = false; P.m.visible = false; }
    for (const bm of this.beams.values()) { bm.g.visible = false; bm.used = false; }
  }
}
