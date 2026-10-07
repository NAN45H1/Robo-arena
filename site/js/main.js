import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BODIES, MOBILITY, WEAPONS, PAINTS, randomLoadout } from './parts.js';
import { Arena, rayCylinder } from './arena.js';
import { Robot } from './robot.js';
import { AIController, DIFFICULTY } from './ai.js';
import { FX } from './fx.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Garage } from './garage.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
document.body.classList.toggle('touch', isTouch);

// ---------------------------------------------------------------------------
// Renderer + post-processing
// ---------------------------------------------------------------------------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.4, 0.92);
composer.addPass(renderPass);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const sfx = new Sfx();
const input = new Input(canvas, isTouch);
const hud = new Hud();
const garage = new Garage(sfx);

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _piv = new THREE.Vector3(), _cam = new THREE.Vector3(), _o = new THREE.Vector3();
const lerpK = (k, dt) => 1 - Math.exp(-k * dt);

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------
class Game {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1000);
    this.arena = new Arena(this.scene);
    this.fx = new FX(this.scene);
    this.robots = [];
    this.player = null;
    this.enemy = null;
    this.ai = null;
    this.state = 'idle';
    this.camYaw = 0;
    this.camPitch = 0.1;
    this.camDist = 9;
    this.pivotY = 0;
    this.zoomed = false;
    this.shake = 0;
    this.slowmo = 0;
    this.stateT = 0;
    this.round = 1;
    this.score = [0, 0];
    this.time = 0;
    this.aimPoint = new THREE.Vector3();
    this.aimOnEnemy = false;
    this.dmgAcc = { amt: 0, t: 0, pos: new THREE.Vector3(), big: false };
    this.hitSndT = 0;
    this.hurtSndT = 0;
    this.onMatchEnd = null;
  }

  get combatActive() { return this.state === 'playing'; }
  get live() { return this.state === 'countdown' || this.state === 'playing' || this.state === 'roundEnd'; }
  opponentOf(r) { return r === this.player ? this.enemy : this.player; }

  clearRobots() {
    for (const r of this.robots) r.destroy();
    this.robots = [];
    this.player = this.enemy = this.ai = null;
    sfx.stopLoops();
    this.fx.clear();
  }

  startMatch(loadout, difficulty) {
    this.clearRobots();
    this.loadout = loadout;
    this.difficulty = difficulty;
    const paint = PAINTS[loadout.paint] || PAINTS[0];
    const enemyLoadout = randomLoadout();
    const enemyPaint = paint.name === 'Crimson' ? { hex: 0xff8a1f, glow: 0xff5a1a } : { hex: 0xd8303f, glow: 0xff3b3b };
    this.player = new Robot(this, loadout, { paint: paint.hex, glow: paint.glow, name: 'YOU', isPlayer: true });
    this.enemy = new Robot(this, enemyLoadout, { paint: enemyPaint.hex, glow: enemyPaint.glow, name: `AI ${BODIES[enemyLoadout.body].name.toUpperCase()}`, isPlayer: false });
    this.robots = [this.player, this.enemy];
    this.enemyDesc = `${BODIES[enemyLoadout.body].name} · ${MOBILITY[enemyLoadout.mobility].name} · ${WEAPONS[enemyLoadout.weapon].name}`;
    this.score = [0, 0];
    this.round = 1;
    this.matchTime = 0;
    this.startRound();
    this.ai = new AIController(this.enemy, this.player, this, difficulty);
    hud.setup(this);
    hud.center('ROUND 1', `vs ${DIFFICULTY[difficulty].label} AI — ${this.enemyDesc}`, 2.4, 'round');
  }

  startRound() {
    this.fx.clear();
    sfx.stopLoops();
    const [a, b] = this.arena.spawns;
    this.player.reset(a.x, a.z, a.yaw);
    this.enemy.reset(b.x, b.z, b.yaw);
    if (this.ai) this.ai.reset();
    this.arena.resetPickups();
    this.camYaw = a.yaw;
    this.camPitch = -0.02;
    this.pivotY = this.player.height;
    this.state = 'countdown';
    this.stateT = 3.9;
    this.lastCount = null;
    this.slowmo = 0;
    this.shake = 0;
    this.dmgAcc.amt = 0;
  }

  pause() {
    if (!this.live) return;
    this.prevState = this.state;
    this.state = 'paused';
    sfx.stopLoops();
    input.fire = false;
  }

  resume() {
    if (this.state === 'paused') this.state = this.prevState;
  }

  // --- player control & camera ---------------------------------------------

  controlPlayer() {
    const P = this.player, pi = P.input;
    const look = input.takeLook();
    const sens = (isTouch ? 0.0042 : 0.0022) * (this.zoomed ? 0.5 : 1);
    this.camYaw -= look.x * sens;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch - look.y * sens, -0.6, 0.7);
    if (this.state === 'playing' && P.alive) {
      const ax = input.axis();
      const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw);
      pi.moveX = sy * ax.y - cy * ax.x;
      pi.moveZ = cy * ax.y + sy * ax.x;
      if (input.consume('Space')) pi.jump = true;
      if (input.consume('ShiftLeft', 'ShiftRight')) pi.boost = true;
      if (input.consume('KeyR')) pi.reload = true;
      pi.fire = input.fire;
    } else {
      pi.moveX = pi.moveZ = 0;
      pi.fire = false;
    }
    this.zoomed = input.zoom && P.alive && this.state !== 'over';
    pi.aimPoint.copy(this.aimPoint);
  }

  updateCamera(dt) {
    const P = this.player, cam = this.camera;
    const yaw = this.camYaw, pitch = this.camPitch, cp = Math.cos(pitch);
    const f = _f.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
    const right = _r.set(-Math.cos(yaw), 0, Math.sin(yaw));
    this.pivotY += (P.pos.y + P.height + 1.1 - this.pivotY) * lerpK(12, dt);
    const pivot = _piv.set(P.pos.x, this.pivotY, P.pos.z);
    const baseDist = 7.5 + P.radius * 2;
    this.camDist += (baseDist * (this.zoomed ? 0.5 : 1) - this.camDist) * lerpK(10, dt);
    const shoulder = (this.zoomed ? 1.2 : 1.9) + P.radius * 0.3;
    const want = _cam.copy(pivot).addScaledVector(f, -this.camDist).addScaledVector(right, shoulder);
    const dir = _d.subVectors(want, pivot);
    const len = dir.length();
    dir.divideScalar(len);
    const hit = this.arena.raycast(pivot, dir, len + 0.5);
    if (hit < len + 0.5) want.copy(pivot).addScaledVector(dir, Math.max(0.6, hit - 0.5));
    if (want.y < 0.5) want.y = 0.5;
    cam.position.copy(want);
    cam.lookAt(_c.copy(want).add(f));
    const baseFov = cam.aspect < 1 ? 88 : 70;
    const fov = this.zoomed ? baseFov * 0.6 : baseFov;
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * lerpK(12, dt);
      cam.updateProjectionMatrix();
      this.fx.setViewport(renderer.domElement.height, cam.fov);
    }

    // Aim ray from the crosshair (skip anything between the camera and the robot).
    const tStart = Math.max(0, _c.subVectors(pivot, want).dot(f));
    const o = _o.copy(want).addScaledVector(f, tStart);
    let t = this.arena.raycast(o, f, 250);
    this.aimOnEnemy = false;
    const E = this.enemy;
    const te = rayCylinder(o, f, E.pos.x, E.pos.z, E.radius, E.pos.y + 0.1, E.pos.y + E.height, Math.min(t, 250));
    if (te >= 0 && te < t) { t = te; this.aimOnEnemy = E.alive; }
    if (t === Infinity) t = 250;
    this.aimPoint.copy(o).addScaledVector(f, t);

    if (this.shake > 0.01) {
      cam.position.x += (Math.random() - 0.5) * this.shake;
      cam.position.y += (Math.random() - 0.5) * this.shake;
      cam.position.z += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-dt * 7);
    }
  }

  // --- world callbacks (called by robots / fx) -------------------------------

  volFor(r) {
    if (r.isPlayer) return 1;
    const d = Math.hypot(r.pos.x - this.player.pos.x, r.pos.z - this.player.pos.z);
    return Math.max(0.12, 1 - d / 110);
  }

  fireProjectile(r) {
    const wp = r.weapon, rig = r.rig;
    r.muzzleIdx = (r.muzzleIdx + 1) % rig.muzzles.length;
    const muzzle = rig.muzzles[r.muzzleIdx].getWorldPosition(_a);
    const dir = _b.subVectors(r.input.aimPoint, muzzle).normalize();
    const fwd = r.aimForward(_c);
    if (dir.dot(fwd) < 0.6) dir.copy(fwd);
    dir.x += (Math.random() - 0.5) * 2 * wp.spread;
    dir.y += (Math.random() - 0.5) * 2 * wp.spread;
    dir.z += (Math.random() - 0.5) * 2 * wp.spread;
    dir.normalize();
    let target = null;
    if (wp.kind === 'rocket') {
      const o = this.opponentOf(r);
      if (o.alive && o.center(_d).sub(muzzle).normalize().dot(dir) > Math.cos(0.3)) target = o;
    }
    this.fx.spawnProjectile(wp.kind, muzzle, dir, wp.speed, {
      owner: r, damage: wp.damage, splash: wp.splash, homing: wp.homing, target, color: wp.color, life: wp.range / wp.speed,
    });
    this.fx.muzzleFlash(muzzle, dir, wp.color, wp.kind);
    sfx.play(wp.kind, this.volFor(r) * (r.isPlayer ? 0.8 : 1));
    if (r.isPlayer && wp.kind === 'shell') this.shake += 0.25;
  }

  fireBeam(r, dt) {
    const wp = r.weapon, rig = r.rig, o = this.opponentOf(r);
    const fwd = r.aimForward(_c);
    let anyHit = false;
    rig.muzzles.forEach((m, i) => {
      const start = m.getWorldPosition(_a);
      const dir = _b.subVectors(r.input.aimPoint, start).normalize();
      if (dir.dot(fwd) < 0.6) dir.copy(fwd);
      let t = Math.min(this.arena.raycast(start, dir, wp.range), wp.range);
      let hitBot = null;
      if (o.alive) {
        const tc = rayCylinder(start, dir, o.pos.x, o.pos.z, o.radius, o.pos.y + 0.1, o.pos.y + o.height, t);
        if (tc >= 0 && tc < t) { t = tc; hitBot = o; }
      }
      const end = _d.copy(start).addScaledVector(dir, t);
      this.fx.setBeam(`${r.id}${i}`, start, end, wp.color);
      if (hitBot) { anyHit = true; this.applyDamage(hitBot, (wp.dps * dt) / rig.muzzles.length, r, end); }
    });
    r.stats.shots += dt * 10;
    if (anyHit) r.stats.hits += dt * 10;
  }

  onProjectileHit(p, point, robot) {
    const owner = p.owner;
    if (robot) {
      this.applyDamage(robot, p.damage, owner, point);
      owner.stats.hits++;
    }
    if (p.splash > 0) {
      for (const r of this.robots) {
        if (r === owner || r === robot || !r.alive) continue;
        const d = Math.max(0, r.center(_d).distanceTo(point) - r.radius);
        if (d < p.splash) {
          this.applyDamage(r, p.damage * 0.5 * (1 - d / p.splash), owner, point);
          if (!robot) owner.stats.hits += 0.5;
        }
      }
      const big = p.kind === 'shell';
      this.fx.explosion(point, big ? 1.1 : 0.7, p.color);
      const dPlayer = point.distanceTo(this.player.pos);
      sfx.play('explosion', (big ? 0.9 : 0.55) * Math.max(0.15, 1 - dPlayer / 100));
      if (dPlayer < 14) this.shake += (big ? 0.6 : 0.3) * (1 - dPlayer / 14);
    } else {
      this.fx.sparks(point, robot ? 10 : 5, robot ? 0xffe0a0 : p.color, robot ? 12 : 8);
      if (!robot && owner.isPlayer && Math.random() < 0.3) sfx.play('impact', 0.5);
    }
  }

  applyDamage(target, amount, source, point) {
    if (!target.alive || this.state !== 'playing') return;
    const dmg = amount * (1 - target.armor);
    target.hp -= dmg;
    target.flashT = 0.1;
    source.stats.dmg += dmg;
    if (source.isPlayer) {
      const acc = this.dmgAcc;
      acc.amt += dmg;
      acc.pos.copy(point);
      hud.hitMarker(false);
      if (this.hitSndT <= 0) { sfx.play('hit'); this.hitSndT = 0.06; }
    } else {
      hud.hurt(dmg);
      this.shake += Math.min(0.5, dmg / 150);
      if (this.hurtSndT <= 0) { sfx.play('hurt'); this.hurtSndT = 0.15; }
    }
    if (target.hp <= 0) {
      target.hp = 0;
      this.killRobot(target, source);
    }
  }

  killRobot(r, killer) {
    r.alive = false;
    r.input.fire = false;
    r.wreck();
    sfx.loop(r.id, false);
    const c = r.center(_a).clone();
    this.fx.explosion(c, 2.4, 0xff7a2e);
    this.booms = [0.25, 0.5, 0.8].map((t) => ({ t, pos: c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3)) }));
    sfx.play('bigboom');
    this.shake += 1.2;
    if (killer.isPlayer) {
      hud.hitMarker(true);
      this.flushDamageNumbers(true);
    }
    this.score[killer.isPlayer ? 0 : 1]++;
    this.state = 'roundEnd';
    this.slowmo = 1.4;
    this.stateT = 4;
    this.roundWinner = killer;
    const matchOver = this.score[0] >= 2 || this.score[1] >= 2;
    if (killer.isPlayer) hud.center(matchOver ? 'VICTORY' : 'ROUND WON', 'Enemy robot destroyed', 3.6, 'win');
    else hud.center(matchOver ? 'DEFEAT' : 'ROUND LOST', 'Your robot was destroyed', 3.6, 'lose');
  }

  onBoost(r) { sfx.play('boost', this.volFor(r) * 0.8); const p = r.pos; for (let i = 0; i < 10; i++) this.fx.smoke.emit(p.x, p.y + 0.4, p.z, (Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4, 0.7, 1, 3, 0.3, 0.32, 0.36, 0, 2, 0.5); }
  onJump(r) { sfx.play('jump', this.volFor(r)); }
  onLand(r) { sfx.play('land', this.volFor(r)); if (r.isPlayer) this.shake += 0.2; }
  onReload(r) { if (r.isPlayer) sfx.play('reload'); }
  onReloaded(r) { if (r.isPlayer) sfx.play('reloaded'); }
  onOverheat(r) { sfx.play('overheat', this.volFor(r)); }

  separateRobots() {
    const a = this.player, b = this.enemy;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz), min = a.radius + b.radius;
    if (d >= min || d < 1e-4) return;
    if (Math.abs(a.pos.y - b.pos.y) > Math.max(a.height, b.height) * 0.8) return;
    const push = (min - d) / 2, nx = dx / d, nz = dz / d;
    a.pos.x -= nx * push; a.pos.z -= nz * push;
    b.pos.x += nx * push; b.pos.z += nz * push;
    this.arena.resolveCircle(a.pos, a.radius, a.pos.y, 0.55);
    this.arena.resolveCircle(b.pos, b.radius, b.pos.y, 0.55);
  }

  checkPickups() {
    for (const p of this.arena.pickups) {
      if (!p.active) continue;
      for (const r of this.robots) {
        if (!r.alive || r.hp >= r.maxHp) continue;
        if (Math.hypot(r.pos.x - p.pos.x, r.pos.z - p.pos.z) > r.radius + 1.4 || r.pos.y > 2) continue;
        const heal = Math.min(r.maxHp - r.hp, r.maxHp * 0.35);
        r.hp += heal;
        p.active = false;
        p.t = 20;
        p.cross.visible = false;
        this.fx.heal(_a.set(p.pos.x, 0.3, p.pos.z));
        sfx.play('pickup', this.volFor(r));
        if (r.isPlayer) hud.toast(`+${Math.round(heal)} HP REPAIRED`);
        break;
      }
    }
  }

  flushDamageNumbers(force = false) {
    const acc = this.dmgAcc;
    if (acc.amt <= 0 || (!force && this.time - acc.t < 0.15)) return;
    _a.copy(acc.pos).project(this.camera);
    if (_a.z < 1) hud.number(((_a.x + 1) / 2) * innerWidth, ((1 - _a.y) / 2) * innerHeight, acc.amt, acc.amt >= 50);
    acc.amt = 0;
    acc.t = this.time;
  }

  // --- main update ------------------------------------------------------------

  update(rdt) {
    this.time += rdt;
    if (this.state === 'idle' || this.state === 'paused') return;
    let dt = rdt;
    if (this.slowmo > 0) { this.slowmo -= rdt; dt = rdt * 0.3; }
    this.hitSndT -= rdt;
    this.hurtSndT -= rdt;

    if (this.state === 'countdown') {
      this.stateT -= rdt;
      const n = Math.ceil(this.stateT);
      if (this.stateT < 3 && n > 0 && n !== this.lastCount) {
        this.lastCount = n;
        hud.center(String(n), this.round === 1 ? '' : `ROUND ${this.round}`, 0.9, 'count');
        sfx.play('beep');
      }
      if (this.stateT <= 0) {
        this.state = 'playing';
        hud.center('FIGHT!', '', 0.9, 'fight');
        sfx.play('go');
      }
    }
    if (this.state === 'playing') this.matchTime += dt;

    if (this.state === 'over') this.camYaw += rdt * 0.12;
    this.controlPlayer();
    if (this.ai) this.ai.update(dt);
    for (const r of this.robots) r.update(dt);
    this.separateRobots();
    if (this.state === 'playing') this.checkPickups();
    this.arena.update(dt, this.time);

    if (this.booms) {
      for (const b of this.booms) {
        if (b.t <= 0) continue;
        b.t -= dt;
        if (b.t <= 0) { this.fx.explosion(b.pos, 1.2); sfx.play('explosion', 0.6); this.shake += 0.3; }
      }
    }
    for (const r of this.robots) {
      if (!r.alive && Math.random() < dt * 14) {
        const c = r.center(_a);
        this.fx.smoke.emit(c.x + (Math.random() - 0.5), c.y, c.z + (Math.random() - 0.5), (Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5), 2.2, 1.2, 4.5, 0.08, 0.08, 0.09, -0.3, 0.5, 0.55);
        if (Math.random() < 0.4) this.fx.glow.emit(c.x, c.y, c.z, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, 0.4, 1.2, 0.2, 4, 1.4, 0.3);
      }
      sfx.loop(r.id, r.beamOn && this.state === 'playing', this.volFor(r));
    }

    this.fx.update(dt, this);
    this.updateCamera(rdt);
    this.flushDamageNumbers();
    hud.update(this, rdt);

    if (this.state === 'roundEnd') {
      this.stateT -= rdt;
      if (this.stateT <= 0) {
        if (this.score[0] >= 2 || this.score[1] >= 2) {
          this.state = 'over';
          sfx.stopLoops();
          sfx.play(this.score[0] > this.score[1] ? 'win' : 'lose');
          if (this.onMatchEnd) this.onMatchEnd(this);
        } else {
          this.round++;
          this.startRound();
        }
      }
    }
  }
}

const game = new Game();
window.game = game;
window.garage = garage;
window.__input = input;

// ---------------------------------------------------------------------------
// Screens & flow
// ---------------------------------------------------------------------------
let mode = 'garage';
const touchUI = $('touch');

function enterGame(loadout, difficulty) {
  sfx.init();
  sfx.play('click');
  garage.show(false);
  $('result').classList.remove('show');
  $('pause').classList.remove('show');
  game.startMatch(loadout, difficulty);
  game.lastLoadout = loadout;
  mode = 'game';
  hud.show(true);
  input.enabled = true;
  touchUI.classList.toggle('show', isTouch);
  input.lock();
  resize();
}

function toGarage() {
  $('result').classList.remove('show');
  $('pause').classList.remove('show');
  hud.show(false);
  touchUI.classList.remove('show');
  input.enabled = false;
  input.unlock();
  game.clearRobots();
  game.state = 'idle';
  mode = 'garage';
  garage.show(true);
  resize();
}

function showPause() {
  if (mode !== 'game' || !game.live) return;
  game.pause();
  $('pause').classList.add('show');
  touchUI.classList.remove('show');
}

function hidePause() {
  $('pause').classList.remove('show');
  touchUI.classList.toggle('show', isTouch);
  game.resume();
  input.lock();
}

garage.onDeploy = enterGame;
input.onLockChange = (locked) => {
  if (!locked && mode === 'game' && game.live) showPause();
  if (locked && game.state === 'paused') hidePause();
};

game.onMatchEnd = (g) => {
  const won = g.score[0] > g.score[1];
  const P = g.player, E = g.enemy;
  const acc = P.stats.shots > 0 ? Math.min(100, Math.round((P.stats.hits / P.stats.shots) * 100)) : 0;
  $('result-title').textContent = won ? 'VICTORY' : 'DEFEAT';
  $('result').classList.toggle('won', won);
  $('result-sub').textContent = `${g.score[0]} – ${g.score[1]} vs ${DIFFICULTY[g.difficulty].label} AI`;
  $('result-stats').innerHTML = [
    ['Damage dealt', Math.round(P.stats.dmg)],
    ['Damage taken', Math.round(E.stats.dmg)],
    ['Accuracy', `${acc}%`],
    ['Match time', `${Math.floor(g.matchTime / 60)}:${String(Math.floor(g.matchTime % 60)).padStart(2, '0')}`],
    ['Enemy build', g.enemyDesc],
  ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  $('result').classList.add('show');
  touchUI.classList.remove('show');
  input.enabled = false;
  input.unlock();
};

$('btn-rematch').addEventListener('click', () => enterGame(game.lastLoadout, game.difficulty));
$('btn-garage').addEventListener('click', toGarage);
$('btn-resume').addEventListener('click', hidePause);
$('btn-quit').addEventListener('click', toGarage);
$('btn-pause').addEventListener('click', showPause);

// ---------------------------------------------------------------------------
// Resize + loop
// ---------------------------------------------------------------------------
let lastW = 0, lastH = 0;
function resize() {
  const w = innerWidth, h = innerHeight;
  if (!w || !h) return;
  lastW = w;
  lastH = h;
  renderer.setSize(w, h);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  game.camera.aspect = w / h;
  game.camera.updateProjectionMatrix();
  game.fx.setViewport(renderer.domElement.height, game.camera.fov);
  garage.resize(w, h);
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  tick(Math.min(0.05, clock.getDelta()));
}

function tick(dt) {
  if (innerWidth !== lastW || innerHeight !== lastH) resize();

  if (input.consume('KeyM')) { sfx.setMuted(!sfx.muted); hud.toast(sfx.muted ? 'SOUND OFF' : 'SOUND ON'); }
  if (mode === 'game' && input.consume('KeyP')) { if (game.state === 'paused') hidePause(); else showPause(); }

  if (mode === 'garage') {
    garage.update(dt);
    renderPass.scene = garage.scene;
    renderPass.camera = garage.camera;
  } else {
    game.update(dt);
    renderPass.scene = game.scene;
    renderPass.camera = game.camera;
  }
  composer.render(dt);
  input.endFrame();
}

// Debug helper: advance the simulation manually (e.g. when the tab is hidden).
window.__tick = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) tick(dt); };

garage.show(true);
resize();
$('loading').classList.remove('show');
window.__booted = true;
frame();
