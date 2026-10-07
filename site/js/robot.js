import * as THREE from 'three';
import { MOBILITY, BODIES, WEAPONS, buildRobotMesh, disposeRig } from './parts.js';

const GRAVITY = 32;
const STEP = 0.55;
export const BOOST_CD = 3.5;

const wrap = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export class Robot {
  constructor(world, loadout, { paint, glow, name, isPlayer }) {
    this.world = world;
    this.loadout = { ...loadout };
    this.mob = MOBILITY[loadout.mobility];
    this.body = BODIES[loadout.body];
    this.weapon = WEAPONS[loadout.weapon];
    this.paint = paint;
    this.glow = glow;
    this.name = name;
    this.isPlayer = isPlayer;
    this.id = isPlayer ? 'p' : 'e';
    this.maxHp = this.body.hp + this.mob.hp;
    this.armor = this.mob.armor;
    this.maxSpeed = this.mob.speed * this.body.speedMul;
    this.radius = this.body.radius;
    this.turretSpeed = 14;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.input = { moveX: 0, moveZ: 0, jump: false, boost: false, reload: false, fire: false, aimPoint: new THREE.Vector3() };
    this.stats = { shots: 0, hits: 0, dmg: 0 };
    this.rig = null;
  }

  reset(x, z, yaw) {
    if (this.rig) disposeRig(this.rig);
    this.rig = buildRobotMesh(this.loadout, this.paint, this.glow);
    this.height = this.rig.height;
    this.world.scene.add(this.rig.root);

    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.baseYaw = yaw;
    this.aimYaw = yaw;
    this.aimPitch = 0;
    this.hp = this.maxHp;
    this.alive = true;
    this.onGround = true;
    this.reverse = false;
    this.speedNow = 0;
    this.ammo = this.weapon.mag || 0;
    this.reloadT = 0;
    this.cooldown = 0;
    this.heat = 0;
    this.overheated = false;
    this.beamOn = false;
    this.muzzleIdx = 0;
    this.spin = 0;
    this.boostT = 0;
    this.boostCd = 0;
    this.walkPhase = 0;
    this.flashT = 0;
    Object.assign(this.input, { moveX: 0, moveZ: 0, jump: false, boost: false, reload: false, fire: false });
    this.input.aimPoint.set(x + Math.sin(yaw) * 30, 2, z + Math.cos(yaw) * 30);
    this.syncRig(0, 0);
  }

  destroy() {
    if (this.rig) disposeRig(this.rig);
    this.rig = null;
  }

  center(out) {
    return out.set(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z);
  }

  aimForward(out) {
    const cp = Math.cos(this.aimPitch);
    return out.set(Math.sin(this.aimYaw) * cp, Math.sin(this.aimPitch), Math.cos(this.aimYaw) * cp);
  }

  update(dt) {
    const w = this.world, inp = this.input;
    const px = this.pos.x, pz = this.pos.z;

    if (!this.alive) {
      this.vel.x = damp(this.vel.x, 0, 4, dt);
      this.vel.z = damp(this.vel.z, 0, 4, dt);
    } else {
      let mx = inp.moveX, mz = inp.moveZ;
      const ml = Math.hypot(mx, mz);
      if (ml > 1) { mx /= ml; mz /= ml; }

      this.boostCd = Math.max(0, this.boostCd - dt);
      if (inp.boost) {
        inp.boost = false;
        if (this.boostCd <= 0 && ml > 0.2) {
          this.boostT = 0.32;
          this.boostCd = BOOST_CD;
          const k = (this.maxSpeed * 2.6) / Math.hypot(mx, mz);
          this.vel.x = mx * k;
          this.vel.z = mz * k;
          w.onBoost(this);
        }
      }

      let speed = this.maxSpeed, accel = this.mob.accel;
      if (this.boostT > 0) { this.boostT -= dt; speed *= 2.6; accel *= 4; }
      if (!this.onGround) accel *= 0.4;
      let dvx = mx * speed - this.vel.x, dvz = mz * speed - this.vel.z;
      const dl = Math.hypot(dvx, dvz), st = accel * dt;
      if (dl > st) { dvx *= st / dl; dvz *= st / dl; }
      this.vel.x += dvx;
      this.vel.z += dvz;

      if (inp.jump) {
        inp.jump = false;
        if (this.onGround && this.mob.jump > 0) {
          this.vel.y = this.mob.jump;
          this.onGround = false;
          w.onJump(this);
        }
      }
    }

    this.vel.y -= GRAVITY * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;
    const arena = w.arena;
    let hit = arena.resolveCircle(this.pos, this.radius, this.pos.y, STEP);
    hit = arena.resolveCircle(this.pos, this.radius, this.pos.y, STEP) || hit;
    if (hit && dt > 0) {
      this.vel.x = (this.pos.x - px) / dt;
      this.vel.z = (this.pos.z - pz) / dt;
    }
    const g = arena.groundHeight(this.pos.x, this.pos.z, this.radius * 0.6, this.pos.y, STEP);
    if (this.pos.y <= g) {
      if (!this.onGround && this.vel.y < -9) w.onLand(this);
      this.pos.y = g;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    const hs = Math.hypot(this.pos.x - px, this.pos.z - pz) / Math.max(dt, 1e-5);
    this.speedNow = hs;

    if (this.alive) {
      // Chassis turns toward travel direction (or drives in reverse if that is quicker).
      const vs = Math.hypot(this.vel.x, this.vel.z);
      if (vs > 1.2) {
        let target = Math.atan2(this.vel.x, this.vel.z);
        let diff = wrap(target - this.baseYaw);
        this.reverse = false;
        if (Math.abs(diff) > 2.0) { target += Math.PI; diff = wrap(target - this.baseYaw); this.reverse = true; }
        const tr = this.mob.turn * dt;
        this.baseYaw = wrap(this.baseYaw + clamp(diff, -tr, tr));
      }
      // Torso/weapons track the aim point.
      const ap = inp.aimPoint;
      const ax = ap.x - this.pos.x, az = ap.z - this.pos.z;
      const ay = ap.y - (this.pos.y + this.rig.aimHeight);
      const tYaw = Math.atan2(ax, az);
      const tPitch = clamp(Math.atan2(ay, Math.hypot(ax, az)), -0.45, 0.6);
      const tr = this.turretSpeed * dt;
      this.aimYaw = wrap(this.aimYaw + clamp(wrap(tYaw - this.aimYaw), -tr, tr));
      this.aimPitch += clamp(tPitch - this.aimPitch, -tr, tr);
      this.updateWeapon(dt);
    }
    this.syncRig(dt, hs);
  }

  updateWeapon(dt) {
    const wp = this.weapon, inp = this.input, w = this.world;
    const firing = inp.fire && w.combatActive;

    if (wp.kind === 'beam') {
      inp.reload = false;
      const on = firing && !this.overheated;
      if (on) {
        this.heat += wp.heatRate * dt;
        if (this.heat >= 1) { this.heat = 1; this.overheated = true; w.onOverheat(this); }
      } else {
        this.heat = Math.max(0, this.heat - wp.coolRate * dt);
        if (this.overheated && this.heat <= 0) this.overheated = false;
      }
      this.beamOn = on;
      if (on) w.fireBeam(this, dt);
      return;
    }

    this.spin = damp(this.spin, firing && this.reloadT <= 0 ? 1 : 0, 5, dt);
    this.cooldown -= dt;
    if (this.reloadT > 0) {
      inp.reload = false;
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.reloadT = 0; this.ammo = wp.mag; w.onReloaded(this); }
      return;
    }
    if (inp.reload) {
      inp.reload = false;
      if (this.ammo < wp.mag) { this.startReload(); return; }
    }
    if (firing && this.cooldown <= 0 && this.ammo > 0) {
      if (wp.kind === 'bullet' && this.spin < 0.3) return;
      this.cooldown = wp.interval;
      this.ammo--;
      this.stats.shots++;
      w.fireProjectile(this);
      if (this.ammo <= 0) this.startReload();
    }
  }

  startReload() {
    this.reloadT = this.weapon.reload;
    this.world.onReload(this);
  }

  syncRig(dt, hs) {
    const rig = this.rig;
    rig.root.position.copy(this.pos);
    rig.base.rotation.y = this.baseYaw;
    rig.torso.rotation.y = this.aimYaw;
    if (this.alive) for (const p of rig.pivots) p.rotation.x = -this.aimPitch;

    const s = this.body.scale;
    const dist = hs * dt * (this.reverse ? -1 : 1);
    for (const wh of rig.wheels) wh.rotation.x += dist / (0.65 * s);
    for (const rl of rig.rollers) rl.rotation.x += dist / (0.3 * s);
    if (rig.treadTex) rig.treadTex.offset.y += (dist * 1.8) / s;
    for (const sp of rig.spinners) sp.rotation.z += this.spin * dt * 30;

    if (rig.legs && dt > 0) {
      const k = Math.min(1, hs / this.maxSpeed);
      this.walkPhase += (dist * 1.05) / s;
      const ph = this.walkPhase;
      let hl = Math.sin(ph) * 0.6 * k, hr = -hl;
      let kl = Math.max(0, -Math.cos(ph)) * 1.0 * k, kr = Math.max(0, Math.cos(ph)) * 1.0 * k;
      if (!this.onGround) { hl = hr = -0.45; kl = kr = 0.9; }
      const [L, R] = rig.legs;
      L.hip.rotation.x = damp(L.hip.rotation.x, hl, 18, dt);
      R.hip.rotation.x = damp(R.hip.rotation.x, hr, 18, dt);
      L.knee.rotation.x = damp(L.knee.rotation.x, kl, 18, dt);
      R.knee.rotation.x = damp(R.knee.rotation.x, kr, 18, dt);
      rig.inner.position.y = damp(rig.inner.position.y, Math.abs(Math.sin(ph)) * 0.14 * k * s, 12, dt);
    }

    if (this.flashT > 0) this.flashT -= dt;
    rig.mats.paint.emissive.setScalar(Math.max(0, this.flashT) * 5);
    rig.root.updateMatrixWorld(true);
  }

  wreck() {
    const m = this.rig.mats;
    m.paint.color.multiplyScalar(0.18);
    m.mid.color.multiplyScalar(0.35);
    m.glow.emissiveIntensity = 0;
    m.glass.emissiveIntensity = 0;
    m.paint.emissive.setScalar(0);
    this.flashT = 0;
    this.rig.inner.rotation.z = 0.28;
    this.rig.inner.rotation.x = -0.12;
    this.rig.inner.position.y = -0.35;
    for (const p of this.rig.pivots) p.rotation.x = 0.5;
    this.beamOn = false;
  }
}
