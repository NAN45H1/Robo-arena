import * as THREE from 'three';

export const DIFFICULTY = {
  easy: { label: 'Easy', aimError: 2.6, reaction: 0.75, turret: 2.2, lead: 0.3, cone: 0.25, strafe: 0.55, boost: 0.08, cover: 0.0, heal: 0.25 },
  normal: { label: 'Normal', aimError: 1.35, reaction: 0.4, turret: 3.8, lead: 0.75, cone: 0.15, strafe: 0.8, boost: 0.25, cover: 0.45, heal: 0.4 },
  hard: { label: 'Hard', aimError: 0.6, reaction: 0.2, turret: 6.5, lead: 1.0, cone: 0.1, strafe: 1.0, boost: 0.5, cover: 0.8, heal: 0.5 },
};

const _eye = new THREE.Vector3(), _tc = new THREE.Vector3(), _want = new THREE.Vector3(), _aim = new THREE.Vector3();
const _fwd = new THREE.Vector3(), _to = new THREE.Vector3(), _threat = new THREE.Vector3(), _probe = new THREE.Vector3();

export class AIController {
  constructor(robot, target, world, level) {
    this.r = robot;
    this.t = target;
    this.w = world;
    this.p = DIFFICULTY[level] || DIFFICULTY.normal;
    this.move = new THREE.Vector3();
    this.err = new THREE.Vector3();
    this.errGoal = new THREE.Vector3();
    this.goal = new THREE.Vector3();
    this.lastSeen = new THREE.Vector3();
    this.unstick = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.r.turretSpeed = this.p.turret;
    this.mode = 'hunt';
    this.think = 0;
    this.seen = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 2;
    this.errT = 0;
    this.stuckT = 0;
    this.unstickT = 0;
    this.dodgeT = 2;
    this.pressure = 0;
    this.hpPrev = this.r.maxHp;
    this.move.set(0, 0, 0);
    this.lastSeen.copy(this.t.pos);
  }

  update(dt) {
    const r = this.r, t = this.t, A = this.w.arena, P = this.p, inp = r.input;
    inp.fire = false;
    if (!r.alive || !t.alive || !this.w.combatActive) { inp.moveX = inp.moveZ = 0; return; }

    const eye = _eye.set(r.pos.x, r.pos.y + r.rig.aimHeight, r.pos.z);
    const tc = t.center(_tc);
    const los = A.lineClear(eye, tc);
    if (los) { this.seen += dt; this.lastSeen.copy(t.pos); } else this.seen = 0;
    this.pressure = this.pressure * Math.exp(-dt * 1.5) + Math.max(0, this.hpPrev - r.hp);
    this.hpPrev = r.hp;

    const dx = t.pos.x - r.pos.x, dz = t.pos.z - r.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const tx = dx / dist, tz = dz / dist;

    this.think -= dt;
    if (this.think <= 0) { this.think = 0.25 + Math.random() * 0.15; this.decide(los); }

    // --- where do we want to go?
    const want = _want.set(0, 0, 0);
    if (this.mode === 'fight') {
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = 1.2 + Math.random() * 2.4; }
      const radial = THREE.MathUtils.clamp((dist - r.weapon.ideal) / 6, -1, 1);
      const s = this.strafe * P.strafe;
      want.set(tx * radial - tz * s, 0, tz * radial + tx * s);
    } else if (this.mode === 'hunt') {
      want.set(this.lastSeen.x - r.pos.x, 0, this.lastSeen.z - r.pos.z);
      if (want.lengthSq() < 9) want.set(dx, 0, dz);
    } else {
      want.set(this.goal.x - r.pos.x, 0, this.goal.z - r.pos.z);
      if (want.lengthSq() < 2) want.set(0, 0, 0);
    }

    let mv = this.steer(want, dt);
    const wantMove = want.lengthSq() > 0.01;
    if (wantMove && r.speedNow < 1.5 && this.unstickT <= 0) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 0.7) {
      this.stuckT = 0;
      this.unstickT = 0.7 + Math.random() * 0.6;
      const a = Math.random() * Math.PI * 2;
      this.unstick.set(Math.sin(a), 0, Math.cos(a));
      if (r.mob.jump) inp.jump = true;
    }
    if (this.unstickT > 0) { this.unstickT -= dt; mv = this.unstick; }
    inp.moveX = mv.x;
    inp.moveZ = mv.z;

    // Hop over low cover when walking.
    if (r.mob.jump > 0 && r.onGround && wantMove) {
      const ml = Math.hypot(mv.x, mv.z) || 1;
      const ahead = r.radius + 1.2;
      const b = A.blockingBox(r.pos.x + (mv.x / ml) * ahead, r.pos.z + (mv.z / ml) * ahead, r.radius * 0.8, r.pos.y, 0.55);
      if (b && b.maxY - r.pos.y < 2.5) inp.jump = true;
    }

    // Evasive boosts / jumps under fire.
    this.dodgeT -= dt;
    if (this.dodgeT <= 0) {
      this.dodgeT = 1.2 + Math.random() * 2.5;
      if (los && (this.pressure > 45 || Math.random() < P.boost * 0.5) && Math.random() < P.boost + 0.1) {
        if (r.mob.jump && Math.random() < 0.4) inp.jump = true;
        else inp.boost = true;
      }
    }

    // --- aiming with lead + wandering error
    this.errT -= dt;
    if (this.errT <= 0) {
      this.errT = 0.25 + Math.random() * 0.5;
      this.errGoal.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.6, Math.random() - 0.5).multiplyScalar(2 * P.aimError);
    }
    this.err.lerp(this.errGoal, 1 - Math.exp(-dt * 5));
    const wp = r.weapon;
    const flight = wp.kind === 'beam' ? 0 : dist / wp.speed;
    const aim = _aim.copy(tc).addScaledVector(t.vel, flight * P.lead);
    aim.y = tc.y + t.vel.y * flight * P.lead * 0.3;
    const errScale = 0.6 + dist / 35 + Math.hypot(t.vel.x, t.vel.z) / 15;
    aim.addScaledVector(this.err, errScale);
    if (los) inp.aimPoint.copy(aim);
    else inp.aimPoint.set(this.lastSeen.x, tc.y, this.lastSeen.z);

    if (los && this.seen > P.reaction) {
      const f = r.aimForward(_fwd);
      const to = _to.copy(aim).sub(eye).normalize();
      const aligned = f.dot(to) > Math.cos(P.cone);
      const inRange = dist < wp.range * (wp.kind === 'beam' ? 0.95 : 0.85);
      inp.fire = aligned && inRange;
    }
    if (wp.mag && !los && r.ammo < wp.mag * 0.5 && r.reloadT <= 0) inp.reload = true;
  }

  decide(los) {
    const r = this.r, P = this.p, A = this.w.arena;
    const hpF = r.hp / r.maxHp;
    const pk = A.nearestPickup(r.pos);
    if (pk && hpF < P.heal && pk.dist < 70) { this.mode = 'heal'; this.goal.copy(pk.pos); return; }
    const weak = r.reloadT > 0.8 || r.overheated;
    if (this.mode === 'cover' && weak) return;
    if (weak && los && Math.random() < P.cover) {
      if (this.findCover()) { this.mode = 'cover'; return; }
    }
    this.mode = los ? 'fight' : 'hunt';
  }

  findCover() {
    const r = this.r, t = this.t, A = this.w.arena;
    const threat = _threat.set(t.pos.x, t.pos.y + t.rig.aimHeight, t.pos.z);
    let best = Infinity, found = false;
    for (const b of A.boxes) {
      if (b.wall || b.maxY < 2.8) continue;
      let ox = b.cx - t.pos.x, oz = b.cz - t.pos.z;
      const ol = Math.hypot(ox, oz) || 1;
      ox /= ol; oz /= ol;
      const edge = Math.min(Math.abs(ox) > 1e-3 ? b.w / 2 / Math.abs(ox) : Infinity, Math.abs(oz) > 1e-3 ? b.d / 2 / Math.abs(oz) : Infinity);
      const off = edge + r.radius + 0.8;
      const px = b.cx + ox * off, pz = b.cz + oz * off;
      const lim = A.half - r.radius - 1;
      if (Math.abs(px) > lim || Math.abs(pz) > lim) continue;
      if (A.blockingBox(px, pz, r.radius, 0, 0.55)) continue;
      if (A.lineClear(threat, _probe.set(px, r.rig.aimHeight * 0.8, pz))) continue;
      const d = Math.hypot(px - r.pos.x, pz - r.pos.z);
      if (d < 32 && d < best) { best = d; this.goal.set(px, 0, pz); found = true; }
    }
    return found;
  }

  // Context steering: score 16 headings by how well they match the desired
  // direction, penalising any heading that runs into an obstacle.
  steer(want, dt) {
    const r = this.r, A = this.w.arena;
    const wl = Math.hypot(want.x, want.z);
    if (wl < 0.05) { this.move.multiplyScalar(Math.exp(-dt * 6)); return this.move; }
    const wx = want.x / wl, wz = want.z / wl;
    const mag = Math.min(1, wl);
    let best = -1e9, bx = 0, bz = 0;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      let s = dx * wx + dz * wz + (dx * this.move.x + dz * this.move.z) * 0.2;
      for (const k of [1.6, 3.4]) {
        const reach = r.radius * 0.5 + k;
        const b = A.blockingBox(r.pos.x + dx * reach, r.pos.z + dz * reach, r.radius * 0.9, r.pos.y, 0.55);
        if (b) {
          const jumpable = r.mob.jump > 0 && b.maxY - r.pos.y < 2.5;
          s -= jumpable ? 0.5 : k < 2 ? 2.5 : 1.2;
          break;
        }
      }
      if (s > best) { best = s; bx = dx; bz = dz; }
    }
    const f = 1 - Math.exp(-dt * 8);
    this.move.x += (bx * mag - this.move.x) * f;
    this.move.z += (bz * mag - this.move.z) * f;
    return this.move;
  }
}
